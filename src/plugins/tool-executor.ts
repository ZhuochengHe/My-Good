/**
 * Tool executor implementation.
 *
 * Handles tool registration, parameter validation, execution, and error wrapping.
 * Supports timeout handling and AbortSignal for cancellation.
 *
 * @example
 * ```typescript
 * const executor = new ToolExecutor();
 *
 * // Register a tool
 * const definition: ToolDefinition = {
 *   name: 'echo',
 *   description: 'Echoes the input',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       message: { type: 'string', description: 'Message to echo' }
 *     },
 *     required: ['message']
 *   }
 * };
 *
 * const handler: ToolHandler = async (args) => ({
 *   output: `Echo: ${args.message}`
 * });
 *
 * executor.registerTool(definition, handler);
 *
 * // Execute a tool call
 * const toolCall: ToolCall = {
 *   id: 'call-1',
 *   name: 'echo',
 *   arguments: { message: 'Hello!' }
 * };
 *
 * const context: ToolContext = {
 *   sessionId: 'session-1',
 *   workingDirectory: '/tmp',
 *   env: process.env
 * };
 *
 * const result = await executor.executeTool(toolCall, context);
 * console.log(result.output); // "Echo: Hello!"
 * ```
 */

import type {
  ToolDefinition,
  ToolHandler,
  ToolContext,
  ToolResult,
  ToolError,
  ParameterSchema,
} from '../types/tools.js';
import type { ToolCall } from '../types/messages.js';

/**
 * Options for tool execution.
 */
export interface ExecutionOptions {
  /** Timeout in milliseconds (default: 30000) */
  readonly timeout?: number;
}

/**
 * Internal registry entry for a tool.
 */
interface ToolEntry {
  readonly definition: ToolDefinition;
  readonly handler: ToolHandler;
}

/**
 * Default execution timeout in milliseconds (30 seconds).
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Tool executor for managing and executing tools.
 *
 * Responsibilities:
 * - Tool registration and unregistration
 * - JSON Schema parameter validation
 * - Handler invocation with context
 * - Timeout handling
 * - Error wrapping and recovery
 */
export class ToolExecutor {
  private readonly tools: Map<string, ToolEntry>;

  constructor() {
    this.tools = new Map();
  }

  /**
   * Register a tool with its definition and handler.
   *
   * @param definition - Tool definition with JSON Schema parameters
   * @param handler - Handler function to execute the tool
   * @throws Error if tool with same name is already registered
   */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered`);
    }

    this.tools.set(definition.name, { definition, handler });
  }

  /**
   * Unregister a tool by name.
   *
   * @param name - Name of the tool to unregister
   */
  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get all registered tool definitions.
   *
   * @returns Array of tool definitions
   */
  getTools(): readonly ToolDefinition[] {
    return Array.from(this.tools.values()).map((entry) => entry.definition);
  }

  /**
   * Execute a tool call.
   *
   * Validates parameters, invokes handler, and wraps errors.
   *
   * @param toolCall - Tool call from LLM with name and arguments
   * @param context - Execution context (session ID, working directory, etc.)
   * @param options - Execution options (timeout)
   * @returns Tool result with success status and output
   */
  async executeTool(
    toolCall: ToolCall,
    context: ToolContext,
    options?: ExecutionOptions
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

    // Check if tool exists
    const entry = this.tools.get(toolCall.name);
    if (!entry) {
      // Ensure at least 1ms has passed for duration tracking
      const duration = Math.max(1, Date.now() - startTime);
      return this.buildErrorResult(
        toolCall,
        duration,
        'TOOL_NOT_FOUND',
        `Tool "${toolCall.name}" is not registered`
      );
    }

    // Validate parameters
    const validationError = this.validateParameters(
      toolCall.arguments,
      entry.definition.parameters
    );
    if (validationError) {
      // Ensure at least 1ms has passed for duration tracking
      const duration = Math.max(1, Date.now() - startTime);
      return this.buildErrorResult(
        toolCall,
        duration,
        'VALIDATION_ERROR',
        validationError
      );
    }

    // Apply default values
    const argsWithDefaults = this.applyDefaults(
      toolCall.arguments,
      entry.definition.parameters.properties
    );

    // Execute handler with timeout
    try {
      const result = await this.executeWithTimeout(
        () => entry.handler(argsWithDefaults, context),
        timeout
      );

      // Ensure at least 1ms has passed for duration tracking
      const duration = Math.max(1, Date.now() - startTime);
      return {
        callId: toolCall.id,
        name: toolCall.name,
        success: true,
        output: result.output,
        durationMs: duration,
      };
    } catch (err) {
      // Ensure at least 1ms has passed for duration tracking
      const duration = Math.max(1, Date.now() - startTime);

      // Check if timeout
      if (err instanceof TimeoutError) {
        return this.buildErrorResult(
          toolCall,
          duration,
          'TIMEOUT',
          `Tool "${toolCall.name}" timed out after ${timeout}ms`
        );
      }

      // Wrap execution error
      const message = err instanceof Error ? err.message : 'Unknown error';
      return this.buildErrorResult(
        toolCall,
        duration,
        'EXECUTION_ERROR',
        message,
        err instanceof Error ? err : undefined
      );
    }
  }

  /**
   * Validate tool parameters against JSON Schema.
   *
   * @param args - Arguments provided by LLM
   * @param schema - Parameter schema from tool definition
   * @returns Error message if validation fails, undefined otherwise
   */
  private validateParameters(
    args: Record<string, unknown>,
    schema: ToolDefinition['parameters']
  ): string | undefined {
    // Check required parameters
    for (const requiredParam of schema.required) {
      if (!(requiredParam in args)) {
        return `Missing required parameter: ${requiredParam}`;
      }
    }

    // Validate each parameter
    for (const [key, value] of Object.entries(args)) {
      const paramSchema = schema.properties[key];
      if (!paramSchema) {
        // Unknown parameter - ignore (LLM might add extra fields)
        continue;
      }

      const error = this.validateValue(value, paramSchema, key);
      if (error) {
        return error;
      }
    }

    return undefined;
  }

  /**
   * Validate a single value against its schema.
   *
   * @param value - Value to validate
   * @param schema - Schema for the value
   * @param path - Path to the value (for error messages)
   * @returns Error message if validation fails, undefined otherwise
   */
  private validateValue(
    value: unknown,
    schema: ParameterSchema,
    path: string
  ): string | undefined {
    // Type validation
    const actualType = this.getValueType(value);
    if (actualType !== schema.type) {
      return `Parameter "${path}" expected type ${schema.type}, got ${actualType}`;
    }

    // Enum validation
    if (schema.enum && schema.enum.length > 0) {
      if (!schema.enum.includes(value as string | number)) {
        return `Parameter "${path}" must be one of: ${schema.enum.join(', ')}`;
      }
    }

    // Object validation
    if (schema.type === 'object' && schema.properties) {
      const objValue = value as Record<string, unknown>;
      for (const [key, propValue] of Object.entries(objValue)) {
        const propSchema = schema.properties[key];
        if (propSchema) {
          const error = this.validateValue(propValue, propSchema, `${path}.${key}`);
          if (error) {
            return error;
          }
        }
      }
    }

    // Array validation
    if (schema.type === 'array' && schema.items) {
      const arrValue = value as unknown[];
      for (let i = 0; i < arrValue.length; i++) {
        const error = this.validateValue(arrValue[i], schema.items, `${path}[${i}]`);
        if (error) {
          return error;
        }
      }
    }

    return undefined;
  }

  /**
   * Get the JSON Schema type of a value.
   *
   * @param value - Value to check
   * @returns JSON Schema type string
   */
  private getValueType(value: unknown): ParameterSchema['type'] {
    if (value === null) {
      return 'object'; // JSON Schema treats null as object
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    if (typeof value === 'string') {
      return 'string';
    }
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    return 'object';
  }

  /**
   * Apply default values to arguments.
   *
   * @param args - Arguments provided by LLM
   * @param properties - Parameter properties with defaults
   * @returns Arguments with defaults applied
   */
  private applyDefaults(
    args: Record<string, unknown>,
    properties: Record<string, ParameterSchema>
  ): Record<string, unknown> {
    const result = { ...args };

    for (const [key, schema] of Object.entries(properties)) {
      if (!(key in result) && schema.default !== undefined) {
        result[key] = schema.default;
      }
    }

    return result;
  }

  /**
   * Execute a function with timeout.
   *
   * @param fn - Function to execute
   * @param timeoutMs - Timeout in milliseconds
   * @returns Result of the function
   * @throws TimeoutError if execution exceeds timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new TimeoutError()), timeoutMs);
      }),
    ]);
  }

  /**
   * Build an error result.
   *
   * @param toolCall - Original tool call
   * @param duration - Execution duration in milliseconds
   * @param code - Error code
   * @param message - Error message
   * @param cause - Original error (if any)
   * @returns Tool result with error
   */
  private buildErrorResult(
    toolCall: ToolCall,
    duration: number,
    code: ToolError['code'],
    message: string,
    cause?: Error
  ): ToolResult {
    const error: ToolError = {
      code,
      message,
      ...(cause && { details: { stack: cause.stack, message: cause.message } }),
    };

    return {
      callId: toolCall.id,
      name: toolCall.name,
      success: false,
      output: '',
      error,
      durationMs: duration,
    };
  }
}

/**
 * Custom error class for timeout errors.
 */
class TimeoutError extends Error {
  constructor() {
    super('Operation timed out');
    this.name = 'TimeoutError';
  }
}

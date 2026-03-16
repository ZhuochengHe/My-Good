/**
 * Tool call bridge.
 *
 * Bridges ExecutionLoop's ToolCallContext to ToolExecutor's ToolContext
 * by adding the required env field.
 */

import type { ToolCall } from '../types/messages.js';
import type { ToolResult, ToolContext } from '../types/tools.js';
import type { MemoryStore } from '../types/memory.js';

/**
 * Tool call context from ExecutionLoop.
 */
export interface ToolCallContext {
  readonly sessionId: string;
  readonly workingDirectory: string;
  readonly signal?: AbortSignal;
  /** Optional memory store forwarded to tool handler context. */
  readonly memoryStore?: MemoryStore;
}

/**
 * Function type for executing a tool with ToolContext.
 */
export type ExecuteToolFunction = (
  call: ToolCall,
  context: ToolContext
) => Promise<ToolResult>;

/**
 * Function type for the bridge callback (ToolCallContext → ToolResult).
 */
export type ToolCallBridge = (
  call: ToolCall,
  context: ToolCallContext
) => Promise<ToolResult>;

/**
 * Create a bridge function that maps ToolCallContext to ToolContext.
 *
 * Adds the env field from process.env to convert ExecutionLoop's context
 * format to ToolExecutor's expected format.
 *
 * @param executeTool - Function that executes a tool with ToolContext
 * @returns Bridge function that accepts ToolCallContext
 *
 * @example
 * ```typescript
 * const toolExecutor = new ToolExecutor();
 * const bridge = createToolCallBridge((call, context) =>
 *   toolExecutor.executeTool(call, context)
 * );
 *
 * // Use in ExecutionLoop
 * const result = await agent.run('Test', { onToolCall: bridge });
 * ```
 */
export function createToolCallBridge(
  executeTool: ExecuteToolFunction
): ToolCallBridge {
  return async (call: ToolCall, context: ToolCallContext): Promise<ToolResult> => {
    // Convert ToolCallContext to ToolContext by adding env field
    const toolContext: ToolContext = {
      sessionId: context.sessionId,
      workingDirectory: context.workingDirectory,
      env: process.env as Record<string, string>,
      ...(context.signal && { signal: context.signal }),
      ...(context.memoryStore && { memoryStore: context.memoryStore }),
    };

    // Execute tool with converted context
    return executeTool(call, toolContext);
  };
}

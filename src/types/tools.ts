/**
 * Tool type definitions for the plugin system.
 */

import type { MemoryStore } from './memory.js';
import type { PlanStore } from '../planning/plan-store.js';

/** JSON Schema subset for tool parameters */
export interface ParameterSchema {
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly description?: string;
  readonly required?: boolean;
  readonly properties?: Record<string, ParameterSchema>;
  readonly items?: ParameterSchema;
  readonly enum?: readonly (string | number)[];
  readonly default?: unknown;
}

/** Tool definition for LLM consumption */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: {
    readonly type: 'object';
    readonly properties: Record<string, ParameterSchema>;
    readonly required: readonly string[];
  };
}

/** Tool error codes */
export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'EXECUTION_ERROR'
  | 'TIMEOUT'
  | 'PERMISSION_DENIED';

/** Tool execution error */
export interface ToolError {
  readonly code: ToolErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

/** Result of tool execution */
export interface ToolResult {
  readonly callId: string;
  readonly name: string;
  readonly success: boolean;
  readonly output: string;
  readonly error?: ToolError;
  readonly durationMs: number;
}

/** Context provided to tool handlers */
export interface ToolContext {
  readonly sessionId: string;
  readonly workingDirectory: string;
  readonly env: Record<string, string>;
  readonly signal?: AbortSignal;
  /** Optional memory store for persistent agent memory access. */
  readonly memoryStore?: MemoryStore;
  /** Optional plan store for planning tool access. */
  readonly planStore?: PlanStore;
}

/** Optional output artifact (file, image, etc.) */
export interface Artifact {
  readonly type: 'file' | 'image' | 'json';
  readonly name: string;
  readonly data: string | Uint8Array;
}

/** Result from tool handler */
export interface ToolHandlerResult {
  readonly output: string;
  readonly artifacts?: readonly Artifact[];
}

/** Tool handler function signature */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolHandlerResult>;

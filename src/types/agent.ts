/**
 * Agent type definitions for the execution loop.
 */

import type { ConversationMessage } from './messages.js';
import type { ToolDefinition, ToolResult } from './tools.js';
import type { ProviderType, TokenUsage } from './providers.js';
import type { Session } from './sessions.js';
import type { AgentEvent } from './events.js';

/** Agent configuration */
export interface AgentConfig {
  readonly id: string;
  readonly name: string;
  readonly systemPrompt: string;
  readonly model: string;
  readonly provider: ProviderType;
  readonly maxTurns: number;
  readonly maxTokensPerTurn: number;
  readonly tools: {
    readonly allow: readonly string[];
    readonly deny: readonly string[];
    readonly requireApproval: readonly string[];
  };
}

/** Agent execution options */
export interface AgentRunOptions {
  readonly sessionId?: string;
  readonly stream?: boolean;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: AgentEvent) => void;
}

/** Finish reason for agent execution */
export type AgentFinishReason = 'completed' | 'max_turns' | 'error' | 'cancelled';

/** Agent error codes */
export type AgentErrorCode =
  | 'PROVIDER_ERROR'
  | 'RATE_LIMIT'
  | 'CONTEXT_OVERFLOW'
  | 'TOOL_ERROR'
  | 'VALIDATION_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'MAX_TURNS';

/** Agent error structure */
export interface AgentError {
  readonly code: AgentErrorCode;
  readonly message: string;
  readonly cause?: Error;
  readonly recoverable: boolean;
}

/** Agent execution result */
export interface AgentRunResult {
  readonly sessionId: string;
  readonly messages: readonly ConversationMessage[];
  readonly toolCalls: readonly ToolResult[];
  readonly usage: TokenUsage;
  readonly turns: number;
  readonly finishReason: AgentFinishReason;
  readonly error?: AgentError;
}

/** Agent runtime interface */
export interface Agent {
  readonly config: AgentConfig;

  /**
   * Run agent with user input.
   */
  run(input: string, options?: AgentRunOptions): Promise<AgentRunResult>;

  /**
   * Stream agent execution.
   */
  stream(input: string, options?: AgentRunOptions): AsyncIterable<AgentEvent>;

  /**
   * Get available tools.
   */
  getTools(): readonly ToolDefinition[];

  /**
   * Get current session.
   */
  getSession(sessionId: string): Promise<Session | null>;
}

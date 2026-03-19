/**
 * Agent type definitions for the execution loop.
 */

import type { ConversationMessage } from './messages.js';
import type { ToolDefinition, ToolResult } from './tools.js';
import type { ProviderType, TokenUsage } from './providers.js';
import type { Session } from './sessions.js';
import type { AgentEvent } from './events.js';

/** Agent behavior settings */
export interface AgentSettings {
  /** Response temperature (0-2) */
  readonly temperature?: number;
  /** Top P sampling (0-1) */
  readonly topP?: number;
  /** Maximum tokens per response */
  readonly maxTokens?: number;
  /** Response style preference */
  readonly responseStyle?: 'concise' | 'detailed' | 'balanced';
  /** Enable tool use */
  readonly enableToolUse?: boolean;
  /** Enable streaming responses */
  readonly enableStreaming?: boolean;
  /** System prompt */
  readonly systemPrompt?: string;
  /** Maximum conversation turns */
  readonly maxTurns?: number;
  /** Tool configuration */
  readonly tools?: {
    readonly allow: readonly string[];
    readonly deny: readonly string[];
    readonly requireApproval: readonly string[];
  };
}

/** Agent configuration - minimal, model-focused */
export interface AgentConfig {
  /** Agent identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Selected model ID */
  readonly model: string;
  /** Selected provider ID */
  readonly provider: ProviderType;
  /**
   * Label shown in the chat prompt for the user.
   * Defaults to "you" if not set.
   */
  readonly userLabel?: string;
  /**
   * Label shown before each agent response.
   * Defaults to "agent" if not set.
   */
  readonly agentLabel?: string;
  /**
   * Enable typewriter effect during streaming responses.
   * Characters are printed one-by-one at a fixed interval to simulate
   * real-time typing. Defaults to true when not set.
   */
  readonly typewriterEffect?: boolean;
  /**
   * Interval in milliseconds between each character when typewriterEffect
   * is enabled. Defaults to 18ms (~55 chars/s). Lower = faster typing.
   */
  readonly typewriterSpeedMs?: number;
}

/** Agent execution options */
export interface AgentRunOptions {
  readonly sessionId?: string;
  readonly stream?: boolean;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: AgentEvent) => void;
  /**
   * Prior conversation messages to prepend before the new user input.
   * Enables multi-turn memory within a session.
   */
  readonly conversationHistory?: readonly ConversationMessage[];
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

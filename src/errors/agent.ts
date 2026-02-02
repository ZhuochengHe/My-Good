/**
 * Agent error hierarchy.
 *
 * Custom error classes for different agent failure modes.
 * Each error type indicates specific recovery strategies.
 */

import type { AgentErrorCode } from '../types/agent.js';

/**
 * Base error for all agent failures.
 */
export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly recoverable: boolean;
  override readonly cause: Error | undefined;

  constructor(
    message: string,
    code: AgentErrorCode,
    recoverable = false,
    cause?: Error
  ) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.recoverable = recoverable;
    this.cause = cause;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Maximum turns exceeded.
 * Not recoverable - execution must stop.
 */
export class MaxTurnsError extends AgentError {
  readonly maxTurns: number;

  constructor(maxTurns: number) {
    super(`Maximum turns (${maxTurns}) exceeded`, 'MAX_TURNS', false);
    this.name = 'MaxTurnsError';
    this.maxTurns = maxTurns;
  }
}

/**
 * Agent execution cancelled by user.
 * Recoverable - can restart execution.
 */
export class CancelledError extends AgentError {
  constructor(message = 'Agent execution cancelled by user') {
    super(message, 'CANCELLED', true);
    this.name = 'CancelledError';
  }
}

/**
 * Tool execution failed.
 * Recoverable - can continue with error message to model.
 */
export class ToolExecutionError extends AgentError {
  readonly toolName: string;

  constructor(toolName: string, cause: Error) {
    super(
      `Tool execution failed for '${toolName}': ${cause.message}`,
      'TOOL_ERROR',
      true,
      cause
    );
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
  }
}

/**
 * Context window overflow.
 * Not recoverable - need to reduce message history.
 */
export class ContextOverflowError extends AgentError {
  readonly usedTokens: number;
  readonly maxTokens: number;

  constructor(usedTokens: number, maxTokens: number) {
    super(
      `Context overflow: used ${usedTokens} tokens, max ${maxTokens} tokens`,
      'CONTEXT_OVERFLOW',
      false
    );
    this.name = 'ContextOverflowError';
    this.usedTokens = usedTokens;
    this.maxTokens = maxTokens;
  }
}

/**
 * Type guard to check if error is an agent error.
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

/**
 * Type guard to check if error is recoverable.
 */
export function isRecoverableAgentError(error: unknown): boolean {
  return isAgentError(error) && error.recoverable;
}

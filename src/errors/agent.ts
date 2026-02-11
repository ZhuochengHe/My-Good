/**
 * Agent error hierarchy.
 *
 * Custom error classes for different agent failure modes.
 * Each error type indicates specific recovery strategies.
 */

import type { AgentErrorCode } from '../types/agent.js';
import type { UserErrorMessage } from './types.js';

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

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  toUserMessage(): UserErrorMessage {
    return {
      code: 'E400',
      message: 'Agent execution failed',
      context: `The agent encountered an error during execution: ${this.message}`,
      suggestion: 'Check the error details and try again. If the issue persists, please report it',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    return {
      code: 'E401',
      message: 'Maximum conversation turns exceeded',
      context: `The agent reached the maximum allowed turns (${this.maxTurns}) for a single conversation`,
      suggestion: 'Start a new session to continue. Long conversations consume more tokens and may hit model limits',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    return {
      code: 'E402',
      message: 'Agent execution was cancelled',
      context: `Execution was stopped: ${this.message}`,
      suggestion: 'You can resume the session or start a new one to continue',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    const causeMessage = this.cause instanceof Error ? this.cause.message : 'unknown error';
    return {
      code: 'E403',
      message: 'Tool execution failed',
      context: `The tool "${this.toolName}" encountered an error: ${causeMessage}`,
      suggestion: 'Check that the tool is configured correctly and has necessary permissions. The agent may retry with different parameters',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    return {
      code: 'E404',
      message: 'Context window size exceeded',
      context: `The conversation has used ${this.usedTokens} tokens, exceeding the maximum of ${this.maxTokens} tokens`,
      suggestion: 'Start a new session to continue. Consider using shorter messages or reducing tool output',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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

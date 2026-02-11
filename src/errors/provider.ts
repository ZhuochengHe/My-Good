/**
 * Provider error hierarchy.
 *
 * Custom error classes for different provider failure modes.
 * Each error type indicates specific retry and recovery strategies.
 */

import type { UserErrorMessage } from './types.js';

/** Error codes for provider failures */
export enum ProviderErrorCode {
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  NETWORK = 'NETWORK',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MODEL_ERROR = 'MODEL_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Base error for all provider failures.
 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly recoverable: boolean;
  override readonly cause: Error | undefined;

  constructor(
    message: string,
    code: ProviderErrorCode,
    recoverable = false,
    cause?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
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
      code: 'E100',
      message: 'Provider API error',
      context: `An error occurred while communicating with the AI provider: ${this.message}`,
      suggestion: 'Check your internet connection and API configuration. If the issue persists, the provider may be experiencing problems',
      technicalDetails: `${this.name}: ${this.message}`,
    };
  }
}

/**
 * Authentication failure (invalid API key).
 * Not recoverable - requires configuration fix.
 */
export class AuthenticationError extends ProviderError {
  constructor(message: string, cause?: Error) {
    super(message, ProviderErrorCode.AUTHENTICATION, false, cause);
    this.name = 'AuthenticationError';
  }

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    return {
      code: 'E101',
      message: 'Authentication failed',
      context: `Failed to authenticate with the AI provider: ${this.message}`,
      suggestion: 'Check that your API key is set correctly in the configuration. Run "my-agent config set" to update your API credentials',
      technicalDetails: `${this.name}: ${this.message}`,
    };
  }
}

/**
 * Rate limit exceeded.
 * Recoverable with backoff, may include retry-after header.
 */
export class RateLimitError extends ProviderError {
  readonly retryAfter: number | undefined;

  constructor(message: string, retryAfter?: number, cause?: Error) {
    super(message, ProviderErrorCode.RATE_LIMIT, true, cause);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    const retryInfo = this.retryAfter
      ? ` Wait ${this.retryAfter} seconds before retrying.`
      : '';
    return {
      code: 'E102',
      message: 'Rate limit exceeded',
      context: `The AI provider's rate limit has been exceeded: ${this.message}`,
      suggestion: `You have made too many requests. The agent will automatically retry with exponential backoff.${retryInfo}`,
      technicalDetails: `${this.name}: ${this.message}`,
    };
  }
}

/**
 * Request timeout.
 * Recoverable with retry.
 */
export class TimeoutError extends ProviderError {
  constructor(message: string, cause?: Error) {
    super(message, ProviderErrorCode.TIMEOUT, true, cause);
    this.name = 'TimeoutError';
  }

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    return {
      code: 'E103',
      message: 'Request timed out',
      context: `The request to the AI provider timed out: ${this.message}`,
      suggestion: 'The provider may be slow or experiencing issues. The agent will automatically retry the request',
      technicalDetails: `${this.name}: ${this.message}`,
    };
  }
}

/**
 * Network connectivity failure.
 * Recoverable with retry.
 */
export class NetworkError extends ProviderError {
  constructor(message: string, cause?: Error) {
    super(message, ProviderErrorCode.NETWORK, true, cause);
    this.name = 'NetworkError';
  }

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    return {
      code: 'E104',
      message: 'Network connection failed',
      context: `Failed to connect to the AI provider: ${this.message}`,
      suggestion: 'Check your network connection and firewall settings. The agent will automatically retry the request',
      technicalDetails: `${this.name}: ${this.message}`,
    };
  }
}

/**
 * Invalid request (malformed input, invalid model, etc.).
 * Not recoverable - requires code fix.
 */
export class InvalidRequestError extends ProviderError {
  constructor(message: string, cause?: Error) {
    super(message, ProviderErrorCode.INVALID_REQUEST, false, cause);
    this.name = 'InvalidRequestError';
  }

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    return {
      code: 'E105',
      message: 'Invalid API request',
      context: `The request to the AI provider was invalid: ${this.message}`,
      suggestion: 'This may be a configuration issue. Check that the model name and parameters are correct in your config',
      technicalDetails: `${this.name}: ${this.message}`,
    };
  }
}

/**
 * Model-side error (overloaded, internal error).
 * Recoverable with retry.
 */
export class ModelError extends ProviderError {
  constructor(message: string, cause?: Error) {
    super(message, ProviderErrorCode.MODEL_ERROR, true, cause);
    this.name = 'ModelError';
  }

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    return {
      code: 'E106',
      message: 'Model service error',
      context: `The AI model encountered an error: ${this.message}`,
      suggestion: 'The AI provider may be experiencing issues or the model may be overloaded. The agent will automatically retry the request',
      technicalDetails: `${this.name}: ${this.message}`,
    };
  }
}

/**
 * Type guard to check if error is a provider error.
 */
export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

/**
 * Type guard to check if error is recoverable.
 */
export function isRecoverableError(error: unknown): boolean {
  return isProviderError(error) && error.recoverable;
}

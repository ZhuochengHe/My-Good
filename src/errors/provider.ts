/**
 * Provider error hierarchy.
 *
 * Custom error classes for different provider failure modes.
 * Each error type indicates specific retry and recovery strategies.
 */

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

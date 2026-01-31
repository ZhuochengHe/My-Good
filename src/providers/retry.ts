/**
 * Retry logic with exponential backoff.
 *
 * Provides configurable retry mechanism for provider operations.
 * Uses exponential backoff with jitter to prevent thundering herd.
 */

import { isRecoverableError, RateLimitError } from '../errors/provider.js';

/** Retry configuration options */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  readonly maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  readonly initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 60000) */
  readonly maxDelayMs?: number;
  /** AbortSignal to cancel retries */
  readonly signal?: AbortSignal;
  /** Custom delay function for testing (default: setTimeout-based) */
  readonly delayFn?: (ms: number) => Promise<void>;
}

/** Default retry options */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'signal'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  delayFn: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Wraps an async function with retry logic.
 *
 * Retries recoverable errors using exponential backoff with jitter.
 * Respects rate limit retry-after headers.
 * Non-recoverable errors fail immediately without retry.
 *
 * @param fn Function to execute with retry
 * @param options Retry configuration
 * @param args Arguments to pass to function
 * @returns Result of successful function execution
 * @throws Last error if all retries exhausted
 */
export async function withRetry<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {},
  ...args: TArgs
): Promise<TResult> {
  const {
    maxRetries,
    initialDelayMs,
    maxDelayMs,
    delayFn,
  } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const { signal } = options;

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error('aborted');
  }

  const effectiveMaxRetries = Math.max(0, maxRetries);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
    try {
      return await fn(...args);
    } catch (error) {
      lastError = error as Error;

      // Don't retry on non-recoverable errors
      if (!isRecoverableError(error)) {
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt >= effectiveMaxRetries) {
        throw error;
      }

      // Check if aborted before retrying
      if (signal?.aborted) {
        throw new Error('aborted');
      }

      // Calculate delay with exponential backoff and jitter
      const delay = calculateDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        error as Error
      );

      await delayFn(delay);

      // Check again after delay
      if (signal?.aborted) {
        throw new Error('aborted');
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error('Retry failed with no error');
}

/**
 * Calculates retry delay using exponential backoff with jitter.
 *
 * Formula: delay = min(initialDelay * 2^attempt, maxDelay) * jitter
 * Jitter: random value between 0.5 and 1.5
 *
 * Special case: RateLimitError with retryAfter uses that value directly.
 *
 * @param attempt Current attempt number (0-indexed)
 * @param initialDelayMs Initial delay in milliseconds
 * @param maxDelayMs Maximum delay cap
 * @param error The error that triggered retry
 * @returns Delay in milliseconds
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  error: Error
): number {
  // Use retryAfter from rate limit errors
  if (error instanceof RateLimitError && error.retryAfter) {
    return error.retryAfter;
  }

  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter: random factor between 0.5 and 1.5
  const jitter = 0.5 + Math.random(); // Random in [0.5, 1.5)
  const delayWithJitter = cappedDelay * jitter;

  return Math.floor(delayWithJitter);
}

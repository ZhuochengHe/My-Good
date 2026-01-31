/**
 * Tests for provider error hierarchy.
 */

import { describe, it, expect } from 'vitest';
import {
  ProviderError,
  ProviderErrorCode,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  InvalidRequestError,
  ModelError,
  isProviderError,
  isRecoverableError,
} from '../../src/errors/provider.js';

describe('ProviderError', () => {
  it('creates error with all properties', () => {
    const cause = new Error('underlying error');
    const error = new ProviderError(
      'test error',
      ProviderErrorCode.UNKNOWN,
      true,
      cause
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('test error');
    expect(error.name).toBe('ProviderError');
    expect(error.code).toBe(ProviderErrorCode.UNKNOWN);
    expect(error.recoverable).toBe(true);
    expect(error.cause).toBe(cause);
  });

  it('creates non-recoverable error by default', () => {
    const error = new ProviderError('test', ProviderErrorCode.UNKNOWN);
    expect(error.recoverable).toBe(false);
  });

  it('maintains stack trace', () => {
    const error = new ProviderError('test', ProviderErrorCode.UNKNOWN);
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ProviderError');
  });
});

describe('AuthenticationError', () => {
  it('creates non-recoverable authentication error', () => {
    const error = new AuthenticationError('Invalid API key');

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.name).toBe('AuthenticationError');
    expect(error.code).toBe(ProviderErrorCode.AUTHENTICATION);
    expect(error.recoverable).toBe(false);
    expect(error.message).toBe('Invalid API key');
  });

  it('wraps underlying cause', () => {
    const cause = new Error('401 Unauthorized');
    const error = new AuthenticationError('Invalid API key', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('RateLimitError', () => {
  it('creates recoverable rate limit error', () => {
    const error = new RateLimitError('Rate limit exceeded');

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.name).toBe('RateLimitError');
    expect(error.code).toBe(ProviderErrorCode.RATE_LIMIT);
    expect(error.recoverable).toBe(true);
  });

  it('includes retry-after header', () => {
    const error = new RateLimitError('Rate limit exceeded', 60);

    expect(error.retryAfter).toBe(60);
  });

  it('has undefined retry-after when not provided', () => {
    const error = new RateLimitError('Rate limit exceeded');

    expect(error.retryAfter).toBeUndefined();
  });
});

describe('TimeoutError', () => {
  it('creates recoverable timeout error', () => {
    const error = new TimeoutError('Request timed out');

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe(ProviderErrorCode.TIMEOUT);
    expect(error.recoverable).toBe(true);
  });
});

describe('NetworkError', () => {
  it('creates recoverable network error', () => {
    const error = new NetworkError('Connection failed');

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.name).toBe('NetworkError');
    expect(error.code).toBe(ProviderErrorCode.NETWORK);
    expect(error.recoverable).toBe(true);
  });
});

describe('InvalidRequestError', () => {
  it('creates non-recoverable invalid request error', () => {
    const error = new InvalidRequestError('Invalid model specified');

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.name).toBe('InvalidRequestError');
    expect(error.code).toBe(ProviderErrorCode.INVALID_REQUEST);
    expect(error.recoverable).toBe(false);
  });
});

describe('ModelError', () => {
  it('creates recoverable model error', () => {
    const error = new ModelError('Model overloaded');

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.name).toBe('ModelError');
    expect(error.code).toBe(ProviderErrorCode.MODEL_ERROR);
    expect(error.recoverable).toBe(true);
  });
});

describe('isProviderError', () => {
  it('returns true for provider errors', () => {
    const error = new ProviderError('test', ProviderErrorCode.UNKNOWN);
    expect(isProviderError(error)).toBe(true);
  });

  it('returns true for subclass errors', () => {
    expect(isProviderError(new AuthenticationError('test'))).toBe(true);
    expect(isProviderError(new RateLimitError('test'))).toBe(true);
    expect(isProviderError(new TimeoutError('test'))).toBe(true);
  });

  it('returns false for regular errors', () => {
    expect(isProviderError(new Error('test'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isProviderError(null)).toBe(false);
    expect(isProviderError(undefined)).toBe(false);
    expect(isProviderError('error')).toBe(false);
    expect(isProviderError({})).toBe(false);
  });
});

describe('isRecoverableError', () => {
  it('returns true for recoverable errors', () => {
    expect(isRecoverableError(new RateLimitError('test'))).toBe(true);
    expect(isRecoverableError(new TimeoutError('test'))).toBe(true);
    expect(isRecoverableError(new NetworkError('test'))).toBe(true);
    expect(isRecoverableError(new ModelError('test'))).toBe(true);
  });

  it('returns false for non-recoverable errors', () => {
    expect(isRecoverableError(new AuthenticationError('test'))).toBe(false);
    expect(isRecoverableError(new InvalidRequestError('test'))).toBe(false);
  });

  it('returns false for non-provider errors', () => {
    expect(isRecoverableError(new Error('test'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isRecoverableError(null)).toBe(false);
    expect(isRecoverableError(undefined)).toBe(false);
  });
});

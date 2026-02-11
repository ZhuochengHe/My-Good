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

describe('User Message Formatting', () => {
  describe('ProviderError.toUserMessage', () => {
    it('returns user-friendly message for base ProviderError', () => {
      const error = new ProviderError('Test error', ProviderErrorCode.UNKNOWN);
      const msg = error.toUserMessage();

      expect(msg.code).toBe('E100');
      expect(msg.message).toBe('Provider API error');
      expect(msg.context).toBeDefined();
      expect(msg.technicalDetails).toContain('Test error');
    });
  });

  describe('AuthenticationError.toUserMessage', () => {
    it('returns user-friendly message with API key suggestion', () => {
      const error = new AuthenticationError('Invalid API key');
      const msg = error.toUserMessage();

      expect(msg.code).toBe('E101');
      expect(msg.message).toBe('Authentication failed');
      expect(msg.context).toContain('Invalid API key');
      expect(msg.suggestion).toContain('API key');
      expect(msg.technicalDetails).toContain('AuthenticationError');
    });
  });

  describe('RateLimitError.toUserMessage', () => {
    it('returns user-friendly message without retry-after', () => {
      const error = new RateLimitError('Rate limit exceeded');
      const msg = error.toUserMessage();

      expect(msg.code).toBe('E102');
      expect(msg.message).toBe('Rate limit exceeded');
      expect(msg.context).toContain('Rate limit exceeded');
      expect(msg.suggestion).toContain('retry');
      expect(msg.technicalDetails).toContain('RateLimitError');
    });

    it('includes retry-after time in message', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);
      const msg = error.toUserMessage();

      expect(msg.code).toBe('E102');
      expect(msg.suggestion).toContain('60 seconds');
    });
  });

  describe('TimeoutError.toUserMessage', () => {
    it('returns user-friendly message with retry suggestion', () => {
      const error = new TimeoutError('Request timed out after 30s');
      const msg = error.toUserMessage();

      expect(msg.code).toBe('E103');
      expect(msg.message).toBe('Request timed out');
      expect(msg.context).toContain('Request timed out after 30s');
      expect(msg.suggestion).toContain('retry');
      expect(msg.technicalDetails).toContain('TimeoutError');
    });
  });

  describe('NetworkError.toUserMessage', () => {
    it('returns user-friendly message with connection suggestion', () => {
      const error = new NetworkError('Connection refused');
      const msg = error.toUserMessage();

      expect(msg.code).toBe('E104');
      expect(msg.message).toBe('Network connection failed');
      expect(msg.context).toContain('Connection refused');
      expect(msg.suggestion).toContain('network');
      expect(msg.technicalDetails).toContain('NetworkError');
    });
  });

  describe('InvalidRequestError.toUserMessage', () => {
    it('returns user-friendly message with config suggestion', () => {
      const error = new InvalidRequestError('Invalid model: gpt-5');
      const msg = error.toUserMessage();

      expect(msg.code).toBe('E105');
      expect(msg.message).toBe('Invalid API request');
      expect(msg.context).toContain('Invalid model: gpt-5');
      expect(msg.suggestion).toContain('configuration');
      expect(msg.technicalDetails).toContain('InvalidRequestError');
    });
  });

  describe('ModelError.toUserMessage', () => {
    it('returns user-friendly message with retry suggestion', () => {
      const error = new ModelError('Model is overloaded');
      const msg = error.toUserMessage();

      expect(msg.code).toBe('E106');
      expect(msg.message).toBe('Model service error');
      expect(msg.context).toContain('Model is overloaded');
      expect(msg.suggestion).toContain('retry');
      expect(msg.technicalDetails).toContain('ModelError');
    });
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

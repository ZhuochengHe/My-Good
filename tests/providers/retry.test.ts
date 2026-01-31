/**
 * Tests for retry logic with exponential backoff.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, RetryOptions } from '../../src/providers/retry.js';
import {
  RateLimitError,
  TimeoutError,
  AuthenticationError,
  InvalidRequestError,
} from '../../src/errors/provider.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful execution', () => {
    it('returns result without retry on success', async () => {
      const fn = vi.fn(async () => 'success');

      const promise = withRetry(fn);
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes through function arguments', async () => {
      const fn = vi.fn(async (a: number, b: string) => a + b);

      const result = await withRetry(fn, { maxRetries: 3 }, 42, 'test');

      expect(result).toBe('42test');
      expect(fn).toHaveBeenCalledWith(42, 'test');
    });
  });

  describe('retry on recoverable errors', () => {
    it('retries on timeout error', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new TimeoutError('timeout'))
        .mockResolvedValueOnce('success');

      const delayFn = vi.fn(async () => {});

      const result = await withRetry(fn, { maxRetries: 3, delayFn });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('retries up to maxRetries times', async () => {
      const fn = vi.fn().mockRejectedValue(new TimeoutError('timeout'));

      // Use custom delayFn that doesn't actually delay
      const delayFn = vi.fn(async () => {
        // No actual delay for test performance
      });

      await expect(
        withRetry(fn, { maxRetries: 3, delayFn })
      ).rejects.toThrow('timeout');

      // Initial call + 3 retries = 4 total
      expect(fn).toHaveBeenCalledTimes(4);
      expect(delayFn).toHaveBeenCalledTimes(3); // 3 delays between 4 attempts
    });

    it('applies exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new TimeoutError('timeout'))
        .mockRejectedValueOnce(new TimeoutError('timeout'))
        .mockResolvedValueOnce('success');

      const delayFn = vi.fn(async () => {});

      const result = await withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        delayFn,
      });

      expect(result).toBe('success');
      expect(delayFn).toHaveBeenCalledTimes(2);

      // Verify delays are in expected range (exponential with jitter)
      const call1Delay = delayFn.mock.calls[0][0];
      const call2Delay = delayFn.mock.calls[1][0];

      expect(call1Delay).toBeGreaterThanOrEqual(50);
      expect(call1Delay).toBeLessThanOrEqual(150);
      expect(call2Delay).toBeGreaterThanOrEqual(100);
      expect(call2Delay).toBeLessThanOrEqual(300);
    });

    it('respects maxDelayMs cap', async () => {
      const fn = vi.fn().mockRejectedValue(new TimeoutError('timeout'));

      const delayFn = vi.fn(async () => {});

      await expect(
        withRetry(fn, {
          maxRetries: 10,
          initialDelayMs: 1000,
          maxDelayMs: 2000,
          delayFn,
        })
      ).rejects.toThrow();

      // All delays should respect maxDelayMs (accounting for jitter)
      delayFn.mock.calls.forEach((call) => {
        const delay = call[0];
        expect(delay).toBeLessThanOrEqual(2000 * 1.5); // Max + jitter range
      });
    });
  });

  describe('rate limit handling', () => {
    it('respects retryAfter from rate limit error', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new RateLimitError('rate limited', 5000))
        .mockResolvedValueOnce('success');

      const delayFn = vi.fn(async () => {});

      const result = await withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 100,
        delayFn,
      });

      expect(result).toBe('success');

      // Should use retryAfter (5000ms) instead of exponential backoff
      const actualDelay = delayFn.mock.calls[0][0];
      expect(actualDelay).toBe(5000);
    });

    it('uses exponential backoff when retryAfter not specified', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new RateLimitError('rate limited'))
        .mockResolvedValueOnce('success');

      const delayFn = vi.fn(async () => {});

      const result = await withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 100,
        delayFn,
      });

      expect(result).toBe('success');

      // Should use exponential backoff with jitter
      const actualDelay = delayFn.mock.calls[0][0];
      expect(actualDelay).toBeGreaterThanOrEqual(50);
      expect(actualDelay).toBeLessThanOrEqual(150);
    });
  });

  describe('non-recoverable errors', () => {
    it('does not retry authentication errors', async () => {
      const fn = vi.fn().mockRejectedValue(new AuthenticationError('invalid'));

      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('invalid');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does not retry invalid request errors', async () => {
      const fn = vi.fn().mockRejectedValue(new InvalidRequestError('invalid'));

      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('invalid');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does not retry unknown errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('unknown error'));

      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(
        'unknown error'
      );

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('abort signal', () => {
    it('aborts retry when signal is triggered', async () => {
      const controller = new AbortController();
      const fn = vi.fn().mockRejectedValue(new TimeoutError('timeout'));

      // Delay function that aborts mid-delay
      const delayFn = vi.fn(async () => {
        controller.abort();
      });

      const promise = withRetry(fn, {
        maxRetries: 10,
        signal: controller.signal,
        delayFn,
      });

      await expect(promise).rejects.toThrow('aborted');

      // Should only be called once before abort
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does not retry if already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const fn = vi.fn().mockResolvedValue('success');

      await expect(
        withRetry(fn, { signal: controller.signal })
      ).rejects.toThrow('aborted');

      expect(fn).toHaveBeenCalledTimes(0);
    });
  });

  describe('default options', () => {
    it('uses default maxRetries of 3', async () => {
      const fn = vi.fn().mockRejectedValue(new TimeoutError('timeout'));

      // Use no-delay delayFn for fast test
      const delayFn = vi.fn(async () => {});

      await expect(withRetry(fn, { delayFn })).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('uses default initialDelayMs of 1000', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new TimeoutError('timeout'))
        .mockResolvedValueOnce('success');

      const delayFn = vi.fn(async () => {});

      await withRetry(fn, { delayFn });

      const actualDelay = delayFn.mock.calls[0][0];
      expect(actualDelay).toBeGreaterThanOrEqual(500); // 1000 * 0.5 (jitter)
      expect(actualDelay).toBeLessThanOrEqual(1500); // 1000 * 1.5 (jitter)
    });
  });

  describe('edge cases', () => {
    it('handles function that returns void', async () => {
      const fn = vi.fn(async () => {
        // void function
      });

      const result = await withRetry(fn);

      expect(result).toBeUndefined();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('handles zero maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new TimeoutError('timeout'));

      await expect(withRetry(fn, { maxRetries: 0 })).rejects.toThrow('timeout');

      expect(fn).toHaveBeenCalledTimes(1); // Only initial call
    });

    it('handles negative maxRetries as zero', async () => {
      const fn = vi.fn().mockRejectedValue(new TimeoutError('timeout'));

      await expect(withRetry(fn, { maxRetries: -1 })).rejects.toThrow(
        'timeout'
      );

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

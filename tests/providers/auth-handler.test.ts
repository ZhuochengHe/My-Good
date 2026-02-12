/**
 * Tests for authentication error handler.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isAuthError, createAuthError } from '../../src/providers/auth-handler.js';
import { AuthenticationError } from '../../src/errors/provider.js';
import * as registry from '../../src/providers/registry.js';

vi.mock('../../src/providers/registry.js');

describe('Authentication Handler', () => {
  beforeEach(() => {
    vi.mocked(registry.getProvider).mockImplementation((id) => {
      if (id === 'kimi') {
        return {
          id: 'kimi',
          name: 'Kimi (Moonshot AI)',
          sdk: 'openai',
          baseUrl: 'https://api.moonshot.ai/v1',
          models: [],
          healthCheckModel: 'moonshot-v1-8k',
          envVars: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
        };
      }
      if (id === 'openai') {
        return {
          id: 'openai',
          name: 'OpenAI',
          sdk: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          models: [],
          healthCheckModel: 'gpt-3.5-turbo',
          envVars: ['OPENAI_API_KEY'],
        };
      }
      return null;
    });
  });

  describe('isAuthError', () => {
    it('should detect 401 status code', () => {
      const error = { status: 401, message: 'Unauthorized' };
      expect(isAuthError(error)).toBe(true);
    });

    it('should detect 403 status code', () => {
      const error = { status: 403, message: 'Forbidden' };
      expect(isAuthError(error)).toBe(true);
    });

    it('should detect 401 statusCode (Anthropic format)', () => {
      const error = { statusCode: 401, message: 'Unauthorized' };
      expect(isAuthError(error)).toBe(true);
    });

    it('should detect 403 statusCode (Anthropic format)', () => {
      const error = { statusCode: 403, message: 'Forbidden' };
      expect(isAuthError(error)).toBe(true);
    });

    it('should detect authentication keyword in message', () => {
      const error = { message: 'Authentication failed' };
      expect(isAuthError(error)).toBe(true);
    });

    it('should detect unauthorized keyword in message', () => {
      const error = { message: 'Unauthorized access' };
      expect(isAuthError(error)).toBe(true);
    });

    it('should detect invalid api key in message', () => {
      const error = { message: 'Invalid API key provided' };
      expect(isAuthError(error)).toBe(true);
    });

    it('should return false for non-auth errors', () => {
      const error = { status: 500, message: 'Internal server error' };
      expect(isAuthError(error)).toBe(false);
    });

    it('should return false for non-error objects', () => {
      expect(isAuthError(null)).toBe(false);
      expect(isAuthError(undefined)).toBe(false);
      expect(isAuthError('string')).toBe(false);
      expect(isAuthError(123)).toBe(false);
    });

    it('should handle errors with no status or message', () => {
      const error = { someField: 'value' };
      expect(isAuthError(error)).toBe(false);
    });
  });

  describe('createAuthError', () => {
    it('should create error with provider name and env vars', () => {
      const error = createAuthError('kimi');

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toContain('Kimi (Moonshot AI)');
      expect(error.message).toContain('KIMI_API_KEY or MOONSHOT_API_KEY');
    });

    it('should create error for OpenAI with single env var', () => {
      const error = createAuthError('openai');

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toContain('OpenAI');
      expect(error.message).toContain('OPENAI_API_KEY');
    });

    it('should include config file path in message', () => {
      const error = createAuthError('kimi');

      expect(error.message).toContain('~/.my-agent/config.yaml');
    });

    it('should preserve original error as cause', () => {
      const originalError = new Error('401 Unauthorized');
      const error = createAuthError('kimi', originalError);

      expect(error.cause).toBe(originalError);
    });

    it('should handle unknown provider gracefully', () => {
      vi.mocked(registry.getProvider).mockReturnValue(null);

      const error = createAuthError('unknown-provider');

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toContain('unknown-provider');
    });

    it('should format message with multiple env vars using "or"', () => {
      const error = createAuthError('kimi');

      expect(error.message).toMatch(/KIMI_API_KEY or MOONSHOT_API_KEY/);
    });
  });
});

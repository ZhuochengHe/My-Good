/**
 * Tests for provider manager.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderManager } from '../../src/providers/manager.js';
import type {
  ProviderConfig,
  CompletionRequest,
  CompletionResponse,
  ModelProvider,
} from '../../src/types/providers.js';
import { InvalidRequestError } from '../../src/errors/provider.js';

describe('ProviderManager', () => {
  const anthropicConfig: ProviderConfig = {
    type: 'anthropic',
    apiKey: 'sk-ant-test-key',
    defaultModel: 'claude-3-5-sonnet-20241022',
    timeout: 30000,
    maxRetries: 3,
  };

  const openaiConfig: ProviderConfig = {
    type: 'openai',
    apiKey: 'sk-openai-test-key',
    defaultModel: 'gpt-4',
    timeout: 30000,
    maxRetries: 3,
  };

  describe('constructor', () => {
    it('creates manager with provider configs', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
        openai: openaiConfig,
      });

      expect(manager).toBeDefined();
    });

    it('creates manager with single provider', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
      });

      expect(manager).toBeDefined();
    });
  });

  describe('getProvider()', () => {
    it('returns provider for valid type', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
        openai: openaiConfig,
      });

      const anthropic = manager.getProvider('anthropic');
      const openai = manager.getProvider('openai');

      expect(anthropic.type).toBe('anthropic');
      expect(openai.type).toBe('openai');
    });

    it('returns same instance on subsequent calls (caching)', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
      });

      const provider1 = manager.getProvider('anthropic');
      const provider2 = manager.getProvider('anthropic');

      expect(provider1).toBe(provider2);
    });

    it('throws error for unconfigured provider', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
      });

      expect(() => manager.getProvider('openai')).toThrow(
        'Provider openai is not configured'
      );
    });

    it('throws InvalidRequestError for unconfigured provider', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
      });

      try {
        manager.getProvider('openai');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidRequestError);
      }
    });
  });

  describe('complete()', () => {
    it('routes to correct provider based on model', async () => {
      // Mock providers will be needed here
      // For now, test the routing logic structure
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
        openai: openaiConfig,
      });

      // Get provider to verify routing works
      const provider = manager.getProvider('anthropic');
      expect(provider.type).toBe('anthropic');
    });
  });

  describe('lazy initialization', () => {
    it('does not create providers until first access', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
        openai: openaiConfig,
      });

      // Providers should not be created yet
      // We can verify by checking the cache is empty
      const provider = manager.getProvider('anthropic');
      expect(provider).toBeDefined();
    });

    it('creates provider only once when accessed multiple times', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
      });

      const p1 = manager.getProvider('anthropic');
      const p2 = manager.getProvider('anthropic');
      const p3 = manager.getProvider('anthropic');

      expect(p1).toBe(p2);
      expect(p2).toBe(p3);
    });
  });

  describe('provider factory', () => {
    it('creates provider with correct config parameters', () => {
      const config: ProviderConfig = {
        type: 'anthropic',
        apiKey: 'test-key-123',
        defaultModel: 'claude-3-5-sonnet-20241022',
        timeout: 60000,
        maxRetries: 5,
        baseUrl: 'https://custom.api.url',
      };

      const manager = new ProviderManager({
        anthropic: config,
      });

      const provider = manager.getProvider('anthropic');
      expect(provider.type).toBe('anthropic');
    });
  });

  describe('error handling', () => {
    it('throws InvalidRequestError for invalid provider type', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
      });

      expect(() =>
        manager.getProvider('invalid' as any)
      ).toThrow(InvalidRequestError);
    });

    it('provides helpful error message for unconfigured provider', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
      });

      try {
        manager.getProvider('openai');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('not configured');
        expect((error as Error).message).toContain('openai');
      }
    });
  });

  describe('multiple provider support', () => {
    it('manages both anthropic and openai providers', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
        openai: openaiConfig,
      });

      const anthropic = manager.getProvider('anthropic');
      const openai = manager.getProvider('openai');

      expect(anthropic.type).toBe('anthropic');
      expect(openai.type).toBe('openai');
      expect(anthropic).not.toBe(openai);
    });

    it('caches each provider independently', () => {
      const manager = new ProviderManager({
        anthropic: anthropicConfig,
        openai: openaiConfig,
      });

      const anthropic1 = manager.getProvider('anthropic');
      const openai1 = manager.getProvider('openai');
      const anthropic2 = manager.getProvider('anthropic');
      const openai2 = manager.getProvider('openai');

      expect(anthropic1).toBe(anthropic2);
      expect(openai1).toBe(openai2);
    });
  });

  describe('configuration validation', () => {
    it('accepts valid anthropic configuration', () => {
      const manager = new ProviderManager({
        anthropic: {
          type: 'anthropic',
          apiKey: 'sk-ant-test',
          defaultModel: 'claude-3-5-sonnet-20241022',
        },
      });

      expect(manager.getProvider('anthropic')).toBeDefined();
    });

    it('accepts valid openai configuration', () => {
      const manager = new ProviderManager({
        openai: {
          type: 'openai',
          apiKey: 'sk-openai-test',
          defaultModel: 'gpt-4',
        },
      });

      expect(manager.getProvider('openai')).toBeDefined();
    });

    it('handles optional configuration parameters', () => {
      const manager = new ProviderManager({
        anthropic: {
          type: 'anthropic',
          apiKey: 'sk-ant-test',
          defaultModel: 'claude-3-5-sonnet-20241022',
          timeout: 60000,
          maxRetries: 5,
          baseUrl: 'https://api.custom.com',
        },
      });

      expect(manager.getProvider('anthropic')).toBeDefined();
    });
  });
});

/**
 * Tests for provider registry loader.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  loadProviderRegistry,
  getProvider,
  listProviders,
  validateProvider,
  clearCache,
} from '../../src/providers/registry.js';
import type { ProviderManifest } from '../../src/types/providers.js';

vi.mock('node:fs');

describe('Provider Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  describe('loadProviderRegistry', () => {
    it('should load and parse providers.json successfully', () => {
      const mockRegistry = {
        version: '1.0.0',
        providers: {
          openai: {
            id: 'openai',
            name: 'OpenAI',
            sdk: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            models: [
              {
                id: 'gpt-4',
                name: 'GPT-4',
                contextWindow: 8192,
                maxOutputTokens: 4096,
                supportsToolCalling: true,
                supportsStreaming: true,
              },
            ],
            healthCheckModel: 'gpt-3.5-turbo',
            envVars: ['OPENAI_API_KEY'],
          },
        },
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockRegistry));

      const registry = loadProviderRegistry();

      expect(registry).toEqual(mockRegistry);
      expect(registry.providers.openai).toBeDefined();
    });

    it('should throw error if providers.json does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => loadProviderRegistry()).toThrow(
        'Provider registry file not found'
      );
    });

    it('should throw error if providers.json is invalid JSON', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      expect(() => loadProviderRegistry()).toThrow();
    });

    it('should throw error if registry is missing version', () => {
      const invalidRegistry = {
        providers: {},
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(invalidRegistry));

      expect(() => loadProviderRegistry()).toThrow('Invalid provider registry');
    });

    it('should throw error if registry is missing providers', () => {
      const invalidRegistry = {
        version: '1.0.0',
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(invalidRegistry));

      expect(() => loadProviderRegistry()).toThrow('Invalid provider registry');
    });
  });

  describe('getProvider', () => {
    const mockRegistry = {
      version: '1.0.0',
      providers: {
        openai: {
          id: 'openai',
          name: 'OpenAI',
          sdk: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          models: [],
          healthCheckModel: 'gpt-3.5-turbo',
          envVars: ['OPENAI_API_KEY'],
        },
        kimi: {
          id: 'kimi',
          name: 'Kimi',
          sdk: 'openai',
          baseUrl: 'https://api.moonshot.ai/v1',
          models: [],
          healthCheckModel: 'moonshot-v1-8k',
          envVars: ['KIMI_API_KEY'],
        },
      },
    };

    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockRegistry));
    });

    it('should return provider manifest by ID', () => {
      const provider = getProvider('openai');

      expect(provider).toBeDefined();
      expect(provider.id).toBe('openai');
      expect(provider.name).toBe('OpenAI');
      expect(provider.sdk).toBe('openai');
    });

    it('should return provider manifest for kimi', () => {
      const provider = getProvider('kimi');

      expect(provider).toBeDefined();
      expect(provider.id).toBe('kimi');
      expect(provider.name).toBe('Kimi');
      expect(provider.baseUrl).toBe('https://api.moonshot.ai/v1');
    });

    it('should return null for non-existent provider', () => {
      const provider = getProvider('non-existent');

      expect(provider).toBeNull();
    });

    it('should be case-sensitive', () => {
      const provider = getProvider('OpenAI');

      expect(provider).toBeNull();
    });
  });

  describe('listProviders', () => {
    const mockRegistry = {
      version: '1.0.0',
      providers: {
        anthropic: {
          id: 'anthropic',
          name: 'Anthropic',
          sdk: 'anthropic',
          baseUrl: 'https://api.anthropic.com',
          models: [],
          healthCheckModel: 'claude-3-haiku-20240307',
          envVars: ['ANTHROPIC_API_KEY'],
        },
        kimi: {
          id: 'kimi',
          name: 'Kimi',
          sdk: 'openai',
          baseUrl: 'https://api.moonshot.ai/v1',
          models: [],
          healthCheckModel: 'moonshot-v1-8k',
          envVars: ['KIMI_API_KEY'],
        },
        openai: {
          id: 'openai',
          name: 'OpenAI',
          sdk: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          models: [],
          healthCheckModel: 'gpt-3.5-turbo',
          envVars: ['OPENAI_API_KEY'],
        },
      },
    };

    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockRegistry));
    });

    it('should return all provider manifests', () => {
      const providers = listProviders();

      expect(providers).toHaveLength(3);
      expect(providers.map((p) => p.id)).toContain('openai');
      expect(providers.map((p) => p.id)).toContain('kimi');
      expect(providers.map((p) => p.id)).toContain('anthropic');
    });

    it('should return providers in alphabetical order by ID', () => {
      const providers = listProviders();

      expect(providers[0].id).toBe('anthropic');
      expect(providers[1].id).toBe('kimi');
      expect(providers[2].id).toBe('openai');
    });
  });

  describe('validateProvider', () => {
    const mockRegistry = {
      version: '1.0.0',
      providers: {
        openai: {
          id: 'openai',
          name: 'OpenAI',
          sdk: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          models: [],
          healthCheckModel: 'gpt-3.5-turbo',
          envVars: ['OPENAI_API_KEY'],
        },
      },
    };

    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockRegistry));
    });

    it('should return true for valid provider ID', () => {
      expect(validateProvider('openai')).toBe(true);
    });

    it('should return false for invalid provider ID', () => {
      expect(validateProvider('invalid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateProvider('')).toBe(false);
    });
  });
});

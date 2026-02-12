/**
 * Tests for config migration utilities.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isOldFormat, migrateConfig } from '../../src/config/migration.js';
import { loadConfigFromString } from '../../src/config/loader.js';

describe('config migration', () => {
  describe('isOldFormat', () => {
    it('should detect old format with type field in provider', () => {
      const config = {
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
        },
      };

      expect(isOldFormat(config)).toBe(true);
    });

    it('should detect old format with multiple providers having type field', () => {
      const config = {
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
          openai: {
            type: 'openai',
            apiKey: 'sk-test',
            defaultModel: 'gpt-4',
          },
        },
      };

      expect(isOldFormat(config)).toBe(true);
    });

    it('should detect new format without type field', () => {
      const config = {
        providers: {
          anthropic: {
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
        },
      };

      expect(isOldFormat(config)).toBe(false);
    });

    it('should detect new format with multiple providers', () => {
      const config = {
        providers: {
          anthropic: {
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
          kimi: {
            apiKey: 'sk-test',
            defaultModel: 'moonshot-v1-8k',
          },
        },
      };

      expect(isOldFormat(config)).toBe(false);
    });

    it('should detect mixed format as old (at least one has type)', () => {
      const config = {
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
          kimi: {
            apiKey: 'sk-test',
            defaultModel: 'moonshot-v1-8k',
          },
        },
      };

      expect(isOldFormat(config)).toBe(true);
    });

    it('should return false for empty providers object', () => {
      const config = {
        providers: {},
      };

      expect(isOldFormat(config)).toBe(false);
    });

    it('should return false for missing providers field', () => {
      const config = {
        agent: {
          name: 'Test',
        },
      };

      expect(isOldFormat(config)).toBe(false);
    });

    it('should return false for null config', () => {
      expect(isOldFormat(null)).toBe(false);
    });

    it('should return false for undefined config', () => {
      expect(isOldFormat(undefined)).toBe(false);
    });
  });

  describe('migrateConfig', () => {
    it('should remove type field from single provider', () => {
      const oldConfig = {
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
            timeout: 60000,
          },
        },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.providers.anthropic.type).toBeUndefined();
      expect(migrated.providers.anthropic.apiKey).toBe('sk-test');
      expect(migrated.providers.anthropic.defaultModel).toBe('claude-sonnet-4-20250514');
      expect(migrated.providers.anthropic.timeout).toBe(60000);
    });

    it('should remove type field from multiple providers', () => {
      const oldConfig = {
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-ant-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
          openai: {
            type: 'openai',
            apiKey: 'sk-proj-test',
            defaultModel: 'gpt-4',
          },
        },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.providers.anthropic.type).toBeUndefined();
      expect(migrated.providers.openai.type).toBeUndefined();
      expect(migrated.providers.anthropic.apiKey).toBe('sk-ant-test');
      expect(migrated.providers.openai.apiKey).toBe('sk-proj-test');
    });

    it('should preserve all non-type fields', () => {
      const oldConfig = {
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-test',
            baseUrl: 'https://custom.api.com',
            defaultModel: 'claude-sonnet-4-20250514',
            timeout: 30000,
            maxRetries: 5,
          },
        },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.providers.anthropic.apiKey).toBe('sk-test');
      expect(migrated.providers.anthropic.baseUrl).toBe('https://custom.api.com');
      expect(migrated.providers.anthropic.defaultModel).toBe('claude-sonnet-4-20250514');
      expect(migrated.providers.anthropic.timeout).toBe(30000);
      expect(migrated.providers.anthropic.maxRetries).toBe(5);
    });

    it('should preserve other top-level config fields', () => {
      const oldConfig = {
        agent: {
          name: 'My Agent',
          model: 'claude-sonnet-4-20250514',
        },
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
        },
        plugins: {
          directories: ['./plugins'],
          enabled: [],
          disabled: [],
        },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.agent).toEqual(oldConfig.agent);
      expect(migrated.plugins).toEqual(oldConfig.plugins);
    });

    it('should pass through new format unchanged', () => {
      const newConfig = {
        providers: {
          anthropic: {
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
          kimi: {
            apiKey: 'sk-kimi',
            defaultModel: 'moonshot-v1-8k',
          },
        },
      };

      const migrated = migrateConfig(newConfig);

      expect(migrated).toEqual(newConfig);
    });

    it('should not mutate original config object', () => {
      const oldConfig = {
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
        },
      };

      const original = JSON.stringify(oldConfig);
      migrateConfig(oldConfig);

      expect(JSON.stringify(oldConfig)).toBe(original);
    });

    it('should handle empty providers object', () => {
      const config = {
        providers: {},
      };

      const migrated = migrateConfig(config);

      expect(migrated.providers).toEqual({});
    });

    it('should handle missing providers field', () => {
      const config = {
        agent: {
          name: 'Test',
        },
      };

      const migrated = migrateConfig(config);

      expect(migrated).toEqual(config);
    });

    it('should handle null config', () => {
      const migrated = migrateConfig(null);

      expect(migrated).toBeNull();
    });

    it('should handle undefined config', () => {
      const migrated = migrateConfig(undefined);

      expect(migrated).toBeUndefined();
    });

    it('should handle mixed old and new format', () => {
      const mixedConfig = {
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-ant-test',
            defaultModel: 'claude-sonnet-4-20250514',
          },
          kimi: {
            apiKey: 'sk-kimi-test',
            defaultModel: 'moonshot-v1-8k',
          },
        },
      };

      const migrated = migrateConfig(mixedConfig);

      expect(migrated.providers.anthropic.type).toBeUndefined();
      expect(migrated.providers.kimi.type).toBeUndefined();
      expect(migrated.providers.anthropic.apiKey).toBe('sk-ant-test');
      expect(migrated.providers.kimi.apiKey).toBe('sk-kimi-test');
    });

    it('should preserve nested objects in provider config', () => {
      const oldConfig = {
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-test',
            defaultModel: 'claude-sonnet-4-20250514',
            customOptions: {
              feature1: true,
              feature2: {
                nested: 'value',
              },
            },
          },
        },
      };

      const migrated = migrateConfig(oldConfig);

      expect(migrated.providers.anthropic.customOptions).toEqual({
        feature1: true,
        feature2: {
          nested: 'value',
        },
      });
    });
  });

  describe('integration with loadConfig', () => {
    let consoleLogSpy: any;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should automatically migrate old format when loading', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: claude-sonnet-4-20250514
  provider: anthropic
  maxTurns: 10
  maxTokensPerTurn: 1000
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  anthropic:
    type: anthropic
    apiKey: sk-ant-test123
    defaultModel: claude-sonnet-4-20250514
  openai:
    type: openai
    apiKey: sk-proj-test123
    defaultModel: gpt-4
`;

      const config = loadConfigFromString(yaml);

      // Config should be loaded successfully (migration happened silently)
      expect(config.providers.anthropic).toBeDefined();
      expect(config.providers.openai).toBeDefined();
      expect(config.providers.anthropic.apiKey).toBe('sk-ant-test123');
      expect(config.providers.openai.apiKey).toBe('sk-proj-test123');
    });

    it('should not auto-migrate old format (migration disabled)', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  model: claude-sonnet-4-20250514
  provider: anthropic
providers:
  anthropic:
    type: anthropic
    apiKey: sk-ant-test123
    defaultModel: claude-sonnet-4-20250514
`;

      // Old format with 'type' field should still load (loose validation)
      const config = loadConfigFromString(yaml);
      expect(config.providers.anthropic.apiKey).toBe('sk-ant-test123');

      // Should NOT have logged migration message (auto-migration disabled)
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log migration message for new format', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  model: claude-sonnet-4-20250514
  provider: anthropic
providers:
  anthropic:
    apiKey: sk-ant-test123
`;

      loadConfigFromString(yaml);

      // Should NOT have logged migration message
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should load new format without migration', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  model: moonshot-v1-8k
  provider: kimi
providers:
  kimi:
    apiKey: sk-kimi-test123
  anthropic:
    apiKey: sk-ant-test123
`;

      const config = loadConfigFromString(yaml);

      expect(config.providers.kimi).toBeDefined();
      expect(config.providers.anthropic).toBeDefined();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should preserve all fields after loading', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  model: claude-sonnet-4-20250514
  provider: anthropic
providers:
  anthropic:
    apiKey: sk-ant-test123
    baseUrl: https://custom.api.com
    timeout: 30000
    maxRetries: 5
`;

      const config = loadConfigFromString(yaml);

      expect(config.providers.anthropic.apiKey).toBe('sk-ant-test123');
      expect(config.providers.anthropic.baseUrl).toBe('https://custom.api.com');
      expect(config.providers.anthropic.timeout).toBe(30000);
      expect(config.providers.anthropic.maxRetries).toBe(5);
    });
  });
});

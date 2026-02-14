/**
 * Tests for config schema validation.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfigFromString, validateConfig, ConfigValidationError } from '../../src/config/loader.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('config schema validation', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `config-schema-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('new provider format', () => {
    it('should accept anthropic provider without type field', () => {
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
    apiKey: sk-ant-test123
    defaultModel: claude-sonnet-4-20250514
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.anthropic).toBeDefined();
      expect(config.providers.anthropic.apiKey).toBe('sk-ant-test123');
    });

    it('should accept kimi provider from registry', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: moonshot-v1-8k
  provider: kimi
  maxTurns: 10
  maxTokensPerTurn: 1000
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  kimi:
    apiKey: sk-kimi-test123
    defaultModel: moonshot-v1-8k
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.kimi).toBeDefined();
      expect(config.providers.kimi.apiKey).toBe('sk-kimi-test123');
    });

    it('should accept openai provider from registry', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: gpt-4
  provider: openai
  maxTurns: 10
  maxTokensPerTurn: 1000
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  openai:
    apiKey: sk-proj-test123
    defaultModel: gpt-4
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.openai).toBeDefined();
      expect(config.providers.openai.apiKey).toBe('sk-proj-test123');
    });

    it('should accept multiple providers in same config', () => {
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
    apiKey: sk-ant-test123
    defaultModel: claude-sonnet-4-20250514
  kimi:
    apiKey: sk-kimi-test123
    defaultModel: moonshot-v1-8k
  openai:
    apiKey: sk-proj-test123
    defaultModel: gpt-4
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.anthropic).toBeDefined();
      expect(config.providers.kimi).toBeDefined();
      expect(config.providers.openai).toBeDefined();
    });
  });

  describe('optional baseUrl field', () => {
    it('should accept provider config without baseUrl', () => {
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
    apiKey: sk-ant-test123
    defaultModel: claude-sonnet-4-20250514
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.anthropic.baseUrl).toBeUndefined();
    });

    it('should accept provider config with baseUrl override', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: moonshot-v1-8k
  provider: kimi
  maxTurns: 10
  maxTokensPerTurn: 1000
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  kimi:
    apiKey: sk-kimi-test123
    baseUrl: https://custom-api.example.com/v1
    defaultModel: moonshot-v1-8k
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.kimi.baseUrl).toBe('https://custom-api.example.com/v1');
    });

    it('should accept empty baseUrl string', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: gpt-4
  provider: openai
  maxTurns: 10
  maxTokensPerTurn: 1000
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  openai:
    apiKey: sk-proj-test123
    baseUrl: ""
    defaultModel: gpt-4
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.openai.baseUrl).toBe('');
    });
  });

  describe('provider validation against registry', () => {
    it('should reject unknown provider ID', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: unknown-model
  provider: unknown-provider
  maxTurns: 10
  maxTokensPerTurn: 1000
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  unknown-provider:
    apiKey: sk-test123
    defaultModel: unknown-model
`;

      expect(() => loadConfigFromString(yaml)).toThrow(ConfigValidationError);
      expect(() => loadConfigFromString(yaml)).toThrow(/unknown provider/i);
    });

    it('should reject invalid provider ID in agent.provider field', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: claude-sonnet-4-20250514
  provider: invalid-provider-name
  maxTurns: 10
  maxTokensPerTurn: 1000
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  anthropic:
    apiKey: sk-ant-test123
    defaultModel: claude-sonnet-4-20250514
`;

      expect(() => loadConfigFromString(yaml)).toThrow(ConfigValidationError);
      expect(() => loadConfigFromString(yaml)).toThrow(/unknown provider/i);
    });

    it('should provide helpful error message for unknown provider', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: test-model
  provider: anthropic
  maxTurns: 10
  maxTokensPerTurn: 1000
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  gemini:
    apiKey: sk-test123
    defaultModel: gemini-pro
`;

      try {
        loadConfigFromString(yaml);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as Error).message).toContain('gemini');
        expect((error as Error).message).toMatch(/unknown provider|check providers\.json/i);
      }
    });
  });

  describe('backward compatibility', () => {
    it('should accept old format with type field', () => {
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
      expect(config.providers.anthropic).toBeDefined();
      expect(config.providers.openai).toBeDefined();
    });

    it('should accept mix of old and new format', () => {
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
  kimi:
    apiKey: sk-kimi-test123
    defaultModel: moonshot-v1-8k
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.anthropic).toBeDefined();
      expect(config.providers.kimi).toBeDefined();
    });
  });

  describe('environment variable substitution', () => {
    it('should substitute env vars in provider apiKey', () => {
      process.env.TEST_ANTHROPIC_KEY = 'sk-ant-from-env';

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
    apiKey: \${TEST_ANTHROPIC_KEY}
    defaultModel: claude-sonnet-4-20250514
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.anthropic.apiKey).toBe('sk-ant-from-env');

      delete process.env.TEST_ANTHROPIC_KEY;
    });

    it('should substitute env vars in baseUrl', () => {
      process.env.TEST_BASE_URL = 'https://custom.api.com';

      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: moonshot-v1-8k
  provider: kimi
  maxTurns: 10
  maxTokensPerTurn: 1000
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  kimi:
    apiKey: sk-kimi-test123
    baseUrl: \${TEST_BASE_URL}/v1
    defaultModel: moonshot-v1-8k
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.kimi.baseUrl).toBe('https://custom.api.com/v1');

      delete process.env.TEST_BASE_URL;
    });

    it('should use default value for missing env var', () => {
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
    apiKey: \${MISSING_KEY:-sk-ant-default}
    defaultModel: claude-sonnet-4-20250514
`;

      const config = loadConfigFromString(yaml);
      expect(config.providers.anthropic.apiKey).toBe('sk-ant-default');
    });
  });

  describe('loose validation mode', () => {
    it('should allow unknown fields in provider config', () => {
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
    apiKey: sk-ant-test123
    defaultModel: claude-sonnet-4-20250514
    customField: custom-value
    anotherField: 123
`;

      // Should not throw - loose mode allows extra fields
      const config = loadConfigFromString(yaml);
      expect(config.providers.anthropic).toBeDefined();
    });

    it('should allow unknown fields in agent config', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  systemPrompt: Test prompt
  model: claude-sonnet-4-20250514
  provider: anthropic
  maxTurns: 10
  maxTokensPerTurn: 1000
  customAgentField: custom-value
  tools:
    allow: []
    deny: []
    requireApproval: []
providers:
  anthropic:
    apiKey: sk-ant-test123
    defaultModel: claude-sonnet-4-20250514
`;

      // Should not throw - loose mode allows extra fields
      const config = loadConfigFromString(yaml);
      expect(config.agent).toBeDefined();
    });
  });

  describe('required fields validation', () => {
    it('should require apiKey in provider config', () => {
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
    defaultModel: claude-sonnet-4-20250514
`;

      expect(() => loadConfigFromString(yaml)).toThrow(ConfigValidationError);
      expect(() => loadConfigFromString(yaml)).toThrow(/apiKey/i);
    });

    it('should validate provider config has required fields', () => {
      // Provider config only requires apiKey (defaultModel removed)
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

      // Should not throw - apiKey is the only required field
      const result = loadConfigFromString(yaml);
      expect(result.providers.anthropic.apiKey).toBe('sk-ant-test123');
    });
  });
});

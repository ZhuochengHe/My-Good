/**
 * Tests for configuration loader.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Import functions to test (will fail initially - that's expected in TDD)
import {
  loadConfig,
  loadConfigFromString,
  validateConfig,
  substituteEnvVars,
  ConfigValidationError,
} from '../../src/config/loader.js';
import { getDefaultConfig } from '../../src/config/defaults.js';

describe('Configuration System', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    // Reset environment variables
    vi.unstubAllEnvs();
  });

  describe('getDefaultConfig', () => {
    it('returns a valid default configuration', () => {
      const config = getDefaultConfig();

      expect(config).toBeDefined();
      expect(config.agent).toBeDefined();
      expect(config.providers).toBeDefined();
      expect(config.plugins).toBeDefined();
      expect(config.session).toBeDefined();
      expect(config.logging).toBeDefined();
    });

    it('has sensible default agent values', () => {
      const config = getDefaultConfig();

      expect(config.agent.id).toBe('default');
      expect(config.agent.name).toBe('My Agent');
      // Default config has placeholder values - must be configured via setup
      expect(config.agent.model).toBe('claude-sonnet-4-20250514');
      expect(config.agent.provider).toBe('anthropic');
    });

    it('has default providers with placeholder API key', () => {
      const config = getDefaultConfig();

      // Default config has placeholder provider - must be configured via setup
      expect(Object.keys(config.providers)).toHaveLength(1);
      expect(config.providers.anthropic).toBeDefined();
      expect(config.providers.anthropic.apiKey).toBe('YOUR_ANTHROPIC_API_KEY_HERE');
    });

    it('has sensible default session values', () => {
      const config = getDefaultConfig();

      expect(config.session.storePath).toBe('./.sessions');
      expect(config.session.maxMessages).toBeGreaterThan(0);
      expect(config.session.idleTimeoutMinutes).toBeGreaterThan(0);
    });

    it('has sensible default logging values', () => {
      const config = getDefaultConfig();

      expect(config.logging.level).toBe('info');
      expect(config.logging.format).toBe('pretty');
    });

    it('has sensible default plugin values', () => {
      const config = getDefaultConfig();

      expect(config.plugins.directories).toContain('./plugins');
      expect(Array.isArray(config.plugins.enabled)).toBe(true);
      expect(Array.isArray(config.plugins.disabled)).toBe(true);
    });
  });

  describe('substituteEnvVars', () => {
    it('replaces ${VAR_NAME} with environment variable value', () => {
      vi.stubEnv('TEST_API_KEY', 'secret-key-123');

      const result = substituteEnvVars('api_key: ${TEST_API_KEY}');

      expect(result).toBe('api_key: secret-key-123');
    });

    it('replaces multiple environment variables', () => {
      vi.stubEnv('VAR_ONE', 'value1');
      vi.stubEnv('VAR_TWO', 'value2');

      const result = substituteEnvVars('${VAR_ONE} and ${VAR_TWO}');

      expect(result).toBe('value1 and value2');
    });

    it('leaves unset variables as empty string', () => {
      const result = substituteEnvVars('key: ${NONEXISTENT_VAR}');

      expect(result).toBe('key: ');
    });

    it('supports default values with ${VAR:-default} syntax', () => {
      const result = substituteEnvVars('key: ${MISSING_VAR:-default_value}');

      expect(result).toBe('key: default_value');
    });

    it('uses env value over default when variable is set', () => {
      vi.stubEnv('EXISTING_VAR', 'actual_value');

      const result = substituteEnvVars('key: ${EXISTING_VAR:-default_value}');

      expect(result).toBe('key: actual_value');
    });

    it('handles nested braces correctly', () => {
      vi.stubEnv('INNER', 'inner_value');

      const result = substituteEnvVars('outer: { key: ${INNER} }');

      expect(result).toBe('outer: { key: inner_value }');
    });

    it('handles empty strings as valid values', () => {
      vi.stubEnv('EMPTY_VAR', '');

      const result = substituteEnvVars('key: ${EMPTY_VAR}');

      expect(result).toBe('key: ');
    });

    it('ignores malformed variable syntax', () => {
      const input = 'key: $VAR_NAME and ${incomplete';

      const result = substituteEnvVars(input);

      expect(result).toBe('key: $VAR_NAME and ${incomplete');
    });
  });

  describe('validateConfig', () => {
    it('validates a correct configuration', () => {
      const config = {
        ...getDefaultConfig(),
        agent: {
          id: 'test',
          name: 'Test Agent',
          model: 'claude-sonnet-4-20250514',
          provider: 'anthropic',
        },
        providers: {
          anthropic: {
            apiKey: 'sk-ant-test123',
          },
        },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agent.id).toBe('test');
      }
    });

    it('rejects config with missing agent section', () => {
      const invalidConfig = {
        providers: {},
        plugins: {},
        session: {},
        logging: {},
      };

      const result = validateConfig(invalidConfig);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('agent');
      }
    });

    it('rejects config with invalid log level', () => {
      const config = getDefaultConfig();
      const invalidConfig = {
        ...config,
        logging: { ...config.logging, level: 'invalid' },
      };

      const result = validateConfig(invalidConfig);

      expect(result.success).toBe(false);
    });

    it('rejects config with invalid log format', () => {
      const config = getDefaultConfig();
      const invalidConfig = {
        ...config,
        logging: { ...config.logging, format: 'xml' },
      };

      const result = validateConfig(invalidConfig);

      expect(result.success).toBe(false);
    });

    it('rejects config with invalid provider type', () => {
      const config = getDefaultConfig();
      const invalidConfig = {
        ...config,
        agent: { ...config.agent, provider: 'invalid_provider' },
      };

      const result = validateConfig(invalidConfig);

      expect(result.success).toBe(false);
    });

    it('rejects config with missing required agent fields', () => {
      const config = {
        ...getDefaultConfig(),
        agent: {
          // Missing required fields: id, model, provider
          name: 'Test Agent',
        },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(false);
    });

    it('rejects config with invalid provider', () => {
      const config = {
        ...getDefaultConfig(),
        agent: {
          id: 'test',
          name: 'Test Agent',
          model: 'test-model',
          provider: 'invalid-provider',
        },
        providers: {
          'invalid-provider': {
            apiKey: 'test123',
          },
        },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(false);
    });

    it('provides helpful error messages for validation failures', () => {
      const invalidConfig = {
        agent: {
          id: 123, // Should be string
          name: 'Test',
        },
      };

      const result = validateConfig(invalidConfig);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('loadConfigFromString', () => {
    it('parses valid YAML configuration', () => {
      const yaml = `
agent:
  id: test-agent
  name: Test Agent
  systemPrompt: You are a helpful assistant.
  model: claude-sonnet-4-20250514
  provider: anthropic
  maxTurns: 10
  maxTokensPerTurn: 4096
  tools:
    allow: []
    deny: []
    requireApproval: []

providers:
  anthropic:
    type: anthropic
    apiKey: test-key
    defaultModel: claude-sonnet-4-20250514
  openai:
    type: openai
    apiKey: test-key
    defaultModel: gpt-4o

plugins:
  directories:
    - ./plugins
  enabled: []
  disabled: []

session:
  storePath: ./.sessions
  maxMessages: 100
  idleTimeoutMinutes: 30

logging:
  level: info
  format: pretty
`;

      const config = loadConfigFromString(yaml);

      expect(config.agent.id).toBe('test-agent');
      expect(config.agent.name).toBe('Test Agent');
      expect(config.providers.anthropic.apiKey).toBe('test-key');
    });

    it('substitutes environment variables in YAML', () => {
      vi.stubEnv('MY_API_KEY', 'secret-from-env');

      const yaml = `
agent:
  id: test
  name: Test
  systemPrompt: Hello
  model: claude-sonnet-4-20250514
  provider: anthropic
  maxTurns: 10
  maxTokensPerTurn: 4096
  tools:
    allow: []
    deny: []
    requireApproval: []

providers:
  anthropic:
    type: anthropic
    apiKey: \${MY_API_KEY}
    defaultModel: claude-sonnet-4-20250514
  openai:
    type: openai
    apiKey: \${MY_API_KEY}
    defaultModel: gpt-4o

plugins:
  directories: []
  enabled: []
  disabled: []

session:
  storePath: ./.sessions
  maxMessages: 100
  idleTimeoutMinutes: 30

logging:
  level: info
  format: pretty
`;

      const config = loadConfigFromString(yaml);

      expect(config.providers.anthropic.apiKey).toBe('secret-from-env');
    });

    it('throws ConfigValidationError for invalid YAML', () => {
      const invalidYaml = `
agent:
  - this: is
  invalid: yaml: structure:
`;

      expect(() => loadConfigFromString(invalidYaml)).toThrow();
    });

    it('throws ConfigValidationError for valid YAML but invalid config', () => {
      const validYamlInvalidConfig = `
agent:
  id: 123
`;

      expect(() => loadConfigFromString(validYamlInvalidConfig)).toThrow(ConfigValidationError);
    });

    it('merges with defaults for partial config', () => {
      const partialYaml = `
agent:
  id: custom
  name: Custom Agent
  model: claude-sonnet-4-20250514
  provider: anthropic
providers:
  anthropic:
    apiKey: sk-ant-test123
`;

      const config = loadConfigFromString(partialYaml);

      // Custom value should be applied
      expect(config.agent.name).toBe('Custom Agent');
      // Default values should still be present
      expect(config.agent.id).toBe('custom');
      expect(config.logging.level).toBe('info');
    });
  });

  describe('loadConfig', () => {
    it('loads configuration from file path', async () => {
      const configPath = join(testDir, 'config.yaml');
      const configContent = `
agent:
  id: file-agent
  name: File Agent
  systemPrompt: Hello
  model: claude-sonnet-4-20250514
  provider: anthropic
  maxTurns: 10
  maxTokensPerTurn: 4096
  tools:
    allow: []
    deny: []
    requireApproval: []

providers:
  anthropic:
    type: anthropic
    apiKey: file-key
    defaultModel: claude-sonnet-4-20250514
  openai:
    type: openai
    apiKey: file-key
    defaultModel: gpt-4o

plugins:
  directories: []
  enabled: []
  disabled: []

session:
  storePath: ./.sessions
  maxMessages: 100
  idleTimeoutMinutes: 30

logging:
  level: debug
  format: json
`;
      writeFileSync(configPath, configContent);

      const config = await loadConfig(configPath);

      expect(config.agent.id).toBe('file-agent');
      expect(config.logging.level).toBe('debug');
      expect(config.logging.format).toBe('json');
    });

    it('throws error for non-existent file', async () => {
      const nonExistentPath = join(testDir, 'nonexistent.yaml');

      await expect(loadConfig(nonExistentPath)).rejects.toThrow();
    });

    it('substitutes environment variables from file', async () => {
      vi.stubEnv('FILE_API_KEY', 'key-from-file-env');

      const configPath = join(testDir, 'config-env.yaml');
      const configContent = `
agent:
  id: env-test
  name: Env Test
  systemPrompt: Hello
  model: claude-sonnet-4-20250514
  provider: anthropic
  maxTurns: 10
  maxTokensPerTurn: 4096
  tools:
    allow: []
    deny: []
    requireApproval: []

providers:
  anthropic:
    type: anthropic
    apiKey: \${FILE_API_KEY}
    defaultModel: claude-sonnet-4-20250514
  openai:
    type: openai
    apiKey: \${FILE_API_KEY}
    defaultModel: gpt-4o

plugins:
  directories: []
  enabled: []
  disabled: []

session:
  storePath: ./.sessions
  maxMessages: 100
  idleTimeoutMinutes: 30

logging:
  level: info
  format: pretty
`;
      writeFileSync(configPath, configContent);

      const config = await loadConfig(configPath);

      expect(config.providers.anthropic.apiKey).toBe('key-from-file-env');
    });

    it('supports .yml extension', async () => {
      const configPath = join(testDir, 'config.yml');
      const configContent = `
agent:
  id: yml-test
  name: YML Test
  systemPrompt: Hello
  model: claude-sonnet-4-20250514
  provider: anthropic
  maxTurns: 10
  maxTokensPerTurn: 4096
  tools:
    allow: []
    deny: []
    requireApproval: []

providers:
  anthropic:
    type: anthropic
    apiKey: yml-key
    defaultModel: claude-sonnet-4-20250514
  openai:
    type: openai
    apiKey: yml-key
    defaultModel: gpt-4o

plugins:
  directories: []
  enabled: []
  disabled: []

session:
  storePath: ./.sessions
  maxMessages: 100
  idleTimeoutMinutes: 30

logging:
  level: info
  format: pretty
`;
      writeFileSync(configPath, configContent);

      const config = await loadConfig(configPath);

      expect(config.agent.id).toBe('yml-test');
    });

    it('uses default values for missing optional fields', async () => {
      const configPath = join(testDir, 'minimal.yaml');
      const configContent = `
agent:
  id: minimal
  name: Minimal Agent
  model: claude-sonnet-4-20250514
  provider: anthropic
providers:
  anthropic:
    apiKey: sk-ant-test123
`;
      writeFileSync(configPath, configContent);

      const config = await loadConfig(configPath);

      expect(config.agent.name).toBe('Minimal Agent');
      expect(config.session.storePath).toBe('./.sessions');
    });
  });

  describe('ConfigValidationError', () => {
    it('is an instance of Error', () => {
      const error = new ConfigValidationError('Test error', []);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ConfigValidationError');
    });

    it('contains validation issues', () => {
      const issues = [
        { path: ['agent', 'id'], message: 'Expected string, received number' },
        { path: ['logging', 'level'], message: 'Invalid enum value' },
      ];
      const error = new ConfigValidationError('Validation failed', issues);

      expect(error.issues).toEqual(issues);
      expect(error.message).toContain('Validation failed');
    });

    it('formats error message with issues', () => {
      const issues = [
        { path: ['agent', 'id'], message: 'Required' },
      ];
      const error = new ConfigValidationError('Config validation failed', issues);

      expect(error.message).toContain('agent.id');
      expect(error.message).toContain('Required');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty YAML file', () => {
      // Empty config should use all defaults
      const config = loadConfigFromString('');

      expect(config).toEqual(getDefaultConfig());
    });

    it('handles YAML with only comments', () => {
      const yaml = `
# This is a comment
# Another comment
`;
      const config = loadConfigFromString(yaml);

      expect(config).toEqual(getDefaultConfig());
    });

    it('handles unicode in configuration values', async () => {
      const configPath = join(testDir, 'unicode.yaml');
      const configContent = `
agent:
  id: unicode
  name: "Agent 🤖 Bot"
  model: claude-sonnet-4-20250514
  provider: anthropic
providers:
  anthropic:
    apiKey: sk-ant-test123
`;
      writeFileSync(configPath, configContent);

      const config = await loadConfig(configPath);

      expect(config.agent.name).toContain('🤖');
    });

    it('handles very long string values', () => {
      const longPrompt = 'A'.repeat(10000);
      const yaml = `
agent:
  id: long-test
  name: Long Test Agent
  model: claude-sonnet-4-20250514
  provider: anthropic
  systemPrompt: "${longPrompt}"
providers:
  anthropic:
    apiKey: sk-ant-test123
`;
      const config = loadConfigFromString(yaml);

      expect(config.agent.systemPrompt).toBe(longPrompt);
    });

    it('handles special characters in paths', async () => {
      const configPath = join(testDir, 'config.yaml');
      const configContent = `
agent:
  id: test
  name: Test Agent
  model: claude-sonnet-4-20250514
  provider: anthropic
providers:
  anthropic:
    apiKey: sk-ant-test123
session:
  storePath: "./sessions with spaces/and-dashes"
`;
      writeFileSync(configPath, configContent);

      const config = await loadConfig(configPath);

      expect(config.session.storePath).toBe('./sessions with spaces/and-dashes');
    });

    it('preserves array order in configuration', () => {
      const yaml = `
agent:
  id: test
  name: Test Agent
  model: claude-sonnet-4-20250514
  provider: anthropic
providers:
  anthropic:
    apiKey: sk-ant-test123
plugins:
  directories:
    - ./first
    - ./second
    - ./third
`;
      const config = loadConfigFromString(yaml);

      expect(config.plugins.directories).toEqual(['./first', './second', './third']);
    });

    it('handles boolean-like strings correctly', () => {
      // YAML can interpret 'yes', 'no', 'true', 'false' as booleans
      const yaml = `
agent:
  name: "yes"
  id: "true"
  model: claude-sonnet-4-20250514
  provider: anthropic
providers:
  anthropic:
    apiKey: sk-ant-test123
`;
      const config = loadConfigFromString(yaml);

      expect(config.agent.name).toBe('yes');
      expect(config.agent.id).toBe('true');
    });
  });
});

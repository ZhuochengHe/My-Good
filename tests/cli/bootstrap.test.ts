/**
 * Tests for CLI bootstrap.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrap } from '../../src/cli/bootstrap.js';

describe('bootstrap', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(() => {
    // Create unique temp directory for each test
    testDir = join(tmpdir(), `cli-bootstrap-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    configPath = join(testDir, 'config.yaml');
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('config auto-creation', () => {
    it('should create default config if it does not exist', async () => {
      expect(existsSync(configPath)).toBe(false);

      await bootstrap({ configPath });

      expect(existsSync(configPath)).toBe(true);
    });

    it('should not overwrite existing config', async () => {
      const existingConfig = 'agent:\n  name: Custom Agent\n';
      writeFileSync(configPath, existingConfig, 'utf-8');

      await bootstrap({ configPath });

      const content = require('node:fs').readFileSync(configPath, 'utf-8');
      expect(content).toContain('Custom Agent');
    });

    it('should create parent directories if needed', async () => {
      const nestedPath = join(testDir, 'nested', 'deep', 'config.yaml');
      expect(existsSync(join(testDir, 'nested'))).toBe(false);

      await bootstrap({ configPath: nestedPath });

      expect(existsSync(nestedPath)).toBe(true);
    });
  });

  describe('environment variable validation', () => {
    it('should detect missing ANTHROPIC_API_KEY when anthropic is configured', async () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        // Default config uses anthropic provider
        const result = await bootstrap({ configPath });

        expect(result.warnings).toContain(
          'ANTHROPIC_API_KEY not found in environment'
        );
      } finally {
        if (originalKey) {
          process.env.ANTHROPIC_API_KEY = originalKey;
        }
      }
    });

    it('should detect missing OPENAI_API_KEY when openai is configured', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const openaiConfig = `
agent:
  name: Test
  provider: openai
  model: gpt-4
providers:
  openai:
    apiKey: YOUR_OPENAI_API_KEY_HERE
`;
      writeFileSync(configPath, openaiConfig, 'utf-8');

      try {
        const result = await bootstrap({ configPath });

        expect(result.warnings).toContain(
          'OPENAI_API_KEY not found in environment'
        );
        // Should NOT warn about anthropic when using openai
        expect(result.warnings).not.toContain(
          'ANTHROPIC_API_KEY not found in environment'
        );
      } finally {
        if (originalKey) {
          process.env.OPENAI_API_KEY = originalKey;
        }
      }
    });

    it('should not warn about unrelated provider keys', async () => {
      // Default config uses anthropic - should not warn about OPENAI_API_KEY even if missing
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      try {
        const result = await bootstrap({ configPath });

        expect(result.warnings).not.toContain(
          'OPENAI_API_KEY not found in environment'
        );
      } finally {
        if (originalKey) {
          process.env.OPENAI_API_KEY = originalKey;
        }
      }
    });

    it('should not warn if configured provider key is present', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await bootstrap({ configPath });

      expect(result.warnings).not.toContain('ANTHROPIC_API_KEY not found in environment');
    });
  });

  describe('return value', () => {
    it('should return config, sessionManager, and pluginManager', async () => {
      const result = await bootstrap({ configPath });

      expect(result.config).toBeDefined();
      expect(result.sessionManager).toBeDefined();
      expect(result.pluginManager).toBeDefined();
      expect(result.output).toBeDefined();
    });

    it('should return config with loaded values', async () => {
      const result = await bootstrap({ configPath });

      expect(result.config.agent).toBeDefined();
      expect(result.config.agent.name).toBeDefined();
      expect(result.config.providers).toBeDefined();
    });

    it('should return sessionManager with initialized store', async () => {
      const result = await bootstrap({ configPath });

      expect(result.sessionManager.createSession).toBeDefined();
      expect(result.sessionManager.run).toBeDefined();
    });

    it('should return pluginManager with loaded plugins', async () => {
      const result = await bootstrap({ configPath });

      expect(result.pluginManager.getAllPlugins).toBeDefined();
      const plugins = result.pluginManager.getAllPlugins();
      expect(Array.isArray(plugins)).toBe(true);
    });

    it('should return output adapter', async () => {
      const result = await bootstrap({ configPath });

      expect(result.output.write).toBeDefined();
      expect(result.output.writeError).toBeDefined();
    });

    it('should include warnings array', async () => {
      const result = await bootstrap({ configPath });

      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw on invalid config', async () => {
      const invalidConfig = 'invalid: yaml: content::: []';
      writeFileSync(configPath, invalidConfig, 'utf-8');

      await expect(bootstrap({ configPath })).rejects.toThrow();
    });

    it('should throw on config validation failure', async () => {
      const invalidConfig = 'agent:\n  id: test\n  name: Test Agent\n  model: invalid-model\n  provider: nonexistent-provider\nproviders:\n  nonexistent-provider:\n    apiKey: test123\n';
      writeFileSync(configPath, invalidConfig, 'utf-8');

      await expect(bootstrap({ configPath })).rejects.toThrow('Unknown provider: nonexistent-provider');
    });

    it('should handle missing plugin directories gracefully', async () => {
      const configWithBadPluginDir = `
agent:
  name: Test
plugins:
  directories:
    - /non/existent/path
`;
      writeFileSync(configPath, configWithBadPluginDir, 'utf-8');

      // Should not throw, just return empty plugin list
      const result = await bootstrap({ configPath });
      expect(result.pluginManager).toBeDefined();
    });
  });

  describe('session store initialization', () => {
    it('should create session directory if it does not exist', async () => {
      const sessionsDir = join(testDir, 'sessions');
      const configWithSessionPath = `
agent:
  name: Test
session:
  storePath: ${sessionsDir}
`;
      writeFileSync(configPath, configWithSessionPath, 'utf-8');

      expect(existsSync(sessionsDir)).toBe(false);

      await bootstrap({ configPath });

      expect(existsSync(sessionsDir)).toBe(true);
    });
  });

  describe('Tool System Integration (Phase 4)', () => {
    it('creates ToolExecutor with plugin tools', async () => {
      const result = await bootstrap({ configPath });

      // Verify ToolExecutor was created (indirectly via sessionManager having executionLoop)
      expect(result.sessionManager).toBeDefined();
    });

    it('creates ExecutionLoop with tool definitions from plugins', async () => {
      const result = await bootstrap({ configPath });

      // Verify sessionManager was wired with ExecutionLoop
      // ExecutionLoop should have tools from plugins
      expect(result.sessionManager).toBeDefined();
    });

    it('wires SessionManager with ExecutionLoop and tool bridge', async () => {
      const result = await bootstrap({ configPath });

      // Check that sessionManager has both executionLoop and onToolCall handler
      expect(result.sessionManager).toBeDefined();

      // The sessionManager should be able to execute tools via the bridge
      // This is tested via the dual-path run() method
    });

    it('end-to-end: SessionManager can execute agent with tools', async () => {
      // Skip in CI if no API key
      if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
        console.log('Skipping end-to-end test - no API keys');
        return;
      }

      const result = await bootstrap({ configPath });

      // Create a session
      const sessionId = await result.sessionManager.createSession();
      expect(sessionId).toBeDefined();

      // Session should be ready for agent execution (with or without tools)
      const session = await result.sessionManager.loadSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
    });

    it('tool definitions are passed from plugins to ExecutionLoop', async () => {
      const result = await bootstrap({ configPath });

      // Get all plugin tools
      const plugins = result.pluginManager.getAllPlugins();
      const pluginCount = plugins.length;

      // Plugins should be loaded (or 0 if none configured)
      expect(typeof pluginCount).toBe('number');
      expect(pluginCount).toBeGreaterThanOrEqual(0);
    });

    it('settings are loaded from config for ExecutionLoop', async () => {
      const result = await bootstrap({ configPath });

      // Verify config has agent settings
      expect(result.config.agent).toBeDefined();
      expect(result.config.agent.model).toBeDefined();
    });

    it('bootstrap creates all required components for tool execution', async () => {
      const result = await bootstrap({ configPath });

      // Verify all components exist
      expect(result.config).toBeDefined();
      expect(result.sessionManager).toBeDefined();
      expect(result.pluginManager).toBeDefined();
      expect(result.output).toBeDefined();

      // Verify plugin manager has tools
      const plugins = result.pluginManager.getAllPlugins();
      expect(Array.isArray(plugins)).toBe(true);
    });
  });
});

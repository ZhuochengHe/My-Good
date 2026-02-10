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
    it('should detect missing ANTHROPIC_API_KEY', async () => {
      // Save original env var
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const result = await bootstrap({ configPath });

        expect(result.warnings).toContain(
          'ANTHROPIC_API_KEY not found in environment'
        );
      } finally {
        // Restore original env var
        if (originalKey) {
          process.env.ANTHROPIC_API_KEY = originalKey;
        }
      }
    });

    it('should detect missing OPENAI_API_KEY', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const result = await bootstrap({ configPath });

        expect(result.warnings).toContain(
          'OPENAI_API_KEY not found in environment'
        );
      } finally {
        if (originalKey) {
          process.env.OPENAI_API_KEY = originalKey;
        }
      }
    });

    it('should not warn if API keys are present', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'test-key';

      const result = await bootstrap({ configPath });

      expect(result.warnings).not.toContain('ANTHROPIC_API_KEY');
      expect(result.warnings).not.toContain('OPENAI_API_KEY');
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
      const invalidConfig = 'agent:\n  maxTurns: -1\n';
      writeFileSync(configPath, invalidConfig, 'utf-8');

      await expect(bootstrap({ configPath })).rejects.toThrow();
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
});

/**
 * Integration tests for CLI.
 * Tests complete CLI workflows end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../../src/cli/index.js';

describe('CLI Integration', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `cli-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    configPath = join(testDir, 'config.yaml');

    // Set API keys for tests
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('config commands', () => {
    it('should initialize config', async () => {
      expect(existsSync(configPath)).toBe(false);

      await main(['node', 'my-agent', '--config', configPath, 'config', 'init']);

      expect(existsSync(configPath)).toBe(true);
    });

    it('should not overwrite existing config on init', async () => {
      const customConfig = 'agent:\n  name: Custom\n';
      writeFileSync(configPath, customConfig, 'utf-8');

      // Should not throw, just warn
      await main(['node', 'my-agent', '--config', configPath, 'config', 'init']);

      const content = require('node:fs').readFileSync(configPath, 'utf-8');
      expect(content).toContain('Custom');
    });
  });

  describe('plugin commands', () => {
    it('should list plugins', async () => {
      // Create config first
      await main(['node', 'my-agent', '--config', configPath, 'config', 'init']);

      // List plugins should work without error
      await expect(
        main(['node', 'my-agent', '--config', configPath, 'plugin', 'list'])
      ).resolves.not.toThrow();
    });

    it('should show plugin info for default plugins', async () => {
      await main(['node', 'my-agent', '--config', configPath, 'config', 'init']);

      // Should work for built-in plugins
      await expect(
        main([
          'node',
          'my-agent',
          '--config',
          configPath,
          'plugin',
          'info',
          'file-ops',
        ])
      ).resolves.not.toThrow();
    });
  });

  describe('session commands', () => {
    it('should list sessions (empty initially)', async () => {
      await main(['node', 'my-agent', '--config', configPath, 'config', 'init']);

      await expect(
        main(['node', 'my-agent', '--config', configPath, 'session', 'list'])
      ).resolves.not.toThrow();
    });

    it('should handle non-existent session show gracefully', async () => {
      await main(['node', 'my-agent', '--config', configPath, 'config', 'init']);

      // Should not throw, just show error message
      await expect(
        main([
          'node',
          'my-agent',
          '--config',
          configPath,
          'session',
          'show',
          'nonexistent',
        ])
      ).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle missing config gracefully', async () => {
      const nonExistentConfig = join(testDir, 'nonexistent', 'config.yaml');

      // Should auto-create config
      await expect(
        main([
          'node',
          'my-agent',
          '--config',
          nonExistentConfig,
          'config',
          'show',
        ])
      ).resolves.not.toThrow();
    });

    it('should handle invalid config gracefully', async () => {
      const invalidConfig = 'invalid: yaml: content::: []';
      writeFileSync(configPath, invalidConfig, 'utf-8');

      // Should throw or handle gracefully
      await expect(
        main(['node', 'my-agent', '--config', configPath, 'plugin', 'list'])
      ).rejects.toThrow();
    });
  });

  describe('bootstrap', () => {
    it('should auto-create config on first command', async () => {
      expect(existsSync(configPath)).toBe(false);

      await main(['node', 'my-agent', '--config', configPath, 'plugin', 'list']);

      expect(existsSync(configPath)).toBe(true);
    });

    it('should create session directory on bootstrap', async () => {
      const sessionsDir = join(testDir, 'sessions');
      const configWithSessionPath = `
agent:
  name: Test
session:
  storePath: ${sessionsDir}
`;
      writeFileSync(configPath, configWithSessionPath, 'utf-8');

      await main(['node', 'my-agent', '--config', configPath, 'plugin', 'list']);

      expect(existsSync(sessionsDir)).toBe(true);
    });
  });

  describe('command aliases', () => {
    it('should support "plugins" alias for "plugin"', async () => {
      await main(['node', 'my-agent', '--config', configPath, 'config', 'init']);

      await expect(
        main(['node', 'my-agent', '--config', configPath, 'plugins', 'list'])
      ).resolves.not.toThrow();
    });
  });

  describe('version and help', () => {
    it('should display version', async () => {
      // Commander calls process.exit for --version, which is expected
      await expect(main(['node', 'my-agent', '--version'])).rejects.toThrow(
        'process.exit'
      );
    });

    it('should display help', async () => {
      // Commander calls process.exit for --help, which is expected
      await expect(main(['node', 'my-agent', '--help'])).rejects.toThrow(
        'process.exit'
      );
    });
  });
});

/**
 * Tests for config commands.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configShow, configInit } from '../../../src/cli/commands/config.js';
import type { OutputAdapter } from '../../../src/cli/output-adapter.js';

describe('config commands', () => {
  let testDir: string;
  let configPath: string;
  let mockOutput: OutputAdapter;

  beforeEach(() => {
    testDir = join(tmpdir(), `cli-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    configPath = join(testDir, 'config.yaml');

    mockOutput = {
      write: vi.fn(),
      writeError: vi.fn(),
      writeSuccess: vi.fn(),
      writeTokenUsage: vi.fn(),
    };
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('configShow', () => {
    it('should display config contents', async () => {
      const configContent = 'agent:\n  name: Test Agent\n';
      writeFileSync(configPath, configContent, 'utf-8');

      await configShow({ configPath, output: mockOutput });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('Test Agent')
      );
    });

    it('should handle missing config file', async () => {
      await configShow({ configPath, output: mockOutput });

      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('not found')
      );
    });

    it('should display config path', async () => {
      writeFileSync(configPath, 'agent:\n  name: Test\n', 'utf-8');

      await configShow({ configPath, output: mockOutput });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining(configPath)
      );
    });

    it('should display formatted YAML', async () => {
      const config = 'agent:\n  name: My Agent\n  model: claude-sonnet-4-20250514\n';
      writeFileSync(configPath, config, 'utf-8');

      await configShow({ configPath, output: mockOutput });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');
      expect(allOutput).toContain('My Agent');
      expect(allOutput).toContain('claude-sonnet-4-20250514');
    });
  });

  describe('configInit', () => {
    it('should create default config', async () => {
      expect(existsSync(configPath)).toBe(false);

      await configInit({ configPath, output: mockOutput });

      expect(existsSync(configPath)).toBe(true);
      expect(mockOutput.writeSuccess).toHaveBeenCalledWith(
        expect.stringContaining('created')
      );
    });

    it('should not overwrite existing config', async () => {
      const existingContent = 'agent:\n  name: Existing\n';
      writeFileSync(configPath, existingContent, 'utf-8');

      await configInit({ configPath, output: mockOutput });

      const content = require('node:fs').readFileSync(configPath, 'utf-8');
      expect(content).toContain('Existing');
      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('already exists')
      );
    });

    it('should create parent directories', async () => {
      const nestedPath = join(testDir, 'nested', 'config.yaml');

      await configInit({ configPath: nestedPath, output: mockOutput });

      expect(existsSync(nestedPath)).toBe(true);
    });

    it('should create valid YAML config', async () => {
      await configInit({ configPath, output: mockOutput });

      const content = require('node:fs').readFileSync(configPath, 'utf-8');
      expect(content).toContain('agent:');
      expect(content).toContain('providers:');
      expect(content).toContain('plugins:');
    });

    it('should display config path in success message', async () => {
      await configInit({ configPath, output: mockOutput });

      expect(mockOutput.writeSuccess).toHaveBeenCalledWith(
        expect.stringContaining(configPath)
      );
    });
  });
});

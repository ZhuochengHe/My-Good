/**
 * Integration tests for file-ops plugin with PluginManager.
 *
 * The file-ops plugin is write-only: read_file and list_directory were removed
 * because shell_exec (cat/ls) is preferred for reading. Only write_file remains.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginManager } from '../../src/plugins/manager.js';
import { mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.join(__dirname, '..', '..', 'plugins', 'file-ops');

describe('file-ops plugin integration', () => {
  let manager: PluginManager;
  let testDir: string;

  beforeEach(async () => {
    manager = new PluginManager();
    testDir = join(tmpdir(), `file-ops-integration-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('plugin loading', () => {
    it('loads file-ops plugin successfully', async () => {
      const plugin = await manager.loadPlugin(pluginDir);

      expect(plugin.manifest.id).toBe('file-ops');
      expect(plugin.manifest.name).toBe('File Operations');
      expect(plugin.manifest.version).toBeDefined();
      expect(plugin.enabled).toBe(true);
    });

    it('registers only write_file tool from the plugin', async () => {
      await manager.loadPlugin(pluginDir);

      expect(manager.hasTool('write_file')).toBe(true);
      expect(manager.hasTool('read_file')).toBe(false);
      expect(manager.hasTool('list_directory')).toBe(false);
    });

    it('provides correct tool definition for write_file', async () => {
      await manager.loadPlugin(pluginDir);

      const tools = manager.getToolDefinitions();
      const writeFileTool = tools.find((t) => t.name === 'write_file');

      expect(writeFileTool).toBeDefined();
      expect(writeFileTool?.description).toContain('Write');
      expect(writeFileTool?.parameters.required).toContain('path');
      expect(writeFileTool?.parameters.required).toContain('content');
    });
  });

  describe('tool execution through plugin manager', () => {
    beforeEach(async () => {
      await manager.loadPlugin(pluginDir);
    });

    it('executes write_file handler through plugin manager', async () => {
      const handler = manager.getToolHandler('write_file');
      expect(handler).toBeDefined();

      if (handler) {
        const result = await handler(
          { path: 'output.txt', content: 'Plugin manager write test' },
          {
            sessionId: 'integration-test',
            workingDirectory: testDir,
            env: {},
          }
        );

        expect(result.output).toContain('File written');

        // Verify file was written
        const content = await readFile(join(testDir, 'output.txt'), 'utf-8');
        expect(content).toBe('Plugin manager write test');
      }
    });

    it('write_file creates parent directories automatically', async () => {
      const handler = manager.getToolHandler('write_file');
      expect(handler).toBeDefined();

      if (handler) {
        const result = await handler(
          { path: 'nested/dir/file.txt', content: 'nested content' },
          {
            sessionId: 'integration-test',
            workingDirectory: testDir,
            env: {},
          }
        );

        expect(result.output).toContain('File written');

        const content = await readFile(join(testDir, 'nested/dir/file.txt'), 'utf-8');
        expect(content).toBe('nested content');
      }
    });
  });

  describe('plugin lifecycle', () => {
    it('supports disabling and re-enabling plugin', async () => {
      await manager.loadPlugin(pluginDir);

      // Initially enabled
      expect(manager.hasTool('write_file')).toBe(true);

      // Disable plugin
      manager.disablePlugin('file-ops');
      expect(manager.hasTool('write_file')).toBe(false);

      // Re-enable plugin
      manager.enablePlugin('file-ops');
      expect(manager.hasTool('write_file')).toBe(true);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await manager.loadPlugin(pluginDir);
    });

    it('handles missing required parameters gracefully', async () => {
      const handler = manager.getToolHandler('write_file');
      expect(handler).toBeDefined();

      if (handler) {
        const result = await handler(
          { path: 'test.txt' }, // Missing 'content'
          {
            sessionId: 'error-test',
            workingDirectory: testDir,
            env: {},
          }
        );

        expect(result.output).toContain('Error');
        expect(result.output).toContain('content');
      }
    });
  });

  describe('concurrent operations', () => {
    beforeEach(async () => {
      await manager.loadPlugin(pluginDir);
    });

    it('handles multiple concurrent write operations', async () => {
      const handler = manager.getToolHandler('write_file');
      expect(handler).toBeDefined();

      if (handler) {
        const context = {
          sessionId: 'concurrent-test',
          workingDirectory: testDir,
          env: {},
        };

        const results = await Promise.all([
          handler({ path: 'output1.txt', content: 'data1' }, context),
          handler({ path: 'output2.txt', content: 'data2' }, context),
          handler({ path: 'output3.txt', content: 'data3' }, context),
        ]);

        results.forEach((result) => {
          expect(result.output).toContain('File written');
        });

        // Verify all files written
        const content1 = await readFile(join(testDir, 'output1.txt'), 'utf-8');
        const content2 = await readFile(join(testDir, 'output2.txt'), 'utf-8');
        const content3 = await readFile(join(testDir, 'output3.txt'), 'utf-8');

        expect(content1).toBe('data1');
        expect(content2).toBe('data2');
        expect(content3).toBe('data3');
      }
    });
  });
});

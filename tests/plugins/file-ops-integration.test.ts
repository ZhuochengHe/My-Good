/**
 * Integration tests for file-ops plugin with PluginManager.
 *
 * Tests plugin loading, tool registration, and execution through the plugin system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginManager } from '../../src/plugins/manager.js';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
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
      expect(plugin.manifest.version).toBe('1.0.0');
      expect(plugin.enabled).toBe(true);
    });

    it('registers all three tools from the plugin', async () => {
      await manager.loadPlugin(pluginDir);

      expect(manager.hasTool('read_file')).toBe(true);
      expect(manager.hasTool('write_file')).toBe(true);
      expect(manager.hasTool('list_directory')).toBe(true);
    });

    it('provides correct tool definitions for LLM consumption', async () => {
      await manager.loadPlugin(pluginDir);

      const tools = manager.getToolDefinitions();
      const readFileTool = tools.find((t) => t.name === 'read_file');
      const writeFileTool = tools.find((t) => t.name === 'write_file');
      const listDirTool = tools.find((t) => t.name === 'list_directory');

      expect(readFileTool).toBeDefined();
      expect(readFileTool?.description).toContain('Read');
      expect(readFileTool?.parameters.required).toContain('path');

      expect(writeFileTool).toBeDefined();
      expect(writeFileTool?.description).toContain('Write');
      expect(writeFileTool?.parameters.required).toContain('path');
      expect(writeFileTool?.parameters.required).toContain('content');

      expect(listDirTool).toBeDefined();
      expect(listDirTool?.description).toContain('List');
      expect(listDirTool?.parameters.required).toContain('path');
    });
  });

  describe('tool execution through plugin manager', () => {
    beforeEach(async () => {
      await manager.loadPlugin(pluginDir);
    });

    it('executes read_file handler through plugin manager', async () => {
      // Create test file
      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, 'Integration test content', 'utf-8');

      const handler = manager.getToolHandler('read_file');
      expect(handler).toBeDefined();

      if (handler) {
        const result = await handler(
          { path: 'test.txt' },
          {
            sessionId: 'integration-test',
            workingDirectory: testDir,
            env: {},
          }
        );

        expect(result.output).toBe('Integration test content');
      }
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

        expect(result.output).toContain('success');

        // Verify file was written
        const content = await readFile(join(testDir, 'output.txt'), 'utf-8');
        expect(content).toBe('Plugin manager write test');
      }
    });

    it('executes list_directory handler through plugin manager', async () => {
      // Create test structure
      await writeFile(join(testDir, 'file1.txt'), 'content1', 'utf-8');
      await writeFile(join(testDir, 'file2.txt'), 'content2', 'utf-8');
      await mkdir(join(testDir, 'subdir'));

      const handler = manager.getToolHandler('list_directory');
      expect(handler).toBeDefined();

      if (handler) {
        const result = await handler(
          { path: '.' },
          {
            sessionId: 'integration-test',
            workingDirectory: testDir,
            env: {},
          }
        );

        expect(result.output).toContain('file1.txt');
        expect(result.output).toContain('file2.txt');
        expect(result.output).toContain('subdir');
      }
    });
  });

  describe('plugin lifecycle', () => {
    it('supports disabling and re-enabling plugin', async () => {
      await manager.loadPlugin(pluginDir);

      // Initially enabled
      expect(manager.hasTool('read_file')).toBe(true);
      expect(manager.hasTool('write_file')).toBe(true);
      expect(manager.hasTool('list_directory')).toBe(true);

      // Disable plugin
      manager.disablePlugin('file-ops');
      expect(manager.hasTool('read_file')).toBe(false);
      expect(manager.hasTool('write_file')).toBe(false);
      expect(manager.hasTool('list_directory')).toBe(false);

      // Re-enable plugin
      manager.enablePlugin('file-ops');
      expect(manager.hasTool('read_file')).toBe(true);
      expect(manager.hasTool('write_file')).toBe(true);
      expect(manager.hasTool('list_directory')).toBe(true);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await manager.loadPlugin(pluginDir);
    });

    it('returns error output for invalid operations', async () => {
      const handler = manager.getToolHandler('read_file');
      expect(handler).toBeDefined();

      if (handler) {
        const result = await handler(
          { path: 'nonexistent.txt' },
          {
            sessionId: 'error-test',
            workingDirectory: testDir,
            env: {},
          }
        );

        expect(result.output).toContain('Error');
        expect(result.output).toContain('nonexistent.txt');
      }
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

    it('handles multiple concurrent read operations', async () => {
      // Create test files
      await writeFile(join(testDir, 'file1.txt'), 'content1', 'utf-8');
      await writeFile(join(testDir, 'file2.txt'), 'content2', 'utf-8');
      await writeFile(join(testDir, 'file3.txt'), 'content3', 'utf-8');

      const handler = manager.getToolHandler('read_file');
      expect(handler).toBeDefined();

      if (handler) {
        const context = {
          sessionId: 'concurrent-test',
          workingDirectory: testDir,
          env: {},
        };

        const results = await Promise.all([
          handler({ path: 'file1.txt' }, context),
          handler({ path: 'file2.txt' }, context),
          handler({ path: 'file3.txt' }, context),
        ]);

        expect(results[0].output).toBe('content1');
        expect(results[1].output).toBe('content2');
        expect(results[2].output).toBe('content3');
      }
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
          expect(result.output).toContain('success');
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

/**
 * Tests for plugin commands.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pluginList, pluginInfo } from '../../../src/cli/commands/plugin.js';
import type { OutputAdapter } from '../../../src/cli/output-adapter.js';
import type { PluginManager } from '../../../src/plugins/manager.js';
import type { LoadedPlugin } from '../../../src/plugins/manager.js';

describe('plugin commands', () => {
  let mockOutput: OutputAdapter;
  let mockPluginManager: PluginManager;

  beforeEach(() => {
    mockOutput = {
      write: vi.fn(),
      writeError: vi.fn(),
      writeSuccess: vi.fn(),
      writeTokenUsage: vi.fn(),
    };

    mockPluginManager = {
      getAllPlugins: vi.fn(),
      getPlugin: vi.fn(),
    } as unknown as PluginManager;
  });

  describe('pluginList', () => {
    it('should display list of plugins', async () => {
      const mockPlugins: LoadedPlugin[] = [
        {
          manifest: {
            id: 'file-ops',
            name: 'File Operations',
            version: '1.0.0',
            description: 'File system operations',
            author: 'Test',
            tools: [
              {
                name: 'read_file',
                description: 'Read a file',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            ],
          },
          enabled: true,
          path: '/plugins/file-ops',
          tools: new Map(),
        },
        {
          manifest: {
            id: 'shell',
            name: 'Shell',
            version: '1.0.0',
            description: 'Shell commands',
            author: 'Test',
            tools: [
              {
                name: 'shell_exec',
                description: 'Execute shell',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            ],
          },
          enabled: false,
          path: '/plugins/shell',
          tools: new Map(),
        },
      ];

      vi.mocked(mockPluginManager.getAllPlugins).mockReturnValue(mockPlugins);

      await pluginList({
        pluginManager: mockPluginManager,
        output: mockOutput,
      });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('file-ops')
      );
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('shell')
      );
    });

    it('should handle empty plugin list', async () => {
      vi.mocked(mockPluginManager.getAllPlugins).mockReturnValue([]);

      await pluginList({
        pluginManager: mockPluginManager,
        output: mockOutput,
      });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('No plugins')
      );
    });

    it('should display plugin status (enabled/disabled)', async () => {
      const mockPlugins: LoadedPlugin[] = [
        {
          manifest: {
            id: 'test-plugin',
            name: 'Test',
            version: '1.0.0',
            description: 'Test',
            author: 'Test',
            tools: [],
          },
          enabled: true,
          path: '/test',
          tools: new Map(),
        },
      ];

      vi.mocked(mockPluginManager.getAllPlugins).mockReturnValue(mockPlugins);

      await pluginList({
        pluginManager: mockPluginManager,
        output: mockOutput,
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');
      expect(allOutput).toContain('enabled');
    });

    it('should display tool count', async () => {
      const mockPlugins: LoadedPlugin[] = [
        {
          manifest: {
            id: 'test',
            name: 'Test',
            version: '1.0.0',
            description: 'Test',
            author: 'Test',
            tools: [
              {
                name: 'tool1',
                description: 'Tool 1',
                parameters: { type: 'object', properties: {}, required: [] },
              },
              {
                name: 'tool2',
                description: 'Tool 2',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            ],
          },
          enabled: true,
          path: '/test',
          tools: new Map(),
        },
      ];

      vi.mocked(mockPluginManager.getAllPlugins).mockReturnValue(mockPlugins);

      await pluginList({
        pluginManager: mockPluginManager,
        output: mockOutput,
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');
      expect(allOutput).toContain('2');
    });
  });

  describe('pluginInfo', () => {
    it('should display plugin details', async () => {
      const mockPlugin: LoadedPlugin = {
        manifest: {
          id: 'file-ops',
          name: 'File Operations',
          version: '1.0.0',
          description: 'Provides file system operations',
          author: 'Test Author',
          tools: [
            {
              name: 'read_file',
              description: 'Read file contents',
              parameters: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: 'File path' },
                },
                required: ['path'],
              },
            },
          ],
        },
        enabled: true,
        path: '/plugins/file-ops',
        tools: new Map(),
      };

      vi.mocked(mockPluginManager.getPlugin).mockReturnValue(mockPlugin);

      await pluginInfo({
        pluginManager: mockPluginManager,
        output: mockOutput,
        pluginId: 'file-ops',
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');

      expect(allOutput).toContain('file-ops');
      expect(allOutput).toContain('File Operations');
      expect(allOutput).toContain('Provides file system operations');
      expect(allOutput).toContain('read_file');
    });

    it('should handle non-existent plugin', async () => {
      vi.mocked(mockPluginManager.getPlugin).mockReturnValue(undefined);

      await pluginInfo({
        pluginManager: mockPluginManager,
        output: mockOutput,
        pluginId: 'nonexistent',
      });

      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('not found')
      );
    });

    it('should display tool parameters', async () => {
      const mockPlugin: LoadedPlugin = {
        manifest: {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          author: 'Test',
          tools: [
            {
              name: 'test_tool',
              description: 'Test tool',
              parameters: {
                type: 'object',
                properties: {
                  param1: { type: 'string', description: 'Parameter 1' },
                  param2: { type: 'number', description: 'Parameter 2' },
                },
                required: ['param1'],
              },
            },
          ],
        },
        enabled: true,
        path: '/test',
        tools: new Map(),
      };

      vi.mocked(mockPluginManager.getPlugin).mockReturnValue(mockPlugin);

      await pluginInfo({
        pluginManager: mockPluginManager,
        output: mockOutput,
        pluginId: 'test',
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');

      expect(allOutput).toContain('param1');
      expect(allOutput).toContain('param2');
      expect(allOutput).toContain('required');
    });

    it('should display plugin path', async () => {
      const mockPlugin: LoadedPlugin = {
        manifest: {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          author: 'Test',
          tools: [],
        },
        enabled: true,
        path: '/custom/plugin/path',
        tools: new Map(),
      };

      vi.mocked(mockPluginManager.getPlugin).mockReturnValue(mockPlugin);

      await pluginInfo({
        pluginManager: mockPluginManager,
        output: mockOutput,
        pluginId: 'test',
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');
      expect(allOutput).toContain('/custom/plugin/path');
    });
  });
});

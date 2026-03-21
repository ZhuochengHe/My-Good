/**
 * Tests for plugin manager.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager } from '../../src/plugins/manager.js';
import {
  PluginLoadError,
  ManifestValidationError,
  GatesCheckError,
  ToolNotFoundError,
} from '../../src/errors/plugin.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'fixtures', 'plugins');

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('constructor', () => {
    it('creates empty plugin manager', () => {
      expect(manager.getAllPlugins()).toEqual([]);
    });
  });

  describe('loadPlugin', () => {
    it('loads valid plugin successfully', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      const plugin = await manager.loadPlugin(pluginPath);

      expect(plugin.manifest.id).toBe('test-plugin');
      expect(plugin.manifest.name).toBe('Test Plugin');
      expect(plugin.manifest.tools).toHaveLength(1);
      expect(plugin.enabled).toBe(true);
      expect(plugin.path).toBe(pluginPath);
    });

    it('loads plugin handlers', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      const plugin = await manager.loadPlugin(pluginPath);

      expect(plugin.tools.has('test_tool')).toBe(true);
      const handler = plugin.tools.get('test_tool');
      expect(typeof handler).toBe('function');
    });

    it('throws PluginLoadError for non-existent plugin', async () => {
      const pluginPath = path.join(fixturesDir, 'non-existent');

      await expect(manager.loadPlugin(pluginPath)).rejects.toThrow(
        PluginLoadError
      );
    });

    it('throws ManifestValidationError for invalid manifest', async () => {
      const pluginPath = path.join(fixturesDir, 'invalid-manifest');

      await expect(manager.loadPlugin(pluginPath)).rejects.toThrow(
        ManifestValidationError
      );
    });

    it('loads plugin with gates when gates pass', async () => {
      const pluginPath = path.join(fixturesDir, 'plugin-with-gates');
      const plugin = await manager.loadPlugin(pluginPath);

      expect(plugin.manifest.id).toBe('gates-plugin');
      expect(plugin.enabled).toBe(true);
    });
  });

  describe('loadFromDirectory', () => {
    it('loads all valid plugins from directory', async () => {
      const results = await manager.loadFromDirectory(fixturesDir);

      expect(results.loaded.length).toBeGreaterThan(0);
      expect(results.loaded.some((id) => id === 'test-plugin')).toBe(true);
    });

    it('reports failed plugins', async () => {
      const results = await manager.loadFromDirectory(fixturesDir);

      expect(results.failed.length).toBeGreaterThan(0);
      expect(
        results.failed.some((f) => f.path.includes('invalid-manifest'))
      ).toBe(true);
    });

    it('handles empty directory', async () => {
      const emptyDir = path.join(fixturesDir, 'non-existent');
      const results = await manager.loadFromDirectory(emptyDir);

      expect(results.loaded).toEqual([]);
      expect(results.failed).toEqual([]);
    });

    it('skips non-directory entries', async () => {
      // Create a file in fixtures dir to ensure it's skipped
      const results = await manager.loadFromDirectory(fixturesDir);

      // Should only load directories with plugin.json
      expect(results.loaded.length).toBeGreaterThan(0);
    });
  });

  describe('getPlugin', () => {
    it('returns plugin by ID', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      const plugin = manager.getPlugin('test-plugin');

      expect(plugin).toBeDefined();
      expect(plugin?.manifest.id).toBe('test-plugin');
    });

    it('returns undefined for non-existent plugin', () => {
      const plugin = manager.getPlugin('non-existent');

      expect(plugin).toBeUndefined();
    });
  });

  describe('getAllPlugins', () => {
    it('returns all loaded plugins', async () => {
      const pluginPath1 = path.join(fixturesDir, 'valid-plugin');
      const pluginPath2 = path.join(fixturesDir, 'plugin-with-gates');

      await manager.loadPlugin(pluginPath1);
      await manager.loadPlugin(pluginPath2);

      const plugins = manager.getAllPlugins();

      expect(plugins.length).toBe(2);
      expect(plugins.some((p) => p.manifest.id === 'test-plugin')).toBe(true);
      expect(plugins.some((p) => p.manifest.id === 'gates-plugin')).toBe(true);
    });

    it('returns empty array when no plugins loaded', () => {
      const plugins = manager.getAllPlugins();

      expect(plugins).toEqual([]);
    });
  });

  describe('getToolDefinitions', () => {
    it('returns all tool definitions from all plugins', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      const tools = manager.getToolDefinitions();

      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('test_tool');
      expect(tools[0].description).toBe('A simple test tool');
    });

    it('includes tools from multiple plugins', async () => {
      const pluginPath1 = path.join(fixturesDir, 'valid-plugin');
      const pluginPath2 = path.join(fixturesDir, 'plugin-with-gates');

      await manager.loadPlugin(pluginPath1);
      await manager.loadPlugin(pluginPath2);

      const tools = manager.getToolDefinitions();

      expect(tools.length).toBe(2);
    });

    it('excludes disabled plugins', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      manager.disablePlugin('test-plugin');
      const tools = manager.getToolDefinitions();

      expect(tools.length).toBe(0);
    });

    it('returns empty array when no plugins loaded', () => {
      const tools = manager.getToolDefinitions();

      expect(tools).toEqual([]);
    });
  });

  describe('getToolHandler', () => {
    it('returns handler for existing tool', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      const handler = manager.getToolHandler('test_tool');

      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('returns undefined for non-existent tool', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      const handler = manager.getToolHandler('non_existent');

      expect(handler).toBeUndefined();
    });

    it('returns undefined for tool from disabled plugin', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      manager.disablePlugin('test-plugin');
      const handler = manager.getToolHandler('test_tool');

      expect(handler).toBeUndefined();
    });
  });

  describe('hasTool', () => {
    it('returns true for existing tool', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      expect(manager.hasTool('test_tool')).toBe(true);
    });

    it('returns false for non-existent tool', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      expect(manager.hasTool('non_existent')).toBe(false);
    });

    it('returns false for tool from disabled plugin', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      manager.disablePlugin('test-plugin');

      expect(manager.hasTool('test_tool')).toBe(false);
    });
  });

  describe('enablePlugin', () => {
    it('enables disabled plugin', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      manager.disablePlugin('test-plugin');
      expect(manager.getPlugin('test-plugin')?.enabled).toBe(false);

      manager.enablePlugin('test-plugin');
      expect(manager.getPlugin('test-plugin')?.enabled).toBe(true);
    });

    it('throws error for non-existent plugin', () => {
      expect(() => manager.enablePlugin('non-existent')).toThrow(
        'Plugin not found: non-existent'
      );
    });

    it('is idempotent for already enabled plugin', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      manager.enablePlugin('test-plugin');
      expect(manager.getPlugin('test-plugin')?.enabled).toBe(true);
    });
  });

  describe('disablePlugin', () => {
    it('disables enabled plugin', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      expect(manager.getPlugin('test-plugin')?.enabled).toBe(true);

      manager.disablePlugin('test-plugin');
      expect(manager.getPlugin('test-plugin')?.enabled).toBe(false);
    });

    it('throws error for non-existent plugin', () => {
      expect(() => manager.disablePlugin('non-existent')).toThrow(
        'Plugin not found: non-existent'
      );
    });

    it('is idempotent for already disabled plugin', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      manager.disablePlugin('test-plugin');
      manager.disablePlugin('test-plugin');
      expect(manager.getPlugin('test-plugin')?.enabled).toBe(false);
    });
  });

  describe('isToolDangerous', () => {
    it('returns true for a tool with dangerous: true in manifest', async () => {
      const pluginPath = path.join(fixturesDir, 'dangerous-plugin');
      await manager.loadPlugin(pluginPath);

      expect(manager.isToolDangerous('dangerous_op')).toBe(true);
    });

    it('returns false for a tool without dangerous field', async () => {
      const pluginPath = path.join(fixturesDir, 'dangerous-plugin');
      await manager.loadPlugin(pluginPath);

      expect(manager.isToolDangerous('safe_op')).toBe(false);
    });

    it('returns false for a tool from an unrelated plugin that has no dangerous field', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      expect(manager.isToolDangerous('test_tool')).toBe(false);
    });

    it('returns false for a non-existent tool name', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      expect(manager.isToolDangerous('no_such_tool')).toBe(false);
    });

    it('returns false when no plugins are loaded', () => {
      expect(manager.isToolDangerous('dangerous_op')).toBe(false);
    });

    it('returns false for a dangerous tool from a disabled plugin', async () => {
      const pluginPath = path.join(fixturesDir, 'dangerous-plugin');
      await manager.loadPlugin(pluginPath);

      manager.disablePlugin('dangerous-plugin');

      expect(manager.isToolDangerous('dangerous_op')).toBe(false);
    });
  });

  describe('duplicate plugins', () => {
    it('throws error when loading plugin with duplicate ID', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      await expect(manager.loadPlugin(pluginPath)).rejects.toThrow(
        PluginLoadError
      );
    });
  });
});

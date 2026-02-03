/**
 * Integration tests for complete plugin system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager } from '../../src/plugins/manager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'fixtures', 'plugins');

describe('Plugin System Integration', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('end-to-end plugin loading', () => {
    it('loads plugins, gets tools, and executes handlers', async () => {
      // Load plugins from directory
      const result = await manager.loadFromDirectory(fixturesDir);

      expect(result.loaded.length).toBeGreaterThan(0);
      expect(result.loaded).toContain('test-plugin');

      // Get all tool definitions
      const tools = manager.getToolDefinitions();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some((t) => t.name === 'test_tool')).toBe(true);

      // Get specific tool handler
      const handler = manager.getToolHandler('test_tool');
      expect(handler).toBeDefined();

      // Execute tool handler
      if (handler) {
        const result = await handler(
          { message: 'Hello, World!' },
          {
            sessionId: 'test-session',
            workingDirectory: process.cwd(),
            env: process.env as Record<string, string>,
          }
        );

        expect(result.output).toBe('Echo: Hello, World!');
      }
    });

    it('handles plugin enable/disable workflow', async () => {
      await manager.loadFromDirectory(fixturesDir);

      // Initially enabled
      expect(manager.hasTool('test_tool')).toBe(true);
      expect(manager.getToolDefinitions().some((t) => t.name === 'test_tool')).toBe(true);

      // Disable plugin
      manager.disablePlugin('test-plugin');
      expect(manager.hasTool('test_tool')).toBe(false);
      expect(manager.getToolDefinitions().some((t) => t.name === 'test_tool')).toBe(false);

      // Re-enable plugin
      manager.enablePlugin('test-plugin');
      expect(manager.hasTool('test_tool')).toBe(true);
      expect(manager.getToolDefinitions().some((t) => t.name === 'test_tool')).toBe(true);
    });

    it('separates tools from different plugins', async () => {
      await manager.loadFromDirectory(fixturesDir);

      const allPlugins = manager.getAllPlugins();
      const enabledPlugins = allPlugins.filter((p) => p.enabled);

      expect(enabledPlugins.length).toBeGreaterThan(1);

      // Each plugin should have its own tools
      for (const plugin of enabledPlugins) {
        for (const toolManifest of plugin.manifest.tools) {
          expect(manager.hasTool(toolManifest.name)).toBe(true);
        }
      }
    });

    it('provides tool definitions compatible with LLM providers', async () => {
      await manager.loadFromDirectory(fixturesDir);

      const tools = manager.getToolDefinitions();

      for (const tool of tools) {
        // Verify structure matches ToolDefinition interface
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe('object');
        expect(tool.parameters.properties).toBeDefined();
        expect(Array.isArray(tool.parameters.required)).toBe(true);
      }
    });
  });

  describe('error handling', () => {
    it('continues loading valid plugins after encountering invalid ones', async () => {
      const result = await manager.loadFromDirectory(fixturesDir);

      // Should load at least one valid plugin
      expect(result.loaded.length).toBeGreaterThan(0);

      // Should report at least one failed plugin (invalid-manifest)
      expect(result.failed.length).toBeGreaterThan(0);

      // Valid plugins should still be accessible
      expect(manager.hasTool('test_tool')).toBe(true);
    });

    it('provides detailed error information for failed plugins', async () => {
      const result = await manager.loadFromDirectory(fixturesDir);

      const invalidManifestError = result.failed.find((f) =>
        f.path.includes('invalid-manifest')
      );

      expect(invalidManifestError).toBeDefined();
      expect(invalidManifestError?.error).toBeInstanceOf(Error);
      expect(invalidManifestError?.error.message).toBeDefined();
    });
  });

  describe('plugin metadata', () => {
    it('preserves plugin metadata after loading', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      const plugin = await manager.loadPlugin(pluginPath);

      expect(plugin.manifest.id).toBe('test-plugin');
      expect(plugin.manifest.name).toBe('Test Plugin');
      expect(plugin.manifest.version).toBe('1.0.0');
      expect(plugin.manifest.description).toBe('A test plugin for unit testing');
      expect(plugin.manifest.author).toBe('Test Author');
    });

    it('tracks plugin paths', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      const plugin = await manager.loadPlugin(pluginPath);

      expect(plugin.path).toBe(pluginPath);
    });
  });

  describe('tool handler context', () => {
    it('passes context to tool handlers', async () => {
      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager.loadPlugin(pluginPath);

      const handler = manager.getToolHandler('test_tool');
      expect(handler).toBeDefined();

      if (handler) {
        const context = {
          sessionId: 'integration-test',
          workingDirectory: '/test/dir',
          env: { TEST_ENV: 'value' },
        };

        const result = await handler({ message: 'test' }, context);
        expect(result.output).toBeDefined();
      }
    });
  });

  describe('multiple plugin instances', () => {
    it('supports multiple plugin manager instances', async () => {
      const manager1 = new PluginManager();
      const manager2 = new PluginManager();

      const pluginPath = path.join(fixturesDir, 'valid-plugin');
      await manager1.loadPlugin(pluginPath);
      await manager2.loadPlugin(pluginPath);

      expect(manager1.hasTool('test_tool')).toBe(true);
      expect(manager2.hasTool('test_tool')).toBe(true);

      // Disabling in one shouldn't affect the other
      manager1.disablePlugin('test-plugin');
      expect(manager1.hasTool('test_tool')).toBe(false);
      expect(manager2.hasTool('test_tool')).toBe(true);
    });
  });
});

/**
 * Plugin manager for discovering, loading, and managing plugins.
 */

import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import type { Plugin, PluginManifest, IPluginManager } from '../types/plugins.js';
import type { ToolDefinition, ToolHandler } from '../types/tools.js';
import {
  PluginLoadError,
  ManifestValidationError,
  GatesCheckError,
} from '../errors/plugin.js';
import { validateManifest, type ValidatedPluginManifest } from './manifest-schema.js';
import { checkGates } from './gates-checker.js';

/**
 * Result of loading plugins from a directory.
 */
export interface LoadDirectoryResult {
  readonly loaded: readonly string[];
  readonly failed: ReadonlyArray<{
    readonly path: string;
    readonly error: Error;
  }>;
}

/**
 * Internal plugin state (mutable for enable/disable).
 */
interface PluginState {
  manifest: ValidatedPluginManifest;
  tools: Map<string, ToolHandler>;
  path: string;
  enabled: boolean;
}

/**
 * Plugin manager implementation.
 */
export class PluginManager implements IPluginManager {
  private readonly plugins: Map<string, PluginState> = new Map();

  /**
   * Load a single plugin from a directory.
   *
   * @param pluginPath - Absolute path to plugin directory
   * @returns Loaded plugin
   * @throws {PluginLoadError} If plugin cannot be loaded
   * @throws {ManifestValidationError} If manifest is invalid
   * @throws {GatesCheckError} If gates check fails
   */
  async loadPlugin(pluginPath: string): Promise<Plugin> {
    // Check if plugin already loaded
    const manifestPath = path.join(pluginPath, 'plugin.json');

    // Read and parse manifest
    let manifestData: unknown;
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      manifestData = JSON.parse(manifestContent);
    } catch (error) {
      throw new PluginLoadError(
        pluginPath,
        'Failed to read or parse manifest',
        error instanceof Error ? error : undefined
      );
    }

    // Validate manifest
    const validationResult = validateManifest(manifestData);
    if (!validationResult.valid) {
      throw new ManifestValidationError(
        String((manifestData as any)?.id || 'unknown'),
        validationResult.errors
      );
    }

    const manifest = validationResult.manifest;

    // Check if plugin ID already exists
    if (this.plugins.has(manifest.id)) {
      throw new PluginLoadError(
        pluginPath,
        `Plugin with ID ${manifest.id} already loaded`
      );
    }

    // Check gates
    const gatesResult = checkGates(manifest.gates);
    if (!gatesResult.passed) {
      throw new GatesCheckError(manifest.id, gatesResult.errors.join(', '), {
        errors: gatesResult.errors,
      });
    }

    // Load tool handlers
    const tools = new Map<string, ToolHandler>();
    const handlerFiles = new Set(manifest.tools.map((t) => t.handler));

    for (const handlerFile of handlerFiles) {
      const handlerPath = path.join(pluginPath, handlerFile);
      const handlerUrl = pathToFileURL(handlerPath).href;

      try {
        const handlerModule = await import(handlerUrl);

        // Map each tool to its handler function
        for (const tool of manifest.tools) {
          if (tool.handler === handlerFile) {
            const handlerFn = handlerModule[tool.name];
            if (typeof handlerFn !== 'function') {
              throw new PluginLoadError(
                pluginPath,
                `Handler function ${tool.name} not found in ${handlerFile}`
              );
            }
            tools.set(tool.name, handlerFn);
          }
        }
      } catch (error) {
        throw new PluginLoadError(
          pluginPath,
          `Failed to load handler ${handlerFile}`,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Store plugin state
    const pluginState: PluginState = {
      manifest,
      tools,
      path: pluginPath,
      enabled: true,
    };

    this.plugins.set(manifest.id, pluginState);

    return this.stateToPlugin(pluginState);
  }

  /**
   * Load all plugins from a directory.
   *
   * @param directory - Directory containing plugin subdirectories
   * @returns Result with loaded and failed plugin IDs
   */
  async loadFromDirectory(directory: string): Promise<LoadDirectoryResult> {
    const loaded: string[] = [];
    const failed: Array<{ path: string; error: Error }> = [];

    // Read directory entries
    let entries: string[];
    try {
      entries = await fs.readdir(directory);
    } catch {
      // Directory doesn't exist or can't be read
      return { loaded: [], failed: [] };
    }

    // Try to load each subdirectory as a plugin
    for (const entry of entries) {
      const pluginPath = path.join(directory, entry);

      try {
        // Check if entry is a directory
        const stat = await fs.stat(pluginPath);
        if (!stat.isDirectory()) {
          continue;
        }

        // Check if plugin.json exists
        const manifestPath = path.join(pluginPath, 'plugin.json');
        try {
          await fs.access(manifestPath);
        } catch {
          // No plugin.json, skip this directory
          continue;
        }

        // Try to load the plugin
        const plugin = await this.loadPlugin(pluginPath);
        loaded.push(plugin.manifest.id);
      } catch (error) {
        failed.push({
          path: pluginPath,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    return { loaded, failed };
  }

  /**
   * Get a plugin by ID.
   *
   * @param id - Plugin ID
   * @returns Plugin or undefined if not found
   */
  getPlugin(id: string): Plugin | undefined {
    const state = this.plugins.get(id);
    return state ? this.stateToPlugin(state) : undefined;
  }

  /**
   * Get all loaded plugins.
   *
   * @returns Array of all plugins
   */
  getAllPlugins(): readonly Plugin[] {
    return Array.from(this.plugins.values()).map((state) =>
      this.stateToPlugin(state)
    );
  }

  /**
   * Get all tool definitions from enabled plugins.
   *
   * @returns Array of tool definitions
   */
  getToolDefinitions(): readonly ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const state of this.plugins.values()) {
      if (!state.enabled) {
        continue;
      }

      for (const toolManifest of state.manifest.tools) {
        tools.push({
          name: toolManifest.name,
          description: toolManifest.description,
          parameters: toolManifest.parameters,
        });
      }
    }

    return tools;
  }

  /**
   * Get a tool handler by name from enabled plugins.
   *
   * @param name - Tool name
   * @returns Tool handler or undefined if not found
   */
  getToolHandler(name: string): ToolHandler | undefined {
    for (const state of this.plugins.values()) {
      if (!state.enabled) {
        continue;
      }

      const handler = state.tools.get(name);
      if (handler) {
        return handler;
      }
    }

    return undefined;
  }

  /**
   * Check if a tool exists in enabled plugins.
   *
   * @param name - Tool name
   * @returns True if tool exists
   */
  hasTool(name: string): boolean {
    return this.getToolHandler(name) !== undefined;
  }

  /**
   * Enable a plugin.
   *
   * @param id - Plugin ID
   * @throws {Error} If plugin not found
   */
  enablePlugin(id: string): void {
    const state = this.plugins.get(id);
    if (!state) {
      throw new Error(`Plugin not found: ${id}`);
    }
    state.enabled = true;
  }

  /**
   * Disable a plugin.
   *
   * @param id - Plugin ID
   * @throws {Error} If plugin not found
   */
  disablePlugin(id: string): void {
    const state = this.plugins.get(id);
    if (!state) {
      throw new Error(`Plugin not found: ${id}`);
    }
    state.enabled = false;
  }

  /**
   * Convert internal plugin state to public Plugin interface.
   */
  private stateToPlugin(state: PluginState): Plugin {
    return {
      manifest: state.manifest as PluginManifest,
      tools: new Map(state.tools),
      path: state.path,
      enabled: state.enabled,
    };
  }
}

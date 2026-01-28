/**
 * Plugin type definitions for the extensibility system.
 */

import type { ToolDefinition, ToolHandler } from './tools.js';

/** Individual tool within a plugin manifest */
export interface ToolManifest {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolDefinition['parameters'];
  readonly handler: string;
  readonly dangerous?: boolean;
  readonly timeout?: number;
}

/** Conditional loading requirements */
export interface PluginGates {
  readonly requiredBinaries?: readonly string[];
  readonly requiredEnv?: Record<string, string | '*'>;
  readonly platforms?: readonly ('linux' | 'darwin' | 'win32')[];
}

/** Plugin manifest (plugin.json) */
export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly author?: string;
  readonly tools: readonly ToolManifest[];
  readonly gates?: PluginGates;
}

/** Loaded plugin instance */
export interface Plugin {
  readonly manifest: PluginManifest;
  readonly tools: Map<string, ToolHandler>;
  readonly path: string;
  readonly enabled: boolean;
}

/** Plugin manager interface */
export interface PluginManager {
  /**
   * Discover and load all plugins from configured directories.
   */
  loadAll(): Promise<void>;

  /**
   * Get a specific plugin by ID.
   */
  getPlugin(id: string): Plugin | undefined;

  /**
   * Get all loaded plugins.
   */
  getAllPlugins(): readonly Plugin[];

  /**
   * Get all tool definitions from all plugins.
   */
  getToolDefinitions(): readonly ToolDefinition[];

  /**
   * Get a tool handler by name.
   */
  getToolHandler(name: string): ToolHandler | undefined;

  /**
   * Check if a tool exists.
   */
  hasTool(name: string): boolean;

  /**
   * Enable a plugin.
   */
  enablePlugin(id: string): void;

  /**
   * Disable a plugin.
   */
  disablePlugin(id: string): void;
}

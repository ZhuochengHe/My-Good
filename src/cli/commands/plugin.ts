/**
 * Plugin commands for CLI.
 * Handles plugin list and info operations.
 */

import type { PluginManager } from '../../plugins/manager.js';
import type { OutputAdapter } from '../output-adapter.js';

/**
 * Plugin list command options.
 */
export interface PluginListOptions {
  /** Plugin manager */
  readonly pluginManager: PluginManager;
  /** Output adapter */
  readonly output: OutputAdapter;
}

/**
 * Plugin info command options.
 */
export interface PluginInfoOptions {
  /** Plugin manager */
  readonly pluginManager: PluginManager;
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Plugin ID to show */
  readonly pluginId: string;
}

/**
 * List all plugins.
 * Displays plugin IDs, names, descriptions, and tool counts.
 *
 * @param options - Command options
 *
 * @example
 * await pluginList({ pluginManager, output });
 */
export function pluginList(options: PluginListOptions): void {
  const plugins = options.pluginManager.getAllPlugins();

  if (plugins.length === 0) {
    options.output.write('No plugins loaded.');
    return;
  }

  options.output.write(`\nLoaded ${plugins.length} plugin(s):\n`);

  for (const plugin of plugins) {
    const status = plugin.enabled ? 'enabled' : 'disabled';
    const toolCount = plugin.manifest.tools.length;

    options.output.write(`\nID: ${plugin.manifest.id}`);
    options.output.write(`Name: ${plugin.manifest.name}`);
    options.output.write(`Version: ${plugin.manifest.version}`);
    options.output.write(`Description: ${plugin.manifest.description}`);
    options.output.write(`Status: ${status}`);
    options.output.write(`Tools: ${toolCount}`);
  }

  options.output.write('');
}

/**
 * Show plugin details.
 * Displays full plugin manifest and tool information.
 *
 * @param options - Command options
 *
 * @example
 * await pluginInfo({ pluginManager, output, pluginId: 'file-ops' });
 */
export function pluginInfo(options: PluginInfoOptions): void {
  const plugin = options.pluginManager.getPlugin(options.pluginId);

  if (!plugin) {
    options.output.writeError(`Plugin not found: ${options.pluginId}`);
    return;
  }

  // Display plugin header
  options.output.write(`\nPlugin: ${plugin.manifest.name}\n`);
  options.output.write('---');

  // Display metadata
  options.output.write(`ID: ${plugin.manifest.id}`);
  options.output.write(`Version: ${plugin.manifest.version}`);
  options.output.write(`Author: ${plugin.manifest.author}`);
  options.output.write(`Description: ${plugin.manifest.description}`);
  options.output.write(`Path: ${plugin.path}`);
  options.output.write(`Status: ${plugin.enabled ? 'enabled' : 'disabled'}`);

  // Display tools
  options.output.write(`\nTools (${plugin.manifest.tools.length}):`);

  for (const tool of plugin.manifest.tools) {
    options.output.write(`\n  ${tool.name}`);
    options.output.write(`  Description: ${tool.description}`);

    // Display parameters
    const params = tool.parameters;
    if (params.properties && Object.keys(params.properties).length > 0) {
      options.output.write('  Parameters:');

      for (const [paramName, paramSchema] of Object.entries(
        params.properties
      )) {
        const isRequired = params.required?.includes(paramName) ?? false;
        const requiredMark = isRequired ? ' (required)' : '';
        const description =
          (paramSchema as { description?: string }).description ?? '';

        options.output.write(
          `    - ${paramName}${requiredMark}: ${description}`
        );
      }
    }
  }

  options.output.write('\n---\n');
}

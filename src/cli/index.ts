#!/usr/bin/env node
/**
 * CLI entry point.
 * Handles command parsing and routing using Commander.js.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Command } from 'commander';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bootstrap } from './bootstrap.js';
import { configShow, configInit } from './commands/config.js';
import {
  sessionList,
  sessionShow,
  sessionDelete,
} from './commands/session.js';
import { pluginList, pluginInfo } from './commands/plugin.js';
import { chat } from './commands/chat.js';
import { runSetup } from './commands/setup.js';
import { settingsShow, settingsGet, settingsSet, settingsReset } from './commands/settings.js';
import { updateModels } from './commands/model.js';
import { StdinInputReader } from './stdin-input-reader.js';
import { promptPassword, promptLine } from './password-input.js';
import { ColoredOutput } from './colored-output.js';

/**
 * Main CLI function.
 * Parses arguments and executes commands.
 *
 * @param argv - Command line arguments
 */
export async function main(argv: string[]): Promise<void> {
  const program = new Command();

  // Default config path
  const defaultConfigPath = join(homedir(), '.my-agent', 'config.yaml');

  program
    .name('my-agent')
    .description('AI agent with tool execution')
    .version('0.1.0')
    .option(
      '-c, --config <path>',
      'Path to config file',
      defaultConfigPath
    );

  // Setup command
  program
    .command('setup')
    .description('Interactive setup - configure provider, API key, and model')
    .action(async () => {
      const opts = program.opts();
      const configPath = opts['config'];
      const output = new ColoredOutput();

      const result = await runSetup({
        configPath,
        output,
        prompt: promptLine,
        promptPassword,
      });

      if (result.success) {
        output.writeSuccess(result.message);
      } else {
        output.writeError(result.message);
        process.exit(1);
      }
    });

  // Settings command
  const settingsCmd = program
    .command('settings')
    .description('Manage agent behavior settings');

  settingsCmd
    .command('show')
    .description('Show all settings')
    .action(async () => {
      const output = new ColoredOutput();
      await settingsShow({ output });
    });

  settingsCmd
    .command('get <key>')
    .description('Get a specific setting value')
    .action(async (key: string) => {
      const output = new ColoredOutput();
      await settingsGet({ output, key });
    });

  settingsCmd
    .command('set <key> <value>')
    .description('Set a setting value')
    .action(async (key: string, value: string) => {
      const output = new ColoredOutput();
      await settingsSet({ output, key, value });
    });

  settingsCmd
    .command('reset')
    .description('Reset settings to defaults')
    .action(async () => {
      const output = new ColoredOutput();
      await settingsReset({ output });
    });

  // Config commands (legacy, kept for compatibility)
  const configCmd = program.command('config').description('Manage configuration');

  configCmd
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      const opts = program.opts();
      const configPath = opts['config'];
      const { output } = await bootstrap({ configPath });
      await configShow({ configPath, output });
    });

  configCmd
    .command('init')
    .description('Initialize default configuration')
    .action(async () => {
      const opts = program.opts();
      const configPath = opts['config'];
      const { output } = await bootstrap({ configPath });
      await configInit({ configPath, output });
    });

  // Session commands
  const sessionCmd = program
    .command('session')
    .description('Manage sessions');

  sessionCmd
    .command('list')
    .description('List all sessions')
    .option('-t, --tag <tag>', 'Filter by tag')
    .option('-q, --query <query>', 'Filter by query string')
    .action(async (cmdOptions: { tag?: string; query?: string }) => {
      const opts = program.opts();
      const configPath = opts['config'];
      const { sessionManager, output } = await bootstrap({ configPath });
      await sessionList({
        sessionManager,
        output,
        ...(cmdOptions.tag && { tag: cmdOptions.tag }),
        ...(cmdOptions.query && { query: cmdOptions.query }),
      });
    });

  sessionCmd
    .command('show <sessionId>')
    .description('Show session details')
    .action(async (sessionId: string) => {
      const opts = program.opts();
      const configPath = opts['config'];
      const { sessionManager, output } = await bootstrap({ configPath });
      await sessionShow({ sessionManager, output, sessionId });
    });

  sessionCmd
    .command('delete <sessionId>')
    .description('Delete a session')
    .action(async (sessionId: string) => {
      const opts = program.opts();
      const configPath = opts['config'];
      const { sessionManager, output } = await bootstrap({ configPath });
      await sessionDelete({ sessionManager, output, sessionId });
    });

  // Plugin commands
  const pluginCmd = program
    .command('plugin')
    .alias('plugins')
    .description('Manage plugins');

  pluginCmd
    .command('list')
    .description('List all loaded plugins')
    .action(async () => {
      const opts = program.opts();
      const configPath = opts['config'];
      const { pluginManager, output } = await bootstrap({ configPath });
      pluginList({ pluginManager, output });
    });

  pluginCmd
    .command('info <pluginId>')
    .description('Show plugin details')
    .action(async (pluginId: string) => {
      const opts = program.opts();
      const configPath = opts['config'];
      const { pluginManager, output } = await bootstrap({ configPath });
      pluginInfo({ pluginManager, output, pluginId });
    });

  // Model command
  const modelCmd = program
    .command('model')
    .description('Manage available models');

  modelCmd
    .command('update')
    .description('Update the list of available models from providers')
    .action(() => {
      const opts = program.opts();
      const configPath = opts['config'];
      const output = new ColoredOutput();

      try {
        updateModels({ configPath, output });
        output.writeSuccess('Model list updated successfully');
      } catch (error) {
        output.writeError(`Failed to update models: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // Chat command
  program
    .command('chat')
    .description('Start interactive chat')
    .option('-s, --session <sessionId>', 'Resume existing session')
    .option('-m, --message <text>', 'Send single message (non-interactive)')
    .action(async (cmdOptions: { session?: string; message?: string }) => {
      const opts = program.opts();
      const configPath = opts['config'];
      const { sessionManager, output, config, warnings, memoryEntryCount } = await bootstrap({
        configPath,
      });

      // Display warnings
      if (warnings.length > 0) {
        for (const warning of warnings) {
          output.writeError(`Warning: ${warning}`);
        }
        output.write('');
      }

      const input = new StdinInputReader();
      await chat({
        sessionManager,
        output,
        input,
        config,
        memoryEntryCount,
        ...(cmdOptions.session && { sessionId: cmdOptions.session }),
        ...(cmdOptions.message && { message: cmdOptions.message }),
      });
    });

  // Parse arguments
  await program.parseAsync(argv);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

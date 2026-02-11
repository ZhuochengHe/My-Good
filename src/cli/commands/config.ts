/**
 * Config commands for CLI.
 * Handles config show and init operations.
 */

import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { stringify } from 'yaml';
import { getDefaultConfig } from '../../config/defaults.js';
import { CredentialDetector } from '../../security/credential-detector.js';
import type { OutputAdapter } from '../output-adapter.js';

/**
 * Config command options.
 */
export interface ConfigCommandOptions {
  /** Path to config file */
  readonly configPath: string;
  /** Output adapter */
  readonly output: OutputAdapter;
}

/**
 * Show current configuration.
 * Displays the contents of the config file.
 *
 * @param options - Command options
 *
 * @example
 * await configShow({ configPath: './config.yaml', output });
 */
export async function configShow(options: ConfigCommandOptions): Promise<void> {
  try {
    // Check if config exists
    await access(options.configPath);

    // Read config file
    const content = await readFile(options.configPath, 'utf-8');

    // Sanitize credentials before displaying
    const sanitizedContent = CredentialDetector.detectAndRedact(content);

    // Display config path and contents
    options.output.write(`\nConfiguration (${options.configPath}):\n`);
    options.output.write('---');
    options.output.write(sanitizedContent.trimEnd());
    options.output.write('---\n');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      options.output.writeError(
        `Config file not found: ${options.configPath}\nRun 'config init' to create one.`
      );
    } else {
      options.output.writeError(
        `Failed to read config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Initialize default configuration.
 * Creates a new config file with default values.
 *
 * @param options - Command options
 *
 * @example
 * await configInit({ configPath: './config.yaml', output });
 */
export async function configInit(options: ConfigCommandOptions): Promise<void> {
  try {
    // Check if config already exists
    try {
      await access(options.configPath);
      options.output.writeError(
        `Config file already exists: ${options.configPath}\nUse 'config show' to view it.`
      );
      return;
    } catch {
      // File doesn't exist, continue with creation
    }

    // Get default config
    const defaultConfig = getDefaultConfig();
    const yaml = stringify(defaultConfig);

    // Ensure parent directory exists
    const parentDir = dirname(options.configPath);
    await mkdir(parentDir, { recursive: true });

    // Write config file
    await writeFile(options.configPath, yaml, 'utf-8');

    options.output.writeSuccess(
      `Config file created: ${options.configPath}\nEdit this file to customize your agent.`
    );
  } catch (error) {
    options.output.writeError(
      `Failed to create config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

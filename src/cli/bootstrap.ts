/**
 * CLI bootstrap.
 * Handles configuration loading, auto-creation, and dependency wiring.
 */

import { mkdir, access, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { stringify } from 'yaml';
import { loadConfig } from '../config/loader.js';
import { getDefaultConfig } from '../config/defaults.js';
import type { AppConfig } from '../types/config.js';
import { JsonlSessionStore } from '../session/jsonl-store.js';
import { SessionManager } from '../session/session-manager.js';
import { PluginManager } from '../plugins/manager.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import { OpenAIProvider } from '../providers/openai.js';
import type { ModelProvider } from '../types/providers.js';
import { PlainTextOutput } from './plain-text-output.js';
import type { OutputAdapter } from './output-adapter.js';

/**
 * Bootstrap options.
 */
export interface BootstrapOptions {
  /** Path to config file */
  readonly configPath: string;
}

/**
 * Bootstrap result.
 */
export interface BootstrapResult {
  /** Loaded configuration */
  readonly config: AppConfig;
  /** Session manager */
  readonly sessionManager: SessionManager;
  /** Plugin manager */
  readonly pluginManager: PluginManager;
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Warnings during bootstrap */
  readonly warnings: readonly string[];
}

/**
 * Bootstrap the CLI application.
 * Creates default config if needed, loads plugins, initializes session store.
 *
 * @param options - Bootstrap options
 * @returns Bootstrap result with initialized components
 * @throws {Error} If config is invalid or required components fail to initialize
 *
 * @example
 * const result = await bootstrap({ configPath: './config.yaml' });
 * console.log('Loaded', result.pluginManager.getAllPlugins().length, 'plugins');
 */
export async function bootstrap(
  options: BootstrapOptions
): Promise<BootstrapResult> {
  const warnings: string[] = [];

  // Step 1: Auto-create config if it doesn't exist
  await ensureConfigExists(options.configPath);

  // Step 2: Load configuration
  const config = await loadConfig(options.configPath);

  // Step 3: Check for API keys in environment
  checkApiKeys(warnings);

  // Step 4: Initialize session store and create directory
  const sessionStore = new JsonlSessionStore(config.session.storePath);
  await ensureDirectoryExists(config.session.storePath);

  // Step 5: Initialize provider based on config
  const provider = createProvider(config);

  // Step 6: Initialize session manager
  const sessionManager = new SessionManager(sessionStore, provider, {
    model: config.agent.model,
    agentId: config.agent.id,
  });

  // Step 7: Initialize plugin manager and load plugins
  const pluginManager = new PluginManager();
  for (const directory of config.plugins.directories) {
    try {
      await pluginManager.loadFromDirectory(directory);
    } catch (error) {
      // Gracefully handle missing plugin directories
      warnings.push(`Failed to load plugins from ${directory}`);
    }
  }

  // Step 8: Create output adapter
  const output = new PlainTextOutput();

  return {
    config,
    sessionManager,
    pluginManager,
    output,
    warnings,
  };
}

/**
 * Ensure config file exists, creating default if needed.
 *
 * @param configPath - Path to config file
 */
async function ensureConfigExists(configPath: string): Promise<void> {
  try {
    await access(configPath);
    // File exists, nothing to do
  } catch {
    // File doesn't exist, create it with defaults
    const defaultConfig = getDefaultConfig();
    const yaml = stringify(defaultConfig);

    // Ensure parent directory exists
    const parentDir = dirname(configPath);
    await mkdir(parentDir, { recursive: true });

    // Write default config
    await writeFile(configPath, yaml, 'utf-8');
  }
}

/**
 * Ensure directory exists, creating if needed.
 *
 * @param dirPath - Directory path
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Check for required API keys in environment and add warnings.
 *
 * @param warnings - Warnings array to populate
 */
function checkApiKeys(warnings: string[]): void {
  if (!process.env['ANTHROPIC_API_KEY']) {
    warnings.push('ANTHROPIC_API_KEY not found in environment');
  }

  if (!process.env['OPENAI_API_KEY']) {
    warnings.push('OPENAI_API_KEY not found in environment');
  }
}

/**
 * Create provider based on configuration.
 *
 * @param config - Application configuration
 * @returns Model provider instance
 */
function createProvider(config: AppConfig): ModelProvider {
  const providerType = config.agent.provider;

  if (providerType === 'anthropic') {
    return new AnthropicProvider(
      config.providers.anthropic.apiKey,
      config.providers.anthropic.timeout,
      config.providers.anthropic.maxRetries,
      config.providers.anthropic.baseUrl
    );
  } else if (providerType === 'openai') {
    return new OpenAIProvider(
      config.providers.openai.apiKey,
      config.providers.openai.timeout,
      config.providers.openai.maxRetries,
      config.providers.openai.baseUrl
    );
  } else {
    throw new Error(`Unknown provider type: ${String(providerType)}`);
  }
}

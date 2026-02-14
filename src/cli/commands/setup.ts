/**
 * Interactive setup command for CLI.
 * Guides users through provider selection, API key entry, and model selection.
 */

import { access, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';
import type { OutputAdapter } from '../output-adapter.js';
import type { ProviderManifest, ModelInfo } from '../../types/providers.js';
import { loadRegistry } from '../../providers/registry.js';
import type { AppConfig } from '../../types/config.js';
import { saveSettings } from '../../config/settings-loader.js';
import { DEFAULT_SETTINGS } from '../../types/settings.js';

/**
 * Setup command options.
 */
export interface SetupCommandOptions {
  /** Path to config file */
  readonly configPath: string;
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Input reader function */
  readonly prompt: (text: string) => Promise<string>;
  /** Password input function (for API keys) */
  readonly promptPassword: (text: string) => Promise<string>;
}

/**
 * Setup result.
 */
export interface SetupResult {
  readonly success: boolean;
  readonly message: string;
}

/**
 * Check if config file exists.
 */
async function configExists(configPath: string): Promise<boolean> {
  try {
    await access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load and validate registry.
 */
function getAvailableProviders(): ProviderManifest[] {
  const registry = loadRegistry();
  return Object.values(registry.providers);
}

/**
 * Prompt user to select a provider.
 */
async function selectProvider(
  providers: ProviderManifest[],
  prompt: (text: string) => Promise<string>,
  output: OutputAdapter
): Promise<ProviderManifest | null> {
  output.write('\nAvailable providers:\n');
  providers.forEach((p, i) => {
    output.write(`  ${i + 1}. ${p.name}`);
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await prompt('\nSelect provider (number) or "q" to quit: ');

    if (input.toLowerCase() === 'q') {
      return null;
    }

    const index = parseInt(input, 10) - 1;
    if (index >= 0 && index < providers.length) {
      return providers[index] ?? null;
    }

    output.writeError('Invalid selection. Please enter a valid number.');
  }
}

/**
 * Get API key from environment or prompt user.
 */
async function getApiKey(
  provider: ProviderManifest,
  promptPassword: (text: string) => Promise<string>,
  output: OutputAdapter
): Promise<string | null> {
  // Check environment variables first
  for (const envVar of provider.envVars) {
    const envValue = process.env[envVar];
    if (envValue) {
      output.writeSuccess(`Using ${envVar} from environment`);
      return envValue;
    }
  }

  // Prompt for API key
  const envVarName = provider.envVars[0] || 'API_KEY';
  output.write(`\n${provider.name} requires an API key.`);
  output.write(`You can also set ${envVarName} environment variable.`);

  const apiKey = await promptPassword(`Enter ${provider.name} API key (or "back" to choose different provider): `);

  if (apiKey.toLowerCase() === 'back') {
    return null;
  }

  if (!apiKey.trim()) {
    output.writeError('API key cannot be empty.');
    return null;
  }

  return apiKey.trim();
}

/**
 * Fetch available models dynamically from the provider API.
 * Returns models and whether the API key is valid.
 */
async function fetchAvailableModels(
  provider: ProviderManifest,
  apiKey: string,
  output: OutputAdapter
): Promise<{ models: ModelInfo[]; valid: boolean }> {
  try {
    output.write('Testing API key and fetching available models...');

    if (provider.sdk === 'anthropic') {
      // Anthropic doesn't have a models.list() API
      // Just test the key with a simple API call
      const { AnthropicProvider } = await import('../../providers/anthropic.js');
      const testProvider = new AnthropicProvider(
        apiKey,
        60000,
        3,
        provider.baseUrl,
        provider.models,
        provider.healthCheckModel,
        provider.id
      );

      await testProvider.listModels();
      output.writeSuccess('API key valid! Using models from registry');
      return { models: provider.models.slice(), valid: true };
    } else if (provider.sdk === 'openai') {
      // Fetch models dynamically from OpenAI-compatible API
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({
        apiKey,
        baseURL: provider.baseUrl,
        timeout: 10000,
      });

      const response = await client.models.list();
      const models: ModelInfo[] = [];

      for await (const model of response) {
        models.push({
          id: model.id,
          name: model.id,
          contextWindow: 128000, // Default
          supportsToolCalling: true,
          supportsStreaming: true,
        });
      }

      if (models.length > 0) {
        output.writeSuccess(`API key valid! Found ${models.length} available models`);
        return { models, valid: true };
      } else {
        output.write('No models returned, using registry defaults');
        return { models: provider.models.slice(), valid: true };
      }
    }

    return { models: [], valid: false };
  } catch (error) {
    output.writeError(`API key test failed: ${error instanceof Error ? error.message : String(error)}`);
    return { models: [], valid: false };
  }
}

/**
 * Prompt user to select a model.
 */
async function selectModel(
  models: readonly ModelInfo[],
  prompt: (text: string) => Promise<string>,
  output: OutputAdapter
): Promise<ModelInfo | null> {
  output.write('\nAvailable models:\n');

  // Sort models by context window (largest first)
  const sortedModels = [...models].sort((a, b) => b.contextWindow - a.contextWindow);

  sortedModels.forEach((m, i) => {
    const features: string[] = [];
    if (m.supportsToolCalling) features.push('tools');
    if (m.supportsStreaming) features.push('streaming');
    const featuresStr = features.length > 0 ? ` (${features.join(', ')})` : '';

    output.write(`  ${i + 1}. ${m.name}${featuresStr}`);
    output.write(`     Context: ${(m.contextWindow / 1000).toFixed(0)}K, Max tokens: ${m.maxOutputTokens || 'unknown'}`);
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await prompt('\nSelect model (number) or "back" to choose different provider: ');

    if (input.toLowerCase() === 'back') {
      return null;
    }

    const index = parseInt(input, 10) - 1;
    if (index >= 0 && index < sortedModels.length) {
      return sortedModels[index] ?? null;
    }

    output.writeError('Invalid selection. Please enter a valid number.');
  }
}

/**
 * Save configuration to file.
 */
async function saveConfig(
  configPath: string,
  provider: ProviderManifest,
  apiKey: string,
  model: ModelInfo
): Promise<void> {
  const config: AppConfig = {
    agent: {
      id: 'default',
      name: 'My Agent',
      model: model.id,
      provider: provider.id,
    },
    providers: {
      [provider.id]: {
        apiKey,
        ...(provider.baseUrl && { baseUrl: provider.baseUrl }),
      },
    },
    plugins: {
      directories: ['./plugins'],
      enabled: [],
      disabled: [],
    },
    session: {
      storePath: './.sessions',
      maxMessages: 100,
      idleTimeoutMinutes: 30,
    },
    logging: {
      level: 'info',
      format: 'pretty',
    },
  };

  // Ensure parent directory exists
  const parentDir = dirname(configPath);
  await mkdir(parentDir, { recursive: true });

  // Write config file
  const yaml = stringify(config, {
    indent: 2,
    sortMapEntries: true,
  });
  await writeFile(configPath, yaml, 'utf-8');

  // Also create default settings file if it doesn't exist
  const settingsPath = join(dirname(configPath), 'settings.yaml');
  try {
    await access(settingsPath);
  } catch {
    // Settings file doesn't exist, create it
    await saveSettings(DEFAULT_SETTINGS, settingsPath);
  }
}

/**
 * Run interactive setup.
 * Guides user through provider selection, API key entry, and model selection.
 *
 * @param options - Command options
 * @returns Setup result
 *
 * @example
 * await runSetup({
 *   configPath: '~/.my-agent/config.yaml',
 *   output,
 *   prompt: async (text) => reader.prompt(text),
 *   promptPassword: async (text) => reader.promptPassword(text),
 * });
 */
export async function runSetup(options: SetupCommandOptions): Promise<SetupResult> {
  const { configPath, output, prompt, promptPassword } = options;

  // Check if config already exists
  const exists = await configExists(configPath);
  if (exists) {
    const overwrite = await prompt(
      `Config already exists at ${configPath}. Overwrite? (y/N): `
    );
    if (overwrite.toLowerCase() !== 'y') {
      return { success: false, message: 'Setup cancelled.' };
    }
  }

  output.write('\n=== My Agent Setup ===\n');
  output.write('This will configure your AI agent.\n');

  // Get available providers
  let providers: ProviderManifest[];
  try {
    providers = getAvailableProviders();
  } catch (error) {
    return {
      success: false,
      message: `Failed to load provider registry: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (providers.length === 0) {
    return { success: false, message: 'No providers available in registry.' };
  }

  // Provider selection loop
  let selectedProvider: ProviderManifest | null = null;
  let apiKey: string | null = null;
  let selectedModel: ModelInfo | null = null;

  while (!selectedModel) {
    // Select provider
    selectedProvider = await selectProvider(providers, prompt, output);
    if (!selectedProvider) {
      return { success: false, message: 'Setup cancelled.' };
    }

    output.write(`\nSelected: ${selectedProvider.name}`);

    // Get API key
    apiKey = await getApiKey(selectedProvider, promptPassword, output);
    if (!apiKey) {
      // User chose to go back
      selectedProvider = null;
      continue;
    }

    // Test API key and fetch available models
    output.write('\n');
    const { models, valid } = await fetchAvailableModels(selectedProvider, apiKey, output);

    if (!valid) {
      const retry = await prompt('\nTry again? (Y/n): ');
      if (retry.toLowerCase() === 'n') {
        return { success: false, message: 'Setup cancelled.' };
      }
      apiKey = null;
      continue;
    }

    // Select model from fetched models
    selectedModel = await selectModel(models, prompt, output);
    if (!selectedModel) {
      // User chose to go back
      apiKey = null;
      continue;
    }
  }

  // At this point, all values are guaranteed to be non-null due to the while loop condition
  if (!selectedProvider || !apiKey || !selectedModel) {
    return { success: false, message: 'Setup incomplete.' };
  }

  // Save configuration
  try {
    await saveConfig(configPath, selectedProvider, apiKey, selectedModel);
  } catch (error) {
    return {
      success: false,
      message: `Failed to save config: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    success: true,
    message: `Configuration saved to ${configPath}\n\nRun 'my-agent chat' to start chatting with ${selectedModel.name}.`,
  };
}

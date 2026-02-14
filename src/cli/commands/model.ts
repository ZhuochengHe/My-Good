/**
 * Model management commands.
 */

import { writeFileSync } from 'node:fs';
import { loadRegistry } from '../../providers/registry.js';
import type { OutputAdapter } from '../output-adapter.js';

/** Options for update models command */
export interface UpdateModelsOptions {
  /** Path to config file */
  readonly configPath: string;
  /** Output adapter */
  readonly output: OutputAdapter;
}

/**
 * Update the list of available models from providers.
 * This fetches the latest models from each provider and updates the providers.json file.
 *
 * @param options - Update models options
 * @throws {Error} If update fails
 */
export function updateModels(options: UpdateModelsOptions): void {
  const { output } = options;

  output.write('Updating model list from providers...');

  try {
    // Load current registry
    const registry = loadRegistry();

    // For each provider, update their models
    let totalModels = 0;
    const updatedProviders = { ...registry.providers };

    for (const [providerId, provider] of Object.entries(registry.providers)) {
      output.write(`Fetching models for ${provider.name}...`);

      try {
        // Get updated models for this provider
        const models = fetchModelsForProvider(providerId, output);

        if (models.length > 0) {
          updatedProviders[providerId] = {
            ...provider,
            models,
          };
          totalModels += models.length;
          output.write(`  Found ${models.length} models`);
        } else {
          output.write(`  No models found, keeping existing models`);
        }
      } catch (error) {
        output.write(`  Warning: Failed to fetch models for ${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
        output.write(`  Keeping existing models for ${provider.name}`);
      }
    }

    // Save updated registry
    const updatedRegistry = {
      ...registry,
      providers: updatedProviders,
      lastUpdated: new Date().toISOString(),
    };

    const registryPath = new URL('../../providers.json', import.meta.url).pathname;
    writeFileSync(registryPath, JSON.stringify(updatedRegistry, null, 2), 'utf-8');

    output.write(`\nModel update complete. Total models: ${totalModels}`);
  } catch (error) {
    throw new Error(`Failed to update models: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fetch models for a specific provider.
 * This is a placeholder implementation that returns hardcoded models.
 * In a real implementation, this would fetch from the provider's API.
 *
 * @param providerId - Provider ID
 * @param output - Output adapter
 * @returns Array of models
 */
function fetchModelsForProvider(
  providerId: string,
  output: OutputAdapter
): Array<{ id: string; name: string; contextWindow: number; supportsStreaming: boolean; supportsTools: boolean }> {
  // For now, return hardcoded models for known providers
  // In the future, this could fetch from provider APIs
  switch (providerId) {
    case 'anthropic':
      return [
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          contextWindow: 200000,
          supportsStreaming: true,
          supportsTools: true,
        },
        {
          id: 'claude-3-opus-20240229',
          name: 'Claude 3 Opus',
          contextWindow: 200000,
          supportsStreaming: true,
          supportsTools: true,
        },
        {
          id: 'claude-3-haiku-20240307',
          name: 'Claude 3 Haiku',
          contextWindow: 200000,
          supportsStreaming: true,
          supportsTools: true,
        },
        {
          id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          contextWindow: 200000,
          supportsStreaming: true,
          supportsTools: true,
        },
      ];

    case 'openai':
      return [
        {
          id: 'gpt-4o',
          name: 'GPT-4o',
          contextWindow: 128000,
          supportsStreaming: true,
          supportsTools: true,
        },
        {
          id: 'gpt-4o-mini',
          name: 'GPT-4o Mini',
          contextWindow: 128000,
          supportsStreaming: true,
          supportsTools: true,
        },
        {
          id: 'gpt-4-turbo',
          name: 'GPT-4 Turbo',
          contextWindow: 128000,
          supportsStreaming: true,
          supportsTools: true,
        },
      ];

    case 'kimi':
      return [
        {
          id: 'kimi-latest',
          name: 'Kimi Latest',
          contextWindow: 200000,
          supportsStreaming: true,
          supportsTools: true,
        },
      ];

    default:
      output.write(`  Unknown provider: ${providerId}`);
      return [];
  }
}
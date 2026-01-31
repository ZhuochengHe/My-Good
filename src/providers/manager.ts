/**
 * Provider manager for routing requests to appropriate providers.
 *
 * Manages provider lifecycle:
 * - Lazy initialization (providers created on first use)
 * - Instance caching (same instance returned for multiple calls)
 * - Configuration validation
 */

import type {
  ModelProvider,
  ProviderConfig,
  ProviderType,
} from '../types/providers.js';
import { InvalidRequestError } from '../errors/provider.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

/**
 * Provider manager that handles provider instantiation and routing.
 */
export class ProviderManager {
  private readonly configs: Partial<Record<ProviderType, ProviderConfig>>;
  private readonly providers: Partial<Record<ProviderType, ModelProvider>> = {};

  constructor(configs: Partial<Record<ProviderType, ProviderConfig>>) {
    this.configs = configs;
  }

  /**
   * Get provider instance for the specified type.
   *
   * Lazily creates provider on first access and caches the instance.
   *
   * @param type Provider type
   * @returns Provider instance
   * @throws InvalidRequestError if provider not configured
   */
  getProvider(type: ProviderType): ModelProvider {
    // Check if already cached
    const cached = this.providers[type];
    if (cached) {
      return cached;
    }

    // Check if configured
    const config = this.configs[type];
    if (!config) {
      throw new InvalidRequestError(
        `Provider ${type} is not configured. Please add ${type} configuration to your config file.`
      );
    }

    // Create and cache provider
    const provider = this.createProvider(config);
    this.providers[type] = provider;

    return provider;
  }

  /**
   * Create provider instance from configuration.
   *
   * @param config Provider configuration
   * @returns Provider instance
   */
  private createProvider(config: ProviderConfig): ModelProvider {
    switch (config.type) {
      case 'anthropic':
        return new AnthropicProvider(
          config.apiKey,
          config.timeout,
          config.maxRetries,
          config.baseUrl
        );
      case 'openai':
        return new OpenAIProvider(
          config.apiKey,
          config.timeout,
          config.maxRetries,
          config.baseUrl
        );
      default: {
        // TypeScript should prevent this, but handle at runtime
        const unknownType = (config as { type: string }).type;
        throw new InvalidRequestError(`Unknown provider type: ${unknownType}`);
      }
    }
  }
}

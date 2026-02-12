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
import { getProvider as getProviderManifest } from './registry.js';

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

    // Create and cache provider (pass provider ID explicitly)
    const provider = this.createProvider(type, config);
    this.providers[type] = provider;

    return provider;
  }

  /**
   * Create provider instance from configuration.
   *
   * Uses provider registry to determine SDK type and configuration.
   *
   * @param providerId Provider ID (e.g., 'anthropic', 'kimi', 'openai')
   * @param config Provider configuration
   * @returns Provider instance
   */
  private createProvider(providerId: string, config: ProviderConfig): ModelProvider {
    // Get provider manifest from registry
    const manifest = getProviderManifest(providerId);

    if (!manifest) {
      throw new InvalidRequestError(
        `Unknown provider type: ${providerId}. Provider not found in registry.`
      );
    }

    // Use baseUrl from config if provided, otherwise use manifest default
    const baseUrl = config.baseUrl ?? manifest.baseUrl;

    // Create provider based on SDK type
    switch (manifest.sdk) {
      case 'anthropic':
        return new AnthropicProvider(
          config.apiKey,
          config.timeout,
          config.maxRetries,
          baseUrl,
          manifest.models,
          manifest.healthCheckModel,
          providerId // Pass provider ID as type
        );
      case 'openai':
        return new OpenAIProvider(
          config.apiKey,
          config.timeout,
          config.maxRetries,
          baseUrl,
          manifest.models,
          manifest.healthCheckModel,
          providerId // Pass provider ID as type
        );
      default: {
        // Exhaustiveness check - TypeScript ensures this is unreachable
        const _exhaustive: never = manifest.sdk;
        void _exhaustive; // Consume the variable
        throw new InvalidRequestError(
          `Unsupported SDK type for provider ${providerId}`
        );
      }
    }
  }
}

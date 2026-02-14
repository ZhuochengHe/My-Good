/**
 * Provider registry loader and utilities.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ProviderRegistry,
  ProviderManifest,
} from '../types/providers.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REGISTRY_PATH = join(__dirname, '../../providers.json');

let cachedRegistry: ProviderRegistry | null = null;

/**
 * Load provider registry from providers.json.
 *
 * @returns The provider registry
 * @throws Error if registry file is missing or invalid
 */
export function loadProviderRegistry(): ProviderRegistry {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(
      `Provider registry file not found at: ${REGISTRY_PATH}`
    );
  }

  try {
    const content = readFileSync(REGISTRY_PATH, 'utf-8');
    const registry = JSON.parse(content) as ProviderRegistry;

    // Validate registry structure
    if (!registry.version || !registry.providers) {
      throw new Error(
        'Invalid provider registry: missing version or providers field'
      );
    }

    cachedRegistry = registry;
    return registry;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse provider registry: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Get provider manifest by ID.
 *
 * @param providerId - The provider ID
 * @returns The provider manifest, or null if not found
 */
export function getProvider(providerId: string): ProviderManifest | null {
  const registry = loadProviderRegistry();
  return registry.providers[providerId] ?? null;
}

/**
 * List all available providers.
 *
 * @returns Array of provider manifests, sorted alphabetically by ID
 */
export function listProviders(): readonly ProviderManifest[] {
  const registry = loadProviderRegistry();
  return Object.values(registry.providers).sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}

/**
 * Validate that a provider ID exists in the registry.
 *
 * @param providerId - The provider ID to validate
 * @returns True if provider exists, false otherwise
 */
export function validateProvider(providerId: string): boolean {
  if (!providerId) {
    return false;
  }
  return getProvider(providerId) !== null;
}

/**
 * Clear cached registry (useful for testing).
 */
export function clearCache(): void {
  cachedRegistry = null;
}

/**
 * Alias for loadProviderRegistry for convenience.
 */
export { loadProviderRegistry as loadRegistry };

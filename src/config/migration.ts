/**
 * Configuration migration utilities.
 * Provides automatic migration from old config format to new format.
 */

/**
 * Detects if config uses old format (has 'type' field in provider configs).
 *
 * Old format includes redundant 'type' field:
 * {
 *   providers: {
 *     anthropic: { type: 'anthropic', apiKey: '...' }
 *   }
 * }
 *
 * New format omits 'type' field:
 * {
 *   providers: {
 *     anthropic: { apiKey: '...' }
 *   }
 * }
 *
 * @param config - Configuration object to check
 * @returns True if config uses old format, false otherwise
 *
 * @example
 * isOldFormat({ providers: { anthropic: { type: 'anthropic', apiKey: 'xxx' }}})
 * // Returns: true
 */
export function isOldFormat(config: unknown): boolean {
  // Handle null/undefined
  if (!config || typeof config !== 'object') {
    return false;
  }

  const cfg = config as Record<string, unknown>;

  // Check if providers field exists
  if (!cfg['providers'] || typeof cfg['providers'] !== 'object') {
    return false;
  }

  // Check if any provider has a 'type' field
  const providers = cfg['providers'] as Record<string, unknown>;
  for (const providerId of Object.keys(providers)) {
    const providerConfig = providers[providerId];
    if (providerConfig && typeof providerConfig === 'object' && 'type' in providerConfig) {
      return true;
    }
  }

  return false;
}

/**
 * Migrates old config format to new format.
 * Removes redundant 'type' field from provider configurations.
 * Returns a new object (does not mutate input).
 *
 * Transformation:
 * - Removes 'type' field from each provider config
 * - Preserves all other fields (apiKey, baseUrl, timeout, etc.)
 * - Preserves top-level config structure
 *
 * @param config - Configuration object to migrate
 * @returns Migrated configuration object (new instance)
 *
 * @example
 * const old = {
 *   providers: {
 *     anthropic: { type: 'anthropic', apiKey: 'xxx' }
 *   }
 * };
 * const migrated = migrateConfig(old);
 * // Returns: { providers: { anthropic: { apiKey: 'xxx' }}}
 */
export function migrateConfig(config: unknown): unknown {
  // Handle null/undefined
  if (config === null || config === undefined) {
    return config;
  }

  // If not an object, return as-is
  if (typeof config !== 'object') {
    return config;
  }

  // Deep clone to avoid mutation
  const migrated = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

  // If no providers field, return as-is
  if (!migrated['providers'] || typeof migrated['providers'] !== 'object') {
    return migrated;
  }

  // Remove 'type' field from each provider
  const providers = migrated['providers'] as Record<string, unknown>;
  for (const providerId of Object.keys(providers)) {
    const providerConfig = providers[providerId];
    if (providerConfig && typeof providerConfig === 'object' && 'type' in providerConfig) {
      const cfg = providerConfig as Record<string, unknown>;
      delete cfg['type'];
    }
  }

  return migrated;
}

/**
 * Configuration loader with YAML parsing, environment variable substitution,
 * and Zod validation.
 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { AppConfig } from '../types/config.js';
import { getDefaultConfig } from './defaults.js';

/**
 * Represents a validation issue with path and message.
 */
export interface ValidationIssue {
  readonly path: readonly string[];
  readonly message: string;
}

/**
 * Error thrown when configuration validation fails.
 * Contains detailed information about what went wrong.
 */
export class ConfigValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    const formattedIssues = issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    const fullMessage = issues.length > 0
      ? `${message}\n${formattedIssues}`
      : message;

    super(fullMessage);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

/** Zod schema for LogLevel */
const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug']);

/** Zod schema for LogFormat */
const logFormatSchema = z.enum(['json', 'pretty']);

/** Zod schema for ProviderType */
const providerTypeSchema = z.enum(['anthropic', 'openai']);

/** Zod schema for tools configuration */
const toolsConfigSchema = z.object({
  allow: z.array(z.string()).readonly(),
  deny: z.array(z.string()).readonly(),
  requireApproval: z.array(z.string()).readonly(),
});

/** Zod schema for AgentConfig */
const agentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  systemPrompt: z.string(),
  model: z.string(),
  provider: providerTypeSchema,
  maxTurns: z.number().int().positive(),
  maxTokensPerTurn: z.number().int().positive(),
  tools: toolsConfigSchema,
});

/** Zod schema for ProviderConfig */
const providerConfigSchema = z.object({
  type: providerTypeSchema,
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  defaultModel: z.string(),
  timeout: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
});

/** Zod schema for PluginsConfig */
const pluginsConfigSchema = z.object({
  directories: z.array(z.string()).readonly(),
  enabled: z.array(z.string()).readonly(),
  disabled: z.array(z.string()).readonly(),
});

/** Zod schema for SessionConfig */
const sessionConfigSchema = z.object({
  storePath: z.string(),
  maxMessages: z.number().int().positive(),
  idleTimeoutMinutes: z.number().int().positive(),
});

/** Zod schema for LoggingConfig */
const loggingConfigSchema = z.object({
  level: logLevelSchema,
  format: logFormatSchema,
  file: z.string().optional(),
});

/** Zod schema for the complete AppConfig */
const appConfigSchema = z.object({
  agent: agentConfigSchema,
  providers: z.object({
    anthropic: providerConfigSchema,
    openai: providerConfigSchema,
  }),
  plugins: pluginsConfigSchema,
  session: sessionConfigSchema,
  logging: loggingConfigSchema,
});

/**
 * Substitutes environment variables in a string.
 * Supports ${VAR_NAME} syntax and ${VAR_NAME:-default} for defaults.
 *
 * @param content - String content with potential env var references
 * @returns String with environment variables substituted
 *
 * @example
 * // With TEST_VAR="hello"
 * substituteEnvVars("key: ${TEST_VAR}") // Returns "key: hello"
 *
 * @example
 * // With missing variable
 * substituteEnvVars("key: ${MISSING:-default}") // Returns "key: default"
 */
export function substituteEnvVars(content: string): string {
  // Pattern matches ${VAR_NAME} or ${VAR_NAME:-default_value}
  const envVarPattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

  return content.replace(envVarPattern, (_match, varName: string, defaultValue?: string) => {
    const envValue = process.env[varName];

    if (envValue !== undefined) {
      return envValue;
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    return '';
  });
}

/**
 * Validation result type - either success with data or failure with error.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ConfigValidationError };

/**
 * Validates a configuration object against the schema.
 *
 * @param config - Configuration object to validate
 * @returns Validation result with either validated data or error
 *
 * @example
 * const result = validateConfig(myConfig);
 * if (result.success) {
 *   console.log(result.data.agent.name);
 * } else {
 *   console.error(result.error.message);
 * }
 */
export function validateConfig(config: unknown): ValidationResult<AppConfig> {
  const result = appConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data as AppConfig };
  }

  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }));

  return {
    success: false,
    error: new ConfigValidationError('Configuration validation failed', issues),
  };
}

/**
 * Deep merges two objects, with source values overriding target values.
 * Arrays are replaced, not merged.
 *
 * @param target - Base object
 * @param source - Object with overriding values
 * @returns Merged object
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Loads and parses configuration from a YAML string.
 * Substitutes environment variables and merges with defaults.
 *
 * @param yamlContent - YAML string content to parse
 * @returns Validated AppConfig object
 * @throws {ConfigValidationError} If validation fails
 *
 * @example
 * const config = loadConfigFromString(`
 * agent:
 *   name: My Custom Agent
 * `);
 */
export function loadConfigFromString(yamlContent: string): AppConfig {
  // Substitute environment variables first
  const substitutedContent = substituteEnvVars(yamlContent);

  // Parse YAML (returns null for empty content)
  let parsed: unknown;
  try {
    parsed = parseYaml(substitutedContent);
  } catch (error) {
    throw new ConfigValidationError(
      `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
      []
    );
  }

  // Handle empty or null content
  if (parsed === null || parsed === undefined) {
    return getDefaultConfig();
  }

  // Merge with defaults
  const defaults = getDefaultConfig();
  const merged = deepMerge(
    defaults as unknown as Record<string, unknown>,
    parsed as Record<string, unknown>
  );

  // Validate the merged configuration
  const result = validateConfig(merged);

  if (!result.success) {
    throw result.error;
  }

  return result.data;
}

/**
 * Loads configuration from a file path.
 * Supports .yaml and .yml extensions.
 *
 * @param filePath - Path to the YAML configuration file
 * @returns Promise resolving to validated AppConfig
 * @throws {Error} If file cannot be read
 * @throws {ConfigValidationError} If validation fails
 *
 * @example
 * const config = await loadConfig('./config.yaml');
 * console.log(config.agent.name);
 */
export async function loadConfig(filePath: string): Promise<AppConfig> {
  const content = await readFile(filePath, 'utf-8');
  return loadConfigFromString(content);
}

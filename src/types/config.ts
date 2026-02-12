/**
 * Configuration type definitions.
 */

import type { AgentConfig } from './agent.js';
import type { ProviderConfig } from './providers.js';

/** Plugin configuration */
export interface PluginsConfig {
  readonly directories: readonly string[];
  readonly enabled: readonly string[];
  readonly disabled: readonly string[];
}

/** Session configuration */
export interface SessionConfig {
  readonly storePath: string;
  readonly maxMessages: number;
  readonly idleTimeoutMinutes: number;
}

/** Log level */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** Log format */
export type LogFormat = 'json' | 'pretty';

/** Logging configuration */
export interface LoggingConfig {
  readonly level: LogLevel;
  readonly format: LogFormat;
  readonly file?: string;
}

/** Root application configuration */
export interface AppConfig {
  /** Agent configuration (model selection + settings reference) */
  readonly agent: AgentConfig;
  /** Provider credentials only (no model configuration) */
  readonly providers: Record<string, ProviderConfig>;
  /** Plugin configuration */
  readonly plugins: PluginsConfig;
  /** Session configuration */
  readonly session: SessionConfig;
  /** Logging configuration */
  readonly logging: LoggingConfig;
}

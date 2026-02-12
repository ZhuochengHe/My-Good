/**
 * Configuration module exports.
 */

export {
  loadConfig,
  loadConfigFromString,
  validateConfig,
  substituteEnvVars,
  ConfigValidationError,
  type ValidationIssue,
  type ValidationResult,
} from './loader.js';

export { getDefaultConfig } from './defaults.js';

export {
  isOldFormat,
  migrateConfig,
} from './migration.js';

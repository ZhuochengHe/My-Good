/**
 * Plugin system exports.
 */

export { PluginManager, type LoadDirectoryResult } from './manager.js';
export {
  pluginManifestSchema,
  validateManifest,
  type ValidatedPluginManifest,
  type ManifestValidationResult,
} from './manifest-schema.js';
export { checkGates, type GatesCheckResult } from './gates-checker.js';
export { ToolExecutor } from './tool-executor.js';
export type { ExecutionOptions } from './tool-executor.js';

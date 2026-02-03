/**
 * Plugin error types for plugin loading, validation, and execution.
 */

/** Plugin error codes */
export type PluginErrorCode =
  | 'PLUGIN_LOAD_FAILED'
  | 'MANIFEST_VALIDATION_FAILED'
  | 'GATES_CHECK_FAILED'
  | 'TOOL_NOT_FOUND';

/**
 * Base class for plugin-related errors.
 */
export class PluginError extends Error {
  readonly code: PluginErrorCode;
  readonly details?: unknown;

  constructor(
    message: string,
    code: PluginErrorCode,
    details?: unknown,
    cause?: Error
  ) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
    this.details = details;
    if (cause) {
      this.cause = cause;
    }
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a plugin fails to load.
 */
export class PluginLoadError extends PluginError {
  readonly pluginPath: string;

  constructor(pluginPath: string, reason: string, cause?: Error) {
    super(
      `Failed to load plugin at ${pluginPath}: ${reason}`,
      'PLUGIN_LOAD_FAILED',
      { pluginPath, reason },
      cause
    );
    this.name = 'PluginLoadError';
    this.pluginPath = pluginPath;
  }
}

/**
 * Error thrown when a plugin manifest is invalid.
 */
export class ManifestValidationError extends PluginError {
  readonly pluginId: string;
  readonly validationErrors: readonly string[];

  constructor(pluginId: string, validationErrors: readonly string[]) {
    const errorList = validationErrors.join(', ');
    super(
      `Invalid manifest for plugin ${pluginId}: ${errorList}`,
      'MANIFEST_VALIDATION_FAILED',
      { pluginId, validationErrors }
    );
    this.name = 'ManifestValidationError';
    this.pluginId = pluginId;
    this.validationErrors = validationErrors;
  }
}

/**
 * Error thrown when plugin gates check fails.
 */
export class GatesCheckError extends PluginError {
  readonly pluginId: string;

  constructor(pluginId: string, reason: string, details?: unknown) {
    super(
      `Gates check failed for plugin ${pluginId}: ${reason}`,
      'GATES_CHECK_FAILED',
      details
    );
    this.name = 'GatesCheckError';
    this.pluginId = pluginId;
  }
}

/**
 * Error thrown when a requested tool is not found.
 */
export class ToolNotFoundError extends PluginError {
  readonly toolName: string;
  readonly pluginId?: string;

  constructor(toolName: string, pluginId?: string) {
    const pluginContext = pluginId ? ` (plugin: ${pluginId})` : '';
    super(
      `Tool not found: ${toolName}${pluginContext}`,
      'TOOL_NOT_FOUND',
      { toolName, pluginId }
    );
    this.name = 'ToolNotFoundError';
    this.toolName = toolName;
    this.pluginId = pluginId;
  }
}

/**
 * Type guard to check if an error is a PluginError.
 */
export function isPluginError(error: unknown): error is PluginError {
  return error instanceof PluginError;
}

/**
 * Check if a plugin error is recoverable.
 * Only TOOL_NOT_FOUND errors are recoverable.
 */
export function isRecoverablePluginError(error: unknown): boolean {
  if (!isPluginError(error)) {
    return false;
  }
  return error.code === 'TOOL_NOT_FOUND';
}

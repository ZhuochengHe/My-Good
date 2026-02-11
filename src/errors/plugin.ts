/**
 * Plugin error types for plugin loading, validation, and execution.
 */

import type { UserErrorMessage } from './types.js';

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

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  toUserMessage(): UserErrorMessage {
    return {
      code: 'E200',
      message: 'Plugin error',
      context: `A plugin operation encountered an error: ${this.message}`,
      suggestion: 'Check the plugin configuration and ensure all dependencies are installed',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    const details = this.details as { pluginPath: string; reason: string };
    return {
      code: 'E201',
      message: 'Failed to load plugin',
      context: `Plugin at "${details.pluginPath}" could not be loaded: ${details.reason}`,
      suggestion: 'Check that the plugin directory exists and contains a valid plugin.json manifest. Ensure all required files are present',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    const errorList = this.validationErrors.join('; ');
    return {
      code: 'E202',
      message: 'Invalid plugin manifest',
      context: `The manifest for plugin "${this.pluginId}" is invalid: ${errorList}`,
      suggestion: 'Check the plugin.json file for syntax errors and missing required fields. Refer to the plugin development guide for the correct format',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    return {
      code: 'E203',
      message: 'Plugin requirements not met',
      context: `Plugin "${this.pluginId}" cannot be loaded: ${this.message}`,
      suggestion: 'This plugin requires specific system dependencies, binaries, or environment variables. Check the plugin documentation for requirements',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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
    if (pluginId !== undefined) {
      this.pluginId = pluginId;
    }
  }

  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  override toUserMessage(): UserErrorMessage {
    const pluginContext = this.pluginId ? ` in plugin "${this.pluginId}"` : '';
    return {
      code: 'E204',
      message: 'Tool not found',
      context: `The requested tool "${this.toolName}"${pluginContext} does not exist`,
      suggestion: 'Use "my-agent plugin list" to see available tools. Ensure the required plugin is installed and enabled',
      technicalDetails: `${this.name}: ${this.message}`,
    };
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

/**
 * Tests for plugin error classes.
 */

import { describe, it, expect } from 'vitest';
import {
  PluginError,
  PluginLoadError,
  ManifestValidationError,
  GatesCheckError,
  ToolNotFoundError,
  isPluginError,
  isRecoverablePluginError,
} from '../../src/errors/plugin.js';

describe('PluginError', () => {
  it('creates error with message and code', () => {
    const error = new PluginError('Test error', 'PLUGIN_LOAD_FAILED');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PluginError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('PLUGIN_LOAD_FAILED');
    expect(error.name).toBe('PluginError');
  });

  it('creates error with details', () => {
    const details = { path: '/test/plugin', reason: 'missing file' };
    const error = new PluginError('Load failed', 'PLUGIN_LOAD_FAILED', details);

    expect(error.details).toEqual(details);
  });

  it('creates error with cause', () => {
    const cause = new Error('Original error');
    const error = new PluginError('Load failed', 'PLUGIN_LOAD_FAILED', undefined, cause);

    expect(error.cause).toBe(cause);
  });

  it('maintains error stack trace', () => {
    const error = new PluginError('Test error', 'PLUGIN_LOAD_FAILED');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('PluginError');
  });
});

describe('PluginLoadError', () => {
  it('creates error with plugin path', () => {
    const error = new PluginLoadError('/plugins/test', 'Failed to load');

    expect(error).toBeInstanceOf(PluginError);
    expect(error.code).toBe('PLUGIN_LOAD_FAILED');
    expect(error.message).toBe('Failed to load plugin at /plugins/test: Failed to load');
    expect(error.pluginPath).toBe('/plugins/test');
  });

  it('creates error with cause', () => {
    const cause = new Error('File not found');
    const error = new PluginLoadError('/plugins/test', 'Missing manifest', cause);

    expect(error.cause).toBe(cause);
    expect(error.message).toContain('Missing manifest');
  });
});

describe('ManifestValidationError', () => {
  it('creates error with plugin ID and validation errors', () => {
    const validationErrors = ['id is required', 'tools must be an array'];
    const error = new ManifestValidationError('test-plugin', validationErrors);

    expect(error).toBeInstanceOf(PluginError);
    expect(error.code).toBe('MANIFEST_VALIDATION_FAILED');
    expect(error.message).toBe(
      'Invalid manifest for plugin test-plugin: id is required, tools must be an array'
    );
    expect(error.pluginId).toBe('test-plugin');
    expect(error.validationErrors).toEqual(validationErrors);
  });

  it('handles single validation error', () => {
    const error = new ManifestValidationError('test-plugin', ['id is required']);

    expect(error.message).toBe('Invalid manifest for plugin test-plugin: id is required');
  });
});

describe('GatesCheckError', () => {
  it('creates error with plugin ID and reason', () => {
    const error = new GatesCheckError('test-plugin', 'Missing required binary: git');

    expect(error).toBeInstanceOf(PluginError);
    expect(error.code).toBe('GATES_CHECK_FAILED');
    expect(error.message).toBe('Gates check failed for plugin test-plugin: Missing required binary: git');
    expect(error.pluginId).toBe('test-plugin');
  });

  it('creates error with missing binaries details', () => {
    const details = { missingBinaries: ['git', 'docker'] };
    const error = new GatesCheckError('test-plugin', 'Missing binaries', details);

    expect(error.details).toEqual(details);
  });
});

describe('ToolNotFoundError', () => {
  it('creates error with tool name', () => {
    const error = new ToolNotFoundError('read_file');

    expect(error).toBeInstanceOf(PluginError);
    expect(error.code).toBe('TOOL_NOT_FOUND');
    expect(error.message).toBe('Tool not found: read_file');
    expect(error.toolName).toBe('read_file');
  });

  it('creates error with plugin ID context', () => {
    const error = new ToolNotFoundError('read_file', 'file-ops');

    expect(error.message).toBe('Tool not found: read_file (plugin: file-ops)');
    expect(error.pluginId).toBe('file-ops');
  });
});

describe('isPluginError', () => {
  it('returns true for PluginError instances', () => {
    const error = new PluginError('Test', 'PLUGIN_LOAD_FAILED');
    expect(isPluginError(error)).toBe(true);
  });

  it('returns true for PluginError subclasses', () => {
    const loadError = new PluginLoadError('/test', 'Failed');
    const manifestError = new ManifestValidationError('test', ['error']);
    const gatesError = new GatesCheckError('test', 'Failed');
    const toolError = new ToolNotFoundError('test');

    expect(isPluginError(loadError)).toBe(true);
    expect(isPluginError(manifestError)).toBe(true);
    expect(isPluginError(gatesError)).toBe(true);
    expect(isPluginError(toolError)).toBe(true);
  });

  it('returns false for regular errors', () => {
    const error = new Error('Regular error');
    expect(isPluginError(error)).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isPluginError(null)).toBe(false);
    expect(isPluginError(undefined)).toBe(false);
    expect(isPluginError('error')).toBe(false);
    expect(isPluginError(123)).toBe(false);
  });
});

describe('isRecoverablePluginError', () => {
  it('returns false for PLUGIN_LOAD_FAILED', () => {
    const error = new PluginError('Test', 'PLUGIN_LOAD_FAILED');
    expect(isRecoverablePluginError(error)).toBe(false);
  });

  it('returns false for MANIFEST_VALIDATION_FAILED', () => {
    const error = new ManifestValidationError('test', ['error']);
    expect(isRecoverablePluginError(error)).toBe(false);
  });

  it('returns false for GATES_CHECK_FAILED', () => {
    const error = new GatesCheckError('test', 'Failed');
    expect(isRecoverablePluginError(error)).toBe(false);
  });

  it('returns true for TOOL_NOT_FOUND', () => {
    const error = new ToolNotFoundError('test');
    expect(isRecoverablePluginError(error)).toBe(true);
  });

  it('returns false for non-plugin errors', () => {
    const error = new Error('Regular error');
    expect(isRecoverablePluginError(error)).toBe(false);
  });
});

/**
 * Tests for plugin manifest schema validation.
 */

import { describe, it, expect } from 'vitest';
import {
  pluginManifestSchema,
  validateManifest,
  type ValidatedPluginManifest,
} from '../../src/plugins/manifest-schema.js';
import type { PluginManifest } from '../../src/types/plugins.js';

describe('pluginManifestSchema', () => {
  const validManifest: PluginManifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'Test Author',
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            arg1: {
              type: 'string',
              description: 'First argument',
            },
          },
          required: ['arg1'],
        },
        handler: 'test-handler.js',
      },
    ],
  };

  describe('valid manifests', () => {
    it('parses valid manifest with all fields', () => {
      const result = pluginManifestSchema.safeParse(validManifest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('test-plugin');
        expect(result.data.name).toBe('Test Plugin');
        expect(result.data.version).toBe('1.0.0');
        expect(result.data.tools).toHaveLength(1);
      }
    });

    it('parses manifest without optional author', () => {
      const manifest = { ...validManifest, author: undefined };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(true);
    });

    it('parses manifest without optional gates', () => {
      const result = pluginManifestSchema.safeParse(validManifest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gates).toBeUndefined();
      }
    });

    it('parses manifest with gates', () => {
      const manifestWithGates = {
        ...validManifest,
        gates: {
          requiredBinaries: ['git', 'docker'],
          requiredEnv: { API_KEY: 'Must be set' },
          platforms: ['linux', 'darwin'] as const,
        },
      };
      const result = pluginManifestSchema.safeParse(manifestWithGates);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gates?.requiredBinaries).toEqual(['git', 'docker']);
        expect(result.data.gates?.platforms).toEqual(['linux', 'darwin']);
      }
    });

    it('parses tool with optional dangerous flag', () => {
      const manifestWithDangerous = {
        ...validManifest,
        tools: [
          {
            ...validManifest.tools[0],
            dangerous: true,
          },
        ],
      };
      const result = pluginManifestSchema.safeParse(manifestWithDangerous);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tools[0].dangerous).toBe(true);
      }
    });

    it('parses tool with optional timeout', () => {
      const manifestWithTimeout = {
        ...validManifest,
        tools: [
          {
            ...validManifest.tools[0],
            timeout: 30000,
          },
        ],
      };
      const result = pluginManifestSchema.safeParse(manifestWithTimeout);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tools[0].timeout).toBe(30000);
      }
    });
  });

  describe('invalid manifests', () => {
    it('rejects manifest with missing id', () => {
      const manifest = { ...validManifest, id: undefined };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(false);
    });

    it('rejects manifest with empty id', () => {
      const manifest = { ...validManifest, id: '' };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(false);
    });

    it('rejects manifest with invalid id format', () => {
      const manifest = { ...validManifest, id: 'Invalid Plugin!' };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(false);
    });

    it('rejects manifest with missing name', () => {
      const manifest = { ...validManifest, name: undefined };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(false);
    });

    it('rejects manifest with invalid version format', () => {
      const manifest = { ...validManifest, version: 'invalid' };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(false);
    });

    it('rejects manifest with empty tools array', () => {
      const manifest = { ...validManifest, tools: [] };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(false);
    });

    it('rejects manifest with invalid tool name', () => {
      const manifest = {
        ...validManifest,
        tools: [{ ...validManifest.tools[0], name: 'invalid-name!' }],
      };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(false);
    });

    it('rejects manifest with negative timeout', () => {
      const manifest = {
        ...validManifest,
        tools: [{ ...validManifest.tools[0], timeout: -1000 }],
      };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(false);
    });

    it('rejects manifest with invalid platform', () => {
      const manifest = {
        ...validManifest,
        gates: { platforms: ['invalid'] },
      };
      const result = pluginManifestSchema.safeParse(manifest);

      expect(result.success).toBe(false);
    });
  });
});

describe('validateManifest', () => {
  const validManifest: PluginManifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            arg1: { type: 'string', description: 'First argument' },
          },
          required: ['arg1'],
        },
        handler: 'test-handler.js',
      },
    ],
  };

  it('returns validated manifest for valid input', () => {
    const result = validateManifest(validManifest);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.manifest.id).toBe('test-plugin');
      expect(result.errors).toBeUndefined();
    }
  });

  it('returns errors for invalid manifest', () => {
    const invalidManifest = { ...validManifest, id: '' };
    const result = validateManifest(invalidManifest);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.manifest).toBeUndefined();
    }
  });

  it('returns detailed error messages', () => {
    const invalidManifest = {
      ...validManifest,
      id: '',
      version: 'invalid',
      tools: [],
    };
    const result = validateManifest(invalidManifest);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some((e) => e.includes('id'))).toBe(true);
      expect(result.errors.some((e) => e.includes('version'))).toBe(true);
      expect(result.errors.some((e) => e.includes('tools'))).toBe(true);
    }
  });

  it('handles missing required fields', () => {
    const invalidManifest = { id: 'test' } as PluginManifest;
    const result = validateManifest(invalidManifest);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
      expect(result.errors.some((e) => e.includes('version'))).toBe(true);
    }
  });
});

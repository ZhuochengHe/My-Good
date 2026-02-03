/**
 * Zod schema for plugin manifest validation.
 */

import { z } from 'zod';

/**
 * Schema for parameter definitions in tool manifests.
 */
const parameterSchemaSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    description: z.string().optional(),
    required: z.boolean().optional(),
    properties: z.record(parameterSchemaSchema).optional(),
    items: parameterSchemaSchema.optional(),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
    default: z.unknown().optional(),
  })
);

/**
 * Schema for tool definition parameters.
 */
const toolParametersSchema = z.object({
  type: z.literal('object'),
  properties: z.record(parameterSchemaSchema),
  required: z.array(z.string()),
});

/**
 * Schema for individual tool in manifest.
 */
const toolManifestSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z_][a-z0-9_]*$/, 'Tool name must be lowercase with underscores'),
  description: z.string().min(1),
  parameters: toolParametersSchema,
  handler: z.string().min(1),
  dangerous: z.boolean().optional(),
  timeout: z.number().positive().optional(),
});

/**
 * Schema for plugin gates (conditional loading requirements).
 */
const pluginGatesSchema = z.object({
  requiredBinaries: z.array(z.string()).optional(),
  requiredEnv: z.record(z.string()).optional(),
  platforms: z.array(z.enum(['linux', 'darwin', 'win32'])).optional(),
});

/**
 * Schema for complete plugin manifest.
 */
export const pluginManifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Plugin ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic (e.g., 1.0.0)'),
  description: z.string().min(1),
  author: z.string().optional(),
  tools: z.array(toolManifestSchema).min(1, 'Plugin must have at least one tool'),
  gates: pluginGatesSchema.optional(),
});

/**
 * Validated plugin manifest type.
 */
export type ValidatedPluginManifest = z.infer<typeof pluginManifestSchema>;

/**
 * Validation result for plugin manifests.
 */
export type ManifestValidationResult =
  | {
      readonly valid: true;
      readonly manifest: ValidatedPluginManifest;
      readonly errors?: undefined;
    }
  | {
      readonly valid: false;
      readonly manifest?: undefined;
      readonly errors: readonly string[];
    };

/**
 * Validate a plugin manifest and return detailed errors.
 *
 * @param manifest - Plugin manifest to validate
 * @returns Validation result with manifest or errors
 */
export function validateManifest(manifest: unknown): ManifestValidationResult {
  const result = pluginManifestSchema.safeParse(manifest);

  if (result.success) {
    return {
      valid: true,
      manifest: result.data,
    };
  }

  // Convert Zod errors to human-readable messages
  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return `${path}: ${err.message}`;
  });

  return {
    valid: false,
    errors,
  };
}

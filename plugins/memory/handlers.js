/**
 * Memory plugin handlers.
 *
 * Implements save_memory, search_memory, update_memory, delete_memory,
 * and list_memories operations using the injected memoryStore from context.
 */

import { randomUUID } from 'crypto';

/**
 * Creates a new MemoryEntry with auto-generated id and timestamps.
 * Mirrors createMemoryEntry from src/types/memory.ts to avoid TS import issues in plain JS.
 *
 * @param {1|2|3} layer - The memory layer to assign.
 * @param {string} content - The factual text to remember.
 * @param {readonly string[]} tags - Optional keyword tags.
 * @param {{ expiresAt?: number; source?: string }} options - Optional expiresAt and source fields.
 * @returns {object} A fully-populated MemoryEntry ready for storage.
 */
function createMemoryEntry(layer, content, tags = [], options = {}) {
  const now = Date.now();
  return {
    id: randomUUID(),
    layer,
    content,
    tags,
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

/**
 * Checks if an error is a MemoryNotFoundError by code or name.
 * Avoids importing TS error classes directly in plain JS.
 *
 * @param {unknown} error - The error to check.
 * @returns {boolean} True if this is a not-found error.
 */
function isMemoryNotFoundError(error) {
  if (error instanceof Error) {
    return (
      error.name === 'MemoryNotFoundError' ||
      /** @type {any} */ (error).code === 'MEMORY_001'
    );
  }
  return false;
}

/**
 * Formats a single memory entry as a human-readable string.
 *
 * @param {object} entry - The memory entry to format.
 * @returns {string} Formatted string representation.
 */
function formatEntry(entry) {
  const tagSuffix =
    entry.tags && entry.tags.length > 0 ? ` [tags: ${entry.tags.join(', ')}]` : '';
  return `[${entry.id}] (L${entry.layer}) ${entry.content}${tagSuffix}`;
}

/**
 * Saves a new memory entry to persistent storage.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with memoryStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function save_memory(args, context) {
  if (!context.memoryStore) {
    return { output: 'Memory store not available.' };
  }

  if (!args.content || typeof args.content !== 'string' || args.content.trim() === '') {
    return { output: 'Error: "content" must be a non-empty string.' };
  }

  const layer = args.layer;
  if (layer !== 1 && layer !== 2 && layer !== 3) {
    return { output: 'Error: "layer" must be 1, 2, or 3.' };
  }

  const tags = Array.isArray(args.tags) ? args.tags : [];
  const options = {};

  if (typeof args.ttlDays === 'number') {
    options.expiresAt = Date.now() + args.ttlDays * 86400000;
  }

  if (typeof args.source === 'string') {
    options.source = args.source;
  }

  const entry = createMemoryEntry(layer, args.content, tags, options);
  await context.memoryStore.save(entry);

  return { output: `Memory saved (id: ${entry.id}, layer: ${entry.layer})` };
}

/**
 * Searches memory entries by content, tags, or layer.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with memoryStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function search_memory(args, context) {
  if (!context.memoryStore) {
    return { output: 'Memory store not available.' };
  }

  /** @type {Record<string, unknown>} */
  const searchOptions = {};

  if (typeof args.query === 'string') {
    searchOptions.query = args.query;
  }
  if (Array.isArray(args.tags)) {
    searchOptions.tags = args.tags;
  }
  if (typeof args.layer === 'number') {
    searchOptions.layer = args.layer;
  }
  if (typeof args.limit === 'number') {
    searchOptions.limit = args.limit;
  }

  const results = await context.memoryStore.search(searchOptions);

  if (!results || results.length === 0) {
    return { output: 'No memories found.' };
  }

  return { output: results.map(formatEntry).join('\n') };
}

/**
 * Updates an existing memory entry.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with memoryStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function update_memory(args, context) {
  if (!context.memoryStore) {
    return { output: 'Memory store not available.' };
  }

  if (!args.id || typeof args.id !== 'string') {
    return { output: 'Error: "id" is required.' };
  }

  /** @type {Record<string, unknown>} */
  const updateInput = {};

  if (typeof args.content === 'string') {
    updateInput.content = args.content;
  }
  if (Array.isArray(args.tags)) {
    updateInput.tags = args.tags;
  }
  if (typeof args.ttlDays === 'number') {
    updateInput.expiresAt = Date.now() + args.ttlDays * 86400000;
  }

  try {
    await context.memoryStore.update(args.id, updateInput);
    return { output: `Memory updated (id: ${args.id})` };
  } catch (error) {
    if (isMemoryNotFoundError(error)) {
      return { output: `Memory not found: ${args.id}` };
    }
    throw error;
  }
}

/**
 * Permanently deletes a memory entry.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with memoryStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function delete_memory(args, context) {
  if (!context.memoryStore) {
    return { output: 'Memory store not available.' };
  }

  if (!args.id || typeof args.id !== 'string') {
    return { output: 'Error: "id" is required.' };
  }

  try {
    await context.memoryStore.delete(args.id);
    return { output: `Memory deleted (id: ${args.id})` };
  } catch (error) {
    if (isMemoryNotFoundError(error)) {
      return { output: `Memory not found: ${args.id}` };
    }
    throw error;
  }
}

/**
 * Lists all memory entries, optionally filtered by layer.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with memoryStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function list_memories(args, context) {
  if (!context.memoryStore) {
    return { output: 'Memory store not available.' };
  }

  /** @type {Record<string, unknown>} */
  const searchOptions = {};

  if (typeof args.layer === 'number') {
    searchOptions.layer = args.layer;
  }

  const results = await context.memoryStore.search(searchOptions);

  if (!results || results.length === 0) {
    return { output: 'No memories found.' };
  }

  return { output: results.map(formatEntry).join('\n') };
}

/**
 * Built-in memory plugin handlers.
 *
 * Provides save_memory, search_memory, and delete_memory tools that
 * operate on the MemoryStore injected via ToolContext.
 */

import { randomUUID } from 'crypto';
import type { ToolHandler, ToolHandlerResult } from '../../../types/tools.js';
import type { MemoryEntry, MemoryLayer } from '../../../types/memory.js';

/**
 * Save a new memory entry to the persistent store.
 */
export const save_memory: ToolHandler = async (
  args,
  context
): Promise<ToolHandlerResult> => {
  const { memoryStore } = context;
  if (!memoryStore) {
    return { output: 'Error: memory store is not available.' };
  }

  const layer = args['layer'] as MemoryLayer;
  const content = args['content'] as string;
  const tags = (args['tags'] as string[]) ?? [];
  const ttlDays = args['ttl_days'] as number | undefined;

  if (layer === 3 && ttlDays === undefined) {
    return { output: 'Error: ttl_days is required for layer 3 entries.' };
  }

  const now = Date.now();
  const entry: MemoryEntry = {
    id: randomUUID(),
    layer,
    content,
    tags,
    createdAt: now,
    updatedAt: now,
    source: 'agent',
    ...(ttlDays !== undefined ? { ttlDays } : {}),
    ...(ttlDays !== undefined ? { expiresAt: now + ttlDays * 86400000 } : {}),
  };

  await memoryStore.save(entry);
  return { output: `Memory saved (id: ${entry.id}, layer: ${layer}).` };
};

/**
 * Search memory entries with optional filters.
 */
export const search_memory: ToolHandler = async (
  args,
  context
): Promise<ToolHandlerResult> => {
  const { memoryStore } = context;
  if (!memoryStore) {
    return { output: 'Error: memory store is not available.' };
  }

  const query = args['query'] as string | undefined;
  const tags = args['tags'] as string[] | undefined;
  const layer = args['layer'] as MemoryLayer | undefined;
  const limit = (args['limit'] as number | undefined) ?? 20;

  const entries = await memoryStore.search({
    ...(query !== undefined ? { query } : {}),
    ...(tags !== undefined && tags.length > 0 ? { tags } : {}),
    ...(layer !== undefined ? { layer } : {}),
    limit,
  });

  if (entries.length === 0) {
    return { output: 'No memory entries found.' };
  }

  const lines = entries.map((e) => {
    const tagStr = e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : '';
    const expiry =
      e.ttlDays !== undefined
        ? ` (expires in ~${Math.ceil((e.createdAt + e.ttlDays * 86400000 - Date.now()) / 86400000)}d)`
        : '';
    return `[L${e.layer}] ${e.id}${tagStr}${expiry}\n  ${e.content}`;
  });

  return { output: `Found ${entries.length} entries:\n\n${lines.join('\n\n')}` };
};

/**
 * Delete a memory entry by ID.
 */
export const delete_memory: ToolHandler = async (
  args,
  context
): Promise<ToolHandlerResult> => {
  const { memoryStore } = context;
  if (!memoryStore) {
    return { output: 'Error: memory store is not available.' };
  }

  const id = args['id'] as string;

  try {
    await memoryStore.delete(id);
    return { output: `Memory entry ${id} deleted.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: `Error deleting memory: ${message}` };
  }
};

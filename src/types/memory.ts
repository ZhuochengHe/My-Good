/**
 * Memory type definitions for the agent memory module.
 * Supports three layers of persistent memory with TTL and tag-based search.
 */

import { randomUUID } from 'crypto';

/** Memory layer identifier. Layer 1 is always loaded; layers 2-3 are on-demand. */
export type MemoryLayer = 1 | 2 | 3;

/**
 * A single memory entry stored in the agent's memory system.
 */
export interface MemoryEntry {
  /** UUID v4 identifier for this entry. */
  readonly id: string;
  /** Storage layer (1 = core always-loaded, 2 = persistent on-demand, 3 = ephemeral with TTL). */
  readonly layer: MemoryLayer;
  /** The factual text content to remember. */
  readonly content: string;
  /** Keyword tags for search and categorization. */
  readonly tags: readonly string[];
  /** Unix timestamp (ms) when this entry was created. */
  readonly createdAt: number;
  /** Unix timestamp (ms) when this entry was last modified. */
  readonly updatedAt: number;
  /** Unix timestamp (ms) when this entry expires. Layer 3 only. */
  readonly expiresAt?: number;
  /** Time-to-live in days from createdAt. Layer 3 only. Soft eviction: expired entries remain on disk. */
  readonly ttlDays?: number;
  /** Origin of the memory: "user" or "agent". */
  readonly source?: string;
  /** Number of times this entry has been read. Influences eviction scoring. */
  readonly accessCount?: number;
  /** Number of times the TTL was explicitly refreshed. Influences eviction scoring. */
  readonly ttlRenewals?: number;
  /** Opaque reference to the origin of this memory (e.g. MemBench step ID). */
  readonly sourceRef?: string;
}

/**
 * Input for partial updates to an existing memory entry.
 */
export interface MemoryUpdateInput {
  /** Updated content text. */
  readonly content?: string;
  /** Replacement tag list. */
  readonly tags?: readonly string[];
  /** Updated expiry timestamp (ms). */
  readonly expiresAt?: number;
}

/**
 * Options for searching memory entries.
 */
export interface MemorySearchOptions {
  /** Filter to a specific layer. */
  readonly layer?: MemoryLayer;
  /** Case-insensitive substring match against entry content. */
  readonly query?: string;
  /** Return entries that have ANY of these tags. */
  readonly tags?: readonly string[];
  /** Maximum number of results to return. */
  readonly limit?: number;
}

/**
 * Persistent storage interface for memory entries.
 */
export interface MemoryStore {
  /**
   * Retrieves a memory entry by its ID.
   *
   * @param id - UUID of the entry to retrieve
   * @returns The entry, or null if not found
   */
  get(id: string): Promise<MemoryEntry | null>;

  /**
   * Persists a new memory entry to storage.
   *
   * @param entry - The entry to store
   */
  save(entry: MemoryEntry): Promise<void>;

  /**
   * Applies a partial update to an existing memory entry.
   *
   * @param id - UUID of the entry to update
   * @param input - Fields to merge into the existing entry
   * @returns The updated entry
   */
  update(id: string, input: MemoryUpdateInput): Promise<MemoryEntry>;

  /**
   * Deletes a memory entry by ID.
   *
   * @param id - UUID of the entry to delete
   */
  delete(id: string): Promise<void>;

  /**
   * Searches memory entries with optional filters.
   *
   * @param options - Search and filter criteria
   * @returns Matching entries sorted by updatedAt descending
   */
  search(options: MemorySearchOptions): Promise<readonly MemoryEntry[]>;

  /**
   * Loads all non-expired layer 1 entries sorted by createdAt ascending.
   *
   * @returns Layer 1 entries in creation order
   */
  loadLayer1(): Promise<readonly MemoryEntry[]>;
}

/**
 * Creates a new MemoryEntry with auto-generated id and timestamps.
 *
 * @param layer - The memory layer to assign
 * @param content - The factual text to remember
 * @param tags - Optional keyword tags
 * @param options - Optional expiresAt and source fields
 * @returns A fully-populated MemoryEntry ready for storage
 */
export function createMemoryEntry(
  layer: MemoryLayer,
  content: string,
  tags: readonly string[] = [],
  options: { expiresAt?: number; source?: string } = {}
): MemoryEntry {
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

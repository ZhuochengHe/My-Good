/**
 * Memory type definitions for the agent memory module.
 * Supports four semantic kinds of persistent memory with embedding-based search.
 */

import { randomUUID } from 'crypto';

/**
 * Memory kind identifier. Drives lifecycle policy and system-prompt injection.
 *
 * - preference:   How to treat the user — preferences, response style, persistent behavioral rules.
 *                 Always injected into the system prompt.
 * - experiential: How to do tasks effectively — workflows, patterns, project-specific techniques.
 *                 Always injected into the system prompt.
 * - semantic:     Objective facts — project architecture, tech stack, domain knowledge.
 *                 Retrieved on demand.
 * - episodic:     Time-bound events — active tasks, recent decisions, sprint goals, current bugs.
 *                 Retrieved on demand; may carry a ttlDays value.
 */
export type MemoryKind = 'preference' | 'experiential' | 'semantic' | 'episodic';

/** Valid kind values. */
export const VALID_KINDS = new Set<string>([
  'preference',
  'experiential',
  'semantic',
  'episodic',
]);

/**
 * A single memory entry stored in the agent's memory system.
 */
export interface MemoryEntry {
  /** UUID v4 identifier for this entry. */
  readonly id: string;
  /** Semantic kind; drives lifecycle and injection policy. */
  readonly kind: MemoryKind;
  /** The factual text content to remember. */
  readonly content: string;
  /** Keyword tags for search and post-filtering. Free-form, LLM-generated. */
  readonly tags: readonly string[];
  /** text-embedding-3-small (1536-dim) vector; optional until embedded. */
  readonly embedding?: readonly number[];
  /** IDs of related entries — populated during consolidation; not traversed yet. */
  readonly relatedTo?: readonly string[];
  /** Opaque reference to the origin of this memory (e.g. MemBench step ID). */
  readonly sourceRef?: string;
  /** Time-to-live in days (episodic only); set by the consolidation LLM. */
  readonly ttlDays?: number;
  /** Unix timestamp (ms) when this entry was created. */
  readonly createdAt: number;
  /** Unix timestamp (ms) when this entry was last modified. */
  readonly updatedAt: number;
  /** Number of times this entry has been read. Influences eviction scoring. */
  readonly accessCount?: number;
  /** Unix timestamp (ms) of the last retrieval via search(). Initialized to createdAt. */
  readonly lastAccessed?: number;
  /** Number of times the TTL was explicitly refreshed. Influences eviction scoring. */
  readonly ttlRenewals?: number;
}

/**
 * Input for partial updates to an existing memory entry.
 */
export interface MemoryUpdateInput {
  /** Updated content text. */
  readonly content?: string;
  /** Replacement tag list. */
  readonly tags?: readonly string[];
  /** Updated TTL in days (resets the clock from now; episodic only). */
  readonly ttlDays?: number;
  /** Updated relatedTo IDs. */
  readonly relatedTo?: readonly string[];
}

/**
 * Options for searching memory entries.
 */
export interface MemorySearchOptions {
  /** Filter to a specific kind. */
  readonly kind?: MemoryKind;
  /** Substring search fallback query string (used when queryEmbedding is absent). */
  readonly query?: string;
  /** Pre-computed query embedding vector for cosine similarity search. */
  readonly queryEmbedding?: readonly number[];
  /** Post-filter: return entries that have ANY of these tags. */
  readonly tags?: readonly string[];
  /** Maximum number of results to return. */
  readonly limit?: number;
  /** Minimum cosine similarity threshold for embedding search (default 0.0). */
  readonly minScore?: number;
}

/**
 * Interface for storing and querying embedding vectors.
 * Implementations may use a flat JSON file (small scale) or HNSW index (large scale).
 */
export interface EmbeddingIndex {
  /** Returns the embedding for an entry, or null if not present. */
  get(id: string): number[] | null;
  /** Stores or replaces the embedding for an entry. */
  set(id: string, embedding: number[]): Promise<void>;
  /** Removes the embedding for an entry. */
  delete(id: string): Promise<void>;
  /**
   * Returns the top-K entries by cosine similarity to the query vector.
   * Results are sorted by score descending.
   */
  searchByCosine(query: number[], topK: number): Promise<Array<{ id: string; score: number }>>;
  /** Removes all embeddings from the index. */
  clear(): Promise<void>;
}

/**
 * Persistent storage interface for memory entries.
 */
export interface MemoryStore {
  /**
   * Retrieves a memory entry by its ID.
   *
   * @param id - UUID of the entry to retrieve
   * @returns The entry, or null if not found or expired
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
   * When query is provided, uses embedding similarity search.
   * When query is absent, falls back to recency sort (updatedAt descending).
   *
   * @param options - Search and filter criteria
   * @returns Matching entries sorted by relevance or recency
   */
  search(options: MemorySearchOptions): Promise<readonly MemoryEntry[]>;

  /**
   * Loads all non-expired preference and experiential entries sorted by createdAt ascending.
   * Used to inject persistent context into the system prompt at session start.
   *
   * @returns preference + experiential entries in creation order
   */
  loadForSystemPrompt(): Promise<readonly MemoryEntry[]>;
}

/**
 * Creates a new MemoryEntry with auto-generated id and timestamps.
 *
 * @param kind - The memory kind to assign
 * @param content - The factual text to remember
 * @param tags - Optional keyword tags
 * @param options - Optional ttlDays and sourceRef fields
 * @returns A fully-populated MemoryEntry ready for storage
 */
export function createMemoryEntry(
  kind: MemoryKind,
  content: string,
  tags: readonly string[] = [],
  options: { ttlDays?: number; sourceRef?: string } = {}
): MemoryEntry {
  const now = Date.now();
  return {
    id: randomUUID(),
    kind,
    content,
    tags,
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    ...options,
  };
}

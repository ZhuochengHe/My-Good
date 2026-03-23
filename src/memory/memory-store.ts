/**
 * JSON file-based implementation of MemoryStore.
 *
 * Each entry is stored as an individual JSON file under baseDir/<kind>/<uuid>.json.
 * Writes are atomic: data is written to a .tmp file then renamed into place.
 *
 * Directory layout:
 *   baseDir/
 *     procedural/    ← always injected into system prompt
 *     experiential/  ← always injected into system prompt
 *     semantic/      ← retrieved on demand
 *     episodic/      ← retrieved on demand; supports TTL eviction
 *     embeddings.json
 */

import type {
  MemoryEntry,
  MemoryStore,
  MemoryUpdateInput,
  MemorySearchOptions,
  MemoryKind,
  EmbeddingIndex,
} from '../types/memory.js';
import { VALID_KINDS } from '../types/memory.js';
import {
  MemoryNotFoundError,
  MemoryInvalidIdError,
  MemoryInvalidKindError,
  MemoryInvalidContentError,
  MemoryStorageError,
} from '../errors/memory.js';
import { scoreMemory } from './eviction-scorer.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/** Maximum allowed content length in characters. */
const MAX_CONTENT_LENGTH = 10000;

/** Default eviction threshold: max episodic entries before a sweep is triggered. */
const DEFAULT_EVICTION_THRESHOLD = 100;

/** Score threshold: entries >= this value are promoted (pendingKB); below are deleted. */
const HIGH_VALUE_SCORE_THRESHOLD = 0.6;

/** UUID v4 validation regex. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Kinds that are always injected into the system prompt at session start. */
const SYSTEM_PROMPT_KINDS = new Set<MemoryKind>(['procedural', 'experiential']);

/**
 * Returns true if the string is a valid UUID v4.
 *
 * @param id - String to test
 */
function isValidUuid(id: string): boolean {
  return UUID_V4_RE.test(id);
}

/**
 * Returns true if the entry has expired via its ttlDays duration.
 * Only applies to episodic entries that have a ttlDays value set.
 *
 * @param entry - Entry to check
 */
function isExpiredByTtlDays(entry: MemoryEntry): boolean {
  return (
    entry.kind === 'episodic' &&
    entry.ttlDays !== undefined &&
    Date.now() > entry.createdAt + entry.ttlDays * 86400000
  );
}

/**
 * JSON file-based MemoryStore.
 * Files are stored at baseDir/<kind>/<id>.json.
 * All writes are atomic (tmp + rename) with mode 0o600.
 */
export class JsonMemoryStore implements MemoryStore {
  private readonly evictionThreshold: number;

  /**
   * @param baseDir - Root directory for all memory kind subdirectories
   * @param evictionThreshold - Max episodic entry count before eviction sweep runs (default 100)
   * @param embeddingIndex - Optional EmbeddingIndex for similarity search
   */
  constructor(
    private readonly baseDir: string,
    evictionThreshold: number = DEFAULT_EVICTION_THRESHOLD,
    private readonly embeddingIndex?: EmbeddingIndex
  ) {
    this.evictionThreshold = evictionThreshold;
  }

  /**
   * Ensures all kind subdirectories exist.
   */
  private async ensureDirs(): Promise<void> {
    try {
      await Promise.all(
        Array.from(VALID_KINDS).map(kind =>
          fs.mkdir(path.join(this.baseDir, kind), { recursive: true })
        )
      );
    } catch (err) {
      throw new MemoryStorageError('ensureDirs', err);
    }
  }

  /**
   * Resolves the absolute file path for an entry.
   *
   * @param kind - Memory kind
   * @param id - Entry UUID
   */
  private entryPath(kind: MemoryKind, id: string): string {
    return path.join(this.baseDir, kind, `${id}.json`);
  }

  /**
   * Writes an entry atomically: first to a .tmp file, then renamed.
   *
   * @param filePath - Destination file path
   * @param entry - Entry to serialise
   */
  private async atomicWrite(filePath: string, entry: MemoryEntry): Promise<void> {
    const tmp = `${filePath}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(entry, null, 2), { mode: 0o600 });
      await fs.rename(tmp, filePath);
    } catch (err) {
      await fs.unlink(tmp).catch(() => undefined);
      throw new MemoryStorageError(`write ${filePath}`, err);
    }
  }

  /**
   * Reads and parses a single entry from disk.
   * Returns null if the file does not exist.
   *
   * @param filePath - Path to the JSON file
   */
  private async readFile(filePath: string): Promise<MemoryEntry | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as MemoryEntry;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new MemoryStorageError(`read ${filePath}`, err);
    }
  }

  /**
   * Scans a kind directory and returns all parseable entries.
   * Expired entries are silently excluded unless excludeExpired is false.
   *
   * @param kind - Kind to scan
   * @param excludeExpired - Whether to filter out expired entries (default true)
   */
  private async scanKind(kind: MemoryKind, excludeExpired = true): Promise<MemoryEntry[]> {
    const dir = path.join(this.baseDir, kind);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new MemoryStorageError(`readdir ${kind}`, err);
    }

    const jsonNames = names.filter(n => n.endsWith('.json') && !n.endsWith('.tmp.json'));
    const entries = await Promise.all(
      jsonNames.map(name => this.readFile(path.join(dir, name)))
    );

    const valid: MemoryEntry[] = [];
    for (const e of entries) {
      if (e === null) continue;
      if (excludeExpired && isExpiredByTtlDays(e)) continue;
      valid.push(e);
    }
    return valid;
  }

  /**
   * Validates that id is a UUID v4 string.
   *
   * @param id - Value to validate
   */
  private assertValidId(id: string): void {
    if (!isValidUuid(id)) {
      throw new MemoryInvalidIdError(id);
    }
  }

  /**
   * Validates an entry before persisting it.
   *
   * @param entry - Entry to validate
   */
  private assertValidEntry(entry: MemoryEntry): void {
    if (!VALID_KINDS.has(entry.kind)) {
      throw new MemoryInvalidKindError(entry.kind);
    }
    if (!entry.content || entry.content.length === 0) {
      throw new MemoryInvalidContentError('content must not be empty');
    }
    if (entry.content.length > MAX_CONTENT_LENGTH) {
      throw new MemoryInvalidContentError(
        `content length ${entry.content.length} exceeds maximum of ${MAX_CONTENT_LENGTH}`
      );
    }
  }

  /**
   * Retrieves a memory entry by UUID.
   * Returns null if no entry with that ID exists, or if the entry is expired.
   * Throws MemoryInvalidIdError for non-UUID input.
   *
   * @param id - UUID v4 of the entry to retrieve
   */
  async get(id: string): Promise<MemoryEntry | null> {
    this.assertValidId(id);
    await this.ensureDirs();

    for (const kind of VALID_KINDS as Set<MemoryKind>) {
      const filePath = this.entryPath(kind, id);
      const entry = await this.readFile(filePath);
      if (entry !== null) {
        if (isExpiredByTtlDays(entry)) {
          return null;
        }
        return entry;
      }
    }
    return null;
  }

  /**
   * Persists a memory entry to storage.
   * Validates content and kind before writing.
   * If the entry has an embedding and an embeddingIndex is configured, stores the vector.
   *
   * @param entry - Entry to store
   */
  async save(entry: MemoryEntry): Promise<void> {
    this.assertValidEntry(entry);
    await this.ensureDirs();
    const filePath = this.entryPath(entry.kind, entry.id);
    await this.atomicWrite(filePath, entry);

    if (entry.embedding && this.embeddingIndex) {
      await this.embeddingIndex.set(entry.id, entry.embedding as number[]);
    }
  }

  /**
   * Applies a partial update to an existing entry.
   * Merges provided fields with existing data and updates updatedAt.
   *
   * @param id - UUID of the entry to update
   * @param input - Fields to merge
   * @returns The updated entry
   */
  async update(id: string, input: MemoryUpdateInput): Promise<MemoryEntry> {
    this.assertValidId(id);
    await this.ensureDirs();

    let existing: MemoryEntry | null = null;
    let foundKind: MemoryKind | null = null;

    for (const kind of VALID_KINDS as Set<MemoryKind>) {
      const filePath = this.entryPath(kind, id);
      const entry = await this.readFile(filePath);
      if (entry !== null) {
        existing = entry;
        foundKind = kind;
        break;
      }
    }

    if (existing === null || foundKind === null) {
      throw new MemoryNotFoundError(id);
    }

    const updated: MemoryEntry = {
      ...existing,
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.ttlDays !== undefined ? { ttlDays: input.ttlDays } : {}),
      ...(input.relatedTo !== undefined ? { relatedTo: input.relatedTo } : {}),
      updatedAt: Date.now(),
    };

    const filePath = this.entryPath(foundKind, id);
    await this.atomicWrite(filePath, updated);
    return updated;
  }

  /**
   * Removes a memory entry from storage.
   * Also removes its embedding from the index if present.
   * Throws MemoryNotFoundError if the entry does not exist.
   *
   * @param id - UUID of the entry to delete
   */
  async delete(id: string): Promise<void> {
    this.assertValidId(id);
    await this.ensureDirs();

    for (const kind of VALID_KINDS as Set<MemoryKind>) {
      const filePath = this.entryPath(kind, id);
      try {
        await fs.unlink(filePath);
        if (this.embeddingIndex) {
          await this.embeddingIndex.delete(id);
        }
        return;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new MemoryStorageError(`delete ${filePath}`, err);
        }
      }
    }

    throw new MemoryNotFoundError(id);
  }

  /**
   * Searches memory entries with optional filters.
   * Expired entries are silently excluded.
   * When query is provided and an embeddingIndex is configured, uses cosine similarity.
   * Otherwise falls back to recency sort (updatedAt descending).
   *
   * @param options - Kind, query, tags, limit, and minScore filters
   */
  async search(options: MemorySearchOptions): Promise<readonly MemoryEntry[]> {
    await this.ensureDirs();

    const kinds: MemoryKind[] = options.kind !== undefined
      ? [options.kind]
      : Array.from(VALID_KINDS) as MemoryKind[];

    const all: MemoryEntry[] = [];
    for (const kind of kinds) {
      const entries = await this.scanKind(kind, true);
      all.push(...entries);
    }

    let results = all;

    // Tag post-filter
    if (options.tags !== undefined && options.tags.length > 0) {
      const tagSet = new Set(options.tags);
      results = results.filter(e => e.tags.some(t => tagSet.has(t)));
    }

    // Text search: substring match on content.
    // Embedding-based ranking (via embeddingIndex) requires a pre-computed query vector
    // which is produced by the consolidation layer. Until that is wired in, fall back
    // to case-insensitive substring search for all query requests.
    if (options.query !== undefined && options.query.length > 0) {
      const lower = options.query.toLowerCase();
      results = results.filter(e => e.content.toLowerCase().includes(lower));
    }

    results.sort((a, b) => b.updatedAt - a.updatedAt);

    if (options.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Loads all non-expired procedural and experiential entries sorted by createdAt ascending.
   * Used to inject persistent context into the system prompt at session start.
   *
   * @returns procedural + experiential entries in creation order
   */
  async loadForSystemPrompt(): Promise<readonly MemoryEntry[]> {
    await this.ensureDirs();
    const entries: MemoryEntry[] = [];
    for (const kind of SYSTEM_PROMPT_KINDS) {
      const kindEntries = await this.scanKind(kind, true);
      entries.push(...kindEntries);
    }
    return entries.slice().sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Runs a startup sweep: ensures directories exist and then runs the eviction sweep.
   * Call once at application startup.
   */
  async initialize(): Promise<void> {
    await this.ensureDirs();
    await this.evict();
  }

  /**
   * Eviction sweep for episodic entries.
   *
   * Scans all episodic files (including expired ones). If the total number of expired
   * episodic entries does not exceed evictionThreshold, returns early without changes.
   * Otherwise, scores each expired episodic entry:
   *   - Score >= 0.6 (high value): sets pendingKB: true on the entry and re-writes it.
   *   - Score < 0.6 (low value): deletes the entry file from disk.
   *
   * procedural, experiential, and semantic entries are never touched.
   * Non-expired episodic entries are never touched.
   */
  async evict(): Promise<void> {
    await this.ensureDirs();

    const allEpisodic = await this.scanKind('episodic', false);
    const expiredEpisodic = allEpisodic.filter(e => isExpiredByTtlDays(e));

    if (expiredEpisodic.length <= this.evictionThreshold) {
      return;
    }

    await Promise.all(
      expiredEpisodic.map(async entry => {
        const score = scoreMemory(entry);
        const filePath = this.entryPath('episodic', entry.id);

        if (score >= HIGH_VALUE_SCORE_THRESHOLD) {
          const marked = { ...entry, pendingKB: true };
          const tmp = `${filePath}.tmp`;
          try {
            await fs.writeFile(tmp, JSON.stringify(marked, null, 2), { mode: 0o600 });
            await fs.rename(tmp, filePath);
          } catch (err) {
            await fs.unlink(tmp).catch(() => undefined);
            throw new MemoryStorageError(`evict write ${filePath}`, err);
          }
        } else {
          try {
            await fs.unlink(filePath);
            if (this.embeddingIndex) {
              await this.embeddingIndex.delete(entry.id);
            }
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw new MemoryStorageError(`evict delete ${filePath}`, err);
            }
          }
        }
      })
    );
  }
}

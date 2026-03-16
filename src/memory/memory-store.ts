/**
 * JSON file-based implementation of MemoryStore.
 * Each entry is stored as an individual JSON file under baseDir/layer{1,2,3}/<uuid>.json.
 * Writes are atomic: data is written to a .tmp file then renamed into place.
 */

import type { MemoryEntry, MemoryStore, MemoryUpdateInput, MemorySearchOptions } from '../types/memory.js';
import {
  MemoryNotFoundError,
  MemoryInvalidIdError,
  MemoryInvalidLayerError,
  MemoryInvalidContentError,
  MemoryStorageError,
  MemoryExpiredError,
} from '../errors/memory.js';
import { scoreMemory } from './eviction-scorer.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/** Maximum allowed content length in characters. */
const MAX_CONTENT_LENGTH = 10000;

/** Default eviction threshold: max L3 entries before a sweep is triggered. */
const DEFAULT_EVICTION_THRESHOLD = 100;

/** Score threshold: entries >= this value are promoted (pendingKB); below are deleted. */
const HIGH_VALUE_SCORE_THRESHOLD = 0.6;

/** Valid layer values. */
const VALID_LAYERS = new Set<number>([1, 2, 3]);

/** UUID v4 validation regex. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns true if the string is a valid UUID v4.
 *
 * @param id - String to test
 */
function isValidUuid(id: string): boolean {
  return UUID_V4_RE.test(id);
}

/**
 * Returns true if the entry has expired via its absolute expiresAt timestamp.
 *
 * @param entry - Entry to check
 */
function isExpiredByTimestamp(entry: MemoryEntry): boolean {
  return entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
}

/**
 * Returns true if the entry has expired via its ttlDays duration.
 * Only applies to layer 3 entries that have a ttlDays value set.
 * Expired entries are silently excluded from results but remain on disk.
 *
 * @param entry - Entry to check
 */
function isExpiredByTtlDays(entry: MemoryEntry): boolean {
  return (
    entry.layer === 3 &&
    entry.ttlDays !== undefined &&
    Date.now() > entry.createdAt + entry.ttlDays * 86400000
  );
}

/**
 * JSON file-based MemoryStore.
 * Files are stored at baseDir/layer{1,2,3}/<id>.json.
 * All writes are atomic (tmp + rename) with mode 0o600.
 */
export class JsonMemoryStore implements MemoryStore {
  private readonly evictionThreshold: number;

  /**
   * @param baseDir - Root directory for all memory layer subdirectories
   * @param evictionThreshold - Max L3 entry count before eviction sweep runs (default 100)
   */
  constructor(
    private readonly baseDir: string,
    evictionThreshold: number = DEFAULT_EVICTION_THRESHOLD
  ) {
    this.evictionThreshold = evictionThreshold;
  }

  /**
   * Ensures the layer subdirectories exist.
   */
  private async ensureDirs(): Promise<void> {
    try {
      await Promise.all([
        fs.mkdir(path.join(this.baseDir, 'layer1'), { recursive: true }),
        fs.mkdir(path.join(this.baseDir, 'layer2'), { recursive: true }),
        fs.mkdir(path.join(this.baseDir, 'layer3'), { recursive: true }),
      ]);
    } catch (err) {
      throw new MemoryStorageError('ensureDirs', err);
    }
  }

  /**
   * Resolves the absolute file path for an entry.
   *
   * @param layer - Memory layer
   * @param id - Entry UUID
   */
  private entryPath(layer: 1 | 2 | 3, id: string): string {
    return path.join(this.baseDir, `layer${layer}`, `${id}.json`);
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
      // Best-effort cleanup of temp file
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
   * Scans a layer directory and returns all parseable entries.
   * Expired entries are silently excluded.
   *
   * @param layer - Layer to scan
   * @param excludeExpired - Whether to filter out expired entries (default true)
   */
  private async scanLayer(
    layer: 1 | 2 | 3,
    excludeExpired = true
  ): Promise<MemoryEntry[]> {
    const dir = path.join(this.baseDir, `layer${layer}`);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new MemoryStorageError(`readdir layer${layer}`, err);
    }

    const jsonNames = names.filter(n => n.endsWith('.json') && !n.endsWith('.tmp.json'));
    const entries = await Promise.all(
      jsonNames.map(name => this.readFile(path.join(dir, name)))
    );

    const valid: MemoryEntry[] = [];
    for (const e of entries) {
      if (e === null) continue;
      if (excludeExpired && (isExpiredByTimestamp(e) || isExpiredByTtlDays(e))) continue;
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
    if (!VALID_LAYERS.has(entry.layer)) {
      throw new MemoryInvalidLayerError(entry.layer);
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
   * Returns null if no entry with that ID exists.
   * Throws MemoryInvalidIdError for non-UUID input.
   * Throws MemoryExpiredError if the entry has expired.
   *
   * @param id - UUID v4 of the entry to retrieve
   */
  async get(id: string): Promise<MemoryEntry | null> {
    this.assertValidId(id);
    await this.ensureDirs();

    // Scan all layers since we do not know the layer from the id alone
    for (const layer of [1, 2, 3] as const) {
      const filePath = this.entryPath(layer, id);
      const entry = await this.readFile(filePath);
      if (entry !== null) {
        if (isExpiredByTimestamp(entry)) {
          throw new MemoryExpiredError(id, entry.expiresAt as number);
        }
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
   * Validates content and layer before writing.
   *
   * @param entry - Entry to store
   */
  async save(entry: MemoryEntry): Promise<void> {
    this.assertValidEntry(entry);
    await this.ensureDirs();
    const filePath = this.entryPath(entry.layer, entry.id);
    await this.atomicWrite(filePath, entry);
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

    // Find the entry across all layers
    let existing: MemoryEntry | null = null;
    let foundLayer: 1 | 2 | 3 | null = null;

    for (const layer of [1, 2, 3] as const) {
      const filePath = this.entryPath(layer, id);
      const entry = await this.readFile(filePath);
      if (entry !== null) {
        existing = entry;
        foundLayer = layer;
        break;
      }
    }

    if (existing === null || foundLayer === null) {
      throw new MemoryNotFoundError(id);
    }

    const updated: MemoryEntry = {
      ...existing,
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      updatedAt: Date.now(),
    };

    const filePath = this.entryPath(foundLayer, id);
    await this.atomicWrite(filePath, updated);
    return updated;
  }

  /**
   * Removes a memory entry from storage.
   * Throws MemoryNotFoundError if the entry does not exist.
   *
   * @param id - UUID of the entry to delete
   */
  async delete(id: string): Promise<void> {
    this.assertValidId(id);
    await this.ensureDirs();

    for (const layer of [1, 2, 3] as const) {
      const filePath = this.entryPath(layer, id);
      try {
        await fs.unlink(filePath);
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
   * Results are sorted by updatedAt descending.
   *
   * @param options - Layer, query, tags, and limit filters
   */
  async search(options: MemorySearchOptions): Promise<readonly MemoryEntry[]> {
    await this.ensureDirs();

    const layers: Array<1 | 2 | 3> =
      options.layer !== undefined ? [options.layer] : [1, 2, 3];

    const all: MemoryEntry[] = [];
    for (const layer of layers) {
      const entries = await this.scanLayer(layer, true);
      all.push(...entries);
    }

    let results = all;

    if (options.query !== undefined && options.query.length > 0) {
      const lower = options.query.toLowerCase();
      results = results.filter(e => e.content.toLowerCase().includes(lower));
    }

    if (options.tags !== undefined && options.tags.length > 0) {
      const tagSet = new Set(options.tags);
      results = results.filter(e => e.tags.some(t => tagSet.has(t)));
    }

    results.sort((a, b) => b.updatedAt - a.updatedAt);

    if (options.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Loads all non-expired layer 1 entries sorted by createdAt ascending.
   *
   * @returns Layer 1 entries in creation order
   */
  async loadLayer1(): Promise<readonly MemoryEntry[]> {
    await this.ensureDirs();
    const entries = await this.scanLayer(1, true);
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
   * Eviction sweep for L3 entries.
   *
   * Scans all L3 files (including expired ones). If the total number of expired L3
   * entries does not exceed evictionThreshold, returns early without changes.
   * Otherwise, scores each expired L3 entry:
   *   - Score >= 0.6 (high value): sets pendingKB: true on the entry and re-writes it.
   *   - Score < 0.6 (low value): deletes the entry file from disk.
   *
   * L1, L2, and non-expired L3 entries are never touched.
   */
  async evict(): Promise<void> {
    await this.ensureDirs();

    // Scan all L3 files, including expired ones
    const allL3 = await this.scanLayer(3, false);

    // Separate expired from non-expired
    const expiredL3 = allL3.filter(
      e => isExpiredByTtlDays(e) || isExpiredByTimestamp(e)
    );

    // Early exit: below threshold
    if (expiredL3.length <= this.evictionThreshold) {
      return;
    }

    // Score and process each expired entry
    await Promise.all(
      expiredL3.map(async entry => {
        const score = scoreMemory(entry);
        const filePath = this.entryPath(entry.layer as 1 | 2 | 3, entry.id);

        if (score >= HIGH_VALUE_SCORE_THRESHOLD) {
          // Mark as pending KB promotion and keep on disk
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
          // Low value — remove from disk
          try {
            await fs.unlink(filePath);
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

/**
 * JSON file-based implementation of EmbeddingIndex.
 *
 * Stores all embeddings as a flat map { [id: string]: number[] } in a single
 * JSON file (embeddings.json). The entire map is loaded into memory for cosine
 * similarity search. Writes are atomic (tmp + rename).
 *
 * Scale characteristics:
 *   ~1k entries  →  ~6 MB on disk, search <1ms
 *   ~5k entries  →  ~30 MB on disk, search ~5ms
 *   >10k entries →  replace with HNSW (hnswlib-node) without changing the interface
 */

import type { EmbeddingIndex } from '../types/memory.js';
import { MemoryStorageError } from '../errors/memory.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/** File name for the flat embedding map. */
const EMBEDDINGS_FILE = 'embeddings.json';

/**
 * Computes the cosine similarity between two vectors.
 * Returns 0 if either vector has zero magnitude.
 *
 * @param a - First vector
 * @param b - Second vector
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * JSON file-based embedding index.
 * Maintains an in-memory map that is persisted to embeddings.json.
 *
 * All mutating operations (set, delete, clear) are serialized through a
 * promise chain so concurrent callers never race on embeddings.json.tmp.
 */
export class JsonEmbeddingIndex implements EmbeddingIndex {
  private readonly filePath: string;
  /** In-memory embedding map; lazily loaded on first access. */
  private map: Map<string, number[]> | null = null;
  /** Serializes all write operations to prevent concurrent rename races. */
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * @param baseDir - Directory where embeddings.json will be stored
   */
  constructor(baseDir: string) {
    this.filePath = path.join(baseDir, EMBEDDINGS_FILE);
  }

  /**
   * Enqueues a write operation so it runs after all previous writes complete.
   * Prevents concurrent callers from racing on embeddings.json.tmp.
   */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(fn, fn);
    return this.writeQueue;
  }

  /**
   * Loads the embedding map from disk, or returns an empty map if the file
   * does not exist yet. Result is cached in memory.
   */
  private async loadMap(): Promise<Map<string, number[]>> {
    if (this.map !== null) {
      return this.map;
    }
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const obj = JSON.parse(raw) as Record<string, number[]>;
      this.map = new Map(Object.entries(obj));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.map = new Map();
      } else {
        throw new MemoryStorageError(`read ${this.filePath}`, err);
      }
    }
    return this.map;
  }

  /**
   * Atomically persists the in-memory map to embeddings.json.
   *
   * @param map - The current embedding map
   */
  private async saveMap(map: Map<string, number[]>): Promise<void> {
    const obj: Record<string, number[]> = {};
    for (const [id, vec] of map) {
      obj[id] = vec;
    }
    const tmp = `${this.filePath}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(obj), { mode: 0o600 });
      await fs.rename(tmp, this.filePath);
    } catch (err) {
      await fs.unlink(tmp).catch(() => undefined);
      throw new MemoryStorageError(`write ${this.filePath}`, err);
    }
  }

  /**
   * Returns the embedding for an entry, or null if not present.
   *
   * @param id - Entry UUID
   */
  get(id: string): number[] | null {
    // Synchronous read from in-memory cache; returns null if not loaded yet.
    // Callers that need an accurate answer must await loadMap() first.
    return this.map?.get(id) ?? null;
  }

  /**
   * Stores or replaces the embedding for an entry.
   *
   * @param id - Entry UUID
   * @param embedding - Embedding vector to store
   */
  async set(id: string, embedding: number[]): Promise<void> {
    return this.enqueue(async () => {
      const map = await this.loadMap();
      map.set(id, embedding);
      await this.saveMap(map);
    });
  }

  /**
   * Removes the embedding for an entry.
   * No-op if the entry has no embedding.
   *
   * @param id - Entry UUID
   */
  async delete(id: string): Promise<void> {
    return this.enqueue(async () => {
      const map = await this.loadMap();
      if (!map.has(id)) return;
      map.delete(id);
      await this.saveMap(map);
    });
  }

  /**
   * Removes all embeddings from the index.
   * More efficient than calling delete() for each entry when clearing many entries.
   */
  async clear(): Promise<void> {
    return this.enqueue(async () => {
      this.map = new Map();
      await this.saveMap(this.map);
    });
  }

  /**
   * Returns the top-K entries by cosine similarity to the query vector.
   * Results are sorted by score descending.
   *
   * @param query - Query embedding vector
   * @param topK - Number of results to return
   */
  async searchByCosine(
    query: number[],
    topK: number
  ): Promise<Array<{ id: string; score: number }>> {
    const map = await this.loadMap();

    const scored: Array<{ id: string; score: number }> = [];
    for (const [id, vec] of map) {
      scored.push({ id, score: cosineSimilarity(query, vec) });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

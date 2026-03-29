/**
 * Tests for HnswEmbeddingIndex.
 *
 * Verifies the same EmbeddingIndex interface contract as JsonEmbeddingIndex
 * so the two implementations are drop-in replacements.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HnswEmbeddingIndex } from '../../src/memory/hnsw-embedding-index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ─── helpers ───────────────────────────────────────────────────────────────────

function makeDir(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'hnsw-test-'));
}

/** One-hot vector of length `dim` with a 1 at position `pos`. */
function oneHot(pos: number, dim = 8): number[] {
  const v = new Array(dim).fill(0);
  v[pos] = 1;
  return v;
}

/** Cosine similarity between two vectors (reference implementation). */
function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('HnswEmbeddingIndex', () => {
  let dir: string;
  let index: HnswEmbeddingIndex;

  beforeEach(async () => {
    dir = await makeDir();
    index = new HnswEmbeddingIndex(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  // ── get ──────────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns null for unknown id before any load', () => {
      expect(index.get('nonexistent')).toBeNull();
    });

    it('returns the vector after set', async () => {
      const vec = oneHot(0);
      await index.set('id-a', vec);
      expect(index.get('id-a')).toEqual(vec);
    });

    it('returns null after delete', async () => {
      await index.set('id-a', oneHot(0));
      await index.delete('id-a');
      expect(index.get('id-a')).toBeNull();
    });
  });

  // ── set ──────────────────────────────────────────────────────────────────────

  describe('set', () => {
    it('stores a new entry', async () => {
      await index.set('id-a', oneHot(0));
      const results = await index.searchByCosine(oneHot(0), 1);
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('id-a');
    });

    it('updates an existing entry', async () => {
      await index.set('id-a', oneHot(0));
      await index.set('id-a', oneHot(1)); // replace
      const results = await index.searchByCosine(oneHot(1), 1);
      expect(results[0]!.id).toBe('id-a');
      // Old vector should no longer match
      const old = await index.searchByCosine(oneHot(0), 5);
      const oldEntry = old.find(r => r.id === 'id-a');
      // If found, its score should reflect the updated vector (cosine with oneHot(0) = 0)
      if (oldEntry) {
        expect(oldEntry.score).toBeCloseTo(0, 1);
      }
    });

    it('handles many sequential sets', async () => {
      for (let i = 0; i < 20; i++) {
        await index.set(`id-${i}`, oneHot(i % 8));
      }
      const results = await index.searchByCosine(oneHot(0), 5);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ── delete ───────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes entry from search results', async () => {
      await index.set('id-a', oneHot(0));
      await index.set('id-b', oneHot(1));
      await index.delete('id-a');

      const results = await index.searchByCosine(oneHot(0), 5);
      expect(results.map(r => r.id)).not.toContain('id-a');
    });

    it('is a no-op for unknown id', async () => {
      await index.set('id-a', oneHot(0));
      await expect(index.delete('nonexistent')).resolves.not.toThrow();
      const results = await index.searchByCosine(oneHot(0), 1);
      expect(results[0]!.id).toBe('id-a');
    });
  });

  // ── searchByCosine ───────────────────────────────────────────────────────────

  describe('searchByCosine', () => {
    it('returns empty array when index is empty', async () => {
      const results = await index.searchByCosine(oneHot(0), 5);
      expect(results).toEqual([]);
    });

    it('returns the most similar entry first', async () => {
      await index.set('far',  oneHot(1));  // cosine(query, far)  = 0
      await index.set('near', oneHot(0));  // cosine(query, near) = 1
      const query = oneHot(0);
      const results = await index.searchByCosine(query, 2);
      expect(results[0]!.id).toBe('near');
    });

    it('scores are sorted descending', async () => {
      await index.set('a', oneHot(0));
      await index.set('b', [0.9, 0.1, 0, 0, 0, 0, 0, 0]);
      await index.set('c', oneHot(1));
      const results = await index.searchByCosine(oneHot(0), 3);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]!.score).toBeGreaterThanOrEqual(results[i + 1]!.score);
      }
    });

    it('score for identical vectors is approximately 1', async () => {
      const vec = oneHot(3);
      await index.set('id-a', vec);
      const results = await index.searchByCosine(vec, 1);
      expect(results[0]!.score).toBeCloseTo(1, 2);
    });

    it('score for orthogonal vectors is approximately 0', async () => {
      await index.set('id-a', oneHot(0));
      await index.set('id-b', oneHot(1)); // need at least 2 entries for HNSW
      const results = await index.searchByCosine(oneHot(0), 2);
      const orthogonal = results.find(r => r.id === 'id-b');
      expect(orthogonal?.score).toBeCloseTo(0, 1);
    });

    it('respects topK limit', async () => {
      for (let i = 0; i < 10; i++) {
        await index.set(`id-${i}`, oneHot(i % 8));
      }
      const results = await index.searchByCosine(oneHot(0), 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('clamps topK to available entries', async () => {
      await index.set('only', oneHot(0));
      const results = await index.searchByCosine(oneHot(0), 100);
      expect(results.length).toBe(1);
    });
  });

  // ── clear ────────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('empties the index', async () => {
      await index.set('id-a', oneHot(0));
      await index.set('id-b', oneHot(1));
      await index.clear();
      const results = await index.searchByCosine(oneHot(0), 5);
      expect(results).toEqual([]);
      expect(index.get('id-a')).toBeNull();
    });

    it('allows new entries after clear', async () => {
      await index.set('id-a', oneHot(0));
      await index.clear();
      await index.set('id-b', oneHot(2));
      const results = await index.searchByCosine(oneHot(2), 1);
      expect(results[0]!.id).toBe('id-b');
    });
  });

  // ── persistence ──────────────────────────────────────────────────────────────

  describe('persistence', () => {
    it('reloads entries from disk on a new instance', async () => {
      await index.set('id-a', oneHot(0));
      await index.set('id-b', oneHot(1));

      // Create a fresh instance pointing at the same directory
      const index2 = new HnswEmbeddingIndex(dir);
      const results = await index2.searchByCosine(oneHot(0), 2);
      expect(results.map(r => r.id)).toContain('id-a');
    });

    it('reloaded index returns correct nearest neighbor', async () => {
      await index.set('near', oneHot(0));
      await index.set('far',  oneHot(7));

      const index2 = new HnswEmbeddingIndex(dir);
      const results = await index2.searchByCosine(oneHot(0), 1);
      expect(results[0]!.id).toBe('near');
      expect(results[0]!.score).toBeCloseTo(1, 2);
    });

    it('embeddings.json is the source of truth after delete', async () => {
      await index.set('id-a', oneHot(0));
      await index.set('id-b', oneHot(1));
      await index.delete('id-a');

      const index2 = new HnswEmbeddingIndex(dir);
      const results = await index2.searchByCosine(oneHot(0), 5);
      expect(results.map(r => r.id)).not.toContain('id-a');
    });

    it('clear persists empty state to disk', async () => {
      await index.set('id-a', oneHot(0));
      await index.clear();

      const index2 = new HnswEmbeddingIndex(dir);
      const results = await index2.searchByCosine(oneHot(0), 5);
      expect(results).toEqual([]);
    });
  });

  // ── concurrent writes ────────────────────────────────────────────────────────

  describe('write queue', () => {
    it('handles concurrent set calls without corruption', async () => {
      // Fire 10 set() calls without awaiting each one
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => index.set(`id-${i}`, oneHot(i % 8)))
      );
      const results = await index.searchByCosine(oneHot(0), 10);
      expect(results.length).toBeGreaterThan(0);
      // All ids should be present
      for (let i = 0; i < 10; i++) {
        expect(index.get(`id-${i}`)).not.toBeNull();
      }
    });
  });
});

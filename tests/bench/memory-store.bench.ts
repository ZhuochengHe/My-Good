/**
 * A2: memory-store search latency — HNSW-only vs. full hybrid (HNSW + BM25 + tag boost)
 *
 * Three sub-suites:
 *
 *   A2a — HNSW-only (`embeddingIndex.searchByCosine` via store.search with no query string)
 *         Isolates graph traversal + LRU candidate lookup from text scoring.
 *
 *   A2b — Full hybrid (cosine + BM25-TF + tag boost)
 *         The production code path; adds tokenisation, IDF weighting, and tag scoring.
 *
 *   A2c — Cold-start cost (first call, includes ensureCache() disk scan)
 *         Each bench iteration creates a fresh store so ensureCache() is never warmed.
 *         Represents first-query latency after a process restart.
 *
 * Store sizes: 100 / 1k / 5k / 10k entries (all semantic kind, pre-embedded).
 * Large sizes (10k) are always run; set BENCH_LARGE=1 to add a 50k suite.
 *
 * Run:
 *   npx vitest bench tests/bench/memory-store.bench.ts
 *   BENCH_LARGE=1 npx vitest bench tests/bench/memory-store.bench.ts
 */

import { describe, bench, beforeAll } from 'vitest';
import { JsonMemoryStore } from '../../src/memory/memory-store.js';
import { HnswEmbeddingIndex } from '../../src/memory/hnsw-embedding-index.js';
import type { MemoryEntry } from '../../src/types/memory.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ─── Shared constants ─────────────────────────────────────────────────────────

const DIM = 1536;

function makeVector(seed: number): number[] {
  const vec: number[] = new Array(DIM);
  let x = seed | 1; // ensure non-zero
  for (let i = 0; i < DIM; i++) {
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    vec[i] = (x & 0xffff) / 0xffff - 0.5;
  }
  return vec;
}

const QUERY_EMBEDDING = makeVector(0xcafebabe);

// 10-term query that exercises all BM25 code paths (tokenise, IDF, tag match).
const QUERY_10TERM = 'typescript performance memory api testing refactor agent management important entry';

const SAMPLE_TAGS = ['typescript', 'performance', 'memory', 'api', 'testing', 'refactor'];

function makeEntry(i: number): MemoryEntry {
  const now = Date.now();
  return {
    id: randomUUID(),
    kind: 'semantic',
    content: `Entry ${i}: the agent uses typescript for performance and memory management. api testing is important for refactoring.`,
    tags: [SAMPLE_TAGS[i % SAMPLE_TAGS.length]!],
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    embedding: makeVector(i),
  };
}

// ─── Store builder ────────────────────────────────────────────────────────────

/**
 * Shared on-disk datasets keyed by size.
 * Built once during beforeAll; each sub-suite reads the same files so we avoid
 * re-generating 10k × 1536-float vectors multiple times.
 */
const DIRS = new Map<number, string>();

async function buildDataset(n: number): Promise<string> {
  if (DIRS.has(n)) return DIRS.get(n)!;

  const dir = await fs.mkdtemp(path.join(tmpdir(), `bench-store-${n}-`));
  const kindDir = path.join(dir, 'semantic');
  await fs.mkdir(kindDir, { recursive: true });

  const entries = Array.from({ length: n }, (_, i) => makeEntry(i));

  const embeddingsObj: Record<string, number[]> = {};
  await Promise.all(
    entries.map(e => {
      if (e.embedding) embeddingsObj[e.id] = e.embedding;
      const { embedding: _, ...entryWithoutEmbedding } = e;
      return fs.writeFile(
        path.join(kindDir, `${e.id}.json`),
        JSON.stringify(entryWithoutEmbedding),
        { mode: 0o600 }
      );
    })
  );
  await fs.writeFile(
    path.join(dir, 'embeddings.json'),
    JSON.stringify(embeddingsObj),
    { mode: 0o600 }
  );

  DIRS.set(n, dir);
  return dir;
}

/** Build a warmed store (HNSW graph + LRU cache pre-populated). */
async function buildWarmedStore(n: number): Promise<JsonMemoryStore> {
  const dir = await buildDataset(n);
  const embeddingIndex = new HnswEmbeddingIndex(dir);
  const store = new JsonMemoryStore(dir, 10_000, embeddingIndex);
  // One warm-up call: triggers HNSW graph rebuild + ensureCache() disk scan.
  await store.search({ queryEmbedding: QUERY_EMBEDDING, limit: 10 });
  return store;
}

/** Build a fresh (cold) store without running any warm-up. */
async function buildColdStore(n: number): Promise<JsonMemoryStore> {
  const dir = await buildDataset(n);
  const embeddingIndex = new HnswEmbeddingIndex(dir);
  return new JsonMemoryStore(dir, 10_000, embeddingIndex);
}

const SIZES = [100, 1_000, 5_000, 10_000];
const includeLarge = process.env['BENCH_LARGE'] === '1';

// ─── A2a: HNSW-only (no text scoring) ────────────────────────────────────────
// search() with no `query` string → skips BM25, returns top-k by cosine only.

describe('A2a: HNSW-only search (cosine, no BM25)', () => {
  let stores: Map<number, JsonMemoryStore>;

  beforeAll(async () => {
    const allSizes = includeLarge ? [...SIZES, 50_000] : SIZES;
    const built = await Promise.all(allSizes.map(n => buildWarmedStore(n).then(s => [n, s] as const)));
    stores = new Map(built);
  }, 300_000);

  const OPTS = { iterations: 50, warmupIterations: 5, time: 0 };

  bench('hnsw-only @ 100 entries', async () => {
    await stores.get(100)!.search({ queryEmbedding: QUERY_EMBEDDING, limit: 10 });
  }, OPTS);

  bench('hnsw-only @ 1k entries', async () => {
    await stores.get(1_000)!.search({ queryEmbedding: QUERY_EMBEDDING, limit: 10 });
  }, OPTS);

  bench('hnsw-only @ 5k entries', async () => {
    await stores.get(5_000)!.search({ queryEmbedding: QUERY_EMBEDDING, limit: 10 });
  }, OPTS);

  bench('hnsw-only @ 10k entries', async () => {
    await stores.get(10_000)!.search({ queryEmbedding: QUERY_EMBEDDING, limit: 10 });
  }, OPTS);

  bench('hnsw-only @ 50k entries (BENCH_LARGE=1)', async () => {
    if (includeLarge) await stores.get(50_000)!.search({ queryEmbedding: QUERY_EMBEDDING, limit: 10 });
  }, OPTS);
});

// ─── A2b: Full hybrid search (HNSW + BM25-TF + tag boost) ────────────────────

describe('A2b: Full hybrid search (HNSW + BM25-TF + tag boost)', () => {
  let stores: Map<number, JsonMemoryStore>;

  beforeAll(async () => {
    const allSizes = includeLarge ? [...SIZES, 50_000] : SIZES;
    const built = await Promise.all(allSizes.map(n => buildWarmedStore(n).then(s => [n, s] as const)));
    stores = new Map(built);
  }, 300_000);

  const OPTS = { iterations: 30, warmupIterations: 5, time: 0 };

  bench('hybrid @ 100 entries, 3-term', async () => {
    await stores.get(100)!.search({
      queryEmbedding: QUERY_EMBEDDING,
      query: 'typescript performance memory',
      limit: 10,
    });
  }, OPTS);

  bench('hybrid @ 100 entries, 10-term', async () => {
    await stores.get(100)!.search({
      queryEmbedding: QUERY_EMBEDDING,
      query: QUERY_10TERM,
      limit: 10,
    });
  }, OPTS);

  bench('hybrid @ 1k entries, 3-term', async () => {
    await stores.get(1_000)!.search({
      queryEmbedding: QUERY_EMBEDDING,
      query: 'typescript performance memory',
      limit: 10,
    });
  }, OPTS);

  bench('hybrid @ 1k entries, 10-term', async () => {
    await stores.get(1_000)!.search({
      queryEmbedding: QUERY_EMBEDDING,
      query: QUERY_10TERM,
      limit: 10,
    });
  }, OPTS);

  bench('hybrid @ 5k entries, 3-term', async () => {
    await stores.get(5_000)!.search({
      queryEmbedding: QUERY_EMBEDDING,
      query: 'typescript performance memory',
      limit: 10,
    });
  }, OPTS);

  bench('hybrid @ 5k entries, 10-term', async () => {
    await stores.get(5_000)!.search({
      queryEmbedding: QUERY_EMBEDDING,
      query: QUERY_10TERM,
      limit: 10,
    });
  }, OPTS);

  bench('hybrid @ 10k entries, 3-term', async () => {
    await stores.get(10_000)!.search({
      queryEmbedding: QUERY_EMBEDDING,
      query: 'typescript performance memory',
      limit: 10,
    });
  }, OPTS);

  bench('hybrid @ 10k entries, 10-term', async () => {
    await stores.get(10_000)!.search({
      queryEmbedding: QUERY_EMBEDDING,
      query: QUERY_10TERM,
      limit: 10,
    });
  }, OPTS);

  bench('hybrid @ 50k entries, 3-term (BENCH_LARGE=1)', async () => {
    if (includeLarge) await stores.get(50_000)!.search({
      queryEmbedding: QUERY_EMBEDDING,
      query: 'typescript performance memory',
      limit: 10,
    });
  }, OPTS);
});

// ─── A2c: Cold-start cost (ensureCache() disk scan on first call) ─────────────
// Each bench iteration builds a fresh, unwarmed store so the cache is never hot.
// This measures first-query latency including HNSW graph rebuild + LRU population.

describe('A2c: Cold-start (first call, uncached)', () => {
  // Pre-build on-disk datasets so setup I/O is not charged to the bench timing.
  beforeAll(async () => {
    await Promise.all(SIZES.map(n => buildDataset(n)));
  }, 300_000);

  // Fewer iterations: each iteration builds a fresh store (graph rebuild is slow).
  const OPTS = { iterations: 10, warmupIterations: 2, time: 0 };

  bench('cold-start first search @ 100 entries', async () => {
    const store = await buildColdStore(100);
    await store.search({ queryEmbedding: QUERY_EMBEDDING, query: 'typescript performance memory', limit: 10 });
  }, OPTS);

  bench('cold-start first search @ 1k entries', async () => {
    const store = await buildColdStore(1_000);
    await store.search({ queryEmbedding: QUERY_EMBEDDING, query: 'typescript performance memory', limit: 10 });
  }, OPTS);

  bench('cold-start first search @ 5k entries', async () => {
    const store = await buildColdStore(5_000);
    await store.search({ queryEmbedding: QUERY_EMBEDDING, query: 'typescript performance memory', limit: 10 });
  }, OPTS);

  bench('cold-start first search @ 10k entries', async () => {
    const store = await buildColdStore(10_000);
    await store.search({ queryEmbedding: QUERY_EMBEDDING, query: 'typescript performance memory', limit: 10 });
  }, OPTS);
});

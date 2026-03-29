/**
 * A1: searchByCosine latency — JsonEmbeddingIndex (brute-force) vs. HnswEmbeddingIndex.
 *
 * Both suites use identical vector data at the same sizes so the numbers are
 * directly comparable. Setup writes embeddings.json in one shot and warms the
 * in-memory cache before any bench iteration runs.
 *
 * Embedding dimension: 1536 (text-embedding-3-small).
 *
 * Run:
 *   npx vitest bench tests/bench/embedding-index.bench.ts
 *   BENCH_LARGE=1 npx vitest bench tests/bench/embedding-index.bench.ts
 */

import { describe, bench, beforeAll } from 'vitest';
import { JsonEmbeddingIndex } from '../../src/memory/embedding-index.js';
import { HnswEmbeddingIndex } from '../../src/memory/hnsw-embedding-index.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

const DIM = 1536;

function makeVector(seed: number): number[] {
  const vec: number[] = new Array(DIM);
  let x = seed | 1;
  for (let i = 0; i < DIM; i++) {
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    vec[i] = (x & 0xffff) / 0xffff - 0.5;
  }
  return vec;
}

const QUERY = makeVector(0xdeadbeef);

/** Shared vector data keyed by size — built once, reused for both implementations. */
const DATASETS = new Map<number, Record<string, number[]>>();

function getDataset(n: number): Record<string, number[]> {
  if (!DATASETS.has(n)) {
    const obj: Record<string, number[]> = {};
    for (let i = 0; i < n; i++) obj[randomUUID()] = makeVector(i);
    DATASETS.set(n, obj);
  }
  return DATASETS.get(n)!;
}

async function buildJsonIndex(n: number): Promise<{ index: JsonEmbeddingIndex; dir: string }> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), `bench-json-${n}-`));
  await fs.writeFile(path.join(dir, 'embeddings.json'), JSON.stringify(getDataset(n)), { mode: 0o600 });
  const index = new JsonEmbeddingIndex(dir);
  await index.searchByCosine(QUERY, 1); // warm loadMap cache
  return { index, dir };
}

async function buildHnswIndex(n: number): Promise<{ index: HnswEmbeddingIndex; dir: string }> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), `bench-hnsw-${n}-`));
  // Write embeddings.json — HnswEmbeddingIndex loads and builds the graph from it
  await fs.writeFile(path.join(dir, 'embeddings.json'), JSON.stringify(getDataset(n)), { mode: 0o600 });
  const index = new HnswEmbeddingIndex(dir);
  await index.searchByCosine(QUERY, 1); // warm: triggers graph rebuild from JSON
  return { index, dir };
}

const BENCH_OPTS = { iterations: 50, warmupIterations: 5, time: 0 };
const includeLarge = process.env['BENCH_LARGE'] === '1';

// ─── Brute-force (before) ─────────────────────────────────────────────────────

describe('A1a: JsonEmbeddingIndex (brute-force O(n×d))', () => {
  let json1k: JsonEmbeddingIndex;
  let json5k: JsonEmbeddingIndex;
  let json10k: JsonEmbeddingIndex;
  let json50k: JsonEmbeddingIndex | null = null;

  beforeAll(async () => {
    const [r1k, r5k, r10k] = await Promise.all([
      buildJsonIndex(1_000),
      buildJsonIndex(5_000),
      buildJsonIndex(10_000),
    ]);
    json1k = r1k.index;
    json5k = r5k.index;
    json10k = r10k.index;
    if (includeLarge) json50k = (await buildJsonIndex(50_000)).index;
  }, 120_000);

  bench('[json]  1k entries', async () => { await json1k.searchByCosine(QUERY, 10); }, BENCH_OPTS);
  bench('[json]  5k entries', async () => { await json5k.searchByCosine(QUERY, 10); }, BENCH_OPTS);
  bench('[json] 10k entries', async () => { await json10k.searchByCosine(QUERY, 10); }, BENCH_OPTS);
  bench('[json] 50k entries (BENCH_LARGE=1)', async () => {
    if (json50k) await json50k.searchByCosine(QUERY, 10);
  }, BENCH_OPTS);
});

// ─── HNSW (after) ────────────────────────────────────────────────────────────

describe('A1b: HnswEmbeddingIndex (HNSW O(log n))', () => {
  let hnsw1k: HnswEmbeddingIndex;
  let hnsw5k: HnswEmbeddingIndex;
  let hnsw10k: HnswEmbeddingIndex;
  let hnsw50k: HnswEmbeddingIndex | null = null;

  beforeAll(async () => {
    const [r1k, r5k, r10k] = await Promise.all([
      buildHnswIndex(1_000),
      buildHnswIndex(5_000),
      buildHnswIndex(10_000),
    ]);
    hnsw1k = r1k.index;
    hnsw5k = r5k.index;
    hnsw10k = r10k.index;
    if (includeLarge) hnsw50k = (await buildHnswIndex(50_000)).index;
  }, 180_000);

  bench('[hnsw]  1k entries', async () => { await hnsw1k.searchByCosine(QUERY, 10); }, BENCH_OPTS);
  bench('[hnsw]  5k entries', async () => { await hnsw5k.searchByCosine(QUERY, 10); }, BENCH_OPTS);
  bench('[hnsw] 10k entries', async () => { await hnsw10k.searchByCosine(QUERY, 10); }, BENCH_OPTS);
  bench('[hnsw] 50k entries (BENCH_LARGE=1)', async () => {
    if (hnsw50k) await hnsw50k.searchByCosine(QUERY, 10);
  }, BENCH_OPTS);
});

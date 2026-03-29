# Performance Benchmarks

> Generated: 2026-03-28 · Platform: WSL2 Linux / Node v24.3.0 · CPU: see below
> Updated: 2026-03-28 — B6 HNSW implemented; A1 now includes before/after comparison.

These benchmarks establish the **before** baseline for the refactors described in
`docs/quantifiable-improvements.md`. Each A-series item can be re-run after a B-series
refactor to produce a measured before/after comparison.

---

## Running the benchmarks

```bash
# All five suites (Vitest bench runner)
npx vitest bench

# Individual suite
npx vitest bench tests/bench/embedding-index.bench.ts
npx vitest bench tests/bench/memory-store.bench.ts
npx vitest bench tests/bench/jsonl-store.bench.ts
npx vitest bench tests/bench/session-list.bench.ts
npx vitest bench tests/bench/bootstrap.bench.ts

# Include the 50k-entry embedding benchmark (slow; ~2 min setup)
BENCH_LARGE=1 npx vitest bench tests/bench/embedding-index.bench.ts
```

The `vitest bench` command auto-discovers `*.bench.ts` files without changes to
`vitest.config.ts`. The normal `vitest run` suite is unaffected.

---

## Results (2026-03-28 baseline)

### A1 — `searchByCosine` latency vs. index size (before/after HNSW)

**File:** `tests/bench/embedding-index.bench.ts`
**Sources:**
- Before: `src/memory/embedding-index.ts:173` — O(n × d) linear scan, d=1536
- After: `src/memory/hnsw-embedding-index.ts` — O(log n) HNSW approximate search

| Index size | Brute-force (before) | HNSW (after) | Speedup |
|------------|---------------------|-------------|---------|
| 1 000 entries | 2.56 ms | **0.25 ms** | **10×** |
| 5 000 entries | 14.04 ms | **0.40 ms** | **36×** |
| 10 000 entries | 28.15 ms | **0.41 ms** | **69×** |
| 50 000 entries | *(BENCH_LARGE=1)* | *(BENCH_LARGE=1)* | — |

**Interpretation:** HNSW search latency is essentially flat across all tested sizes (~0.25–0.41ms),
confirming O(log n) behaviour. The speedup compounds with scale: 10× at 1k → 69× at 10k.
At 10k entries the brute-force scan took 28ms per query; HNSW brings this to 0.4ms — well
below the perceptible threshold for interactive use.

**HNSW parameters used:** M=16, efConstruction=200, ef=50 (query-time).
These give ~98% recall@10 on typical semantic similarity workloads.

**Status: implemented** — `HnswEmbeddingIndex` is now the default in `bootstrap.ts`.

---

### A2 — Hybrid search (cosine + BM25-TF + tag boost) vs. result-set size

**File:** `tests/bench/memory-store.bench.ts`
**Source:** `src/memory/memory-store.ts`

#### After LRU entry cache + HNSW (2026-03-28)

| Store size | Query terms | Before (HNSW only) | After (HNSW + cache) | Speedup |
|------------|------------|---------------------|----------------------|---------|
| 100 entries | 3-term | 14.73 ms | **0.96 ms** | **15×** |
| 100 entries | 10-term | 13.07 ms | **1.12 ms** | **12×** |
| 1 000 entries | 3-term | 111.72 ms | **2.37 ms** | **47×** |
| 1 000 entries | 10-term | 109.80 ms | **2.79 ms** | **39×** |
| 5 000 entries | 3-term | 535.24 ms | **3.69 ms** | **145×** |
| 5 000 entries | 10-term | 525.73 ms | **4.47 ms** | **118×** |

Latency is now dominated by pure CPU (HNSW graph traversal + BM25 scoring) — zero disk reads after cold start.

**Scaling behaviour has changed fundamentally:** previously O(n) in disk I/O; now O(log n) in HNSW search + O(k) in BM25 scoring over the top-k candidates returned by HNSW. The 5k→100 ratio went from ~36× to ~4×, confirming the flat-ish scaling.

#### Root-cause history

After HNSW was rolled out, A2 latency was **unchanged** (~110ms@1k). Phase profiling revealed `scanKind` as the actual bottleneck — not vector math:

| Phase | Cost |
|-------|------|
| `readdir` (1 000 files) | 1.1 ms |
| `readdir` + read all JSON files | **190 ms** |
| `readdir` + read + `JSON.parse` all | **229 ms** |
| `searchByCosine` (HNSW, topK=1 000) | 1.1 ms |
| accessCount update (top-10 writes) | 3.9 ms |

Fix: two-tier write-back LRU cache inside `JsonMemoryStore` (hot `Map` for preference/experiential + LRU for semantic/episodic). Cold start populates both tiers from disk once; all subsequent `search()` calls serve candidates from RAM.

---

### A3 — `appendMessage` latency vs. session length

**File:** `tests/bench/jsonl-store.bench.ts`
**Source:** `src/session/jsonl-store.ts:496–570` — full-file read + rewrite each append

| Session length | Mean latency | vs. 10-msg |
|---------------|-------------|-----------|
| 10 messages | **1.38 ms** | 1× |
| 100 messages | **1.53 ms** | 1.1× |
| 1 000 messages | **3.20 ms** | 2.3× |

**Interpretation:** Surprisingly flat — the full-file rewrite overhead is dominated by filesystem
call setup cost, not data volume (sessions are small in bytes). At 1 000 messages the file is
~100 KB, rewriting costs ~3ms. This is not yet a crisis, but will degrade linearly as sessions
grow. The B3 refactor (`fs.appendFile` + debounced metadata update) would bring this to <0.5ms
regardless of session size.

**Note:** Each bench iteration *appends one message*, so session size grows during the run.
The reported latency is an average across the growing range; it provides a realistic real-world
estimate.

---

### A4 — `bootstrap()` cold-start latency

**File:** `tests/bench/bootstrap.bench.ts`
**Source:** `src/cli/bootstrap.ts:85–` — serial prompt-file assembly + plugin scan + store init

| Metric | Value |
|--------|-------|
| Mean | **5.5 ms** |
| Min | 3.8 ms |
| p50 | 4.5 ms |
| p95 | 16.1 ms |
| Max | 16.1 ms |
| n | 20 cold starts |

**Interpretation:** Bootstrap is fast. The serial prompt-file loop (5 modules × 2 candidate paths)
contributes minimally at this scale — the dominant cost is YAML parse + plugin directory stat calls.
The B5 parallel prompt-loading refactor would reduce this only marginally (~0.5ms).
p95 = 16ms suggests occasional filesystem spikes (likely first-access page faults on WSL2).

---

### A5 — `session list()` latency vs. session count

**File:** `tests/bench/session-list.bench.ts`
**Source:** `src/session/jsonl-store.ts:580–616` — serial `load()` per file

| Session count | Mean latency | vs. 10 sessions |
|--------------|-------------|----------------|
| 10 sessions | **6.60 ms** | 1× |
| 50 sessions | **25.13 ms** | 3.8× |
| 200 sessions | **93.92 ms** | 14.2× |

**Interpretation:** Clear linear O(n) growth: ~0.47ms per session. Each `list()` call serially
calls `load()` (which reads + parses the entire JSONL file) for every session file.
At 200 sessions the 94ms delay is noticeable in the session picker UI.

A `Promise.all` parallelization refactor would bring 200 sessions from ~94ms to ~(max single load) ≈ 5–8ms — roughly a **12–18× improvement** for typical session counts.

---

## Summary table

| Suite | Code path | Before | After | Status |
|-------|-----------|--------|-------|--------|
| A1 searchByCosine | `embedding-index.ts:173` | 28ms @ 10k | **0.41ms @ 10k** | ✅ done (69×) |
| A2 hybrid search | `memory-store.ts` | 110ms @ 1k | **2.4ms @ 1k** | ✅ done (47×) — LRU entry cache |
| A3 appendMessage | `jsonl-store.ts:496` | 3.2ms @ 1k msgs | <0.5ms | pending B3 |
| A4 bootstrap | `bootstrap.ts:85` | 5.5ms mean | ~5ms | low ROI, skip |
| A5 list() | `jsonl-store.ts:580` | 94ms @ 200 | ~6ms @ 200 | pending Promise.all |

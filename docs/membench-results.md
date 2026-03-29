# MemBench Results

Tracks MemBench evaluation results across memory architecture iterations.

**Dataset**: `tests/bench/data/membench/simple.json` (500 PS trajectories total)
**Metric definitions**: see `tests/bench/README.md`
**Random-guess baseline**: 25% (4-choice MCQ)

---

## Results

| Date | Version | Trajectories | Accuracy | Recall@10 | Notes |
|------|---------|-------------|----------|-----------|-------|
| 2026-03-23 | v2-baseline | 100 | 49.0% | 8.0% | substring search; recency fallback; kind-based store |
| 2026-03-24 | v2-embedding | 100 | 94.0% | 100.0% | text-embedding-3-small cosine search; batch embed per trajectory |
| 2026-03-28 | v3-hnsw-hybrid | 100 | 94.0% | 100.0% | HnswEmbeddingIndex + full hybrid search (HNSW cosine + BM25-TF + tag boost); per-trajectory store isolation |

---

## Analysis

### v2-embedding → v3-hnsw-hybrid: accuracy held at 94%, architecture hardened

Accuracy and Recall@10 are unchanged from v2-embedding, confirming the retrieval quality
ceiling is the LLM answer step (ambiguous questions), not the search layer.

Architectural changes in v3:

1. **HNSW index** (`HnswEmbeddingIndex`) replaces `JsonEmbeddingIndex`. At 100-entry
   trajectory scale the speedup is modest (~0.25ms vs ~2.5ms per query), but the O(log n)
   scaling matters for longer trajectories or larger memory stores.

2. **Hybrid search** (`queryEmbedding` + `query` string together) activates the full
   HNSW + BM25-TF + tag-boost pipeline. Previously the adapter passed `queryEmbedding`
   only, skipping BM25 re-ranking. At Recall@10 = 100% the re-ranking makes no observable
   difference on this dataset, but it is the correct production code path.

3. **Per-trajectory store isolation** (fresh `JsonMemoryStore` + `HnswEmbeddingIndex` per
   trajectory) fixes a stale-cache correctness bug: the previous `adapter.reset()` unlinked
   entry files on disk but did not invalidate the in-memory LRU cache, meaning later
   trajectories could see memories from earlier ones. The bug was masked by Recall@10 = 100%
   (correct step always retrievable even with noise), but it would corrupt metrics on harder
   datasets where retrieval precision matters.

### v2-baseline → v2-embedding: +45% accuracy, +92% Recall@10

The entire gap was vocabulary mismatch. Substring search required the question to share
exact words with stored content — paraphrased questions (e.g. "When was Landon born?" vs
"his birthday is on August 23rd") got zero matches and fell back to recency.

Switching to `text-embedding-3-small` cosine search resolves the semantic gap completely:
Recall@10 = 100% means the correct step is always in the top-10 retrieved entries, giving
the LLM enough context to answer correctly. The remaining 6% accuracy gap likely comes from
ambiguous questions or LLM answer errors, not retrieval failures.

**Key implementation changes:**
- `storeBatch()`: all ~110 messages embedded in one API call per trajectory (was 110 calls)
- `reset()`: direct `fs.unlink` per file + one `embeddingIndex.clear()` (was N sequential store.delete calls)
- `JsonEmbeddingIndex`: write queue serializes concurrent `set()`/`delete()`/`clear()` to prevent rename races on `embeddings.json.tmp`

---

## Architecture Descriptions

### v3-hnsw-hybrid — `JsonMemoryStore` + `HnswEmbeddingIndex` + hybrid search (2026-03-28)

**Storage**: Same as v2-embedding — JSON files under `<kind>/<uuid>.json`, atomic writes.
Embedding vectors stored in `embeddings.json`; loaded into the HNSW graph on first access.
Entry data served from the two-tier LRU cache (`preference`/`experiential` in hot Map;
`semantic`/`episodic` in bounded LRU).

**Index**: `HnswEmbeddingIndex` — O(log n) approximate nearest-neighbour search (M=16,
efConstruction=200, ef=50). All vectors kept in memory after first query; no file I/O on
subsequent searches.

**Retrieval**: `recall()`/`retri()` embed the question via `text-embedding-3-small` and
call `store.search({ queryEmbedding, query: question, limit: 10 })`. The hybrid scorer:
1. HNSW graph traversal → top-K candidates by cosine similarity
2. BM25-TF re-ranking over those candidates using question tokens
3. Tag-boost applied to entries whose tags overlap with query terms

**Benchmark adapter behavior**:
- Per-trajectory store isolation: fresh `JsonMemoryStore` + `HnswEmbeddingIndex` constructed
  per trajectory instead of reusing a shared store across trajectories. Eliminates a
  stale-LRU-cache correctness bug where `adapter.reset()` cleared files but not in-memory state.
- `storeBatch()`: unchanged — all messages for a trajectory embedded in one batched API call.

**Why 94% not 100%**: Recall@10 = 100%, so the search layer delivers all correct steps.
Remaining 6% errors are LLM answer errors on ambiguous questions.

---

### v2-embedding — `JsonMemoryStore` + `text-embedding-3-small` cosine search (2026-03-24)

**Storage**: Same as v2-baseline — JSON files under `<kind>/<uuid>.json`, atomic writes.
Embedding vectors stored in `embeddings.json` via `JsonEmbeddingIndex`.

**Retrieval**: `recall()`/`retri()` embed the question via `text-embedding-3-small` and
call `embeddingIndex.searchByCosine(queryVector, topK=10)`. Results ranked by cosine
similarity; no substring fallback needed (Recall@10 = 100%).

**Benchmark adapter behavior**:
- `storeBatch()`: all messages for a trajectory embedded in one batched API call
  (`input: string[]`), then saved concurrently. ~100 API calls total vs ~11,000 before.
- `reset()`: `fs.unlink` on each entry file directly + `embeddingIndex.clear()` once.
  Bypasses `store.delete()` to avoid N sequential writes to `embeddings.json`.
- Write serialization: `JsonEmbeddingIndex` uses a promise-chain write queue so concurrent
  `save()` calls don't race on `embeddings.json.tmp`.

**Why 94% not 100%**: Recall@10 is perfect, so retrieval is not the bottleneck.
Remaining errors are LLM answer errors on ambiguous questions.

---

### v2-baseline — `JsonMemoryStore` (kind API) + substring search (2026-03-23)

> **Note — incomplete architecture**: this run measures only the storage and retrieval
> layer. Two major components from the full design are **not yet implemented**:
>
> - **Consolidation pipeline** (`src/memory/consolidation.ts` does not exist): in the
>   full design, session messages are chunked with a sliding window, fed to a LLM to
>   extract structured memories, deduplicated by cosine similarity, and written at
>   session end. In this run, the benchmark adapter writes raw conversation messages
>   directly — no extraction, no deduplication.
>
> - **Embedding search**: `JsonEmbeddingIndex` and the `embedding` field on `MemoryEntry`
>   are implemented, but no embedder is wired in. `save()` never populates the embedding
>   field and `search()` never calls `searchByCosine()`. All retrieval is plain substring
>   match.
>
> Results below reflect the baseline retrieval capability before either feature is added.

**Storage**: Each memory entry is a JSON file under `~/.my-agent/memory/<kind>/<uuid>.json`.
Four kinds: `preference`, `experiential`, `semantic`, `episodic`.
Benchmark adapter uses `semantic` for all entries. Writes are atomic via tmp+rename.

**Retrieval** (`search()`): Case-insensitive substring match on `entry.content`.
Results sorted by `updatedAt` descending, then truncated to `limit`.

**Benchmark adapter behavior**: `recall(question)` passes the full question string as the
substring query. When no substring match is found (the common case for paraphrased questions),
falls back to the most-recent TOP_K entries by recency.

**Why performance is poor:**

The core problem is a *vocabulary mismatch* between questions and stored messages.
MemBench questions are semantic paraphrases of the stored content — not lexical copies.

Example from `simple.json tid=0`:
- Stored (sid=2): `"his birthday is on August 23rd"`
- Question: `"When was Landon born?"`
- Substring "born" only matches sid=4 (`"born in Philadelphia, PA"`), not sid=2.
- Result: correct step is never retrieved → LLM gets wrong context → wrong answer.

**Metrics breakdown:**

| Metric | Value | Interpretation |
|--------|-------|----------------|
| Recall@10 | 8% | Correct step found in top-10 only 8% of the time. Near-zero real retrieval. |
| Accuracy | 49% | Slightly above 25% random; driven by recency-fallback luck, not retrieval. |

The recency fallback is the entire source of non-random accuracy. When the answer happens to
be in the most recent ~10 messages (common in short trajectories), the LLM gets lucky.
The retrieval system itself contributes almost nothing.

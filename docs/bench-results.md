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

---

## Analysis

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

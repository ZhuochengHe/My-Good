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

---

## Architecture Descriptions

### v2-baseline — `JsonMemoryStore` (kind API) + substring search (2026-03-23)

**Storage**: Each memory entry is a JSON file under `~/.my-agent/memory/<kind>/<uuid>.json`.
Four kinds: `procedural`, `experiential`, `semantic`, `episodic`.
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

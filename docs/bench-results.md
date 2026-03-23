# Benchmark Results

Tracks MemBench evaluation results across different memory architecture versions.

Dataset: `simple.json` (500 trajectories total)
Metric definitions: see `tests/bench/README.md`

---

## Results

| Date | Architecture | Trajectories | Accuracy | Recall@10 | Notes |
|------|-------------|-------------|----------|-----------|-------|
| 2026-03-23 | v1 baseline (substring search + recency fallback) | 100 | 49.0% | 9.0% | First run; recency fallback drives both metrics |

---

## Architecture Descriptions

### v1 baseline — `JsonMemoryStore` with substring search

**Storage**: Each memory entry is a JSON file under `~/.my-agent/memory/layer{1,2,3}/<uuid>.json`. Three layers with different semantics (L1: working, L2: persistent on-demand, L3: episodic with TTL). Writes are atomic via tmp+rename.

**Retrieval** (`search()`): Case-insensitive substring match on `entry.content`. Results sorted by `updatedAt` descending, then truncated to `limit`. No semantic understanding — query must share exact keywords with stored content.

**Benchmark adapter behavior**: When substring search returns no hits (the common case for paraphrased questions), falls back to returning the most-recent TOP_K entries by recency. This fallback is what produces non-zero Recall@10 (9%) and above-random Accuracy (49%) — not actual retrieval quality.

**Interpretation**: Accuracy=49% vs. random baseline of 25% is driven entirely by recency luck (recent steps tend to be relevant). Recall@10=9% means the correct source step appears in the top-10 recency fallback only 9% of the time. True semantic retrieval score is effectively 0%.

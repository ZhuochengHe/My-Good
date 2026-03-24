# MemBench Baseline Runner

Runs the [MemBench](https://github.com/kyegomez/MemBench) benchmark against the
current memory implementation to measure retrieval quality.

## Prerequisites

- `OPENAI_API_KEY` set in your environment (used by the LLM judge step)
- `simple.json` dataset placed at `tests/bench/data/membench/simple.json`
  (500 trajectories; directory is git-ignored)

## Running

**Full run (all 500 trajectories):**

```bash
npx tsx tests/bench/membench-runner.ts \
  --dataset tests/bench/data/membench/simple.json \
  --output tests/bench/membench-results/baseline-simple.json
```

**Quick smoke test (first 50 trajectories):**

```bash
npx tsx tests/bench/membench-runner.ts \
  --dataset tests/bench/data/membench/simple.json \
  --output tests/bench/membench-results/baseline-simple.json \
  --limit 50
```

**Verbose output (prints each question + answer):**

```bash
npx tsx tests/bench/membench-runner.ts \
  --dataset tests/bench/data/membench/simple.json \
  --output tests/bench/membench-results/baseline-simple.json \
  --verbose
```

## Metrics

| Metric | Description |
|--------|-------------|
| `accuracy` | Fraction of questions answered correctly by the LLM given retrieved context |
| `recallAt10` | Fraction of target steps present in the top-10 retrieved entries (Recall@10) |

## Output format

Results are written as JSON:

```json
{
  "datasetPath": "tests/bench/data/membench/simple.json",
  "runAt": "2026-03-23T04:28:50.296Z",
  "totalTrajectories": 500,
  "accuracy": 0.38,
  "recallAt10": 0.05
}
```

Results are saved to `tests/bench/membench-results/` (git-ignored).
Architecture comparison results are tracked separately in `docs/bench-results.md`.

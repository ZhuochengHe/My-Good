# Benchmark Adaptation: MemBench

> Adaptation plan for using MemBench to evaluate the memory module.
> Research notes on both MemBench and LongMemEval: `docs/ref/memory-benchmark-research.md`.

---

## Why MemBench

MemBench was designed for agent systems with explicit store/recall interfaces — structurally
matching our consolidation-based memory architecture. Key advantages over LongMemEval for
our use case:

- **No external LLM judge needed**: all questions are 4-choice multiple choice
- **Active memory interface**: `store()` / `recall()` maps directly to our tools
- **Lower adaptation cost**: implement one interface vs. writing a full ingestion harness
- **Reflective question types**: tests inference from facts, not just verbatim recall

LongMemEval remains useful for testing `knowledge-update` and `temporal-reasoning` behaviors
(TTL logic, overwriting stale values) — adapt it in a future phase once the MemBench baseline
is established.

---

## MemBench Interface

MemBench defines a `BaseMemory` abstract class with four methods:

```python
memory.store(formatted_message: str) → None   # write phase: called once per conversation step
memory.recall(question: str) → str            # read phase: called at query time, returns context string
memory.retri(question: str) → list[int]       # returns retrieved step indices (for Recall@10 metric)
memory.reset() → None                         # clears all memory between trajectories
```

---

## Interface Mapping

| MemBench method | Our system | Notes |
|-----------------|-----------|-------|
| `store(message)` | Consolidation pipeline | Single message → extract memories → embed → dedup → save |
| `recall(question)` | `search_memory` tool | Embed question → cosine search → format top-k as context string |
| `retri(question)` | `search_memory` returning `sourceRef` values | Requires `sourceRef` field set at store time |
| `reset()` | `memoryStore.deleteAll(kind)` × 4 | Clear all entries between trajectories |

### `sourceRef` field

MemBench assigns a `step_id` (integer) to each message in a trajectory. When storing a
message, the adapter records this ID in `MemoryEntry.sourceRef`. At `retri()` time, the
adapter returns the `sourceRef` values of the top-k retrieved entries as the retrieved
step index list.

This enables the **Recall@10** metric: `|retrieved_step_ids ∩ target_step_ids| / |target_step_ids|`.

---

## Sub-datasets

MemBench has four sub-datasets organized by two axes:

| | Factual memory | Reflective memory |
|---|---|---|
| **Participation** (agent in dialogue) | PS-FM | PS-RM |
| **Observation** (agent watches stream) | OS-FM | OS-RM |

**Recommended evaluation order:**

1. **PS-FM** first — participation + factual is the closest match to our usage pattern
   (agent is in the conversation, stores facts). Baseline accuracy here is the primary metric.
2. **OS-FM** — observation mode tests whether our consolidation can extract facts from
   third-party information streams (e.g. user describing someone else).
3. **PS-RM** and **OS-RM** — reflective types require inference from low-level facts
   (e.g. infer "user likes action movies" from specific titles). Harder; run after PS-FM baseline.

---

## Question Types Covered

**Factual (8 types):**

| Code | Type | What it stresses in our system |
|------|------|-------------------------------|
| `sh` | Single-hop | Basic recall — was the fact stored at all? |
| `mh` | Multi-hop | Cross-entry reasoning — are related facts linked? |
| `comp` | Comparative | Two-entity search — tag/embedding distinguishes entities |
| `agg` | Aggregative | Multi-entry aggregation — search must return all relevant entries |
| `pp` | Post-processing | LLM reasoning over retrieved context |
| `ku` | Knowledge-update | Was the stale value overwritten by merge/update? |
| `ssa` | Single-session-assistant | Are the agent's own responses stored (source="agent")? |
| `msa` | Multi-session-assistant | Cross-session agent response recall |

**Reflective (2 types):** Preference, Emotion — require consolidation LLM to infer
high-level patterns from low-level facts.

---

## Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **Accuracy** | `# correct / # total` across all trajectories | Primary metric |
| **Recall@10** | `|retrieved ∩ target_step_ids| / |target_step_ids|` (top-10) | Measures search quality |
| **Capacity** | Accuracy-vs-token-count curve (via `step_cap` mode) | Shows degradation at scale |
| **Efficiency** | Average wall-clock time per `store()` and `recall()` call | Measures consolidation cost |

---

## Adapter Implementation

### Location

```
tests/bench/
  membench-adapter.ts     # TypeScript adapter wrapping our MemoryStore
  membench-runner.ts      # Harness: loads dataset, runs trajectories, computes metrics
  membench-results/       # Output directory for results JSON
```

### Adapter sketch

```typescript
import type { MemoryStore } from '../../src/types/memory.js';
import { consolidate } from '../../src/memory/consolidation.js';
import { createMemoryEntry } from '../../src/types/memory.js';

export class MemBenchAdapter {
  constructor(
    private readonly store: MemoryStore,
    private readonly embedFn: (text: string) => Promise<number[]>
  ) {}

  /**
   * store() is called once per conversation step.
   * Runs the full consolidation pipeline on a single message.
   * Sets sourceRef to the MemBench step ID so retri() can return it.
   */
  async store(message: string, stepId: number): Promise<void> {
    await consolidate([{ role: 'user', content: message }], this.store, {
      sourceRef: String(stepId),
    });
  }

  /**
   * recall() embeds the question and returns top-k memory content as a context string.
   */
  async recall(question: string): Promise<string> {
    const queryEmbedding = await this.embedFn(question);
    const results = await this.store.search({
      query: question,
      limit: 10,
    });
    return results.map(e => e.content).join('\n');
  }

  /**
   * retri() returns the sourceRef values of top-10 retrieved entries as integers.
   * Used for Recall@10 computation.
   */
  async retri(question: string): Promise<number[]> {
    const results = await this.store.search({ query: question, limit: 10 });
    return results
      .filter(e => e.sourceRef !== undefined)
      .map(e => parseInt(e.sourceRef as string, 10));
  }

  /**
   * reset() clears all memory entries between trajectories.
   */
  async reset(): Promise<void> {
    for (const kind of ['episodic', 'semantic', 'procedural', 'experiential'] as const) {
      const all = await this.store.search({ kind, limit: 10000 });
      await Promise.all(all.map(e => this.store.delete(e.id)));
    }
  }
}
```

### Runner sketch

```typescript
// tests/bench/membench-runner.ts
// Loads a MemBench dataset file, runs trajectories, outputs accuracy + Recall@10

async function runBenchmark(datasetPath: string, adapter: MemBenchAdapter) {
  const trajectories = JSON.parse(await fs.readFile(datasetPath, 'utf-8'));
  let correct = 0;
  let total = 0;
  const recallScores: number[] = [];

  for (const traj of trajectories) {
    await adapter.reset();

    // Store phase: feed all messages
    for (const session of traj.message_list) {
      for (const step of session) {
        await adapter.store(step.user_message ?? step.message, step.sid ?? step.mid);
      }
    }

    // Query phase
    const { question, choices, ground_truth, target_step_id } = traj.QA;
    const context = await adapter.recall(question);

    // LLM picks from A/B/C/D given context + question
    const choice = await llmChoose(context, question, choices);
    if (choice === ground_truth) correct++;
    total++;

    // Recall@10
    const retrieved = await adapter.retri(question);
    const targets = new Set(target_step_id.flat());
    const hits = retrieved.filter(id => targets.has(id)).length;
    recallScores.push(hits / targets.size);
  }

  return {
    accuracy: correct / total,
    recallAt10: recallScores.reduce((a, b) => a + b, 0) / recallScores.length,
  };
}
```

---

## Running the Benchmark

### Setup

```bash
# 1. Download MemBench dataset
#    Dataset available at: https://github.com/import-myself/Membench
#    Place files under: tests/bench/data/membench/

# 2. Set environment variables
export OPENAI_API_KEY=...

# 3. Run baseline (PS-FM sub-dataset)
npx ts-node tests/bench/membench-runner.ts \
  --dataset tests/bench/data/membench/PS-FM.json \
  --output tests/bench/membench-results/baseline-ps-fm.json
```

### Interpreting results

- **Accuracy on PS-FM**: primary health metric for single-hop factual recall
- **Recall@10 on PS-FM**: measures whether embedding search retrieves the right source steps
- **Accuracy on `ku` type**: directly validates knowledge-update (merge/overwrite) logic
- **Efficiency `store()` time**: captures consolidation pipeline latency per message

### Iteration workflow

```
1. Run baseline on current implementation → record results/baseline-ps-fm.json
2. Make memory system change
3. Re-run benchmark → compare accuracy + Recall@10
4. Keep change if metrics improve or stay within noise threshold (~2%)
```

---

## LongMemEval (Future Phase)

### Why it's harder than MemBench

LongMemEval embeds evidence **incidentally** inside filler sessions (e.g. a user mentions they
bought a car while asking about insurance). The primary failure mode is not search quality but
**consolidation extraction quality** — whether the consolidation LLM picks up the fact at all.
Running LongMemEval before consolidation is implemented will produce near-zero accuracy and
reveal nothing actionable. It is therefore deferred until after MemBench iteration.

Full `longmemeval_s` (~40 sessions/question, 500 questions) would require:
- ~20,000 consolidation calls (40 sessions × 500 questions) → ~$12
- GPT-4o judge for all 500 answers → ~$0.50–1.00
- A Python ingestion harness or TypeScript equivalent

`longmemeval_m` (~500 sessions/question) is not feasible: ~$150 in consolidation calls alone.

### Recommended entry point: oracle subset

`longmemeval_oracle` removes all filler sessions — each question gets only the 1–3 evidence
sessions that actually contain the answer. This eliminates the haystack retrieval problem and
isolates two specific behaviors:

| Question type | What it tests in our system |
|---|---|
| `knowledge-update` | Does merge/overwrite correctly replace the stale value? |
| `abstention` | Does an empty search result cause the LLM to say "I don't know"? |

**Estimated cost for oracle subset (knowledge-update + abstention only, ~80 questions):**
- ~80 × 2 sessions avg = ~160 consolidation calls → ~$0.10
- GPT-4o judge for 80 answers → ~$0.05
- Total: **< $0.20 per run**

This is the right entry point after MemBench baseline is established.

### Ingestion harness design

```
for each question in longmemeval_oracle filtered to [knowledge-update, abstention]:
    reset memory store
    for each session in haystack_sessions (chronological order):
        consolidate(session.messages, date=haystack_date) → save memories
    answer = search_memory(question) → LLM generates hypothesis string
    write {"question_id": ..., "hypothesis": answer} to output JSONL

# Then run the existing LongMemEval evaluation scripts:
python3 src/evaluation/evaluate_qa.py gpt-4o hypothesis.jsonl longmemeval_oracle.json
python3 src/evaluation/print_qa_metrics.py hypothesis.eval-results-gpt4o longmemeval_oracle.json
```

Key difference from MemBench: `consolidate()` must accept a `date` parameter so that
temporal metadata is preserved in episodic memories — required for `temporal-reasoning`
type questions if those are added later.

### Full LongMemEval (longmemeval_s, all types)

After the oracle subset validates core behaviors, a full run on `longmemeval_s` tests
end-to-end retrieval quality across all 6 question types. Expected to be significantly
harder due to filler session noise. Meaningful only after consolidation extraction quality
is tuned via MemBench iteration.

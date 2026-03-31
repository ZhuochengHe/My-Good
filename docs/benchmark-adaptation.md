# Benchmark Adaptation: Memory & Planning Layer

> Memory benchmarks (MemBench, LongMemEval): evaluate retrieval accuracy and consolidation quality.
> Planning / agent benchmarks (GAIA, τ-bench, ToolBench): evaluate planning quality and tool-use reliability.
> Research notes on MemBench and LongMemEval: `docs/reference/memory-benchmark-research.md`.

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

---

## Part 2 — Planning & Agent Capability Benchmarks

These benchmarks evaluate the planning layer and general agent capability: **planning quality**
(can the agent complete multi-step goals?), **tool-use breadth** (does the plugin system
generalize?), and **reliability** (does it succeed consistently, not just occasionally?).

MemBench measures memory retrieval; these measure whether the agent actually solves tasks.
They are orthogonal dimensions.

---

## Benchmark Overview

| Benchmark | What it tests | Adapter effort | Cost | Priority |
|-----------|--------------|---------------|------|---------|
| **GAIA** | Multi-step reasoning, multi-tool coordination | Low | Low–Medium | **First** |
| **τ-bench** | Stateful tool use, planning reliability (pass@k) | Low | Low | **First** |
| **ToolBench** (StableToolBench) | Tool-calling breadth, API generalization | Medium | Low | Second |
| SWE-bench | Code understanding + patching | High (Docker infra) | High | Skip for now |
| WebArena | Long-horizon web navigation | Medium (Docker) | Medium | Skip for now |
| AgentBench | 8-domain multi-environment | High (per-env wrappers) | Medium | Skip for now |
| OSWorld-MCP | GUI + plugin invocation | High (VM/Docker) | Medium | Skip for now |

GUI-based benchmarks (WebArena, OSWorld, AssistGUI, VisualWebArena, WorldGUI) are excluded —
they require screenshot/vision capability or Docker GUI environments that this agent does not have.

---

## GAIA

**Paper:** "GAIA: A Benchmark for General AI Assistants" · ICLR 2025
**Dataset:** `gaia-benchmark/GAIA` on Hugging Face (validation set: 165 tasks)

### What it tests

Multi-step tasks requiring coordinated tool use across web search, file I/O, shell execution,
and arithmetic reasoning. Examples: "Find the value in column 3 of this CSV and compare it
with the figure from [website]." Tasks have unambiguous, verifiable string answers — no LLM
judge needed.

Three difficulty levels:
- **Level 1**: <5 steps, 1–2 tools
- **Level 2**: 5–10 steps, multi-tool coordination
- **Level 3**: Long-horizon planning, complex tool chains

Level 2/3 tasks naturally trigger `PlanningLoop` (multi-subgoal, cross-tool dependencies) —
these are a direct measure of planning quality.

### Why it fits

- `web_search` + `shell_exec` + `file-ops` + `PlanningLoop` cover nearly all required tools
- No GUI or vision required
- Answer verification is `normalize(agent_output) === normalize(ground_truth)` — cheap and
  fully reproducible with no API judge cost
- Low infrastructure: just LLM API calls

### Adapter design

```typescript
// tests/bench/gaia-runner.ts

interface GaiaTask {
  task_id: string;
  question: string;
  level: 1 | 2 | 3;
  final_answer: string;
  file_name?: string;   // optional attachment (PDF, CSV, image)
}

async function runTask(task: GaiaTask, sessionManager: SessionManager): Promise<boolean> {
  // Optionally copy attachment to working dir so agent can access it
  const input = task.file_name
    ? `${task.question}\n\n(File available at: ${workDir}/${task.file_name})`
    : task.question;

  const result = await sessionManager.run(input, { sessionId: randomUUID() });

  // Extract final answer from last assistant message
  const agentAnswer = extractFinalAnswer(result.messages);
  return normalize(agentAnswer) === normalize(task.final_answer);
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[,\s]+/g, ' ');
}
```

### Metrics to record

| Metric | How measured |
|--------|-------------|
| **Accuracy** | `# correct / # total` per level |
| **PlanningLoop trigger rate** | % tasks that activated `PlanningLoop` |
| **Avg turns per task** | Mean `ExecutionLoop` turns across tasks |
| **Avg tool calls per task** | Mean tool invocations per task |
| **Cost per task** | Token usage × model price |

### Iteration workflow

```
1. Run on Level 1 (easy) → establish baseline accuracy
2. Run on Level 2 → identify failure modes in multi-tool coordination
3. Run on Level 3 → stress-test PlanningLoop with long-horizon tasks
4. Make targeted improvement (e.g. better planning prompts, new tool)
5. Re-run affected level → compare accuracy delta
```

### Relationship to planning benchmarks in quantifiable-improvements.md

B4 (subgoal parallelization) measures planning **speed**. GAIA Level 2/3 measures planning
**quality** — these are orthogonal. Both should be tracked. A fast-but-wrong planning loop
scores badly on GAIA; a correct-but-slow one scores badly on B4.

---

## τ-bench

**Paper:** "τ-bench: A Benchmark for Tool-Agent-User Interaction in the Wild" · 2024
**GitHub:** https://github.com/sierra-research/tau-bench

### What it tests

Stateful, multi-turn agent interactions in domain-specific tool environments (retail and
airline customer service). The agent calls domain APIs (book, cancel, refund, update) over
multiple turns while following business policy rules. Evaluation compares the final database
state against a ground truth expected state.

The key metric is **pass@k**: the same task is run k times; pass@k measures the fraction of
runs that succeed. This directly quantifies **reliability**, not just peak performance.

Baseline context: GPT-4o achieves <50% accuracy on retail tasks; pass@8 is <25%. Even SOTA
function-calling models are highly inconsistent — there is significant room to demonstrate
improvement.

### Why it fits

- Tests exactly what `PlanningLoop` is designed for: multi-step stateful tool orchestration
  with a clear success condition
- Domain APIs can be wrapped as plugins in the standard `plugin.json` format
- No GUI, no vision — pure tool-call + state verification
- pass@k is a more compelling metric than one-shot accuracy for reliability claims

### Adapter design

```typescript
// Map τ-bench retail domain APIs to plugin tools
// τ-bench provides a local API server; wrap each endpoint as a plugin handler

// plugin.json for τ-bench retail domain
{
  "id": "taubench-retail",
  "tools": [
    { "name": "get_order",      "description": "Retrieve order by ID", ... },
    { "name": "cancel_order",   "description": "Cancel a pending order", ... },
    { "name": "return_item",    "description": "Initiate item return", ... },
    { "name": "update_address", "description": "Update shipping address", ... }
  ]
}

// Runner: for each task, run k times and record pass/fail
async function runTask(task: TauTask, k: number): Promise<number> {
  let passes = 0;
  for (let i = 0; i < k; i++) {
    await resetDatabaseState(task.initialState);
    await sessionManager.run(task.userInstruction, { sessionId: randomUUID() });
    const finalState = await getDatabaseState();
    if (stateMatches(finalState, task.expectedState)) passes++;
  }
  return passes / k;  // pass@k score
}
```

### Metrics to record

| Metric | Definition |
|--------|-----------|
| **Accuracy** | pass@1 across all tasks |
| **pass@k** (k=3,5) | Reliability: fraction of k runs that succeed per task |
| **Policy violation rate** | % tasks where agent violated a domain policy rule |
| **Avg turns to completion** | Mean turns per successful task |

### Why pass@k matters for resume

pass@k surfaces planning consistency problems that single-run accuracy hides. A planning loop
that works 40% of the time scores 40% on pass@1, but 0% on pass@5 if failures are
non-deterministic. Improving pass@5 from near-zero to >30% is a strong engineering claim
about system reliability.

---

## ToolBench (StableToolBench variant)

**Paper:** "ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs" · ICLR 2024
**GitHub:** https://github.com/OpenBMB/ToolBench
**StableToolBench:** https://github.com/OpenBMB/StableToolBench (recommended variant)

### What it tests

Tool-calling generalization across 16,464 real REST APIs from RapidAPI Hub (49 categories).
Tests single-tool and multi-tool chaining, parameter handling, and error recovery.

### Why StableToolBench over original

Original ToolBench depends on live third-party APIs that go down or change. StableToolBench
replaces them with virtual API servers — evaluation is reproducible locally without network
dependencies.

### Why it fits

- Directly tests whether the `ToolExecutor` (JSON Schema validation, parameter marshalling,
  error handling) generalizes to unseen tool definitions
- No GUI required
- Local virtual API server = zero ongoing infrastructure cost

### Fit caveat

ToolBench was designed around Python agents and has no TypeScript adapter. The adapter work
is medium complexity: wrap your agent to accept a ToolBench task (goal + available tool list)
and emit tool calls in ToolBench's expected format.

---

## Recommended Evaluation Sequence

```
Phase 1 — Establish baseline (now)
  GAIA Level 1 (easy, ~55 tasks) → accuracy baseline, verify tools work end-to-end

Phase 2 — Stress-test planning (after Phase 1)
  GAIA Level 2 (~55 tasks) → multi-tool coordination
  τ-bench retail, k=3 (50 tasks × 3 runs) → planning reliability baseline

Phase 3 — Tool generalization (optional)
  StableToolBench subset (~100 tasks) → plugin system generalization

Phase 4 — Iterate
  Improve planning prompts / tool handling based on failure analysis
  Re-run affected benchmark subset → compare delta
```

### Cost estimate

| Phase | Tasks | Approx LLM cost |
|-------|-------|----------------|
| GAIA Level 1 | 55 | ~$5–15 |
| GAIA Level 2 | 55 | ~$10–30 |
| τ-bench retail (k=3) | 150 runs | ~$15–40 |
| StableToolBench subset | 100 | ~$10–20 |

All estimates assume Claude Sonnet or GPT-4o pricing. Actual cost scales with avg turns per task.

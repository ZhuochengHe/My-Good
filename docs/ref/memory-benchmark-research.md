# Memory Benchmark Research

Research on LongMemEval and MemBench as candidate benchmarks for evaluating the memory module.

---

## LongMemEval

**Paper:** "LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory"
**Venue:** ICLR 2025
**arXiv:** https://arxiv.org/abs/2410.10813
**GitHub:** https://github.com/xiaowu0162/LongMemEval

### What It Tests

Five core long-term memory abilities:
- **Information extraction** — recall facts mentioned by user or assistant in a single session
- **Multi-session reasoning** — synthesize information across multiple sessions
- **Temporal reasoning** — reason about time-based relationships between events
- **Knowledge updates** — use the most recent value when an attribute changes over time
- **Abstention** — correctly refuse to answer when the information doesn't exist

### Data Format

500 questions, each instance is a JSON object:

```json
{
  "question_id": "q001",
  "question_type": "knowledge-update",
  "question": "What car does the user currently drive?",
  "answer": "Tesla Model 3",
  "question_date": "2024-03-15",
  "haystack_session_ids": ["s001", "s002", ...],
  "haystack_dates": ["2024-01-01", "2024-01-08", ...],
  "haystack_sessions": [
    [
      {"role": "user", "content": "...", "has_answer": true},
      {"role": "assistant", "content": "..."}
    ],
    ...
  ],
  "answer_session_ids": ["s042"]
}
```

**Dataset variants:**
- `longmemeval_s` — ~40 sessions/question, ~115k tokens
- `longmemeval_m` — ~500 sessions/question, ~1.5M tokens
- `longmemeval_oracle` — only evidence sessions (upper-bound test)

### 6 Question Types

| Type | Description |
|---|---|
| `single-session-user` | Recall a fact the user stated in one session |
| `single-session-assistant` | Recall something the assistant said/recommended |
| `single-session-preference` | Identify implicit user preferences scattered across a session |
| `multi-session` | Synthesize information from two or more sessions |
| `temporal-reasoning` | Reason about timestamps and time gaps |
| `knowledge-update` | Attribute changed over time; use the most recent value |
| abstention (`_abs` suffix) | Question has false premise; must say "I don't know" |

30 of the 500 questions are abstention variants.

### Haystack Construction

Evidence sessions are **fully synthetic**:
- 164 user attribute categories across 5 domains (demographics, lifestyle, situational context, life events, belongings)
- LLM self-chatting: user reveals facts *incidentally* (e.g., asks about car insurance to imply they bought a car)
- Human screeners verify quality and correct evidence positioning

Filler sessions are a mix of real (ShareGPT, UltraChat) and synthetic non-conflicting conversations.

### Evaluation Pipeline

**Step 1 — Run the system:**
Feed `haystack_sessions` + `haystack_dates` to the system chronologically, then query with `question` at `question_date`. Output a JSONL file:
```json
{"question_id": "q001", "hypothesis": "The user drives a Tesla Model 3."}
```

**Step 2 — Judge answers:**
```bash
python3 src/evaluation/evaluate_qa.py gpt-4o hypothesis_file.jsonl data/longmemeval_oracle.json
```
Uses GPT-4o-2024-08-06 (temperature=0, max_tokens=10) as judge. Returns yes/no per question.

**Step 3 — Aggregate:**
```bash
python3 src/evaluation/print_qa_metrics.py hypothesis_file.eval-results-gpt4o data/longmemeval_oracle.json
```
Outputs per-type accuracy + overall accuracy + abstention accuracy.

### Retrieval Metrics (optional)

For RAG-based systems, separate retrieval evaluation:
- Recall@k and NDCG@k at k ∈ {1, 3, 5, 10, 30, 50}
- Granularity: session-level or turn-level

### Baselines They Tested

- **Full-context LLM** — entire history in context (GPT-4o, Llama 3.1 70B/8B, Phi-3)
- **RAG** — BM25, dense retrieval (Contriever, Stella, GTE)
- **Commercial systems** — ChatGPT (GPT-4o/mini), Coze (GPT-4o/3.5)
- **Published systems** — MemoryBank, LD-Agent, RAPTOR, MemWalker, HippoRAG, Chain-of-Note

### Key Finding

Commercial systems show ~30% accuracy drop on sustained multi-session memory tasks vs. single-turn in-context performance.

---

## MemBench

**Paper:** "MemBench: Towards More Comprehensive Evaluation on the Memory of LLM-based Agents"
**Venue:** ACL 2025 Findings
**arXiv:** https://arxiv.org/abs/2506.21605
**GitHub:** https://github.com/import-myself/Membench

### What It Tests

Two orthogonal axes:

**Memory type:**
- **Factual** — recall attributes explicitly stated in dialogue
- **Reflective** — infer high-level preferences from low-level factual mentions (e.g., "user likes Action movies" inferred from specific titles mentioned)

**Interaction mode:**
- **Participation** — agent directly participates in dialogue, must remember both user and its own responses
- **Observation** — agent observes a third-party information stream

This produces four sub-datasets: PS-FM, PS-RM, OS-FM, OS-RM.

### Data Format

**Participation / Factual — one trajectory:**
```json
{
  "tid": 0,
  "message_list": [
    [
      {
        "sid": 0,
        "user_message": "I want to tell you about my uncle, Landon Pierce. He's 27 years old.",
        "assistant_message": "That's great! Landon is quite young at 27...",
        "time": "'2024-10-01 08:00' Tuesday",
        "place": "Boston, MA"
      }
    ]
  ],
  "QA": {
    "qid": 0,
    "question": "What is the name of my niece's company?",
    "answer": "TechInnovate Systems LLC",
    "target_step_id": [[119, 5]],
    "choices": {"A": "...", "B": "...", "C": "...", "D": "TechInnovate Systems LLC"},
    "ground_truth": "D",
    "time": "'2024-10-04 08:49' Friday"
  }
}
```

**Observation / Factual — one trajectory:**
```json
{
  "tid": 0,
  "message_list": [
    {
      "mid": 0,
      "message": "My subordinate is Maya Carter.",
      "time": "'2024-10-01 08:00' Tuesday",
      "place": "Boston, MA",
      "rel": "subordinate",
      "attr": "name",
      "value": "Maya Carter"
    }
  ],
  "QA": {
    "question": "What is the education level of the subordinate?",
    "answer": "Associate Degree",
    "target_step_id": [10],
    "choices": {"A": "Bachelor's Degree", "B": "Associate Degree", "C": "High School Diploma", "D": "Master's Degree"},
    "ground_truth": "B"
  }
}
```

### 8 Factual Question Types

| Code | Type | Description |
|---|---|---|
| `sh` | Single-hop | One message contains the answer |
| `mh` | Multi-hop | Multiple messages must be combined |
| `comp` | Comparative | Compare two entities on a shared attribute |
| `agg` | Aggregative | Aggregate across >2 entities on common attribute |
| `pp` | Post-processing | Extra reasoning beyond simple recall |
| `ku` | Knowledge-update | Attribute changed; use latest value |
| `ssa` | Single-session-assistant | Answer relies on agent's own prior response (single session) |
| `msa` | Multi-session-assistant | Answer relies on agent's own prior responses (multi-session) |

Reflective question types: **Preference** and **Emotion**.

### Evaluation Pipeline

The benchmark defines a `BaseMemory` interface with four methods:
```python
memory.store(formatted_message)  # write phase
memory.recall(question + time)   # read phase
memory.retri(question)           # retrieve indices (for Recall metric)
memory.reset()                   # reset between trajectories
```

**Step-by-step:**
1. `env.reset(traj_i)` — select trajectory
2. For each message step: `env.step()` returns `{'message': ...}` → agent calls `memory.store()`
3. At final step: env returns `{'question': ..., 'choices': ...}` → agent calls `memory.recall()`
4. LLM picks from A/B/C/D (forced JSON output: `{"choice": "B"}`)
5. Score = correct if `choice == ground_truth`

No external judge needed — all 4-choice multiple choice.

### 4 Metrics

| Metric | How measured |
|---|---|
| **Accuracy** | `# correct / # total` across all trajectories |
| **Recall@10** | `|retrieved_ids ∩ target_step_ids| / |target_step_ids|` (top-10 retrieved) |
| **Capacity** | Accuracy-vs-token-count curve (measured via `step_cap` mode) |
| **Efficiency** | Average wall-clock time per `store()` and per `recall()` call |

### Baselines They Tested

All using Qwen2.5-7B-Instruct via **MemEngine**:

| System | Type |
|---|---|
| FullMemory | All messages in context window |
| RecentMemory | Sliding window (most recent N tokens) |
| RetrievalMemory | multilingual-e5-small + FAISS |
| GenerativeAgent | Importance scoring + recency + reflection threshold |
| MemoryBank | Periodic summarization and consolidation |
| MemGPT | Main/external memory tiers via function calls |
| SCMemory | LLM decides what to store |

### Key Finding

RetrievalMemory is best for long contexts (100k tokens: 0.833 accuracy vs. FullMemory's 0.45). Reflective memory (especially Emotion) is hardest for all systems. Capacity curves show SCMemory and MemGPT degrade sharply past ~40-60k tokens.

---

## Comparison

| Aspect | LongMemEval | MemBench |
|---|---|---|
| Venue | ICLR 2025 | ACL 2025 Findings |
| Questions | 500, curated | Large scale (39k+ for PS-FM) |
| Memory write model | Passive (history → context/RAG) | Active (`store()` calls) ✅ |
| Evaluation | GPT-4o as judge (API cost) | 4-choice, no judge needed ✅ |
| Question types | 6 types + abstention | 8 factual + 2 reflective types |
| Data availability | HuggingFace | Baidu Pan / Google Drive |
| Runnable code | Yes (Python scripts) | Yes (Python env + agent) |
| Adapter interface | Need to wrap history-feeding as store() calls | Implement BaseMemory interface |

## Fit with Our Memory System

Our system: agent calls `save_memory` / `search_memory` tools; three-layer store (L1 permanent, L2 preferences, L3 TTL-based episodic); substring + tag search; eviction scoring.

**MemBench** — structural fit is higher. It was designed for agent systems with explicit store/recall interfaces. Adapter = implement `BaseMemory` wrapping our `MemoryStore`.

**LongMemEval** — better data quality and richer question types that directly stress-test our specific L3 behaviors (knowledge-update → L3 update logic; temporal-reasoning → TTL/time awareness; abstention → search returning empty). Evaluation scripts are complete and well-documented.

**Recommended approach:** Use LongMemEval's dataset and question types, but adapt the evaluation loop so the agent actively calls `save_memory` to ingest `haystack_sessions` before answering — matching our actual usage pattern.

# my-agent

A personal AI assistant that runs in your terminal. Talks to you, uses tools to get things done — reading files, running commands, searching the web — and remembers you across sessions.

Built from scratch in TypeScript with a custom agent loop, persistent memory, and a structured planning layer. No AI frameworks. Full control.

**Stack:** TypeScript (strict, ESM) · Node.js ≥18 · Vitest · Commander.js · Anthropic + OpenAI SDKs

---

## What it does

- **Multi-step tasks** via tool calling — files, shell, web search, and more
- **Multi-provider** — Claude (Anthropic), GPT (OpenAI), Kimi (Moonshot AI), any OpenAI-compatible API
- **Persistent cross-session memory** — structured memory with LLM consolidation and embedding retrieval
- **Planning layer** — Goal→Subgoal→Task tree with lazy task planning, verification, and human escalation for complex tasks
- **Streaming** — real-time token streaming with typewriter effect in the TUI
- **Dangerous tool confirmation** — built into the TUI (no readline conflicts)
- **Web search** via DuckDuckGo — no API key needed
- **Extensible via plugins** — drop in a `plugin.json` and it just works

---

## Install

```bash
npm install
./install.sh   # builds and installs my-agent to ~/.local/bin
my-agent setup # pick a provider, enter your API key, select a model
```

`install.sh` builds the project, symlinks `my-agent` to `~/.local/bin`, and checks that directory is on your PATH. Re-run after pulling new changes.

> **Manual:** `npm run build`, then add `./bin/my-agent` to your PATH.

---

## Usage

```bash
my-agent chat                           # Interactive REPL
my-agent chat -m "summarize README.md" # Single-message mode
my-agent chat -s <session-id>          # Resume a previous session
```

### Sessions

```bash
my-agent session list
my-agent session list -t debugging      # Filter by tag
my-agent session show <id> --trace      # With per-turn token metrics
my-agent session delete <id>
```

### Other commands

```bash
my-agent plugin list                    # Loaded plugins and tools
my-agent settings set behavior.maxTurns 30
my-agent model update                   # Fetch latest models from provider APIs
```

---

## Memory Module

The agent builds a persistent, structured memory that survives across sessions. It runs automatically — no user configuration needed beyond setting `OPENAI_API_KEY` for consolidation.

### Four Memory Kinds

| Kind | What it stores | TTL | Injected into system prompt |
|---|---|---|---|
| `preference` | How to treat the user — response style, behavioral rules | None | Always — all entries, sorted by creation |
| `experiential` | How to do tasks — workflows, patterns, project techniques | None | On-demand via `search_memory` |
| `semantic` | Objective facts — architecture, tech stack, domain knowledge | None | On-demand via `search_memory` |
| `episodic` | Time-bound context — active tasks, decisions, current bugs | Yes (`ttlDays`) | Top 5 most recently updated entries |

Storage: `~/.my-agent/memory/<kind>/<uuid>.json` + `embeddings.json`

### Hybrid Search

Retrieval uses a three-signal hybrid score:

```
score = 0.75 × cosine_norm + 0.25 × bm25_tf + 0.10 × tag_overlap_ratio
```

| Signal | Weight | Detail |
|---|---|---|
| `cosine_norm` | 0.75 | `text-embedding-3-small` cosine, normalized [−1,1] → [0,1] |
| `bm25_tf` | 0.25 | Keyword relevance, saturated at k₁=1.2 |
| `tag_overlap_ratio` | 0.10 | `matched_tags / query_tag_count`, query tags capped at 5 |

Tags act as an additive boost — not a hard pre-filter. Semantically relevant entries are never dropped before scoring runs.

### Consolidation Pipeline

Runs fire-and-forget at session end. Failures are silently swallowed.

```
session messages
    │
    ▼  sliding window (3000 tokens, 500-token overlap, tiktoken-exact)
extractMemories() ── gpt-4o-mini ──► [{content, kind, tags, ttlDays}]
    │
    ▼  per candidate:
embedText() ── text-embedding-3-small ──► vector
    │
cosine > 0.9  → merge into existing entry (LLM call)
0.8–0.9       → save new + relatedTo: [existing.id]
≤ 0.8         → save new
```

### MemBench Results

Evaluated on 100 PS-FM (participation, factual) trajectories from [MemBench](https://github.com/import-myself/Membench) — 4-choice MCQ, random baseline = 25%:

| Date | Version | Accuracy | Recall@10 | Notes |
|---|---|---|---|---|
| 2026-03-23 | v2-baseline | 49.0% | 8.0% | Substring search + recency fallback |
| 2026-03-24 | v2-embedding | **94.0%** | **100.0%** | `text-embedding-3-small` cosine search |

**+45pp accuracy, +92pp Recall@10** from switching to embedding search. The entire gap was vocabulary mismatch — paraphrased questions (e.g. "When was Landon born?" vs stored "his birthday is on August 23rd") returned zero substring matches and fell back to recency. With cosine search, Recall@10 = 100% means the correct entry is always in the top-10 retrieved, giving the LLM enough context to answer correctly. The remaining 6% accuracy gap is LLM answer error on ambiguous questions, not a retrieval failure.

Full benchmark methodology: [`docs/benchmark-adaptation.md`](docs/benchmark-adaptation.md) · Results history: [`docs/bench-results.md`](docs/bench-results.md)

### Memory Tools (available to the agent)

| Tool | Description |
|---|---|
| `save_memory` | Persist a new entry with kind, tags, optional TTL |
| `search_memory` | Hybrid search by query, tags, and/or kind |
| `update_memory` | Update content, tags, or TTL of an existing entry |
| `delete_memory` | Permanently delete an entry (requires confirmation) |
| `list_memories` | List all entries, optionally filtered by kind |

---

## Planning Module

For complex multi-step tasks, the agent uses a structured `PlanningLoop` that wraps the `ExecutionLoop`.

### When it activates

The complexity check runs before every request (configurable as `auto` / `always` / `never`):
- **Simple tasks** (questions, single commands, single-file edits) bypass the planner entirely — `plan.json` is never created
- **Complex tasks** (3+ phases, multiple files/services, design decisions) go through the full Goal→Subgoal→Task flow

### Goal → Subgoal → Task

```
Goal: "Build a REST API with auth and tests"
  │
  ├─ sg-1: "Design API schema and routes"
  │     ├─ sg-1-t-1: "Create OpenAPI spec"
  │     └─ sg-1-t-2: "Define request/response types"
  │
  ├─ sg-2: "Implement auth middleware"
  │     ├─ sg-2-t-1: "Write JWT validation handler"
  │     └─ sg-2-t-2: "Add auth to route definitions"
  │
  └─ sg-3: "Write integration tests"
        └─ sg-3-t-1: "Cover auth failure paths"
```

**Lazy task planning:** Goal + Subgoals are planned upfront. Tasks are planned per-Subgoal, just before execution — so later Subgoals can use findings from earlier ones.

### Execution loop (per Subgoal)

```
Phase B: Plan verification method + Tasks lazily (LLM calls)
Phase C: Run ExecutionLoop with plan as context summary
         Agent uses: create_plan / plan_subgoal_tasks / update_task / reflect
         If reflect triggers replan → PlanningLoop replans remaining Tasks
Phase D: Verify subgoal result
         automated → check all tasks completed
         llm_judge → secondary LLM call; low confidence escalates to human
         human     → pause, call onHumanReview(); user approves or gives instructions
```

After `maxVerificationAttempts` (default: 2) failures, automatically escalates to human review.

### Planning Tools (available to the agent)

| Tool | Description |
|---|---|
| `create_plan` | Write initial plan: goal + 2–6 subgoals (no Tasks yet) |
| `plan_subgoal_tasks` | Lazily populate Tasks for one Subgoal before executing it |
| `update_task` | Update Task status and record what actually happened (`resultProcess`) |
| `reflect` | Append observation + next action; `triggerReplan: true` signals replanning |
| `revise_remaining_tasks` | Clear pending Tasks, replace with new ones (keeps completed Tasks) |
| `get_plan` | Return formatted plan markdown at any time |
| `request_human_review` | Pause execution and request human judgment |

The active plan persists at `~/.my-agent/plan.json` via atomic `tmp→rename` writes.

---

## Plugins

| Plugin | Tools |
|---|---|
| `file-ops` | `read_file`, `write_file`, `list_directory` |
| `shell` | `shell_exec` (linux/darwin; requires confirmation) |
| `web-search` | `web_search`, `fetch_url` |
| `memory` | `save_memory`, `search_memory`, `update_memory`, `delete_memory`, `list_memories` |
| `planning` | `create_plan`, `plan_subgoal_tasks`, `update_task`, `reflect`, `revise_remaining_tasks`, `get_plan`, `request_human_review` |

### Adding a plugin

```json
// plugins/my-plugin/plugin.json
{
  "id": "my-plugin",
  "version": "1.0.0",
  "tools": [{
    "name": "my_tool",
    "description": "Does something useful",
    "dangerous": false,
    "parameters": {
      "type": "object",
      "properties": { "input": { "type": "string" } },
      "required": ["input"]
    },
    "handler": "handlers.js"
  }]
}
```

```js
// plugins/my-plugin/handlers.js
export async function my_tool(args, context) {
  // context.memoryStore, context.planStore available
  return { output: `Got: ${args.input}` };
}
```

Add the directory to `plugins.directories` in `config.yaml`.

---

## Development

```bash
npm test                       # 1481+ tests across 58 files
npm run test:coverage
npm run build
npm run lint
npx vitest run tests/memory    # Memory module only
npx vitest run tests/planning  # Planning module only
```

---

## Providers

| Provider | SDK | Notes |
|---|---|---|
| `anthropic` | Anthropic SDK | Claude models |
| `openai` | OpenAI SDK | GPT models |
| `kimi` | OpenAI SDK | Moonshot AI (OpenAI-compatible) |

To add any OpenAI-compatible provider, add an entry to `providers.json` — no code changes needed.

---

See [`docs/reference/ARCHITECTURE.md`](docs/reference/ARCHITECTURE.md) for the full architecture reference — component diagrams, memory internals, planning data model, session JSONL format, core interfaces, and error handling strategy.

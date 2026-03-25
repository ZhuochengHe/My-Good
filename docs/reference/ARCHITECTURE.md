# Architecture

## Overview

```
User Input → CLI → PlanningLoop (optional) → ExecutionLoop → Provider (LLM API)
                         ↓                        ↑                   ↓
                   PlanStore (plan.json)    Tool Results ←── PluginManager ←── Tool Calls
                                                  ↓
                                     SessionStore (JSONL) + MemoryStore (JSON files)
```

**Stack:** TypeScript (strict, ESM) · Node.js ≥18 · Vitest · Commander.js · chalk · ora · js-tiktoken

## Implemented Stages

| Stage | What was built |
|---|---|
| 1 | Core types, config (Zod + YAML), logger |
| 2 | Anthropic + OpenAI providers, provider registry (`providers.json`) |
| 3 | Event system, context builder, execution loop |
| 4 | Plugin manager, tool executor, default plugins (file-ops, shell, web-search) |
| 5 | JsonlSessionStore (atomic, hardened), SessionManager (lifecycle, AI tags/descriptions, search) |
| 6 | Full CLI (Commander.js) — chat, session, plugin, config, settings, model commands |
| 7 | Event persistence — `turn_metadata` + `error_log` records in session JSONL; `SessionStoreWithTrace` |
| 8 | Kind-based persistent memory module — 4 kinds, TTL, eviction scoring, embedding index |
| 9 | LLM consolidation pipeline — session-end extraction, embedding dedup, cosine merge |
| 10 | Hybrid reranking — cosine + BM25-TF + tag overlap boost replaces hard tag pre-filter |
| 11 | Planning layer — Goal→Subgoal→Task tree with lazy planning, 3-mode verification, human escalation |

**Test coverage:** 1481+ tests across 58 files, ≥80% coverage

## Source Layout

```
src/
├── types/       # Core interfaces (Message, Tool, Plugin, Provider, Session, Agent, Memory, Planning)
├── agent/       # ExecutionLoop, ContextBuilder, tool-call bridge
├── session/     # JsonlSessionStore, SessionManager
├── providers/   # Anthropic + OpenAI SDK clients; registry-based discovery
├── plugins/     # PluginManager, ToolExecutor, manifest validation
├── memory/      # JsonMemoryStore (kind-based), EmbeddingIndex, consolidation pipeline, eviction scorer
├── planning/    # PlanStore (atomic JSON), PlanningLoop (5-phase orchestrator)
├── config/      # YAML loader + Zod validation (config.yaml, settings.yaml)
├── events/      # EventEmitter, subscribers (logging, persistence)
├── errors/      # Structured error classes per domain (memory, agent, session, etc.)
├── cli/         # Commander commands + I/O adapters (ColoredOutput, StdinInputReader)
└── utils/       # Logger, retry, ID generation

plugins/         # Default plugins (plugin.json manifests)
├── file-ops/    # read_file, write_file, list_directory
├── shell/       # shell_exec (linux/darwin)
├── web-search/  # web_search, fetch_url
├── memory/      # save_memory, search_memory, update_memory, delete_memory, list_memories
└── planning/    # create_plan, plan_subgoal_tasks, update_task, reflect,
                 # revise_remaining_tasks, get_plan, request_human_review
```

## Key Files

| File | Purpose |
|---|---|
| `src/agent/execution-loop.ts` | Core agentic loop with tool calling, max 25 turns |
| `src/session/session-manager.ts` | Session lifecycle, run(), planning dispatch, AI tag generation |
| `src/session/jsonl-store.ts` | JSONL persistence with atomic writes and backup |
| `src/plugins/manager.ts` | Plugin discovery and loading |
| `src/plugins/tool-executor.ts` | Tool dispatch; injects memoryStore + planStore into handler context |
| `src/providers/anthropic.ts` | Anthropic SDK client |
| `src/providers/openai.ts` | OpenAI SDK client (also used for Kimi) |
| `src/providers/registry.ts` | Provider registry from `providers.json` |
| `src/memory/memory-store.ts` | JsonMemoryStore — kind-based file-backed store with hybrid search |
| `src/memory/embedding-index.ts` | JsonEmbeddingIndex — flat embeddings.json with cosine search and write queue |
| `src/memory/consolidation.ts` | Session-end LLM extraction pipeline (gpt-4o-mini + text-embedding-3-small) |
| `src/memory/eviction-scorer.ts` | Weighted scoring for episodic eviction decisions |
| `src/types/memory.ts` | MemoryEntry, MemoryKind, MemoryStore, EmbeddingIndex interfaces |
| `src/types/planning.ts` | PlanState, Subgoal, PlanTask, ReflectionEntry, VerificationMethod |
| `src/planning/plan-store.ts` | PlanStore — in-memory singleton + atomic tmp→rename JSON persistence |
| `src/planning/planning-loop.ts` | PlanningLoop — 5-phase orchestrator wrapping ExecutionLoop |
| `src/errors/memory.ts` | Memory error hierarchy (MEMORY_001–005) |
| `src/cli/bootstrap.ts` | Dependency wiring — config → session → plugins → memory → plan → loop |
| `src/cli/commands/chat.ts` | Interactive REPL and single-message mode |
| `src/cli/colored-output.ts` | Chalk + ora output adapter (active) |
| `providers.json` | Provider registry manifest |

## Bootstrap Sequence (`src/cli/bootstrap.ts`)

1. Ensure `~/.my-agent/config.yaml` exists (create default if not)
2. Load config (YAML + Zod validation)
3. Load settings (`~/.my-agent/settings.yaml`)
4. Override system prompt from bundled `src/cli/prompts/system-prompt.md`
5. Validate API keys from environment
6. Initialize `JsonlSessionStore` at `~/.my-agent/sessions/`
7. Instantiate provider (Anthropic or OpenAI) from registry
8. Load plugins from configured directories
9. Create `JsonEmbeddingIndex` + `JsonMemoryStore` at `~/.my-agent/memory/`
10. Create `PlanStore` at `~/.my-agent/plan.json`
11. Create `ToolExecutor` with `memoryStore`, confirmation callback, and `planStore`
12. Register all plugin tools in `ToolExecutor`
13. Create `ExecutionLoop` with tools, working dir, session store, memory store, consolidation config, embedding index
14. Create tool-call bridge
15. Initialize `SessionManager` with `ExecutionLoop` (and optionally `PlanningLoop`)
16. Return `BootstrapResult`

## Memory Module (Stages 8–9)

### Kind-Based Architecture

| Kind | Purpose | TTL | System prompt injection |
|---|---|---|---|
| `preference` | How to treat the user — response style, behavioral rules | None | Always injected (all entries, sorted by createdAt) |
| `experiential` | How to do tasks — workflows, patterns, project techniques | None | On-demand via `search_memory` |
| `semantic` | Objective facts — architecture, tech stack, domain knowledge | None | On-demand via `search_memory` |
| `episodic` | Time-bound context — active tasks, decisions, current bugs | Yes (`ttlDays`) | Top 5 most recently updated entries injected |

Storage layout: `~/.my-agent/memory/<kind>/<uuid>.json` + `embeddings.json`

### MemoryEntry Schema

```typescript
interface MemoryEntry {
  readonly id: string;                    // UUID v4
  readonly kind: MemoryKind;             // drives lifecycle and injection policy
  readonly content: string;              // factual text, max 10,000 chars
  readonly tags: readonly string[];      // free-form, LLM-generated
  readonly embedding?: readonly number[]; // text-embedding-3-small (1536-dim)
  readonly relatedTo?: readonly string[]; // IDs of related entries (stub, not traversed)
  readonly sourceRef?: string;           // opaque origin reference (e.g. MemBench step ID)
  readonly ttlDays?: number;             // episodic only; set by consolidation LLM
  readonly createdAt: number;            // Unix ms
  readonly updatedAt: number;            // Unix ms; only updated when content changes
  readonly accessCount?: number;         // incremented on every search hit
  readonly lastAccessed?: number;        // Unix ms of last search retrieval
  readonly ttlRenewals?: number;         // explicit TTL refreshes; used in eviction scoring
  readonly pendingKB?: boolean;          // marked for KB promotion by eviction sweep
}
```

### Retrieval — Hybrid Reranking

`search()` uses a three-signal hybrid score when a `queryEmbedding` is provided:

```
score = 0.75 × cosine_norm + 0.25 × bm25_tf + 0.10 × tag_overlap_ratio
```

| Signal | Weight | Detail |
|---|---|---|
| `cosine_norm` | 0.75 | Cosine similarity normalized from [−1,1] to [0,1] |
| `bm25_tf` | 0.25 | BM25-TF saturated at k₁=1.2, normalized per query term count |
| `tag_overlap_ratio` | 0.10 | `matched_tags / query_tag_count`; query tags capped at 5 |

Tags act as an additive boost rather than a hard pre-filter — semantically relevant entries
are never dropped before scoring runs.

Falls back to case-insensitive substring match + recency sort when no embedding is available.

`search()` increments `accessCount` and updates `lastAccessed` on every returned entry
(but does NOT change `updatedAt` — that only changes on content edits).

### Consolidation Pipeline

Runs fire-and-forget after every session ends (`agent_end`). Failures are silently swallowed.

```
session messages
    │
    ▼  sliding window (CHUNK_MAX_TOKENS=3000, CHUNK_OVERLAP_TOKENS=500, token-exact via js-tiktoken)
    ▼  for each chunk:
extractMemories() ── gpt-4o-mini structured output ──► [{content, kind, tags, ttlDays}]
    │
    ▼  for each candidate:
embedText() ── text-embedding-3-small ──► number[]
    │
    ▼  against EmbeddingIndex:
cosine > 0.9   → merge: LLM call → update existing entry
0.8–0.9        → save new entry + relatedTo: [existing.id]
≤ 0.8          → save new entry
```

### Eviction Sweep

Runs at `initialize()` on expired episodic entries when count exceeds threshold (default: 100).

Scoring factors (weighted sum → 0.0–1.0):

| Factor | Weight | Condition |
|---|---|---|
| High-value tags (`architecture`, `decision`, `convention`) | +0.4 | tag match |
| High access frequency | +0.25 | `accessCount >= 3` |
| Renewed TTL | +0.2 | `ttlRenewals >= 1` |
| Substantial content | +0.1 | `content.length > 200` |
| Stale access | −0.1 | `lastAccessed` older than 2× `ttlDays` |

Score ≥ 0.6 → set `pendingKB: true` (retain for future KB ingestion); score < 0.6 → delete.

### EmbeddingIndex

`JsonEmbeddingIndex` stores a flat `{ id → number[] }` map in `embeddings.json`.
All write operations (`set`, `delete`, `clear`) are serialized via a promise-chain write queue
to prevent concurrent rename races on `embeddings.json.tmp`.

### Memory Error Codes

| Code | Class | Meaning |
|---|---|---|
| MEMORY_001 | `MemoryNotFoundError` | Entry does not exist |
| MEMORY_002 | `MemoryInvalidIdError` | Non-UUID ID supplied |
| MEMORY_003 | `MemoryInvalidKindError` | Unknown kind value |
| MEMORY_004 | `MemoryInvalidContentError` | Empty or oversized content |
| MEMORY_005 | `MemoryStorageError` | File I/O failure |

## Planning Module (Stage 11)

### Goal → Subgoal → Task Tree

```
PlanningLoop.run(goal)
  │
  ├─ Phase A: Complexity check (auto/always/never) → bypass to ExecutionLoop if simple
  │
  ├─ Phase A: Generate initial plan (LLM call)
  │     └─ PlanState: planId, sessionId, originalGoal, subgoals[], reflections[]
  │
  ├─ For each Subgoal (Phase B + C + D):
  │     ├─ Phase B: Plan verification method (LLM call — automated/llm_judge/human)
  │     ├─ Phase B: Plan Tasks lazily (LLM call — 2–8 atomic tasks)
  │     ├─ Phase C: Execute via ExecutionLoop.run() with plan markdown as compactSummary
  │     │     └─ Agent uses create_plan/plan_subgoal_tasks/update_task/reflect tools
  │     ├─ Phase C: Poll reflections for triggerReplan → replan if needed
  │     └─ Phase D: Verify (automated/llm_judge/human escalation)
  │           └─ onHumanReview() callback if maxVerificationAttempts exceeded
  │
  └─ Phase E: Patch plan to 'completed', return PlanningRunResult
```

### Data Model

```typescript
PlanState       planId, sessionId, originalGoal, status, subgoals[], reflections[]
Subgoal         id ("sg-1"), index, title, description, status, verificationMethod?,
                tasks[], verificationAttempts, result?, startedAt?, completedAt?
PlanTask        id ("sg-1-t-1"), index, title, status, resultProcess?, startedAt?, completedAt?
ReflectionEntry id, subgoalId, taskId?, timestamp, observation, nextAction, triggerReplan
VerificationMethod  mode (automated|llm_judge|human), description, expectedArtifact?
```

### PlanStore

- In-memory singleton (`this.state`) avoids disk reads on hot path
- All disk writes are atomic: write to `plan.json.tmp`, then `rename()` to `plan.json`
- Node.js single-thread model ensures handler writes and loop writes are never concurrent
- `clear()` resets in-memory state and unlinks `plan.json`

### Verification Modes

| Mode | Behavior |
|---|---|
| `automated` | Check all tasks have status `'completed'` |
| `llm_judge` | `verificationProvider.complete()` returns `{ passed, confidence, reasoning }`; `confidence === 'low'` escalates to human |
| `human` | Always calls `onHumanReview()`; user can approve or provide revision instructions |

Human escalation also triggers when `verificationAttempts >= maxVerificationAttempts` (default: 2).

### Planning Plugin Tools

| Tool | Purpose |
|---|---|
| `create_plan` | Write initial PlanState with subgoals (no Tasks yet) |
| `plan_subgoal_tasks` | Lazily populate Tasks for one Subgoal before execution |
| `update_task` | Update Task status + record `resultProcess` |
| `reflect` | Append ReflectionEntry; `triggerReplan=true` signals PlanningLoop to replan |
| `revise_remaining_tasks` | Clear pending Tasks, push revised ones (keeps completed Tasks) |
| `get_plan` | Return formatted plan markdown with subgoal/task tree |
| `request_human_review` | Set module-level review flag; PlanningLoop polls and pauses |

### Persistence

```
~/.my-agent/
├── plan.json          # Active plan (cleared after completion)
├── memory/            # MemoryStore entries
└── sessions/          # Session JSONL files
```

## Key Design Decisions

| Concern | Approach |
|---|---|
| Agent loop | Custom (no LangGraph) |
| Planning | `PlanningLoop` wraps `ExecutionLoop`; `SessionManager` dispatches optionally |
| Plan state | In-memory singleton + atomic `tmp→rename` JSON; Node.js single-thread eliminates race conditions |
| Lazy task planning | Tasks planned per-subgoal just before execution, not upfront — later subgoals benefit from earlier findings |
| Human review signaling | Module-level variable in `handlers.js`; `PlanningLoop` polls after each subgoal (Node.js module singleton) |
| Provider registry | `providers.json` manifest — add providers without code changes |
| SDK abstraction | Two SDKs (Anthropic, OpenAI); multiple providers share same SDK |
| Plugin system | `plugin.json` manifests with JSON Schema tool definitions |
| Session storage | Append-only JSONL — human-readable, corruption-resistant |
| Event persistence | `turn_metadata` + `error_log` records in session JSONL |
| Memory storage | Per-entry JSON files, atomic writes (tmp + rename), mode 0o600; embeddings in flat JSON map |
| Memory search | Hybrid reranking: cosine (0.75) + BM25-TF (0.25) + tag overlap boost (0.10) |
| Memory consolidation | Session-end LLM extraction (gpt-4o-mini) + embedding dedup (text-embedding-3-small) |
| Token counting | `js-tiktoken` (cl100k_base) for exact chunking across languages and emoji |
| Output adapter | `OutputAdapter` interface — swap `PlainTextOutput` ↔ `ColoredOutput` |
| Config | `~/.my-agent/config.yaml` (credentials) + `settings.yaml` (behavior) |
| Immutability | `readonly` on all message/session/memory/planning types |

## Providers

| Provider | SDK | Notes |
|---|---|---|
| `anthropic` | Anthropic SDK | Claude models |
| `openai` | OpenAI SDK | GPT models |
| `kimi` | OpenAI SDK | Moonshot AI (OpenAI-compatible) |

To add a new OpenAI-compatible provider, add an entry to `providers.json` — no code changes needed.

## Session Format (JSONL)

Each session is a `.jsonl` file with typed records:

| Record type | Written when |
|---|---|
| `session_start` | Session created |
| `message` | Each user/assistant/tool message |
| `turn_metadata` | After each LLM turn (tokens, duration, tool count, stop reason) |
| `error_log` | When errors occur |

## Configuration

**`~/.my-agent/config.yaml`** — credentials and model selection (set by `setup`)

**`~/.my-agent/settings.yaml`** — behavior tuning:
```yaml
model:
  temperature: 0.7
  maxTokens: 4096

behavior:
  maxTurns: 25
  enableStreaming: true
  systemPrompt: "You are a helpful AI assistant..."  # includes memory layer guidance

tools:
  allow: []
  deny: []
  requireApproval: [shell_exec]

memory:
  evictionThreshold: 100   # L3 entries before eviction sweep triggers
```

## Core Interfaces

```typescript
interface ModelProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  listModels(): Promise<readonly ModelInfo[]>;
  healthCheck(): Promise<boolean>;
}

interface SessionStore {
  load(sessionId: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  appendMessage(sessionId: string, message: ConversationMessage): Promise<void>;
  list(): Promise<readonly SessionSummary[]>;
  delete(sessionId: string): Promise<void>;
}

// Extended store with event persistence
interface SessionStoreWithTrace extends SessionStore {
  loadWithTrace(sessionId: string): Promise<SessionWithTrace | null>;
  appendTurnMetadata(sessionId: string, metadata: TurnMetadataRecord): Promise<void>;
  appendErrorLog(sessionId: string, error: ErrorLogRecord): Promise<void>;
}

interface MemoryStore {
  get(id: string): Promise<MemoryEntry | null>;
  save(entry: MemoryEntry): Promise<void>;
  update(id: string, input: MemoryUpdateInput): Promise<MemoryEntry>;
  delete(id: string): Promise<void>;
  search(options: MemorySearchOptions): Promise<readonly MemoryEntry[]>;
  loadForSystemPrompt(): Promise<readonly MemoryEntry[]>; // preference + top-5 episodic
  initialize(): Promise<void>;
  evict(): Promise<void>;
}

interface EmbeddingIndex {
  get(id: string): number[] | null;
  set(id: string, embedding: number[]): Promise<void>;
  delete(id: string): Promise<void>;
  searchByCosine(query: number[], topK: number): Promise<Array<{ id: string; score: number }>>;
  clear(): Promise<void>;
}

interface OutputAdapter {
  write(text: string): void;
  writeError(text: string): void;
  writeSuccess(text: string): void;
  writeTokenUsage(usage: TokenUsage): void;
  startLoading?(message: string): void;
  stopLoading?(): void;
}

interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly tools: readonly ToolManifest[];
  readonly gates?: PluginGates;  // requiredBinaries, requiredEnv, platforms
}
```

## Error Handling

| Layer | Strategy |
|---|---|
| Provider timeout/rate limit | Retry 3x with exponential backoff |
| Provider auth failure | Abort |
| Tool not found | Skip, continue |
| Tool execution error | Return error to model as tool result |
| Session corrupted | Backup file, create new session |
| Config invalid | Abort startup with clear message |
| Memory TTL expiry | Return `null` silently — eviction sweep handles cleanup at startup |
| Consolidation failure | Silently swallowed (`.catch(() => undefined)`) — never crashes a session |

Error codes: `AGENT_001`–`007`, `PROVIDER_001`–`007`, `PLUGIN_001`–`006`, `SESSION_001`–`007`, `MEMORY_001`–`005`

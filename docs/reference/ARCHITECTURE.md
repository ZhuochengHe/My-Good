# Architecture

## Overview

```
User Input → CLI → ExecutionLoop → Provider (LLM API)
                        ↑                   ↓
                 Tool Results ←── PluginManager ←── Tool Calls
                        ↓
                SessionStore (JSONL) + MemoryStore (JSON files)
```

**Stack:** TypeScript (strict, ESM) · Node.js ≥18 · Vitest · Commander.js · chalk · ora

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
| 8 | Three-layer persistent memory module with TTL enforcement and eviction scoring |

**Test coverage:** 1275+ tests across 68 files, ≥80% coverage

## Source Layout

```
src/
├── types/       # Core interfaces (Message, Tool, Plugin, Provider, Session, Agent, Memory)
├── agent/       # ExecutionLoop, ContextBuilder, tool-call bridge
├── session/     # JsonlSessionStore, SessionManager
├── providers/   # Anthropic + OpenAI SDK clients; registry-based discovery
├── plugins/     # PluginManager, ToolExecutor, manifest validation
├── memory/      # Three-layer JsonMemoryStore, eviction scorer, index
├── config/      # YAML loader + Zod validation (config.yaml, settings.yaml)
├── events/      # EventEmitter, subscribers (logging, persistence)
├── errors/      # Structured error classes per domain (memory, agent, session, etc.)
├── cli/         # Commander commands + I/O adapters (ColoredOutput, StdinInputReader)
└── utils/       # Logger, retry, ID generation

plugins/         # Default plugins (plugin.json manifests)
├── file-ops/    # read_file, write_file, list_directory
├── shell/       # shell_exec (linux/darwin)
└── web-search/  # web_search, fetch_url
```

## Key Files

| File | Purpose |
|---|---|
| `src/agent/execution-loop.ts` | Core agentic loop with tool calling, max 25 turns |
| `src/agent/session-manager.ts` | Session lifecycle, run(), AI tag generation |
| `src/session/jsonl-store.ts` | JSONL persistence with atomic writes and backup |
| `src/plugins/manager.ts` | Plugin discovery and loading |
| `src/plugins/tool-executor.ts` | Tool dispatch with allow/deny lists |
| `src/providers/anthropic.ts` | Anthropic SDK client |
| `src/providers/openai.ts` | OpenAI SDK client (also used for Kimi) |
| `src/providers/registry.ts` | Provider registry from `providers.json` |
| `src/memory/memory-store.ts` | JsonMemoryStore — three-layer file-backed store |
| `src/memory/eviction-scorer.ts` | Weighted scoring for L3 eviction decisions |
| `src/types/memory.ts` | MemoryEntry, MemoryStore interfaces, createMemoryEntry |
| `src/errors/memory.ts` | Memory error hierarchy (MEMORY_001–006) |
| `src/cli/bootstrap.ts` | Dependency wiring — config → session → plugins → memory → loop |
| `src/cli/commands/chat.ts` | Interactive REPL and single-message mode |
| `src/cli/colored-output.ts` | Chalk + ora output adapter (active) |
| `src/cli/plain-text-output.ts` | Plain text output adapter (reference/testing) |
| `providers.json` | Provider registry manifest |

## Bootstrap Sequence (`src/cli/bootstrap.ts`)

1. Ensure `~/.my-agent/config.yaml` exists (create default if not)
2. Load config (YAML + Zod validation)
3. Load settings (`~/.my-agent/settings.yaml`)
4. Validate API keys from environment
5. Initialize `JsonlSessionStore` at `~/.my-agent/sessions/`
6. Instantiate provider (Anthropic or OpenAI) from registry
7. Load plugins from directories
8. Initialize `JsonMemoryStore` at `~/.my-agent/memory/`
9. Create `ToolExecutor` with memory store
10. Create `ExecutionLoop` with tools, working dir, session store, memory store
11. Create tool-call bridge
12. Initialize `SessionManager` with `ExecutionLoop`
13. Create `ColoredOutput` adapter
14. Return `BootstrapResult`

## Memory Module (Stage 8)

### Three-Layer Architecture

| Layer | Purpose | TTL | Location |
|---|---|---|---|
| L1 | Always-loaded core memories | None | `~/.my-agent/memory/layer1/<uuid>.json` |
| L2 | Persistent on-demand lookup | Optional (`expiresAt`) | `~/.my-agent/memory/layer2/<uuid>.json` |
| L3 | Ephemeral / session-scoped | Required (`ttlDays`) | `~/.my-agent/memory/layer3/<uuid>.json` |

### MemoryEntry Schema

```typescript
interface MemoryEntry {
  readonly id: string;           // UUID
  readonly layer: 1 | 2 | 3;
  readonly content: string;
  readonly tags: readonly string[];
  readonly source: string;       // origin identifier
  readonly createdAt: number;    // Unix ms
  readonly updatedAt: number;
  readonly expiresAt?: number;   // absolute expiry (L2)
  readonly ttlDays?: number;     // relative expiry in days (L3)
  readonly accessCount: number;  // read tracking for eviction scoring
  readonly ttlRenewals: number;  // TTL refresh count for eviction scoring
  readonly pendingKB?: boolean;  // marked for KB promotion by eviction sweep
}
```

### TTL Enforcement

- **`expiresAt`** (absolute): checked at read-time; throws `MemoryExpiredError` — entry stays on disk, must be evicted explicitly
- **`ttlDays`** (relative): checked at read-time; returns `null` silently — entry stays on disk for eviction sweep to handle
- L1 and L2 entries never expire via `ttlDays` even if the field is set

### Eviction Sweep

Runs at `initialize()` and when expired L3 count exceeds a configurable threshold (default: 100 entries).

Scoring factors (weighted sum → 0.0–1.0):

| Factor | Weight | Condition |
|---|---|---|
| High-value tags (`important`, `critical`, `permanent`) | +0.4 | tag match |
| High access | +0.25 | `accessCount >= 3` |
| Renewed TTL | +0.2 | `ttlRenewals > 0` |
| Substantial content | +0.1 | `content.length > 200` |
| Old and unrenewed | -0.1 | age > 7 days && `ttlRenewals === 0` |

Decision: score ≥ 0.6 → set `pendingKB = true` (retain for KB promotion); score < 0.6 → delete file.

### Memory Error Codes

| Code | Class | Meaning |
|---|---|---|
| MEMORY_001 | `MemoryNotFoundError` | Entry does not exist |
| MEMORY_002 | `MemoryExpiredError` | `expiresAt` exceeded |
| MEMORY_003 | `MemoryStorageError` | File I/O failure |
| MEMORY_004 | `MemoryValidationError` | Invalid entry data |
| MEMORY_005 | `MemoryLayerError` | Wrong layer operation |
| MEMORY_006 | `MemoryCapacityError` | Store capacity exceeded |

## Key Design Decisions

| Concern | Approach |
|---|---|
| Agent loop | Custom (no LangGraph) |
| Provider registry | `providers.json` manifest — add providers without code changes |
| SDK abstraction | Two SDKs (Anthropic, OpenAI); multiple providers share same SDK |
| Plugin system | `plugin.json` manifests with JSON Schema tool definitions |
| Session storage | Append-only JSONL — human-readable, corruption-resistant |
| Event persistence | `turn_metadata` + `error_log` records in session JSONL |
| Memory storage | Per-entry JSON files, atomic writes (tmp + rename), mode 0o600 |
| Output adapter | `OutputAdapter` interface — swap `PlainTextOutput` ↔ `ColoredOutput` |
| Config | `~/.my-agent/config.yaml` (credentials) + `settings.yaml` (behavior) |
| Immutability | `readonly` on all message/session/memory types |

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
  set(entry: MemoryEntry): Promise<void>;
  delete(id: string): Promise<void>;
  scanLayer(layer: 1 | 2 | 3): Promise<readonly MemoryEntry[]>;
  search(query: string, layer?: 1 | 2 | 3): Promise<readonly MemoryEntry[]>;
  initialize(): Promise<void>;
  evict(): Promise<void>;
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
| Memory expiry (`expiresAt`) | Throw `MemoryExpiredError` — entry retained on disk |
| Memory expiry (`ttlDays`) | Return `null` silently — eviction sweep handles cleanup |

Error codes: `AGENT_001`–`007`, `PROVIDER_001`–`007`, `PLUGIN_001`–`006`, `SESSION_001`–`007`, `MEMORY_001`–`006`

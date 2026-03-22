# Architecture Reference

**Stack:** TypeScript (strict, ESM) · Node.js >=18 · Vitest · Commander.js · chalk · ora · Ink (React TUI)
**Test coverage:** 1451+ tests across 54 files, >=80% coverage

---

## Data Flow

```
User Input → CLI → ExecutionLoop → Provider (LLM API)
                        ↑                   ↓
                 Tool Results ←── PluginManager ←── Tool Calls
                        ↓
                SessionStore (JSONL) + MemoryStore (JSON files)
```

---

## Source Layout

| Directory | Purpose |
|---|---|
| `src/agent/` | ExecutionLoop, ContextBuilder, token counter, tool-call bridge |
| `src/cli/` | Commander commands, I/O adapters, input readers, slash commands |
| `src/cli/commands/` | One file per CLI subcommand (chat, config, model, plugin, session, settings, setup) |
| `src/config/` | YAML loader, Zod validation, defaults, settings loader, migration |
| `src/errors/` | Structured error classes per domain (agent, memory, plugin, provider, session) |
| `src/events/` | EventEmitter, subscribers (logging, persistence) |
| `src/memory/` | Three-layer JsonMemoryStore, eviction scorer |
| `src/plugins/` | PluginManager, ToolExecutor, manifest schema, gates checker |
| `src/providers/` | Anthropic + OpenAI SDK clients, auth handler, retry, registry, manager |
| `src/security/` | Credential detector |
| `src/session/` | JsonlSessionStore (atomic), SessionManager, group store |
| `src/types/` | Core interfaces (agent, config, events, memory, messages, plugins, providers, sessions, settings, tools) |
| `src/ui/shared/` | **Web-safe** pure logic: `chatReducer`, `agentEventToAction` — zero Node.js deps |
| `src/ui/ink/` | Ink (React) TUI: components, hooks, `InkChatRunner` entry point |
| `src/utils/` | Logger |

**Default plugins (outside `src/`):**

| Directory | Tools |
|---|---|
| `plugins/file-ops/` | `read_file`, `write_file`, `list_directory` |
| `plugins/shell/` | `shell_exec` (linux/darwin) |
| `plugins/web-search/` | `web_search`, `fetch_url` |

---

## Key Files

| Path | Purpose |
|---|---|
| `src/agent/execution-loop.ts` | Core agentic loop, max 25 turns, tool-call dispatch |
| `src/agent/context-builder.ts` | Assembles system prompt + conversation history for each LLM call |
| `src/agent/token-counter.ts` | Token estimation for context window management |
| `src/agent/tool-call-bridge.ts` | Bridges ExecutionLoop tool results back into conversation |
| `src/session/session-manager.ts` | Session lifecycle, run(), AI tag/description generation, search |
| `src/session/jsonl-store.ts` | JSONL persistence with atomic writes and backup |
| `src/session/group-store.ts` | Session group management |
| `src/plugins/manager.ts` | Plugin discovery and loading from directories |
| `src/plugins/tool-executor.ts` | Tool dispatch with allow/deny lists |
| `src/plugins/gates-checker.ts` | Validates plugin gate requirements (binaries, env, platform) |
| `src/plugins/manifest-schema.ts` | Zod schema for `plugin.json` validation |
| `src/providers/anthropic.ts` | Anthropic SDK client |
| `src/providers/openai.ts` | OpenAI SDK client (also used for Kimi) |
| `src/providers/registry.ts` | Provider registry loaded from `providers.json` |
| `src/providers/manager.ts` | Provider instantiation and lifecycle |
| `src/providers/base.ts` | Shared provider base class |
| `src/providers/auth-handler.ts` | API key resolution from env/config |
| `src/providers/retry.ts` | Exponential backoff retry logic |
| `src/memory/memory-store.ts` | JsonMemoryStore — three-layer file-backed store |
| `src/memory/eviction-scorer.ts` | Weighted scoring for L3 eviction decisions |
| `src/types/memory.ts` | MemoryEntry, MemoryStore interfaces, createMemoryEntry |
| `src/errors/memory.ts` | Memory error hierarchy (MEMORY_001–006) |
| `src/security/credential-detector.ts` | Detects credentials in tool output before returning to model |
| `src/cli/bootstrap.ts` | Dependency wiring — config → session → plugins → memory → loop |
| `src/cli/commands/chat.ts` | Interactive REPL and single-message mode (non-TTY fallback) |
| `src/cli/colored-output.ts` | Chalk + ora output adapter (non-TTY path + all non-chat commands) |
| `src/cli/plain-text-output.ts` | Plain text output adapter (reference/testing) |
| `src/cli/output-adapter.ts` | OutputAdapter interface definition |
| `src/cli/input-reader.ts` | InputReader interface definition |
| `src/cli/stdin-input-reader.ts` | Stdin implementation of InputReader |
| `src/cli/slash-commands.ts` | In-REPL slash command handler (used by non-TTY path) |
| `src/ui/shared/chat-state.ts` | `ChatState`, `ChatAction`, `chatReducer` pure reducer |
| `src/ui/shared/stream-processor.ts` | `agentEventToAction` — maps AgentEvent → ChatAction |
| `src/ui/ink/InkChatRunner.ts` | Ink TUI entry point — `render(<App/>)`, awaits exit |
| `src/ui/ink/components/App.tsx` | Root Ink component — owns state, routes phases, slash commands |
| `src/ui/ink/hooks/useStreamingSession.ts` | Streams agent runs into chatReducer |
| `src/ui/ink/hooks/useTypewriter.ts` | Character-by-character text reveal hook |
| `providers.json` | Provider registry manifest |

---

## Ink TUI Architecture

Interactive TTY chat uses Ink (React terminal renderer). The design decouples state from rendering for web reuse.

### Layer Boundary

```
src/ui/shared/          ← zero Node.js deps — importable from web
  chat-state.ts         ChatState, ChatAction, chatReducer (pure function)
  stream-processor.ts   agentEventToAction() — AgentEvent → ChatAction

src/ui/ink/             ← Node.js + Ink only
  InkChatRunner.ts      render(<App/>) entry point; awaits unmount
  hooks/
    useStreamingSession  SessionManager.streamRun + chatReducer via useReducer
    useTypewriter        character queue drain at configurable interval
  components/
    App.tsx             root; routes phase → sub-components; slash commands
    ChatHeader          Unicode box: agent/provider/model/session/memory
    MessageList         committed RenderedMessage[] transcript
    StreamingMessage    live pendingText with typewriter (hidden during tool_call)
    ToolCallBlock       Ink spinner + tool name
    InputLine           ink-text-input with backslash continuation
    TokenUsageLine      dim ↑X ↓Y ∑Z footer
    ConfirmPrompt       inline [y/N] for dangerous tools (no readline)
```

### CLI Routing (`src/cli/index.ts` chat action)

```
process.stdout.isTTY && !--message
  → runInkChat()          Ink TUI path
  else
  → chat() + ColoredOutput  legacy path (non-TTY, --message, pipes)
```

### ChatState Phase Transitions

```
idle → (user_message) → idle
idle → (text_delta)   → streaming_text
streaming_text → (tool_start) → tool_call   [pendingText discarded]
tool_call → (tool_end) → streaming_text
streaming_text → (agent_end) → complete     [pendingText flushed to messages]
any → (error) → error
any → (reset_turn) → idle
any → (context_warning) → (contextWarning flag toggled)
```

---

## Bootstrap Sequence (`src/cli/bootstrap.ts`)

1. Ensure `~/.my-agent/config.yaml` exists (create default if missing)
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

---

## Conversation History

- `SessionManager` holds `currentMessages: ConversationMessage[]` in memory.
- Seeded by `createSession()` (empty) or `resumeSession()` (replayed from JSONL, `message` records only).
- Passed as `conversationHistory` to `ExecutionLoop.run()` / `ExecutionLoop.stream()` on each turn.
- Only `user` and final `assistant` messages are persisted to JSONL; intermediate `tool_use` and `tool_result` messages are dropped from the persisted record but remain in the in-memory array for the duration of the session.

---

## Memory Module

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

- `expiresAt` (absolute): checked at read-time; throws `MemoryExpiredError` — entry stays on disk, must be evicted explicitly.
- `ttlDays` (relative): checked at read-time; returns `null` silently — entry stays on disk for eviction sweep.
- L1 entries never expire. L2 entries ignore `ttlDays` even if set.

### Eviction Sweep

Runs at `initialize()` and when expired L3 count exceeds a configurable threshold (default: 100 entries).

| Factor | Weight | Condition |
|---|---|---|
| High-value tags (`important`, `critical`, `permanent`) | +0.4 | tag match |
| High access | +0.25 | `accessCount >= 3` |
| Renewed TTL | +0.2 | `ttlRenewals > 0` |
| Substantial content | +0.1 | `content.length > 200` |
| Old and unrenewed | -0.1 | age > 7 days && `ttlRenewals === 0` |

Score >= 0.6: set `pendingKB = true` (retain for KB promotion). Score < 0.6: delete file.

### Memory Error Codes

| Code | Class | Meaning |
|---|---|---|
| MEMORY_001 | `MemoryNotFoundError` | Entry does not exist |
| MEMORY_002 | `MemoryExpiredError` | `expiresAt` exceeded |
| MEMORY_003 | `MemoryStorageError` | File I/O failure |
| MEMORY_004 | `MemoryValidationError` | Invalid entry data |
| MEMORY_005 | `MemoryLayerError` | Wrong layer operation |
| MEMORY_006 | `MemoryCapacityError` | Store capacity exceeded |

---

## Session JSONL Format

Each session is a `.jsonl` file at `~/.my-agent/sessions/<id>.jsonl`. One JSON object per line.

| Record type | Written when |
|---|---|
| `session_start` | Session created |
| `message` | Each user or final assistant message |
| `turn_metadata` | After each LLM turn (tokens, duration, tool count, stop reason) |
| `error_log` | When errors occur |

---

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

---

## Configuration

**`~/.my-agent/config.yaml`** — credentials and model selection (written by `setup` command).

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

---

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

Error code namespaces: `AGENT_001`–`007`, `PROVIDER_001`–`007`, `PLUGIN_001`–`006`, `SESSION_001`–`007`, `MEMORY_001`–`006`

---

## Providers

| Provider | SDK | Notes |
|---|---|---|
| `anthropic` | Anthropic SDK | Claude models |
| `openai` | OpenAI SDK | GPT models |
| `kimi` | OpenAI SDK | Moonshot AI (OpenAI-compatible) |

To add a new OpenAI-compatible provider: add an entry to `providers.json` — no code changes needed.

---

## Design Decisions

| Concern | Approach |
|---|---|
| Agent loop | Custom (no LangGraph) |
| Provider registry | `providers.json` manifest — add providers without code changes |
| SDK abstraction | Two SDKs (Anthropic, OpenAI); multiple providers share same SDK |
| Plugin system | `plugin.json` manifests with JSON Schema tool definitions |
| Session storage | Append-only JSONL — human-readable, corruption-resistant |
| Event persistence | `turn_metadata` + `error_log` records in session JSONL |
| Memory storage | Per-entry JSON files, atomic writes (tmp + rename), mode 0o600 |
| Output adapter | `OutputAdapter` interface — used by non-TTY / non-chat paths; TTY chat uses Ink TUI |
| Ink TUI | React component tree (Ink) — `chatReducer` pure state machine, web-reusable shared layer |
| Config | `~/.my-agent/config.yaml` (credentials) + `settings.yaml` (behavior) |
| Immutability | `readonly` on all message/session/memory types |

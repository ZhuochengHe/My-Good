# Architecture

## Overview

```
User Input → CLI → ExecutionLoop → Provider (LLM API)
                        ↑                   ↓
                 Tool Results ←── PluginManager ←── Tool Calls
                        ↓
                SessionStore (JSONL)
```

**Stack:** TypeScript (strict, ESM) · Node.js ≥18 · Vitest · Commander.js

## Source Layout

```
src/
├── types/       # Core interfaces (Message, Tool, Plugin, Provider, Session, Agent)
├── agent/       # Execution loop (ExecutionLoop, ContextBuilder, SessionManager)
├── providers/   # Anthropic + OpenAI SDK clients; registry-based discovery
├── plugins/     # PluginManager, ToolExecutor, manifest validation
├── session/     # JsonlSessionStore, SessionManager
├── config/      # YAML loader + Zod validation (config.yaml, settings.yaml)
├── events/      # EventEmitter, subscribers (logging, persistence)
├── cli/         # Commander commands (chat, setup, session, plugin, config, settings)
└── utils/       # Logger, retry, ID generation

plugins/         # Default plugins
├── file-ops/    # read_file, write_file, list_directory
├── shell/       # shell_exec (linux/darwin)
└── web-search/  # web_search, fetch_url
```

## Key Design Decisions

| Concern | Approach |
|---|---|
| Agent loop | Custom (no LangGraph/Pi) |
| Provider registry | `providers.json` manifest — add providers without code changes |
| SDK abstraction | Two SDKs (Anthropic, OpenAI); multiple providers share same SDK |
| Plugin system | `plugin.json` manifests with JSON Schema tool definitions |
| Session storage | Append-only JSONL — human-readable, corruption-resistant |
| Event persistence | `turn_metadata` + `error_log` records written into session JSONL |
| Config | `~/.my-agent/config.yaml` (credentials) + `settings.yaml` (behavior) |
| Immutability | `readonly` on all message/session types |

## Providers

Three providers out of the box, extensible via `providers.json`:

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
| `turn_metadata` | After each LLM turn (tokens, duration, tool count) |
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
  systemPrompt: "You are a helpful AI assistant."

tools:
  allow: []
  deny: []
  requireApproval: [shell_exec]
```

## Core Interfaces

```typescript
interface Agent {
  run(input: string, options?: AgentRunOptions): Promise<AgentRunResult>;
  stream(input: string, options?: AgentRunOptions): AsyncIterable<AgentEvent>;
  getTools(): readonly ToolDefinition[];
  getSession(sessionId: string): Promise<Session | null>;
}

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

Error codes: `AGENT_001`–`007`, `PROVIDER_001`–`007`, `PLUGIN_001`–`006`, `SESSION_001`–`007`

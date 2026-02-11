# Agent Execution Loop Architecture

**Version:** 1.0.0 | **Status:** Approved | **Updated:** 2026-01-28

## Overview

Custom agent execution loop for TypeScript/Node.js. Supports message-driven conversation with tool calling, manifest-based plugins, multi-model providers (Anthropic/OpenAI), JSONL session persistence.

## Core Interfaces

### Message Types

```typescript
type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

interface Message {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: number;
}

interface AssistantMessage extends Message {
  readonly role: 'assistant';
  readonly toolCalls?: ToolCall[];
  readonly stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error';
}

interface ToolResultMessage extends Message {
  readonly role: 'tool';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly isError: boolean;
}
```

### Tool System

```typescript
interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: {
    readonly type: 'object';
    readonly properties: Record<string, ParameterSchema>;
    readonly required: readonly string[];
  };
}

interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

interface ToolResult {
  readonly callId: string;
  readonly name: string;
  readonly success: boolean;
  readonly output: string;
  readonly error?: ToolError;
  readonly durationMs: number;
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolHandlerResult>;
```

### Plugin System

```typescript
interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly tools: readonly ToolManifest[];
  readonly gates?: PluginGates;
}

interface PluginGates {
  readonly requiredBinaries?: readonly string[];
  readonly requiredEnv?: Record<string, string | '*'>;
  readonly platforms?: readonly ('linux' | 'darwin' | 'win32')[];
}
```

### Model Provider

```typescript
type ProviderType = 'anthropic' | 'openai';

interface ModelProvider {
  readonly type: ProviderType;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  listModels(): Promise<readonly ModelInfo[]>;
  healthCheck(): Promise<boolean>;
}

interface CompletionRequest {
  readonly model: string;
  readonly messages: readonly ConversationMessage[];
  readonly tools?: readonly ToolDefinition[];
  readonly systemPrompt?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}
```

### Session Management

```typescript
interface Session {
  readonly id: string;
  readonly agentId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly ConversationMessage[];
  readonly metadata: SessionMetadata;
}

interface SessionStore {
  load(sessionId: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  appendMessage(sessionId: string, message: ConversationMessage): Promise<void>;
  list(): Promise<readonly SessionSummary[]>;
  delete(sessionId: string): Promise<void>;
  clear(sessionId: string): Promise<void>;
}
```

### Agent Core

```typescript
interface AgentConfig {
  readonly id: string;
  readonly name: string;
  readonly systemPrompt: string;
  readonly model: string;
  readonly provider: ProviderType;
  readonly maxTurns: number;
  readonly maxTokensPerTurn: number;
  readonly tools: {
    readonly allow: readonly string[];
    readonly deny: readonly string[];
    readonly requireApproval: readonly string[];
  };
}

interface Agent {
  readonly config: AgentConfig;
  run(input: string, options?: AgentRunOptions): Promise<AgentRunResult>;
  stream(input: string, options?: AgentRunOptions): AsyncIterable<AgentEvent>;
  getTools(): readonly ToolDefinition[];
  getSession(sessionId: string): Promise<Session | null>;
}
```

### Event System

```typescript
type AgentEvent =
  | { type: 'agent_start'; sessionId: string; timestamp: number }
  | { type: 'turn_start'; turnNumber: number; timestamp: number }
  | { type: 'text_delta'; delta: string; timestamp: number }
  | { type: 'tool_call_start'; toolCall: ToolCall; timestamp: number }
  | { type: 'tool_call_end'; result: ToolResult; timestamp: number }
  | { type: 'turn_end'; turnNumber: number; usage: TokenUsage; timestamp: number }
  | { type: 'agent_end'; result: AgentRunResult; timestamp: number }
  | { type: 'error'; error: AgentError; timestamp: number };
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI INTERFACE                         │
│  [chat] [run] [plugins] [config] [session]                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     AGENT EXECUTION LOOP                     │
│                                                              │
│   1. Input ──▶ 2. Build Context ──▶ 3. Send to Provider     │
│                                              │               │
│                                              ▼               │
│   ┌──────────────────────────────────────────────┐          │
│   │            Has Tool Calls?                    │          │
│   └───────────┬───────────────────┬──────────────┘          │
│               │ YES               │ NO                       │
│               ▼                   ▼                          │
│   4. Execute Tools    5. Return Response                     │
│        │                                                     │
│        └──▶ 6. Append Results ──▶ Loop to Step 3            │
└──────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌───────────────┐
│ PLUGIN MANAGER│  │ SESSION STORE   │  │ EVENT EMITTER │
│ - Discovery   │  │ - JSONL files   │  │ - Subscribers │
│ - Validation  │  │ - Load/Save     │  │ - Logging     │
│ - Execution   │  │ - Append        │  │ - UI updates  │
└───────┬───────┘  └─────────────────┘  └───────────────┘
        │
┌───────┴───────────────────────────────┐
│           DEFAULT PLUGINS             │
│  [file-ops] [shell] [web-search]      │
└───────────────────────────────────────┘
        │
┌───────┴───────────────────────────────┐
│           MODEL PROVIDERS             │
│  [Anthropic: Claude] [OpenAI: GPT]    │
└───────────────────────────────────────┘
```

## Error Handling

### Error Code System

All errors include unique error codes and structured context:

| Layer | Error Classes | Error Codes | Example |
|-------|---------------|-------------|---------|
| Agent | 7 classes | `AGENT_001` - `AGENT_007` | AgentInitializationError, AgentExecutionError |
| Provider | 7 classes | `PROVIDER_001` - `PROVIDER_007` | ProviderAuthenticationError, ProviderRateLimitError |
| Plugin | 6 classes | `PLUGIN_001` - `PLUGIN_006` | PluginValidationError, PluginExecutionError |
| Session | 7 classes | `SESSION_001` - `SESSION_007` | SessionNotFoundError, SessionCorruptedError |

### Error Handling Strategy

| Layer | Error Type | Strategy |
|-------|------------|----------|
| Provider | API timeout | Retry 3x with backoff |
| Provider | Rate limit | Retry with delay |
| Provider | Auth failure | Abort |
| Tool | Not found | Skip, continue |
| Tool | Validation error | Return error to model |
| Tool | Execution timeout | Return timeout error |
| Session | Corrupted data | Backup, create new |
| Config | Invalid | Abort startup |

All errors are logged to session error logs for debugging with:
- Error code and message
- Contextual information (turn number, tool name, etc.)
- Stack traces for debugging
- Timestamp for correlation

## Extension Points

1. **New Provider**: Implement `ModelProvider` interface
2. **New Plugin**: Create `plugin.json` manifest + handlers
3. **Event Subscriber**: Implement `onEvent(event: AgentEvent)`
4. **Custom Session Store**: Implement `SessionStore` interface
5. **Session Store with Trace**: Implement `SessionStoreWithTrace` for event persistence support

## Directory Structure

```
src/
├── types/           # Shared type definitions
├── agent/           # Agent execution core
├── providers/       # Model provider implementations
├── plugins/         # Plugin system
├── session/         # Session management
├── config/          # Configuration system
├── events/          # Event system
├── cli/             # CLI interface
├── utils/           # Shared utilities
└── errors/          # Error definitions

plugins/             # Default plugins
├── file-ops/
├── shell/
└── web-search/
```

## Configuration

```yaml
agent:
  id: default
  model: claude-sonnet-4-20250514
  provider: anthropic
  maxTurns: 20
  tools:
    allow: ['*']
    requireApproval: [shell_exec]

providers:
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
  openai:
    apiKey: ${OPENAI_API_KEY}

plugins:
  directories: [~/.my-agent/plugins, ./plugins]
  enabled: ['*']

session:
  storePath: ~/.my-agent/sessions
  maxMessages: 100
```

## Session Format (JSONL)

Each session is stored as a JSONL file with multiple record types:

```jsonl
{"type":"session_start","sessionId":"abc123","agentId":"default","timestamp":1706400000000,"metadata":{...}}
{"type":"message","message":{"id":"msg_001","role":"user","content":"Read config.yaml"},"timestamp":1706400001000}
{"type":"message","message":{"id":"msg_002","role":"assistant","toolCalls":[...],"stopReason":"tool_use"},"timestamp":1706400002000}
{"type":"turn_metadata","turnNumber":1,"usage":{"promptTokens":120,"completionTokens":45,"totalTokens":165},"durationMs":1543,"toolCount":1,"stopReason":"tool_use","timestamp":1706400002543}
{"type":"error_log","turnNumber":2,"error":"ToolExecutionError","message":"Tool timeout","context":"read_file","stack":"...","timestamp":1706400010000}
```

### Record Types

| Type | Purpose | When Written |
|------|---------|--------------|
| `session_start` | Session metadata | Once at session creation |
| `message` | Conversation messages | After each message (user/assistant/tool) |
| `turn_metadata` | Turn metrics | After each LLM turn completes |
| `error_log` | Error tracking | When errors occur during execution |

### Event Persistence (Always-On)

Turn metadata and error logs are automatically persisted during execution:
- **Turn Metrics**: Duration, token usage, tool count, stop reason
- **Error Logs**: Error type, message, context, stack trace
- **Zero Overhead**: Written during execution, not on-demand
- **Debuggable**: Human-readable JSONL format

Use `--trace` flag with `session show` to view trace data:
```bash
my-agent session show <session-id> --trace
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Message Immutability | `readonly` everywhere | Prevents mutation bugs |
| Event-Driven | Emit events for state changes | Decouples UI from core |
| JSONL Sessions | Append-only JSON lines | Fast writes, debuggable |
| Plugin Manifest | JSON with JSON Schema params | LLM-friendly |
| Zod for Config | Runtime validation | Catches errors early |

---

## Future Loop Patterns

Advanced agent loop patterns that integrate with the current architecture without modifying core interfaces. Each pattern uses existing extension points (events, plugins, session store) plus minimal new interfaces.

**Design Principle:** All patterns are opt-in. The core `Agent` interface and execution loop remain unchanged. Patterns are enabled via configuration or runtime options.

---

### Pattern 1: Plan-Execute-Reflect Loop

Agent generates a plan, executes steps, reflects on results, and optionally replans.

**Integration Point:** `LoopStrategy` interface injected via `AgentRunOptions`

```typescript
/** Execution phase in the loop */
type LoopPhase = 'plan' | 'execute' | 'reflect';

/** Result of a loop phase */
interface PhaseResult {
  readonly phase: LoopPhase;
  readonly output: string;
  readonly shouldContinue: boolean;
  readonly nextPhase?: LoopPhase;
  readonly metadata?: Record<string, unknown>;
}

/** Strategy that controls loop behavior */
interface LoopStrategy {
  readonly id: string;

  /** Called before each turn to determine phase */
  beforeTurn(context: LoopContext): Promise<LoopPhase>;

  /** Transform the prompt based on current phase */
  buildPrompt(phase: LoopPhase, input: string, context: LoopContext): string;

  /** Evaluate phase result and decide next action */
  afterTurn(phase: LoopPhase, result: PhaseResult, context: LoopContext): Promise<{
    readonly continue: boolean;
    readonly nextPhase?: LoopPhase;
  }>;
}

/** Context available to loop strategy */
interface LoopContext {
  readonly sessionId: string;
  readonly turnNumber: number;
  readonly plan?: string;
  readonly executionHistory: readonly PhaseResult[];
  readonly messages: readonly ConversationMessage[];
}
```

**What Changes:**
- New `LoopStrategy` interface in `src/types/strategies.ts`
- `AgentRunOptions` adds optional `strategy?: LoopStrategy`
- New events: `phase_start`, `phase_end`, `replan`

**What Stays Unchanged:**
- `Agent` interface (strategy is optional via options)
- `ModelProvider` interface
- `ToolHandler` signature
- `SessionStore` interface
- All existing event types

**Execution Flow:**

```
Default behavior (no strategy):
  Input → Provider → Tool Calls? → Execute → Loop → Output

With PlanExecuteReflect strategy:
  Input → [PLAN phase] → Provider → Parse plan steps
        → [EXECUTE phase] → Execute step → Provider → Tools
        → [REFLECT phase] → Provider → Evaluate success
        → Decision: complete | replan | continue
```

---

### Pattern 2: Long-term Memory

Vector database or retrieval system for cross-session memory and context injection.

**Integration Point:** `MemoryStore` interface + context building phase

```typescript
/** Memory entry stored in vector DB */
interface MemoryEntry {
  readonly id: string;
  readonly content: string;
  readonly embedding?: readonly number[];
  readonly metadata: MemoryMetadata;
  readonly createdAt: number;
  readonly accessedAt: number;
}

/** Metadata for memory retrieval */
interface MemoryMetadata {
  readonly sessionId?: string;
  readonly agentId: string;
  readonly type: 'fact' | 'preference' | 'task_result' | 'conversation_summary';
  readonly importance: number;  // 0-1 score for retrieval ranking
  readonly tags?: readonly string[];
}

/** Query for memory retrieval */
interface MemoryQuery {
  readonly text: string;
  readonly limit?: number;
  readonly minImportance?: number;
  readonly types?: readonly MemoryMetadata['type'][];
  readonly sessionScope?: 'current' | 'all' | 'cross_session';
}

/** Memory store interface (separate from SessionStore) */
interface MemoryStore {
  /** Store a memory entry */
  store(entry: Omit<MemoryEntry, 'id' | 'embedding'>): Promise<MemoryEntry>;

  /** Retrieve relevant memories for a query */
  retrieve(query: MemoryQuery): Promise<readonly MemoryEntry[]>;

  /** Update memory importance or metadata */
  update(id: string, updates: Partial<Pick<MemoryEntry, 'metadata' | 'accessedAt'>>): Promise<void>;

  /** Delete memories */
  delete(ids: readonly string[]): Promise<void>;

  /** Summarize and consolidate old memories */
  consolidate(agentId: string): Promise<void>;
}

/** Memory-aware context builder */
interface MemoryContextBuilder {
  /** Inject relevant memories into system prompt or context */
  buildContext(
    query: string,
    session: Session,
    memory: MemoryStore
  ): Promise<{
    readonly systemPromptAddition: string;
    readonly relevantMemories: readonly MemoryEntry[];
  }>;
}
```

**What Changes:**
- New `MemoryStore` interface in `src/types/memory.ts`
- New `MemoryContextBuilder` interface
- `AgentConfig` adds optional `memory?: { store: MemoryStore; contextBuilder?: MemoryContextBuilder }`
- New events: `memory_retrieved`, `memory_stored`

**What Stays Unchanged:**
- `Agent` interface
- `Session` / `SessionStore` interfaces (memory is separate concern)
- `ModelProvider` interface
- `ToolHandler` signature
- Core execution loop

**Execution Flow:**

```
Without memory:
  Input → Build Context → Provider → Response

With memory:
  Input → Query MemoryStore → Inject memories into context
        → Build Context → Provider → Response
        → Extract learnings → Store to MemoryStore
```

**Storage Options (pluggable via MemoryStore implementations):**
- `InMemoryStore` - Development/testing
- `SqliteVectorStore` - Local vector search with sqlite-vec
- `RedisVectorStore` - Redis Stack with vector similarity
- `PineconeStore` - Managed cloud vector DB

---

### Pattern 3: Subagent Spawning

Main agent spawns specialist agents for complex subtasks.

**Integration Point:** `AgentFactory` + `SubagentTool` plugin

```typescript
/** Factory for creating agent instances */
interface AgentFactory {
  /** Create an agent with the given config */
  create(config: AgentConfig): Agent;

  /** Create a specialized subagent from a template */
  createFromTemplate(templateId: string, overrides?: Partial<AgentConfig>): Agent;

  /** List available agent templates */
  listTemplates(): readonly AgentTemplate[];
}

/** Predefined agent configuration template */
interface AgentTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly config: Omit<AgentConfig, 'id'>;
  readonly suggestedTools: readonly string[];
}

/** Context passed from parent to subagent */
interface SubagentContext {
  readonly parentSessionId: string;
  readonly parentAgentId: string;
  readonly task: string;
  readonly inheritedContext?: string;
  readonly maxTurns?: number;
  readonly tools?: {
    readonly allow?: readonly string[];
    readonly deny?: readonly string[];
  };
}

/** Result from subagent execution */
interface SubagentResult {
  readonly subagentId: string;
  readonly success: boolean;
  readonly output: string;
  readonly toolCalls: readonly ToolResult[];
  readonly usage: TokenUsage;
  readonly error?: AgentError;
}

/** Subagent execution events (extends AgentEvent) */
interface SubagentStartEvent {
  readonly type: 'subagent_start';
  readonly parentSessionId: string;
  readonly subagentId: string;
  readonly task: string;
  readonly timestamp: number;
}

interface SubagentEndEvent {
  readonly type: 'subagent_end';
  readonly parentSessionId: string;
  readonly subagentId: string;
  readonly result: SubagentResult;
  readonly timestamp: number;
}
```

**What Changes:**
- New `AgentFactory` interface in `src/types/factory.ts`
- New subagent event types added to `AgentEvent` union
- New `spawn_agent` tool in a `subagent` plugin
- `AgentConfig` adds optional `allowSubagents?: boolean`

**What Stays Unchanged:**
- `Agent` interface (subagents are created via factory, not method)
- `ModelProvider` interface
- `SessionStore` interface
- `ToolHandler` signature
- Existing event types

**Execution Flow:**

```
Main agent receives complex task
  → Decides to spawn specialist (via spawn_agent tool)
  → AgentFactory.createFromTemplate('code-reviewer', { task })
  → Subagent runs independently (own session)
  → Subagent completes → Result returned to parent
  → Parent integrates result → Continues execution
```

**Built-in Agent Templates:**
- `code-reviewer` - Focused on code analysis
- `researcher` - Web search and summarization
- `planner` - Task decomposition specialist
- `executor` - Tool execution focus

---

### Integration Summary

| Pattern | Extension Point | New Interfaces | Core Changes |
|---------|-----------------|----------------|--------------|
| Plan-Execute-Reflect | `AgentRunOptions.strategy` | `LoopStrategy`, `LoopContext`, `PhaseResult` | None |
| Long-term Memory | `AgentConfig.memory` | `MemoryStore`, `MemoryEntry`, `MemoryQuery` | None |
| Subagent Spawning | `AgentFactory` + plugin | `AgentFactory`, `AgentTemplate`, `SubagentContext` | None |

**Shared Principles:**
1. All patterns are opt-in via configuration or options
2. Core `Agent` interface remains unchanged
3. New events extend the existing `AgentEvent` union type
4. Patterns can be combined (e.g., subagent with memory)
5. Each pattern has a default "off" behavior matching current implementation

### Event System Extensions

New event types for future patterns (extend `AgentEvent` union when implemented):

```typescript
/** Extended event types for future patterns */
type ExtendedAgentEvent = AgentEvent
  // Plan-Execute-Reflect
  | { type: 'phase_start'; phase: LoopPhase; timestamp: number }
  | { type: 'phase_end'; phase: LoopPhase; result: PhaseResult; timestamp: number }
  | { type: 'replan'; reason: string; timestamp: number }
  // Memory
  | { type: 'memory_retrieved'; entries: readonly MemoryEntry[]; timestamp: number }
  | { type: 'memory_stored'; entry: MemoryEntry; timestamp: number }
  // Subagents
  | SubagentStartEvent
  | SubagentEndEvent;
```

### File Structure for Future Patterns

```
src/
├── types/
│   ├── strategies.ts    # LoopStrategy, LoopContext, PhaseResult
│   ├── memory.ts        # MemoryStore, MemoryEntry, MemoryQuery
│   └── factory.ts       # AgentFactory, AgentTemplate, SubagentContext
├── strategies/
│   ├── default.ts       # Pass-through strategy (current behavior)
│   └── plan-execute-reflect.ts
├── memory/
│   ├── in-memory.ts     # Development implementation
│   └── sqlite-vector.ts # Production implementation
└── factory/
    ├── default-factory.ts
    └── templates/
        ├── code-reviewer.ts
        └── researcher.ts

plugins/
└── subagent/
    └── plugin.json      # spawn_agent tool definition
```

---

## Future Work: Event Persistence

### Motivation

Currently, session JSONL files only store `session_start` and `message` records, capturing conversation history but not execution metrics. Adding event persistence would create a complete execution trace for debugging, analysis, and performance monitoring.

### Design Overview

Extend the JSONL session format to include turn-level metadata and error logs:

```typescript
/** Extended JSONL record types */
type JsonlRecordType =
  | 'session_start'    // Existing: session metadata
  | 'message'          // Existing: conversation messages
  | 'turn_metadata'    // New: turn-level execution metrics
  | 'error_log';       // New: timestamped error events

/** Turn metadata record */
interface TurnMetadataRecord extends JsonlRecord {
  readonly type: 'turn_metadata';
  readonly turnNumber: number;
  readonly usage: TokenUsage;              // Input/output/total tokens
  readonly durationMs: number;             // Turn execution time
  readonly toolCallCount: number;          // Number of tools called
  readonly timestamp: number;
}

/** Error log record */
interface ErrorLogRecord extends JsonlRecord {
  readonly type: 'error_log';
  readonly turnNumber: number;
  readonly errorCode: string;              // E.g., 'PROVIDER_ERROR', 'TOOL_ERROR'
  readonly errorMessage: string;
  readonly recoverable: boolean;
  readonly timestamp: number;
}
```

### JSONL File Format

```jsonl
{"type":"session_start","sessionId":"abc","agentId":"main","metadata":{...},"createdAt":...,"updatedAt":...}
{"type":"message","message":{"role":"user","content":"Fix the bug in file.ts",...}}
{"type":"message","message":{"role":"assistant","content":"Let me read the file",...}}
{"type":"turn_metadata","turnNumber":1,"usage":{"inputTokens":150,"outputTokens":50,"totalTokens":200},"durationMs":1234,"toolCallCount":1,"timestamp":...}
{"type":"message","message":{"role":"tool","toolCallId":"tc_001","content":"[file contents]",...}}
{"type":"message","message":{"role":"assistant","content":"I found the issue",...}}
{"type":"turn_metadata","turnNumber":2,"usage":{"inputTokens":300,"outputTokens":80,"totalTokens":380},"durationMs":987,"toolCallCount":0,"timestamp":...}
```

### Benefits

1. **Complete Execution Trace**
   - Reconstruct full agent execution timeline
   - Analyze token usage per turn
   - Measure turn latency and tool call overhead

2. **Performance Analysis**
   - Identify slow turns or expensive tool calls
   - Track token costs across sessions
   - Detect performance regressions

3. **Error Debugging**
   - Timestamped error logs with context
   - Correlate errors with specific turns
   - Distinguish transient vs fatal errors

4. **Metrics & Monitoring**
   - Aggregate metrics from session files
   - Build dashboards without external metrics systems
   - Session files are self-contained audit logs

### Implementation Approach

#### Phase 1: EventSubscriber for Persistence

Create a `PersistenceSubscriber` that listens to events and writes records:

```typescript
// src/events/persistence-subscriber.ts
export function createPersistenceSubscriber(
  store: JsonlSessionStore,
  sessionId: string
): EventSubscriber {
  return {
    async onEvent(event: AgentEvent): Promise<void> {
      switch (event.type) {
        case 'turn_end':
          await store.appendTurnMetadata(sessionId, {
            type: 'turn_metadata',
            turnNumber: event.turnNumber,
            usage: event.usage,
            durationMs: calculateDuration(event),  // From turn_start timestamp
            toolCallCount: getToolCallCount(event),
            timestamp: event.timestamp,
          });
          break;

        case 'error':
          await store.appendErrorLog(sessionId, {
            type: 'error_log',
            turnNumber: getCurrentTurn(),
            errorCode: event.error.code,
            errorMessage: event.error.message,
            recoverable: event.error.recoverable,
            timestamp: event.timestamp,
          });
          break;
      }
    },
  };
}
```

#### Phase 2: Extend JsonlSessionStore

Add methods to write new record types:

```typescript
// src/session/jsonl-store.ts
export class JsonlSessionStore implements SessionStore {
  /**
   * Append turn metadata record to session.
   */
  async appendTurnMetadata(
    sessionId: string,
    metadata: TurnMetadataRecord
  ): Promise<void> {
    // Similar to appendMessage: read lines, append record, atomic write
  }

  /**
   * Append error log record to session.
   */
  async appendErrorLog(
    sessionId: string,
    error: ErrorLogRecord
  ): Promise<void> {
    // Similar to appendMessage
  }

  /**
   * Load session with full execution trace.
   */
  async loadWithTrace(sessionId: string): Promise<SessionWithTrace | null> {
    // Parse all record types, return messages + metadata + errors
  }
}
```

#### Phase 3: Opt-in Configuration

Make event persistence opt-in via config:

```typescript
// src/types/config.ts
export interface AgentConfig {
  // ... existing fields
  persistEvents?: boolean;  // Default: false for backward compatibility
}

// Usage
const agent = new ExecutionLoop(config, provider);
if (config.persistEvents) {
  const persistenceSubscriber = createPersistenceSubscriber(store, sessionId);
  emitter.subscribe(persistenceSubscriber);
}
```

### Backward Compatibility

- Existing sessions without `turn_metadata`/`error_log` load normally
- New record types are optional - parsers skip unknown types
- No breaking changes to Session interface
- Performance impact: ~5-10% overhead per turn (two extra JSONL appends)

### File Size Considerations

For a typical 50-turn session:
- Current: ~500 KB (messages only)
- With events: ~550 KB (+10% overhead)
  - turn_metadata: ~100 bytes/turn × 50 = 5 KB
  - error_log: rare, negligible

Still well under MAX_SESSION_SIZE (100 MB).

### Analysis Tools

Once implemented, enable powerful analysis:

```typescript
// Example: Session analytics
const trace = await store.loadWithTrace(sessionId);

// Aggregate token usage
const totalTokens = trace.turnMetadata
  .reduce((sum, t) => sum + t.usage.totalTokens, 0);

// Find slow turns
const slowTurns = trace.turnMetadata
  .filter(t => t.durationMs > 5000);

// Error frequency
const errorCount = trace.errorLogs.length;
const recoverableErrors = trace.errorLogs
  .filter(e => e.recoverable).length;
```

### Timeline

- **Stage 6 or 7**: Implement event persistence
- **Prerequisites**: Current event system (BP5) is already designed to support this
- **Effort**: ~2-3 days (subscriber + store methods + tests)

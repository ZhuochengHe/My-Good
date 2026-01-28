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

## Extension Points

1. **New Provider**: Implement `ModelProvider` interface
2. **New Plugin**: Create `plugin.json` manifest + handlers
3. **Event Subscriber**: Implement `onEvent(event: AgentEvent)`
4. **Custom Session Store**: Implement `SessionStore` interface

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

```jsonl
{"type":"session_start","sessionId":"abc123","timestamp":1706400000000}
{"type":"message","id":"msg_001","role":"user","content":"Read config.yaml","timestamp":1706400001000}
{"type":"message","id":"msg_002","role":"assistant","toolCalls":[{"id":"tc_001","name":"read_file","arguments":{"path":"config.yaml"}}],"stopReason":"tool_use","timestamp":1706400002000}
{"type":"tool_result","callId":"tc_001","success":true,"output":"...","durationMs":15,"timestamp":1706400002015}
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Message Immutability | `readonly` everywhere | Prevents mutation bugs |
| Event-Driven | Emit events for state changes | Decouples UI from core |
| JSONL Sessions | Append-only JSON lines | Fast writes, debuggable |
| Plugin Manifest | JSON with JSON Schema params | LLM-friendly |
| Zod for Config | Runtime validation | Catches errors early |

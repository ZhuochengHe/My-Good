# LLM Context Document

**Purpose:** Concise context for LLM agents working on this codebase.

## Project Summary

**Name:** Custom Agent Execution Loop
**Language:** TypeScript (strict, ESM)
**Runtime:** Node.js ≥18.0.0
**Status:** Stage 7 complete (Event Persistence), CLI improvements complete, Stage 8 next (Polish & Documentation)

## What We're Building

A CLI-based AI agent that:
1. Takes user input
2. Sends to LLM (Claude/GPT)
3. Parses and executes tool calls
4. Returns tool results to LLM
5. Repeats until task complete or max turns

## Key Architecture Decisions

| Aspect | Decision |
|--------|----------|
| Agent Loop | Custom (not Pi Agent/LangGraph) |
| Providers | Anthropic + OpenAI + Kimi (extensible via registry) |
| Provider Registry | JSON manifest (providers.json) with dynamic model fetching |
| SDKs | Two types - Anthropic SDK, OpenAI SDK |
| Model Selection | Dynamic - fetched from provider APIs at setup |
| Plugins | Manifest-based (plugin.json) |
| Sessions | JSONL files |
| Config | YAML + Zod validation, separate settings.yaml |
| CLI | Interactive setup, settings management, wrapper script |
| Interface | CLI only (no web for MVP) |

## Core Components

```
src/
├── types/      # All TypeScript interfaces
├── agent/      # Execution loop logic
├── providers/  # Anthropic, OpenAI clients
├── plugins/    # Plugin discovery and execution
├── session/    # JSONL session storage
├── config/     # YAML loading + validation
├── events/     # Event emitter system
├── cli/        # CLI commands
└── utils/      # Logger, retry, ID generation
```

## Main Interfaces

```typescript
// Agent runs the execution loop
interface Agent {
  run(input: string, options?: AgentRunOptions): Promise<AgentRunResult>;
  stream(input: string, options?: AgentRunOptions): AsyncIterable<AgentEvent>;
}

// Provider talks to LLM APIs
interface ModelProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
}

// Plugin provides tools
interface PluginManifest {
  id: string;
  name: string;
  tools: ToolManifest[];
}

// Session stores conversation
interface SessionStore {
  load(sessionId: string): Promise<Session | null>;
  appendMessage(sessionId: string, message: ConversationMessage): Promise<void>;
}

// Extended store with event persistence
interface SessionStoreWithTrace extends SessionStore {
  loadWithTrace(sessionId: string): Promise<SessionWithTrace | null>;
  appendTurnMetadata(sessionId: string, metadata: TurnMetadataRecord): Promise<void>;
  appendErrorLog(sessionId: string, error: ErrorLogRecord): Promise<void>;
}
```

## Code Standards

- **Naming:** lowerCamelCase (vars/funcs), UpperCamelCase (classes/interfaces)
- **Types:** Prefer interfaces, avoid `any`
- **Exports:** No default exports
- **Comments:** JSDoc for all exports
- **Immutability:** Use `readonly` for all message types

## Implementation Priority

1. ✅ Types → 2. ✅ Config → 3. ✅ Logger → 4. ✅ Providers → 5. ✅ Agent Loop → 6. ✅ Plugin Manager → 7. ✅ Tool Executor → 8. ✅ Default Plugins → 9. ✅ Session Store → 10. ✅ Session Lifecycle → 11. ✅ CLI → 12. ✅ Event Persistence → 13. Polish & Docs


## Default Plugins ✅

| Plugin | Tools | Status |
|--------|-------|--------|
| file-ops | read_file, write_file, list_directory | ✅ Complete |
| shell | shell_exec | ✅ Complete (linux/darwin) |
| web-search | web_search, fetch_url | ✅ Complete (MVP) |

## Error Handling

- **Error Codes:** Unique codes for all errors (AGENT_001, PROVIDER_001, etc.)
- **Structured Context:** All errors include context objects
- **Always-On Logging:** Errors automatically logged to session JSONL
- Provider errors: Retry 3x with exponential backoff
- Tool errors: Return to model as tool result
- Config errors: Abort startup with clear message
- Session errors: Create backup, start fresh

## Testing

- Framework: Vitest
- Coverage: 85.82% (982 tests across 41 test files)
- Approach: TDD (write tests first)

## Quick Reference

```bash
# Run agent
my-agent chat                    # Interactive mode
my-agent run "read package.json" # Single turn

# Interactive setup (configure provider, API key, model)
./bin/my-agent setup              # Password input hidden, fetches available models

# Settings management
./bin/my-agent settings show      # View all settings
./bin/my-agent settings get model.temperature
./bin/my-agent settings set behavior.maxTurns 30
./bin/my-agent settings reset     # Reset to defaults

# Model management
./bin/my-agent model update       # Update available models from APIs

# Manage plugins
./bin/my-agent plugins list
./bin/my-agent plugins info file-ops

# Manage sessions
./bin/my-agent session list
./bin/my-agent session show <id>       # View session details
./bin/my-agent session show <id> --trace  # View with turn metrics and errors
./bin/my-agent session delete <id>
```

## File Locations

| Item | Path |
|------|------|
| Config | `~/.my-agent/config.yaml` (credentials, model selection) |
| Settings | `~/.my-agent/settings.yaml` (behavior configuration) |
| Sessions | `~/.my-agent/sessions/` |
| User plugins | `~/.my-agent/plugins/` |
| Logs | `~/.my-agent/logs/` |
| Wrapper script | `bin/my-agent` |

## When Implementing

1. Check `/docs/ARCHITECTURE.md` for interface details
2. Check `/docs/ROADMAP.md` for current phase
3. Follow TDD: tests first, then implementation
4. Use Zod for runtime validation
5. Emit events at lifecycle points
6. Keep functions pure where possible

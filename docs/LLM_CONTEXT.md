# LLM Context Document

**Purpose:** Concise context for LLM agents working on this codebase.

## Project Summary

**Name:** Custom Agent Execution Loop
**Language:** TypeScript (strict, ESM)
**Runtime:** Node.js ≥18.0.0
**Status:** Stage 4 complete (Plugin System + Default Plugins), Stage 5 next (Persistence)

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
| Providers | Anthropic + OpenAI |
| Plugins | Manifest-based (plugin.json) |
| Sessions | JSONL files |
| Config | YAML + Zod validation |
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
```

## Code Standards

- **Naming:** lowerCamelCase (vars/funcs), UpperCamelCase (classes/interfaces)
- **Types:** Prefer interfaces, avoid `any`
- **Exports:** No default exports
- **Comments:** JSDoc for all exports
- **Immutability:** Use `readonly` for all message types

## Implementation Priority

1. ✅ Types → 2. ✅ Config → 3. ✅ Logger → 4. ✅ Providers → 5. ✅ Agent Loop → 6. ✅ Plugin Manager → 7. ✅ Tool Executor → 8. ✅ Default Plugins → 9. Sessions → 10. CLI

## Default Plugins ✅

| Plugin | Tools | Status |
|--------|-------|--------|
| file-ops | read_file, write_file, list_directory | ✅ Complete |
| shell | shell_exec | ✅ Complete (linux/darwin) |
| web-search | web_search, fetch_url | ✅ Complete (MVP) |

## Error Handling

- Provider errors: Retry 3x with exponential backoff
- Tool errors: Return to model as tool result
- Config errors: Abort startup with clear message
- Session errors: Create backup, start fresh

## Testing

- Framework: Vitest
- Coverage target: ≥80%
- Approach: TDD (write tests first)

## Quick Reference

```bash
# Run agent
my-agent chat                    # Interactive mode
my-agent run "read package.json" # Single turn

# Manage plugins
my-agent plugins list
my-agent plugins info file-ops

# Manage sessions
my-agent session list
my-agent session clear
```

## File Locations

| Item | Path |
|------|------|
| Config | `~/.my-agent/config.yaml` |
| Sessions | `~/.my-agent/sessions/` |
| User plugins | `~/.my-agent/plugins/` |
| Logs | `~/.my-agent/logs/` |

## When Implementing

1. Check `/docs/ARCHITECTURE.md` for interface details
2. Check `/docs/ROADMAP.md` for current phase
3. Follow TDD: tests first, then implementation
4. Use Zod for runtime validation
5. Emit events at lifecycle points
6. Keep functions pure where possible

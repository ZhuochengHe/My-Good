# Custom Agent Execution Loop

An extensible agent framework for executing complex tasks through intelligent reasoning and tool calling.

## Overview

A CLI-based AI agent that:
- Processes user input through LLM providers (Claude, GPT)
- Executes tools via a manifest-based plugin system
- Maintains conversation history with JSONL sessions
- Supports streaming responses

## Status

**Phase:** Implementation (Post-Design)
**Current Stage:** Stage 4 Complete (Plugin System + Default Plugins)

All architecture decisions finalized. Core agent execution loop, multi-provider support, and plugin system fully implemented with three default plugins (file-ops, shell, web-search). See `/docs/ARCHITECTURE.md`.

## Quick Start

```bash
# Install dependencies
npm install

# Configure (create config file)
my-agent config init

# Start interactive chat
my-agent chat

# Single-turn execution
my-agent run "Read the file package.json"
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Core interfaces, data flow, design decisions |
| [Roadmap](docs/ROADMAP.md) | Phased implementation plan |
| [LLM Context](docs/LLM_CONTEXT.md) | Quick reference for LLM agents |
| [TODO](docs/TODO.md) | Current task tracking |
| [Dev Log](docs/DEV_LOG.md) | Daily development progress |

## Project Structure

```
src/
├── types/           # TypeScript interfaces
├── agent/           # Execution loop
├── providers/       # LLM API clients
├── plugins/         # Plugin system
├── session/         # Session storage
├── config/          # Configuration
├── events/          # Event system
├── cli/             # CLI commands
└── utils/           # Utilities

plugins/             # Default plugins (implemented)
├── file-ops/        # File operations (read, write, list)
├── shell/           # Command execution (linux/darwin)
└── web-search/      # Web search and URL fetching

docs/                # Documentation
├── ARCHITECTURE.md
├── ROADMAP.md
├── LLM_CONTEXT.md
├── TODO.md
├── DEV_LOG.md
└── reference/       # Reference materials
```

## Key Features

- **Custom Agent Loop** - Full control over execution flow
- **Multi-Provider** - Anthropic Claude + OpenAI GPT
- **Plugin System** - Manifest-based, extensible tools
- **Default Plugins** - file-ops, shell, web-search included
- **JSONL Sessions** - Human-readable, append-only storage (coming soon)
- **Event-Driven** - Hooks for logging, UI, extensions

## Default Plugins

Three plugins are included out of the box:

### file-ops
- `read_file` - Read file contents
- `write_file` - Write content to files (creates directories as needed)
- `list_directory` - List directory contents (supports recursive mode)

### shell
- `shell_exec` - Execute shell commands (linux/darwin only)
- Returns stdout, stderr, and exit code

### web-search
- `web_search` - Search stub (returns config message for MVP)
- `fetch_url` - Fetch URLs and convert to html/text/markdown

## Configuration

Located at `~/.my-agent/config.yaml`:

```yaml
agent:
  model: claude-sonnet-4-20250514
  provider: anthropic
  maxTurns: 20

providers:
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
  openai:
    apiKey: ${OPENAI_API_KEY}

plugins:
  directories: [~/.my-agent/plugins, ./plugins]
  enabled: ['*']
```

## Development

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Build
npm run build

# Lint
npm run lint
```

## Code Standards

- **Language:** TypeScript (strict, ESM)
- **Style:** Google TypeScript Style Guide
- **Testing:** Vitest, TDD, ≥80% coverage

See `.claude/CLAUDE.md` for full development guidelines.

## Session Summaries

After each work session, a personalized summary is automatically generated and stored in `docs/sessions/`. These capture:
- Design ideas explored
- What was built
- Attempts and decisions
- Next steps

See `docs/sessions/` to review project evolution and design rationale.

**Guide:** `.claude/hooks/SESSION_SUMMARY_GUIDE.md`

## License

[To be determined]

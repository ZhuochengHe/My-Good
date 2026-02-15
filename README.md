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

**Current Stage:** Stage 5.2 Complete (Session Lifecycle - SessionManager with AI Features)

All architecture decisions finalized. Core agent execution loop, multi-provider support, plugin system, JSONL session persistence with security hardening, and full session lifecycle management fully implemented. SessionManager provides session creation, resumption, auto-save, AI-generated descriptions/tags, and searchable session history. Three default plugins (file-ops, shell, web-search) included. See `/docs/ARCHITECTURE.md`.


## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run interactive setup (configure provider and API key)
./bin/my-agent setup

# Start interactive chat
./bin/my-agent chat

# Or use the npm package bin (after npm link or global install)
my-agent chat
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
- **Multi-Provider** - Anthropic Claude, OpenAI GPT, Kimi (Moonshot AI) - extensible via registry
- **Extensible Provider System** - Add new providers without code changes via providers.json
- **Plugin System** - Manifest-based, extensible tools
- **Default Plugins** - file-ops, shell, web-search included
- **JSONL Sessions** - Human-readable, append-only storage with security hardening
- **Session Lifecycle** - Create, resume, auto-save, AI descriptions/tags, searchable history
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

## Session Management

SessionManager provides full lifecycle management for conversation sessions:

```typescript
import { SessionManager } from './session/SessionManager.js';
import { Agent } from './agent/Agent.js';
import { JsonlSessionStore } from './session/JsonlSessionStore.js';
import { AnthropicProvider } from './providers/anthropic/AnthropicProvider.js';

// Initialize
const store = new JsonlSessionStore('~/.my-agent/sessions');
const provider = new AnthropicProvider({ apiKey: 'your-key' });
const agent = new Agent(provider, { /* config */ });
const sessionManager = new SessionManager(agent, store);

// Create new session
const session = await sessionManager.createSession({
  title: 'Debug API Issue',
  initialMessage: 'Help me debug the authentication error'
});
console.log(`Session created: ${session.id}`);

// Resume existing session
const resumed = await sessionManager.resumeSession(session.id);
const result = await resumed.sendMessage('Check the logs in /var/log/app.log');

// Session auto-saves after each turn
// AI generates description (first 3 turns) and tags (first 5 turns)

// Search sessions
const found = await sessionManager.searchSessions({
  tags: ['api', 'debugging'],
  description: 'authentication'
});

// Rename session
await sessionManager.rename(session.id, 'Fixed Auth Issue');

// Manage tags
await sessionManager.addTags(session.id, ['resolved', 'production']);
await sessionManager.removeTags(session.id, ['debugging']);

// View session metadata
const metadata = await store.load(session.id);
console.log(metadata?.description); // AI-generated description
console.log(metadata?.tags);        // AI-generated + manual tags
console.log(metadata?.usage);       // Token/turn/tool usage
```

## CLI Commands

The agent provides an intuitive command-line interface:

### Setup
```bash
# Interactive setup - configure provider, API key, and model
./bin/my-agent setup
# - Select provider (Anthropic, Kimi, OpenAI)
# - Enter API key (input is hidden with ***)
# - API key is validated by fetching available models
# - Select from dynamically fetched models
```

### Chat
```bash
# Interactive chat session
./bin/my-agent chat

# Single message
./bin/my-agent chat -m "What is 2+2?"

# Resume existing session
./bin/my-agent chat -s <session-id>
```

### Settings Management
```bash
# View all settings
./bin/my-agent settings show

# Get specific setting
./bin/my-agent settings get model.temperature

# Update setting
./bin/my-agent settings set model.temperature 0.8
./bin/my-agent settings set behavior.maxTurns 30

# Reset to defaults
./bin/my-agent settings reset
```

### Model Management
```bash
# Update available models from provider APIs
./bin/my-agent model update
```

### Session Management
```bash
# List all sessions
./bin/my-agent session list

# Filter sessions
./bin/my-agent session list -t debugging
./bin/my-agent session list -q "API error"

# View session details
./bin/my-agent session show <session-id>

# Delete session
./bin/my-agent session delete <session-id>
```

### Plugin Management
```bash
# List loaded plugins
./bin/my-agent plugin list

# View plugin details
./bin/my-agent plugin info file-ops
```

### Configuration
```bash
# View current configuration
./bin/my-agent config show

# Initialize default config
./bin/my-agent config init
```

## Configuration Files

### `~/.my-agent/config.yaml` - Credentials and Model Selection
```yaml
agent:
  id: default
  name: My Agent
  model: moonshot-v1-32k      # Selected during setup
  provider: kimi              # Selected during setup

providers:
  kimi:
    apiKey: sk-xxx...         # Entered during setup
    baseUrl: https://api.moonshot.ai/v1  # Auto-configured

plugins:
  directories: [./plugins]
  enabled: []
  disabled: []

session:
  storePath: ./.sessions
  maxMessages: 100
  idleTimeoutMinutes: 30

logging:
  level: info
  format: pretty
```

### `~/.my-agent/settings.yaml` - Behavior Settings
```yaml
model:
  temperature: 0.7
  topP: 1
  maxTokens: 4096

behavior:
  responseStyle: balanced     # concise | detailed | balanced
  enableToolUse: true
  enableStreaming: true
  maxTurns: 25
  systemPrompt: "You are a helpful AI assistant."

tools:
  allow: []                   # Whitelist specific tools
  deny: []                    # Blacklist specific tools
  requireApproval: []         # Require approval for specific tools
```

## Provider Registry System

The agent uses a dynamic provider registry system (`providers.json`) that enables adding new LLM providers without code changes:

### Key Features

**Dynamic Model Fetching:**
- Models are fetched directly from provider APIs during setup (not hardcoded)
- For OpenAI-compatible APIs: Uses `client.models.list()` to get available models
- For Anthropic: Uses registry models (no API listing available)
- Users only see models they actually have access to

**SDK-Based Architecture:**
- Two SDK types: `anthropic` and `openai`
- Multiple providers can share the same SDK (e.g., Kimi uses OpenAI SDK)
- New providers are added by updating `providers.json` with SDK type and baseUrl

**Supported Providers:**
- `anthropic` - Claude models (Sonnet 4, 3.5 Sonnet, Opus, Haiku)
- `kimi` - Moonshot AI models (dynamically fetched from API)
- `openai` - GPT models (dynamically fetched from API)

### Adding a New Provider

To add a new OpenAI-compatible provider, simply update `providers.json`:

```json
{
  "providers": {
    "your-provider": {
      "id": "your-provider",
      "name": "Your Provider",
      "sdk": "openai",
      "baseUrl": "https://api.yourprovider.com/v1",
      "models": [],
      "healthCheckModel": "default-model",
      "envVars": ["YOUR_PROVIDER_API_KEY"]
    }
  }
}
```

No code changes needed! The CLI will automatically:
- Show the provider in setup
- Fetch available models from the API
- Create the correct provider instance based on SDK type

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

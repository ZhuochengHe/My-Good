# Moltbot Project Structure Analysis

**Reference:** https://github.com/moltbot/moltbot

**Last Updated:** 2026-01-27

---

## Directory Organization

```
moltbot/
├── src/                    # Core TypeScript implementation
│   ├── gateway/           # WebSocket control plane (central orchestrator)
│   ├── agents/            # Agent runtime integration and execution
│   ├── channels/          # Messaging platform integrations (core)
│   ├── plugins/           # Plugin runtime and management
│   ├── config/            # Configuration system with validation
│   ├── cli/               # Command-line interface
│   ├── auto-reply/        # Message processing and formatting
│   ├── routing/           # Session routing and management
│   ├── sessions/          # Session state and persistence
│   ├── infra/             # Infrastructure utilities (events, queuing)
│   └── entry.js           # Main entry point
│
├── apps/                  # Native applications
│   ├── macos/            # macOS app (Swift)
│   ├── ios/              # iOS app
│   └── android/          # Android app
│
├── extensions/            # Plugin-based extensions (31 channels/providers)
│   ├── slack/            # Slack integration plugin
│   ├── discord/          # Discord integration plugin
│   ├── whatsapp/         # WhatsApp integration plugin
│   └── [28+ more]/       # Matrix, Teams, Telegram, etc.
│
├── skills/                # Agent skill modules (55+ skills)
│   ├── github/           # GitHub operations skill
│   ├── coding-agent/     # Code editing and execution
│   ├── browser/          # Web browser automation
│   ├── canvas/           # Visual rendering
│   └── [50+ more]/       # Weather, Spotify, memory, etc.
│
├── packages/              # Workspace packages
│   └── clawdbot/         # Core package (alias for moltbot)
│
├── docs/                  # Comprehensive documentation (Mintlify)
│   ├── gateway/          # Gateway API documentation
│   ├── concepts/         # Core concepts (agent, session, tools)
│   └── tools/            # Tool development guides
│
├── ui/                    # Web UI
├── scripts/               # Build and automation scripts
├── test/                  # Test fixtures and helpers
└── [config files]         # TypeScript, Vitest, Oxlint configs
```

---

## Core Components Deep Dive

### 1. Gateway (`/src/gateway/`)

**Purpose:** Central WebSocket control plane that orchestrates all system components.

**Key Files:**
- `server.ts` - WebSocket server (127.0.0.1:18789)
- `protocol/` - TypeBox schemas for wire protocol
- `server-methods/` - RPC method handlers
  - `agent.ts` - Agent execution entry point
  - `send.ts` - Message delivery
  - `chat.ts` - Chat operations
  - `config.ts` - Configuration management
  - `models.ts` - Model discovery/setup
  - `channels.ts` - Channel management
  - `browser.ts` - Browser automation
  - And 15+ more methods

**Responsibilities:**
- Maintains all messaging provider connections
- Routes inbound messages to agents
- Manages session state and configuration
- Validates all frames against JSON Schema
- Broadcasts lifecycle events to clients

**Protocol:**
- JSON-RPC over WebSocket
- Request/response with correlation IDs
- Event streaming (agent, chat, presence, health, heartbeat, cron)
- Client types: macOS app, CLI, web UI, external nodes

---

### 2. Agent Runtime (`/src/agents/`)

**Purpose:** Integration layer for Pi Agent Runtime execution.

**Key Files:**
- `agent-scope.ts` - Multi-agent configuration resolution
- `bash-tools.ts` - Shell execution tools
- `apply-patch.ts` - File patching capability
- `auth-profiles.ts` - Model authentication management

**Architecture:**
- Uses `@mariozechner/pi-agent-core` (v0.49.3) as execution engine
- Runs Pi Agent in RPC subprocess mode for isolation
- Converts skills to AgentTool definitions
- Manages tool execution lifecycle

**Features:**
- Multi-agent support (multiple agents per installation)
- Model failover and auth profile rotation
- Tool execution with approval gates
- Reasoning and streaming support
- Session serialization (per-session write locks)

---

### 3. Channel System (`/src/channels/` + `/extensions/`)

**Purpose:** Adapter-based plugin system for messaging platform integrations.

**Architecture Pattern:**
```typescript
export interface ChannelPlugin {
  setup: ChannelSetupAdapter;           // Configuration/onboarding
  config: ChannelConfigAdapter;         // Account/state management
  messaging: ChannelMessagingAdapter;   // Send/receive logic
  outbound: ChannelOutboundAdapter;     // Delivery mode (direct/gateway/hybrid)
  group: ChannelGroupAdapter;           // Group message policies
  status: ChannelStatusAdapter;         // Health checks
  security: ChannelSecurityAdapter;     // DM policies, allow/blocklists
  streaming: ChannelStreamingAdapter;   // Real-time capabilities
}
```

**Channel Types:**
- **Core Channels** (in `/src/channels/`): WhatsApp (web), Telegram, Discord, Slack, Signal, iMessage, Google Chat
- **Extension Channels** (in `/extensions/`): BlueBubbles, Matrix, Zalo, Microsoft Teams, Mattermost, Nextcloud Talk, Twitch, and 24+ more

**Plugin Discovery:**
- Each extension has `moltbot.plugin.json` manifest
- Manifest declares channel IDs, config schema, and capabilities

---

### 4. Skills System (`/skills/`)

**Purpose:** Extensible tool capabilities for agents.

**Skill Structure:**
```
/skills/github/
├── SKILL.md              # Skill definition with YAML frontmatter
├── index.ts              # Skill implementation
└── package.json          # Dependencies (if needed)
```

**SKILL.md Format:**
```markdown
---
name: github
label: GitHub Operations
description: Interact with GitHub repositories
user-invocable: true
disable-model-invocation: false
gates:
  requiredBinaries: ["gh"]
  requiredEnv: {"GITHUB_TOKEN": "*"}
---

GitHub skill allows operations on repositories...
```

**Skill Loading Precedence:**
1. Workspace Skills (highest priority)
2. Managed Skills (`~/.clawdbot/skills`)
3. Bundled Skills (built-in, lowest priority)

**Skill Types (55+ total):**
- **Integration Skills**: GitHub, Discord, Slack, Spotify, Weather
- **Automation Skills**: Browser, Canvas, Cron Jobs
- **Development Skills**: Coding Agent, Memory (RAG), File Operations
- **Communication Skills**: Sub-agent spawning, messaging tools

---

### 5. Configuration System (`/src/config/`)

**Purpose:** YAML/JSON5-based configuration with validation.

**Key Files:**
- `types.agents.ts` - Agent configuration schemas
- `types.models.ts` - Model provider setup
- `types.tools.ts` - Tool policies and execution rules
- `types.channels.ts` - All messaging channels
- `types.hooks.ts` - Webhook/automation configuration

**Configuration File Location:**
- macOS/Linux: `~/.config/moltbot/config.json5`
- Windows: `%APPDATA%/moltbot/config.json5`

**Validation:**
- Zod schema validation at runtime
- JSON Schema for plugin validation (non-executing)
- Environment variable substitution (`$VAR` syntax)
- Legacy migration support

**Example Structure:**
```json5
{
  agents: {
    defaults: { workspace: "~/clawd", model: {...}, thinking: {...} },
    list: [{ id: "default", workspace: "~/clawd" }]
  },
  channels: {
    slack: { accounts: [...] },
    discord: { accounts: [...] }
  },
  models: { providers: [...] },
  tools: { allow: [...], deny: [...] },
  plugins: { load: [...] },
  session: { resetHour: 4, idleMinutes: 480 }
}
```

---

### 6. Plugin System (`/src/plugins/` + `/extensions/`)

**Purpose:** Extensibility framework for channels, providers, and skills.

**Plugin Manifest (`moltbot.plugin.json`):**
```json
{
  "id": "slack",
  "kind": "channel",
  "channels": ["slack"],
  "configSchema": { /* JSON Schema */ },
  "skills": ["./skills/slack-ops"],
  "providers": []
}
```

**Plugin Types:**
1. **Channel Plugins** - Add messaging integrations
2. **Provider Auth Plugins** - OAuth/token management for models
3. **Memory Plugins** - Search backends (LanceDB, vector DBs)
4. **Skill Plugins** - Agent capabilities

**Plugin Discovery:**
- Scan `extensions/` directory
- Load `moltbot.plugin.json` manifests
- Validate config schemas
- Register adapters with gateway

---

### 7. Session Management (`/src/sessions/`, `/src/routing/`)

**Purpose:** Stateful conversation tracking and routing.

**Session Key Format:**
- Direct chats: `agent:sessionId`
- Channel-based: `agent:channelId:targetId`

**Session Storage:**
- Location: `~/.clawdbot/agents/<agentId>/sessions/`
- Format: JSONL (one event per line)
- Contents: Full transcript with tool calls and results

**Session Lifecycle:**
- **Creation**: First message to new target
- **Reset Triggers**: Daily (4 AM default), idle timeout, manual reset
- **Compaction**: Automatic when tokens exceed context window
- **Persistence**: Real-time transcript append

**Session Isolation:**
- Each agent has separate session namespace
- Multi-agent sessions don't interfere
- Per-session write locks prevent race conditions

---

### 8. Auto-Reply System (`/src/auto-reply/`)

**Purpose:** Message processing, formatting, and delivery.

**Key Features:**
- Command detection and routing
- Markdown formatting and table conversion
- Message chunking (text/markdown modes)
- Thinking/reasoning verbosity control
- Reply envelope formatting
- Inbound/outbound message debouncing

**Processing Pipeline:**
```
Inbound Message
  ↓
Command Detection (/, @mention)
  ↓
Context Building (history + bootstrap)
  ↓
Agent Execution
  ↓
Response Formatting (markdown → platform-specific)
  ↓
Chunking (if exceeds platform limits)
  ↓
Outbound Delivery
```

---

### 9. Infrastructure (`/src/infra/`)

**Purpose:** Core utilities and event systems.

**Key Components:**
- `outbound/` - Message delivery routing and deduplication
- `agent-events.ts` - Agent run context and lifecycle
- `provider-usage.ts` - Model usage tracking
- `diagnostic-events.ts` - Observability/instrumentation
- `heartbeat-events.ts` - Presence/connection monitoring
- `system-events.ts` - System-level events
- Networking utilities (SSH tunnels, retries, backoff)

---

### 10. CLI System (`/src/cli/`)

**Purpose:** Command-line interface for all operations.

**Entry Point:** `moltbot.mjs` → `/src/entry.js`

**Major Commands:**
```bash
moltbot gateway              # Start WebSocket gateway
moltbot agent                # Run agent CLI
moltbot message send         # Send messages programmatically
moltbot onboard              # Interactive setup wizard
moltbot config               # Configuration management
moltbot channels             # Channel management
moltbot models               # Model management
moltbot plugins              # Plugin management
moltbot skills               # Skill management
moltbot doctor               # Diagnostics
moltbot daemon               # Systemd/launchd management
```

---

## Architecture Patterns

### 1. Adapter Pattern (Channels)
- Interface-based extensibility
- No inheritance; pure composition
- Typed adapters for each capability

### 2. Event-Driven Architecture
- WebSocket broadcasts all events
- Clients subscribe to relevant streams
- Idempotent message handling

### 3. Plugin Discovery & Loading
- Manifest-based registration
- Schema validation before loading
- Lazy loading of plugin code

### 4. Session-Based Serialization
- Per-session write locks
- Global queue for concurrency control
- Prevents race conditions

### 5. RPC Subprocess Isolation
- Pi Agent runs in separate process
- Commands via stdin, events via stdout
- Process isolation for stability

### 6. Configuration Validation
- Zod for runtime validation
- JSON Schema for static analysis
- Environment variable substitution

---

## Data Flow

### Complete Message Flow

```
1. User sends message via WhatsApp
   ↓
2. WhatsApp channel adapter receives message
   ↓
3. Gateway routes to session (creates if new)
   ↓
4. Session manager loads history
   ↓
5. Agent execution triggered:
   - Load skills from workspace/managed/bundled
   - Convert skills to Pi Agent tools
   - Build system prompt (base + skills + bootstrap)
   - Resolve model and auth profile
   ↓
6. Pi Agent (RPC subprocess):
   - Model generates response
   - Calls tools as needed
   - Streams text deltas
   - Streams tool execution events
   ↓
7. Gateway captures events:
   - message_update → WebSocket broadcast
   - tool_execution_start → Log
   - tool_execution_end → Sanitize and format result
   ↓
8. Response processing:
   - Format for WhatsApp (markdown → platform-specific)
   - Chunk if exceeds limits
   - Apply DM/group policies
   ↓
9. Outbound delivery:
   - WhatsApp channel adapter sends message
   - Store in transcript (JSONL)
   - Update session state
   ↓
10. Client receives response via WebSocket
```

---

## Technology Stack

### Core Technologies
- **Language:** TypeScript (ESM modules)
- **Runtime:** Node.js ≥22.12.0
- **Agent Engine:** @mariozechner/pi-agent-core (v0.49.3)
- **Validation:** Zod + TypeBox + JSON Schema
- **Testing:** Vitest with 70% coverage thresholds
- **Linting:** Oxlint + Oxfmt (Rust-based)

### Key Dependencies
- `@mariozechner/pi-agent-core` - Agent runtime
- `@mariozechner/pi-coding-agent` - Coding tools
- `@slack/bolt` - Slack SDK
- `grammy` - Telegram SDK
- `@whiskeysockets/baileys` - WhatsApp
- `discord-api-types` - Discord types
- `hono` - HTTP framework
- `sharp` - Image processing
- `pdfjs-dist` - PDF processing
- `playwright-core` - Browser automation
- `sqlite-vec` - Vector DB for memory
- `zod` - Runtime schema validation

### Native Apps
- **macOS:** Swift with SwiftUI
- **iOS:** Swift
- **Android:** Kotlin

---

## Security Model

### Authentication
- Device-based pairing with token approval
- Local auto-approval for loopback connections
- Optional TLS + certificate pinning for remote access
- OAuth support for social channels

### Authorization
- DM policies (allowlist/blocklist per user)
- Group policies (mention requirements, tool restrictions)
- Tool approval gates for dangerous operations
- Sandbox execution support (Docker, Firejail)

### Secrets Management
- `.env` support for API keys
- Credentials stored in `~/.config/moltbot/credentials/`
- Environment variable substitution in config
- API keys never logged or transmitted

---

## Observability

### Logging
- Configurable log levels (error, warn, info, debug)
- Log transport system for external services
- Verbose mode for debugging
- Session and run ID tracking

### Diagnostics
- `moltbot doctor` - System health check
- Channel status probes
- Model connectivity tests
- Usage tracking (tokens, costs)
- Diagnostic events system with opt-in observability

### Monitoring
- Health check endpoint
- Heartbeat events for presence tracking
- Provider usage metrics
- Session statistics

---

## Development Workflow

### Building
```bash
npm install
npm run build
```

### Testing
```bash
npm test                     # Unit tests
npm run test:e2e            # E2E tests
CLAWDBOT_LIVE_TEST=1 npm test  # Live API tests
```

### Linting
```bash
npm run lint
npm run format
```

### Running
```bash
npm start                    # Development mode
moltbot gateway              # Production gateway
```

---

## Extension Points

### 1. Adding a Channel
1. Create `/extensions/my-channel/`
2. Implement channel adapters (setup, messaging, config, etc.)
3. Add `moltbot.plugin.json` manifest
4. Export plugin in `index.ts`

### 2. Adding a Skill
1. Create `/skills/my-skill/SKILL.md` with frontmatter
2. Implement skill logic in `index.ts`
3. Define tool parameters schema (TypeBox)
4. Add gates if needed (binaries, env vars, OS)

### 3. Adding a Model Provider
1. Define provider in config: `models.providers[]`
2. Implement auth adapter if custom OAuth needed
3. Configure in Pi AI catalog or custom definition

### 4. Adding a Hook
1. Create script in `~/.config/moltbot/hooks/`
2. Configure in `config.json5`: `hooks.gateway[]`
3. Handle events (message_received, agent_end, etc.)

---

## Deployment Options

### Local Development
```bash
moltbot gateway
```

### Daemon Mode (systemd/launchd)
```bash
moltbot daemon install
moltbot daemon start
```

### Docker
```bash
docker build -t moltbot .
docker run -v ~/.config/moltbot:/config moltbot
```

### Remote Access
- Configure TLS + certificate pinning
- Set up port forwarding or ngrok
- Enable device pairing for clients

---

## Summary

Moltbot's architecture is built on several key principles:

1. **Modularity** - Clear separation between gateway, agents, channels, and skills
2. **Extensibility** - Plugin system for channels, skills, and providers
3. **Type Safety** - Full TypeScript with schema validation at boundaries
4. **Process Isolation** - RPC subprocess for agent execution
5. **Event-Driven** - WebSocket broadcasting for real-time updates
6. **Session-Based** - Stateful conversations with proper serialization
7. **Multi-Agent** - Support for multiple agents per installation
8. **Production-Ready** - Comprehensive testing, logging, and diagnostics

The codebase demonstrates professional software engineering practices with clean abstractions, comprehensive error handling, and extensive documentation.

# Project TODO

**Updated:** 2026-01-31

## Completed Decisions

### Programming Language & Framework
- [x] Choose primary programming language: **TypeScript + Node.js**
- [x] Select framework(s): **Custom agent loop** (no external framework)
- [x] Research agentic loop implementations: **Custom chosen over Pi Agent/LangGraph**
- [x] Evaluate against reference: **Moltbot patterns adopted (adapter, events, JSONL)**
- [x] Document final choice: **See docs/ARCHITECTURE.md**

**Final Decision:**
- **Language**: TypeScript (ESM modules, strict type checking)
- **Runtime**: Node.js ≥18.0.0
- **Agent Runtime**: Custom implementation
- **Rationale**: Full control, learning opportunity, simpler for MVP

### Project Structure
- [x] Determine project structure: **Single app for MVP**
- [x] Define directory organization: **See docs/ARCHITECTURE.md**
- [x] Plan for scalability: **Provider/Plugin interfaces allow extension**

### Code Standards & Style Guide
- [x] Coding standards document: **Google TypeScript Style Guide**
- [x] Link standards in Claude.md
- [x] Define naming conventions

**Location:** `docs/reference/typescript_style.md`

### Architecture & Design
- [x] Deep dive into moltbot architecture
- [x] Define model integration: **Provider abstraction pattern**
- [x] Plan agent task execution: **Message → Tool → Response loop**
- [x] Design plugin system: **Manifest-based discovery**
- [x] Stabilize architecture: **See docs/ARCHITECTURE.md**

### Testing Strategy
- [x] Testing framework: **Vitest**
- [x] Coverage target: **≥80%**
- [x] Approach: **TDD (tests first)**

---

## Implementation TODOs

### Stage 1: Foundation ✅ COMPLETE

#### 1.1 Project Setup ✅
- [x] Initialize TypeScript project with tsconfig.json
- [x] Set up package.json with dependencies
- [x] Configure Vitest
- [x] Configure ESLint + Prettier

#### 1.2 Type System ✅
- [x] Define all core interfaces in `/src/types/`
  - [x] Message types (User, Assistant, Tool, System)
  - [x] Tool types (Definition, Call, Result)
  - [x] Plugin types (Manifest, Handler, Context)
  - [x] Provider types (Request, Response, Stream)
  - [x] Event types (AgentEvent union)
  - [x] Agent types (Config, RunOptions, Result)
  - [x] Session types (Session, Store interface)

#### 1.3 Configuration System ✅
- [x] YAML config loader with file reading
- [x] Zod validation schemas for all config sections
- [x] Environment variable substitution (${VAR} syntax with defaults)
- [x] Default config generation
- [x] Config validation on startup
- [x] Tests written first (TDD) - 42 tests, 100% coverage

#### 1.4 Logging ✅
- [x] Structured logger utility
- [x] Log levels (error, warn, info, debug)
- [x] JSON and pretty formats with colors
- [x] File output support with async writes
- [x] Child loggers with context inheritance
- [x] Tests written first (TDD) - 54 tests, 99% coverage

### Stage 2: Multi-Provider Support (Current)

#### 2.1 Provider Interface ✅
- [x] Base provider implementation with retry logic
- [x] Provider manager for routing between models
- [x] Exponential backoff for rate limits
- [x] Error handling and recovery
- [x] Tests written first (TDD) - 70 tests, 90.77% coverage
  - Error hierarchy with custom error types
  - Retry logic with exponential backoff and jitter
  - Base provider with timeout and retry wrappers
  - Provider manager with lazy initialization

#### 2.2 Anthropic Provider ✅
- [x] API client implementation using @anthropic-ai/sdk
- [x] Message format conversion to Claude format
- [x] Tool call format handling
- [x] Streaming support
- [x] Tests written first (TDD) - 32 tests, 98.99% coverage
  - Message format conversion (user/assistant/tool)
  - Tool definition mapping to Anthropic format
  - Tool call extraction from responses
  - Streaming with text deltas and tool calls
  - Model listing (Claude 3.5 Sonnet, Opus, Haiku)
  - Health check with minimal request

#### 2.3 OpenAI Provider ✅
- [x] API client implementation using openai SDK
- [x] Message format conversion to OpenAI format
- [x] Tool call format handling
- [x] Streaming support
- [x] Tests written first (TDD) - 36 tests, 99.26% coverage
  - Message format conversion (user/assistant/system/tool)
  - Tool definition mapping to OpenAI function format
  - Tool call handling with tool_call_id
  - Streaming with text deltas and tool calls
  - Model listing (GPT-4, GPT-4 Turbo, GPT-3.5 Turbo)
  - Health check with minimal request

### Stage 3: Plugins
- [ ] Implement plugin manager
- [ ] Implement tool executor
- [ ] Create file-ops plugin
- [ ] Create shell plugin
- [ ] Create web-search plugin

### Stage 4: Persistence
- [ ] Implement JSONL session store
- [ ] Session load/save/append
- [ ] Session listing and management

### Stage 5: CLI
- [ ] Set up Commander.js
- [ ] Implement `chat` command
- [ ] Implement `run` command
- [ ] Implement `plugins` commands
- [ ] Implement `config` commands
- [ ] Implement `session` commands

### Stage 6: Polish
- [ ] Comprehensive error handling
- [ ] Streaming support
- [ ] Unit tests (≥80% coverage)
- [ ] Integration tests
- [ ] README and quickstart guide

---

## Open Questions

None currently. All major decisions made.

---

## Reference Documents

- Architecture: `docs/ARCHITECTURE.md`
- Roadmap: `docs/ROADMAP.md`
- LLM Context: `docs/LLM_CONTEXT.md`
- Dev Log: `docs/DEV_LOG.md`
- Moltbot Analysis: `docs/reference/Moltbot_Project_Structure.md`
- Original Roadmap: `docs/reference/MVP_and_Roadmap.md`
- Style Guide: `docs/reference/typescript_style.md`

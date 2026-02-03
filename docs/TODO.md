# Project TODO

**Updated:** 2026-02-03

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

### Stage 2: Multi-Provider Support ✅ COMPLETE

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

### Stage 3: Agentic Reasoning ✅ COMPLETE

#### 3.1 Event System ✅
- [x] Custom error classes for agent errors
- [x] Event emitter implementation with type-safe callbacks
- [x] Event subscriber interface
- [x] Logging subscriber with configurable levels
- [x] Event emission at all lifecycle points
- [x] Tests written first (TDD) - 30 tests, 100% coverage
  - Event emitter with typed callbacks
  - Logging subscriber with various log levels
  - Error handling and edge cases

#### 3.2 Context Building ✅
- [x] Token counter implementation with character approximation
- [x] Context builder for request construction
- [x] Token estimation across messages, tools, and system prompts
- [x] Message history truncation with token limits
- [x] Tool call/result pair preservation
- [x] Tests written first (TDD) - 50 tests, 90.74% coverage
  - Token counting for text, messages, and tool definitions
  - Request building with proper optional field handling
  - Token estimation with breakdown
  - History truncation with preservation of tool pairs
  - Edge case handling for long content and empty inputs

#### 3.3 Execution Loop ✅
- [x] Message → Provider → Response cycle
- [x] Tool call detection and extraction
- [x] Tool execution orchestration (stub implementation)
- [x] Turn counting and limits
- [x] Stop condition handling
- [x] Integration tests with mock provider and tools
- [x] Tests written first (TDD) - 49 tests, 92.43% coverage
  - Agent initialization and configuration
  - Single turn execution without tools
  - Multi-turn execution with tool calls
  - Turn limit enforcement
  - Error handling and recovery
  - Event emission throughout execution

### Stage 4: Extensibility

#### 4.1 Plugin Manager ✅
- [x] Directory scanning
- [x] Manifest loading and validation
- [x] Plugin gates checking
- [x] Plugin enable/disable
- [x] Tests written first (TDD) - 129 tests, 94.81% coverage
  - Plugin error classes (validation, initialization, execution)
  - Manifest validation with Zod schema
  - Gates checker (platform, binaries, env variables)
  - Plugin manager core with enable/disable
  - Directory scanning with recursive search
  - Integration tests with real plugin loading

#### 4.2 Tool Executor ✅
- [x] Parameter validation (JSON Schema)
- [x] Handler invocation
- [x] Timeout handling
- [x] Error wrapping
- [x] Tests written first (TDD) - 34 tests, 92.89% coverage
  - JSON Schema validation with Ajv
  - Handler invocation with plugin context
  - Timeout handling with configurable duration
  - Error wrapping (4 error types)
  - Integration with Agent execution loop
  - Tool not found and validation error handling

#### 4.3 Default Plugins
- [ ] **file-ops**: read_file, write_file, list_directory
- [ ] **shell**: exec_command
- [ ] **web-search**: search, fetch_url

### Stage 5: Persistence
- [ ] Implement JSONL session store
- [ ] Session load/save/append
- [ ] Session listing and management

### Stage 6: CLI
- [ ] Set up Commander.js
- [ ] Implement `chat` command
- [ ] Implement `run` command
- [ ] Implement `plugins` commands
- [ ] Implement `config` commands
- [ ] Implement `session` commands

### Stage 7: Polish
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

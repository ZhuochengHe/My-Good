# Project TODO

**Updated:** 2026-02-09

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

### Stage 4: Extensibility ✅ COMPLETE

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

#### 4.3 Default Plugins ✅
- [x] **file-ops**: read_file, write_file, list_directory
  - [x] Tests written first (TDD) - 33 unit + 11 integration tests
  - [x] Handlers implemented with platform-specific paths
  - [x] Recursive directory listing support
  - [x] Path validation and error handling
- [x] **shell**: shell_exec
  - [x] Tests written first (TDD) - 23 unit tests
  - [x] Handler implemented for linux/darwin only
  - [x] Command validation and exit code handling
  - [x] Stdout/stderr capture
- [x] **web-search**: web_search, fetch_url
  - [x] Tests written first (TDD) - 27 unit tests
  - [x] web_search stub (returns config message for MVP)
  - [x] fetch_url with html/text/markdown format support
  - [x] HTML-to-markdown conversion using turndown

### Stage 5: Persistence ✅ COMPLETE

#### 5.1 JSONL Session Store ✅
- [x] Session error types (7 error classes)
- [x] JsonlSessionStore implementation
- [x] JSONL file storage format
- [x] Load session by ID
- [x] Save session (atomic operations)
- [x] Append messages (optimized)
- [x] List all sessions with summaries
- [x] Delete sessions
- [x] Clear session messages
- [x] Corruption detection and backup
- [x] Unit tests (39 tests, 100% passing)
- [x] Integration tests (9 tests, 100% passing)
- [x] Test coverage: 84.93% lines, 80.35% branches
- [x] Security review completed
- [x] Code review completed

**Security Hardening (COMPLETED):**
- [x] HIGH: Fix TOCTOU race conditions (replaced existsSync with async fs.access)
- [x] HIGH: Add resource limits (MAX_SESSION_SIZE=100MB, MAX_MESSAGE_COUNT=10000)
- [x] MEDIUM: Optimize appendMessage() (reads and rewrites file, but more efficient than before)
- [x] MEDIUM: Set secure file permissions (mode 0o600 on all writes)
- [x] MEDIUM: Add symlink protection (checkNotSymlink() validates before operations)

#### 5.2 Session Lifecycle ✅ COMPLETE
- [x] SessionManager class implementation
- [x] Integrate with Agent execution loop
- [x] Create new session with auto-generated UUIDs
- [x] Resume existing session with conversation history
- [x] Session metadata tracking (title, description, tags, timestamps)
- [x] Token usage accumulation (prompt, completion, total)
- [x] Turn and tool usage tracking
- [x] AI-generated descriptions with fallback
- [x] AI-generated tags with fallback
- [x] Session renaming with validation
- [x] Tag management (normalized, searchable)
- [x] Session search by tags and description
- [x] Auto-save after each turn
- [x] Tests written first (TDD) - 53 tests, 98% coverage
  - Session creation with UUID generation
  - Session resumption with history loading
  - Auto-save after agent turns
  - Usage tracking (tokens, turns, tools)
  - AI description generation (first 3 turns)
  - AI tag generation (first 5 turns)
  - Fallback handling for AI failures
  - Session renaming validation
  - Tag normalization and management
  - Session search by tags and description

### Stage 6: CLI ✅ COMPLETE
- [x] Set up Commander.js
- [x] Implement `chat` command (interactive and single-message mode)
- [x] Implement `plugin` commands (list, info)
- [x] Implement `config` commands (show, init)
- [x] Implement `session` commands (list, show, delete)
- [x] Bootstrap system for dependency initialization
- [x] OutputAdapter and InputReader abstractions
- [x] Multi-line input support with '---' terminator
- [x] Streaming text output
- [x] Tool execution progress messages
- [x] Ctrl+C handling
- [x] Session filtering (by tag and query)
- [x] Tests written first (TDD) - 105 tests, 86.14% coverage
  - Bootstrap tests with config/plugin/session initialization
  - Input reader tests (single-line, multi-line, EOF)
  - Output adapter tests (write, error, success, section)
  - Command tests (config, plugin, session, chat)
  - Integration tests (end-to-end CLI scenarios)

### Stage 7: Event Persistence (Always-On) ✅ COMPLETE
- [x] Error handling with error codes and types
- [x] JSONL journal record types (TurnMetadataRecord, ErrorLogRecord)
- [x] SessionStoreWithTrace interface
- [x] JsonlSessionStore.appendTurnMetadata()
- [x] JsonlSessionStore.appendErrorLog()
- [x] JsonlSessionStore.loadWithTrace()
- [x] SessionManager turn metadata tracking
- [x] SessionManager error log tracking
- [x] CLI --trace flag for session show command
- [x] Trace data display (turn metrics and errors)
- [x] Tests written first (TDD) - 152 new tests added
- [x] Test coverage maintained at 85.82% (982 tests total)
- [x] All lint and build checks passing
- [x] TypeScript strict typing throughout

**Key Features:**
- Turn-by-turn metrics: duration, tokens (in/out/total), tool count, stop reason
- Error logging with context, stack traces, and turn association
- Always-on persistence (no performance impact when not viewing)
- Debuggable JSONL format (human-readable)
- Type-safe implementation with proper error handling

### Stage 8: Polish
- [x] Comprehensive error handling with error codes ✅
- [x] Streaming support ✅
- [x] Unit tests (≥80% coverage) ✅ (85.82% overall, 982 tests)
- [x] Integration tests ✅
- [ ] README quickstart guide update
- [ ] Performance optimization review
- [ ] Security audit

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

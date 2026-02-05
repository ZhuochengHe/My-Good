# Project Roadmap

**Project:** Custom Agent Execution Loop | **Updated:** 2026-02-04

## Vision

Build an AI assistant framework for normal people (not just programmers/engineers). Users should:
- Get powerful capabilities without facing raw code/configuration
- Ask task-based requests ("Fix the failing test") instead of granting tool permissions
- Trust that errors are mostly undoable without being responsible for architecture
- Benefit from model improvements without code changes

This project learns from Claude Code but prioritizes **simplicity over power-user flexibility**.

## MVP Definition

Build functional agent that executes tool-based tasks with extensible plugins.

### Success Criteria
- [ ] Agent executes 10+ consecutive turns with tool calling
- [x] 3+ default plugins working (file-ops, shell, web-search) ✅
- [x] Users can install and use custom plugins ✅
- [ ] Session history persists across restarts
- [x] Works with both Claude and ChatGPT ✅
- [ ] CLI is responsive and user-friendly

## Stage 1: Core Foundation (MVP) ✅ COMPLETE

### 1.1 Project Setup ✅
- [x] Choose TypeScript + Node.js
- [x] Design architecture
- [x] Initialize project structure
- [x] Configure TypeScript (strict, ESM)
- [x] Set up Vitest for testing
- [x] Configure ESLint/Prettier

### 1.2 Type System ✅
- [x] Define all core interfaces in `/src/types/`
- [x] Message types (User, Assistant, Tool, System)
- [x] Tool types (Definition, Call, Result)
- [x] Plugin types (Manifest, Handler, Context)
- [x] Provider types (Request, Response, Stream)
- [x] Event types (AgentEvent union)

### 1.3 Configuration System ✅
- [x] YAML config loader
- [x] Zod validation schemas
- [x] Environment variable substitution
- [x] Default config generation
- [x] Config validation on startup
- [x] Test coverage: 100% statements, 97% branches

### 1.4 Logging ✅
- [x] Structured logger utility
- [x] Log levels (error, warn, info, debug)
- [x] JSON and pretty formats
- [x] File output support
- [x] Test coverage: 99% statements, 93% branches

## Stage 2: Multi-Provider Support ✅ COMPLETE

### 2.1 Provider Interface ✅
- [x] Base provider implementation
- [x] Provider manager for routing
- [x] Retry logic with backoff
- [x] Error handling

### 2.2 Anthropic Provider ✅
- [x] API client implementation
- [x] Message format conversion
- [x] Tool call format handling
- [x] Streaming support

### 2.3 OpenAI Provider ✅
- [x] API client implementation
- [x] Message format conversion
- [x] Tool call format handling
- [x] Streaming support

## Stage 3: Agentic Reasoning ✅ COMPLETE

### 3.1 Event System ✅
- [x] Custom error classes for agent errors
- [x] Event emitter implementation
- [x] Event subscriber interface
- [x] Logging subscriber
- [x] Event emission at all lifecycle points

### 3.2 Context Building ✅
- [x] Token counter with character approximation
- [x] System prompt injection
- [x] Conversation history formatting
- [x] Tool definitions injection
- [x] Token counting and estimation
- [x] Message history truncation with token limits

### 3.3 Execution Loop ✅
- [x] Message → Provider → Response cycle
- [x] Tool call detection and extraction
- [x] Tool execution orchestration
- [x] Turn counting and limits
- [x] Stop condition handling
- [x] Integration tests with mock provider

## Stage 4: Extensibility ✅ COMPLETE

### 4.1 Plugin Manager ✅
- [x] Directory scanning
- [x] Manifest loading and validation
- [x] Plugin gates checking
- [x] Plugin enable/disable

### 4.2 Tool Executor ✅
- [x] Parameter validation (JSON Schema)
- [x] Handler invocation
- [x] Timeout handling
- [x] Error wrapping

### 4.3 Default Plugins ✅
- [x] **file-ops**: read_file, write_file, list_directory
- [x] **shell**: shell_exec
- [x] **web-search**: web_search, fetch_url

## Stage 5: Persistence & Debugging

### 5.1 Session Store ✅ COMPLETE
- [x] JSONL file storage
- [x] Load session by ID
- [x] Append messages (optimized)
- [x] List sessions
- [x] Delete/clear sessions
- [x] Corruption detection and backup
- [x] Atomic file operations
- [x] Comprehensive error handling
- [x] Test coverage: 84.93% (48 tests)

**Implementation Details:**
- 7 session error types for detailed error handling
- Streaming JSONL reads for memory efficiency
- Temp file + rename pattern for atomic saves
- Session ID validation prevents path traversal
- Automatic backup on corruption detection

**Security Hardening (COMPLETED):**
- [x] Fix TOCTOU race conditions (replaced existsSync with async checks)
- [x] Add resource exhaustion limits (MAX_SESSION_SIZE, MAX_MESSAGE_COUNT)
- [x] Secure file permissions (0o600 on all writes)
- [x] Symlink attack protection (validates files before operations)

### 5.2 Session Lifecycle
- [ ] Create new session
- [ ] Resume existing session
- [ ] Session metadata tracking
- [ ] Token usage accumulation

## Stage 6: User Interface

### 6.1 CLI Framework
- [ ] Command structure (Commander.js)
- [ ] Help documentation
- [ ] Error output formatting

### 6.2 Commands
- [ ] `chat` - Interactive conversation
- [ ] `run "message"` - Single-turn execution
- [ ] `plugins list` - Show available plugins
- [ ] `plugins info <name>` - Plugin details
- [ ] `config show` - Display config
- [ ] `config init` - Generate default config
- [ ] `session list` - List sessions
- [ ] `session clear` - Clear session history

### 6.3 Interactive Features
- [ ] Streaming text output
- [ ] Tool execution progress
- [ ] Ctrl+C handling
- [ ] History navigation

## Stage 7: Quality & Documentation

### 7.1 Error Handling
- [ ] Comprehensive error types
- [ ] User-friendly error messages
- [ ] Recovery suggestions

### 7.2 Testing
- [ ] Unit tests for core modules
- [ ] Integration tests for agent loop
- [ ] Mock providers for testing

### 7.3 Documentation
- [ ] README with quickstart
- [ ] Plugin development guide
- [ ] Configuration reference

---

## Future Stages (Post-MVP)

### Stage 8: Task-Based Abstraction
**Goal:** Move from tool-based to task-based permission model for non-technical users.

- [ ] Define task types (fix-bug, refactor, add-feature, debug, etc.)
- [ ] Create permission matrices per task type
- [ ] Build task-scoped execution context
- [ ] Agent learns to stay within task bounds
- [ ] User-friendly task request prompts

**Depends on:** Model improvements + user feedback on common patterns

### Stage 9: Nearly-Reversible Operations
**Goal:** Make failures low-cost and recoverable without requiring user infrastructure knowledge.

- [ ] Classify tools by reversibility tier (full, near, none)
- [ ] Build operation journal (track everything done)
- [ ] Implement reversal strategies per tool
- [ ] Expose undo/rollback to users
- [ ] Handle irreversible operations with explicit confirmation

**Depends on:** Early user data on what breaks + git/transaction infrastructure

### Stage 10: Production Readiness
- [ ] Sandbox execution for shell/code
- [ ] Rate limiting
- [ ] Hot-reload configuration
- [ ] Daemon mode (systemd/launchd)

### Stage 11: Ecosystem & Scale
- [ ] HTTP API server
- [ ] Web UI for non-technical users
- [ ] VS Code extension
- [ ] Plugin marketplace

---

## Implementation Order (TDD)

For each component, follow TDD:
1. Define interface in `/src/types/`
2. Write failing tests
3. Implement minimal code to pass
4. Refactor
5. Verify coverage ≥80%

**Recommended sequence:**
```
types → config → logger → providers → agent-loop → plugins → session → cli
```

---

## Focus: MVP First

For Stages 1-7 (MVP), keep these principles:

**Do:**
- Build the execution loop that works reliably
- Make tool-based permission model work end-to-end
- Ensure JSONL sessions are debuggable and append-only
- Write tests for core paths (target ≥80% coverage)
- Document how plugins work

**Don't (yet):**
- Build task-based abstraction (Stage 8) — too early without user data
- Implement reversal/undo systems (Stage 9) — wait for operational patterns to emerge
- Optimize for safety beyond basic logging — reversibility will emerge from real usage
- Build UI for non-technical users (Stage 11) — first verify experts can use it
- Add features that only make sense with user permissions — keep it simple now

**Why:** You'll learn what matters once people actually use it. Build the foundation solid first.

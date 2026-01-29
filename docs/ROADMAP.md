# Project Roadmap

**Project:** Custom Agent Execution Loop | **Updated:** 2026-01-28

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
- [ ] 3+ default plugins working (file-ops, shell, web-search)
- [ ] Users can install and use custom plugins
- [ ] Session history persists across restarts
- [ ] Works with both Claude and ChatGPT
- [ ] CLI is responsive and user-friendly

## Stage 1: Core Foundation (MVP)

### 1.1 Project Setup
- [x] Choose TypeScript + Node.js
- [x] Design architecture
- [ ] Initialize project structure
- [ ] Configure TypeScript (strict, ESM)
- [ ] Set up Vitest for testing
- [ ] Configure ESLint/Prettier

### 1.2 Type System
- [ ] Define all core interfaces in `/src/types/`
- [ ] Message types (User, Assistant, Tool, System)
- [ ] Tool types (Definition, Call, Result)
- [ ] Plugin types (Manifest, Handler, Context)
- [ ] Provider types (Request, Response, Stream)
- [ ] Event types (AgentEvent union)

### 1.3 Configuration System
- [ ] YAML config loader
- [ ] Zod validation schemas
- [ ] Environment variable substitution
- [ ] Default config generation
- [ ] Config validation on startup

### 1.4 Logging
- [ ] Structured logger utility
- [ ] Log levels (error, warn, info, debug)
- [ ] JSON and pretty formats
- [ ] File output support

## Stage 2: Multi-Provider Support

### 2.1 Provider Interface
- [ ] Base provider implementation
- [ ] Provider manager for routing
- [ ] Retry logic with backoff
- [ ] Error handling

### 2.2 Anthropic Provider
- [ ] API client implementation
- [ ] Message format conversion
- [ ] Tool call format handling
- [ ] Streaming support

### 2.3 OpenAI Provider
- [ ] API client implementation
- [ ] Message format conversion
- [ ] Tool call format handling
- [ ] Streaming support

## Stage 3: Agentic Reasoning

### 3.1 Execution Loop
- [ ] Message → Provider → Response cycle
- [ ] Tool call detection
- [ ] Tool execution orchestration
- [ ] Turn counting and limits
- [ ] Stop condition handling

### 3.2 Context Building
- [ ] System prompt injection
- [ ] Conversation history formatting
- [ ] Tool definitions injection
- [ ] Token counting (basic)

### 3.3 Event System
- [ ] Event emitter implementation
- [ ] Event subscriber interface
- [ ] Logging subscriber
- [ ] Event emission at all lifecycle points

## Stage 4: Extensibility

### 4.1 Plugin Manager
- [ ] Directory scanning
- [ ] Manifest loading and validation
- [ ] Plugin gates checking
- [ ] Plugin enable/disable

### 4.2 Tool Executor
- [ ] Parameter validation (JSON Schema)
- [ ] Handler invocation
- [ ] Timeout handling
- [ ] Error wrapping

### 4.3 Default Plugins
- [ ] **file-ops**: read_file, write_file, list_directory
- [ ] **shell**: exec_command
- [ ] **web-search**: search, fetch_url

## Stage 5: Persistence & Debugging

### 5.1 Session Store
- [ ] JSONL file storage
- [ ] Load session by ID
- [ ] Append messages (optimized)
- [ ] List sessions
- [ ] Delete/clear sessions

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

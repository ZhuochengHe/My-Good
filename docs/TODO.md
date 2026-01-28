# Project TODO

**Updated:** 2026-01-28

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

### Phase 1: Foundation (Current)
- [ ] Initialize TypeScript project with tsconfig.json
- [ ] Set up package.json with dependencies
- [ ] Configure Vitest
- [ ] Configure ESLint + Prettier
- [ ] Define all core interfaces in `/src/types/`

### Phase 2: Core
- [ ] Implement configuration system (YAML + Zod)
- [ ] Implement structured logger
- [ ] Implement Anthropic provider
- [ ] Implement OpenAI provider
- [ ] Implement agent execution loop

### Phase 3: Plugins
- [ ] Implement plugin manager
- [ ] Implement tool executor
- [ ] Create file-ops plugin
- [ ] Create shell plugin
- [ ] Create web-search plugin

### Phase 4: Persistence
- [ ] Implement JSONL session store
- [ ] Session load/save/append
- [ ] Session listing and management

### Phase 5: CLI
- [ ] Set up Commander.js
- [ ] Implement `chat` command
- [ ] Implement `run` command
- [ ] Implement `plugins` commands
- [ ] Implement `config` commands
- [ ] Implement `session` commands

### Phase 6: Polish
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

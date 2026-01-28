# Quick Start Guide

## Project Setup

```bash
# Install dependencies
npm install

# Verify types compile
npm run typecheck

# Run tests (empty for now)
npm test
```

## Before Starting Implementation

1. **Understand the architecture:**
   ```bash
   cat docs/ARCHITECTURE.md
   ```

2. **Review implementation roadmap:**
   ```bash
   cat docs/ROADMAP.md
   ```

3. **Read the workflow:**
   ```bash
   cat .claude/WORKFLOW.md
   ```

## Session Workflow

### Starting a Session
```bash
/rename "What you're building"
```

### During Work
- Update `docs/DEV_LOG.md` with progress
- Follow TDD: write tests first
- Reference files instead of duplicating

### Ending a Session
- Update `docs/DEV_LOG.md` with final status
- Close Claude Code
- ✨ Hook auto-generates summary in `docs/sessions/`

## Next Steps (Phase 1)

### 1. Config System
- TDD tests in `tests/config/config-loader.test.ts`
- Implementation in `src/config/config-loader.ts`
- Use Zod for validation, YAML for parsing

### 2. Logger
- Simple structured logging
- Support JSON and pretty formats
- Configurable log levels

### 3. Providers
- Anthropic client
- OpenAI client
- Provider manager for routing

### 4. Agent Loop
- Core execution: message → provider → tools → response
- Event emission at lifecycle points
- Turn counting and max turn limits

### 5. Session Management
- JSONL file storage
- Load/save/append operations
- Session listing

## Key Files

### Architecture & Planning
- `docs/ARCHITECTURE.md` - All interfaces
- `docs/ROADMAP.md` - Implementation phases
- `docs/TODO.md` - Task tracking
- `docs/DEV_LOG.md` - Daily notes

### Code Structure
- `src/types/` - All TypeScript interfaces (8 files)
- `src/agent/` - Will contain agent loop
- `src/providers/` - Will contain LLM clients
- `src/plugins/` - Will contain plugin system
- `src/session/` - Will contain session storage
- `src/config/` - Will contain configuration
- `tests/` - Test files matching src/

### Default Plugins
- `plugins/file-ops/plugin.json` - File operations
- `plugins/shell/plugin.json` - Shell execution
- `plugins/web-search/plugin.json` - Web search

### Hooks & Workflow
- `.claude/WORKFLOW.md` - How to work
- `.claude/hooks/post-session-summarize.js` - Session summarizer
- `.claude/hooks/SESSION_SUMMARY_GUIDE.md` - How summaries work

## Development Commands

```bash
# Type checking
npm run typecheck

# Testing
npm test                # Run once
npm test:watch         # Watch mode
npm run test:coverage  # With coverage

# Code quality
npm run lint           # Check
npm run lint:fix       # Auto-fix
npm run format         # Format code

# Building
npm run build          # Compile to dist/
npm run dev            # Watch mode

# Running
npm start              # Run built version
```

## TDD Workflow

For each feature:

```bash
# 1. Write failing test
touch tests/feature/feature.test.ts
# Write test that fails

npm test

# 2. Implement minimal code
touch src/feature/feature.ts
# Write just enough to pass

npm test

# 3. Refactor while keeping tests green
# Improve code, ensure tests still pass

npm test

# 4. Check coverage
npm run test:coverage
# Target: ≥80%
```

## Session Summary Example

After a session, a file like this is auto-generated:
```
docs/sessions/2026-01-28_Project_Structure.md
```

Contains:
- 🎯 What We Did (narrative)
- 💡 Design Ideas & Decisions
- 🔨 What We Built (file changes)
- 📚 Resources & References
- ✅ Session Outcome
- 🚀 For Next Session

See `docs/sessions/2026-01-28_Project_Structure.md` for an example.

## Reference Architecture

The architecture is based on analysis of moltbot (https://github.com/moltbot/moltbot).

Key patterns adopted:
- Adapter pattern for extensibility
- Event-driven architecture
- JSONL session persistence
- Provider abstraction
- Manifest-based plugins

See `docs/reference/Moltbot_Project_Structure.md` for original analysis.

## Questions?

1. **What's the architecture?** → `docs/ARCHITECTURE.md`
2. **What's the plan?** → `docs/ROADMAP.md`
3. **How do I work?** → `.claude/WORKFLOW.md`
4. **What's next?** → `docs/TODO.md` and `docs/DEV_LOG.md`
5. **How do session summaries work?** → `.claude/hooks/SESSION_SUMMARY_GUIDE.md`

---

**Ready to start?**
```bash
/rename "Config Loader Implementation"
npm install
npm run typecheck
# Start with tests first!
```

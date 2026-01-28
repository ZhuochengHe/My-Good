# Development Workflow

## Session Structure

Each Claude Code session follows this pattern:

### Start Session
1. Open Claude Code
2. Name the session: `/rename "Clear description of what we're building"`

### During Session
1. **Check DEV_LOG.md** - Review what's next from previous sessions
2. **Read relevant docs** - ARCHITECTURE.md, ROADMAP.md, LLM_CONTEXT.md
3. **Work on tasks** - Follow TDD: tests first, then implementation
4. **Update DEV_LOG.md** - Log decisions and progress daily

### End Session
1. Update DEV_LOG.md with final status
2. Close Claude Code
3. ✨ Hook automatically generates session summary in `docs/sessions/`

## Documentation Organization

### Quick Reference
- **CLAUDE.md** - How to work with this project
- **README.md** - Project overview
- **LLM_CONTEXT.md** - Context for LLMs helping with code

### Technical Reference
- **ARCHITECTURE.md** - Interface definitions, data flow, design decisions
- **ROADMAP.md** - Implementation phases and timeline
- **TODO.md** - Task tracking and current status

### Development Log
- **DEV_LOG.md** - Daily notes (what we did, decisions, next steps)
- **docs/sessions/** - Session summaries (personalized diary entries)

### Reference Materials
- **docs/reference/typescript_style.md** - Coding standards
- **docs/reference/Moltbot_Project_Structure.md** - Reference architecture
- **.claude/hooks/SESSION_SUMMARY_GUIDE.md** - How summaries work

## Daily Workflow

### Before Starting Work
```bash
# Check what's next
cat docs/TODO.md
cat docs/DEV_LOG.md

# Review architecture as needed
cat docs/ARCHITECTURE.md
```

### During Work
```typescript
// Follow TDD for all code:

// 1. Write failing test (tests/*.test.ts)
// 2. Implement minimal code to pass
// 3. Refactor while keeping tests green
// 4. Verify coverage ≥80%

npm test
npm run test:coverage
```

### At End of Day
1. Update `docs/DEV_LOG.md`:
   ```markdown
   ## 2026-01-28

   ### Work Completed
   - [x] Implemented config loader
   - [x] 85% test coverage

   ### Next Steps
   - Implement Anthropic provider
   ```

2. Reference files, don't duplicate:
   ```markdown
   - See docs/ARCHITECTURE.md § 8 for config structure
   - Tool interface defined in src/types/tools.ts
   ```

3. Commit changes:
   ```bash
   git add .
   git commit -m "Implement config system with YAML + Zod validation"
   ```

4. Close Claude Code → Hook generates summary automatically

## Session Summary Details

### Auto-Generated Summary
When you close Claude Code:
1. Hook reads `docs/DEV_LOG.md` entries
2. Gets git file changes
3. Identifies referenced documentation
4. Generates markdown summary with:
   - 🎯 What We Did (personal narrative)
   - 💡 Design Ideas & Decisions
   - 🔨 What We Built (file changes)
   - 📚 Resources & References
   - ✅ Session Outcome
   - 🚀 For Next Session

### Example
See `docs/sessions/2026-01-28_Project_Structure.md` for a real example.

## Documentation Principles

### Single Source of Truth
- **ARCHITECTURE.md** = Complete interface definitions
- **ROADMAP.md** = Implementation timeline
- **DEV_LOG.md** = Daily notes (references other docs)
- **Sessions** = Personal narrative (references other docs)

Don't duplicate content across files. Reference instead:
```markdown
✅ Better:
- See docs/ARCHITECTURE.md § 3 for provider details

❌ Avoid:
- Here is the complete provider interface:
  interface ModelProvider { ... }
```

### Dev Log Format
```markdown
## YYYY-MM-DD

### Session Summary
**Focus:** [One-line summary of session]

### Decisions Made
1. **[Topic]:** [Decision]
   - Rationale: [Why this choice]

### Work Completed
- [x] Task completed
- [x] Another task

### Files Modified
- `src/config/loader.ts` - New config loader
- `tests/config/loader.test.ts` - Tests

### Blockers / Questions
- [Any issues encountered]

### Next Steps
1. Implement Anthropic provider
2. Build agent execution loop
```

## TDD Workflow

All new code uses Test-Driven Development:

### 1. Write Failing Test
```bash
# Create tests/feature/feature.test.ts
# Write test that will fail
npm test
```

### 2. Implement Minimal Code
```bash
# Create src/feature/feature.ts
# Write minimal code to pass test
npm test
```

### 3. Refactor
```bash
# Improve code while keeping tests green
npm test
```

### 4. Verify Coverage
```bash
npm run test:coverage
# Target: ≥80% coverage
```

## Quick Commands

```bash
# Type check
npm run typecheck

# Lint
npm run lint
npm run lint:fix

# Test
npm test
npm test:watch
npm run test:coverage

# Format
npm run format

# Build
npm run build

# Dev mode (watch)
npm run dev
```

## Git Workflow

```bash
# Before starting
git pull

# Commit when feature is complete
git add src/ tests/
git commit -m "Implement feature X with tests"

# Push when ready
git push
```

## Next Session Checklist

When starting a new session:

- [ ] Rename session: `/rename "Clear description"`
- [ ] Check `docs/TODO.md` for what's next
- [ ] Review `docs/DEV_LOG.md` for context
- [ ] Read relevant architecture section if needed
- [ ] Run `npm install` if needed
- [ ] Start with TDD: write test first

At end of session:
- [ ] Update `docs/DEV_LOG.md` with progress
- [ ] Run `npm test` to verify tests pass
- [ ] Commit changes
- [ ] Close Claude Code → Hook generates summary

---

See CLAUDE.md for development principles.
See .claude/hooks/SESSION_SUMMARY_GUIDE.md for summary details.

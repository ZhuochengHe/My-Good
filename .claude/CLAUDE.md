# Project Memory

See @README for project overview. See `docs/LLM_CONTEXT.md` for quick context.

## Workflow

**Development:** TDD-first implementation. Use subagents for complex features.

**Git Flow:**
1. Create feature branch: `git checkout -b stage-X-feature-name`
2. Use subagents for parallel work (planner → tdd-guide → reviewer)
3. Update docs after completion
4. **Run lint and build, and fix all errors before PR**
5. Run `npm test` to verify all tests pass

**Agent Coordination:**
- Use `/tdd` or `tdd-guide` agent for TDD implementation
- Use `planner` agent for complex feature planning
- Use `doc-updater` agent for documentation updates
- Run agents in parallel when independent (single message, multiple Task calls)

## Architecture

**Flow:** `User Input → Agent → Provider → LLM → Tool Calls? → Execute → Loop`

**Stack:**
- TypeScript (strict, ESM) + Node.js ≥18 + Vitest
- Custom agent loop (no framework)
- Provider abstraction (Anthropic, OpenAI)
- Plugin system (manifest-based tool discovery)
- JSONL sessions + event-driven lifecycle

## Code Standards

**Style:** Google TypeScript Style Guide (`docs/reference/typescript_style.md`)
- Naming: camelCase, PascalCase classes, CONSTANT_CASE
- No: `any`, default exports, `var`, `@ts-ignore`, `#private`
- JSDoc for all exports; max ~700 LOC per file
- Interfaces over types; `readonly` for immutability

**Testing:** TDD mandatory (RED → GREEN → REFACTOR), ≥80% coverage

## Key Principles

- TDD: Tests first, always
- Event-driven: Extensible architecture
- Provider abstraction: Multi-model support
- Plugin manifests: Tool discovery
- JSONL sessions: Debuggability

## Docs
ROADMAP.md, TODO.md, ARCHITECTURE.md, DEV_LOG.md


---

**Last Updated:** 2026-02-03

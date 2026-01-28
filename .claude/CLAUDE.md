# Project Memory

See @README for project overview.

## Quick Reference

| Document | Purpose |
|----------|---------|
| `docs/ARCHITECTURE.md` | Core interfaces, data flow |
| `docs/ROADMAP.md` | Implementation phases |
| `docs/LLM_CONTEXT.md` | Quick context for LLMs |
| `docs/TODO.md` | Current tasks |
| `docs/DEV_LOG.md` | Daily progress |

## Workflow & Process

- **Development Approach:** Design-first, now in implementation phase. TDD for all new code.
- **Testing:** Write tests first, run after changes. Target ≥80% coverage.
- **Proactive Improvements:** Yes - suggest improvements with technical explanations.
- **Backup & Confirmation:** Before significant changes, ask for confirmation.
- **Task Execution:** Execute tasks concisely without over-explaining.

## Architecture Summary

Custom agent execution loop:
```
User Input → Agent → Provider → LLM → Tool Calls? → Execute → Loop
```

Key components:
- **Agent** - Orchestrates execution loop
- **Providers** - Anthropic, OpenAI API clients
- **Plugins** - Manifest-based tools (file-ops, shell, web-search)
- **Sessions** - JSONL conversation storage
- **Events** - Lifecycle event system

## Language & Framework

- **Language**: TypeScript (strict mode, ESM modules)
- **Runtime**: Node.js ≥18.0.0
- **Agent Runtime**: Custom implementation
- **Testing**: Vitest with TDD approach
- **Reference**: Google TypeScript Style Guide

## Code Standards (Google TypeScript Style Guide)

- **Naming**: lowerCamelCase variables/functions, UpperCamelCase classes/interfaces, CONSTANT_CASE constants
- **Visibility**: Limit visibility, use `private` (not `#`), avoid `public` keyword
- **Comments**: JSDoc (`/** */`) for all exports; inline comments (`//`) for implementation details
- **Types**: Prefer interfaces over type aliases, avoid `any` (use `unknown` instead)
- **Control Flow**: Blocks for multi-line statements, `===` and `!==`, `const` by default
- **Functions**: Named functions at top level, arrow functions in expressions
- **No**: Default exports, `var`, `@ts-ignore`, private fields (`#`), `any` type
- **Immutability**: Use `readonly` for message types and config

**Full guide:** `docs/reference/typescript_style.md`

## Code Writing Requirements

- **Explanation Level:** Technical details explained to undergraduate level when needed.
- **Conciseness:** Keep responses concise. Detailed explanations only on request.
- **Code Comments:** JSDoc for all exports explaining purpose, parameters, return values.

## Key Principles

- TDD: Write failing tests first, then implement
- Event-driven architecture for extensibility
- JSONL sessions for debuggability
- Provider abstraction for multi-model support
- Plugin manifest pattern for tool discovery

## Session Documentation

Session summaries are automatically generated after each session and stored in `docs/sessions/` as personalized diary entries. These capture design thinking and decisions.

See `.claude/hooks/SESSION_SUMMARY_GUIDE.md` for hook documentation (separate from project memory).

---

**Last Updated:** 2026-01-28

# Project Memory

See @README for project overview.

## Workflow & Process

- **Development Approach:** Design-first. Understand requirements and architecture before heavy coding, then implement, then add tests once design stabilizes.
- **Testing:** After making changes, run tests automatically. (Future: automate via scripts)
- **Proactive Improvements:** Yes - suggest improvements proactively, including innovative ideas with technical explanations.
- **Backup & Confirmation:** Before making significant changes, ensure current files are backed up and ask for confirmation before proceeding.
- **Task Execution:** Execute tasks as planned without over-explaining, unless discussing innovative ideas or improvements.

## Communication & Code Standards

### Language & Framework

- **Language**: TypeScript (strict mode, ESM modules)
- **Runtime**: Node.js ≥18.0.0
- **Agent Runtime**: Custom implementation for MVP (to be researched)
- **Reference**: Google TypeScript Style Guide (https://google.github.io/styleguide/tsguide.html)

### Code Standards (Google TypeScript Style Guide)

- **Naming**: lowerCamelCase variables/functions, UpperCamelCase classes/interfaces, CONSTANT_CASE constants
- **Visibility**: Limit visibility, use `private` (not `#`), avoid `public` keyword
- **Comments**: JSDoc (`/** */`) for all exports; inline comments (`//`) for implementation details
- **Types**: Prefer interfaces over type aliases, avoid `any` (use `unknown` instead)
- **Control Flow**: Blocks for multi-line statements, `===` and `!==`, `const` by default
- **Functions**: Named functions at top level, arrow functions in expressions
- **No**: Default exports, `var`, `@ts-ignore`, private fields (`#`), `any` type

**For comprehensive style guidelines, see @typescript_style.md**

### Code Writing Requirements

- **Explanation Level:** Technical details explained to undergraduate level when needed.
- **Conciseness:** Keep responses concise. Detailed explanations only provided when explicitly asked or for innovative suggestions.
- **Code Comments:** Each implemented function must have detailed comments explaining its purpose, behavior, and any non-obvious logic (per Google guide).


## Key Principles

- Design-driven development with iterative refinement based on implementation learnings
- Tests important but come after design stabilization
- Clear code with comprehensive function-level documentation
- Proactive suggestions with thoughtful technical reasoning
- Conservative approach to major changes (backup + ask before proceeding)

---

**Last Updated:** 2026-01-28

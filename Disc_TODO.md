# Discussion: Items to Determine Later

## Programming Language & Framework
- [x] Choose primary programming language: **TypeScript + Node.js**
- [ ] Select framework(s) for building the agent system
- [ ] Research agentic loop implementations (custom vs Pi Agent vs LangChain)
- [ ] Evaluate against reference: https://github.com/moltbot/moltbot
- [ ] Document final choice and reasoning

**Decision Made:**
- **Language**: TypeScript (ESM modules, strict type checking)
- **Runtime**: Node.js ≥18.0.0
- **Why**: Node.js excels at I/O-bound async operations (critical for LLM API calls); TypeScript provides Java-like type safety; aligns with moltbot ecosystem

**Pending Decision:**
- **Agent Runtime**: Custom vs @mariozechner/pi-agent-core vs LangGraph - to be researched

## Project Structure
- [ ] Determine project structure (monorepo, single app, modular, etc.)
  - Pending: Understand agentic loop architecture first before deciding structure
- [ ] Define directory organization and separation of concerns
- [ ] Plan for scalability as different base models are added

## Code Standards & Style Guide
- [x] After language choice: find or create coding standards document
- [x] Link standards document in Claude.md
- [x] Define naming conventions, formatting, documentation expectations

**Standard Applied**: Google TypeScript Style Guide (https://google.github.io/styleguide/tsguide.html)
- Full guide saved in: `typescript_style.md`
- Key rules: lowerCamelCase variables, UpperCamelCase classes/interfaces, CONSTANT_CASE for constants
- JSDoc for all exports, implementation comments for non-obvious logic
- Prefer `const`, use `===`, arrow functions in expressions, no private fields (`#`)
- Interfaces over type aliases for objects, avoid `any` type
- Focus on clarity and maintainability
- Reference: See Claude.md for summary and `typescript_style.md` for full guidelines

## Architecture & Design
- [ ] Deep dive into moltbot architecture to understand patterns
- [ ] Define how different base models will be integrated
- [ ] Plan agent task execution system
- [ ] Design configuration/plugin system (if applicable)
- [ ] Stabilize architecture before heavy implementation

## Testing Strategy
- [ ] Define testing framework and approach post-design
- [ ] Plan test structure and coverage expectations
- [ ] Automate test running via scripts

## Additional Project Details
- [ ] Specific use cases and features for the agent
- [ ] Known limitations or constraints
- [ ] Performance or scale requirements
- [ ] Integration points with external systems

---

**Last Updated:** 2026-01-27

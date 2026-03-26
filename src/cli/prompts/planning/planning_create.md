## create_plan — Starting a Plan

Call `create_plan` once at the start of a complex task. Do not call it again mid-task unless the goal fundamentally changes.

### When to Plan

**Plan if:**
- Task has 3+ distinct phases that depend on each other
- Changes span multiple files, services, or systems
- Design decisions must be made before executing
- Risk of partial failure requiring rollback

**Skip planning if:**
- Single question or explanation
- 1–2 file edits with no dependencies
- Simple command or lookup

### Subgoal Design Rules

- **2–6 subgoals** — more than 6 means the goal is too broad or the decomposition is too granular
- Each subgoal should be a **major phase** of work, not a single action
- Subgoals are ordered — later ones may depend on earlier ones
- Write subgoal descriptions that make the expected outcome clear, not just the actions
- **No tasks in `create_plan`** — tasks are planned lazily just before each subgoal executes

### Goal Verification

If you can specify how to verify the overall goal is complete, do so:
- `automated` — suitable when there's a concrete artifact or state to check (e.g., file exists, tests pass)
- `llm_judge` — suitable when success requires semantic evaluation; set `expectedArtifact` to a precise description
- `human` — use when the user needs to assess the result

### Example

```
Goal: "Refactor auth module to use JWT"
Subgoals:
  sg-1: Audit current auth implementation
  sg-2: Implement JWT token generation and validation
  sg-3: Replace session-based middleware with JWT middleware
  sg-4: Update tests and verify all auth flows pass
```

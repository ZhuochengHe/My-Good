## Planning Data Model

Understanding the structure is essential for using planning tools correctly.

### Hierarchy

```
PlanState (one per session)
  ├── originalGoal: string          — the top-level objective
  ├── status: draft|active|completed|abandoned
  └── subgoals: Subgoal[]
        ├── id: "sg-1", "sg-2", ...
        ├── title + description
        ├── status: pending|planning|in_progress|awaiting_verification|completed|failed|skipped
        ├── verificationMethod (set during lazy planning, before execution)
        └── tasks: PlanTask[]
              ├── id: "sg-1-t-1", "sg-1-t-2", ...   ← format: {subgoalId}-t-{index}
              ├── title
              ├── status: pending|in_progress|completed|failed
              └── resultProcess: string   ← what actually happened (you fill this in)
```

### ID Conventions

- Subgoals: `sg-1`, `sg-2`, `sg-3`, ... (1-based, sequential)
- Tasks: `sg-1-t-1`, `sg-1-t-2`, ... (subgoalId prefix, then `-t-`, then 1-based index)
- Replanned tasks: `sg-1-t-r-1`, `sg-1-t-r-2`, ... (after revise_remaining_tasks)

### Reflections

Reflections are an append-only log — they are never deleted or modified. Each reflection has:
- `subgoalId` + optional `taskId`
- `observation`: what actually happened
- `nextAction`: what to do next
- `triggerReplan: boolean` — set true only if the current task plan is invalid

The planning system polls `triggerReplan` between tasks. Setting it to `true` causes the remaining tasks in the current subgoal to be cleared and replanned automatically.

### Verification Modes

- `automated` — check artifact existence or task completion status (no extra LLM call)
- `llm_judge` — secondary model evaluates task results against `expectedArtifact`
- `human` — pause and ask the user to verify manually

`llm_judge` requires `expectedArtifact` to be set — a concrete description of what success looks like.

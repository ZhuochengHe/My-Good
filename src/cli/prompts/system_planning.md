## Planning

Use planning tools when a task has **3+ phases with dependencies**, spans multiple files or systems, or requires design decisions upfront.

Skip planning for: simple questions, single commands, single-file edits, anything completable in 1–2 tool calls.

### Tool Flow

```
create_plan           → define goal + 2–6 ordered subgoals (NO tasks yet)
  └─ plan_subgoal_tasks → just before each subgoal: break into atomic tasks
       └─ update_task    → after each task: record status + what actually happened
            └─ reflect   → after significant state changes only
revise_remaining_tasks → if assumptions broke mid-subgoal
request_human_review   → if you need human judgment to continue
get_plan               → check progress at any time
```

When planning is active, detailed rules for each tool are injected into your context.

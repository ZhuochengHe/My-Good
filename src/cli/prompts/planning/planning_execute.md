## Executing a Subgoal — plan_subgoal_tasks + update_task

### plan_subgoal_tasks

Call this **just before executing a subgoal** — not during `create_plan`. Tasks are planned lazily because you know more context by the time you reach each subgoal.

**Task design rules:**
- Each task must be completable in **1–2 tool calls**
- Tasks should be concrete and verifiable — not "handle errors" but "add try/catch in fetchUser() at auth/client.ts"
- **2–8 tasks per subgoal** — if you need more, the subgoal is too large
- Order tasks so each builds on the previous — no parallel task assumptions
- Task titles should state the action and target: `"Read existing auth middleware at src/middleware/auth.ts"`

**What not to put in tasks:**
- Vague actions: "investigate", "handle", "deal with"
- Multiple actions in one task: "read file and update it and test it"
- Tasks that assume prior context the agent won't have

### update_task

Call `update_task` after **every task** — both on success and failure.

**`resultProcess` field — the most important field:**
- Record what **actually happened**, not what was planned
- If something was unexpected, say so explicitly: "File did not exist — created new one instead"
- If the task revealed new information, capture it: "Found 3 callers of this function, not 1 as expected"
- If the task failed, describe why and what state was left: "Write failed due to permission error — file unchanged"

**Status transitions:**
```
pending → in_progress  (when you start the task)
in_progress → completed  (task done, resultProcess filled)
in_progress → failed     (task could not complete)
```

Always mark `in_progress` before starting, not after.

### Flow Within a Subgoal

```
plan_subgoal_tasks(sg-1, [...tasks])
  update_task(sg-1, sg-1-t-1, in_progress)
  [execute tool calls]
  update_task(sg-1, sg-1-t-1, completed, resultProcess="...")
  update_task(sg-1, sg-1-t-2, in_progress)
  [execute tool calls]
  update_task(sg-1, sg-1-t-2, completed, resultProcess="...")
  ...
```

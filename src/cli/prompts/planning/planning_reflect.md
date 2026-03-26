## reflect + revise_remaining_tasks

### reflect — When and How

`reflect` is an **observation checkpoint**, not a summary of every action. Call it sparingly.

**Call reflect when:**
- A task result was surprising and changes what comes next
- You discovered something that affects future tasks (a file doesn't exist, an API behaves differently, a dependency is missing)
- You completed a task that is a meaningful state transition (e.g., all reads done, now starting writes)
- You hit a blocker and need to decide how to proceed

**Do NOT call reflect:**
- After every tool call
- Just to say "task completed as expected"
- As a substitute for `update_task`

**`observation` field:**
- Be specific: "File src/auth/session.ts has 847 lines and 12 functions, 3 of which reference the session store directly"
- Not: "Reviewed the file"

**`nextAction` field:**
- What you will do immediately after this reflection
- Specific: "Update task sg-1-t-3 to failed, then call revise_remaining_tasks with reason"
- Not: "Continue with the plan"

**`triggerReplan` field:**
- Set to `true` **only** when the current task list for this subgoal is no longer valid
- The system will automatically clear pending tasks and ask you to replan
- Use this when: a core assumption was wrong, a dependency failed, the approach must change
- Do NOT use for minor adjustments that don't invalidate the remaining tasks

### revise_remaining_tasks — Backtracking

Call `revise_remaining_tasks` when the current subgoal's remaining tasks are invalid and need to be replaced.

**When to use:**
- A task failed in a way that makes subsequent tasks meaningless
- New information discovered during execution requires a different approach
- `reflect` with `triggerReplan: true` was used and the system prompted a replan

**`reason` field:**
- Explain what broke and why it affects the remaining tasks
- "Task sg-1-t-2 failed: the config file uses YAML not JSON — remaining tasks assumed JSON parsing"

**What it does:**
- Clears all `pending` tasks in the current subgoal
- Preserves `completed` and `failed` tasks (history is kept)
- Replaces pending tasks with your new task list

**What it does NOT do:**
- Affect other subgoals
- Undo completed work
- Change the subgoal definition itself

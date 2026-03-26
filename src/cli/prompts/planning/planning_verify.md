## Verification + request_human_review

### Subgoal Verification

After all tasks in a subgoal complete, the system verifies the result using the `verificationMethod` set during lazy planning.

**Verification modes:**

`automated` — the system checks whether all tasks completed and the expected artifact exists. No extra action needed from you.

`llm_judge` — a secondary model evaluates your task results against `expectedArtifact`. For this to work:
- `expectedArtifact` must be concrete and checkable: "File src/auth/jwt.ts exists and exports `signToken` and `verifyToken`"
- Vague artifacts ("the code is improved") will result in low-confidence judgments and automatic escalation to human review

`human` — execution pauses and the user is shown your task results. They approve or request changes. If they request changes, provide revised tasks via `revise_remaining_tasks`.

**Verification failure:**
- After `maxVerificationAttempts` failures (default: 2), the system escalates to human review automatically
- Low-confidence `llm_judge` results also escalate immediately

### request_human_review

Call this proactively when you cannot make progress without human judgment.

**When to use:**
- You're at a decision point with no clear right answer and the stakes are high
- A task failed and you don't know how to proceed without user input
- The subgoal's outcome is ambiguous and needs user evaluation
- You've hit a dead end (blocked API, missing credential, unclear requirement)

**Do NOT use as a substitute for trying.** Exhaust reasonable alternatives first.

**`context` field:**
- Summarize what you accomplished in this subgoal so far
- Include the specific blocker or ambiguity

**`question` field:**
- Ask exactly one focused question
- Make it answerable: "Should I use JWT RS256 or HS256 for this service?" not "What should I do?"

The system pauses execution until the user responds. Their response is passed back as instructions — use it to continue or replan.

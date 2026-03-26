# Planning Layer Design

> Status: Draft — pending review before implementation
> Created: 2026-03-24

## Context

The agent currently has a purely reactive `ExecutionLoop` with no plan state, task decomposition, or structured reflection. For complex multi-step tasks the agent cannot track progress, verify results, or revise its approach mid-task.

This plan introduces a `PlanningLoop` outer wrapper implementing a **Goal → Subgoal → Task tree** with:

- **Lazy Task planning**: Goal + Subgoals are planned upfront; Tasks for a Subgoal are only planned just before its execution
- **Verifiable Subgoals**: Every Subgoal must have a `verification_method` before execution begins
- **User as Subgoal boundary**: Each Subgoal completion involves user interaction (review result + approve/backtrack)
- **Three verification modes**: automated (artifact/state check), LLM-judge (GPT-4o-mini), human review
- **Stack-based backtrack**: On verification failure, only Tasks within the current Subgoal are cleared and replanned

Inspired by: LangGraph's Plan→Execute→Replan pattern; OpenCode's Plan Agent vs Build Agent split.

---

## Data Model: `src/types/planning.ts`

```typescript
// ── Verification ─────────────────────────────────────────────────
export type VerificationMode = 'automated' | 'llm_judge' | 'human';

export interface VerificationMethod {
  readonly mode: VerificationMode;
  readonly description: string;        // what to check / what to show user
  readonly expectedArtifact?: string;  // file path or state key (required for llm_judge mode)
}

// ── Task (finest granularity, agent-internal) ─────────────────────
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface PlanTask {
  readonly id: string;             // "sg-1-t-1"
  readonly index: number;          // 1-based within parent Subgoal
  readonly title: string;
  readonly status: TaskStatus;
  readonly resultProcess?: string; // what actually happened (filled during execution)
  readonly startedAt?: number;
  readonly completedAt?: number;
}

// ── Subgoal ────────────────────────────────────────────────────────
export type SubgoalStatus =
  | 'pending' | 'planning' | 'in_progress'
  | 'awaiting_verification' | 'completed' | 'failed' | 'skipped';

export interface Subgoal {
  readonly id: string;                           // "sg-1"
  readonly index: number;
  readonly title: string;
  readonly description: string;
  readonly status: SubgoalStatus;
  readonly verificationMethod?: VerificationMethod; // set during lazy-planning phase
  readonly tasks: readonly PlanTask[];           // populated lazily, just before execution
  readonly verificationAttempts: number;
  readonly result?: string;                      // summary after completion
  readonly startedAt?: number;
  readonly completedAt?: number;
}

// ── Plan root ──────────────────────────────────────────────────────
export type PlanStatus = 'draft' | 'active' | 'awaiting_verification' | 'completed' | 'abandoned';

export interface PlanState {
  readonly planId: string;
  readonly sessionId: string;
  readonly originalGoal: string;
  readonly goalVerificationMethod?: VerificationMethod;
  readonly status: PlanStatus;
  readonly subgoals: readonly Subgoal[];
  readonly reflections: readonly ReflectionEntry[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ── Reflection (append-only log) ──────────────────────────────────
export interface ReflectionEntry {
  readonly id: string;
  readonly subgoalId: string;
  readonly taskId?: string;
  readonly timestamp: number;
  readonly observation: string;
  readonly nextAction: string;
  readonly triggerReplan: boolean; // PlanningLoop polls this between Tasks
}
```

---

## PlanStore: `src/planning/plan-store.ts`

Thin JSON wrapper. File: `~/.my-agent/plan.json`.

**Design**: maintains an in-memory singleton state to avoid disk races. All writes are atomic (`.tmp` → `rename`). `PlanningLoop` reads from memory state directly.

```typescript
export class PlanStore {
  private state: PlanState | null = null;  // in-memory singleton

  constructor(readonly planPath: string) {}

  async load(): Promise<PlanState | null>                                     // returns memory state if loaded
  async save(plan: PlanState): Promise<void>                                  // write memory + disk
  async patch(changes: DeepPartial<PlanState>): Promise<PlanState>
  async updateSubgoal(id: string, changes: Partial<Subgoal>): Promise<void>
  async updateTask(subgoalId: string, taskId: string, changes: Partial<PlanTask>): Promise<void>
  async appendReflection(entry: ReflectionEntry): Promise<void>
  async clear(): Promise<void>
}
```

---

## PlanningLoop: `src/planning/planning-loop.ts`

```typescript
export interface PlanningLoopConfig {
  readonly maxVerificationAttempts: number;        // default 2; after this → human escalation
  readonly complexityThreshold: 'auto' | 'always' | 'never';
  readonly planStorePath: string;
}

export class PlanningLoop {
  constructor(
    private executionLoop: Agent,
    private planStore: PlanStore,
    private provider: ModelProvider,             // main LLM (planning, synthesis)
    private verificationProvider: ModelProvider, // GPT-4o-mini for llm_judge
    private settings: AgentSettings,
    private onToolCall: OnToolCallCallback,
    private onHumanReview: (req: HumanReviewRequest) => Promise<HumanReviewResult>,
    private config: PlanningLoopConfig
  )

  async run(goal: string, sessionId: string, signal?: AbortSignal): Promise<PlanningRunResult>
}
```

### Phase A: PrePlanner — Router + Memory Injection

```
1. Complexity check (single LLM call, no tools)
   - Response: { isComplex: boolean }
   - If !isComplex → executionLoop.run(goal, { sessionId }) and return

2. Memory retrieval before plan generation:
   - memoryStore.search({ kind: 'preference', query: goal })
   - memoryStore.search({ kind: 'experiential', query: goal })
   - Inject as "User Preferences & Past Experience" context block

3. Generate initial plan (LLM call with memory context):
   - Output: { goalVerification?, subgoals: [{ title, description }] }
   - Subgoals only — NO Tasks yet (lazy)
   - Save to planStore
```

### Phase B: Per-Subgoal Lazy Planning + Verification Setup

```
For each Subgoal, before execution:
  1. LLM proposes verificationMethod for this Subgoal
  2. If 'automated': clear, proceed
  3. If no concrete check possible:
     → Ask user: "Subgoal X has no automated verification.
       [A] LLM-judge — provide expected outcome
       [B] Human review — you verify manually"
     → Store choice in subgoal.verificationMethod
  4. Plan Tasks lazily:
     - LLM call: produce ordered atomic tasks for this subgoal
     - Store in subgoal.tasks (titles only; resultProcess filled during execution)
```

### Phase C: Stack-based Task Execution (within each Subgoal)

```
planStore.updateSubgoal(id, { status: 'in_progress' })

Serialize plan state as markdown → pass as compactSummary to executionLoop.run()
  (reuses ExecutionLoop.buildSystemPrompt() "## Previous Conversation Summary" injection)

executionLoop.run(subgoalPrompt, {
  sessionId,
  conversationHistory: accumulatedMessages,  // continuity across subgoals
  compactSummary: planMarkdown,
  onToolCall,
  signal
})

Between Tasks, PlanningLoop polls for triggerReplan flag:
  - If triggerReplan=true:
      → Clear all pending Tasks in current Subgoal
      → LLM re-plans remaining Tasks with error context
      → Continue execution

All Tasks done → status: 'awaiting_verification'
```

### Phase D: Subgoal Verification + User Boundary

```
mode === 'automated':
  Check artifact exists / state changed
  Pass → 'completed'
  Fail → attempt++; if >= maxVerificationAttempts → escalate to human

mode === 'llm_judge':
  Collect artifacts (task resultProcess entries + tool outputs)
  Call verificationProvider:
    "Expected: <expectedArtifact>"
    "Actual: <artifacts>"
    "Return JSON: { passed, confidence: high|medium|low, reasoning }"
  If confidence === 'low' → auto-escalate to human
  Pass → 'completed'
  Fail → attempt++; if >= maxVerificationAttempts → escalate to human

mode === 'human' (or escalated):
  Pause execution
  onHumanReview({ subgoal, taskResults, planContext })
  User sees: subgoal title, verification description, each task's resultProcess
  User: approved | request_changes(instructions)
  If request_changes → replan Tasks with instructions, re-execute

Agent can also proactively call request_human_review tool at any time.

After subgoal completion:
  → accumulate messages into conversationHistory
  → proceed to next subgoal's Phase B
```

### Phase E: Goal Completion

```
All subgoals completed:
  Run goal-level verification (same 3-mode logic)
  LLM synthesis: summarize what was accomplished
  planStore.patch({ status: 'completed' })
  Return PlanningRunResult
```

---

## Planning Plugin: `plugins/planning/`

### `plugin.json` — 7 tools

| Tool | Key Args | Purpose |
|---|---|---|
| `create_plan` | goal, subgoals[], goalVerification? | Write initial PlanState (no Tasks) |
| `plan_subgoal_tasks` | subgoalId, tasks[] | Lazily populate Tasks for one Subgoal |
| `update_task` | subgoalId, taskId, status, resultProcess? | Update Task status + process |
| `reflect` | subgoalId, taskId?, observation, next_action, update_plan? | Append ReflectionEntry |
| `revise_remaining_tasks` | subgoalId, newTasks[], reason | Backtrack: clear pending Tasks, push new |
| `get_plan` | include_reflections? | Return formatted plan markdown |
| `request_human_review` | subgoalId, context, question | Set human_review_pending flag; loop pauses |

### `handlers.js`

Plain JS. Accesses `context.planStore` — same pattern as `context.memoryStore` in `plugins/memory/handlers.js`.

`reflect` handler: sets `triggerReplan` flag in planStore; does NOT interrupt execution directly.
`request_human_review` handler: writes `humanReviewPending` flag; `PlanningLoop` polls and pauses.

---

## System Prompt Addition: `src/cli/prompts/system-prompt.md`

```markdown
## Planning

**When to use planning tools:**
- Task has 3+ phases with dependencies, spans multiple files/services, or requires design decisions
- Simple questions, single commands, single-file edits: skip planning

**Workflow:**
1. `create_plan` — goal + 2–6 ordered subgoals (NO Tasks yet)
2. Before executing each subgoal: `plan_subgoal_tasks` — concrete atomic tasks
3. After each significant state change: `reflect` — what actually happened + next action
4. After each task: `update_task` — status + resultProcess
5. If earlier assumptions were wrong: `revise_remaining_tasks`
6. If stuck without human judgment: `request_human_review`
7. `get_plan` — review progress at any time

**Task granularity:** Each task should be completable in 1–2 tool calls.
**resultProcess:** Record what actually happened, not what was expected. Surprises matter.
```

---

## Files to Modify

| File | Change |
|---|---|
| `src/types/tools.ts` | Add `planStore?: PlanStore` to `ToolContext` |
| `src/plugins/tool-executor.ts` | Add `planStore` constructor param (after `memoryStore`, line 120); thread into `ToolContext` |
| `src/cli/bootstrap.ts` | Step 8b: init `PlanStore`; Step 9: pass to `ToolExecutor`; Step 12b: init `PlanningLoop`; add to `BootstrapResult` |
| `src/session/session-manager.ts` | Optional `planningLoop?` constructor param; dispatch in `run()` before existing paths |
| `src/cli/prompts/system-prompt.md` | Append `## Planning` section |

---

## New Files

| File | Purpose |
|---|---|
| `src/types/planning.ts` | PlanState, Subgoal, PlanTask, ReflectionEntry, VerificationMethod |
| `src/planning/plan-store.ts` | In-memory + atomic JSON persistence |
| `src/planning/planning-loop.ts` | PlanningLoop: 5 phases |
| `src/planning/index.ts` | Barrel export |
| `plugins/planning/plugin.json` | 7-tool manifest |
| `plugins/planning/handlers.js` | Handlers using context.planStore |

---

## Technical Risks & Mitigations

### 1. Reflect 频率与 Token 成本

`reflect` tool call 本身**不触发额外 LLM 调用**——它只是写 plan.json（纯 I/O）。LLM 的 reflect 行为发生在正常 assistant turn 里（作为 tool_use）。额外 LLM 调用仅在 `triggerReplan=true` 时发生（PlanningLoop 触发重规划）。System prompt 明确：仅在**状态发生显著变化**时 reflect，非每次工具调用都强制。

### 2. PlanStore 并发写入竞态

`PlanStore` 维护单一 in-memory state。Node.js 单线程模型保证工具调用串行执行，因此 `ExecutionLoop` 的工具 handler 写 Task 和 `PlanningLoop` 写 Subgoal status 不会并发。内存状态优先，磁盘写入异步（`.tmp` → `rename`）。无需文件锁。

### 3. LLM-Judge 可靠性

`llm_judge` 模式**强制要求** `expectedArtifact` 字段。验证 prompt 要求 `{ passed, confidence: high|medium|low, reasoning }`。`confidence === 'low'` 时自动降级为人工节点。Subgoal 规划阶段若 Agent 未提供具体 `expectedArtifact`，系统提示用户补充。

---

## Verification Plan

1. `tests/planning/plan-store.test.ts` — atomic write, patch, updateSubgoal, updateTask, appendReflection, in-memory state
2. `tests/planning/planning-loop.test.ts` — mock ExecutionLoop + provider; complexity bypass, lazy task planning, all 3 verification modes, backtrack, human escalation
3. `tests/plugins/planning.test.ts` — all 7 handlers with mock planStore
4. Integration: `my-agent chat` with multi-step task → plan.json created, Tasks planned lazily, reflect in tool trace, subgoal verification prompts user
5. Simple bypass: trivial question → plan.json NOT created
6. Backtrack: inject failing Task → Tasks replanned, prior Subgoals untouched

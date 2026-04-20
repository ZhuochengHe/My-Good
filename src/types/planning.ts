// ── Verification ─────────────────────────────────────────────────
export type VerificationMode = 'automated' | 'llm_judge' | 'human';

export interface VerificationMethod {
  readonly mode: VerificationMode;
  readonly description: string;        // what to check / what to show user
  readonly expectedArtifact?: string;  // file path or state key (required for llm_judge mode)
}

// ── Task (finest granularity, agent-internal) ─────────────────────
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * A single tool call executed during a task.
 * Persisted in real-time so interrupted tasks can resume with context
 * about what side-effects already occurred.
 * Cleared when the task reaches 'completed' status.
 */
export interface TaskToolRecord {
  readonly callId: string;
  readonly name: string;
  readonly success: boolean;
  /** Truncated output (first 500 chars) — enough for the agent to understand what happened. */
  readonly output: string;
  readonly executedAt: number;
}

export interface PlanTask {
  readonly id: string;             // "sg-1-t-1"
  readonly index: number;          // 1-based within parent Subgoal
  readonly title: string;
  readonly status: TaskStatus;
  readonly resultProcess?: string; // what actually happened (filled during execution)
  readonly artifacts?: readonly string[];    // file paths or outputs produced
  readonly failedAttempts?: readonly string[]; // approaches tried but failed (prevents re-trying)
  readonly startedAt?: number;
  readonly completedAt?: number;
  /**
   * Real-time log of tool calls executed so far within this task.
   * Non-empty only while status is 'in_progress' (cleared on completion).
   * Used to inject recovery context if the task is interrupted and retried.
   */
  readonly inProgressTools?: readonly TaskToolRecord[];
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

// ── Utility types ─────────────────────────────────────────────────
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends readonly (infer U)[]
    ? readonly DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

/**
 * Planning loop orchestrator.
 *
 * Implements a multi-phase planning loop:
 *   A. Complexity check + initial plan generation
 *   B. Per-subgoal lazy planning (verification method + tasks)
 *   C. Task execution via agent
 *   D. Subgoal verification (automated / llm_judge / human)
 *   E. Goal completion summary
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Agent } from '../types/agent.js';
import type { ModelProvider } from '../types/providers.js';
import type { ConversationMessage } from '../types/messages.js';
import type {
  PlanState,
  Subgoal,
  PlanTask,
  TaskToolRecord,
  VerificationMethod,
} from '../types/planning.js';
import type { PlanStore } from './plan-store.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface HumanReviewRequest {
  readonly subgoal: Subgoal;
  readonly taskResults: readonly string[];
  readonly planContext: string;
  readonly question: string;
}

export interface HumanReviewResult {
  readonly approved: boolean;
  /** If not approved, instructions for revision. */
  readonly instructions?: string;
}

export interface PlanningLoopConfig {
  /** Maximum verification attempts before escalating to human. Default 2. */
  readonly maxVerificationAttempts: number;
  /** Whether to treat every goal as complex. */
  readonly complexityThreshold: 'auto' | 'always' | 'never';
  /** Path to the plan.json backing file (used only for PlanStore construction externally). */
  readonly planStorePath: string;
  /** Optional callback to receive human-readable progress updates during planning. */
  readonly onProgress?: (message: string) => void;
}

export interface PlanningRunResult {
  readonly success: boolean;
  readonly planId?: string;
  readonly subgoalsCompleted: number;
  readonly totalSubgoals: number;
  readonly finalSummary?: string;
  readonly error?: string;
  /** True when the run was stopped by an AbortSignal (user interrupt), not a genuine error. */
  readonly interrupted?: boolean;
}

// ── Class ─────────────────────────────────────────────────────────────────────

export class PlanningLoop {
  /** Per-invocation progress callback set at the start of each run(). */
  private runtimeProgress: ((message: string) => void) | undefined;

  constructor(
    private executionLoop: Agent,
    private planStore: PlanStore,
    private provider: ModelProvider,
    private verificationProvider: ModelProvider,
    private onHumanReview: (req: HumanReviewRequest) => Promise<HumanReviewResult>,
    private config: PlanningLoopConfig
  ) {}

  // ── Public entry point ────────────────────────────────────────────────────

  async run(
    goal: string,
    sessionId: string,
    signal?: AbortSignal,
    onProgress?: (message: string) => void
  ): Promise<PlanningRunResult> {
    // Per-call onProgress overrides the config-level one for this invocation
    if (onProgress !== undefined) {
      this.runtimeProgress = onProgress;
    } else {
      this.runtimeProgress = undefined;
    }

    // Declared outside try so catch can report partial progress
    let plan: PlanState | undefined;
    let subgoalsCompleted = 0;

    try {
      // Phase A: Complexity check
      this.progress('Checking task complexity...');
      const complex = await this.isComplex(goal);
      if (!complex) {
        this.progress('Simple task — running directly.');
        const result = await this.executionLoop.run(goal, {
        sessionId,
        ...(signal !== undefined && { signal }),
      });
        return {
          success: result.finishReason !== 'error',
          subgoalsCompleted: 0,
          totalSubgoals: 0,
        };
      }

      // Phase A: Generate initial plan
      this.progress('Complex task detected — generating plan...');
      plan = await this.generateInitialPlan(goal, sessionId);
      this.progress(`Plan ready: ${plan.subgoals.length} subgoals.`);
      // Cross-subgoal context: one-line outcome + artifacts per completed subgoal.
      // We deliberately do NOT accumulate raw conversation — only structured summaries.
      const completedSubgoalSummaries: string[] = [];

      // Phase B + C + D: Per-subgoal loop
      for (const subgoal of plan.subgoals) {
        const sgLabel = `[${subgoal.index}/${plan.subgoals.length}] ${subgoal.title}`;

        // Phase B: Plan verification method + tasks lazily
        this.progress(`Planning subgoal ${sgLabel}...`);
        const verificationMethod = await this.planSubgoalVerification(subgoal, plan);
        await this.planStore.updateSubgoal(subgoal.id, { verificationMethod, status: 'planning' });

        const tasks = await this.planSubgoalTasks(subgoal, plan, completedSubgoalSummaries);
        // planSubgoalTasks already calls updateSubgoal with tasks + 'in_progress'
        void tasks; // tasks stored in plan store; reference suppresses unused-var warning
        this.progress(`Subgoal ${sgLabel} — ${tasks.length} tasks planned.`);

        // Phase C: Execute
        this.progress(`Executing subgoal ${sgLabel}...`);
        await this.planStore.updateSubgoal(subgoal.id, {
          status: 'in_progress',
          startedAt: Date.now(),
        });
        const { taskResults } = await this.executeSubgoal(
          subgoal,
          plan,
          [],
          sessionId,
          signal,
          completedSubgoalSummaries
        );

        // Reload plan after execution (tools may have updated it)
        plan = (await this.planStore.load())!;
        const updatedSubgoal = plan.subgoals.find((sg) => sg.id === subgoal.id)!;

        // Check for triggerReplan
        const replanReflection = plan.reflections.find(
          (r) => r.subgoalId === subgoal.id && r.triggerReplan
        );
        let finalTaskResults = taskResults;
        if (replanReflection) {
          this.progress(`Replanning subgoal ${sgLabel}...`);
          await this.replanSubgoalTasks(updatedSubgoal, plan, replanReflection.nextAction);
          this.progress(`Re-executing subgoal ${sgLabel} after replan...`);
          plan = (await this.planStore.load())!;
          const replanedSubgoal = plan.subgoals.find((sg) => sg.id === subgoal.id)!;
          const reExec = await this.executeSubgoal(
            replanedSubgoal,
            plan,
            [],
            sessionId,
            signal,
            completedSubgoalSummaries
          );
          finalTaskResults = reExec.taskResults;
          plan = (await this.planStore.load())!;
        }

        await this.planStore.updateSubgoal(subgoal.id, { status: 'awaiting_verification' });

        // Phase D: Verify
        this.progress(`Verifying subgoal ${sgLabel}...`);
        let verificationPassed = false;
        let attempts = 0;
        const maxAttempts = this.config.maxVerificationAttempts;

        while (!verificationPassed && attempts < maxAttempts) {
          attempts++;
          const { passed, escalateToHuman } = await this.verifySubgoal(
            updatedSubgoal,
            plan,
            finalTaskResults,
            sessionId,
            signal
          );

          if (escalateToHuman || (!passed && attempts >= maxAttempts)) {
            this.progress(`Subgoal ${sgLabel} — waiting for human review...`);
            // Human review
            const reviewResult = await this.onHumanReview({
              subgoal: updatedSubgoal,
              taskResults: finalTaskResults,
              planContext: goal,
              question: escalateToHuman
                ? `Please verify: ${updatedSubgoal.verificationMethod?.description ?? updatedSubgoal.title}`
                : `Verification failed after ${attempts} attempts. Please review: ${updatedSubgoal.title}`,
            });

            if (reviewResult.approved) {
              verificationPassed = true;
            } else if (reviewResult.instructions) {
              // Re-execute with revised tasks
              this.progress(`Re-executing subgoal ${sgLabel} after human feedback...`);
              await this.replanSubgoalTasks(updatedSubgoal, plan, reviewResult.instructions);
              const reExec = await this.executeSubgoal(
                updatedSubgoal,
                plan,
                [],
                sessionId,
                signal,
                completedSubgoalSummaries
              );
              finalTaskResults = reExec.taskResults;
              // Give one more verification pass after re-execution
            }
            break; // Exit verification loop after human review
          }

          verificationPassed = passed;
        }

        await this.planStore.updateSubgoal(subgoal.id, {
          status: verificationPassed ? 'completed' : 'failed',
          completedAt: Date.now(),
        });

        this.progress(
          verificationPassed
            ? `Subgoal ${sgLabel} — done.`
            : `Subgoal ${sgLabel} — failed verification.`
        );
        subgoalsCompleted++;

        // Record a structured summary for this subgoal to carry into the next.
        // Includes outcome + artifacts; raw history never crosses the boundary.
        const sgOutcome = updatedSubgoal.result ?? finalTaskResults.join('; ');
        if (sgOutcome) {
          const allArtifacts = updatedSubgoal.tasks
            .flatMap((t) => t.artifacts ?? [])
            .filter((a) => a.length > 0);
          const artifactSuffix =
            allArtifacts.length > 0 ? ` [artifacts: ${allArtifacts.join(', ')}]` : '';
          completedSubgoalSummaries.push(
            `Subgoal ${subgoal.index} (${subgoal.title}): ${sgOutcome}${artifactSuffix}`
          );
        }

        // Reload plan for next iteration
        plan = (await this.planStore.load())!;
      }

      // Phase E: Goal completion
      await this.planStore.patch({ status: 'completed' });
      this.progress(`All done — ${subgoalsCompleted}/${plan.subgoals.length} subgoals completed.`);

      return {
        success: true,
        planId: plan.planId,
        subgoalsCompleted,
        totalSubgoals: plan.subgoals.length,
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      // Mark plan as abandoned so resume logic can detect the interrupted state
      try {
        await this.planStore.patch({ status: 'abandoned' });
      } catch {
        // Best-effort — don't mask the original error
      }
      return {
        success: false,
        subgoalsCompleted,
        totalSubgoals: plan?.subgoals.length ?? 0,
        interrupted: isAbort,
        error: isAbort
          ? 'Interrupted by user'
          : err instanceof Error
            ? err.message
            : 'Unknown error',
      };
    }
  }

  // ── Progress helper ───────────────────────────────────────────────────────

  private progress(message: string): void {
    (this.runtimeProgress ?? this.config.onProgress)?.(message);
  }

  // ── Planning docs loader ──────────────────────────────────────────────────

  /**
   * Load the detailed planning prompt modules and concatenate them.
   * Tries user dir (~/.my-agent/prompts/system-prompts/planning/) first,
   * then falls back to bundled src/cli/prompts/planning/.
   * Returns null if no modules found (graceful degradation).
   */
  private async loadPlanningDocs(): Promise<string | null> {
    const modules: Array<{ name: string; label: string }> = [
      { name: 'planning_data_model', label: 'Planning: Data Model'   },
      { name: 'planning_create',     label: 'Planning: Create Plan'  },
      { name: 'planning_execute',    label: 'Planning: Execute'      },
      { name: 'planning_reflect',    label: 'Planning: Reflect'      },
      { name: 'planning_verify',     label: 'Planning: Verify'       },
    ];

    const userDir = join(homedir(), '.my-agent', 'prompts', 'system-prompts', 'planning');
    const bundledDir = fileURLToPath(new URL('../../cli/prompts/planning/', import.meta.url));

    const parts: string[] = [];
    for (const { name, label } of modules) {
      const filename = `${name}.md`;
      for (const dir of [userDir, bundledDir]) {
        try {
          const content = await readFile(join(dir, filename), 'utf-8');
          parts.push(`# [${label}]\n\n${content.trim()}`);
          break;
        } catch {
          // try next candidate
        }
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  // ── Phase A helpers ───────────────────────────────────────────────────────

  private async isComplex(goal: string): Promise<boolean> {
    if (this.config.complexityThreshold === 'always') return true;
    if (this.config.complexityThreshold === 'never') return false;

    // 'auto': ask the provider
    try {
      const response = await this.provider.complete({
        model: this.executionLoop.config.model,
        messages: [
          {
            id: randomUUID(),
            role: 'user',
            content: `Analyze this goal: "${goal}"\n\nRespond with JSON: { "isComplex": boolean, "reason": string }\nA goal is complex if it has 3+ phases, spans multiple files/services, or requires design decisions.`,
            timestamp: Date.now(),
          },
        ],
        systemPrompt: 'You are a task complexity analyzer. Respond with JSON only.',
      });

      const json = JSON.parse(response.message.content) as { isComplex: boolean };
      return json.isComplex;
    } catch {
      // Safe fallback: treat as complex
      return true;
    }
  }

  private async generateInitialPlan(goal: string, sessionId: string): Promise<PlanState> {
    const response = await this.provider.complete({
      model: this.executionLoop.config.model,
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          content: `Generate a plan for: "${goal}"\n\nRespond with JSON:\n{\n  "subgoals": [{ "title": string, "description": string }],\n  "goalVerification": { "mode": "automated"|"llm_judge"|"human", "description": string, "expectedArtifact": string }\n}\n\nCreate 2-6 ordered subgoals. Each subgoal should be a major phase of work.`,
          timestamp: Date.now(),
        },
      ],
      systemPrompt: 'You are a planning assistant. Generate structured plans as JSON.',
    });

    const parsed = JSON.parse(response.message.content) as {
      subgoals: Array<{ title: string; description: string }>;
      goalVerification: { mode: string; description: string; expectedArtifact?: string };
    };

    const now = Date.now();
    const subgoals: Subgoal[] = parsed.subgoals.map((sg, i) => ({
      id: `sg-${i + 1}`,
      index: i + 1,
      title: sg.title,
      description: sg.description,
      status: 'pending',
      tasks: [],
      verificationAttempts: 0,
    }));

    const goalVerification: VerificationMethod = {
      mode: parsed.goalVerification.mode as VerificationMethod['mode'],
      description: parsed.goalVerification.description,
      ...(parsed.goalVerification.expectedArtifact !== undefined && {
        expectedArtifact: parsed.goalVerification.expectedArtifact,
      }),
    };

    const plan: PlanState = {
      planId: randomUUID(),
      sessionId,
      originalGoal: goal,
      goalVerificationMethod: goalVerification,
      status: 'active',
      subgoals,
      reflections: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.planStore.save(plan);
    return plan;
  }

  // ── Phase B helpers ───────────────────────────────────────────────────────

  private async planSubgoalVerification(
    subgoal: Subgoal,
    plan: PlanState
  ): Promise<VerificationMethod> {
    const response = await this.provider.complete({
      model: this.executionLoop.config.model,
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          content: `For this subgoal, determine the best verification method:\nSubgoal: "${subgoal.title}"\nDescription: "${subgoal.description}"\nOverall goal: "${plan.originalGoal}"\n\nRespond with JSON:\n{ "mode": "automated"|"llm_judge"|"human", "description": string, "expectedArtifact": string }`,
          timestamp: Date.now(),
        },
      ],
      systemPrompt: 'You are a verification planner. Respond with JSON only.',
    });

    const parsed = JSON.parse(response.message.content) as {
      mode: string;
      description: string;
      expectedArtifact?: string;
    };

    return {
      mode: parsed.mode as VerificationMethod['mode'],
      description: parsed.description,
      ...(parsed.expectedArtifact !== undefined && {
        expectedArtifact: parsed.expectedArtifact,
      }),
    };
  }

  private async planSubgoalTasks(
    subgoal: Subgoal,
    _plan: PlanState,
    completedSubgoalSummaries: readonly string[] = []
  ): Promise<readonly PlanTask[]> {
    const priorContext =
      completedSubgoalSummaries.length > 0
        ? `\n\nCompleted subgoals so far:\n${completedSubgoalSummaries.map((s) => `- ${s}`).join('\n')}`
        : '';

    const response = await this.provider.complete({
      model: this.executionLoop.config.model,
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          content:
            `Plan atomic tasks for this subgoal:\nSubgoal: "${subgoal.title}"\nDescription: "${subgoal.description}"` +
            priorContext +
            `\n\nRespond with JSON:\n{ "tasks": [{ "title": string }] }\n\nEach task should be completable in 1-2 tool calls. Create 2-8 tasks.`,
          timestamp: Date.now(),
        },
      ],
      systemPrompt: 'You are a task planner. Respond with JSON only.',
    });

    const parsed = JSON.parse(response.message.content) as {
      tasks: Array<{ title: string }>;
    };

    const tasks: PlanTask[] = parsed.tasks.map((t, i) => ({
      id: `${subgoal.id}-t-${i + 1}`,
      index: i + 1,
      title: t.title,
      status: 'pending',
    }));

    await this.planStore.updateSubgoal(subgoal.id, { tasks, status: 'in_progress' });
    return tasks;
  }

  // ── Phase C helpers ───────────────────────────────────────────────────────

  /**
   * Serialize completed task summaries for injection into the next task's prompt.
   * Includes outcome, artifacts, and failed attempts to prevent redundant re-tries.
   */
  private serializeCompletedTaskSummaries(tasks: readonly PlanTask[]): string {
    const completed = tasks.filter((t) => t.status === 'completed' && t.resultProcess);
    if (completed.length === 0) return '';

    const lines: string[] = ['## Completed Tasks So Far'];
    for (const task of completed) {
      lines.push(`\n### Task ${task.index}: ${task.title}`);
      lines.push(`**Outcome:** ${task.resultProcess}`);
      if (task.artifacts && task.artifacts.length > 0) {
        lines.push(`**Artifacts:** ${task.artifacts.join(', ')}`);
      }
      if (task.failedAttempts && task.failedAttempts.length > 0) {
        lines.push(`**Failed approaches (do not retry):**`);
        for (const attempt of task.failedAttempts) {
          lines.push(`  - ${attempt}`);
        }
      }
    }
    return lines.join('\n');
  }

  private async executeSubgoal(
    subgoal: Subgoal,
    plan: PlanState,
    _conversationHistory: ConversationMessage[],
    sessionId: string,
    signal?: AbortSignal,
    completedSubgoalSummaries?: readonly string[]
  ): Promise<{ messages: ConversationMessage[]; taskResults: string[] }> {
    const planningDocs = await this.loadPlanningDocs();

    // Reload the subgoal's current tasks from the store (may have been lazily planned)
    let currentPlan = (await this.planStore.load()) ?? plan;
    let currentSubgoal = currentPlan.subgoals.find((sg) => sg.id === subgoal.id) ?? subgoal;

    const taskResults: string[] = [];

    // Execute each task independently with its own conversation thread.
    // Each task receives: subgoal context + structured summaries of prior completed tasks.
    // Raw tool call/result history is discarded after each task — only summaries persist.
    for (const task of currentSubgoal.tasks) {
      if (task.status === 'completed') {
        // Already done (e.g. from a previous partial execution)
        if (task.resultProcess) {
          taskResults.push(`[${task.title}]: ${task.resultProcess}`);
        }
        continue;
      }

      await this.planStore.updateTask(subgoal.id, task.id, {
        status: 'in_progress',
        startedAt: Date.now(),
      });

      // Build per-task prompt: completed summaries + recovery context + current task
      const completedSummaries = this.serializeCompletedTaskSummaries(currentSubgoal.tasks);
      const recoverySection = this.serializeRecoveryContext(task.inProgressTools);
      const taskPrompt =
        `## Subgoal Context\n` +
        `Subgoal ${subgoal.index}/${plan.subgoals.length}: ${subgoal.title}\n` +
        `${subgoal.description}\n\n` +
        (completedSummaries ? `${completedSummaries}\n\n` : '') +
        (recoverySection ? `${recoverySection}\n\n` : '') +
        `## Current Task\n` +
        `Task ${task.index}/${currentSubgoal.tasks.length}: ${task.title}\n\n` +
        `Execute this task. When done, call update_task to record your outcome, any artifacts produced, ` +
        `and any approaches that failed.`;

      // compactSummary carries planning docs + high-level plan state (no raw history)
      const planMarkdown = this.serializePlanToMarkdown(currentPlan, completedSubgoalSummaries);
      const compactSummary = planningDocs
        ? `${planningDocs}\n\n---\n\n${planMarkdown}`
        : planMarkdown;

      // Capture subgoal/task ids for the closure — loop variables will advance
      const capturedSubgoalId = subgoal.id;
      const capturedTaskId = task.id;

      await this.executionLoop.run(taskPrompt, {
        sessionId,
        // Each task starts a fresh conversation — no accumulated raw history
        conversationHistory: [],
        compactSummary,
        ...(signal !== undefined && { signal }),
        // Persist each tool call result in real-time so interrupted tasks can resume
        onToolCallComplete: async (result) => {
          const record: TaskToolRecord = {
            callId: result.callId,
            name: result.name,
            success: result.success,
            // Keep only first 500 chars — enough for the agent to understand what happened
            output: result.output.slice(0, 500),
            executedAt: Date.now(),
          };
          // Reload to avoid overwriting concurrent writes from the agent's own update_task calls
          const latest = await this.planStore.load();
          const latestTask = latest?.subgoals
            .find((sg) => sg.id === capturedSubgoalId)
            ?.tasks.find((t) => t.id === capturedTaskId);
          if (latestTask) {
            await this.planStore.updateTask(capturedSubgoalId, capturedTaskId, {
              inProgressTools: [...(latestTask.inProgressTools ?? []), record],
            });
          }
        },
      });

      // Clear inProgressTools now that the task finished (completed or failed).
      // The resultProcess / artifacts fields carry forward what matters.
      const postExecPlan = await this.planStore.load();
      const postExecTask = postExecPlan?.subgoals
        .find((sg) => sg.id === capturedSubgoalId)
        ?.tasks.find((t) => t.id === capturedTaskId);
      if (postExecTask) {
        await this.planStore.updateTask(capturedSubgoalId, capturedTaskId, {
          inProgressTools: [],
        });
      }

      // Reload plan after task execution to pick up update_task writes
      currentPlan = (await this.planStore.load()) ?? currentPlan;
      currentSubgoal = currentPlan.subgoals.find((sg) => sg.id === subgoal.id) ?? currentSubgoal;

      const updatedTask = currentSubgoal.tasks.find((t) => t.id === task.id);
      if (updatedTask?.resultProcess) {
        taskResults.push(`[${task.title}]: ${updatedTask.resultProcess}`);
      }
    }

    // Return empty messages — we no longer accumulate raw conversation across tasks.
    // The calling loop's conversationHistory is intentionally not grown.
    return { messages: [], taskResults };
  }

  private async replanSubgoalTasks(
    subgoal: Subgoal,
    _plan: PlanState,
    reason: string
  ): Promise<readonly PlanTask[]> {
    const completedSummaries = this.serializeCompletedTaskSummaries(subgoal.tasks);
    const priorTaskContext = completedSummaries ? `\n\n${completedSummaries}` : '';

    const response = await this.provider.complete({
      model: this.executionLoop.config.model,
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          content:
            `Replan atomic tasks for this subgoal due to the following reason:\nReason: "${reason}"\nSubgoal: "${subgoal.title}"\nDescription: "${subgoal.description}"` +
            priorTaskContext +
            `\n\nRespond with JSON:\n{ "tasks": [{ "title": string }] }\n\nEach task should be completable in 1-2 tool calls. Create 2-8 tasks.`,
          timestamp: Date.now(),
        },
      ],
      systemPrompt: 'You are a task planner. Respond with JSON only.',
    });

    const parsed = JSON.parse(response.message.content) as {
      tasks: Array<{ title: string }>;
    };

    const tasks: PlanTask[] = parsed.tasks.map((t, i) => ({
      id: `${subgoal.id}-t-r-${i + 1}`,
      index: i + 1,
      title: t.title,
      status: 'pending',
    }));

    await this.planStore.updateSubgoal(subgoal.id, { tasks, status: 'in_progress' });
    return tasks;
  }

  // ── Phase D helpers ───────────────────────────────────────────────────────

  private async verifySubgoal(
    subgoal: Subgoal,
    _plan: PlanState,
    taskResults: string[],
    _sessionId: string,
    _signal?: AbortSignal
  ): Promise<{ passed: boolean; escalateToHuman?: boolean }> {
    const verificationMethod = subgoal.verificationMethod;

    if (!verificationMethod || verificationMethod.mode === 'automated') {
      // Automated: check all tasks completed
      const allCompleted = subgoal.tasks.every((t) => t.status === 'completed');
      return { passed: allCompleted };
    }

    if (verificationMethod.mode === 'human') {
      return { passed: false, escalateToHuman: true };
    }

    // 'llm_judge'
    const artifacts = taskResults.join('\n');
    try {
      const response = await this.verificationProvider.complete({
        model: this.executionLoop.config.model,
        messages: [
          {
            id: randomUUID(),
            role: 'user',
            content:
              `Verify this subgoal was completed correctly.\n` +
              `Subgoal: "${subgoal.title}"\n` +
              `Expected: "${verificationMethod.expectedArtifact ?? verificationMethod.description}"\n` +
              `Actual results:\n${artifacts}\n\n` +
              `Respond with JSON:\n{ "passed": boolean, "confidence": "high"|"medium"|"low", "reasoning": string }`,
            timestamp: Date.now(),
          },
        ],
        systemPrompt: 'You are a verification judge. Respond with JSON only.',
      });

      const parsed = JSON.parse(response.message.content) as {
        passed: boolean;
        confidence: 'high' | 'medium' | 'low';
        reasoning: string;
      };

      if (parsed.confidence === 'low') {
        return { passed: false, escalateToHuman: true };
      }
      return { passed: parsed.passed };
    } catch {
      // On parse error, escalate to human
      return { passed: false, escalateToHuman: true };
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Build a recovery section for a task prompt when the task has inProgressTools.
   * Tells the agent which tools already executed so it avoids repeating side-effects.
   */
  private serializeRecoveryContext(
    inProgressTools: readonly TaskToolRecord[] | undefined
  ): string {
    if (!inProgressTools || inProgressTools.length === 0) return '';

    const lines: string[] = [
      '## ⚠️ Recovery Context',
      'This task was interrupted mid-execution. The following tools already ran — ' +
        'do NOT repeat them unless they are idempotent (e.g. read-only):',
    ];
    for (const record of inProgressTools) {
      const status = record.success ? 'success' : 'failed';
      lines.push(`- **${record.name}** (${status}): ${record.output}`);
    }
    lines.push('Resume from where the task left off.');
    return lines.join('\n');
  }

  private serializePlanToMarkdown(
    plan: PlanState,
    completedSubgoalSummaries?: readonly string[]
  ): string {
    const lines: string[] = [];
    lines.push(`## Current Plan: ${plan.originalGoal}`);
    lines.push(`Status: ${plan.status}`);
    lines.push('');

    if (completedSubgoalSummaries && completedSubgoalSummaries.length > 0) {
      lines.push('## Completed Subgoals');
      for (const summary of completedSubgoalSummaries) {
        lines.push(`- ${summary}`);
      }
      lines.push('');
    }

    for (const sg of plan.subgoals) {
      lines.push(`### ${sg.index}. ${sg.title} [${sg.status}]`);
      lines.push(sg.description);
      for (const task of sg.tasks) {
        lines.push(`  - [${task.status}] ${task.title}`);
      }
    }
    return lines.join('\n');
  }
}

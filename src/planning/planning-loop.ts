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
      let plan = await this.generateInitialPlan(goal, sessionId);
      this.progress(`Plan ready: ${plan.subgoals.length} subgoals.`);
      const conversationHistory: ConversationMessage[] = [];
      let subgoalsCompleted = 0;

      // Phase B + C + D: Per-subgoal loop
      for (const subgoal of plan.subgoals) {
        const sgLabel = `[${subgoal.index}/${plan.subgoals.length}] ${subgoal.title}`;

        // Phase B: Plan verification method + tasks lazily
        this.progress(`Planning subgoal ${sgLabel}...`);
        const verificationMethod = await this.planSubgoalVerification(subgoal, plan);
        await this.planStore.updateSubgoal(subgoal.id, { verificationMethod, status: 'planning' });

        const tasks = await this.planSubgoalTasks(subgoal, plan);
        // planSubgoalTasks already calls updateSubgoal with tasks + 'in_progress'
        void tasks; // tasks stored in plan store; reference suppresses unused-var warning
        this.progress(`Subgoal ${sgLabel} — ${tasks.length} tasks planned.`);

        // Phase C: Execute
        this.progress(`Executing subgoal ${sgLabel}...`);
        await this.planStore.updateSubgoal(subgoal.id, {
          status: 'in_progress',
          startedAt: Date.now(),
        });
        const { messages, taskResults } = await this.executeSubgoal(
          subgoal,
          plan,
          conversationHistory,
          sessionId,
          signal
        );
        conversationHistory.push(...messages);

        // Reload plan after execution (tools may have updated it)
        plan = (await this.planStore.load())!;
        const updatedSubgoal = plan.subgoals.find((sg) => sg.id === subgoal.id)!;

        // Check for triggerReplan
        const replanReflection = plan.reflections.find(
          (r) => r.subgoalId === subgoal.id && r.triggerReplan
        );
        if (replanReflection) {
          this.progress(`Replanning subgoal ${sgLabel}...`);
          await this.replanSubgoalTasks(updatedSubgoal, plan, replanReflection.nextAction);
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
            taskResults,
            sessionId,
            signal
          );

          if (escalateToHuman || (!passed && attempts >= maxAttempts)) {
            this.progress(`Subgoal ${sgLabel} — waiting for human review...`);
            // Human review
            const reviewResult = await this.onHumanReview({
              subgoal: updatedSubgoal,
              taskResults,
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
                conversationHistory,
                sessionId,
                signal
              );
              conversationHistory.push(...reExec.messages);
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
      return {
        success: false,
        subgoalsCompleted: 0,
        totalSubgoals: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
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
    _plan: PlanState
  ): Promise<readonly PlanTask[]> {
    const response = await this.provider.complete({
      model: this.executionLoop.config.model,
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          content: `Plan atomic tasks for this subgoal:\nSubgoal: "${subgoal.title}"\nDescription: "${subgoal.description}"\n\nRespond with JSON:\n{ "tasks": [{ "title": string }] }\n\nEach task should be completable in 1-2 tool calls. Create 2-8 tasks.`,
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

  private async executeSubgoal(
    subgoal: Subgoal,
    plan: PlanState,
    conversationHistory: ConversationMessage[],
    sessionId: string,
    signal?: AbortSignal
  ): Promise<{ messages: ConversationMessage[]; taskResults: string[] }> {
    const planMarkdown = this.serializePlanToMarkdown(plan);
    const planningDocs = await this.loadPlanningDocs();

    const subgoalPrompt =
      `Execute subgoal ${subgoal.index}/${plan.subgoals.length}: ${subgoal.title}\n\n` +
      `${subgoal.description}\n\n` +
      `Use plan_subgoal_tasks to plan your tasks first, then execute them with update_task after each.`;

    // Inject planning docs + current plan state as compactSummary so the agent
    // has the full planning ruleset and live plan context during execution.
    const compactSummary = planningDocs
      ? `${planningDocs}\n\n---\n\n${planMarkdown}`
      : planMarkdown;

    const result = await this.executionLoop.run(subgoalPrompt, {
      sessionId,
      conversationHistory: [...conversationHistory],
      compactSummary,
      ...(signal !== undefined && { signal }),
    });

    // Reload plan to extract task result summaries added during execution
    const updatedPlan = await this.planStore.load();
    const taskResults: string[] = [];
    if (updatedPlan) {
      const sg = updatedPlan.subgoals.find((s) => s.id === subgoal.id);
      if (sg) {
        for (const task of sg.tasks) {
          if (task.resultProcess) {
            taskResults.push(`[${task.title}]: ${task.resultProcess}`);
          }
        }
      }
    }

    return {
      messages: [...result.messages],
      taskResults,
    };
  }

  private async replanSubgoalTasks(
    subgoal: Subgoal,
    _plan: PlanState,
    reason: string
  ): Promise<readonly PlanTask[]> {
    const response = await this.provider.complete({
      model: this.executionLoop.config.model,
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          content: `Replan atomic tasks for this subgoal due to the following reason:\nReason: "${reason}"\nSubgoal: "${subgoal.title}"\nDescription: "${subgoal.description}"\n\nRespond with JSON:\n{ "tasks": [{ "title": string }] }\n\nEach task should be completable in 1-2 tool calls. Create 2-8 tasks.`,
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

  private serializePlanToMarkdown(plan: PlanState): string {
    const lines: string[] = [];
    lines.push(`## Current Plan: ${plan.originalGoal}`);
    lines.push(`Status: ${plan.status}`);
    lines.push('');
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

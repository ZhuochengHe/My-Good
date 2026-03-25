/**
 * Planning plugin handlers.
 *
 * Implements create_plan, plan_subgoal_tasks, update_task, reflect,
 * revise_remaining_tasks, get_plan, and request_human_review operations
 * using the injected planStore from context.
 */

import { randomUUID } from 'crypto';

// ── Module-level human review state ──────────────────────────────────────────

/** @type {{ subgoalId: string; context: string; question: string } | null} */
let _humanReviewRequest = null;

/**
 * Returns the pending human review request, or null if none is set.
 * Called by the PlanningLoop to check for pending reviews.
 *
 * @returns {{ subgoalId: string; context: string; question: string } | null}
 */
export function getHumanReviewRequest() {
  return _humanReviewRequest;
}

/**
 * Clears the pending human review request.
 * Called by the PlanningLoop after the human has responded.
 */
export function clearHumanReviewRequest() {
  _humanReviewRequest = null;
}

// ── Status icon helper ────────────────────────────────────────────────────────

/**
 * Returns a status icon for a task or subgoal status.
 *
 * @param {string} status
 * @returns {string}
 */
function statusIcon(status) {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'in_progress':
      return '🔄';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    default:
      return '❓';
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Creates a new plan with the given goal and subgoals.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with planStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function create_plan(args, context) {
  if (!context.planStore) {
    return { output: 'Plan store not available.' };
  }

  if (!args.goal || typeof args.goal !== 'string' || args.goal.trim() === '') {
    return { output: 'Error: "goal" must be a non-empty string.' };
  }

  if (!Array.isArray(args.subgoals) || args.subgoals.length === 0) {
    return { output: 'Error: "subgoals" must be a non-empty array.' };
  }

  const planId = randomUUID();
  const now = Date.now();

  const subgoals = args.subgoals.map((sg, i) => ({
    id: `sg-${i + 1}`,
    index: i + 1,
    title: sg.title ?? '',
    description: sg.description ?? '',
    status: 'pending',
    tasks: [],
    verificationAttempts: 0,
  }));

  /** @type {import('../../src/types/planning.js').PlanState} */
  const plan = {
    planId,
    sessionId: context.sessionId ?? '',
    originalGoal: args.goal,
    status: 'active',
    subgoals,
    reflections: [],
    createdAt: now,
    updatedAt: now,
  };

  if (args.goalVerification !== undefined && args.goalVerification !== null) {
    plan.goalVerificationMethod = args.goalVerification;
  }

  await context.planStore.save(plan);

  return { output: `Plan created with ${subgoals.length} subgoals. Plan ID: ${planId}` };
}

/**
 * Lazily populates tasks for a subgoal just before executing it.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with planStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function plan_subgoal_tasks(args, context) {
  if (!context.planStore) {
    return { output: 'Plan store not available.' };
  }

  if (!args.subgoalId || typeof args.subgoalId !== 'string') {
    return { output: 'Error: "subgoalId" must be a non-empty string.' };
  }

  if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
    return { output: 'Error: "tasks" must be a non-empty array.' };
  }

  const state = await context.planStore.load();
  if (!state) {
    return { output: 'Error: No active plan found.' };
  }

  const subgoalId = args.subgoalId;

  const newTasks = args.tasks.map((t, i) => ({
    id: `${subgoalId}-t-${i + 1}`,
    index: i + 1,
    title: t.title ?? '',
    status: 'pending',
  }));

  /** @type {Partial<import('../../src/types/planning.js').Subgoal>} */
  const changes = {
    tasks: newTasks,
    status: 'planning',
  };

  if (args.verificationMethod !== undefined && args.verificationMethod !== null) {
    changes.verificationMethod = args.verificationMethod;
  }

  await context.planStore.updateSubgoal(subgoalId, changes);

  return { output: `Planned ${args.tasks.length} tasks for subgoal ${subgoalId}` };
}

/**
 * Updates a task's status and records what actually happened.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with planStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function update_task(args, context) {
  if (!context.planStore) {
    return { output: 'Plan store not available.' };
  }

  if (!args.subgoalId || typeof args.subgoalId !== 'string') {
    return { output: 'Error: "subgoalId" is required.' };
  }

  if (!args.taskId || typeof args.taskId !== 'string') {
    return { output: 'Error: "taskId" is required.' };
  }

  if (!args.status || typeof args.status !== 'string') {
    return { output: 'Error: "status" is required.' };
  }

  /** @type {Partial<import('../../src/types/planning.js').PlanTask>} */
  const changes = { status: args.status };

  if (typeof args.resultProcess === 'string') {
    changes.resultProcess = args.resultProcess;
  }

  try {
    await context.planStore.updateTask(args.subgoalId, args.taskId, changes);
    return { output: `Task ${args.taskId} updated to ${args.status}` };
  } catch (err) {
    if (err instanceof Error) {
      return { output: `Error: ${err.message}` };
    }
    return { output: 'Error: Failed to update task.' };
  }
}

/**
 * Records an observation about the current state.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with planStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function reflect(args, context) {
  if (!context.planStore) {
    return { output: 'Plan store not available.' };
  }

  if (!args.subgoalId || typeof args.subgoalId !== 'string') {
    return { output: 'Error: "subgoalId" is required.' };
  }

  if (!args.observation || typeof args.observation !== 'string') {
    return { output: 'Error: "observation" is required.' };
  }

  if (!args.next_action || typeof args.next_action !== 'string') {
    return { output: 'Error: "next_action" is required.' };
  }

  const triggerReplan = args.trigger_replan === true;

  /** @type {import('../../src/types/planning.js').ReflectionEntry} */
  const entry = {
    id: randomUUID(),
    subgoalId: args.subgoalId,
    timestamp: Date.now(),
    observation: args.observation,
    nextAction: args.next_action,
    triggerReplan,
  };

  if (typeof args.taskId === 'string') {
    entry.taskId = args.taskId;
  }

  await context.planStore.appendReflection(entry);

  return { output: `Reflection recorded. ${triggerReplan ? 'Replan triggered.' : ''}`.trim() };
}

/**
 * Backtracks by clearing pending tasks in a subgoal and replacing with new tasks.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with planStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function revise_remaining_tasks(args, context) {
  if (!context.planStore) {
    return { output: 'Plan store not available.' };
  }

  if (!args.subgoalId || typeof args.subgoalId !== 'string') {
    return { output: 'Error: "subgoalId" is required.' };
  }

  if (!Array.isArray(args.newTasks)) {
    return { output: 'Error: "newTasks" must be an array.' };
  }

  if (!args.reason || typeof args.reason !== 'string') {
    return { output: 'Error: "reason" is required.' };
  }

  const state = await context.planStore.load();
  if (!state) {
    return { output: 'Error: No active plan found.' };
  }

  const subgoal = state.subgoals.find((sg) => sg.id === args.subgoalId);
  if (!subgoal) {
    return { output: `Error: Subgoal "${args.subgoalId}" not found.` };
  }

  const completedTasks = subgoal.tasks.filter((t) => t.status === 'completed');
  const completedCount = completedTasks.length;
  const subgoalId = args.subgoalId;

  const revisedTasks = args.newTasks.map((t, i) => ({
    id: `${subgoalId}-t-r-${i + 1}`,
    index: i + 1,
    title: t.title ?? '',
    status: 'pending',
  }));

  const mergedTasks = [...completedTasks, ...revisedTasks];

  await context.planStore.updateSubgoal(subgoalId, { tasks: mergedTasks });

  return {
    output: `Revised tasks for ${subgoalId}. Reason: ${args.reason}. ${completedCount} completed tasks preserved, ${args.newTasks.length} new tasks planned.`,
  };
}

/**
 * Gets the current plan formatted as markdown.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with planStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function get_plan(args, context) {
  if (!context.planStore) {
    return { output: 'Plan store not available.' };
  }

  const state = await context.planStore.load();
  if (!state) {
    return { output: 'No active plan.' };
  }

  const includeReflections = args.include_reflections === true;
  const createdDate = new Date(state.createdAt).toISOString();

  const lines = [];
  lines.push(`# Plan: ${state.originalGoal}`);
  lines.push(`Status: ${state.status} | Created: ${createdDate}`);
  lines.push('');
  lines.push('## Subgoals');

  for (const sg of state.subgoals) {
    lines.push(`### [${sg.index}] ${sg.title} (${sg.status})`);
    lines.push(sg.description);

    if (sg.verificationMethod) {
      const vm = sg.verificationMethod;
      const vmDesc = vm.description ? ` — ${vm.description}` : '';
      lines.push(`Verification: ${vm.mode}${vmDesc}`);
    }

    if (sg.tasks.length > 0) {
      lines.push('Tasks:');
      for (const task of sg.tasks) {
        const icon = statusIcon(task.status);
        const resultSuffix = task.resultProcess ? ` → ${task.resultProcess}` : '';
        lines.push(`- [${icon}] ${task.title} (id: ${task.id})${resultSuffix}`);
      }
    }

    lines.push('');
  }

  if (includeReflections && state.reflections.length > 0) {
    lines.push('## Reflections');
    for (const r of state.reflections) {
      const ts = new Date(r.timestamp).toISOString();
      const replanFlag = r.triggerReplan ? ' [REPLAN]' : '';
      lines.push(`- [${ts}] Subgoal ${r.subgoalId}: ${r.observation} → ${r.nextAction}${replanFlag}`);
    }
  }

  return { output: lines.join('\n') };
}

/**
 * Requests human review of the current subgoal result. Pauses execution.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {object} context - Tool context with planStore.
 * @returns {Promise<{output: string}>} Handler result.
 */
export async function request_human_review(args, context) {
  if (!context.planStore) {
    return { output: 'Plan store not available.' };
  }

  if (!args.subgoalId || typeof args.subgoalId !== 'string') {
    return { output: 'Error: "subgoalId" is required.' };
  }

  if (!args.context || typeof args.context !== 'string') {
    return { output: 'Error: "context" is required.' };
  }

  if (!args.question || typeof args.question !== 'string') {
    return { output: 'Error: "question" is required.' };
  }

  await context.planStore.updateSubgoal(args.subgoalId, { status: 'awaiting_verification' });

  _humanReviewRequest = {
    subgoalId: args.subgoalId,
    context: args.context,
    question: args.question,
  };

  return {
    output: `Human review requested for subgoal ${args.subgoalId}. Execution paused pending review.`,
  };
}

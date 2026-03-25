/**
 * Planning plugin handler tests.
 *
 * Tests create_plan, plan_subgoal_tasks, update_task, reflect,
 * revise_remaining_tasks, get_plan, and request_human_review handlers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PlanState } from '../../src/types/planning.js';

// ── Mock PlanStore factory ────────────────────────────────────────────────────

function makeMockPlanStore(initialState: PlanState | null = null) {
  let state = initialState;
  return {
    async load() {
      return state;
    },
    async save(plan: PlanState) {
      state = plan;
    },
    async patch(changes: Record<string, unknown>) {
      if (!state) throw new Error('not loaded');
      state = { ...state, ...changes, updatedAt: Date.now() } as PlanState;
      return state;
    },
    async updateSubgoal(id: string, changes: Record<string, unknown>) {
      if (!state) throw new Error('not loaded');
      const idx = state.subgoals.findIndex((sg) => sg.id === id);
      if (idx === -1) throw new Error(`not found: ${id}`);
      const updated = { ...state.subgoals[idx], ...changes };
      state = {
        ...state,
        subgoals: [
          ...state.subgoals.slice(0, idx),
          updated,
          ...state.subgoals.slice(idx + 1),
        ],
      } as unknown as PlanState;
    },
    async updateTask(subgoalId: string, taskId: string, changes: Record<string, unknown>) {
      if (!state) throw new Error('not loaded');
      const sgIdx = state.subgoals.findIndex((sg) => sg.id === subgoalId);
      if (sgIdx === -1) throw new Error(`sg not found: ${subgoalId}`);
      const sg = state.subgoals[sgIdx]!;
      const tIdx = sg.tasks.findIndex((t) => t.id === taskId);
      if (tIdx === -1) throw new Error(`task not found: ${taskId}`);
      const updatedTask = { ...sg.tasks[tIdx], ...changes };
      const updatedSg = {
        ...sg,
        tasks: [...sg.tasks.slice(0, tIdx), updatedTask, ...sg.tasks.slice(tIdx + 1)],
      };
      state = {
        ...state,
        subgoals: [
          ...state.subgoals.slice(0, sgIdx),
          updatedSg,
          ...state.subgoals.slice(sgIdx + 1),
        ],
      } as unknown as PlanState;
    },
    async appendReflection(entry: Record<string, unknown>) {
      if (!state) throw new Error('not loaded');
      state = {
        ...state,
        reflections: [...state.reflections, entry],
      } as unknown as PlanState;
    },
    getState() {
      return state;
    },
  };
}

// ── Handler imports ───────────────────────────────────────────────────────────

import {
  create_plan,
  plan_subgoal_tasks,
  update_task,
  reflect,
  revise_remaining_tasks,
  get_plan,
  request_human_review,
} from '../../plugins/planning/handlers.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a minimal PlanState with one subgoal and no tasks. */
function makePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    planId: 'plan-abc',
    sessionId: 'sess-1',
    originalGoal: 'Build something',
    status: 'active',
    subgoals: [
      {
        id: 'sg-1',
        index: 1,
        title: 'First subgoal',
        description: 'Do the first thing',
        status: 'pending',
        tasks: [],
        verificationAttempts: 0,
      },
    ],
    reflections: [],
    createdAt: 1000000,
    updatedAt: 1000000,
    ...overrides,
  } as unknown as PlanState;
}

/** Builds a PlanState with one subgoal containing two tasks. */
function makePlanWithTasks(): PlanState {
  return makePlanState({
    subgoals: [
      {
        id: 'sg-1',
        index: 1,
        title: 'First subgoal',
        description: 'Do the first thing',
        status: 'planning',
        tasks: [
          { id: 'sg-1-t-1', index: 1, title: 'Task one', status: 'completed' },
          { id: 'sg-1-t-2', index: 2, title: 'Task two', status: 'pending' },
        ],
        verificationAttempts: 0,
      },
    ],
  } as unknown as Partial<PlanState>);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('planning plugin handlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let context: any;

  beforeEach(() => {
    context = {
      sessionId: 'test-session',
      planStore: makeMockPlanStore(),
    };
  });

  // ── create_plan ─────────────────────────────────────────────────────────────

  describe('create_plan', () => {
    it('creates plan with correct structure and subgoal IDs', async () => {
      const result = await create_plan(
        {
          goal: 'Write a blog post',
          sessionId: 'sess-1',
          subgoals: [
            { title: 'Research', description: 'Gather references' },
            { title: 'Draft', description: 'Write first draft' },
          ],
        },
        context,
      );

      expect(result.output).toMatch(/Plan created/i);

      const state = context.planStore.getState();
      expect(state).not.toBeNull();
      expect(state.originalGoal).toBe('Write a blog post');
      expect(state.subgoals).toHaveLength(2);
      expect(state.subgoals[0].id).toBe('sg-1');
      expect(state.subgoals[1].id).toBe('sg-2');
      expect(state.subgoals[0].index).toBe(1);
      expect(state.subgoals[1].index).toBe(2);
      expect(state.subgoals[0].title).toBe('Research');
      expect(state.subgoals[1].title).toBe('Draft');
      expect(state.subgoals[0].status).toBe('pending');
      expect(state.subgoals[0].tasks).toEqual([]);
      expect(state.subgoals[0].verificationAttempts).toBe(0);
      expect(state.reflections).toEqual([]);
      expect(state.planId).toBeDefined();
    });

    it('returns summary string mentioning the plan', async () => {
      const result = await create_plan(
        {
          goal: 'Ship feature X',
          sessionId: 'sess-2',
          subgoals: [
            { title: 'Setup', description: 'Initialize project' },
            { title: 'Build', description: 'Implement feature' },
            { title: 'Test', description: 'Write tests' },
          ],
        },
        context,
      );

      expect(typeof result.output).toBe('string');
      expect(result.output.length).toBeGreaterThan(0);
      // Should mention the plan was created
      expect(result.output).toMatch(/plan/i);
    });

    it('returns error when planStore is unavailable', async () => {
      const result = await create_plan(
        { goal: 'Do something', sessionId: 'x', subgoals: [{ title: 'A', description: 'B' }] },
        { sessionId: 'x' },
      );
      expect(result.output).toMatch(/not available/i);
    });
  });

  // ── plan_subgoal_tasks ──────────────────────────────────────────────────────

  describe('plan_subgoal_tasks', () => {
    it('populates tasks with correct IDs and sets status to planning', async () => {
      context.planStore = makeMockPlanStore(makePlanState());

      const result = await plan_subgoal_tasks(
        {
          subgoalId: 'sg-1',
          tasks: [{ title: 'Step one' }, { title: 'Step two' }],
        },
        context,
      );

      expect(result.output).toMatch(/sg-1/);

      const state = context.planStore.getState();
      const sg = state.subgoals[0];
      expect(sg.status).toBe('planning');
      expect(sg.tasks).toHaveLength(2);
      expect(sg.tasks[0].id).toBe('sg-1-t-1');
      expect(sg.tasks[1].id).toBe('sg-1-t-2');
      expect(sg.tasks[0].index).toBe(1);
      expect(sg.tasks[1].index).toBe(2);
      expect(sg.tasks[0].title).toBe('Step one');
      expect(sg.tasks[0].status).toBe('pending');
    });

    it('returns error when no plan exists', async () => {
      const result = await plan_subgoal_tasks(
        { subgoalId: 'sg-1', tasks: [{ title: 'A' }] },
        context,
      );
      expect(result.output).toMatch(/no active plan|no plan/i);
    });

    it('throws when subgoal is not found', async () => {
      context.planStore = makeMockPlanStore(makePlanState());

      // The handler does not catch store errors — they propagate as thrown exceptions
      await expect(
        plan_subgoal_tasks({ subgoalId: 'sg-99', tasks: [{ title: 'A' }] }, context),
      ).rejects.toThrow(/not found/i);
    });
  });

  // ── update_task ─────────────────────────────────────────────────────────────

  describe('update_task', () => {
    it('updates task status and resultProcess', async () => {
      context.planStore = makeMockPlanStore(makePlanWithTasks());

      const result = await update_task(
        {
          subgoalId: 'sg-1',
          taskId: 'sg-1-t-2',
          status: 'completed',
          resultProcess: 'Finished without issues',
        },
        context,
      );

      expect(result.output).toMatch(/sg-1-t-2/);
      expect(result.output).toMatch(/completed/i);

      const state = context.planStore.getState();
      const task = state.subgoals[0].tasks[1];
      expect(task.status).toBe('completed');
      expect(task.resultProcess).toBe('Finished without issues');
    });

    it('updates task to in_progress status', async () => {
      context.planStore = makeMockPlanStore(makePlanWithTasks());

      const result = await update_task(
        { subgoalId: 'sg-1', taskId: 'sg-1-t-2', status: 'in_progress' },
        context,
      );

      expect(result.output).toMatch(/in_progress/i);

      const state = context.planStore.getState();
      const task = state.subgoals[0].tasks[1];
      expect(task.status).toBe('in_progress');
    });

    it('updates task to completed without resultProcess', async () => {
      context.planStore = makeMockPlanStore(makePlanWithTasks());

      const result = await update_task(
        { subgoalId: 'sg-1', taskId: 'sg-1-t-2', status: 'completed' },
        context,
      );

      expect(result.output).toMatch(/completed/i);

      const state = context.planStore.getState();
      const task = state.subgoals[0].tasks[1];
      expect(task.status).toBe('completed');
    });
  });

  // ── reflect ─────────────────────────────────────────────────────────────────

  describe('reflect', () => {
    it('appends a reflection entry', async () => {
      context.planStore = makeMockPlanStore(makePlanState());

      const result = await reflect(
        {
          subgoalId: 'sg-1',
          observation: 'Found an unexpected dependency',
          next_action: 'Install the missing library',
        },
        context,
      );

      expect(result.output).toMatch(/reflection recorded/i);

      const state = context.planStore.getState();
      expect(state.reflections).toHaveLength(1);
      const entry = state.reflections[0];
      expect(entry.subgoalId).toBe('sg-1');
      expect(entry.observation).toBe('Found an unexpected dependency');
      expect(entry.nextAction).toBe('Install the missing library');
      expect(entry.triggerReplan).toBe(false);
      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeTypeOf('number');
    });

    it('sets triggerReplan to true when requested', async () => {
      context.planStore = makeMockPlanStore(makePlanState());

      const result = await reflect(
        {
          subgoalId: 'sg-1',
          observation: 'Plan is wrong',
          next_action: 'Replan everything',
          trigger_replan: true,
        },
        context,
      );

      expect(result.output).toMatch(/replan/i);

      const state = context.planStore.getState();
      expect(state.reflections[0].triggerReplan).toBe(true);
    });

    it('optionally includes taskId in the reflection', async () => {
      context.planStore = makeMockPlanStore(makePlanState());

      await reflect(
        {
          subgoalId: 'sg-1',
          taskId: 'sg-1-t-1',
          observation: 'Task took longer than expected',
          next_action: 'Continue',
        },
        context,
      );

      const state = context.planStore.getState();
      expect(state.reflections[0].taskId).toBe('sg-1-t-1');
    });
  });

  // ── revise_remaining_tasks ──────────────────────────────────────────────────

  describe('revise_remaining_tasks', () => {
    it('keeps completed tasks and replaces pending with new ones', async () => {
      context.planStore = makeMockPlanStore(makePlanWithTasks());

      const result = await revise_remaining_tasks(
        {
          subgoalId: 'sg-1',
          newTasks: [{ title: 'New approach' }, { title: 'Verify new approach' }],
          reason: 'Original approach was infeasible',
        },
        context,
      );

      expect(result.output).toMatch(/sg-1/);
      expect(result.output).toMatch(/reason|original approach was infeasible/i);

      const state = context.planStore.getState();
      const tasks = state.subgoals[0].tasks;

      // sg-1-t-1 was 'completed' so it should be kept; sg-1-t-2 was 'pending' so dropped
      const completedTask = tasks.find((t: { id: string }) => t.id === 'sg-1-t-1');
      expect(completedTask).toBeDefined();
      expect(completedTask.status).toBe('completed');

      // New tasks should have been appended
      const newTaskTitles = tasks
        .filter((t: { id: string }) => t.id !== 'sg-1-t-1')
        .map((t: { title: string }) => t.title);
      expect(newTaskTitles).toContain('New approach');
      expect(newTaskTitles).toContain('Verify new approach');
    });

    it('returns error when no plan exists', async () => {
      const result = await revise_remaining_tasks(
        { subgoalId: 'sg-1', newTasks: [{ title: 'A' }], reason: 'just because' },
        context,
      );
      expect(result.output).toMatch(/no active plan|no plan/i);
    });

    it('returns error when subgoal is not found', async () => {
      context.planStore = makeMockPlanStore(makePlanState());

      const result = await revise_remaining_tasks(
        { subgoalId: 'sg-99', newTasks: [{ title: 'A' }], reason: 'test' },
        context,
      );
      expect(result.output).toMatch(/not found|error/i);
    });
  });

  // ── get_plan ────────────────────────────────────────────────────────────────

  describe('get_plan', () => {
    it('returns "No active plan." when no plan exists', async () => {
      const result = await get_plan({}, context);
      expect(result.output).toMatch(/no active plan|no plan/i);
    });

    it('returns formatted markdown with subgoals and tasks', async () => {
      context.planStore = makeMockPlanStore(makePlanWithTasks());

      const result = await get_plan({}, context);

      expect(result.output).toContain('Build something');
      expect(result.output).toContain('sg-1');
      expect(result.output).toContain('First subgoal');
      expect(result.output).toContain('Task one');
      expect(result.output).toContain('Task two');
      // Status is represented via emoji icons in the formatted output
      // Verify the subgoal status text is present
      expect(result.output).toContain('planning');
    });

    it('includes reflections when include_reflections=true', async () => {
      const stateWithReflection = {
        ...makePlanWithTasks(),
        reflections: [
          {
            id: 'r-1',
            subgoalId: 'sg-1',
            timestamp: 2000000,
            observation: 'Something notable happened',
            nextAction: 'Adjust the plan',
            triggerReplan: false,
          },
        ],
      } as unknown as PlanState;

      context.planStore = makeMockPlanStore(stateWithReflection);

      const resultWithReflections = await get_plan({ include_reflections: true }, context);
      expect(resultWithReflections.output).toContain('Something notable happened');
      expect(resultWithReflections.output).toContain('Adjust the plan');

      const resultWithout = await get_plan({ include_reflections: false }, context);
      expect(resultWithout.output).not.toContain('Something notable happened');
    });
  });

  // ── request_human_review ────────────────────────────────────────────────────

  describe('request_human_review', () => {
    it('records review request and returns confirmation', async () => {
      context.planStore = makeMockPlanStore(makePlanState());

      const result = await request_human_review(
        {
          subgoalId: 'sg-1',
          context: 'Completed the first draft',
          question: 'Does this meet the requirements?',
        },
        context,
      );

      expect(result.output).toMatch(/human review requested/i);
      expect(result.output).toMatch(/sg-1/);
    });

    it('updates subgoal status to awaiting_verification', async () => {
      context.planStore = makeMockPlanStore(makePlanState());

      await request_human_review(
        {
          subgoalId: 'sg-1',
          context: 'Work is done',
          question: 'Approve?',
        },
        context,
      );

      const state = context.planStore.getState();
      const sg = state.subgoals[0];
      expect(sg.status).toBe('awaiting_verification');
    });

    it('returns error when planStore is unavailable', async () => {
      const result = await request_human_review(
        { subgoalId: 'sg-1', context: 'Done', question: 'OK?' },
        { sessionId: 'x' },
      );
      expect(result.output).toMatch(/not available/i);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { PlanStore } from '../../src/planning/index.js';
import type { PlanState, Subgoal, PlanTask, ReflectionEntry } from '../../src/types/planning.js';

// ── Helpers ────────────────────────────────────────────────────────

function makePlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    planId: 'plan-1',
    sessionId: 'session-1',
    originalGoal: 'Build something great',
    status: 'draft',
    subgoals: [],
    reflections: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeSubgoal(overrides: Partial<Subgoal> = {}): Subgoal {
  return {
    id: 'sg-1',
    index: 1,
    title: 'First subgoal',
    description: 'Do the first thing',
    status: 'pending',
    tasks: [],
    verificationAttempts: 0,
    ...overrides,
  };
}

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'sg-1-t-1',
    index: 1,
    title: 'First task',
    status: 'pending',
    ...overrides,
  };
}

function makeReflection(overrides: Partial<ReflectionEntry> = {}): ReflectionEntry {
  return {
    id: 'ref-1',
    subgoalId: 'sg-1',
    timestamp: 2000,
    observation: 'Everything is going well',
    nextAction: 'Continue as planned',
    triggerReplan: false,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('PlanStore', () => {
  let planPath: string;
  let store: PlanStore;

  beforeEach(() => {
    planPath = join(tmpdir(), 'plan-store-test-' + Date.now() + '.json');
    store = new PlanStore(planPath);
  });

  afterEach(async () => {
    await store.clear().catch(() => undefined);
  });

  // 1. load() returns null when file doesn't exist
  it('load() returns null when file does not exist', async () => {
    const result = await store.load();
    expect(result).toBeNull();
  });

  // 2. save() persists to disk and updates in-memory state
  it('save() persists to disk and updates in-memory state', async () => {
    const plan = makePlan();
    await store.save(plan);

    const raw = await readFile(planPath, 'utf-8');
    const persisted = JSON.parse(raw) as PlanState;
    expect(persisted.planId).toBe('plan-1');
    expect(persisted.originalGoal).toBe('Build something great');

    // in-memory state should also reflect the saved plan
    const loaded = await store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.planId).toBe('plan-1');
  });

  // 3. load() returns in-memory state without re-reading disk
  it('load() returns in-memory state without re-reading disk after save', async () => {
    const plan = makePlan({ originalGoal: 'Original goal' });
    await store.save(plan);

    // Tamper with the file on disk to verify load() doesn't re-read it
    const tampered: PlanState = { ...plan, originalGoal: 'Tampered goal' };
    await readFile(planPath, 'utf-8'); // just confirm file exists
    // Write tampered content directly without going through store
    const { writeFile } = await import('node:fs/promises');
    await writeFile(planPath, JSON.stringify(tampered, null, 2), 'utf-8');

    // load() should still return the in-memory state (original goal)
    const result = await store.load();
    expect(result!.originalGoal).toBe('Original goal');
  });

  // 4. patch() deep-merges changes
  it('patch() deep-merges status and adds a subgoal', async () => {
    const sg = makeSubgoal();
    const plan = makePlan({ subgoals: [sg] });
    await store.save(plan);

    const newSubgoal = makeSubgoal({ id: 'sg-2', index: 2, title: 'Second subgoal' });
    const patched = await store.patch({
      status: 'active',
      subgoals: [sg, newSubgoal],
    });

    expect(patched.status).toBe('active');
    expect(patched.subgoals).toHaveLength(2);
    expect(patched.subgoals[1]!.id).toBe('sg-2');
    // original goal preserved
    expect(patched.originalGoal).toBe('Build something great');
    expect(patched.updatedAt).toBeGreaterThanOrEqual(1000);
  });

  // 5. patch() throws if state not loaded
  it('patch() throws if state is not loaded', async () => {
    await expect(store.patch({ status: 'active' })).rejects.toThrow(
      'PlanStore: state not loaded'
    );
  });

  // 6. updateSubgoal() updates a subgoal by id
  it('updateSubgoal() updates a subgoal by id', async () => {
    const sg = makeSubgoal({ status: 'pending' });
    await store.save(makePlan({ subgoals: [sg] }));

    await store.updateSubgoal('sg-1', { status: 'in_progress', startedAt: 5000 });

    const state = await store.load();
    expect(state!.subgoals[0]!.status).toBe('in_progress');
    expect(state!.subgoals[0]!.startedAt).toBe(5000);
    // title preserved
    expect(state!.subgoals[0]!.title).toBe('First subgoal');
  });

  // 7. updateSubgoal() throws if subgoal not found
  it('updateSubgoal() throws if subgoal not found', async () => {
    await store.save(makePlan());
    await expect(store.updateSubgoal('nonexistent', { status: 'completed' })).rejects.toThrow(
      'subgoal with id "nonexistent" not found'
    );
  });

  // 8. updateTask() updates a task within a subgoal
  it('updateTask() updates a task within a subgoal', async () => {
    const task = makeTask({ status: 'pending' });
    const sg = makeSubgoal({ tasks: [task] });
    await store.save(makePlan({ subgoals: [sg] }));

    await store.updateTask('sg-1', 'sg-1-t-1', { status: 'completed', completedAt: 9000 });

    const state = await store.load();
    const updatedTask = state!.subgoals[0]!.tasks[0]!;
    expect(updatedTask.status).toBe('completed');
    expect(updatedTask.completedAt).toBe(9000);
    // title preserved
    expect(updatedTask.title).toBe('First task');
  });

  // 9. updateTask() throws if subgoal not found
  it('updateTask() throws if subgoal not found', async () => {
    await store.save(makePlan());
    await expect(
      store.updateTask('nonexistent-sg', 'sg-1-t-1', { status: 'completed' })
    ).rejects.toThrow('subgoal with id "nonexistent-sg" not found');
  });

  // 10. updateTask() throws if task not found
  it('updateTask() throws if task not found', async () => {
    const sg = makeSubgoal({ tasks: [] });
    await store.save(makePlan({ subgoals: [sg] }));

    await expect(
      store.updateTask('sg-1', 'nonexistent-task', { status: 'completed' })
    ).rejects.toThrow('task with id "nonexistent-task" not found');
  });

  // 11. appendReflection() appends to reflections array
  it('appendReflection() appends to reflections array', async () => {
    await store.save(makePlan({ reflections: [] }));

    const r1 = makeReflection({ id: 'ref-1' });
    const r2 = makeReflection({ id: 'ref-2', observation: 'Second observation' });

    await store.appendReflection(r1);
    await store.appendReflection(r2);

    const state = await store.load();
    expect(state!.reflections).toHaveLength(2);
    expect(state!.reflections[0]!.id).toBe('ref-1');
    expect(state!.reflections[1]!.id).toBe('ref-2');
  });

  // 12. appendReflection() throws if not loaded
  it('appendReflection() throws if state is not loaded', async () => {
    await expect(store.appendReflection(makeReflection())).rejects.toThrow(
      'PlanStore: state not loaded'
    );
  });

  // 13. clear() sets state to null and removes file
  it('clear() sets state to null and removes file from disk', async () => {
    await store.save(makePlan());

    // Confirm file exists
    await expect(access(planPath)).resolves.toBeUndefined();

    await store.clear();

    // File should be gone
    await expect(access(planPath)).rejects.toThrow();

    // In-memory state should be null
    // A fresh load from a non-existent path should return null
    const result = await store.load();
    expect(result).toBeNull();
  });

  // 14. save() writes atomically (file exists after save)
  it('save() writes atomically so the file is present after save', async () => {
    const plan = makePlan({ planId: 'atomic-test' });
    await store.save(plan);

    // File must exist and be parseable
    const raw = await readFile(planPath, 'utf-8');
    const parsed = JSON.parse(raw) as PlanState;
    expect(parsed.planId).toBe('atomic-test');

    // Temp file should NOT remain on disk
    await expect(access(`${planPath}.tmp`)).rejects.toThrow();
  });
});

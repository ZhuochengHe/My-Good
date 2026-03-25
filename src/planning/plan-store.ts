import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import type { PlanState, Subgoal, PlanTask, ReflectionEntry, DeepPartial } from '../types/planning.js';

function deepMerge<T extends object>(base: T, changes: DeepPartial<T>): T {
  const result = { ...base } as Record<string, unknown>;

  for (const key of Object.keys(changes) as Array<keyof typeof changes>) {
    const incomingVal = changes[key];
    if (incomingVal === undefined) continue;

    const baseVal = (base as Record<string, unknown>)[key as string];

    if (Array.isArray(incomingVal)) {
      // For arrays, use incoming value directly (do not concatenate)
      result[key as string] = incomingVal;
    } else if (
      incomingVal !== null &&
      typeof incomingVal === 'object' &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key as string] = deepMerge(
        baseVal as object,
        incomingVal as DeepPartial<object>
      );
    } else {
      result[key as string] = incomingVal;
    }
  }

  return result as T;
}

export class PlanStore {
  private state: PlanState | null = null;

  constructor(readonly planPath: string) {}

  /**
   * Returns in-memory state if already loaded; otherwise reads from disk.
   * Returns null if file doesn't exist.
   */
  async load(): Promise<PlanState | null> {
    if (this.state !== null) {
      return this.state;
    }

    try {
      const raw = await readFile(this.planPath, 'utf-8');
      this.state = JSON.parse(raw) as PlanState;
      return this.state;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Writes memory first, then atomically persists to disk using .tmp -> rename.
   */
  async save(plan: PlanState): Promise<void> {
    this.state = plan;
    const tmpPath = `${this.planPath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(plan, null, 2), 'utf-8');
    await rename(tmpPath, this.planPath);
  }

  /**
   * Deep merge changes into current state; throws if not loaded.
   */
  async patch(changes: DeepPartial<PlanState>): Promise<PlanState> {
    if (this.state === null) {
      throw new Error('PlanStore: state not loaded. Call load() first.');
    }

    const merged = deepMerge(this.state, {
      ...changes,
      updatedAt: Date.now(),
    } as DeepPartial<PlanState>);

    await this.save(merged);
    return merged;
  }

  /**
   * Update a subgoal by id; preserves existing fields not in changes.
   */
  async updateSubgoal(id: string, changes: Partial<Subgoal>): Promise<void> {
    if (this.state === null) {
      throw new Error('PlanStore: state not loaded. Call load() first.');
    }

    const idx = this.state.subgoals.findIndex((sg) => sg.id === id);
    if (idx === -1) {
      throw new Error(`PlanStore: subgoal with id "${id}" not found.`);
    }

    const updated: Subgoal = { ...this.state.subgoals[idx]!, ...changes };

    const newSubgoals = [
      ...this.state.subgoals.slice(0, idx),
      updated,
      ...this.state.subgoals.slice(idx + 1),
    ];

    await this.save({
      ...this.state,
      subgoals: newSubgoals,
      updatedAt: Date.now(),
    });
  }

  /**
   * Update a task within a subgoal; throws if subgoal or task not found.
   */
  async updateTask(subgoalId: string, taskId: string, changes: Partial<PlanTask>): Promise<void> {
    if (this.state === null) {
      throw new Error('PlanStore: state not loaded. Call load() first.');
    }

    const sgIdx = this.state.subgoals.findIndex((sg) => sg.id === subgoalId);
    if (sgIdx === -1) {
      throw new Error(`PlanStore: subgoal with id "${subgoalId}" not found.`);
    }

    const subgoal = this.state.subgoals[sgIdx]!;
    const taskIdx = subgoal.tasks.findIndex((t) => t.id === taskId);
    if (taskIdx === -1) {
      throw new Error(`PlanStore: task with id "${taskId}" not found in subgoal "${subgoalId}".`);
    }

    const updatedTask: PlanTask = { ...subgoal.tasks[taskIdx]!, ...changes };

    const newTasks = [
      ...subgoal.tasks.slice(0, taskIdx),
      updatedTask,
      ...subgoal.tasks.slice(taskIdx + 1),
    ];

    const updatedSubgoal: Subgoal = { ...subgoal, tasks: newTasks };

    const newSubgoals = [
      ...this.state.subgoals.slice(0, sgIdx),
      updatedSubgoal,
      ...this.state.subgoals.slice(sgIdx + 1),
    ];

    await this.save({
      ...this.state,
      subgoals: newSubgoals,
      updatedAt: Date.now(),
    });
  }

  /**
   * Append to reflections array; throws if not loaded.
   */
  async appendReflection(entry: ReflectionEntry): Promise<void> {
    if (this.state === null) {
      throw new Error('PlanStore: state not loaded. Call load() first.');
    }

    await this.save({
      ...this.state,
      reflections: [...this.state.reflections, entry],
      updatedAt: Date.now(),
    });
  }

  /**
   * Sets in-memory state to null and deletes the file if it exists.
   */
  async clear(): Promise<void> {
    this.state = null;
    try {
      await unlink(this.planPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

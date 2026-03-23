/**
 * MemBench adapter wrapping the current (v1) JsonMemoryStore.
 *
 * Maps the MemBench BaseMemory interface (store / recall / retri / reset) to
 * the existing layer-based MemoryStore.  This is a **baseline** adapter that
 * uses the current text-substring search — no embedding support yet.
 *
 * Interface contract:
 *   store(message, stepId)  → saves raw message as a layer-2 entry; sets
 *                             sourceRef to String(stepId) for retri()
 *   recall(question)        → substring-searches all entries, returns content
 *                             of top-10 hits joined by newline
 *   retri(question)         → same search, returns sourceRef values as integers
 *                             (for Recall@10 computation)
 *   reset()                 → deletes ALL entries across all three layers
 *
 * Layer choice rationale:
 *   Layer 2 is used for all benchmark entries (persistent on-demand, no TTL).
 *   All three layers are cleared on reset() to guarantee a clean slate.
 */

import { JsonMemoryStore } from '../../src/memory/memory-store.js';
import { randomUUID } from 'crypto';
import type { MemoryEntry } from '../../src/types/memory.js';

/** Layer assigned to all MemBench entries. */
const BENCH_LAYER = 2 as const;

/** Number of entries returned per recall/retri call. */
const TOP_K = 10;

/** Creates a MemoryEntry for a MemBench message step. */
function makeBenchEntry(message: string, stepId: number): MemoryEntry {
  const now = Date.now();
  return {
    id: randomUUID(),
    layer: BENCH_LAYER,
    content: message,
    tags: ['membench'],
    sourceRef: String(stepId),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Adapter that wraps JsonMemoryStore to implement the MemBench BaseMemory
 * interface.
 */
export class MemBenchAdapter {
  private readonly memoryStore: JsonMemoryStore;

  constructor(store: JsonMemoryStore) {
    this.memoryStore = store;
  }

  /**
   * Writes one conversation step to the store.
   * Called once per step during the store phase of a MemBench trajectory.
   *
   * @param message - Formatted message string provided by MemBench env.step()
   * @param stepId  - Integer step index assigned by MemBench (stored in sourceRef)
   */
  async store(message: string, stepId: number): Promise<void> {
    const entry = makeBenchEntry(message, stepId);
    await this.memoryStore.save(entry);
  }

  /**
   * Returns up to TOP_K memory entries most relevant to the question,
   * formatted as a single newline-separated context string.
   *
   * The current implementation uses case-insensitive substring search
   * (v1 baseline — no embeddings).  Empty keyword match falls back to
   * recency-sorted entries.
   *
   * @param question - The MemBench question string (may include time info)
   * @returns Context string to feed into the LLM answer step
   */
  async recall(question: string): Promise<string> {
    const results = await this.memoryStore.search({
      query: question,
      limit: TOP_K,
    });
    if (results.length === 0) {
      // Fallback: return most recent TOP_K entries — better than empty context.
      const recent = await this.memoryStore.search({ limit: TOP_K });
      return recent.map(e => e.content).join('\n');
    }
    return results.map(e => e.content).join('\n');
  }

  /**
   * Returns the sourceRef (step IDs) of the top-K entries retrieved for the
   * question.  Used to compute the Recall@10 metric.
   *
   * @param question - Same question string passed to recall()
   * @returns Array of integer step IDs from retrieved entries
   */
  async retri(question: string): Promise<number[]> {
    const results = await this.memoryStore.search({
      query: question,
      limit: TOP_K,
    });
    return results
      .filter(e => e.sourceRef !== undefined)
      .map(e => parseInt(e.sourceRef as string, 10))
      .filter(n => !isNaN(n));
  }

  /**
   * Clears all memory entries across all layers.
   * Called between trajectories to reset state.
   */
  async reset(): Promise<void> {
    for (const layer of [1, 2, 3] as const) {
      const entries = await this.memoryStore.search({ layer, limit: 100_000 });
      await Promise.all(entries.map(e => this.memoryStore.delete(e.id)));
    }
  }
}

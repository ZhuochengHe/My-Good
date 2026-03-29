/**
 * MemBench adapter wrapping the JsonMemoryStore (v2, kind-based API).
 *
 * Maps the MemBench BaseMemory interface (store / recall / retri / reset) to
 * the kind-based MemoryStore.
 *
 * When an OpenAI client is provided:
 *   - storeBatch() embeds all messages in one API call (input: string[])
 *   - recall/retri embed the query and rank by cosine similarity
 * Without a client, falls back to substring search.
 *
 * Interface contract:
 *   storeBatch(steps)       → embeds all messages in one API call, saves entries
 *   store(message, stepId)  → single-entry fallback (used when batching is not possible)
 *   recall(question)        → embedding or substring search, top-10 joined by newline
 *   retri(question)         → same search, returns sourceRef integers for Recall@10
 *   reset()                 → deletes all entry files directly + clears embedding index
 */

import { JsonMemoryStore } from '../../src/memory/memory-store.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { MemoryEntry, MemoryKind, EmbeddingIndex } from '../../src/types/memory.js';
import type OpenAI from 'openai';

/** Kind assigned to all MemBench entries. */
const BENCH_KIND: MemoryKind = 'semantic';

/** All kinds to clear during reset(). */
const ALL_KINDS: MemoryKind[] = ['preference', 'experiential', 'semantic', 'episodic'];

/** Number of entries returned per recall/retri call. */
const TOP_K = 10;

/** OpenAI embedding model. */
const EMBED_MODEL = 'text-embedding-3-small';

/**
 * Embeds a batch of texts in a single API call.
 * Returns vectors in the same order as the input array.
 */
async function embedBatch(client: OpenAI, texts: string[]): Promise<number[][]> {
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  // API guarantees results are ordered by index
  return response.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}

/** Creates a MemoryEntry for a MemBench message step. */
function makeBenchEntry(message: string, stepId: number, embedding?: number[]): MemoryEntry {
  const now = Date.now();
  return {
    id: randomUUID(),
    kind: BENCH_KIND,
    content: message,
    tags: ['membench'],
    sourceRef: String(stepId),
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    ...(embedding !== undefined ? { embedding } : {}),
  };
}

/**
 * Adapter that wraps JsonMemoryStore to implement the MemBench BaseMemory interface.
 *
 * @param store          - Backing memory store
 * @param baseDir        - Root directory of the memory store (used for fast reset)
 * @param client         - Optional OpenAI client; enables embedding search when provided
 * @param embeddingIndex - Embedding index instance; used for bulk clear on reset()
 */
export class MemBenchAdapter {
  private readonly memoryStore: JsonMemoryStore;
  private readonly baseDir: string;
  private readonly openai: OpenAI | undefined;
  private readonly embeddingIndex: EmbeddingIndex | undefined;

  constructor(
    store: JsonMemoryStore,
    baseDir: string,
    client?: OpenAI,
    embeddingIndex?: EmbeddingIndex,
  ) {
    this.memoryStore = store;
    this.baseDir = baseDir;
    this.openai = client;
    this.embeddingIndex = embeddingIndex;
  }

  /**
   * Writes all conversation steps for one trajectory in a single embedding call.
   * All messages are embedded in one batched API request, then saved concurrently.
   * Use this instead of calling store() in a loop.
   *
   * @param steps - Array of {message, stepId} pairs for the trajectory
   */
  async storeBatch(steps: Array<{ message: string; stepId: number }>): Promise<void> {
    if (steps.length === 0) return;

    let embeddings: number[][] | undefined;
    if (this.openai) {
      embeddings = await embedBatch(this.openai, steps.map(s => s.message));
    }

    await Promise.all(
      steps.map((s, i) => {
        const entry = makeBenchEntry(s.message, s.stepId, embeddings?.[i]);
        return this.memoryStore.save(entry);
      })
    );
  }

  /**
   * Writes one conversation step to the store.
   * Prefer storeBatch() for trajectory-level writes.
   */
  async store(message: string, stepId: number): Promise<void> {
    let embedding: number[] | undefined;
    if (this.openai) {
      [embedding] = await embedBatch(this.openai, [message]);
    }
    const entry = makeBenchEntry(message, stepId, embedding);
    await this.memoryStore.save(entry);
  }

  /**
   * Returns up to TOP_K memory entries most relevant to the question,
   * formatted as a newline-separated context string.
   */
  async recall(question: string): Promise<string> {
    const results = await this.searchFor(question);
    if (results.length === 0) {
      const recent = await this.memoryStore.search({ limit: TOP_K });
      return recent.map(e => e.content).join('\n');
    }
    return results.map(e => e.content).join('\n');
  }

  /**
   * Returns the sourceRef (step IDs) of the top-K retrieved entries.
   * Used to compute the Recall@10 metric.
   */
  async retri(question: string): Promise<number[]> {
    let results = await this.searchFor(question);
    if (results.length === 0) {
      results = await this.memoryStore.search({ limit: TOP_K });
    }
    return results
      .filter(e => e.sourceRef !== undefined)
      .map(e => parseInt(e.sourceRef as string, 10))
      .filter(n => !isNaN(n));
  }

  /**
   * Clears all memory entries and the embedding index for the next trajectory.
   *
   * Bypasses store.delete() entirely — directly unlinks all .json entry files
   * from each kind directory, then calls embeddingIndex.clear() once.
   * This avoids N sequential writes to embeddings.json (one per deleted entry).
   */
  async reset(): Promise<void> {
    await Promise.all(
      ALL_KINDS.map(async kind => {
        const dir = path.join(this.baseDir, kind);
        let names: string[];
        try {
          names = await fs.readdir(dir);
        } catch {
          return; // directory doesn't exist yet — nothing to clear
        }
        await Promise.all(
          names
            .filter(n => n.endsWith('.json') && !n.endsWith('.tmp.json'))
            .map(n => fs.unlink(path.join(dir, n)).catch(() => undefined))
        );
      })
    );
    if (this.embeddingIndex) {
      await this.embeddingIndex.clear();
    }
  }

  /**
   * Performs hybrid (HNSW cosine + BM25-TF + tag boost) search when an OpenAI
   * client is available, or pure substring search as fallback.
   *
   * Passing both `queryEmbedding` and `query` activates the full hybrid scoring
   * path in JsonMemoryStore: HNSW narrows to top-K candidates by cosine, then
   * BM25-TF re-ranks them using keyword overlap with the question.
   *
   * Shared by recall() and retri().
   */
  private async searchFor(question: string): Promise<readonly MemoryEntry[]> {
    if (this.openai) {
      const [queryEmbedding] = await embedBatch(this.openai, [question]);
      return this.memoryStore.search({ queryEmbedding, query: question, limit: TOP_K });
    }
    return this.memoryStore.search({ query: question, limit: TOP_K });
  }
}

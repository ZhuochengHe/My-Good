/**
 * A5: session list() latency vs. session count.
 *
 * list() serially calls load() for every .jsonl file in the sessions directory.
 * This benchmark quantifies the O(n) degradation — the "before" baseline for
 * a Promise.all parallelization refactor.
 *
 * Three scales: 10 / 50 / 200 sessions.
 * Each session has 5 messages so the file sizes are representative.
 *
 * Run: npx vitest bench tests/bench/session-list.bench.ts
 */

import { describe, bench, beforeAll, afterAll } from 'vitest';
import { JsonlSessionStore } from '../../src/session/jsonl-store.js';
import type { Session } from '../../src/types/sessions.js';
import type { ConversationMessage } from '../../src/types/messages.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

function makeSession(n: number): Session {
  const now = Date.now();
  const id = `bench-${String(n).padStart(6, '0')}`;
  const messages: ConversationMessage[] = Array.from({ length: 5 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i} in session ${n}: sample content for benchmark purposes.`,
  } as ConversationMessage));

  return { id, agentId: 'bench-agent', messages, createdAt: now, updatedAt: now, metadata: {} };
}

async function buildStore(n: number, dir: string): Promise<JsonlSessionStore> {
  const store = new JsonlSessionStore(dir);
  // Save sessions in parallel — setup time is not benchmarked
  await Promise.all(Array.from({ length: n }, (_, i) => store.save(makeSession(i))));
  return store;
}

describe('A5: session list() latency vs. session count', () => {
  let store10: JsonlSessionStore;
  let store50: JsonlSessionStore;
  let store200: JsonlSessionStore;
  const dirs: string[] = [];

  beforeAll(async () => {
    const [d10, d50, d200] = await Promise.all([
      fs.mkdtemp(path.join(tmpdir(), 'bench-list-10-')),
      fs.mkdtemp(path.join(tmpdir(), 'bench-list-50-')),
      fs.mkdtemp(path.join(tmpdir(), 'bench-list-200-')),
    ]);
    dirs.push(d10, d50, d200);

    [store10, store50, store200] = await Promise.all([
      buildStore(10, d10),
      buildStore(50, d50),
      buildStore(200, d200),
    ]);
  }, 60_000);

  afterAll(async () => {
    await Promise.all(dirs.map(d => fs.rm(d, { recursive: true, force: true })));
  });

  const OPTS = { iterations: 30, warmupIterations: 5, time: 0 };

  bench('list() @ 10 sessions', async () => {
    await store10.list();
  }, OPTS);

  bench('list() @ 50 sessions', async () => {
    await store50.list();
  }, OPTS);

  bench('list() @ 200 sessions', async () => {
    await store200.list();
  }, OPTS);
});

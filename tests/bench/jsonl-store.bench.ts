/**
 * A3: appendMessage latency vs. session length.
 *
 * Creates sessions with 10 / 100 / 1000 pre-existing messages (using save()),
 * then times a single appendMessage() call against each steady state.
 *
 * Expected: linear growth in latency (full-file rewrite each append).
 * This provides the "before" baseline for the B3 O(n)→O(1) refactor.
 *
 * Run: npx vitest bench tests/bench/jsonl-store.bench.ts
 */

import { describe, bench, beforeAll, afterAll } from 'vitest';
import { JsonlSessionStore } from '../../src/session/jsonl-store.js';
import type { Session } from '../../src/types/sessions.js';
import type { ConversationMessage } from '../../src/types/messages.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

function makeSession(id: string, messageCount: number): Session {
  const now = Date.now();
  const messages: ConversationMessage[] = Array.from({ length: messageCount }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i}: the quick brown fox jumps over the lazy dog. This is sample content to simulate realistic session data for benchmarking purposes.`,
  } as ConversationMessage));

  return {
    id,
    agentId: 'bench-agent',
    messages,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  };
}

const appendMsg: ConversationMessage = {
  role: 'user',
  content: 'Benchmark append message: measuring the cost of a full-file rewrite.',
} as ConversationMessage;

describe('A3: appendMessage latency vs. session length', () => {
  let store: JsonlSessionStore;
  let dir: string;

  const SESSION_10   = 'bench-session-10';
  const SESSION_100  = 'bench-session-100';
  const SESSION_1000 = 'bench-session-1000';

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), 'bench-jsonl-'));
    store = new JsonlSessionStore(dir);

    await Promise.all([
      store.save(makeSession(SESSION_10,   10)),
      store.save(makeSession(SESSION_100,  100)),
      store.save(makeSession(SESSION_1000, 1000)),
    ]);
  }, 60_000);

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const OPTS = { iterations: 30, warmupIterations: 5, time: 0 };

  bench('appendMessage @ 10-message session', async () => {
    await store.appendMessage(SESSION_10, appendMsg);
  }, OPTS);

  bench('appendMessage @ 100-message session', async () => {
    await store.appendMessage(SESSION_100, appendMsg);
  }, OPTS);

  bench('appendMessage @ 1000-message session', async () => {
    await store.appendMessage(SESSION_1000, appendMsg);
  }, OPTS);
});

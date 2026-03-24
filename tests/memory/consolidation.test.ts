/**
 * Tests for the memory consolidation pipeline.
 *
 * - Pure functions (chunkMessages, cosineSimilarity) are unit-tested directly.
 * - consolidate() is tested with a mocked OpenAI client and a real JsonMemoryStore
 *   backed by a temp directory.
 * - Deduplication paths (duplicate/related/new) are tested via a mock EmbeddingIndex.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

import {
  chunkMessages,
  cosineSimilarity,
  consolidate,
} from '../../src/memory/consolidation.js';
import { JsonMemoryStore } from '../../src/memory/memory-store.js';
import type { EmbeddingIndex } from '../../src/types/memory.js';
import type { ConversationMessage } from '../../src/types/messages.js';
import { createMemoryEntry } from '../../src/types/memory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserMsg(content: string): ConversationMessage {
  return { id: randomUUID(), role: 'user', content, timestamp: Date.now() };
}

function makeAssistantMsg(content: string): ConversationMessage {
  return {
    id: randomUUID(),
    role: 'assistant',
    content,
    stopReason: 'end_turn',
    timestamp: Date.now(),
  };
}

function makeTempDir(): string {
  return path.join(tmpdir(), `consolidation-test-${randomUUID()}`);
}

/** Builds a mock EmbeddingIndex that returns controllable searchByCosine results. */
function makeMockEmbeddingIndex(
  searchResults: Array<{ id: string; score: number }> = []
): EmbeddingIndex {
  return {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    searchByCosine: vi.fn().mockResolvedValue(searchResults),
  };
}

// ---------------------------------------------------------------------------
// chunkMessages
// ---------------------------------------------------------------------------

describe('chunkMessages', () => {
  it('returns empty array for empty input', () => {
    expect(chunkMessages([])).toEqual([]);
  });

  it('returns empty array when only tool messages are present', () => {
    const toolMsgs = Array.from({ length: 5 }, (_, i) => ({
      ...makeUserMsg(`tool result ${i}`),
      role: 'tool' as const,
    }));
    expect(chunkMessages(toolMsgs)).toEqual([]);
  });

  it('returns a single chunk when all messages fit within the token budget', () => {
    // Short messages — far below 3000 token limit
    const msgs = Array.from({ length: 10 }, (_, i) => makeUserMsg(`msg ${i}`));
    const chunks = chunkMessages(msgs);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(10);
  });

  it('splits into multiple chunks when token budget is exceeded', () => {
    // Each message is ~1000 tokens. "word " repeated 1000 times ≈ 1000 tokens
    // (each "word" is one token, space sometimes merges). 4 such messages exceed 3000.
    const bigContent = 'word '.repeat(1000).trim();
    const msgs = Array.from({ length: 8 }, () => makeUserMsg(bigContent));
    const chunks = chunkMessages(msgs);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('produces overlapping chunks (last messages of chunk N appear at start of chunk N+1)', () => {
    const bigContent = 'word '.repeat(1000).trim();
    const msgs = Array.from({ length: 8 }, (_, i) => ({
      ...makeUserMsg(bigContent),
      content: `msg${i} ` + 'word '.repeat(900).trim(),
    }));
    const chunks = chunkMessages(msgs);
    if (chunks.length < 2) return;
    // The last message of chunk 0 should appear somewhere in chunk 1 (overlap)
    const lastOfFirst = chunks[0]![chunks[0]!.length - 1]!.id;
    const idsInSecond = new Set(chunks[1]!.map(m => m.id));
    expect(idsInSecond.has(lastOfFirst)).toBe(true);
  });

  it('covers all messages across chunks (no message dropped)', () => {
    const bigContent = 'word '.repeat(1000).trim();
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      ...makeUserMsg(bigContent),
      content: `msg${i} ` + 'word '.repeat(900).trim(),
    }));
    const chunks = chunkMessages(msgs);
    const allIds = new Set(msgs.map(m => m.id));
    const seenIds = new Set(chunks.flatMap(c => c.map(m => m.id)));
    for (const id of allIds) {
      expect(seenIds.has(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it('returns 0 when a vector has zero magnitude', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns partial score for partially aligned vectors', () => {
    const sim = cosineSimilarity([1, 1, 0], [1, 0, 0]);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// consolidate — mocked OpenAI
// ---------------------------------------------------------------------------

// Mock the entire openai module. We intercept both chat.completions.create
// (for extraction/merge) and embeddings.create (for vectorisation).
vi.mock('openai', () => {
  const mockChatCreate = vi.fn();
  const mockEmbeddingsCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockChatCreate } },
      embeddings: { create: mockEmbeddingsCreate },
    })),
    __mockChatCreate: mockChatCreate,
    __mockEmbeddingsCreate: mockEmbeddingsCreate,
  };
});

async function getMocks() {
  const openai = await import('openai');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = openai as any;
  return {
    chatCreate: m.__mockChatCreate as ReturnType<typeof vi.fn>,
    embeddingsCreate: m.__mockEmbeddingsCreate as ReturnType<typeof vi.fn>,
  };
}

/** A dummy embedding vector (dim=3 for test simplicity). */
const DUMMY_VEC = [0.1, 0.2, 0.3];

/** Default embedding mock that returns DUMMY_VEC for any input. */
function mockEmbedding(embeddingsCreate: ReturnType<typeof vi.fn>) {
  embeddingsCreate.mockResolvedValue({ data: [{ embedding: DUMMY_VEC }] });
}

/** Returns a chat mock response wrapping an extraction payload. */
function extractionResponse(memories: object[]) {
  return {
    choices: [{ message: { content: JSON.stringify({ memories }) } }],
  };
}

describe('consolidate', () => {
  let tempDir: string;
  let store: JsonMemoryStore;

  beforeEach(async () => {
    tempDir = makeTempDir();
    store = new JsonMemoryStore(tempDir);
    const { chatCreate, embeddingsCreate } = await getMocks();
    chatCreate.mockReset();
    embeddingsCreate.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ---- guard conditions ----

  it('does nothing when apiKey is empty', async () => {
    const { chatCreate } = await getMocks();
    await consolidate([makeUserMsg('hello')], store, { apiKey: '' });
    expect(chatCreate).not.toHaveBeenCalled();
    expect(await store.search({})).toHaveLength(0);
  });

  it('does nothing when messages array is empty', async () => {
    const { chatCreate } = await getMocks();
    await consolidate([], store, { apiKey: 'test-key' });
    expect(chatCreate).not.toHaveBeenCalled();
  });

  // ---- basic extraction + save ----

  it('saves an extracted memory to the store', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    mockEmbedding(embeddingsCreate);
    chatCreate.mockResolvedValue(
      extractionResponse([
        { kind: 'preference', content: 'User prefers concise responses', tags: ['preference'] },
      ])
    );

    await consolidate(
      [makeUserMsg('Keep responses short'), makeAssistantMsg('Will do')],
      store,
      { apiKey: 'test-key' }
    );

    const entries = await store.search({});
    expect(entries).toHaveLength(1);
    expect(entries[0]!.content).toBe('User prefers concise responses');
    expect(entries[0]!.kind).toBe('preference');
    expect(entries[0]!.embedding).toEqual(DUMMY_VEC);
  });

  it('sets ttlDays on episodic entries', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    mockEmbedding(embeddingsCreate);
    chatCreate.mockResolvedValue(
      extractionResponse([
        { kind: 'episodic', content: 'Working on the auth bug fix', tags: ['auth'], ttlDays: 14 },
      ])
    );

    await consolidate(
      [makeUserMsg('Still fixing auth bug'), makeAssistantMsg('Got it')],
      store,
      { apiKey: 'test-key' }
    );

    const entries = await store.search({});
    expect(entries[0]!.ttlDays).toBe(14);
  });

  it('does not set ttlDays on non-episodic entries even if LLM returns one', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    mockEmbedding(embeddingsCreate);
    chatCreate.mockResolvedValue(
      extractionResponse([
        { kind: 'semantic', content: 'Project uses TypeScript strict mode', tags: ['ts'], ttlDays: 30 },
      ])
    );

    await consolidate(
      [makeUserMsg('We use TS strict'), makeAssistantMsg('Noted')],
      store,
      { apiKey: 'test-key' }
    );

    expect((await store.search({}))[0]!.ttlDays).toBeUndefined();
  });

  it('skips memories with invalid kind', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    mockEmbedding(embeddingsCreate);
    chatCreate.mockResolvedValue(
      extractionResponse([
        { kind: 'unknown_kind', content: 'bad', tags: [] },
        { kind: 'semantic', content: 'Valid project fact', tags: ['project'] },
      ])
    );

    await consolidate(
      [makeUserMsg('input'), makeAssistantMsg('output')],
      store,
      { apiKey: 'test-key' }
    );

    const entries = await store.search({});
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe('semantic');
  });

  it('handles LLM returning empty memories array', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    mockEmbedding(embeddingsCreate);
    chatCreate.mockResolvedValue(extractionResponse([]));

    await consolidate([makeUserMsg('hello'), makeAssistantMsg('hi')], store, { apiKey: 'test-key' });
    expect(await store.search({})).toHaveLength(0);
  });

  it('handles LLM JSON parse error gracefully', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    mockEmbedding(embeddingsCreate);
    chatCreate.mockResolvedValue({ choices: [{ message: { content: 'not json {{' } }] });

    await expect(
      consolidate([makeUserMsg('hi'), makeAssistantMsg('hey')], store, { apiKey: 'test-key' })
    ).resolves.toBeUndefined();
  });

  // ---- embedding-based deduplication (with embeddingIndex) ----

  it('merges duplicate entry (cosine > 0.9) and does not create a new one', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    mockEmbedding(embeddingsCreate);

    const existingEntry = createMemoryEntry('preference', 'User prefers brief responses', ['pref']);
    await store.save(existingEntry);

    // searchByCosine returns existing entry with score > 0.9 → merge path
    const embIdx = makeMockEmbeddingIndex([{ id: existingEntry.id, score: 0.95 }]);

    // First call = extraction, second call = merge
    chatCreate
      .mockResolvedValueOnce(
        extractionResponse([
          { kind: 'preference', content: 'User prefers concise responses', tags: ['pref'] },
        ])
      )
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          content: 'User prefers brief, concise responses',
          tags: ['pref', 'style'],
        }) } }],
      });

    await consolidate(
      [makeUserMsg('be brief'), makeAssistantMsg('ok')],
      store,
      { apiKey: 'test-key' },
      embIdx
    );

    const entries = await store.search({});
    // Still only 1 entry — the existing one was updated, no new entry created
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe(existingEntry.id);
    expect(entries[0]!.content).toBe('User prefers brief, concise responses');
  });

  it('saves new entry with relatedTo stub when cosine is 0.8–0.9', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    mockEmbedding(embeddingsCreate);

    const existingEntry = createMemoryEntry('semantic', 'Project uses PostgreSQL', ['db']);
    await store.save(existingEntry);

    // Score in (0.8, 0.9] → related path
    const embIdx = makeMockEmbeddingIndex([{ id: existingEntry.id, score: 0.85 }]);

    chatCreate.mockResolvedValue(
      extractionResponse([
        { kind: 'semantic', content: 'Database is PostgreSQL 15', tags: ['db', 'postgres'] },
      ])
    );

    await consolidate(
      [makeUserMsg('postgres version'), makeAssistantMsg('pg15')],
      store,
      { apiKey: 'test-key' },
      embIdx
    );

    const entries = await store.search({});
    expect(entries).toHaveLength(2);
    const newEntry = entries.find(e => e.id !== existingEntry.id)!;
    expect(newEntry.relatedTo).toContain(existingEntry.id);
  });

  it('saves new entry without relatedTo when cosine ≤ 0.8', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    mockEmbedding(embeddingsCreate);

    const embIdx = makeMockEmbeddingIndex([{ id: 'some-id', score: 0.5 }]);

    chatCreate.mockResolvedValue(
      extractionResponse([
        { kind: 'semantic', content: 'Project uses hexagonal architecture', tags: ['arch'] },
      ])
    );

    await consolidate(
      [makeUserMsg('arch decision'), makeAssistantMsg('hexagonal')],
      store,
      { apiKey: 'test-key' },
      embIdx
    );

    const entries = await store.search({});
    expect(entries).toHaveLength(1);
    expect(entries[0]!.relatedTo).toBeUndefined();
  });

  it('deduplicates within same session via fallback cosine when no embeddingIndex', async () => {
    const { chatCreate, embeddingsCreate } = await getMocks();
    // Both chunks return the same memory, embedding returns same vector → cosine = 1 > 0.9
    mockEmbedding(embeddingsCreate);
    chatCreate.mockResolvedValue(
      extractionResponse([
        { kind: 'semantic', content: 'Project uses React and TypeScript', tags: ['react'] },
      ])
    );

    // 15 messages → 2 chunks, no embeddingIndex → fallback path
    const msgs = Array.from({ length: 15 }, (_, i) =>
      i % 2 === 0 ? makeUserMsg(`msg ${i}`) : makeAssistantMsg(`reply ${i}`)
    );

    await consolidate(msgs, store, { apiKey: 'test-key' });

    // Both chunks extract the same memory but second should be skipped (cosine = 1)
    const entries = await store.search({});
    expect(entries).toHaveLength(1);
  });
});

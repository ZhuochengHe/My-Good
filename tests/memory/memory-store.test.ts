/**
 * Tests for JsonMemoryStore.
 * Written FIRST following TDD methodology (RED → GREEN → REFACTOR).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonMemoryStore } from '../../src/memory/memory-store.js';
import {
  MemoryNotFoundError,
  MemoryInvalidIdError,
  MemoryInvalidKindError,
  MemoryInvalidContentError,
} from '../../src/errors/memory.js';
import { createMemoryEntry } from '../../src/types/memory.js';
import type { MemoryEntry } from '../../src/types/memory.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

/** Creates a unique temp directory path for each test run. */
function makeTempDir(): string {
  return path.join(tmpdir(), `memory-test-${randomUUID()}`);
}

/** Builds a valid preference MemoryEntry for testing. */
function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: randomUUID(),
    kind: 'preference',
    content: 'Test memory content',
    tags: ['test'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('JsonMemoryStore', () => {
  let store: JsonMemoryStore;
  let baseDir: string;

  beforeEach(async () => {
    baseDir = makeTempDir();
    await fs.mkdir(baseDir, { recursive: true });
    store = new JsonMemoryStore(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // save + get round-trip
  // ---------------------------------------------------------------------------

  describe('save and get', () => {
    it('saves an entry and retrieves it by id', async () => {
      const entry = makeEntry({ content: 'Hello world', kind: 'preference' });
      await store.save(entry);
      const result = await store.get(entry.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(entry.id);
      expect(result?.content).toBe('Hello world');
      expect(result?.kind).toBe('preference');
      expect(result?.tags).toEqual(['test']);
    });

    it('returns null for a non-existent id', async () => {
      const result = await store.get(randomUUID());
      expect(result).toBeNull();
    });

    it('throws MemoryInvalidIdError for an id that is not UUID v4', async () => {
      await expect(store.get('not-a-uuid')).rejects.toThrow(MemoryInvalidIdError);
    });

    it('throws MemoryInvalidIdError for empty string id', async () => {
      await expect(store.get('')).rejects.toThrow(MemoryInvalidIdError);
    });
  });

  // ---------------------------------------------------------------------------
  // save validation
  // ---------------------------------------------------------------------------

  describe('save validation', () => {
    it('throws MemoryInvalidContentError when content is empty', async () => {
      const entry = makeEntry({ content: '' });
      await expect(store.save(entry)).rejects.toThrow(MemoryInvalidContentError);
    });

    it('throws MemoryInvalidContentError when content exceeds 10000 chars', async () => {
      const entry = makeEntry({ content: 'x'.repeat(10001) });
      await expect(store.save(entry)).rejects.toThrow(MemoryInvalidContentError);
    });

    it('accepts content that is exactly 10000 chars', async () => {
      const entry = makeEntry({ content: 'x'.repeat(10000) });
      await expect(store.save(entry)).resolves.not.toThrow();
    });

    it('throws MemoryInvalidKindError for invalid kind', async () => {
      const entry = makeEntry({ kind: 'unknown' as 'preference' });
      await expect(store.save(entry)).rejects.toThrow(MemoryInvalidKindError);
    });

    it('accepts all valid kinds', async () => {
      for (const kind of ['preference', 'experiential', 'semantic', 'episodic'] as const) {
        const entry = makeEntry({ kind });
        await expect(store.save(entry)).resolves.not.toThrow();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('merges content field and updates updatedAt', async () => {
      const entry = makeEntry({ content: 'original' });
      await store.save(entry);
      const originalUpdatedAt = entry.updatedAt;

      // Small sleep to ensure updatedAt changes
      await new Promise(r => setTimeout(r, 5));

      const updated = await store.update(entry.id, { content: 'updated' });
      expect(updated.content).toBe('updated');
      expect(updated.updatedAt).toBeGreaterThan(originalUpdatedAt);
      expect(updated.id).toBe(entry.id);
    });

    it('merges tags field', async () => {
      const entry = makeEntry({ tags: ['a'] });
      await store.save(entry);
      const updated = await store.update(entry.id, { tags: ['b', 'c'] });
      expect(updated.tags).toEqual(['b', 'c']);
    });

    it('merges ttlDays field', async () => {
      const entry = makeEntry({ kind: 'episodic' });
      await store.save(entry);
      const updated = await store.update(entry.id, { ttlDays: 14 });
      expect(updated.ttlDays).toBe(14);
    });

    it('merges relatedTo field', async () => {
      const entry = makeEntry();
      await store.save(entry);
      const relId = randomUUID();
      const updated = await store.update(entry.id, { relatedTo: [relId] });
      expect(updated.relatedTo).toEqual([relId]);
    });

    it('throws MemoryNotFoundError when updating a non-existent id', async () => {
      await expect(store.update(randomUUID(), { content: 'x' })).rejects.toThrow(
        MemoryNotFoundError
      );
    });

    it('persists update to disk (get after update reflects change)', async () => {
      const entry = makeEntry({ content: 'before' });
      await store.save(entry);
      await store.update(entry.id, { content: 'after' });
      const fromDisk = await store.get(entry.id);
      expect(fromDisk?.content).toBe('after');
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  describe('delete', () => {
    it('removes an entry from storage', async () => {
      const entry = makeEntry();
      await store.save(entry);
      await store.delete(entry.id);
      const result = await store.get(entry.id);
      expect(result).toBeNull();
    });

    it('throws MemoryNotFoundError when deleting a non-existent id', async () => {
      await expect(store.delete(randomUUID())).rejects.toThrow(MemoryNotFoundError);
    });
  });

  // ---------------------------------------------------------------------------
  // search
  // ---------------------------------------------------------------------------

  describe('search', () => {
    it('returns all entries when no options provided', async () => {
      const e1 = makeEntry({ kind: 'preference' });
      const e2 = makeEntry({ kind: 'semantic' });
      const e3 = makeEntry({ kind: 'episodic' });
      await store.save(e1);
      await store.save(e2);
      await store.save(e3);
      const results = await store.search({});
      expect(results.length).toBe(3);
    });

    it('filters by kind', async () => {
      const e1 = makeEntry({ kind: 'preference' });
      const e2 = makeEntry({ kind: 'semantic' });
      await store.save(e1);
      await store.save(e2);
      const results = await store.search({ kind: 'preference' });
      expect(results.every(r => r.kind === 'preference')).toBe(true);
      expect(results.some(r => r.id === e1.id)).toBe(true);
      expect(results.some(r => r.id === e2.id)).toBe(false);
    });

    it('filters by query (case-insensitive substring match on content)', async () => {
      const e1 = makeEntry({ content: 'The quick brown FOX' });
      const e2 = makeEntry({ content: 'Something unrelated' });
      await store.save(e1);
      await store.save(e2);
      const results = await store.search({ query: 'quick brown fox' });
      expect(results.length).toBe(1);
      expect(results[0]?.id).toBe(e1.id);
    });

    it('boosts tag-matching entries to the top via overlap ratio', async () => {
      // Tags are now a reranking boost (overlap ratio), not a hard filter.
      // Entries with matching tags rank above non-matching ones; all entries
      // are still returned.
      const e1 = makeEntry({ tags: ['alpha', 'beta'] });  // overlap 1/2 = 0.5
      const e2 = makeEntry({ tags: ['gamma'] });           // overlap 1/2 = 0.5
      const e3 = makeEntry({ tags: ['delta'] });           // overlap 0/2 = 0
      await store.save(e1);
      await store.save(e2);
      await store.save(e3);
      const results = await store.search({ tags: ['beta', 'gamma'] });
      const ids = results.map(r => r.id);
      // All entries are present (no hard filter)
      expect(ids).toContain(e1.id);
      expect(ids).toContain(e2.id);
      expect(ids).toContain(e3.id);
      // Tag-matching entries rank before non-matching entry
      expect(ids.indexOf(e3.id)).toBeGreaterThan(ids.indexOf(e1.id));
      expect(ids.indexOf(e3.id)).toBeGreaterThan(ids.indexOf(e2.id));
    });

    it('excludes expired episodic entries silently', async () => {
      const expired = makeEntry({
        kind: 'episodic',
        ttlDays: 1,
        createdAt: Date.now() - 2 * 86400000,
      });
      const valid = makeEntry();
      await store.save(expired);
      await store.save(valid);
      const results = await store.search({});
      const ids = results.map(r => r.id);
      expect(ids).not.toContain(expired.id);
      expect(ids).toContain(valid.id);
    });

    it('respects the limit option', async () => {
      for (let i = 0; i < 5; i++) {
        await store.save(makeEntry());
      }
      const results = await store.search({ limit: 3 });
      expect(results.length).toBe(3);
    });

    it('returns entries sorted by updatedAt descending', async () => {
      const now = Date.now();
      const e1 = makeEntry({ updatedAt: now - 2000 });
      const e2 = makeEntry({ updatedAt: now - 1000 });
      const e3 = makeEntry({ updatedAt: now });
      await store.save(e1);
      await store.save(e2);
      await store.save(e3);
      const results = await store.search({});
      expect(results[0]?.id).toBe(e3.id);
      expect(results[1]?.id).toBe(e2.id);
      expect(results[2]?.id).toBe(e1.id);
    });
  });

  // ---------------------------------------------------------------------------
  // loadForSystemPrompt
  // ---------------------------------------------------------------------------

  describe('loadForSystemPrompt', () => {
    it('returns all preference entries and recent episodic entries', async () => {
      const pref = makeEntry({ kind: 'preference' });
      const epi = makeEntry({ kind: 'episodic' });
      const sem = makeEntry({ kind: 'semantic' });
      const exp = makeEntry({ kind: 'experiential' });
      await store.save(pref);
      await store.save(epi);
      await store.save(sem);
      await store.save(exp);
      const results = await store.loadForSystemPrompt();
      const ids = results.map(r => r.id);
      expect(ids).toContain(pref.id);
      expect(ids).toContain(epi.id);
      expect(ids).not.toContain(sem.id);
      expect(ids).not.toContain(exp.id);
    });

    it('limits episodic entries to 5 (most recently updated)', async () => {
      const now = Date.now();
      // Save 7 episodic entries with distinct updatedAt timestamps
      const episodics = Array.from({ length: 7 }, (_, i) =>
        makeEntry({ kind: 'episodic', updatedAt: now + i * 1000, createdAt: now + i * 1000 })
      );
      for (const e of episodics) await store.save(e);

      const results = await store.loadForSystemPrompt();
      const episodicResults = results.filter(r => r.kind === 'episodic');
      expect(episodicResults).toHaveLength(5);
      // Should be the 5 most recently updated (indices 6..2)
      const returnedIds = new Set(episodicResults.map(r => r.id));
      for (const e of episodics.slice(2)) {
        expect(returnedIds.has(e.id)).toBe(true);
      }
    });

    it('excludes expired episodic entries', async () => {
      const expired = makeEntry({
        kind: 'episodic',
        ttlDays: 1,
        createdAt: Date.now() - 2 * 86400000,
        updatedAt: Date.now() - 2 * 86400000,
      });
      const pref = makeEntry({ kind: 'preference' });
      await store.save(expired);
      await store.save(pref);
      const results = await store.loadForSystemPrompt();
      const ids = results.map(r => r.id);
      expect(ids).not.toContain(expired.id);
      expect(ids).toContain(pref.id);
    });

    it('returns preference entries sorted by createdAt ascending', async () => {
      const now = Date.now();
      const e1 = makeEntry({ kind: 'preference', createdAt: now - 2000, updatedAt: now - 2000 });
      const e2 = makeEntry({ kind: 'preference', createdAt: now - 1000, updatedAt: now - 1000 });
      const e3 = makeEntry({ kind: 'preference', createdAt: now, updatedAt: now });
      await store.save(e3);
      await store.save(e1);
      await store.save(e2);
      const results = await store.loadForSystemPrompt();
      expect(results[0]?.id).toBe(e1.id);
      expect(results[1]?.id).toBe(e2.id);
      expect(results[2]?.id).toBe(e3.id);
    });

    it('returns empty array when no preference or episodic entries exist', async () => {
      await store.save(makeEntry({ kind: 'semantic' }));
      await store.save(makeEntry({ kind: 'experiential' }));
      const results = await store.loadForSystemPrompt();
      expect(results.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Atomic writes and file permissions
  // ---------------------------------------------------------------------------

  describe('atomic writes', () => {
    it('stores files at baseDir/<kind>/<uuid>.json', async () => {
      const entry = makeEntry({ kind: 'semantic' });
      await store.save(entry);
      const filePath = path.join(baseDir, 'semantic', `${entry.id}.json`);
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });

    it('does not leave .tmp files after a successful save', async () => {
      const entry = makeEntry({ kind: 'preference' });
      await store.save(entry);
      const tmpPath = path.join(baseDir, 'preference', `${entry.id}.json.tmp`);
      await expect(fs.stat(tmpPath)).rejects.toThrow();
    });

    it('writes files with mode 0o600', async () => {
      const entry = makeEntry({ kind: 'preference' });
      await store.save(entry);
      const filePath = path.join(baseDir, 'preference', `${entry.id}.json`);
      const stat = await fs.stat(filePath);
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it('round-trips all fields correctly via JSON serialization', async () => {
      const now = Date.now();
      const entry: MemoryEntry = {
        id: randomUUID(),
        kind: 'episodic',
        content: 'Rich content with unicode: 你好',
        tags: ['tag-a', 'tag-b'],
        createdAt: now,
        updatedAt: now + 1000,
        ttlDays: 30, // will not expire within the test
        sourceRef: 'step-42',
      };
      await store.save(entry);
      const result = await store.get(entry.id);
      expect(result).toEqual(entry);
    });
  });

  // ---------------------------------------------------------------------------
  // TTL enforcement via ttlDays (episodic only)
  // ---------------------------------------------------------------------------

  describe('TTL enforcement via ttlDays', () => {
    const TWO_DAYS_MS = 2 * 86400000;
    const ONE_DAY_MS = 86400000;

    it('search excludes expired episodic entries with ttlDays=1, createdAt 2 days ago', async () => {
      const expiredEpisodic = makeEntry({
        kind: 'episodic',
        ttlDays: 1,
        createdAt: Date.now() - TWO_DAYS_MS,
      });
      const validEntry = makeEntry({ kind: 'preference' });
      await store.save(expiredEpisodic);
      await store.save(validEntry);
      const results = await store.search({});
      const ids = results.map(r => r.id);
      expect(ids).not.toContain(expiredEpisodic.id);
      expect(ids).toContain(validEntry.id);
    });

    it('search excludes expired episodic entries by content query', async () => {
      const expiredEpisodic = makeEntry({
        kind: 'episodic',
        ttlDays: 1,
        createdAt: Date.now() - TWO_DAYS_MS,
        content: 'expired ttl entry',
      });
      const validEntry = makeEntry({ kind: 'preference', content: 'expired ttl entry' });
      await store.save(expiredEpisodic);
      await store.save(validEntry);
      const results = await store.search({ query: 'expired ttl entry' });
      const ids = results.map(r => r.id);
      expect(ids).not.toContain(expiredEpisodic.id);
      expect(ids).toContain(validEntry.id);
    });

    it('get returns null for expired episodic entry with ttlDays', async () => {
      const expiredEpisodic = makeEntry({
        kind: 'episodic',
        ttlDays: 1,
        createdAt: Date.now() - TWO_DAYS_MS,
      });
      await store.save(expiredEpisodic);
      const result = await store.get(expiredEpisodic.id);
      expect(result).toBeNull();
    });

    it('get returns entry for non-expired episodic entry with ttlDays', async () => {
      const validEpisodic = makeEntry({
        kind: 'episodic',
        ttlDays: 5,
        createdAt: Date.now() - ONE_DAY_MS,
      });
      await store.save(validEpisodic);
      const result = await store.get(validEpisodic.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(validEpisodic.id);
    });

    it('episodic entries without ttlDays are never expired', async () => {
      const episodicNoTtl = makeEntry({
        kind: 'episodic',
        createdAt: Date.now() - TWO_DAYS_MS,
      });
      await store.save(episodicNoTtl);
      const result = await store.get(episodicNoTtl.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(episodicNoTtl.id);
    });

    it('preference entries are never expired by ttlDays even with ttlDays set', async () => {
      const procWithTtl = makeEntry({
        kind: 'preference',
        ttlDays: 1,
        createdAt: Date.now() - TWO_DAYS_MS,
      });
      await store.save(procWithTtl);
      const result = await store.get(procWithTtl.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(procWithTtl.id);
    });

    it('semantic entries are never expired by ttlDays even with ttlDays set', async () => {
      const semWithTtl = makeEntry({
        kind: 'semantic',
        ttlDays: 1,
        createdAt: Date.now() - TWO_DAYS_MS,
      });
      await store.save(semWithTtl);
      const result = await store.get(semWithTtl.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(semWithTtl.id);
    });

    it('expired episodic entries remain in the JSON file (soft eviction)', async () => {
      const expiredEpisodic = makeEntry({
        kind: 'episodic',
        ttlDays: 1,
        createdAt: Date.now() - TWO_DAYS_MS,
      });
      await store.save(expiredEpisodic);
      const filePath = path.join(baseDir, 'episodic', `${expiredEpisodic.id}.json`);
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // createMemoryEntry helper
  // ---------------------------------------------------------------------------

  describe('createMemoryEntry helper', () => {
    it('generates a valid UUID v4 id', () => {
      const entry = createMemoryEntry('preference', 'hello');
      expect(entry.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('sets createdAt, updatedAt, and lastAccessed to current time', () => {
      const before = Date.now();
      const entry = createMemoryEntry('experiential', 'hello');
      const after = Date.now();
      expect(entry.createdAt).toBeGreaterThanOrEqual(before);
      expect(entry.createdAt).toBeLessThanOrEqual(after);
      expect(entry.updatedAt).toBe(entry.createdAt);
      expect(entry.lastAccessed).toBe(entry.createdAt);
    });

    it('passes through optional ttlDays and sourceRef', () => {
      const entry = createMemoryEntry('episodic', 'hello', ['t'], {
        ttlDays: 7,
        sourceRef: 'step-1',
      });
      expect(entry.ttlDays).toBe(7);
      expect(entry.sourceRef).toBe('step-1');
    });
  });

  // ---------------------------------------------------------------------------
  // eviction sweep
  // ---------------------------------------------------------------------------

  describe('eviction sweep', () => {
    const TWO_DAYS_MS = 2 * 86400000;

    /** Makes an expired episodic entry (ttlDays=1, createdAt 2 days ago). */
    function makeExpiredEpisodic(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
      return makeEntry({
        kind: 'episodic',
        ttlDays: 1,
        createdAt: Date.now() - TWO_DAYS_MS,
        ...overrides,
      });
    }

    it('does nothing when expired episodic count is below threshold', async () => {
      const threshold = 5;
      store = new JsonMemoryStore(baseDir, threshold);

      const entries = [makeExpiredEpisodic(), makeExpiredEpisodic(), makeExpiredEpisodic()];
      for (const e of entries) {
        await store.save(e);
      }

      await store.evict();

      for (const e of entries) {
        const filePath = path.join(baseDir, 'episodic', `${e.id}.json`);
        await expect(fs.stat(filePath)).resolves.toBeTruthy();
      }
    });

    it('removes low-value expired episodic entries when threshold is exceeded', async () => {
      const threshold = 2;
      store = new JsonMemoryStore(baseDir, threshold);

      const lowValueEntries = [
        makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0, content: 'short' }),
        makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0, content: 'short' }),
        makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0, content: 'short' }),
      ];
      for (const e of lowValueEntries) {
        await store.save(e);
      }

      await store.evict();

      for (const e of lowValueEntries) {
        const filePath = path.join(baseDir, 'episodic', `${e.id}.json`);
        await expect(fs.stat(filePath)).rejects.toThrow();
      }
    });

    it('keeps high-value expired episodic entries and marks them pendingKB: true', async () => {
      const threshold = 2;
      store = new JsonMemoryStore(baseDir, threshold);

      const highValueEntries = [
        makeExpiredEpisodic({ tags: ['architecture'], accessCount: 5, ttlRenewals: 1 }),
        makeExpiredEpisodic({ tags: ['decision'], accessCount: 3, ttlRenewals: 2 }),
        makeExpiredEpisodic({ tags: ['convention'], accessCount: 4, ttlRenewals: 1 }),
      ];
      for (const e of highValueEntries) {
        await store.save(e);
      }

      await store.evict();

      for (const e of highValueEntries) {
        const filePath = path.join(baseDir, 'episodic', `${e.id}.json`);
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as MemoryEntry & { pendingKB?: boolean };
        expect(parsed).toBeDefined();
        expect(parsed.pendingKB).toBe(true);
      }
    });

    it('never removes preference entries even when threshold is exceeded', async () => {
      const threshold = 1;
      store = new JsonMemoryStore(baseDir, threshold);

      const procEntry = makeEntry({ kind: 'preference' });
      await store.save(procEntry);
      await store.save(makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0 }));
      await store.save(makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0 }));

      await store.evict();

      const filePath = path.join(baseDir, 'preference', `${procEntry.id}.json`);
      await expect(fs.stat(filePath)).resolves.toBeTruthy();
    });

    it('never removes semantic entries even when threshold is exceeded', async () => {
      const threshold = 1;
      store = new JsonMemoryStore(baseDir, threshold);

      const semEntry = makeEntry({ kind: 'semantic' });
      await store.save(semEntry);
      await store.save(makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0 }));
      await store.save(makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0 }));

      await store.evict();

      const filePath = path.join(baseDir, 'semantic', `${semEntry.id}.json`);
      await expect(fs.stat(filePath)).resolves.toBeTruthy();
    });

    it('never removes non-expired episodic entries', async () => {
      const threshold = 1;
      store = new JsonMemoryStore(baseDir, threshold);

      const validEpisodic = makeEntry({ kind: 'episodic', ttlDays: 30 });
      await store.save(validEpisodic);
      await store.save(makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0 }));
      await store.save(makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0 }));

      await store.evict();

      const filePath = path.join(baseDir, 'episodic', `${validEpisodic.id}.json`);
      await expect(fs.stat(filePath)).resolves.toBeTruthy();
    });

    it('is called automatically during initialize()', async () => {
      const threshold = 2;
      store = new JsonMemoryStore(baseDir, threshold);

      const expiredEntries = [
        makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0, content: 'short' }),
        makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0, content: 'short' }),
        makeExpiredEpisodic({ tags: [], accessCount: 0, ttlRenewals: 0, content: 'short' }),
      ];
      for (const e of expiredEntries) {
        await store.save(e);
      }

      await store.initialize();

      for (const e of expiredEntries) {
        const filePath = path.join(baseDir, 'episodic', `${e.id}.json`);
        await expect(fs.stat(filePath)).rejects.toThrow();
      }
    });

    it('uses default threshold of 100 when not provided', async () => {
      store = new JsonMemoryStore(baseDir);

      const entries = [makeExpiredEpisodic(), makeExpiredEpisodic(), makeExpiredEpisodic()];
      for (const e of entries) {
        await store.save(e);
      }

      await store.evict();

      for (const e of entries) {
        const filePath = path.join(baseDir, 'episodic', `${e.id}.json`);
        await expect(fs.stat(filePath)).resolves.toBeTruthy();
      }
    });
  });
});

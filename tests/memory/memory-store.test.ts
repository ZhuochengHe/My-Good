/**
 * Tests for JsonMemoryStore.
 * Written FIRST following TDD methodology (RED → GREEN → REFACTOR).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonMemoryStore } from '../../src/memory/memory-store.js';
import {
  MemoryNotFoundError,
  MemoryInvalidIdError,
  MemoryInvalidLayerError,
  MemoryInvalidContentError,
  MemoryExpiredError,
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

/** Builds a valid layer-1 MemoryEntry for testing. */
function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: randomUUID(),
    layer: 1,
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
      const entry = makeEntry({ content: 'Hello world', layer: 1 });
      await store.save(entry);
      const result = await store.get(entry.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(entry.id);
      expect(result?.content).toBe('Hello world');
      expect(result?.layer).toBe(1);
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

    it('throws MemoryInvalidLayerError for layer 0', async () => {
      const entry = makeEntry({ layer: 0 as 1 });
      await expect(store.save(entry)).rejects.toThrow(MemoryInvalidLayerError);
    });

    it('throws MemoryInvalidLayerError for layer 4', async () => {
      const entry = makeEntry({ layer: 4 as 1 });
      await expect(store.save(entry)).rejects.toThrow(MemoryInvalidLayerError);
    });

    it('accepts layers 1, 2, and 3', async () => {
      for (const layer of [1, 2, 3] as const) {
        const entry = makeEntry({ layer });
        await expect(store.save(entry)).resolves.not.toThrow();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // get with expiry
  // ---------------------------------------------------------------------------

  describe('get with expiry', () => {
    it('throws MemoryExpiredError for an entry with expiresAt in the past', async () => {
      const entry = makeEntry({
        expiresAt: Date.now() - 1000,
      });
      await store.save(entry);
      await expect(store.get(entry.id)).rejects.toThrow(MemoryExpiredError);
    });

    it('returns entry when expiresAt is in the future', async () => {
      const entry = makeEntry({
        expiresAt: Date.now() + 60_000,
      });
      await store.save(entry);
      const result = await store.get(entry.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(entry.id);
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

    it('merges expiresAt field', async () => {
      const entry = makeEntry();
      await store.save(entry);
      const newExpiry = Date.now() + 99_999;
      const updated = await store.update(entry.id, { expiresAt: newExpiry });
      expect(updated.expiresAt).toBe(newExpiry);
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
      const e1 = makeEntry({ layer: 1 });
      const e2 = makeEntry({ layer: 2 });
      const e3 = makeEntry({ layer: 3 });
      await store.save(e1);
      await store.save(e2);
      await store.save(e3);
      const results = await store.search({});
      expect(results.length).toBe(3);
    });

    it('filters by layer', async () => {
      const e1 = makeEntry({ layer: 1 });
      const e2 = makeEntry({ layer: 2 });
      await store.save(e1);
      await store.save(e2);
      const results = await store.search({ layer: 1 });
      expect(results.every(r => r.layer === 1)).toBe(true);
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

    it('filters by tags using any-match semantics', async () => {
      const e1 = makeEntry({ tags: ['alpha', 'beta'] });
      const e2 = makeEntry({ tags: ['gamma'] });
      const e3 = makeEntry({ tags: ['delta'] });
      await store.save(e1);
      await store.save(e2);
      await store.save(e3);
      const results = await store.search({ tags: ['beta', 'gamma'] });
      const ids = results.map(r => r.id);
      expect(ids).toContain(e1.id);
      expect(ids).toContain(e2.id);
      expect(ids).not.toContain(e3.id);
    });

    it('excludes expired entries silently', async () => {
      const expired = makeEntry({ expiresAt: Date.now() - 1000 });
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
  // loadLayer1
  // ---------------------------------------------------------------------------

  describe('loadLayer1', () => {
    it('returns only layer 1 entries', async () => {
      const l1 = makeEntry({ layer: 1 });
      const l2 = makeEntry({ layer: 2 });
      await store.save(l1);
      await store.save(l2);
      const results = await store.loadLayer1();
      expect(results.every(r => r.layer === 1)).toBe(true);
      expect(results.some(r => r.id === l1.id)).toBe(true);
      expect(results.some(r => r.id === l2.id)).toBe(false);
    });

    it('excludes expired layer 1 entries', async () => {
      const expired = makeEntry({ layer: 1, expiresAt: Date.now() - 1000 });
      const valid = makeEntry({ layer: 1 });
      await store.save(expired);
      await store.save(valid);
      const results = await store.loadLayer1();
      const ids = results.map(r => r.id);
      expect(ids).not.toContain(expired.id);
      expect(ids).toContain(valid.id);
    });

    it('returns entries sorted by createdAt ascending', async () => {
      const now = Date.now();
      const e1 = makeEntry({ layer: 1, createdAt: now - 2000, updatedAt: now - 2000 });
      const e2 = makeEntry({ layer: 1, createdAt: now - 1000, updatedAt: now - 1000 });
      const e3 = makeEntry({ layer: 1, createdAt: now, updatedAt: now });
      await store.save(e3);
      await store.save(e1);
      await store.save(e2);
      const results = await store.loadLayer1();
      expect(results[0]?.id).toBe(e1.id);
      expect(results[1]?.id).toBe(e2.id);
      expect(results[2]?.id).toBe(e3.id);
    });
  });

  // ---------------------------------------------------------------------------
  // Atomic writes and file permissions
  // ---------------------------------------------------------------------------

  describe('atomic writes', () => {
    it('stores files at baseDir/layer{n}/<uuid>.json', async () => {
      const entry = makeEntry({ layer: 2 });
      await store.save(entry);
      const filePath = path.join(baseDir, 'layer2', `${entry.id}.json`);
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });

    it('does not leave .tmp files after a successful save', async () => {
      const entry = makeEntry({ layer: 1 });
      await store.save(entry);
      const tmpPath = path.join(baseDir, 'layer1', `${entry.id}.json.tmp`);
      await expect(fs.stat(tmpPath)).rejects.toThrow();
    });

    it('writes files with mode 0o600', async () => {
      const entry = makeEntry({ layer: 1 });
      await store.save(entry);
      const filePath = path.join(baseDir, 'layer1', `${entry.id}.json`);
      const stat = await fs.stat(filePath);
      // mode & 0o777 should equal 0o600
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it('round-trips all fields correctly via JSON serialization', async () => {
      const entry: MemoryEntry = {
        id: randomUUID(),
        layer: 3,
        content: 'Rich content with unicode: 你好',
        tags: ['tag-a', 'tag-b'],
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_001_000,
        expiresAt: 1_900_000_000_000,
        source: 'agent',
      };
      await store.save(entry);
      const result = await store.get(entry.id);
      expect(result).toEqual(entry);
    });
  });

  // ---------------------------------------------------------------------------
  // createMemoryEntry helper
  // ---------------------------------------------------------------------------

  describe('createMemoryEntry helper', () => {
    it('generates a valid UUID v4 id', () => {
      const entry = createMemoryEntry(1, 'hello');
      expect(entry.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('sets createdAt and updatedAt to current time', () => {
      const before = Date.now();
      const entry = createMemoryEntry(2, 'hello');
      const after = Date.now();
      expect(entry.createdAt).toBeGreaterThanOrEqual(before);
      expect(entry.createdAt).toBeLessThanOrEqual(after);
      expect(entry.updatedAt).toBe(entry.createdAt);
    });

    it('passes through optional expiresAt and source', () => {
      const entry = createMemoryEntry(3, 'hello', ['t'], {
        expiresAt: 9999,
        source: 'user',
      });
      expect(entry.expiresAt).toBe(9999);
      expect(entry.source).toBe('user');
    });
  });
});

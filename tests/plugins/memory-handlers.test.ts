/**
 * Memory plugin handler tests (TDD - written first).
 *
 * Tests save_memory, search_memory, update_memory, delete_memory, and list_memories handlers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryNotFoundError } from '../../src/errors/memory.js';
import type { MemoryEntry } from '../../src/types/memory.js';

// Import handlers dynamically (JavaScript ESM module)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let save_memory: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let search_memory: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let update_memory: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let delete_memory: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let list_memories: any;

/** Builds a mock MemoryEntry for testing. */
function makeMockEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'abc12345-0000-4000-8000-000000000001',
    layer: 1,
    content: 'Test memory content',
    tags: ['test'],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

describe('memory plugin handlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMemoryStore: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockContext: any;

  beforeEach(async () => {
    mockMemoryStore = {
      save: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(makeMockEntry()),
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      loadLayer1: vi.fn().mockResolvedValue([]),
    };

    mockContext = {
      sessionId: 'test-session',
      workingDirectory: '/tmp',
      env: {},
      memoryStore: mockMemoryStore,
    };

    // Dynamically import the handlers (ESM JavaScript module)
    const handlers = await import('../../plugins/memory/handlers.js');
    save_memory = handlers.save_memory;
    search_memory = handlers.search_memory;
    update_memory = handlers.update_memory;
    delete_memory = handlers.delete_memory;
    list_memories = handlers.list_memories;
  });

  // ---------------------------------------------------------------------------
  // save_memory
  // ---------------------------------------------------------------------------

  describe('save_memory', () => {
    it('saves entry and returns formatted string with id and layer', async () => {
      const result = await save_memory(
        { content: 'I prefer dark mode', layer: 2, tags: ['preferences'] },
        mockContext
      );

      expect(mockMemoryStore.save).toHaveBeenCalledOnce();
      expect(result.output).toMatch(/Memory saved/);
      expect(result.output).toMatch(/layer: 2/);
      expect(result.output).toMatch(/id:/);
    });

    it('saves entry without optional tags', async () => {
      const result = await save_memory(
        { content: 'Core identity fact', layer: 1 },
        mockContext
      );

      expect(mockMemoryStore.save).toHaveBeenCalledOnce();
      expect(result.output).toMatch(/Memory saved/);
      expect(result.output).toMatch(/layer: 1/);
    });

    it('computes expiresAt correctly when ttlDays is provided', async () => {
      const before = Date.now();
      await save_memory(
        { content: 'Temporary note', layer: 3, ttlDays: 7 },
        mockContext
      );
      const after = Date.now();

      const savedEntry = mockMemoryStore.save.mock.calls[0]?.[0];
      expect(savedEntry).toBeDefined();
      const expectedMin = before + 7 * 86400000;
      const expectedMax = after + 7 * 86400000;
      expect(savedEntry.expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(savedEntry.expiresAt).toBeLessThanOrEqual(expectedMax);
    });

    it('does not set expiresAt when ttlDays is not provided', async () => {
      await save_memory(
        { content: 'Permanent entry', layer: 1 },
        mockContext
      );

      const savedEntry = mockMemoryStore.save.mock.calls[0]?.[0];
      expect(savedEntry.expiresAt).toBeUndefined();
    });

    it('passes source field when provided', async () => {
      await save_memory(
        { content: 'User said hello', layer: 2, source: 'user' },
        mockContext
      );

      const savedEntry = mockMemoryStore.save.mock.calls[0]?.[0];
      expect(savedEntry.source).toBe('user');
    });

    it('returns error string when content is missing', async () => {
      const result = await save_memory(
        { layer: 1 },
        mockContext
      );

      expect(mockMemoryStore.save).not.toHaveBeenCalled();
      expect(result.output).toMatch(/content/i);
    });

    it('returns error string when content is empty string', async () => {
      const result = await save_memory(
        { content: '', layer: 1 },
        mockContext
      );

      expect(mockMemoryStore.save).not.toHaveBeenCalled();
      expect(result.output).toMatch(/content/i);
    });

    it('returns error string when layer is invalid (0)', async () => {
      const result = await save_memory(
        { content: 'Valid content', layer: 0 },
        mockContext
      );

      expect(mockMemoryStore.save).not.toHaveBeenCalled();
      expect(result.output).toMatch(/layer/i);
    });

    it('returns error string when layer is invalid (4)', async () => {
      const result = await save_memory(
        { content: 'Valid content', layer: 4 },
        mockContext
      );

      expect(mockMemoryStore.save).not.toHaveBeenCalled();
      expect(result.output).toMatch(/layer/i);
    });

    it('returns "Memory store not available." when context.memoryStore is undefined', async () => {
      const result = await save_memory(
        { content: 'test', layer: 1 },
        { ...mockContext, memoryStore: undefined }
      );

      expect(result.output).toBe('Memory store not available.');
    });
  });

  // ---------------------------------------------------------------------------
  // search_memory
  // ---------------------------------------------------------------------------

  describe('search_memory', () => {
    it('returns formatted results when entries are found', async () => {
      const entry = makeMockEntry({
        id: 'abc12345-0000-4000-8000-000000000001',
        layer: 2,
        content: 'I prefer dark mode',
        tags: ['preferences', 'ui'],
      });
      mockMemoryStore.search.mockResolvedValue([entry]);

      const result = await search_memory(
        { query: 'dark mode' },
        mockContext
      );

      expect(mockMemoryStore.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'dark mode' })
      );
      expect(result.output).toContain('abc12345-0000-4000-8000-000000000001');
      expect(result.output).toContain('L2');
      expect(result.output).toContain('I prefer dark mode');
    });

    it('includes tags in output when present', async () => {
      const entry = makeMockEntry({
        content: 'Tagged entry',
        tags: ['alpha', 'beta'],
      });
      mockMemoryStore.search.mockResolvedValue([entry]);

      const result = await search_memory({ query: 'tagged' }, mockContext);

      expect(result.output).toMatch(/alpha|beta/);
    });

    it('returns "No memories found." when search yields empty results', async () => {
      mockMemoryStore.search.mockResolvedValue([]);

      const result = await search_memory({ query: 'nothing' }, mockContext);

      expect(result.output).toBe('No memories found.');
    });

    it('passes all optional filters to memoryStore.search', async () => {
      await search_memory(
        { query: 'test', tags: ['a', 'b'], layer: 3, limit: 5 },
        mockContext
      );

      expect(mockMemoryStore.search).toHaveBeenCalledWith({
        query: 'test',
        tags: ['a', 'b'],
        layer: 3,
        limit: 5,
      });
    });

    it('calls search with empty object when no args provided', async () => {
      await search_memory({}, mockContext);

      expect(mockMemoryStore.search).toHaveBeenCalledWith({});
    });

    it('formats multiple results joined by newlines', async () => {
      const e1 = makeMockEntry({
        id: 'abc12345-0000-4000-8000-000000000001',
        content: 'First memory',
        layer: 1,
        tags: [],
      });
      const e2 = makeMockEntry({
        id: 'abc12345-0000-4000-8000-000000000002',
        content: 'Second memory',
        layer: 2,
        tags: [],
      });
      mockMemoryStore.search.mockResolvedValue([e1, e2]);

      const result = await search_memory({}, mockContext);

      const lines = result.output.split('\n');
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('First memory');
      expect(lines[1]).toContain('Second memory');
    });

    it('returns "Memory store not available." when context.memoryStore is undefined', async () => {
      const result = await search_memory(
        { query: 'test' },
        { ...mockContext, memoryStore: undefined }
      );

      expect(result.output).toBe('Memory store not available.');
    });
  });

  // ---------------------------------------------------------------------------
  // update_memory
  // ---------------------------------------------------------------------------

  describe('update_memory', () => {
    it('calls update with id and new content, returns formatted string', async () => {
      const updated = makeMockEntry({ content: 'Updated content' });
      mockMemoryStore.update.mockResolvedValue(updated);

      const result = await update_memory(
        { id: 'abc12345-0000-4000-8000-000000000001', content: 'Updated content' },
        mockContext
      );

      expect(mockMemoryStore.update).toHaveBeenCalledWith(
        'abc12345-0000-4000-8000-000000000001',
        expect.objectContaining({ content: 'Updated content' })
      );
      expect(result.output).toMatch(/Memory updated/);
      expect(result.output).toContain('abc12345-0000-4000-8000-000000000001');
    });

    it('passes tags in update call when provided', async () => {
      await update_memory(
        { id: 'abc12345-0000-4000-8000-000000000001', tags: ['new-tag'] },
        mockContext
      );

      expect(mockMemoryStore.update).toHaveBeenCalledWith(
        'abc12345-0000-4000-8000-000000000001',
        expect.objectContaining({ tags: ['new-tag'] })
      );
    });

    it('computes new expiresAt when ttlDays is provided', async () => {
      const before = Date.now();
      await update_memory(
        { id: 'abc12345-0000-4000-8000-000000000001', ttlDays: 3 },
        mockContext
      );
      const after = Date.now();

      const updateInput = mockMemoryStore.update.mock.calls[0]?.[1];
      const expectedMin = before + 3 * 86400000;
      const expectedMax = after + 3 * 86400000;
      expect(updateInput.expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(updateInput.expiresAt).toBeLessThanOrEqual(expectedMax);
    });

    it('returns "Memory not found: <id>" when MemoryNotFoundError is thrown', async () => {
      mockMemoryStore.update.mockRejectedValue(
        new MemoryNotFoundError('abc12345-0000-4000-8000-000000000001')
      );

      const result = await update_memory(
        { id: 'abc12345-0000-4000-8000-000000000001', content: 'new' },
        mockContext
      );

      expect(result.output).toContain('Memory not found');
      expect(result.output).toContain('abc12345-0000-4000-8000-000000000001');
    });

    it('returns error string when id is missing', async () => {
      const result = await update_memory({}, mockContext);

      expect(mockMemoryStore.update).not.toHaveBeenCalled();
      expect(result.output).toMatch(/id/i);
    });

    it('returns "Memory store not available." when context.memoryStore is undefined', async () => {
      const result = await update_memory(
        { id: 'abc12345-0000-4000-8000-000000000001' },
        { ...mockContext, memoryStore: undefined }
      );

      expect(result.output).toBe('Memory store not available.');
    });
  });

  // ---------------------------------------------------------------------------
  // delete_memory
  // ---------------------------------------------------------------------------

  describe('delete_memory', () => {
    it('calls delete with correct id and returns formatted string', async () => {
      const result = await delete_memory(
        { id: 'abc12345-0000-4000-8000-000000000001' },
        mockContext
      );

      expect(mockMemoryStore.delete).toHaveBeenCalledWith(
        'abc12345-0000-4000-8000-000000000001'
      );
      expect(result.output).toMatch(/Memory deleted/);
      expect(result.output).toContain('abc12345-0000-4000-8000-000000000001');
    });

    it('returns "Memory not found: <id>" when MemoryNotFoundError is thrown', async () => {
      mockMemoryStore.delete.mockRejectedValue(
        new MemoryNotFoundError('abc12345-0000-4000-8000-000000000001')
      );

      const result = await delete_memory(
        { id: 'abc12345-0000-4000-8000-000000000001' },
        mockContext
      );

      expect(result.output).toContain('Memory not found');
      expect(result.output).toContain('abc12345-0000-4000-8000-000000000001');
    });

    it('returns error string when id is missing', async () => {
      const result = await delete_memory({}, mockContext);

      expect(mockMemoryStore.delete).not.toHaveBeenCalled();
      expect(result.output).toMatch(/id/i);
    });

    it('returns "Memory store not available." when context.memoryStore is undefined', async () => {
      const result = await delete_memory(
        { id: 'abc12345-0000-4000-8000-000000000001' },
        { ...mockContext, memoryStore: undefined }
      );

      expect(result.output).toBe('Memory store not available.');
    });
  });

  // ---------------------------------------------------------------------------
  // list_memories
  // ---------------------------------------------------------------------------

  describe('list_memories', () => {
    it('calls search with layer param when layer is provided', async () => {
      await list_memories({ layer: 2 }, mockContext);

      expect(mockMemoryStore.search).toHaveBeenCalledWith({ layer: 2 });
    });

    it('calls search without layer filter when layer is omitted', async () => {
      await list_memories({}, mockContext);

      expect(mockMemoryStore.search).toHaveBeenCalledWith({});
    });

    it('returns formatted entries when memories exist', async () => {
      const entry = makeMockEntry({
        id: 'abc12345-0000-4000-8000-000000000001',
        layer: 1,
        content: 'Core identity',
        tags: ['identity'],
      });
      mockMemoryStore.search.mockResolvedValue([entry]);

      const result = await list_memories({ layer: 1 }, mockContext);

      expect(result.output).toContain('abc12345-0000-4000-8000-000000000001');
      expect(result.output).toContain('L1');
      expect(result.output).toContain('Core identity');
    });

    it('returns "No memories found." when no entries exist', async () => {
      mockMemoryStore.search.mockResolvedValue([]);

      const result = await list_memories({ layer: 3 }, mockContext);

      expect(result.output).toBe('No memories found.');
    });

    it('lists all layers when layer is omitted', async () => {
      const e1 = makeMockEntry({ layer: 1, content: 'Layer 1 entry' });
      const e2 = makeMockEntry({
        id: 'abc12345-0000-4000-8000-000000000002',
        layer: 3,
        content: 'Layer 3 entry',
      });
      mockMemoryStore.search.mockResolvedValue([e1, e2]);

      const result = await list_memories({}, mockContext);

      expect(result.output).toContain('Layer 1 entry');
      expect(result.output).toContain('Layer 3 entry');
    });

    it('returns "Memory store not available." when context.memoryStore is undefined', async () => {
      const result = await list_memories(
        { layer: 1 },
        { ...mockContext, memoryStore: undefined }
      );

      expect(result.output).toBe('Memory store not available.');
    });
  });
});

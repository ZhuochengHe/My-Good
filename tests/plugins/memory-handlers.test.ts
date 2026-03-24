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
    kind: 'preference',
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
      loadForSystemPrompt: vi.fn().mockResolvedValue([]),
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
    it('saves entry and returns formatted string with id and kind', async () => {
      const result = await save_memory(
        { content: 'I prefer dark mode', kind: 'preference', tags: ['preferences'] },
        mockContext
      );

      expect(mockMemoryStore.save).toHaveBeenCalledOnce();
      expect(result.output).toMatch(/Memory saved/);
      expect(result.output).toMatch(/kind: preference/);
      expect(result.output).toMatch(/id:/);
    });

    it('saves entry without optional tags', async () => {
      const result = await save_memory(
        { content: 'Core behavioral rule', kind: 'preference' },
        mockContext
      );

      expect(mockMemoryStore.save).toHaveBeenCalledOnce();
      expect(result.output).toMatch(/Memory saved/);
      expect(result.output).toMatch(/kind: preference/);
    });

    it('passes ttlDays when provided', async () => {
      await save_memory(
        { content: 'Temporary note', kind: 'episodic', ttlDays: 7 },
        mockContext
      );

      const savedEntry = mockMemoryStore.save.mock.calls[0]?.[0];
      expect(savedEntry).toBeDefined();
      expect(savedEntry.ttlDays).toBe(7);
    });

    it('does not set ttlDays when not provided', async () => {
      await save_memory(
        { content: 'Permanent entry', kind: 'preference' },
        mockContext
      );

      const savedEntry = mockMemoryStore.save.mock.calls[0]?.[0];
      expect(savedEntry.ttlDays).toBeUndefined();
    });


    it('returns error string when content is missing', async () => {
      const result = await save_memory(
        { kind: 'preference' },
        mockContext
      );

      expect(mockMemoryStore.save).not.toHaveBeenCalled();
      expect(result.output).toMatch(/content/i);
    });

    it('returns error string when content is empty string', async () => {
      const result = await save_memory(
        { content: '', kind: 'preference' },
        mockContext
      );

      expect(mockMemoryStore.save).not.toHaveBeenCalled();
      expect(result.output).toMatch(/content/i);
    });

    it('returns error string when kind is invalid', async () => {
      const result = await save_memory(
        { content: 'Valid content', kind: 'invalid-kind' },
        mockContext
      );

      expect(mockMemoryStore.save).not.toHaveBeenCalled();
      expect(result.output).toMatch(/kind/i);
    });

    it('returns "Memory store not available." when context.memoryStore is undefined', async () => {
      const result = await save_memory(
        { content: 'test', kind: 'preference' },
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
        kind: 'preference',
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
      expect(result.output).toContain('preference');
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
        { query: 'test', tags: ['a', 'b'], kind: 'episodic', limit: 5 },
        mockContext
      );

      expect(mockMemoryStore.search).toHaveBeenCalledWith({
        query: 'test',
        tags: ['a', 'b'],
        kind: 'episodic',
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
        kind: 'preference',
        tags: [],
      });
      const e2 = makeMockEntry({
        id: 'abc12345-0000-4000-8000-000000000002',
        content: 'Second memory',
        kind: 'semantic',
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

    it('passes ttlDays in update call when provided', async () => {
      await update_memory(
        { id: 'abc12345-0000-4000-8000-000000000001', ttlDays: 3 },
        mockContext
      );

      const updateInput = mockMemoryStore.update.mock.calls[0]?.[1];
      expect(updateInput.ttlDays).toBe(3);
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
    it('calls search with kind param when kind is provided', async () => {
      await list_memories({ kind: 'episodic' }, mockContext);

      expect(mockMemoryStore.search).toHaveBeenCalledWith({ kind: 'episodic' });
    });

    it('calls search without kind filter when kind is omitted', async () => {
      await list_memories({}, mockContext);

      expect(mockMemoryStore.search).toHaveBeenCalledWith({});
    });

    it('returns formatted entries when memories exist', async () => {
      const entry = makeMockEntry({
        id: 'abc12345-0000-4000-8000-000000000001',
        kind: 'preference',
        content: 'Core behavioral rule',
        tags: ['behavior'],
      });
      mockMemoryStore.search.mockResolvedValue([entry]);

      const result = await list_memories({ kind: 'preference' }, mockContext);

      expect(result.output).toContain('abc12345-0000-4000-8000-000000000001');
      expect(result.output).toContain('preference');
      expect(result.output).toContain('Core behavioral rule');
    });

    it('returns "No memories found." when no entries exist', async () => {
      mockMemoryStore.search.mockResolvedValue([]);

      const result = await list_memories({ kind: 'episodic' }, mockContext);

      expect(result.output).toBe('No memories found.');
    });

    it('lists all kinds when kind is omitted', async () => {
      const e1 = makeMockEntry({ kind: 'preference', content: 'Procedural entry' });
      const e2 = makeMockEntry({
        id: 'abc12345-0000-4000-8000-000000000002',
        kind: 'episodic',
        content: 'Episodic entry',
      });
      mockMemoryStore.search.mockResolvedValue([e1, e2]);

      const result = await list_memories({}, mockContext);

      expect(result.output).toContain('Procedural entry');
      expect(result.output).toContain('Episodic entry');
    });

    it('returns "Memory store not available." when context.memoryStore is undefined', async () => {
      const result = await list_memories(
        { kind: 'preference' },
        { ...mockContext, memoryStore: undefined }
      );

      expect(result.output).toBe('Memory store not available.');
    });
  });
});

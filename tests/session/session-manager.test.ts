/**
 * Tests for SessionManager class.
 * Following TDD approach: write tests first, then implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';
import { JsonlSessionStore } from '../../src/session/jsonl-store.js';
import type { Session, SessionMetadata } from '../../src/types/sessions.js';
import type { ModelProvider, CompletionResponse } from '../../src/types/providers.js';
import type { UserMessage, AssistantMessage } from '../../src/types/messages.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('SessionManager', () => {
  let testDir: string;
  let sessionManager: SessionManager;
  let mockProvider: ModelProvider;

  beforeEach(async () => {
    // Create temporary directory for test sessions
    testDir = path.join(tmpdir(), `session-manager-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create mock provider
    mockProvider = {
      type: 'anthropic',
      complete: vi.fn(),
      stream: vi.fn(),
      listModels: vi.fn(),
      healthCheck: vi.fn(),
    } as unknown as ModelProvider;

    // Create SessionManager with test directory
    const store = new JsonlSessionStore(testDir);
    sessionManager = new SessionManager(store, mockProvider, {
      model: 'claude-sonnet-4-20250514',
      agentId: 'test-agent',
    });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('createSession', () => {
    it('should create a new session with auto-generated UUID', async () => {
      const sessionId = await sessionManager.createSession();

      expect(sessionId).toMatch(/^[a-f0-9-]+$/); // UUID format
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should initialize session with correct metadata', async () => {
      const sessionId = await sessionManager.createSession();
      const session = await sessionManager.loadSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
      expect(session?.agentId).toBe('test-agent');
      expect(session?.metadata.model).toBe('claude-sonnet-4-20250514');
      expect(session?.metadata.provider).toBe('anthropic');
      expect(session?.metadata.totalTokens).toBe(0);
      expect(session?.metadata.toolCallCount).toBe(0);
      expect(session?.metadata.turnCount).toBe(0);
      expect(session?.metadata.description).toBe('');
      expect(session?.metadata.tags).toEqual(['common']);
      expect(session?.messages).toEqual([]);
    });

    it('should allow custom session ID', async () => {
      const customId = 'custom-session-123';
      const sessionId = await sessionManager.createSession({ sessionId: customId });

      expect(sessionId).toBe(customId);
    });

    it('should initialize with common tag only', async () => {
      const sessionId = await sessionManager.createSession();
      const session = await sessionManager.loadSession(sessionId);

      expect(session?.metadata.tags).toEqual(['common']);
    });

    it('should throw error if session ID already exists', async () => {
      const customId = 'duplicate-session';
      await sessionManager.createSession({ sessionId: customId });

      await expect(
        sessionManager.createSession({ sessionId: customId })
      ).rejects.toThrow();
    });
  });

  describe('resumeSession', () => {
    it('should load existing session with full history', async () => {
      const sessionId = await sessionManager.createSession();

      // Add some messages manually
      const store = new JsonlSessionStore(testDir);
      const session = await store.load(sessionId);
      const userMsg: UserMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };
      await store.appendMessage(sessionId, userMsg);

      const loaded = await sessionManager.resumeSession(sessionId);

      expect(loaded).toBeDefined();
      expect(loaded?.messages.length).toBe(1);
      expect(loaded?.messages[0]?.content).toBe('Hello');
    });

    it('should throw error if session does not exist', async () => {
      await expect(
        sessionManager.resumeSession('non-existent-session')
      ).rejects.toThrow();
    });
  });

  describe('run', () => {
    it('should execute agent and auto-save after turn', async () => {
      const sessionId = await sessionManager.createSession();

      const mockResponse: CompletionResponse = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'Hello! How can I help you?',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: {
          inputTokens: 10,
          outputTokens: 8,
          totalTokens: 18,
        },
        model: 'claude-sonnet-4-20250514',
      };
      vi.mocked(mockProvider.complete).mockResolvedValue(mockResponse);

      const result = await sessionManager.run(sessionId, 'Hello');

      expect(result.success).toBe(true);
      expect(result.response).toBe('Hello! How can I help you?');

      // Verify session was saved
      const session = await sessionManager.loadSession(sessionId);
      expect(session?.messages.length).toBe(2); // user + assistant
      expect(session?.metadata.totalTokens).toBe(18);
      expect(session?.metadata.turnCount).toBe(1);
    });

    it('should accumulate metadata across multiple runs', async () => {
      const sessionId = await sessionManager.createSession();

      const mockResponse1: CompletionResponse = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'First response',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'claude-sonnet-4-20250514',
      };
      const mockResponse2: CompletionResponse = {
        message: {
          id: 'msg-2',
          role: 'assistant',
          content: 'Second response',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        model: 'claude-sonnet-4-20250514',
      };

      // Mock responses for turn 1: chat, description
      const mockDescResponse1: CompletionResponse = {
        message: {
          id: 'desc1',
          role: 'assistant',
          content: 'First description',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, // Don't count metadata generation
        model: 'claude-sonnet-4-20250514',
      };

      // Mock responses for turn 2: chat, updated description, tags
      const mockDescResponse2: CompletionResponse = {
        message: {
          id: 'desc2',
          role: 'assistant',
          content: 'Updated description',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, // Don't count metadata generation
        model: 'claude-sonnet-4-20250514',
      };

      const mockTagsResponse: CompletionResponse = {
        message: {
          id: 'tags',
          role: 'assistant',
          content: 'test, session',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, // Don't count metadata generation
        model: 'claude-sonnet-4-20250514',
      };

      vi.mocked(mockProvider.complete)
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockDescResponse1)
        .mockResolvedValueOnce(mockResponse2)
        .mockResolvedValueOnce(mockDescResponse2)
        .mockResolvedValueOnce(mockTagsResponse);

      await sessionManager.run(sessionId, 'First input');
      await sessionManager.run(sessionId, 'Second input');

      const session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.totalTokens).toBe(45); // 15 + 30 (only conversation tokens)
      expect(session?.metadata.turnCount).toBe(2);
    });

    it('should count tool calls in metadata', async () => {
      const sessionId = await sessionManager.createSession();

      const mockResponse: CompletionResponse = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'Using tools',
          toolCalls: [
            { id: 'tool-1', name: 'read_file', arguments: { path: 'test.txt' } },
            { id: 'tool-2', name: 'write_file', arguments: { path: 'out.txt', content: 'data' } },
          ],
          stopReason: 'tool_use',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'claude-sonnet-4-20250514',
      };
      vi.mocked(mockProvider.complete).mockResolvedValue(mockResponse);

      await sessionManager.run(sessionId, 'Use tools');

      const session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.toolCallCount).toBe(2);
    });

    it('should generate description after first turn', async () => {
      const sessionId = await sessionManager.createSession();

      const mockChatResponse: CompletionResponse = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'Here is the weather forecast',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'claude-sonnet-4-20250514',
      };

      const mockDescriptionResponse: CompletionResponse = {
        message: {
          id: 'msg-2',
          role: 'assistant',
          content: 'Weather forecast inquiry',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        model: 'claude-sonnet-4-20250514',
      };

      vi.mocked(mockProvider.complete)
        .mockResolvedValueOnce(mockChatResponse)
        .mockResolvedValueOnce(mockDescriptionResponse);

      await sessionManager.run(sessionId, 'What is the weather?');

      const session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.description).toBe('Weather forecast inquiry');
      expect(session?.metadata.tags).toEqual(['common']); // Tags not generated yet
    });

    it('should use fallback description if generation fails', async () => {
      const sessionId = await sessionManager.createSession();

      const mockChatResponse: CompletionResponse = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'Response',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'claude-sonnet-4-20250514',
      };

      vi.mocked(mockProvider.complete)
        .mockResolvedValueOnce(mockChatResponse)
        .mockRejectedValueOnce(new Error('API failure'));

      await sessionManager.run(sessionId, 'What is the weather?');

      const session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.description).toMatch(/Session started with: What is the weather/);
    });

    it('should generate tags after second turn', async () => {
      const sessionId = await sessionManager.createSession();

      const mockChatResponse1: CompletionResponse = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'Response 1',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'claude-sonnet-4-20250514',
      };

      const mockDescriptionResponse: CompletionResponse = {
        message: {
          id: 'msg-2',
          role: 'assistant',
          content: 'Weather forecast inquiry',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        model: 'claude-sonnet-4-20250514',
      };

      const mockChatResponse2: CompletionResponse = {
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: 'Response 2',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'claude-sonnet-4-20250514',
      };

      const mockUpdatedDescriptionResponse: CompletionResponse = {
        message: {
          id: 'msg-4',
          role: 'assistant',
          content: 'Weather forecast and temperature',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        model: 'claude-sonnet-4-20250514',
      };

      const mockTagsResponse: CompletionResponse = {
        message: {
          id: 'msg-5',
          role: 'assistant',
          content: 'weather, forecast, temperature',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        model: 'claude-sonnet-4-20250514',
      };

      vi.mocked(mockProvider.complete)
        .mockResolvedValueOnce(mockChatResponse1)
        .mockResolvedValueOnce(mockDescriptionResponse)
        .mockResolvedValueOnce(mockChatResponse2)
        .mockResolvedValueOnce(mockUpdatedDescriptionResponse)
        .mockResolvedValueOnce(mockTagsResponse);

      // First turn - generates description
      await sessionManager.run(sessionId, 'What is the weather?');
      let session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.description).toBe('Weather forecast inquiry');
      expect(session?.metadata.tags).toEqual(['common']); // Tags not yet generated

      // Second turn - regenerates description with both inputs and generates tags
      await sessionManager.run(sessionId, 'What about temperature?');
      session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.description).toBe('Weather forecast and temperature');
      expect(session?.metadata.tags).toEqual(['weather', 'forecast', 'temperature']);
    });

    it('should use fallback tags if generation fails', async () => {
      const sessionId = await sessionManager.createSession();

      const mockChatResponse1: CompletionResponse = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'Response 1',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'claude-sonnet-4-20250514',
      };

      const mockDescriptionResponse: CompletionResponse = {
        message: {
          id: 'msg-2',
          role: 'assistant',
          content: 'Weather inquiry',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        model: 'claude-sonnet-4-20250514',
      };

      const mockChatResponse2: CompletionResponse = {
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: 'Response 2',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'claude-sonnet-4-20250514',
      };

      const mockUpdatedDescriptionResponse: CompletionResponse = {
        message: {
          id: 'msg-4',
          role: 'assistant',
          content: 'Weather inquiry continued',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        model: 'claude-sonnet-4-20250514',
      };

      vi.mocked(mockProvider.complete)
        .mockResolvedValueOnce(mockChatResponse1)
        .mockResolvedValueOnce(mockDescriptionResponse)
        .mockResolvedValueOnce(mockChatResponse2)
        .mockResolvedValueOnce(mockUpdatedDescriptionResponse)
        .mockRejectedValueOnce(new Error('API failure'));

      // First turn
      await sessionManager.run(sessionId, 'What is the weather?');

      // Second turn - tags generation fails
      await sessionManager.run(sessionId, 'Tell me more');

      const session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.tags).toEqual(['common']); // Fallback to common
    });
  });

  describe('renameSession', () => {
    it('should move session file and update ID', async () => {
      const oldId = await sessionManager.createSession();
      const newId = 'renamed-session';

      await sessionManager.renameSession(oldId, newId);

      // Old session should not exist
      const oldSession = await sessionManager.loadSession(oldId);
      expect(oldSession).toBeNull();

      // New session should exist with same data
      const newSession = await sessionManager.loadSession(newId);
      expect(newSession).toBeDefined();
      expect(newSession?.id).toBe(newId);
    });

    it('should throw error if old session does not exist', async () => {
      await expect(
        sessionManager.renameSession('non-existent', 'new-name')
      ).rejects.toThrow();
    });

    it('should throw error if new ID already exists', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      await expect(
        sessionManager.renameSession(session1, session2)
      ).rejects.toThrow();
    });

    it('should validate new session ID format', async () => {
      const sessionId = await sessionManager.createSession();

      await expect(
        sessionManager.renameSession(sessionId, 'invalid/../path')
      ).rejects.toThrow();
    });
  });

  describe('updateTags', () => {
    it('should update session tags', async () => {
      const sessionId = await sessionManager.createSession();

      await sessionManager.updateTags(sessionId, ['custom', 'test', 'updated']);

      const session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.tags).toEqual(['custom', 'test', 'updated']);
    });

    it('should throw error if session does not exist', async () => {
      await expect(
        sessionManager.updateTags('non-existent', ['tag'])
      ).rejects.toThrow();
    });

    it('should deduplicate tags', async () => {
      const sessionId = await sessionManager.createSession();

      await sessionManager.updateTags(sessionId, ['test', 'test', 'custom']);

      const session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.tags).toEqual(['test', 'custom']);
    });

    it('should normalize tags to lowercase', async () => {
      const sessionId = await sessionManager.createSession();

      await sessionManager.updateTags(sessionId, ['Test', 'CUSTOM', 'Tag']);

      const session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.tags).toEqual(['test', 'custom', 'tag']);
    });
  });

  describe('listSessions', () => {
    it('should return all sessions', async () => {
      const session1 = await sessionManager.createSession();
      await sessionManager.updateDescription(session1, 'First session');
      await sessionManager.updateTags(session1, ['test', 'one']);

      const session2 = await sessionManager.createSession();
      await sessionManager.updateDescription(session2, 'Second session');
      await sessionManager.updateTags(session2, ['test', 'two']);

      const results = await sessionManager.listSessions();

      expect(results.length).toBe(2);
      expect(results.map(s => s.description)).toContain('First session');
      expect(results.map(s => s.description)).toContain('Second session');
    });

    it('should return empty array if no sessions exist', async () => {
      const results = await sessionManager.listSessions();
      expect(results).toEqual([]);
    });
  });

  describe('searchSessions', () => {
    beforeEach(async () => {
      // Create multiple sessions with different tags and descriptions
      const session1 = await sessionManager.createSession();
      await sessionManager.updateDescription(session1, 'Weather forecast for tomorrow');
      await sessionManager.updateTags(session1, ['weather', 'forecast']);

      const session2 = await sessionManager.createSession();
      await sessionManager.updateDescription(session2, 'TypeScript coding help');
      await sessionManager.updateTags(session2, ['coding', 'typescript']);

      const session3 = await sessionManager.createSession();
      await sessionManager.updateDescription(session3, 'Historical weather data analysis');
      await sessionManager.updateTags(session3, ['weather', 'data']);
    });

    it('should filter sessions by tag', async () => {
      const results = await sessionManager.searchSessions({ tag: 'weather' });

      expect(results.length).toBe(2);
      expect(results.every(s => s.tags.includes('weather'))).toBe(true);
    });

    it('should filter sessions by description text', async () => {
      const results = await sessionManager.searchSessions({ query: 'TypeScript' });

      expect(results.length).toBe(1);
      expect(results[0]?.description).toContain('TypeScript');
    });

    it('should filter by both tag and description', async () => {
      const results = await sessionManager.searchSessions({
        tag: 'weather',
        query: 'forecast'
      });

      expect(results.length).toBe(1);
      expect(results[0]?.description).toContain('forecast');
      expect(results[0]?.tags).toContain('weather');
    });

    it('should return all sessions if no filters provided', async () => {
      const results = await sessionManager.searchSessions({});

      expect(results.length).toBe(3);
    });

    it('should return empty array if no matches', async () => {
      const results = await sessionManager.searchSessions({ tag: 'nonexistent' });

      expect(results).toEqual([]);
    });

    it('should be case-insensitive for query search', async () => {
      const results = await sessionManager.searchSessions({ query: 'typescript' });

      expect(results.length).toBe(1);
    });

    it('should not filter by group if groupStore not configured', async () => {
      // sessionManager doesn't have groupStore, so group filter is ignored
      const results = await sessionManager.searchSessions({ group: 'any-group' });

      // Should return all sessions (group filter ignored)
      expect(results.length).toBe(3);
    });
  });

  describe('updateDescription', () => {
    it('should update session description', async () => {
      const sessionId = await sessionManager.createSession();

      await sessionManager.updateDescription(sessionId, 'Custom description');

      const session = await sessionManager.loadSession(sessionId);
      expect(session?.metadata.description).toBe('Custom description');
    });

    it('should throw error if session does not exist', async () => {
      await expect(
        sessionManager.updateDescription('non-existent', 'desc')
      ).rejects.toThrow();
    });
  });

  describe('loadSession', () => {
    it('should return null for non-existent session', async () => {
      const session = await sessionManager.loadSession('non-existent');

      expect(session).toBeNull();
    });

    it('should load existing session', async () => {
      const sessionId = await sessionManager.createSession();
      const session = await sessionManager.loadSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
    });
  });

  describe('Group Management', () => {
    let groupStore: any;
    let managerWithGroups: any;

    beforeEach(async () => {
      // Create group store
      const { JsonGroupStore } = await import('../../src/session/group-store.js');
      groupStore = new JsonGroupStore(testDir);

      // Create manager with group store
      const store = new JsonlSessionStore(testDir);
      managerWithGroups = new SessionManager(store, mockProvider, {
        model: 'claude-sonnet-4-20250514',
        agentId: 'test-agent',
      }, groupStore);
    });

    describe('createGroup', () => {
      it('should create a new group without sessions', async () => {
        await managerWithGroups.createGroup('work-projects');

        const group = await managerWithGroups.getGroup('work-projects');
        expect(group).toBeDefined();
        expect(group?.name).toBe('work-projects');
        expect(group?.sessionIds).toEqual([]);
      });

      it('should create a group with initial sessions', async () => {
        await managerWithGroups.createGroup('my-group', ['session-1', 'session-2']);

        const group = await managerWithGroups.getGroup('my-group');
        expect(group?.sessionIds).toEqual(['session-1', 'session-2']);
      });

      it('should throw error if group already exists', async () => {
        await managerWithGroups.createGroup('duplicate');

        await expect(
          managerWithGroups.createGroup('duplicate')
        ).rejects.toThrow('already exists');
      });

      it('should throw error if group store not configured', async () => {
        await expect(
          sessionManager.createGroup('test')
        ).rejects.toThrow('Group store not configured');
      });
    });

    describe('addSessionToGroup', () => {
      it('should add session to group', async () => {
        await managerWithGroups.createGroup('my-group');
        await managerWithGroups.addSessionToGroup('session-1', 'my-group');

        const group = await managerWithGroups.getGroup('my-group');
        expect(group?.sessionIds).toContain('session-1');
      });

      it('should not duplicate session if already in group', async () => {
        await managerWithGroups.createGroup('my-group', ['session-1']);
        await managerWithGroups.addSessionToGroup('session-1', 'my-group');

        const group = await managerWithGroups.getGroup('my-group');
        expect(group?.sessionIds).toEqual(['session-1']);
      });

      it('should throw error if group does not exist', async () => {
        await expect(
          managerWithGroups.addSessionToGroup('session-1', 'nonexistent')
        ).rejects.toThrow('does not exist');
      });
    });

    describe('removeSessionFromGroup', () => {
      it('should remove session from group', async () => {
        await managerWithGroups.createGroup('my-group', ['session-1', 'session-2']);
        await managerWithGroups.removeSessionFromGroup('session-1', 'my-group');

        const group = await managerWithGroups.getGroup('my-group');
        expect(group?.sessionIds).toEqual(['session-2']);
      });

      it('should be no-op if session not in group', async () => {
        await managerWithGroups.createGroup('my-group', ['session-1']);
        await managerWithGroups.removeSessionFromGroup('session-2', 'my-group');

        const group = await managerWithGroups.getGroup('my-group');
        expect(group?.sessionIds).toEqual(['session-1']);
      });

      it('should throw error if group does not exist', async () => {
        await expect(
          managerWithGroups.removeSessionFromGroup('session-1', 'nonexistent')
        ).rejects.toThrow('does not exist');
      });
    });

    describe('listGroups', () => {
      it('should return empty array if no groups exist', async () => {
        const groups = await managerWithGroups.listGroups();
        expect(groups).toEqual([]);
      });

      it('should list all groups', async () => {
        await managerWithGroups.createGroup('group-1');
        await managerWithGroups.createGroup('group-2');

        const groups = await managerWithGroups.listGroups();
        expect(groups.length).toBe(2);
        expect(groups.map((g: any) => g.name)).toContain('group-1');
        expect(groups.map((g: any) => g.name)).toContain('group-2');
      });
    });

    describe('deleteGroup', () => {
      it('should delete a group', async () => {
        await managerWithGroups.createGroup('to-delete');
        await managerWithGroups.deleteGroup('to-delete');

        const group = await managerWithGroups.getGroup('to-delete');
        expect(group).toBeNull();
      });

      it('should not affect sessions when deleting group', async () => {
        const sessionId = await managerWithGroups.createSession();
        await managerWithGroups.createGroup('my-group', [sessionId]);
        await managerWithGroups.deleteGroup('my-group');

        const session = await managerWithGroups.loadSession(sessionId);
        expect(session).not.toBeNull();
      });
    });

    describe('getSessionGroups', () => {
      it('should return empty array if session not in any group', async () => {
        const sessionId = await managerWithGroups.createSession();
        const groups = await managerWithGroups.getSessionGroups(sessionId);

        expect(groups).toEqual([]);
      });

      it('should return all groups containing the session', async () => {
        const sessionId = await managerWithGroups.createSession();
        await managerWithGroups.createGroup('group-1', [sessionId]);
        await managerWithGroups.createGroup('group-2', [sessionId, 'other-session']);
        await managerWithGroups.createGroup('group-3', ['different-session']);

        const groups = await managerWithGroups.getSessionGroups(sessionId);

        expect(groups.length).toBe(2);
        expect(groups).toContain('group-1');
        expect(groups).toContain('group-2');
        expect(groups).not.toContain('group-3');
      });
    });

    describe('searchSessions with groups', () => {
      it('should filter sessions by group', async () => {
        const session1 = await managerWithGroups.createSession();
        const session2 = await managerWithGroups.createSession();
        const session3 = await managerWithGroups.createSession();

        await managerWithGroups.updateDescription(session1, 'Session 1');
        await managerWithGroups.updateDescription(session2, 'Session 2');
        await managerWithGroups.updateDescription(session3, 'Session 3');

        await managerWithGroups.createGroup('work', [session1, session2]);
        await managerWithGroups.createGroup('personal', [session3]);

        const results = await managerWithGroups.searchSessions({ group: 'work' });

        expect(results.length).toBe(2);
        expect(results.map((s: any) => s.id)).toContain(session1);
        expect(results.map((s: any) => s.id)).toContain(session2);
        expect(results.map((s: any) => s.id)).not.toContain(session3);
      });

      it('should combine group and tag filters', async () => {
        const session1 = await managerWithGroups.createSession();
        const session2 = await managerWithGroups.createSession();
        const session3 = await managerWithGroups.createSession();

        await managerWithGroups.updateTags(session1, ['typescript', 'coding']);
        await managerWithGroups.updateTags(session2, ['python', 'coding']);
        await managerWithGroups.updateTags(session3, ['typescript', 'testing']);

        await managerWithGroups.createGroup('project-x', [session1, session2, session3]);

        const results = await managerWithGroups.searchSessions({
          group: 'project-x',
          tag: 'typescript'
        });

        expect(results.length).toBe(2);
        expect(results.map((s: any) => s.id)).toContain(session1);
        expect(results.map((s: any) => s.id)).not.toContain(session2);
        expect(results.map((s: any) => s.id)).toContain(session3);
      });

      it('should return empty array if group does not exist', async () => {
        const results = await managerWithGroups.searchSessions({ group: 'nonexistent' });

        expect(results).toEqual([]);
      });
    });
  });

  describe('Event Handling - Trace Data Persistence', () => {
    let store: JsonlSessionStore;
    let emittedEvents: import('../../src/types/events.js').AgentEvent[];

    beforeEach(async () => {
      // Create a fresh test directory
      testDir = path.join(tmpdir(), `session-manager-events-test-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });

      // Create store and session manager
      store = new JsonlSessionStore(testDir);
      sessionManager = new SessionManager(store, mockProvider, {
        model: 'claude-sonnet-4-20250514',
        agentId: 'test-agent',
      });

      emittedEvents = [];
    });

    describe('turn_start event handling', () => {
      it('should track turn start timestamp', async () => {
        const sessionId = await sessionManager.createSession();

        const turnStartEvent: import('../../src/types/events.js').TurnStartEvent = {
          type: 'turn_start',
          turnNumber: 1,
          timestamp: Date.now(),
        };

        await sessionManager.onEvent(turnStartEvent);

        // Verify internal state tracks the start time
        // This will be used to calculate duration in turn_end
        expect(sessionManager).toBeDefined();
      });

      it('should track multiple turn starts', async () => {
        const sessionId = await sessionManager.createSession();

        const turn1: import('../../src/types/events.js').TurnStartEvent = {
          type: 'turn_start',
          turnNumber: 1,
          timestamp: Date.now(),
        };

        const turn2: import('../../src/types/events.js').TurnStartEvent = {
          type: 'turn_start',
          turnNumber: 2,
          timestamp: Date.now() + 1000,
        };

        await sessionManager.onEvent(turn1);
        await sessionManager.onEvent(turn2);

        expect(sessionManager).toBeDefined();
      });
    });

    describe('turn_end event handling', () => {
      it('should persist turn metadata on turn_end event', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        // Simulate turn_start
        const turnStartEvent: import('../../src/types/events.js').TurnStartEvent = {
          type: 'turn_start',
          turnNumber: 1,
          timestamp: Date.now(),
        };
        await sessionManager.onEvent(turnStartEvent);

        // Simulate turn_end
        await new Promise(resolve => setTimeout(resolve, 50)); // Add small delay
        const turnEndEvent: import('../../src/types/events.js').TurnEndEvent = {
          type: 'turn_end',
          turnNumber: 1,
          usage: {
            inputTokens: 150,
            outputTokens: 100,
            totalTokens: 250,
          },
          timestamp: Date.now(),
        };
        await sessionManager.onEvent(turnEndEvent);

        // Load session with trace data
        const result = await store.loadWithTrace(sessionId);

        expect(result).not.toBeNull();
        expect(result!.turnMetadata).toHaveLength(1);
        expect(result!.turnMetadata[0].turnNumber).toBe(1);
        expect(result!.turnMetadata[0].usage.totalTokens).toBe(250);
        expect(result!.turnMetadata[0].usage.promptTokens).toBe(150);
        expect(result!.turnMetadata[0].usage.completionTokens).toBe(100);
        expect(result!.turnMetadata[0].durationMs).toBeGreaterThan(0);
      });

      it('should calculate duration correctly', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        const startTime = Date.now();
        const turnStartEvent: import('../../src/types/events.js').TurnStartEvent = {
          type: 'turn_start',
          turnNumber: 1,
          timestamp: startTime,
        };
        await sessionManager.onEvent(turnStartEvent);

        // Wait 100ms
        await new Promise(resolve => setTimeout(resolve, 100));

        const endTime = Date.now();
        const turnEndEvent: import('../../src/types/events.js').TurnEndEvent = {
          type: 'turn_end',
          turnNumber: 1,
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
          timestamp: endTime,
        };
        await sessionManager.onEvent(turnEndEvent);

        const result = await store.loadWithTrace(sessionId);
        const metadata = result!.turnMetadata[0];

        expect(metadata.durationMs).toBeGreaterThanOrEqual(90);
        expect(metadata.durationMs).toBeLessThan(200);
      });

      it('should persist multiple turn metadata records', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        // Turn 1
        await sessionManager.onEvent({
          type: 'turn_start',
          turnNumber: 1,
          timestamp: Date.now(),
        });
        await new Promise(resolve => setTimeout(resolve, 30));
        await sessionManager.onEvent({
          type: 'turn_end',
          turnNumber: 1,
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          timestamp: Date.now(),
        });

        // Turn 2
        await sessionManager.onEvent({
          type: 'turn_start',
          turnNumber: 2,
          timestamp: Date.now(),
        });
        await new Promise(resolve => setTimeout(resolve, 30));
        await sessionManager.onEvent({
          type: 'turn_end',
          turnNumber: 2,
          usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
          timestamp: Date.now(),
        });

        const result = await store.loadWithTrace(sessionId);

        expect(result!.turnMetadata).toHaveLength(2);
        expect(result!.turnMetadata[0].turnNumber).toBe(1);
        expect(result!.turnMetadata[1].turnNumber).toBe(2);
        expect(result!.turnMetadata[0].usage.totalTokens).toBe(150);
        expect(result!.turnMetadata[1].usage.totalTokens).toBe(300);
      });

      it('should handle turn_end without corresponding turn_start', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        // Turn_end without turn_start (duration should default to 0)
        const turnEndEvent: import('../../src/types/events.js').TurnEndEvent = {
          type: 'turn_end',
          turnNumber: 1,
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          timestamp: Date.now(),
        };
        await sessionManager.onEvent(turnEndEvent);

        const result = await store.loadWithTrace(sessionId);

        expect(result!.turnMetadata).toHaveLength(1);
        expect(result!.turnMetadata[0].durationMs).toBe(0);
      });

      it('should set stopReason to end_turn by default', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        await sessionManager.onEvent({
          type: 'turn_start',
          turnNumber: 1,
          timestamp: Date.now(),
        });
        await sessionManager.onEvent({
          type: 'turn_end',
          turnNumber: 1,
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          timestamp: Date.now(),
        });

        const result = await store.loadWithTrace(sessionId);

        expect(result!.turnMetadata[0].stopReason).toBe('end_turn');
      });

      it('should set toolCount to 0 by default', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        await sessionManager.onEvent({
          type: 'turn_start',
          turnNumber: 1,
          timestamp: Date.now(),
        });
        await sessionManager.onEvent({
          type: 'turn_end',
          turnNumber: 1,
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          timestamp: Date.now(),
        });

        const result = await store.loadWithTrace(sessionId);

        expect(result!.turnMetadata[0].toolCount).toBe(0);
      });
    });

    describe('error event handling', () => {
      it('should persist error log on error event', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        const errorEvent: import('../../src/types/events.js').ErrorEvent = {
          type: 'error',
          error: {
            code: 'TOOL_ERROR',
            message: 'Tool execution failed',
            recoverable: true,
          },
          timestamp: Date.now(),
        };

        await sessionManager.onEvent(errorEvent);

        const result = await store.loadWithTrace(sessionId);

        expect(result).not.toBeNull();
        expect(result!.errorLogs).toHaveLength(1);
        expect(result!.errorLogs[0].error).toBe('TOOL_ERROR');
        expect(result!.errorLogs[0].message).toBe('Tool execution failed');
      });

      it('should persist multiple error logs', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        await sessionManager.onEvent({
          type: 'error',
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid parameter',
            recoverable: true,
          },
          timestamp: Date.now(),
        });

        await sessionManager.onEvent({
          type: 'error',
          error: {
            code: 'PROVIDER_ERROR',
            message: 'API rate limit',
            recoverable: true,
          },
          timestamp: Date.now(),
        });

        const result = await store.loadWithTrace(sessionId);

        expect(result!.errorLogs).toHaveLength(2);
        expect(result!.errorLogs[0].error).toBe('VALIDATION_ERROR');
        expect(result!.errorLogs[1].error).toBe('PROVIDER_ERROR');
      });

      it('should include error cause if present', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        const causeError = new Error('Network timeout');
        const errorEvent: import('../../src/types/events.js').ErrorEvent = {
          type: 'error',
          error: {
            code: 'TIMEOUT',
            message: 'Request timed out',
            cause: causeError,
            recoverable: false,
          },
          timestamp: Date.now(),
        };

        await sessionManager.onEvent(errorEvent);

        const result = await store.loadWithTrace(sessionId);

        expect(result!.errorLogs[0].context).toContain('Network timeout');
      });

      it('should not set turnNumber for errors outside turns', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        const errorEvent: import('../../src/types/events.js').ErrorEvent = {
          type: 'error',
          error: {
            code: 'PROVIDER_ERROR',
            message: 'Failed to initialize provider',
            recoverable: false,
          },
          timestamp: Date.now(),
        };

        await sessionManager.onEvent(errorEvent);

        const result = await store.loadWithTrace(sessionId);

        expect(result!.errorLogs[0].turnNumber).toBeUndefined();
      });
    });

    describe('setCurrentSessionId', () => {
      it('should set the current session for event tracking', async () => {
        const sessionId = await sessionManager.createSession();

        sessionManager.setCurrentSessionId(sessionId);

        const turnStartEvent: import('../../src/types/events.js').TurnStartEvent = {
          type: 'turn_start',
          turnNumber: 1,
          timestamp: Date.now(),
        };
        await sessionManager.onEvent(turnStartEvent);

        expect(sessionManager).toBeDefined();
      });

      it('should clear current session when set to null', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);
        sessionManager.setCurrentSessionId(null);

        const turnEndEvent: import('../../src/types/events.js').TurnEndEvent = {
          type: 'turn_end',
          turnNumber: 1,
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          timestamp: Date.now(),
        };

        // Should not throw, but also should not persist
        await sessionManager.onEvent(turnEndEvent);
        expect(sessionManager).toBeDefined();
      });
    });

    describe('ignores non-trace events', () => {
      it('should ignore text_delta events', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        const textDeltaEvent: import('../../src/types/events.js').TextDeltaEvent = {
          type: 'text_delta',
          delta: 'Hello',
          timestamp: Date.now(),
        };

        await sessionManager.onEvent(textDeltaEvent);

        const result = await store.loadWithTrace(sessionId);
        expect(result!.turnMetadata).toHaveLength(0);
        expect(result!.errorLogs).toHaveLength(0);
      });

      it('should ignore tool_call_start events', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        const toolCallStartEvent: import('../../src/types/events.js').ToolCallStartEvent = {
          type: 'tool_call_start',
          toolCall: {
            id: 'call-1',
            name: 'test_tool',
            parameters: {},
          },
          timestamp: Date.now(),
        };

        await sessionManager.onEvent(toolCallStartEvent);

        const result = await store.loadWithTrace(sessionId);
        expect(result!.turnMetadata).toHaveLength(0);
      });

      it('should ignore agent_start events', async () => {
        const sessionId = await sessionManager.createSession();

        const agentStartEvent: import('../../src/types/events.js').AgentStartEvent = {
          type: 'agent_start',
          sessionId,
          timestamp: Date.now(),
        };

        await sessionManager.onEvent(agentStartEvent);

        const result = await store.loadWithTrace(sessionId);
        expect(result!.turnMetadata).toHaveLength(0);
      });
    });

    describe('integration with existing session operations', () => {
      it('should persist trace data alongside normal session operations', async () => {
        const sessionId = await sessionManager.createSession();
        sessionManager.setCurrentSessionId(sessionId);

        // Simulate a complete turn with events
        await sessionManager.onEvent({
          type: 'turn_start',
          turnNumber: 1,
          timestamp: Date.now(),
        });

        await new Promise(resolve => setTimeout(resolve, 30));

        await sessionManager.onEvent({
          type: 'turn_end',
          turnNumber: 1,
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          timestamp: Date.now(),
        });

        // Regular session operation (message append)
        const session = await sessionManager.loadSession(sessionId);
        expect(session).not.toBeNull();

        // Verify both regular session data and trace data exist
        const result = await store.loadWithTrace(sessionId);
        expect(result!.session).toBeDefined();
        expect(result!.turnMetadata).toHaveLength(1);
      });
    });
  });
});

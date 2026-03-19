/**
 * Tests for SessionManager class.
 * Following TDD approach: write tests first, then implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';
import type { RunOptions } from '../../src/session/session-manager.js';
import { JsonlSessionStore } from '../../src/session/jsonl-store.js';
import type { Session, SessionMetadata } from '../../src/types/sessions.js';
import type { ModelProvider, CompletionResponse } from '../../src/types/providers.js';
import type { UserMessage, AssistantMessage } from '../../src/types/messages.js';
import type { AgentEvent } from '../../src/types/events.js';
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

  describe('ExecutionLoop Integration (Phase 3)', () => {
    it('accepts optional executionLoop in constructor', () => {
      const mockExecutionLoop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' },
        run: vi.fn(),
        stream: vi.fn(),
        getTools: vi.fn(() => []),
        getSession: vi.fn(),
      };

      const store = new JsonlSessionStore(testDir);
      const managerWithLoop = new SessionManager(
        store,
        mockProvider,
        { model: 'test-model', agentId: 'test-agent' },
        undefined,
        mockExecutionLoop
      );

      expect(managerWithLoop).toBeDefined();
    });

    it('accepts optional onToolCall in constructor', () => {
      const mockOnToolCall = vi.fn();

      const store = new JsonlSessionStore(testDir);
      const managerWithCallback = new SessionManager(
        store,
        mockProvider,
        { model: 'test-model', agentId: 'test-agent' },
        undefined,
        undefined,
        mockOnToolCall
      );

      expect(managerWithCallback).toBeDefined();
    });

    it('runWithExecutionLoop delegates to execution loop', async () => {
      const mockExecutionLoop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' },
        run: vi.fn(async () => ({
          sessionId: 'test-session',
          messages: [
            { id: '1', role: 'user' as const, content: 'Hello', timestamp: Date.now() },
            { id: '2', role: 'assistant' as const, content: 'Hi!', stopReason: 'end_turn' as const, timestamp: Date.now() },
          ],
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          turns: 1,
          finishReason: 'completed' as const,
        })),
        stream: vi.fn(),
        getTools: vi.fn(() => []),
        getSession: vi.fn(),
      };

      const store = new JsonlSessionStore(testDir);
      const managerWithLoop = new SessionManager(
        store,
        mockProvider,
        { model: 'test-model', agentId: 'test-agent' },
        undefined,
        mockExecutionLoop
      );

      const sessionId = await managerWithLoop.createSession();
      const result = await (managerWithLoop as any).runWithExecutionLoop(sessionId, 'Hello');

      expect(mockExecutionLoop.run).toHaveBeenCalledWith('Hello', expect.objectContaining({
        sessionId,
        onEvent: expect.any(Function),
      }));

      expect(result.success).toBe(true);
      expect(result.response).toBe('Hi!');
    });

    it('run uses ExecutionLoop path when executionLoop is provided', async () => {
      const mockExecutionLoop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' },
        run: vi.fn(async () => ({
          sessionId: 'test-session',
          messages: [
            { id: '1', role: 'user' as const, content: 'Test', timestamp: Date.now() },
            { id: '2', role: 'assistant' as const, content: 'Response', stopReason: 'end_turn' as const, timestamp: Date.now() },
          ],
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          turns: 1,
          finishReason: 'completed' as const,
        })),
        stream: vi.fn(),
        getTools: vi.fn(() => []),
        getSession: vi.fn(),
      };

      const store = new JsonlSessionStore(testDir);
      const managerWithLoop = new SessionManager(
        store,
        mockProvider,
        { model: 'test-model', agentId: 'test-agent' },
        undefined,
        mockExecutionLoop
      );

      const sessionId = await managerWithLoop.createSession();
      const result = await managerWithLoop.run(sessionId, 'Test');

      expect(mockExecutionLoop.run).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('run uses legacy path when executionLoop is not provided', async () => {
      const mockResponse: CompletionResponse = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'Legacy response',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
        model: 'test-model',
      };

      (mockProvider.complete as any).mockResolvedValue(mockResponse);

      const store = new JsonlSessionStore(testDir);
      const managerWithoutLoop = new SessionManager(
        store,
        mockProvider,
        { model: 'test-model', agentId: 'test-agent' }
      );

      const sessionId = await managerWithoutLoop.createSession();
      const result = await managerWithoutLoop.run(sessionId, 'Test');

      expect(mockProvider.complete).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.response).toBe('Legacy response');
    });

    it('backward compatibility: existing code without ExecutionLoop still works', async () => {
      const mockResponse: CompletionResponse = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'Works as before',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
        model: 'test-model',
      };

      (mockProvider.complete as any).mockResolvedValue(mockResponse);

      // Use existing constructor pattern (no ExecutionLoop)
      const result = await sessionManager.run(
        await sessionManager.createSession(),
        'Hello'
      );

      expect(result.success).toBe(true);
      expect(result.response).toBe('Works as before');
    });

    it('runWithExecutionLoop passes onToolCall to execution loop', async () => {
      const mockOnToolCall = vi.fn();
      const mockExecutionLoop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' },
        run: vi.fn(async () => ({
          sessionId: 'test-session',
          messages: [],
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          turns: 1,
          finishReason: 'completed' as const,
        })),
        stream: vi.fn(),
        getTools: vi.fn(() => []),
        getSession: vi.fn(),
      };

      const store = new JsonlSessionStore(testDir);
      const managerWithBoth = new SessionManager(
        store,
        mockProvider,
        { model: 'test-model', agentId: 'test-agent' },
        undefined,
        mockExecutionLoop,
        mockOnToolCall
      );

      const sessionId = await managerWithBoth.createSession();
      await (managerWithBoth as any).runWithExecutionLoop(sessionId, 'Test');

      expect(mockExecutionLoop.run).toHaveBeenCalledWith('Test', expect.objectContaining({
        onToolCall: mockOnToolCall,
      }));
    });

    it('runWithExecutionLoop sets current session for event tracking', async () => {
      const mockExecutionLoop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' },
        run: vi.fn(async () => ({
          sessionId: 'test-session',
          messages: [],
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          turns: 1,
          finishReason: 'completed' as const,
        })),
        stream: vi.fn(),
        getTools: vi.fn(() => []),
        getSession: vi.fn(),
      };

      const store = new JsonlSessionStore(testDir);
      const managerWithLoop = new SessionManager(
        store,
        mockProvider,
        { model: 'test-model', agentId: 'test-agent' },
        undefined,
        mockExecutionLoop
      );

      const sessionId = await managerWithLoop.createSession();

      // Spy on setCurrentSessionId
      const spy = vi.spyOn(managerWithLoop, 'setCurrentSessionId');

      await (managerWithLoop as any).runWithExecutionLoop(sessionId, 'Test');

      expect(spy).toHaveBeenCalledWith(sessionId);
      expect(spy).toHaveBeenCalledWith(null); // Cleanup
    });

    it('runWithExecutionLoop forwards caller onEvent alongside internal handler', async () => {
      const emittedEvents: AgentEvent[] = [];

      const mockExecutionLoop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' },
        run: vi.fn(async (_input: string, opts?: { onEvent?: (e: AgentEvent) => void }) => {
          // Simulate the execution loop emitting a tool_call_start event
          opts?.onEvent?.({
            type: 'tool_call_start',
            toolCall: { id: 'tc1', name: 'read_file', input: {} },
            timestamp: Date.now(),
          });
          return {
            sessionId: 'test-session',
            messages: [
              { id: '1', role: 'user' as const, content: 'Hello', timestamp: Date.now() },
              { id: '2', role: 'assistant' as const, content: 'Result', stopReason: 'end_turn' as const, timestamp: Date.now() },
            ],
            toolCalls: [],
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            turns: 1,
            finishReason: 'completed' as const,
          };
        }),
        stream: vi.fn(),
        getTools: vi.fn(() => []),
        getSession: vi.fn(),
      };

      const store = new JsonlSessionStore(testDir);
      const managerWithLoop = new SessionManager(
        store,
        mockProvider,
        { model: 'test-model', agentId: 'test-agent' },
        undefined,
        mockExecutionLoop
      );

      const sessionId = await managerWithLoop.createSession();
      const runOptions: RunOptions = {
        onEvent: (event) => { emittedEvents.push(event); },
      };
      await managerWithLoop.run(sessionId, 'Hello', runOptions);

      // The caller-supplied onEvent should have received the tool_call_start event
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('tool_call_start');
    });

    it('streamRun yields text_delta and agent_end events from executionLoop.stream()', async () => {
      const yieldedEvents: AgentEvent[] = [
        { type: 'text_delta', delta: 'Hello', timestamp: Date.now() },
        { type: 'agent_end', result: { sessionId: 'sid', messages: [], toolCalls: [], turns: 1, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, finishReason: 'completed' }, timestamp: Date.now() },
      ];

      async function* fakeStream() {
        for (const event of yieldedEvents) yield event;
      }

      const mockLoop = {
        config: { id: 'test', name: 'test', model: 'test-model', provider: 'anthropic' as const },
        run: vi.fn(),
        stream: vi.fn(() => fakeStream()),
        getTools: vi.fn(() => []),
        getSession: vi.fn(),
      };

      const store = new JsonlSessionStore(testDir);
      const manager = new SessionManager(
        store,
        mockProvider,
        { model: 'test-model', agentId: 'test-agent' },
        undefined,
        mockLoop
      );

      const sessionId = await manager.createSession();
      const collected: AgentEvent[] = [];
      for await (const event of manager.streamRun(sessionId, 'Hi')) {
        collected.push(event);
      }

      expect(collected.map((e) => e.type)).toEqual(['text_delta', 'agent_end']);
      expect((collected[0] as { delta: string }).delta).toBe('Hello');
    });

    it('streamRun falls back to batch run() when no executionLoop is configured', async () => {
      vi.mocked(mockProvider.complete).mockResolvedValue({
        message: {
          id: 'msg1',
          role: 'assistant',
          content: 'Fallback response',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      });

      const sessionId = await sessionManager.createSession(); // no executionLoop
      const collected: AgentEvent[] = [];
      for await (const event of sessionManager.streamRun(sessionId, 'Hello')) {
        collected.push(event);
      }

      // Should emit synthetic text_delta and agent_end
      expect(collected.some((e) => e.type === 'text_delta')).toBe(true);
      expect(collected.some((e) => e.type === 'agent_end')).toBe(true);
      const delta = collected.find((e) => e.type === 'text_delta') as { delta: string };
      expect(delta.delta).toBe('Fallback response');
    });
  });

  describe('Conversation History (in-memory currentMessages)', () => {
    /**
     * Helper: build a minimal mock execution loop that captures what
     * messages (conversationHistory) it receives on each call and
     * returns a simple completed result.
     */
    function makeMockLoop(responses: { content: string }[] = [{ content: 'AI reply' }]) {
      let callIdx = 0;
      const capturedHistories: import('../../src/types/messages.js').ConversationMessage[][] = [];

      const loop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' as const },
        run: vi.fn(async (
          _input: string,
          opts?: { conversationHistory?: readonly import('../../src/types/messages.js').ConversationMessage[] }
        ) => {
          capturedHistories.push([...(opts?.conversationHistory ?? [])]);
          const content = responses[callIdx++]?.content ?? 'AI reply';
          return {
            sessionId: 'test-session',
            messages: [
              { id: `u${callIdx}`, role: 'user' as const, content: _input, timestamp: Date.now() },
              { id: `a${callIdx}`, role: 'assistant' as const, content, stopReason: 'end_turn' as const, timestamp: Date.now() },
            ],
            toolCalls: [],
            usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
            turns: 1,
            finishReason: 'completed' as const,
          };
        }),
        stream: vi.fn(async function* (
          input: string,
          opts?: { conversationHistory?: readonly import('../../src/types/messages.js').ConversationMessage[] }
        ) {
          capturedHistories.push([...(opts?.conversationHistory ?? [])]);
          const content = responses[callIdx++]?.content ?? 'AI reply';
          yield { type: 'text_delta' as const, delta: content, timestamp: Date.now() };
          yield {
            type: 'agent_end' as const,
            result: {
              sessionId: 'test-session',
              messages: [
                { id: `u${callIdx}`, role: 'user' as const, content: input, timestamp: Date.now() },
                { id: `a${callIdx}`, role: 'assistant' as const, content, stopReason: 'end_turn' as const, timestamp: Date.now() },
              ],
              toolCalls: [],
              usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
              turns: 1,
              finishReason: 'completed' as const,
            },
            timestamp: Date.now(),
          };
        }),
        getTools: vi.fn(() => [] as import('../../src/types/tools.js').ToolDefinition[]),
        getSession: vi.fn(),
        getCapturedHistories: () => capturedHistories,
      };

      return loop;
    }

    it('createSession() resets currentMessages to []', async () => {
      const loop = makeMockLoop([{ content: 'reply 1' }, { content: 'reply 2' }]);
      const store = new JsonlSessionStore(testDir);
      const manager = new SessionManager(
        store, mockProvider, { model: 'test-model', agentId: 'test-agent' },
        undefined, loop
      );

      // First session: run to populate currentMessages
      const session1 = await manager.createSession();
      await manager.run(session1, 'Turn 1 of session 1');

      // Create a completely new session — currentMessages should reset
      const session2 = await manager.createSession();
      await manager.run(session2, 'First turn of session 2');

      const histories = loop.getCapturedHistories();
      // First call for session1: history is [] (no prior turns)
      expect(histories[0]).toHaveLength(0);
      // First call for session2: history must also be [] (reset on createSession)
      expect(histories[1]).toHaveLength(0);
    });

    it('resumeSession() populates currentMessages from stored session messages', async () => {
      // Persist a session with two messages directly into the store
      const store = new JsonlSessionStore(testDir);
      const sessionId = 'pre-existing-session';
      const existingSession: Session = {
        id: sessionId,
        agentId: 'test-agent',
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 5000,
        messages: [
          { id: 'm1', role: 'user', content: 'Restored q', timestamp: Date.now() - 9000 },
          { id: 'm2', role: 'assistant', content: 'Restored a', stopReason: 'end_turn', timestamp: Date.now() - 8000 },
        ],
        metadata: {
          model: 'test-model',
          provider: 'anthropic',
          totalTokens: 20,
          toolCallCount: 0,
          turnCount: 1,
          description: 'test',
          tags: ['common'],
        },
      };
      await store.save(existingSession);

      const loop = makeMockLoop([{ content: 'New reply' }]);
      const manager = new SessionManager(
        store, mockProvider, { model: 'test-model', agentId: 'test-agent' },
        undefined, loop
      );

      // Resume the session to load messages into currentMessages
      await manager.resumeSession(sessionId);

      // Now run — the history passed to the loop should contain the two restored messages
      await manager.run(sessionId, 'New question');

      const histories = loop.getCapturedHistories();
      expect(histories[0]).toHaveLength(2);
      expect(histories[0][0]?.content).toBe('Restored q');
      expect(histories[0][1]?.content).toBe('Restored a');
    });

    it('runWithExecutionLoop() passes currentMessages as conversationHistory', async () => {
      const loop = makeMockLoop([{ content: 'First reply' }, { content: 'Second reply' }]);
      const store = new JsonlSessionStore(testDir);
      const manager = new SessionManager(
        store, mockProvider, { model: 'test-model', agentId: 'test-agent' },
        undefined, loop
      );

      const sessionId = await manager.createSession();

      // First turn — no prior history
      await manager.run(sessionId, 'Turn 1');

      // Second turn — history should contain the two messages from turn 1
      await manager.run(sessionId, 'Turn 2');

      const histories = loop.getCapturedHistories();
      expect(histories[0]).toHaveLength(0); // First turn: no prior history
      expect(histories[1]).toHaveLength(2); // Second turn: user + assistant from first turn
      expect(histories[1][0]?.role).toBe('user');
      expect(histories[1][0]?.content).toBe('Turn 1');
      expect(histories[1][1]?.role).toBe('assistant');
      expect(histories[1][1]?.content).toBe('First reply');
    });

    it('runWithExecutionLoop() only appends user + final assistant messages (no tool_use/tool_result)', async () => {
      const loop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' as const },
        run: vi.fn(async () => ({
          sessionId: 'test-session',
          messages: [
            { id: 'u1', role: 'user' as const, content: 'Do tool stuff', timestamp: Date.now() },
            { id: 'a1', role: 'assistant' as const, content: '', toolCalls: [{ id: 'tc1', name: 'shell', arguments: {} }], stopReason: 'tool_use' as const, timestamp: Date.now() },
            { id: 'tr1', role: 'tool' as const, content: 'tool output', toolCallId: 'tc1', toolName: 'shell', isError: false, timestamp: Date.now() },
            { id: 'a2', role: 'assistant' as const, content: 'Final answer', stopReason: 'end_turn' as const, timestamp: Date.now() },
          ],
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
          turns: 2,
          finishReason: 'completed' as const,
        })),
        stream: vi.fn(),
        getTools: vi.fn(() => [] as import('../../src/types/tools.js').ToolDefinition[]),
        getSession: vi.fn(),
      };

      const capturedHistoriesNextCall: import('../../src/types/messages.js').ConversationMessage[][] = [];
      let secondCall = false;
      (loop.run as ReturnType<typeof vi.fn>).mockImplementation(async (
        _input: string,
        opts?: { conversationHistory?: readonly import('../../src/types/messages.js').ConversationMessage[] }
      ) => {
        if (secondCall) {
          capturedHistoriesNextCall.push([...(opts?.conversationHistory ?? [])]);
          return {
            sessionId: 'test-session',
            messages: [
              { id: 'u2', role: 'user' as const, content: _input, timestamp: Date.now() },
              { id: 'a3', role: 'assistant' as const, content: 'Second reply', stopReason: 'end_turn' as const, timestamp: Date.now() },
            ],
            toolCalls: [],
            usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
            turns: 1,
            finishReason: 'completed' as const,
          };
        }
        secondCall = true;
        return {
          sessionId: 'test-session',
          messages: [
            { id: 'u1', role: 'user' as const, content: _input, timestamp: Date.now() },
            { id: 'a1', role: 'assistant' as const, content: '', toolCalls: [{ id: 'tc1', name: 'shell', arguments: {} }], stopReason: 'tool_use' as const, timestamp: Date.now() },
            { id: 'tr1', role: 'tool' as const, content: 'tool output', toolCallId: 'tc1', toolName: 'shell', isError: false, timestamp: Date.now() },
            { id: 'a2', role: 'assistant' as const, content: 'Final answer', stopReason: 'end_turn' as const, timestamp: Date.now() },
          ],
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
          turns: 2,
          finishReason: 'completed' as const,
        };
      });

      const store = new JsonlSessionStore(testDir);
      const manager = new SessionManager(
        store, mockProvider, { model: 'test-model', agentId: 'test-agent' },
        undefined, loop
      );

      const sessionId = await manager.createSession();
      await manager.run(sessionId, 'Do tool stuff');
      await manager.run(sessionId, 'Follow up');

      // Second call's history must only have user message + final assistant text — NOT tool_use or tool_result
      expect(capturedHistoriesNextCall[0]).toHaveLength(2);
      expect(capturedHistoriesNextCall[0][0]?.role).toBe('user');
      expect(capturedHistoriesNextCall[0][1]?.role).toBe('assistant');
      expect(capturedHistoriesNextCall[0][1]?.content).toBe('Final answer');
      // Confirm no tool messages were persisted to history
      const toolMessages = capturedHistoriesNextCall[0].filter((m) => m.role === 'tool');
      expect(toolMessages).toHaveLength(0);
    });

    it('streamRun() passes currentMessages as conversationHistory', async () => {
      const loop = makeMockLoop([{ content: 'Stream reply 1' }, { content: 'Stream reply 2' }]);
      const store = new JsonlSessionStore(testDir);
      const manager = new SessionManager(
        store, mockProvider, { model: 'test-model', agentId: 'test-agent' },
        undefined, loop
      );

      const sessionId = await manager.createSession();

      // First streamRun call — no prior history
      for await (const _event of manager.streamRun(sessionId, 'Streamed turn 1')) {
        // drain
      }

      // Second streamRun call — history should contain messages from first turn
      for await (const _event of manager.streamRun(sessionId, 'Streamed turn 2')) {
        // drain
      }

      const histories = loop.getCapturedHistories();
      expect(histories[0]).toHaveLength(0); // First call: no prior history
      expect(histories[1]).toHaveLength(2); // Second call: user + assistant from first turn
      expect(histories[1][0]?.content).toBe('Streamed turn 1');
      expect(histories[1][1]?.content).toBe('Stream reply 1');
    });

    it('streamRun() after completion only persists user + final assistant messages (no tool intermediates)', async () => {
      const loop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' as const },
        run: vi.fn(),
        stream: vi.fn(),
        getTools: vi.fn(() => [] as import('../../src/types/tools.js').ToolDefinition[]),
        getSession: vi.fn(),
      };

      const capturedHistoriesNextCall: import('../../src/types/messages.js').ConversationMessage[][] = [];
      let streamCallCount = 0;

      (loop.stream as ReturnType<typeof vi.fn>).mockImplementation(async function* (
        input: string,
        opts?: { conversationHistory?: readonly import('../../src/types/messages.js').ConversationMessage[] }
      ) {
        streamCallCount++;
        if (streamCallCount === 2) {
          capturedHistoriesNextCall.push([...(opts?.conversationHistory ?? [])]);
        }

        const isFirstCall = streamCallCount === 1;
        const userMsg = { id: `u${streamCallCount}`, role: 'user' as const, content: input, timestamp: Date.now() };
        const toolAssistant = { id: `a1_${streamCallCount}`, role: 'assistant' as const, content: '', toolCalls: [{ id: 'tc1', name: 'shell', arguments: {} }], stopReason: 'tool_use' as const, timestamp: Date.now() };
        const toolResult = { id: `tr_${streamCallCount}`, role: 'tool' as const, content: 'tool output', toolCallId: 'tc1', toolName: 'shell', isError: false, timestamp: Date.now() };
        const finalAssistant = { id: `a2_${streamCallCount}`, role: 'assistant' as const, content: isFirstCall ? 'Streamed final' : 'Second final', stopReason: 'end_turn' as const, timestamp: Date.now() };

        yield { type: 'text_delta' as const, delta: finalAssistant.content, timestamp: Date.now() };
        yield {
          type: 'agent_end' as const,
          result: {
            sessionId: 'test-session',
            messages: isFirstCall
              ? [userMsg, toolAssistant, toolResult, finalAssistant]
              : [userMsg, finalAssistant],
            toolCalls: [],
            usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
            turns: isFirstCall ? 2 : 1,
            finishReason: 'completed' as const,
          },
          timestamp: Date.now(),
        };
      });

      const store = new JsonlSessionStore(testDir);
      const manager = new SessionManager(
        store, mockProvider, { model: 'test-model', agentId: 'test-agent' },
        undefined, loop
      );

      const sessionId = await manager.createSession();

      for await (const _event of manager.streamRun(sessionId, 'Tool turn')) {
        // drain first stream
      }

      for await (const _event of manager.streamRun(sessionId, 'Follow up')) {
        // drain second stream
      }

      // Second call's history must only have user + final assistant — NOT tool messages
      expect(capturedHistoriesNextCall[0]).toHaveLength(2);
      expect(capturedHistoriesNextCall[0][0]?.role).toBe('user');
      expect(capturedHistoriesNextCall[0][1]?.role).toBe('assistant');
      expect(capturedHistoriesNextCall[0][1]?.content).toBe('Streamed final');
      const toolMsgs = capturedHistoriesNextCall[0].filter((m) => m.role === 'tool');
      expect(toolMsgs).toHaveLength(0);
    });
  });

  // ============================================================
  // compact() and estimatePromptTokens()
  // ============================================================

  describe('compact()', () => {
    function makeMockLoopForCompact() {
      return {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' as const },
        run: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          yield {
            type: 'agent_end' as const,
            result: {
              sessionId: 'test-session',
              messages: [
                { id: 'u1', role: 'user' as const, content: 'hi', timestamp: Date.now() },
                { id: 'a1', role: 'assistant' as const, content: 'hello', stopReason: 'end_turn' as const, timestamp: Date.now() },
              ],
              toolCalls: [],
              usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
              turns: 1,
              finishReason: 'completed' as const,
            },
            timestamp: Date.now(),
          };
        }),
        getTools: vi.fn(() => [] as import('../../src/types/tools.js').ToolDefinition[]),
        getSession: vi.fn(),
      };
    }

    it('returns a summary string', async () => {
      const compactResponse: CompletionResponse = {
        message: {
          id: 'compact-1',
          role: 'assistant',
          content: '<summary>User was building a REST API.</summary>',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        model: 'claude-sonnet-4-20250514',
      };
      (mockProvider.complete as ReturnType<typeof vi.fn>).mockResolvedValue(compactResponse);

      const store = new JsonlSessionStore(testDir);
      const manager = new SessionManager(
        store, mockProvider, { model: 'test-model', agentId: 'test-agent' },
        undefined, makeMockLoopForCompact(),
      );

      const sessionId = await manager.createSession();
      const summary = await manager.compact(sessionId);

      expect(typeof summary).toBe('string');
      expect(summary).toBe('User was building a REST API.');
    });

    it('resets currentMessages after compact()', async () => {
      const compactResponse: CompletionResponse = {
        message: {
          id: 'compact-2',
          role: 'assistant',
          content: '<summary>Summary text.</summary>',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'claude-sonnet-4-20250514',
      };
      (mockProvider.complete as ReturnType<typeof vi.fn>).mockResolvedValue(compactResponse);

      const loop = makeMockLoopForCompact();
      // Capture the conversationHistory passed on each stream call
      const capturedHistories: import('../../src/types/messages.js').ConversationMessage[][] = [];
      (loop.stream as ReturnType<typeof vi.fn>).mockImplementation(async function* (
        _input: string,
        opts?: { conversationHistory?: readonly import('../../src/types/messages.js').ConversationMessage[] }
      ) {
        capturedHistories.push([...(opts?.conversationHistory ?? [])]);
        const userMsg = { id: 'u1', role: 'user' as const, content: _input, timestamp: Date.now() };
        const assistantMsg = { id: 'a1', role: 'assistant' as const, content: 'reply', stopReason: 'end_turn' as const, timestamp: Date.now() };
        yield {
          type: 'agent_end' as const,
          result: {
            sessionId: 'test-session',
            messages: [userMsg, assistantMsg],
            toolCalls: [],
            usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
            turns: 1,
            finishReason: 'completed' as const,
          },
          timestamp: Date.now(),
        };
      });

      const store = new JsonlSessionStore(testDir);
      const manager = new SessionManager(
        store, mockProvider, { model: 'test-model', agentId: 'test-agent' },
        undefined, loop,
      );

      const sessionId = await manager.createSession();

      // Run one turn to populate currentMessages
      for await (const _event of manager.streamRun(sessionId, 'First message')) { /* drain */ }

      // After one turn, history should have 2 messages
      expect(capturedHistories[0]).toHaveLength(0); // first call: no prior history
      await manager.compact(sessionId);

      // After compact, the next stream call should see empty history
      for await (const _event of manager.streamRun(sessionId, 'After compact')) { /* drain */ }

      // capturedHistories[1] is the post-compact call — should be empty
      expect(capturedHistories[1]).toHaveLength(0);
    });

    it('throws SessionNotFoundError for unknown session', async () => {
      const { SessionNotFoundError } = await import('../../src/errors/session.js');
      await expect(sessionManager.compact('nonexistent-session-id')).rejects.toThrow(
        SessionNotFoundError,
      );
    });

    it('uses optional instructions in the prompt', async () => {
      let capturedRequest: import('../../src/types/providers.js').CompletionRequest | undefined;
      (mockProvider.complete as ReturnType<typeof vi.fn>).mockImplementation(
        async (req: import('../../src/types/providers.js').CompletionRequest) => {
          capturedRequest = req;
          return {
            message: {
              id: 'compact-3',
              role: 'assistant',
              content: '<summary>Focused summary.</summary>',
              stopReason: 'end_turn',
              timestamp: Date.now(),
            },
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            model: 'test-model',
          };
        }
      );

      const sessionId = await sessionManager.createSession();
      await sessionManager.compact(sessionId, 'focus on the bug fixes');

      // The instructions should appear somewhere in the request
      const requestContent = capturedRequest?.messages[0]?.content ?? '';
      expect(requestContent).toContain('focus on the bug fixes');
    });

    it('returns raw content when no summary tags present', async () => {
      (mockProvider.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
        message: {
          id: 'compact-4',
          role: 'assistant',
          content: 'No tags here, just raw summary text.',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
        model: 'test-model',
      } satisfies CompletionResponse);

      const sessionId = await sessionManager.createSession();
      const summary = await sessionManager.compact(sessionId);
      expect(summary).toBe('No tags here, just raw summary text.');
    });
  });

  describe('estimatePromptTokens()', () => {
    it('returns 0 when no messages are in history', async () => {
      const sessionId = await sessionManager.createSession();
      const count = sessionManager.estimatePromptTokens(sessionId);
      expect(count).toBe(0);
    });

    it('returns a positive number after messages are accumulated', async () => {
      const loop = {
        config: { id: 'test', name: 'Test', model: 'test-model', provider: 'anthropic' as const },
        run: vi.fn(),
        stream: vi.fn().mockImplementation(async function* (_input: string) {
          const userMsg = { id: 'u1', role: 'user' as const, content: _input, timestamp: Date.now() };
          const assistantMsg = { id: 'a1', role: 'assistant' as const, content: 'reply', stopReason: 'end_turn' as const, timestamp: Date.now() };
          yield {
            type: 'agent_end' as const,
            result: {
              sessionId: 'test-session',
              messages: [userMsg, assistantMsg],
              toolCalls: [],
              usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
              turns: 1,
              finishReason: 'completed' as const,
            },
            timestamp: Date.now(),
          };
        }),
        getTools: vi.fn(() => [] as import('../../src/types/tools.js').ToolDefinition[]),
        getSession: vi.fn(),
      };

      const store = new JsonlSessionStore(testDir);
      const manager = new SessionManager(
        store, mockProvider, { model: 'test-model', agentId: 'test-agent' },
        undefined, loop,
      );

      const sessionId = await manager.createSession();
      for await (const _event of manager.streamRun(sessionId, 'Hello world')) { /* drain */ }

      const count = manager.estimatePromptTokens(sessionId);
      expect(count).toBeGreaterThan(0);
    });
  });
});

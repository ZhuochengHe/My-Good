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
});

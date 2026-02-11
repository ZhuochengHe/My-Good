/**
 * Tests for session commands.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  sessionList,
  sessionShow,
  sessionDelete,
} from '../../../src/cli/commands/session.js';
import type { OutputAdapter } from '../../../src/cli/output-adapter.js';
import type { SessionManager } from '../../../src/session/session-manager.js';
import type { SearchResult } from '../../../src/session/session-manager.js';

describe('session commands', () => {
  let testDir: string;
  let mockOutput: OutputAdapter;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    testDir = join(tmpdir(), `cli-session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    mockOutput = {
      write: vi.fn(),
      writeError: vi.fn(),
      writeSuccess: vi.fn(),
      writeTokenUsage: vi.fn(),
    };

    mockSessionManager = {
      searchSessions: vi.fn(),
      loadSession: vi.fn(),
      deleteSession: vi.fn(),
    } as unknown as SessionManager;
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('sessionList', () => {
    it('should display list of sessions', async () => {
      const mockSessions: SearchResult[] = [
        {
          id: 'session-1',
          description: 'Test session 1',
          tags: ['test'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 5,
        },
        {
          id: 'session-2',
          description: 'Test session 2',
          tags: ['demo'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 3,
        },
      ];

      vi.mocked(mockSessionManager.searchSessions).mockResolvedValue(
        mockSessions
      );

      await sessionList({
        sessionManager: mockSessionManager,
        output: mockOutput,
      });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('session-1')
      );
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('session-2')
      );
    });

    it('should handle empty session list', async () => {
      vi.mocked(mockSessionManager.searchSessions).mockResolvedValue([]);

      await sessionList({
        sessionManager: mockSessionManager,
        output: mockOutput,
      });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('No sessions found')
      );
    });

    it('should filter by tag', async () => {
      await sessionList({
        sessionManager: mockSessionManager,
        output: mockOutput,
        tag: 'coding',
      });

      expect(mockSessionManager.searchSessions).toHaveBeenCalledWith({
        tag: 'coding',
      });
    });

    it('should filter by query', async () => {
      await sessionList({
        sessionManager: mockSessionManager,
        output: mockOutput,
        query: 'debug',
      });

      expect(mockSessionManager.searchSessions).toHaveBeenCalledWith({
        query: 'debug',
      });
    });

    it('should display session metadata', async () => {
      const mockSessions: SearchResult[] = [
        {
          id: 'test-id',
          description: 'Test description',
          tags: ['tag1', 'tag2'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 10,
        },
      ];

      vi.mocked(mockSessionManager.searchSessions).mockResolvedValue(
        mockSessions
      );

      await sessionList({
        sessionManager: mockSessionManager,
        output: mockOutput,
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');

      expect(allOutput).toContain('test-id');
      expect(allOutput).toContain('Test description');
      expect(allOutput).toContain('10');
    });
  });

  describe('sessionShow', () => {
    it('should display session details', async () => {
      const mockSession = {
        id: 'test-session',
        agentId: 'test-agent',
        metadata: {
          model: 'claude-sonnet-4-20250514',
          provider: 'anthropic' as const,
          totalTokens: 1000,
          toolCallCount: 5,
          turnCount: 3,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          description: 'Test session',
          tags: ['test'],
        },
        messages: [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' },
        ],
      };

      vi.mocked(mockSessionManager.loadSession).mockResolvedValue(mockSession);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test-session',
      });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('test-session')
      );
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('Test session')
      );
    });

    it('should handle non-existent session', async () => {
      vi.mocked(mockSessionManager.loadSession).mockResolvedValue(null);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'nonexistent',
      });

      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('not found')
      );
    });

    it('should display message count', async () => {
      const mockSession = {
        id: 'test',
        agentId: 'agent',
        metadata: {
          model: 'test',
          provider: 'anthropic' as const,
          totalTokens: 100,
          toolCallCount: 0,
          turnCount: 2,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          description: '',
          tags: [],
        },
        messages: [
          { role: 'user' as const, content: 'A' },
          { role: 'assistant' as const, content: 'B' },
          { role: 'user' as const, content: 'C' },
        ],
      };

      vi.mocked(mockSessionManager.loadSession).mockResolvedValue(mockSession);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test',
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');
      expect(allOutput).toContain('3');
    });
  });

  describe('sessionDelete', () => {
    it('should delete session', async () => {
      vi.mocked(mockSessionManager.deleteSession).mockResolvedValue();

      await sessionDelete({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test-session',
      });

      expect(mockSessionManager.deleteSession).toHaveBeenCalledWith(
        'test-session'
      );
      expect(mockOutput.writeSuccess).toHaveBeenCalledWith(
        expect.stringContaining('deleted')
      );
    });

    it('should handle deletion errors', async () => {
      vi.mocked(mockSessionManager.deleteSession).mockRejectedValue(
        new Error('Session not found')
      );

      await sessionDelete({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'nonexistent',
      });

      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('not found')
      );
    });

    it('should display deleted session ID', async () => {
      vi.mocked(mockSessionManager.deleteSession).mockResolvedValue();

      await sessionDelete({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'my-session-123',
      });

      expect(mockOutput.writeSuccess).toHaveBeenCalledWith(
        expect.stringContaining('my-session-123')
      );
    });
  });

  describe('sessionShow with --trace flag', () => {
    let mockStore: any;

    beforeEach(() => {
      // Create a mock store with loadWithTrace method
      mockStore = {
        loadWithTrace: vi.fn(),
      };

      // Add the mock store to the session manager
      (mockSessionManager as any).store = mockStore;
    });

    it('should display turn metadata when trace flag is true', async () => {
      const mockTraceData = {
        session: {
          id: 'test-session',
          agentId: 'test-agent',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            model: 'claude-sonnet-4-20250514',
            provider: 'anthropic' as const,
            totalTokens: 1000,
            toolCallCount: 5,
            turnCount: 2,
            description: 'Test session',
            tags: ['test'],
          },
          messages: [],
        },
        turnMetadata: [
          {
            type: 'turn_metadata' as const,
            turnNumber: 1,
            usage: {
              promptTokens: 150,
              completionTokens: 100,
              totalTokens: 250,
            },
            durationMs: 1200,
            toolCount: 2,
            stopReason: 'tool_use',
            timestamp: Date.now(),
          },
          {
            type: 'turn_metadata' as const,
            turnNumber: 2,
            usage: {
              promptTokens: 200,
              completionTokens: 150,
              totalTokens: 350,
            },
            durationMs: 1500,
            toolCount: 1,
            stopReason: 'end_turn',
            timestamp: Date.now(),
          },
        ],
        errorLogs: [],
      };

      vi.mocked(mockStore.loadWithTrace).mockResolvedValue(mockTraceData);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test-session',
        trace: true,
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');

      // Should display turn metadata
      expect(allOutput).toContain('Turn 1');
      expect(allOutput).toContain('Turn 2');
      expect(allOutput).toContain('1.2s');
      expect(allOutput).toContain('1.5s');
      expect(allOutput).toContain('250');
      expect(allOutput).toContain('350');
      expect(allOutput).toContain('tool_use');
      expect(allOutput).toContain('end_turn');
    });

    it('should display error logs when trace flag is true', async () => {
      const mockTraceData = {
        session: {
          id: 'test-session',
          agentId: 'test-agent',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            model: 'test',
            provider: 'anthropic' as const,
            totalTokens: 100,
            toolCallCount: 0,
            turnCount: 1,
            description: '',
            tags: [],
          },
          messages: [],
        },
        turnMetadata: [],
        errorLogs: [
          {
            type: 'error_log' as const,
            turnNumber: 1,
            error: 'TOOL_ERROR',
            message: 'Command timeout after 30s',
            context: 'during shell execution',
            timestamp: Date.now(),
          },
          {
            type: 'error_log' as const,
            error: 'PROVIDER_ERROR',
            message: 'API rate limit exceeded',
            timestamp: Date.now(),
          },
        ],
      };

      vi.mocked(mockStore.loadWithTrace).mockResolvedValue(mockTraceData);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test-session',
        trace: true,
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');

      // Should display error logs
      expect(allOutput).toContain('ERRORS');
      expect(allOutput).toContain('TOOL_ERROR');
      expect(allOutput).toContain('Command timeout');
      expect(allOutput).toContain('Turn 1');
      expect(allOutput).toContain('PROVIDER_ERROR');
      expect(allOutput).toContain('API rate limit');
    });

    it('should display both turn metadata and error logs', async () => {
      const mockTraceData = {
        session: {
          id: 'test-session',
          agentId: 'test-agent',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            model: 'test',
            provider: 'anthropic' as const,
            totalTokens: 100,
            toolCallCount: 0,
            turnCount: 1,
            description: '',
            tags: [],
          },
          messages: [],
        },
        turnMetadata: [
          {
            type: 'turn_metadata' as const,
            turnNumber: 1,
            usage: {
              promptTokens: 100,
              completionTokens: 50,
              totalTokens: 150,
            },
            durationMs: 800,
            toolCount: 0,
            stopReason: 'end_turn',
            timestamp: Date.now(),
          },
        ],
        errorLogs: [
          {
            type: 'error_log' as const,
            turnNumber: 1,
            error: 'VALIDATION_ERROR',
            message: 'Invalid parameter',
            timestamp: Date.now(),
          },
        ],
      };

      vi.mocked(mockStore.loadWithTrace).mockResolvedValue(mockTraceData);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test-session',
        trace: true,
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');

      // Should display both sections
      expect(allOutput).toContain('TURN METADATA');
      expect(allOutput).toContain('Turn 1');
      expect(allOutput).toContain('ERRORS');
      expect(allOutput).toContain('VALIDATION_ERROR');
    });

    it('should handle sessions with no trace data', async () => {
      const mockTraceData = {
        session: {
          id: 'old-session',
          agentId: 'test-agent',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            model: 'test',
            provider: 'anthropic' as const,
            totalTokens: 100,
            toolCallCount: 0,
            turnCount: 1,
            description: 'Old session',
            tags: [],
          },
          messages: [],
        },
        turnMetadata: [],
        errorLogs: [],
      };

      vi.mocked(mockStore.loadWithTrace).mockResolvedValue(mockTraceData);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'old-session',
        trace: true,
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');

      // Should display session info but no trace data
      expect(allOutput).toContain('old-session');
      expect(allOutput).toContain('Old session');
      // Should indicate no trace data available
      expect(allOutput).toMatch(/no trace data|trace data unavailable/i);
    });

    it('should use loadSession when trace flag is false', async () => {
      const mockSession = {
        id: 'test-session',
        agentId: 'test-agent',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          model: 'test',
          provider: 'anthropic' as const,
          totalTokens: 100,
          toolCallCount: 0,
          turnCount: 1,
          description: 'Test',
          tags: [],
        },
        messages: [],
      };

      vi.mocked(mockSessionManager.loadSession).mockResolvedValue(mockSession);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test-session',
        trace: false,
      });

      // Should call loadSession, not loadWithTrace
      expect(mockSessionManager.loadSession).toHaveBeenCalled();
      expect(mockStore.loadWithTrace).not.toHaveBeenCalled();

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');

      // Should NOT display trace sections
      expect(allOutput).not.toContain('TURN METADATA');
      expect(allOutput).not.toContain('ERRORS');
    });

    it('should use loadSession when trace flag is undefined', async () => {
      const mockSession = {
        id: 'test-session',
        agentId: 'test-agent',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          model: 'test',
          provider: 'anthropic' as const,
          totalTokens: 100,
          toolCallCount: 0,
          turnCount: 1,
          description: 'Test',
          tags: [],
        },
        messages: [],
      };

      vi.mocked(mockSessionManager.loadSession).mockResolvedValue(mockSession);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test-session',
        // trace flag omitted
      });

      expect(mockSessionManager.loadSession).toHaveBeenCalled();
      expect(mockStore.loadWithTrace).not.toHaveBeenCalled();
    });

    it('should format duration correctly', async () => {
      const mockTraceData = {
        session: {
          id: 'test',
          agentId: 'agent',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            model: 'test',
            provider: 'anthropic' as const,
            totalTokens: 100,
            toolCallCount: 0,
            turnCount: 1,
            description: '',
            tags: [],
          },
          messages: [],
        },
        turnMetadata: [
          {
            type: 'turn_metadata' as const,
            turnNumber: 1,
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            durationMs: 5432,
            toolCount: 0,
            stopReason: 'end_turn',
            timestamp: Date.now(),
          },
        ],
        errorLogs: [],
      };

      vi.mocked(mockStore.loadWithTrace).mockResolvedValue(mockTraceData);

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test',
        trace: true,
      });

      const writeCalls = vi.mocked(mockOutput.write).mock.calls;
      const allOutput = writeCalls.map((call) => call[0]).join('\n');

      // Should display duration as 5.4s
      expect(allOutput).toMatch(/5\.4s/);
    });

    it('should handle error when loadWithTrace is not available', async () => {
      // Remove loadWithTrace from store
      delete (mockSessionManager as any).store;

      await sessionShow({
        sessionManager: mockSessionManager,
        output: mockOutput,
        sessionId: 'test-session',
        trace: true,
      });

      // Should display error
      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('Trace data')
      );
    });
  });
});

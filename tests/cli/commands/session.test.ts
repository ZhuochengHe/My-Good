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
});

/**
 * Tests for slash command dispatcher.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSlashCommand } from '../../src/cli/slash-commands.js';
import type { SlashCommandContext } from '../../src/cli/slash-commands.js';

describe('handleSlashCommand', () => {
  let mockOutput: { write: ReturnType<typeof vi.fn>; writeError: ReturnType<typeof vi.fn> };
  let mockSessionManager: {
    searchSessions: ReturnType<typeof vi.fn>;
  };
  let context: SlashCommandContext;

  beforeEach(() => {
    mockOutput = { write: vi.fn(), writeError: vi.fn() };
    mockSessionManager = {
      searchSessions: vi.fn().mockResolvedValue([]),
    };
    context = {
      output: mockOutput as unknown as SlashCommandContext['output'],
      sessionManager: mockSessionManager as unknown as SlashCommandContext['sessionManager'],
      sessionId: 'test-session-id',
      config: {
        agent: { provider: 'anthropic', model: 'claude-sonnet-4-6', name: 'Test', id: 'test' },
      } as unknown as SlashCommandContext['config'],
    };
  });

  it('returns not handled for non-slash input', async () => {
    const result = await handleSlashCommand('hello world', context);
    expect(result.handled).toBe(false);
    expect(result.shouldExit).toBe(false);
  });

  it('returns not handled for empty string', async () => {
    const result = await handleSlashCommand('', context);
    expect(result.handled).toBe(false);
    expect(result.shouldExit).toBe(false);
  });

  describe('/help', () => {
    it('writes help text and marks handled', async () => {
      const result = await handleSlashCommand('/help', context);
      expect(result.handled).toBe(true);
      expect(result.shouldExit).toBe(false);
      expect(mockOutput.write).toHaveBeenCalled();
    });

    it('writes "Available commands:" section', async () => {
      await handleSlashCommand('/help', context);
      const calls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('Available commands:');
    });

    it('writes tips section', async () => {
      await handleSlashCommand('/help', context);
      const calls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('Tips:');
    });
  });

  describe('/?', () => {
    it('is an alias for /help', async () => {
      const result = await handleSlashCommand('/?', context);
      expect(result.handled).toBe(true);
      expect(mockOutput.write).toHaveBeenCalled();
    });
  });

  describe('/exit', () => {
    it('returns shouldExit true', async () => {
      const result = await handleSlashCommand('/exit', context);
      expect(result.handled).toBe(true);
      expect(result.shouldExit).toBe(true);
    });

    it('does not write any output', async () => {
      await handleSlashCommand('/exit', context);
      expect(mockOutput.write).not.toHaveBeenCalled();
      expect(mockOutput.writeError).not.toHaveBeenCalled();
    });
  });

  describe('/quit', () => {
    it('returns shouldExit true', async () => {
      const result = await handleSlashCommand('/quit', context);
      expect(result.handled).toBe(true);
      expect(result.shouldExit).toBe(true);
    });
  });

  describe('/clear', () => {
    it('writes the terminal clear escape sequence', async () => {
      const result = await handleSlashCommand('/clear', context);
      expect(result.handled).toBe(true);
      expect(result.shouldExit).toBe(false);
      expect(mockOutput.write).toHaveBeenCalledWith('\x1Bc');
    });
  });

  describe('/session (no args)', () => {
    it('marks command as handled', async () => {
      const result = await handleSlashCommand('/session', context);
      expect(result.handled).toBe(true);
      expect(result.shouldExit).toBe(false);
    });

    it('calls searchSessions', async () => {
      await handleSlashCommand('/session', context);
      expect(mockSessionManager.searchSessions).toHaveBeenCalled();
    });

    it('shows empty message when no sessions exist', async () => {
      const result = await handleSlashCommand('/session', context);
      expect(result.handled).toBe(true);
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('No sessions'),
      );
    });

    it('lists sessions when they exist', async () => {
      mockSessionManager.searchSessions.mockResolvedValue([
        {
          id: 'abc12345-uuid',
          description: 'test session',
          tags: [],
          createdAt: new Date('2024-01-01').getTime(),
          updatedAt: new Date('2024-01-01').getTime(),
          messageCount: 3,
        },
      ]);
      await handleSlashCommand('/session', context);
      const calls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('Recent sessions:');
      // Session short ID appears in one of the rows
      const rows = calls.filter((c: unknown) => typeof c === 'string' && (c as string).includes('abc12345'));
      expect(rows.length).toBeGreaterThan(0);
    });

    it('shows resume hint when sessions exist', async () => {
      mockSessionManager.searchSessions.mockResolvedValue([
        {
          id: 'abc12345-uuid',
          description: 'desc',
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 1,
        },
      ]);
      await handleSlashCommand('/session', context);
      const calls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0]);
      const hint = calls.find(
        (c: unknown) => typeof c === 'string' && (c as string).includes('--session'),
      );
      expect(hint).toBeDefined();
    });

    it('writes error when searchSessions throws', async () => {
      mockSessionManager.searchSessions.mockRejectedValue(new Error('DB error'));
      await handleSlashCommand('/session', context);
      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to list sessions'),
      );
    });
  });

  describe('/session <id>', () => {
    it('shows session details when found', async () => {
      mockSessionManager.searchSessions.mockResolvedValue([
        {
          id: 'abc12345-full-uuid',
          description: 'my test session',
          tags: [],
          createdAt: new Date('2024-06-15').getTime(),
          updatedAt: new Date('2024-06-15').getTime(),
          messageCount: 5,
        },
      ]);
      const result = await handleSlashCommand('/session abc12345', context);
      expect(result.handled).toBe(true);
      const calls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0]);
      const sessionLine = calls.find(
        (c: unknown) => typeof c === 'string' && (c as string).startsWith('Session:'),
      );
      expect(sessionLine).toBeDefined();
      expect(sessionLine).toContain('abc12345-full-uuid');
    });

    it('shows description when present', async () => {
      mockSessionManager.searchSessions.mockResolvedValue([
        {
          id: 'abc12345-full-uuid',
          description: 'my test session',
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 5,
        },
      ]);
      await handleSlashCommand('/session abc12345', context);
      const calls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0]);
      const descLine = calls.find(
        (c: unknown) => typeof c === 'string' && (c as string).includes('my test session'),
      );
      expect(descLine).toBeDefined();
    });

    it('shows message count', async () => {
      mockSessionManager.searchSessions.mockResolvedValue([
        {
          id: 'abc12345-full-uuid',
          description: '',
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 7,
        },
      ]);
      await handleSlashCommand('/session abc12345', context);
      const calls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0]);
      const msgLine = calls.find(
        (c: unknown) => typeof c === 'string' && (c as string).includes('Messages: 7'),
      );
      expect(msgLine).toBeDefined();
    });

    it('writes error when session not found', async () => {
      mockSessionManager.searchSessions.mockResolvedValue([]);
      await handleSlashCommand('/session nonexistent', context);
      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('Session not found: nonexistent'),
      );
    });

    it('writes error when searchSessions throws', async () => {
      mockSessionManager.searchSessions.mockRejectedValue(new Error('fail'));
      await handleSlashCommand('/session someid', context);
      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load session: someid'),
      );
    });
  });

  describe('/model', () => {
    it('shows provider and model from config', async () => {
      const result = await handleSlashCommand('/model', context);
      expect(result.handled).toBe(true);
      expect(result.shouldExit).toBe(false);
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('anthropic'),
      );
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('claude-sonnet-4-6'),
      );
    });

    it('shows "unknown" when config is absent', async () => {
      const noConfigContext: SlashCommandContext = { ...context, config: undefined };
      await handleSlashCommand('/model', noConfigContext);
      const calls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0]);
      const hasUnknown = calls.some(
        (c: unknown) => typeof c === 'string' && (c as string).includes('unknown'),
      );
      expect(hasUnknown).toBe(true);
    });

    it('shows setup hint', async () => {
      await handleSlashCommand('/model', context);
      const calls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0]);
      const hint = calls.find(
        (c: unknown) => typeof c === 'string' && (c as string).includes('my-agent setup'),
      );
      expect(hint).toBeDefined();
    });
  });

  describe('/compact', () => {
    beforeEach(() => {
      (mockSessionManager as unknown as Record<string, unknown>)['compact'] = vi.fn().mockResolvedValue('User was building a REST API.');
    });

    it('calls sessionManager.compact with no instructions when no args given', async () => {
      const result = await handleSlashCommand('/compact', context);
      expect(result.handled).toBe(true);
      expect(result.shouldExit).toBe(false);
      expect((mockSessionManager as unknown as Record<string, unknown>)['compact']).toHaveBeenCalledWith(
        context.sessionId,
        undefined,
      );
    });

    it('calls sessionManager.compact with joined args as instructions', async () => {
      await handleSlashCommand('/compact remember the goal', context);
      expect((mockSessionManager as unknown as Record<string, unknown>)['compact']).toHaveBeenCalledWith(
        context.sessionId,
        'remember the goal',
      );
    });

    it('writes the summary on success', async () => {
      await handleSlashCommand('/compact', context);
      const writeCalls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(writeCalls.some((s) => s.includes('User was building a REST API.'))).toBe(true);
    });

    it('writes a confirmation message on success', async () => {
      await handleSlashCommand('/compact', context);
      const writeCalls = mockOutput.write.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(writeCalls.some((s) => s.includes('compacted') || s.includes('Compacted') || s.includes('Context reset'))).toBe(true);
    });

    it('calls writeError when compact throws', async () => {
      (mockSessionManager as unknown as Record<string, unknown>)['compact'] = vi.fn().mockRejectedValue(
        new Error('Session not found'),
      );
      await handleSlashCommand('/compact', context);
      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('Session not found'),
      );
    });
  });

  describe('unknown command', () => {
    it('writes error for unknown command', async () => {
      const result = await handleSlashCommand('/foobar', context);
      expect(result.handled).toBe(true);
      expect(result.shouldExit).toBe(false);
      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('/foobar'),
      );
    });

    it('suggests /help in the error message', async () => {
      await handleSlashCommand('/unknown', context);
      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('/help'),
      );
    });
  });

  describe('case and whitespace handling', () => {
    it('is case-insensitive for command names', async () => {
      const result = await handleSlashCommand('/HELP', context);
      expect(result.handled).toBe(true);
      expect(mockOutput.write).toHaveBeenCalled();
    });

    it('strips leading/trailing whitespace from input', async () => {
      const result = await handleSlashCommand('  /exit  ', context);
      expect(result.handled).toBe(true);
      expect(result.shouldExit).toBe(true);
    });
  });
});

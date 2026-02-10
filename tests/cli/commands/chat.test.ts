/**
 * Tests for chat command.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chat } from '../../../src/cli/commands/chat.js';
import type { OutputAdapter } from '../../../src/cli/output-adapter.js';
import type { InputReader } from '../../../src/cli/input-reader.js';
import type { SessionManager, RunResult } from '../../../src/session/session-manager.js';

describe('chat command', () => {
  let mockOutput: OutputAdapter;
  let mockInput: InputReader;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    mockOutput = {
      write: vi.fn(),
      writeError: vi.fn(),
      writeSuccess: vi.fn(),
      writeTokenUsage: vi.fn(),
    };

    mockInput = {
      prompt: vi.fn(),
      close: vi.fn(),
    };

    mockSessionManager = {
      createSession: vi.fn(),
      resumeSession: vi.fn(),
      run: vi.fn(),
    } as unknown as SessionManager;
  });

  describe('interactive mode', () => {
    it('should create new session if no sessionId provided', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue(
        'new-session-id'
      );
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      expect(mockSessionManager.createSession).toHaveBeenCalled();
    });

    it('should resume existing session if sessionId provided', async () => {
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        sessionId: 'existing-session',
      });

      expect(mockSessionManager.resumeSession).toHaveBeenCalledWith(
        'existing-session'
      );
    });

    it('should display welcome message', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('Welcome')
      );
    });

    it('should handle user input and run agent', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt)
        .mockResolvedValueOnce('Hello')
        .mockResolvedValueOnce('exit');

      const mockRunResult: RunResult = {
        success: true,
        response: 'Hi there!',
        tokenUsage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
      };

      vi.mocked(mockSessionManager.run).mockResolvedValue(mockRunResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      expect(mockSessionManager.run).toHaveBeenCalledWith('test-id', 'Hello');
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('Hi there!')
      );
    });

    it('should display token usage after each turn', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt)
        .mockResolvedValueOnce('test')
        .mockResolvedValueOnce('exit');

      const mockRunResult: RunResult = {
        success: true,
        response: 'Response',
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
      };

      vi.mocked(mockSessionManager.run).mockResolvedValue(mockRunResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      expect(mockOutput.writeTokenUsage).toHaveBeenCalledWith({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
    });

    it('should handle empty input', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt)
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      // Should not call run for empty input
      expect(mockSessionManager.run).not.toHaveBeenCalled();
    });

    it('should exit on "exit" command', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('Goodbye')
      );
    });

    it('should exit on "quit" command', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('quit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('Goodbye')
      );
    });

    it('should handle agent errors gracefully', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt)
        .mockResolvedValueOnce('test')
        .mockResolvedValueOnce('exit');

      const mockRunResult: RunResult = {
        success: false,
        response: '',
        error: 'Something went wrong',
      };

      vi.mocked(mockSessionManager.run).mockResolvedValue(mockRunResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      expect(mockOutput.writeError).toHaveBeenCalledWith(
        expect.stringContaining('Something went wrong')
      );
    });

    it('should clean up input reader on exit', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      expect(mockInput.close).toHaveBeenCalled();
    });
  });

  describe('single message mode', () => {
    it('should run single message and exit', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');

      const mockRunResult: RunResult = {
        success: true,
        response: 'Response to message',
        tokenUsage: {
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30,
        },
      };

      vi.mocked(mockSessionManager.run).mockResolvedValue(mockRunResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        message: 'Single message',
      });

      expect(mockSessionManager.run).toHaveBeenCalledWith(
        'test-id',
        'Single message'
      );
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('Response to message')
      );
      // Should not prompt for more input
      expect(mockInput.prompt).not.toHaveBeenCalled();
    });

    it('should work with existing session', async () => {
      const mockRunResult: RunResult = {
        success: true,
        response: 'Response',
        tokenUsage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
      };

      vi.mocked(mockSessionManager.run).mockResolvedValue(mockRunResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        sessionId: 'existing-session',
        message: 'Test message',
      });

      expect(mockSessionManager.resumeSession).toHaveBeenCalledWith(
        'existing-session'
      );
      expect(mockSessionManager.run).toHaveBeenCalledWith(
        'existing-session',
        'Test message'
      );
    });

    it('should display token usage in single message mode', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');

      const mockRunResult: RunResult = {
        success: true,
        response: 'Response',
        tokenUsage: {
          inputTokens: 50,
          outputTokens: 25,
          totalTokens: 75,
        },
      };

      vi.mocked(mockSessionManager.run).mockResolvedValue(mockRunResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        message: 'Test',
      });

      expect(mockOutput.writeTokenUsage).toHaveBeenCalledWith({
        inputTokens: 50,
        outputTokens: 25,
        totalTokens: 75,
      });
    });
  });
});

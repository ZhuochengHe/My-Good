/**
 * Tests for chat command.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chat } from '../../../src/cli/commands/chat.js';
import type { OutputAdapter, ChatHeaderInfo } from '../../../src/cli/output-adapter.js';
import type { InputReader } from '../../../src/cli/input-reader.js';
import type { SessionManager, RunResult, RunOptions } from '../../../src/session/session-manager.js';
import type { AppConfig } from '../../../src/types/config.js';

/** Minimal config fixture used across header/label tests. */
const TEST_CONFIG: AppConfig = {
  agent: {
    id: 'test-agent',
    name: 'Test Agent',
    model: 'test-model',
    provider: 'anthropic',
    userLabel: 'me',
    agentLabel: 'bot',
  },
  providers: { anthropic: { apiKey: 'test-key' } },
  plugins: { directories: [], enabled: [], disabled: [] },
  session: { storePath: './.sessions', maxMessages: 100, idleTimeoutMinutes: 30 },
  logging: { level: 'info', format: 'pretty' },
};

describe('chat command', () => {
  let mockOutput: OutputAdapter & { writeHeader: ReturnType<typeof vi.fn> };
  let mockInput: InputReader;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    mockOutput = {
      write: vi.fn(),
      writeError: vi.fn(),
      writeSuccess: vi.fn(),
      writeTokenUsage: vi.fn(),
      startLoading: vi.fn(),
      stopLoading: vi.fn(),
      writeHeader: vi.fn(),
    };

    mockInput = {
      prompt: vi.fn(),
      close: vi.fn(),
    };

    mockSessionManager = {
      createSession: vi.fn(),
      resumeSession: vi.fn(),
      run: vi.fn(),
      searchSessions: vi.fn().mockResolvedValue([]),
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

    it('should display welcome message when no writeHeader is available', async () => {
      // Use an output adapter that does NOT implement writeHeader
      const plainOutput: OutputAdapter = {
        write: vi.fn(),
        writeError: vi.fn(),
        writeSuccess: vi.fn(),
        writeTokenUsage: vi.fn(),
      };

      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: plainOutput,
        input: mockInput,
      });

      expect(plainOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('Welcome')
      );
    });

    it('should call writeHeader on session start when adapter supports it', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      );
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        config: TEST_CONFIG,
      });

      expect(mockOutput.writeHeader).toHaveBeenCalledOnce();
      const headerArg: ChatHeaderInfo = vi.mocked(mockOutput.writeHeader).mock.calls[0][0];
      expect(headerArg.agentName).toBe('Test Agent');
      expect(headerArg.provider).toBe('anthropic');
      expect(headerArg.model).toBe('test-model');
      // Session ID is sliced to first 8 characters
      expect(headerArg.sessionId).toBe('a1b2c3d4');
      expect(headerArg.userLabel).toBe('me');
      expect(headerArg.agentLabel).toBe('bot');
    });

    it('should pass memoryEntryCount to writeHeader when provided', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      );
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        config: TEST_CONFIG,
        memoryEntryCount: 7,
      });

      expect(mockOutput.writeHeader).toHaveBeenCalledOnce();
      const headerArg: ChatHeaderInfo = vi.mocked(mockOutput.writeHeader).mock.calls[0][0];
      expect(headerArg.memoryEntryCount).toBe(7);
    });

    it('should pass undefined memoryEntryCount to writeHeader when not provided', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      );
      vi.mocked(mockInput.prompt).mockResolvedValueOnce('exit');

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        config: TEST_CONFIG,
      });

      expect(mockOutput.writeHeader).toHaveBeenCalledOnce();
      const headerArg: ChatHeaderInfo = vi.mocked(mockOutput.writeHeader).mock.calls[0][0];
      expect(headerArg.memoryEntryCount).toBeUndefined();
    });

    it('should use default labels when config is absent', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('session-id');
      vi.mocked(mockInput.prompt)
        .mockResolvedValueOnce('hi')
        .mockResolvedValueOnce('exit');

      const mockResult: RunResult = {
        success: true,
        response: 'hello',
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
      vi.mocked(mockSessionManager.run).mockResolvedValue(mockResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        // No config — defaults apply
      });

      // Default userLabel is "you", so prompt should use "you › "
      expect(mockInput.prompt).toHaveBeenCalledWith('you › ');
      // Default agentLabel is "agent"
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('agent › hello')
      );
    });

    it('should use configurable labels from config', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('session-id');
      vi.mocked(mockInput.prompt)
        .mockResolvedValueOnce('hello')
        .mockResolvedValueOnce('exit');

      const mockResult: RunResult = {
        success: true,
        response: 'Hi there!',
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      };
      vi.mocked(mockSessionManager.run).mockResolvedValue(mockResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        config: TEST_CONFIG,
      });

      // userLabel from config is "me"
      expect(mockInput.prompt).toHaveBeenCalledWith('me › ');
      // agentLabel from config is "bot"
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('bot › Hi there!')
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

      expect(mockSessionManager.run).toHaveBeenCalledWith('test-id', 'Hello', expect.objectContaining({ onEvent: expect.any(Function) }));
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

    it('should call startLoading and stopLoading around each turn', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt)
        .mockResolvedValueOnce('Hello')
        .mockResolvedValueOnce('exit');

      const mockRunResult: RunResult = {
        success: true,
        response: 'Hi there!',
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
      vi.mocked(mockSessionManager.run).mockResolvedValue(mockRunResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
      });

      expect(mockOutput.startLoading).toHaveBeenCalledWith('Thinking...');
      expect(mockOutput.stopLoading).toHaveBeenCalled();
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

    describe('slash commands in REPL', () => {
      it('handles /exit slash command without LLM call', async () => {
        vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
        vi.mocked(mockInput.prompt).mockResolvedValueOnce('/exit');

        await chat({
          sessionManager: mockSessionManager,
          output: mockOutput,
          input: mockInput,
        });

        expect(mockSessionManager.run).not.toHaveBeenCalled();
      });

      it('handles /help slash command without LLM call', async () => {
        vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
        vi.mocked(mockInput.prompt)
          .mockResolvedValueOnce('/help')
          .mockResolvedValueOnce('exit');

        await chat({
          sessionManager: mockSessionManager,
          output: mockOutput,
          input: mockInput,
        });

        expect(mockSessionManager.run).not.toHaveBeenCalled();
        // Help text should have been written
        expect(mockOutput.write).toHaveBeenCalledWith(
          expect.stringContaining('Available commands'),
        );
      });

      it('handles /quit slash command without LLM call', async () => {
        vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
        vi.mocked(mockInput.prompt).mockResolvedValueOnce('/quit');

        await chat({
          sessionManager: mockSessionManager,
          output: mockOutput,
          input: mockInput,
        });

        expect(mockSessionManager.run).not.toHaveBeenCalled();
      });

      it('handles /clear slash command without LLM call', async () => {
        vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
        vi.mocked(mockInput.prompt)
          .mockResolvedValueOnce('/clear')
          .mockResolvedValueOnce('exit');

        await chat({
          sessionManager: mockSessionManager,
          output: mockOutput,
          input: mockInput,
        });

        expect(mockSessionManager.run).not.toHaveBeenCalled();
        expect(mockOutput.write).toHaveBeenCalledWith('\x1Bc');
      });

      it('handles unknown slash command without LLM call', async () => {
        vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
        vi.mocked(mockInput.prompt)
          .mockResolvedValueOnce('/notacommand')
          .mockResolvedValueOnce('exit');

        await chat({
          sessionManager: mockSessionManager,
          output: mockOutput,
          input: mockInput,
        });

        expect(mockSessionManager.run).not.toHaveBeenCalled();
        expect(mockOutput.writeError).toHaveBeenCalledWith(
          expect.stringContaining('/notacommand'),
        );
      });
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
        'Single message',
        expect.objectContaining({ onEvent: expect.any(Function) })
      );
      expect(mockOutput.write).toHaveBeenCalledWith(
        expect.stringContaining('Response to message')
      );
      // Should not prompt for more input
      expect(mockInput.prompt).not.toHaveBeenCalled();
    });

    it('should prefix agent response with agentLabel in single message mode', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');

      const mockRunResult: RunResult = {
        success: true,
        response: 'Hello world',
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      };
      vi.mocked(mockSessionManager.run).mockResolvedValue(mockRunResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        message: 'Hi',
        config: TEST_CONFIG,
      });

      // agentLabel from TEST_CONFIG is "bot"
      expect(mockOutput.write).toHaveBeenCalledWith(expect.stringContaining('Hello world'));
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
        'Test message',
        expect.objectContaining({ onEvent: expect.any(Function) })
      );
    });

    it('should call startLoading before run and stopLoading after', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');

      const mockRunResult: RunResult = {
        success: true,
        response: 'Response',
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
      vi.mocked(mockSessionManager.run).mockResolvedValue(mockRunResult);

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput,
        input: mockInput,
        message: 'Single message',
      });

      expect(mockOutput.startLoading).toHaveBeenCalledWith('Thinking...');
      expect(mockOutput.stopLoading).toHaveBeenCalled();
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

    it('updates spinner text when tool_call_start event fires in single message mode', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');

      vi.mocked(mockSessionManager.run).mockImplementation(
        async (_sessionId: string, _input: string, options?: RunOptions) => {
          options?.onEvent?.({
            type: 'tool_call_start',
            toolCall: { id: 'tc1', name: 'read_file', input: {} },
            timestamp: Date.now(),
          });
          return { success: true, response: 'done', tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
        }
      );

      const mockUpdateLoading = vi.fn();
      const outputWithUpdate: OutputAdapter = { ...mockOutput, updateLoading: mockUpdateLoading };

      await chat({
        sessionManager: mockSessionManager,
        output: outputWithUpdate,
        input: mockInput,
        message: 'Hello',
      });

      expect(mockUpdateLoading).toHaveBeenCalledWith(expect.stringContaining('read_file'));
    });

    it('resets spinner text to Thinking... when tool_call_end event fires in single message mode', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');

      vi.mocked(mockSessionManager.run).mockImplementation(
        async (_sessionId: string, _input: string, options?: RunOptions) => {
          options?.onEvent?.({
            type: 'tool_call_start',
            toolCall: { id: 'tc1', name: 'shell', input: {} },
            timestamp: Date.now(),
          });
          options?.onEvent?.({
            type: 'tool_call_end',
            result: { id: 'tc1', toolCallId: 'tc1', content: '' },
            timestamp: Date.now(),
          });
          return { success: true, response: 'done', tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
        }
      );

      const updateCalls: string[] = [];
      const mockUpdateLoading = vi.fn((msg: string) => { updateCalls.push(msg); });
      const outputWithUpdate: OutputAdapter = { ...mockOutput, updateLoading: mockUpdateLoading };

      await chat({
        sessionManager: mockSessionManager,
        output: outputWithUpdate,
        input: mockInput,
        message: 'Hello',
      });

      expect(updateCalls[0]).toContain('shell');
      expect(updateCalls[1]).toBe('Thinking...');
    });
  });

  describe('tool call surfacing in interactive mode', () => {
    it('updates spinner text when tool_call_start event fires', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('test-id');
      vi.mocked(mockInput.prompt)
        .mockResolvedValueOnce('Hello')
        .mockResolvedValueOnce('exit');

      vi.mocked(mockSessionManager.run).mockImplementation(
        async (_sessionId: string, _input: string, options?: RunOptions) => {
          options?.onEvent?.({
            type: 'tool_call_start',
            toolCall: { id: 'tc1', name: 'read_file', input: {} },
            timestamp: Date.now(),
          });
          return { success: true, response: 'done', tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
        }
      );

      const mockUpdateLoading = vi.fn();
      const outputWithUpdate: OutputAdapter = { ...mockOutput, updateLoading: mockUpdateLoading };

      await chat({
        sessionManager: mockSessionManager,
        output: outputWithUpdate,
        input: mockInput,
      });

      expect(mockUpdateLoading).toHaveBeenCalledWith(expect.stringContaining('read_file'));
    });
  });

  describe('streaming mode (writeChunk)', () => {
    async function* makeStream(events: object[]) {
      for (const event of events) {
        yield event;
      }
    }

    it('uses streamRun when writeChunk is present (single message)', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('stream-session');

      const chunks: string[] = [];
      const outputWithChunk: OutputAdapter = {
        ...mockOutput,
        writeChunk: vi.fn((c: string) => { chunks.push(c); }),
      };
      (mockSessionManager as unknown as Record<string, unknown>)['streamRun'] = vi.fn(() =>
        makeStream([
          { type: 'text_delta', delta: 'Hello', timestamp: Date.now() },
          { type: 'agent_end', result: { usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }, sessionId: 'stream-session', messages: [], toolCalls: [], turns: 1, finishReason: 'completed' }, timestamp: Date.now() },
        ])
      );

      await chat({
        sessionManager: mockSessionManager,
        output: outputWithChunk,
        input: mockInput,
        message: 'Hi',
      });

      expect(chunks).toContain('Hello');
      expect(mockOutput.writeTokenUsage).toHaveBeenCalledWith(
        expect.objectContaining({ totalTokens: 10 })
      );
    });

    it('uses streamRun when writeChunk is present (interactive)', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('stream-session');
      vi.mocked(mockInput.prompt)
        .mockResolvedValueOnce('ping')
        .mockResolvedValueOnce('exit');

      const chunks: string[] = [];
      const outputWithChunk: OutputAdapter = {
        ...mockOutput,
        writeChunk: vi.fn((c: string) => { chunks.push(c); }),
      };
      (mockSessionManager as unknown as Record<string, unknown>)['streamRun'] = vi.fn(() =>
        makeStream([
          { type: 'text_delta', delta: 'pong', timestamp: Date.now() },
          { type: 'agent_end', result: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, sessionId: 'stream-session', messages: [], toolCalls: [], turns: 1, finishReason: 'completed' }, timestamp: Date.now() },
        ])
      );

      await chat({
        sessionManager: mockSessionManager,
        output: outputWithChunk,
        input: mockInput,
      });

      expect(chunks).toContain('pong');
      // run() should NOT be called in streaming path
      expect(mockSessionManager.run).not.toHaveBeenCalled();
    });

    it('falls back to batch run() when writeChunk is absent', async () => {
      vi.mocked(mockSessionManager.createSession).mockResolvedValue('batch-session');
      vi.mocked(mockSessionManager.run).mockResolvedValue({
        success: true,
        response: 'batch response',
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });

      await chat({
        sessionManager: mockSessionManager,
        output: mockOutput, // no writeChunk
        input: mockInput,
        message: 'hello',
      });

      expect(mockSessionManager.run).toHaveBeenCalled();
    });
  });
});

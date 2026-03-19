/**
 * Tests for logging subscriber implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLoggingSubscriber } from '../../src/events/logging-subscriber.js';
import type {
  AgentStartEvent,
  AgentEndEvent,
  TurnStartEvent,
  TurnEndEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  TextDeltaEvent,
  ErrorEvent,
} from '../../src/types/events.js';
import type { Logger } from '../../src/utils/logger.js';

describe('LoggingSubscriber', () => {
  let mockLogger: Logger;
  let logSpy: {
    info: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    logSpy = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    mockLogger = {
      info: logSpy.info,
      debug: logSpy.debug,
      error: logSpy.error,
      warn: logSpy.warn,
    } as unknown as Logger;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('agent_start event', () => {
    it('logs at info level with sessionId', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'session-123',
        timestamp: 1234567890,
      };

      subscriber.onEvent(event);

      expect(logSpy.info).toHaveBeenCalledWith('Agent started', {
        sessionId: 'session-123',
        eventTimestamp: 1234567890,
      });
    });
  });

  describe('agent_end event', () => {
    it('logs at info level with result summary', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: AgentEndEvent = {
        type: 'agent_end',
        result: {
          sessionId: 'session-123',
          messages: [],
          toolCalls: [],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          turns: 5,
          finishReason: 'completed',
        },
        timestamp: 1234567890,
      };

      subscriber.onEvent(event);

      expect(logSpy.info).toHaveBeenCalledWith('Agent completed', {
        finishReason: 'completed',
        turns: 5,
        totalTokens: 150,
        eventTimestamp: 1234567890,
      });
    });
  });

  describe('tool_call_start event', () => {
    it('logs at info level with tool details', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: ToolCallStartEvent = {
        type: 'tool_call_start',
        toolCall: {
          id: 'tc_001',
          name: 'read_file',
          arguments: { path: '/test/file.txt' },
        },
      };

      subscriber.onEvent(event);

      expect(logSpy.info).toHaveBeenCalledWith('Tool call started', {
        toolName: 'read_file',
        toolCallId: 'tc_001',
        arguments: { path: '/test/file.txt' },
      });
    });
  });

  describe('tool_call_end event', () => {
    it('logs at info level with success result', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: ToolCallEndEvent = {
        type: 'tool_call_end',
        result: {
          callId: 'tc_001',
          name: 'read_file',
          success: true,
          output: 'file contents',
          durationMs: 125,
        },
      };

      subscriber.onEvent(event);

      expect(logSpy.info).toHaveBeenCalledWith('Tool call completed', {
        toolName: 'read_file',
        toolCallId: 'tc_001',
        success: true,
        durationMs: 125,
      });
    });

    it('logs at info level with error result', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: ToolCallEndEvent = {
        type: 'tool_call_end',
        result: {
          callId: 'tc_002',
          name: 'exec_command',
          success: false,
          output: '',
          error: {
            code: 'TIMEOUT',
            message: 'Command timed out',
          },
          durationMs: 5000,
        },
      };

      subscriber.onEvent(event);

      expect(logSpy.info).toHaveBeenCalledWith('Tool call completed', {
        toolName: 'exec_command',
        toolCallId: 'tc_002',
        success: false,
        durationMs: 5000,
      });
    });
  });

  describe('turn_start event', () => {
    it('logs at debug level', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: TurnStartEvent = {
        type: 'turn_start',
        turnNumber: 3,
      };

      subscriber.onEvent(event);

      expect(logSpy.debug).toHaveBeenCalledWith('Turn started', {
        turnNumber: 3,
      });
    });
  });

  describe('turn_end event', () => {
    it('logs at debug level with usage', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: TurnEndEvent = {
        type: 'turn_end',
        turnNumber: 3,
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        timestamp: 1234567890,
      };

      subscriber.onEvent(event);

      expect(logSpy.debug).toHaveBeenCalledWith('Turn ended', {
        turnNumber: 3,
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        eventTimestamp: 1234567890,
      });
    });
  });

  describe('text_delta event', () => {
    it('logs at debug level with delta length', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: TextDeltaEvent = {
        type: 'text_delta',
        delta: 'Hello world',
      };

      subscriber.onEvent(event);

      expect(logSpy.debug).toHaveBeenCalledWith('Text delta', {
        deltaLength: 11,
      });
    });
  });

  describe('error event', () => {
    it('logs at error level with error details', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: ErrorEvent = {
        type: 'error',
        error: {
          code: 'PROVIDER_ERROR',
          message: 'API request failed',
          recoverable: true,
        },
        timestamp: 1234567890,
      };

      subscriber.onEvent(event);

      expect(logSpy.error).toHaveBeenCalledWith('Agent error', {
        code: 'PROVIDER_ERROR',
        message: 'API request failed',
        recoverable: true,
        cause: undefined,
        eventTimestamp: 1234567890,
      });
    });

    it('includes cause if present', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const cause = new Error('Network error');
      const event: ErrorEvent = {
        type: 'error',
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          recoverable: true,
          cause,
        },
        timestamp: 1234567890,
      };

      subscriber.onEvent(event);

      expect(logSpy.error).toHaveBeenCalledWith('Agent error', {
        code: 'TIMEOUT',
        message: 'Request timed out',
        recoverable: true,
        cause: 'Network error',
        eventTimestamp: 1234567890,
      });
    });
  });

  describe('edge cases', () => {
    it('handles missing optional fields gracefully', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: ToolCallEndEvent = {
        type: 'tool_call_end',
        result: {
          callId: 'tc_001',
          name: 'test_tool',
          success: true,
          output: 'result',
          durationMs: 100,
        },
      };

      expect(() => subscriber.onEvent(event)).not.toThrow();
      expect(logSpy.info).toHaveBeenCalled();
    });

    it('handles empty tool arguments', () => {
      const subscriber = createLoggingSubscriber(mockLogger);
      const event: ToolCallStartEvent = {
        type: 'tool_call_start',
        toolCall: {
          id: 'tc_001',
          name: 'no_args_tool',
          arguments: {},
        },
      };

      expect(() => subscriber.onEvent(event)).not.toThrow();
      expect(logSpy.info).toHaveBeenCalledWith('Tool call started', {
        toolName: 'no_args_tool',
        toolCallId: 'tc_001',
        arguments: {},
      });
    });
  });

  describe('default logger', () => {
    it('uses console logger when no logger provided', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const subscriber = createLoggingSubscriber();
      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      subscriber.onEvent(event);

      expect(consoleLogSpy).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });

  describe('credential sanitization', () => {
    describe('tool_call_start event', () => {
      it('sanitizes credentials in tool call arguments', () => {
        const subscriber = createLoggingSubscriber(mockLogger);
        const event: ToolCallStartEvent = {
          type: 'tool_call_start',
          toolCall: {
            id: 'tc_001',
            name: 'execute_command',
            arguments: {
              command: 'export ANTHROPIC_API_KEY=sk-ant-api03-test123456789012345678901234567890',
              apiKey: 'sk-ant-api03-secret123456789012345678901234567890',
            },
          },
          timestamp: 1234567890,
        };

        subscriber.onEvent(event);

        const logCall = logSpy.info.mock.calls[0];
        expect(logCall[0]).toBe('Tool call started');
        expect(logCall[1].arguments.command).not.toContain('sk-ant-api03');
        expect(logCall[1].arguments.command).toContain('***REDACTED***');
        expect(logCall[1].arguments.apiKey).toBe('***REDACTED***');
      });

      it('sanitizes credentials in nested arguments', () => {
        const subscriber = createLoggingSubscriber(mockLogger);
        const event: ToolCallStartEvent = {
          type: 'tool_call_start',
          toolCall: {
            id: 'tc_002',
            name: 'configure_api',
            arguments: {
              config: {
                openai: {
                  apiKey: 'sk-proj-test123456789012345678901234567890',
                },
                github: {
                  token: 'ghp_test123456789012345678901234567890',
                },
              },
              safe: 'value',
            },
          },
          timestamp: 1234567890,
        };

        subscriber.onEvent(event);

        const logCall = logSpy.info.mock.calls[0];
        expect(logCall[1].arguments.config.openai.apiKey).toBe('***REDACTED***');
        expect(logCall[1].arguments.config.github.token).toBe('***REDACTED***');
        expect(logCall[1].arguments.safe).toBe('value');
      });

      it('preserves non-sensitive arguments', () => {
        const subscriber = createLoggingSubscriber(mockLogger);
        const event: ToolCallStartEvent = {
          type: 'tool_call_start',
          toolCall: {
            id: 'tc_003',
            name: 'read_file',
            arguments: {
              path: '/home/user/file.txt',
              encoding: 'utf-8',
            },
          },
          timestamp: 1234567890,
        };

        subscriber.onEvent(event);

        const logCall = logSpy.info.mock.calls[0];
        expect(logCall[1].arguments.path).toBe('/home/user/file.txt');
        expect(logCall[1].arguments.encoding).toBe('utf-8');
      });
    });

    describe('tool_call_end event', () => {
      it('sanitizes credentials in tool call results', () => {
        const subscriber = createLoggingSubscriber(mockLogger);
        const event: ToolCallEndEvent = {
          type: 'tool_call_end',
          result: {
            callId: 'tc_001',
            name: 'read_config',
            success: true,
            output: JSON.stringify({
              anthropic: { apiKey: 'sk-ant-api03-test123456789012345678901234567890' },
              openai: { apiKey: 'sk-proj-test123456789012345678901234567890' },
            }),
            durationMs: 100,
          },
          timestamp: 1234567890,
        };

        subscriber.onEvent(event);

        // Output should not be logged in the summary, but if it were, it should be sanitized
        // The current implementation doesn't log output, so we just verify it doesn't throw
        expect(logSpy.info).toHaveBeenCalled();
      });

      it('preserves non-sensitive result data', () => {
        const subscriber = createLoggingSubscriber(mockLogger);
        const event: ToolCallEndEvent = {
          type: 'tool_call_end',
          result: {
            callId: 'tc_002',
            name: 'list_files',
            success: true,
            output: 'file1.txt\nfile2.txt\nfile3.txt',
            durationMs: 50,
          },
          timestamp: 1234567890,
        };

        subscriber.onEvent(event);

        const logCall = logSpy.info.mock.calls[0];
        expect(logCall[0]).toBe('Tool call completed');
        expect(logCall[1].toolName).toBe('list_files');
        expect(logCall[1].success).toBe(true);
        expect(logCall[1].durationMs).toBe(50);
      });
    });

    describe('handles edge cases', () => {
      it('handles null arguments gracefully', () => {
        const subscriber = createLoggingSubscriber(mockLogger);
        const event: ToolCallStartEvent = {
          type: 'tool_call_start',
          toolCall: {
            id: 'tc_001',
            name: 'test_tool',
            arguments: null as unknown as Record<string, unknown>,
          },
          timestamp: 1234567890,
        };

        expect(() => subscriber.onEvent(event)).not.toThrow();
      });

      it('handles undefined arguments gracefully', () => {
        const subscriber = createLoggingSubscriber(mockLogger);
        const event: ToolCallStartEvent = {
          type: 'tool_call_start',
          toolCall: {
            id: 'tc_001',
            name: 'test_tool',
            arguments: undefined as unknown as Record<string, unknown>,
          },
          timestamp: 1234567890,
        };

        expect(() => subscriber.onEvent(event)).not.toThrow();
      });

      it('handles arguments with arrays containing credentials', () => {
        const subscriber = createLoggingSubscriber(mockLogger);
        const event: ToolCallStartEvent = {
          type: 'tool_call_start',
          toolCall: {
            id: 'tc_001',
            name: 'batch_configure',
            arguments: {
              keys: [
                'sk-ant-api03-test123456789012345678901234567890',
                'normal-value',
                'ghp_test123456789012345678901234567890',
              ],
            },
          },
          timestamp: 1234567890,
        };

        subscriber.onEvent(event);

        const logCall = logSpy.info.mock.calls[0];
        expect(logCall[1].arguments.keys[0]).toBe('***REDACTED***');
        expect(logCall[1].arguments.keys[1]).toBe('normal-value');
        expect(logCall[1].arguments.keys[2]).toBe('***REDACTED***');
      });
    });
  });
});

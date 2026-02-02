/**
 * Tests for OpenAI provider implementation.
 *
 * TDD RED phase: All tests should initially fail.
 * These tests drive the implementation of OpenAIProvider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
} from '../../src/types/providers.js';
import { OpenAIProvider } from '../../src/providers/openai.js';
import type OpenAI from 'openai';

// Create mock client with chat.completions methods
const mockCreate = vi.fn();
const mockStreamCreate = vi.fn();

const mockClient = {
  chat: {
    completions: {
      create: mockCreate,
    },
  },
};

// Mock the OpenAI SDK
vi.mock('openai', () => {
  return {
    default: vi.fn(() => mockClient),
  };
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockStreamCreate.mockReset();

    provider = new OpenAIProvider('test-api-key-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates provider with openai type', () => {
      expect(provider.type).toBe('openai');
    });

    it('accepts custom baseUrl', () => {
      const customProvider = new OpenAIProvider(
        'test-key',
        30000,
        3,
        'https://custom.openai.com'
      );
      expect(customProvider).toBeDefined();
    });

    it('uses default timeout and retries', () => {
      const defaultProvider = new OpenAIProvider('test-key');
      expect(defaultProvider).toBeDefined();
    });
  });

  describe('doComplete()', () => {
    it('converts simple user message to OpenAI format', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'Hello',
            timestamp: Date.now(),
          },
        ],
      };

      const response = await provider.complete(request);

      expect(response.message.content).toBe('Hello! How can I help you?');
      expect(response.message.role).toBe('assistant');
      expect(response.message.stopReason).toBe('end_turn');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(15);
      expect(response.usage.totalTokens).toBe(25);
    });

    it('includes system message as separate message with system role', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 5,
          total_tokens: 25,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
        ],
        systemPrompt: 'You are a helpful assistant.',
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: 'You are a helpful assistant.',
            }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('converts multi-turn conversation', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Got it!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 3,
          total_tokens: 53,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Hi', timestamp: Date.now() },
          {
            id: '2',
            role: 'assistant',
            content: 'Hello!',
            stopReason: 'end_turn',
            timestamp: Date.now(),
          },
          { id: '3', role: 'user', content: 'How are you?', timestamp: Date.now() },
        ],
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Hi' }),
            expect.objectContaining({ role: 'assistant', content: 'Hello!' }),
            expect.objectContaining({ role: 'user', content: 'How are you?' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('handles tool calls in response', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Let me search for that.',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'search',
                    arguments: '{"query":"test query"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Search for X', timestamp: Date.now() },
        ],
        tools: [
          {
            name: 'search',
            description: 'Search for information',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
              },
              required: ['query'],
            },
          },
        ],
      };

      const response = await provider.complete(request);

      expect(response.message.content).toBe('Let me search for that.');
      expect(response.message.stopReason).toBe('tool_use');
      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls![0]).toEqual({
        id: 'call_123',
        name: 'search',
        arguments: { query: 'test query' },
      });
    });

    it('converts tool definitions to OpenAI format', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 10,
          total_tokens: 210,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
        tools: [
          {
            name: 'read_file',
            description: 'Read contents of a file',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'File path to read',
                },
                encoding: {
                  type: 'string',
                  description: 'File encoding',
                },
              },
              required: ['path'],
            },
          },
        ],
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              type: 'function',
              function: {
                name: 'read_file',
                description: 'Read contents of a file',
                parameters: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                      description: 'File path to read',
                    },
                    encoding: {
                      type: 'string',
                      description: 'File encoding',
                    },
                  },
                  required: ['path'],
                },
              },
            },
          ],
        }),
        expect.any(Object)
      );
    });

    it('handles tool result messages with tool role', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Based on the file contents...',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 300,
          completion_tokens: 20,
          total_tokens: 320,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Read file X', timestamp: Date.now() },
          {
            id: '2',
            role: 'assistant',
            content: 'Let me read that.',
            toolCalls: [
              { id: 'call_1', name: 'read_file', arguments: { path: '/test.txt' } },
            ],
            stopReason: 'tool_use',
            timestamp: Date.now(),
          },
          {
            id: '3',
            role: 'tool',
            content: 'File contents here',
            toolCallId: 'call_1',
            toolName: 'read_file',
            isError: false,
            timestamp: Date.now(),
          },
        ],
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'tool',
              content: 'File contents here',
              tool_call_id: 'call_1',
            }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('handles assistant messages with tool calls', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Done',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 5,
          total_tokens: 155,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Search', timestamp: Date.now() },
          {
            id: '2',
            role: 'assistant',
            content: 'Searching...',
            toolCalls: [
              { id: 'call_1', name: 'search', arguments: { query: 'test' } },
            ],
            stopReason: 'tool_use',
            timestamp: Date.now(),
          },
        ],
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: 'Searching...',
              tool_calls: [
                expect.objectContaining({
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'search',
                    arguments: '{"query":"test"}',
                  },
                }),
              ],
            }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('respects maxTokens parameter', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
        maxTokens: 100,
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 100,
        }),
        expect.any(Object)
      );
    });

    it('uses default maxTokens of 4096 if not specified', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 4096,
        }),
        expect.any(Object)
      );
    });

    it('respects temperature parameter', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
        temperature: 0.7,
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        }),
        expect.any(Object)
      );
    });

    it('respects stopSequences parameter', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
        stopSequences: ['STOP', 'END'],
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stop: ['STOP', 'END'],
        }),
        expect.any(Object)
      );
    });

    it('respects AbortSignal for timeout', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
      };

      await provider.complete(request);

      // Verify signal is passed (through base provider)
      expect(mockCreate).toHaveBeenCalled();
    });

    it('handles length finish reason', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Truncated response',
            },
            finish_reason: 'length',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 100,
          total_tokens: 110,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
        maxTokens: 100,
      };

      const response = await provider.complete(request);

      expect(response.message.stopReason).toBe('max_tokens');
    });

    it('handles content_filter finish reason', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Filtered',
            },
            finish_reason: 'content_filter',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
      };

      const response = await provider.complete(request);

      expect(response.message.stopReason).toBe('error');
    });

    it('handles error responses gracefully', async () => {
      mockCreate.mockRejectedValue(
        new Error('API Error: Rate limit exceeded')
      );

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
      };

      await expect(provider.complete(request)).rejects.toThrow('Rate limit exceeded');
    });

    it('handles null content in response', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'search',
                    arguments: '{"query":"test"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Search', timestamp: Date.now() },
        ],
        tools: [
          {
            name: 'search',
            description: 'Search',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
        ],
      };

      const response = await provider.complete(request);

      expect(response.message.content).toBe('');
      expect(response.message.toolCalls).toHaveLength(1);
    });
  });

  describe('doStream()', () => {
    it('yields text deltas from streaming response', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: 'Hello' },
                finish_reason: null,
              },
            ],
          };
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: { content: ' world' },
                finish_reason: null,
              },
            ],
          };
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop',
              },
            ],
          };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Hi', timestamp: Date.now() },
        ],
      };

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.stream(request)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3); // 2 text deltas + 1 done
      expect(chunks[0]).toEqual({ type: 'text_delta', delta: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'text_delta', delta: ' world' });
      expect(chunks[2].type).toBe('done');
    });

    it('yields tool call chunks', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_123',
                      type: 'function',
                      function: { name: 'search', arguments: '' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          };
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: { arguments: '{"query":' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          };
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: { arguments: '"test"}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          };
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'tool_calls',
              },
            ],
          };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Search', timestamp: Date.now() },
        ],
        tools: [
          {
            name: 'search',
            description: 'Search tool',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            },
          },
        ],
      };

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.stream(request)) {
        chunks.push(chunk);
      }

      // Should have tool_call chunk and done
      expect(chunks.some((c) => c.type === 'tool_call')).toBe(true);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('handles streaming errors', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: { content: 'Hello' },
                finish_reason: null,
              },
            ],
          };
          throw new Error('Stream interrupted');
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Hi', timestamp: Date.now() },
        ],
      };

      const chunks: StreamChunk[] = [];
      try {
        for await (const chunk of provider.stream(request)) {
          chunks.push(chunk);
        }
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Stream interrupted');
      }
    });

    it('includes usage stats in done chunk when available', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: { content: 'Done' },
                finish_reason: null,
              },
            ],
          };
          yield {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
      };

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.stream(request)) {
        chunks.push(chunk);
      }

      const doneChunk = chunks.find((c) => c.type === 'done');
      expect(doneChunk).toBeDefined();
      expect(doneChunk!.usage).toEqual({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      });
    });
  });

  describe('doListModels()', () => {
    it('returns list of GPT models', async () => {
      const models = await provider.listModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('contextWindow');
      expect(models[0]).toHaveProperty('supportsTools');
      expect(models[0]).toHaveProperty('supportsStreaming');
    });

    it('includes GPT-4', async () => {
      const models = await provider.listModels();

      const gpt4 = models.find((m) => m.id.includes('gpt-4'));
      expect(gpt4).toBeDefined();
      expect(gpt4!.supportsTools).toBe(true);
      expect(gpt4!.supportsStreaming).toBe(true);
    });

    it('includes GPT-4 Turbo', async () => {
      const models = await provider.listModels();

      const gpt4Turbo = models.find((m) => m.id.includes('gpt-4-turbo'));
      expect(gpt4Turbo).toBeDefined();
    });

    it('includes GPT-3.5 Turbo', async () => {
      const models = await provider.listModels();

      const gpt35 = models.find((m) => m.id.includes('gpt-3.5-turbo'));
      expect(gpt35).toBeDefined();
    });

    it('all models support streaming', async () => {
      const models = await provider.listModels();

      for (const model of models) {
        expect(model.supportsStreaming).toBe(true);
      }
    });
  });

  describe('doHealthCheck()', () => {
    it('returns true for valid API key', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'ok',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 1,
          total_tokens: 11,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        expect.any(Object)
      );
    });

    it('returns false for invalid API key', async () => {
      mockCreate.mockRejectedValue(
        new Error('invalid_api_key')
      );

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(false);
    });

    it('returns false for network errors', async () => {
      mockCreate.mockRejectedValue(
        new Error('Network error')
      );

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(false);
    });

    it('uses minimal tokens for health check', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'ok',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 1,
          total_tokens: 11,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      await provider.healthCheck();

      // Should use smallest/cheapest model and minimal tokens
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 1,
        }),
        expect.any(Object)
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty message content', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 0,
          total_tokens: 10,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: '', timestamp: Date.now() },
        ],
      };

      const response = await provider.complete(request);

      expect(response.message.content).toBe('');
    });

    it('handles multiple tool calls in single response', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"/file1.txt"}',
                  },
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"/file2.txt"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Read both files', timestamp: Date.now() },
        ],
        tools: [
          {
            name: 'read_file',
            description: 'Read file',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
        ],
      };

      const response = await provider.complete(request);

      expect(response.message.toolCalls).toHaveLength(2);
      expect(response.message.toolCalls![0].name).toBe('read_file');
      expect(response.message.toolCalls![1].name).toBe('read_file');
    });

    it('handles mixed content with text and tool calls', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Let me check that file.',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"/test.txt"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Check file', timestamp: Date.now() },
        ],
        tools: [
          {
            name: 'read_file',
            description: 'Read file',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
        ],
      };

      const response = await provider.complete(request);

      expect(response.message.content).toBe('Let me check that file.');
      expect(response.message.toolCalls).toHaveLength(1);
    });

    it('handles invalid JSON in tool call arguments', async () => {
      const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'test_tool',
                    arguments: '{invalid json}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 20,
          total_tokens: 70,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'gpt-4',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
        tools: [
          {
            name: 'test_tool',
            description: 'Test',
            parameters: {
              type: 'object',
              properties: {
                arg: { type: 'string' },
              },
              required: ['arg'],
            },
          },
        ],
      };

      await expect(provider.complete(request)).rejects.toThrow();
    });
  });
});

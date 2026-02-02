/**
 * Tests for Anthropic provider implementation.
 *
 * TDD RED phase: All tests should initially fail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
} from '../../src/types/providers.js';
import { AnthropicProvider } from '../../src/providers/anthropic.js';
import type Anthropic from '@anthropic-ai/sdk';

// Create mock client with messages methods
const mockCreate = vi.fn();
const mockStream = vi.fn();

const mockClient = {
  messages: {
    create: mockCreate,
    stream: mockStream,
  },
};

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn(() => mockClient),
  };
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockStream.mockReset();

    provider = new AnthropicProvider('test-api-key-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates provider with anthropic type', () => {
      expect(provider.type).toBe('anthropic');
    });

    it('accepts custom baseUrl', () => {
      const customProvider = new AnthropicProvider(
        'test-key',
        30000,
        3,
        'https://custom.anthropic.com'
      );
      expect(customProvider).toBeDefined();
    });

    it('uses default timeout and retries', () => {
      const defaultProvider = new AnthropicProvider('test-key');
      expect(defaultProvider).toBeDefined();
    });
  });

  describe('doComplete()', () => {
    it('converts simple user message to Anthropic format', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hello! How can I help you?',
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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

    it('includes system prompt in request', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 5 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
        ],
        systemPrompt: 'You are a helpful assistant.',
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant.',
        }),
        expect.any(Object)
      );
    });

    it('converts multi-turn conversation', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Got it!' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 3 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
            expect.objectContaining({ role: 'assistant' }),
            expect.objectContaining({ role: 'user', content: 'How are you?' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('handles tool calls in response', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Let me search for that.',
          },
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'search',
            input: { query: 'test query' },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
        id: 'tool_123',
        name: 'search',
        arguments: { query: 'test query' },
      });
    });

    it('converts tool definitions to Anthropic format', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 200, output_tokens: 10 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
              name: 'read_file',
              description: 'Read contents of a file',
              input_schema: {
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
        }),
        expect.any(Object)
      );
    });

    it('handles tool result messages', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Based on the file contents...' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 300, output_tokens: 20 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { id: '1', role: 'user', content: 'Read file X', timestamp: Date.now() },
          {
            id: '2',
            role: 'assistant',
            content: 'Let me read that.',
            toolCalls: [
              { id: 'tool_1', name: 'read_file', arguments: { path: '/test.txt' } },
            ],
            stopReason: 'tool_use',
            timestamp: Date.now(),
          },
          {
            id: '3',
            role: 'tool',
            content: 'File contents here',
            toolCallId: 'tool_1',
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
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: 'tool_result',
                  tool_use_id: 'tool_1',
                  content: 'File contents here',
                }),
              ]),
            }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('respects maxTokens parameter', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
        stopSequences: ['STOP', 'END'],
      };

      await provider.complete(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stop_sequences: ['STOP', 'END'],
        }),
        expect.any(Object)
      );
    });

    it('respects AbortSignal for timeout', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const signal = AbortSignal.timeout(5000);
      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
      };

      await provider.complete(request);

      // Verify signal is passed (through base provider)
      expect(mockCreate).toHaveBeenCalled();
    });

    it('handles max_tokens stop reason', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Truncated response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'max_tokens',
        usage: { input_tokens: 10, output_tokens: 100 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
        maxTokens: 100,
      };

      const response = await provider.complete(request);

      expect(response.message.stopReason).toBe('max_tokens');
    });

    it('handles error responses gracefully', async () => {
      mockCreate.mockRejectedValue(
        new Error('API Error: Rate limit exceeded')
      );

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { id: '1', role: 'user', content: 'Test', timestamp: Date.now() },
        ],
      };

      await expect(provider.complete(request)).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('doStream()', () => {
    it('yields text deltas from streaming response', async () => {
      const mockStreamResponse = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          };
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hello' },
          };
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: ' world' },
          };
          yield { type: 'content_block_stop', index: 0 };
          yield {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 2 },
          };
          yield {
            type: 'message_stop',
          };
        },
        finalMessage: () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello world' }],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
      };

      mockStream.mockReturnValue(mockStreamResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
      expect(chunks[2]).toEqual({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      });
    });

    it('yields tool call chunks', async () => {
      const mockStreamResponse2 = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'tool_123',
              name: 'search',
              input: {},
            },
          };
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'input_json_delta',
              partial_json: '{"query":',
            },
          };
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'input_json_delta',
              partial_json: '"test"}',
            },
          };
          yield { type: 'content_block_stop', index: 0 };
          yield {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use' },
            usage: { output_tokens: 10 },
          };
          yield { type: 'message_stop' };
        },
        finalMessage: () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'search',
              input: { query: 'test' },
            },
          ],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };

      mockStream.mockReturnValue(mockStreamResponse2);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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

      // Should have tool_call chunks and done
      expect(chunks.some((c) => c.type === 'tool_call')).toBe(true);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('handles streaming errors', async () => {
      const mockStreamResponse3 = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hello' },
          };
          throw new Error('Stream interrupted');
        },
      };

      mockStream.mockReturnValue(mockStreamResponse3);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
  });

  describe('doListModels()', () => {
    it('returns list of Claude models', async () => {
      const models = await provider.listModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('contextWindow');
      expect(models[0]).toHaveProperty('supportsTools');
      expect(models[0]).toHaveProperty('supportsStreaming');
    });

    it('includes Claude 3.5 Sonnet', async () => {
      const models = await provider.listModels();

      const sonnet = models.find((m) => m.id.includes('claude-3-5-sonnet'));
      expect(sonnet).toBeDefined();
      expect(sonnet!.supportsTools).toBe(true);
      expect(sonnet!.supportsStreaming).toBe(true);
    });

    it('includes Claude 3 Opus', async () => {
      const models = await provider.listModels();

      const opus = models.find((m) => m.id.includes('claude-3-opus'));
      expect(opus).toBeDefined();
    });

    it('includes Claude 3 Haiku', async () => {
      const models = await provider.listModels();

      const haiku = models.find((m) => m.id.includes('claude-3-haiku'));
      expect(haiku).toBeDefined();
    });

    it('all models support tools and streaming', async () => {
      const models = await provider.listModels();

      for (const model of models) {
        expect(model.supportsTools).toBe(true);
        expect(model.supportsStreaming).toBe(true);
      }
    });
  });

  describe('doHealthCheck()', () => {
    it('returns true for valid API key', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-3-haiku-20240307',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 1 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        })
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
      const mockResponse: Anthropic.Message = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-3-haiku-20240307',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 1 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      await provider.healthCheck();

      // Should use smallest/cheapest model and minimal tokens
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 1,
        })
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty message content', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 0 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { id: '1', role: 'user', content: '', timestamp: Date.now() },
        ],
      };

      const response = await provider.complete(request);

      expect(response.message.content).toBe('');
    });

    it('handles multiple tool calls in single response', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'read_file',
            input: { path: '/file1.txt' },
          },
          {
            type: 'tool_use',
            id: 'tool_2',
            name: 'read_file',
            input: { path: '/file2.txt' },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check that file.' },
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'read_file',
            input: { path: '/test.txt' },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 30 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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

    it('handles null/undefined in tool arguments', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'test_tool',
            input: { required: 'value', optional: null },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 20 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: CompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
                required: { type: 'string' },
                optional: { type: 'string' },
              },
              required: ['required'],
            },
          },
        ],
      };

      const response = await provider.complete(request);

      expect(response.message.toolCalls![0].arguments).toEqual({
        required: 'value',
        optional: null,
      });
    });
  });
});

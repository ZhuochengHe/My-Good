/**
 * Tests for context builder implementation.
 *
 * TDD RED phase: All tests should initially fail.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextBuilder } from '../../src/agent/context-builder.js';
import type { ConversationMessage } from '../../src/types/messages.js';
import type { ToolDefinition } from '../../src/types/tools.js';
import type { CompletionRequest } from '../../src/types/providers.js';

describe('ContextBuilder', () => {
  let builder: ContextBuilder;

  beforeEach(() => {
    builder = new ContextBuilder();
  });

  describe('buildRequest()', () => {
    it('includes system prompt in request', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        systemPrompt: 'You are a helpful assistant',
        maxTokens: 1024,
      });

      expect(request.systemPrompt).toBe('You are a helpful assistant');
    });

    it('includes messages in request', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'First message',
          timestamp: Date.now(),
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Second message',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        maxTokens: 1024,
      });

      expect(request.messages).toHaveLength(2);
      expect(request.messages[0].content).toBe('First message');
      expect(request.messages[1].content).toBe('Second message');
    });

    it('includes tool definitions in request', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Read a file',
          timestamp: Date.now(),
        },
      ];

      const tools: ToolDefinition[] = [
        {
          name: 'read_file',
          description: 'Read file contents',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        tools,
        maxTokens: 1024,
      });

      expect(request.tools).toBeDefined();
      expect(request.tools).toHaveLength(1);
      expect(request.tools![0].name).toBe('read_file');
    });

    it('sets model correctly', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const request = builder.buildRequest({
        model: 'gpt-4',
        messages,
        maxTokens: 2048,
      });

      expect(request.model).toBe('gpt-4');
    });

    it('sets maxTokens correctly', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        maxTokens: 4096,
      });

      expect(request.maxTokens).toBe(4096);
    });

    it('handles empty messages array', () => {
      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        maxTokens: 1024,
      });

      expect(request.messages).toHaveLength(0);
    });

    it('handles empty tools array', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        tools: [],
        maxTokens: 1024,
      });

      expect(request.tools).toEqual([]);
    });

    it('handles undefined tools', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        maxTokens: 1024,
      });

      expect(request.tools).toBeUndefined();
    });

    it('includes temperature when provided', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        maxTokens: 1024,
        temperature: 0.7,
      });

      expect(request.temperature).toBe(0.7);
    });

    it('preserves message order', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'First',
          timestamp: 1000,
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Second',
          stopReason: 'end_turn',
          timestamp: 2000,
        },
        {
          id: 'msg_3',
          role: 'user',
          content: 'Third',
          timestamp: 3000,
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        maxTokens: 1024,
      });

      expect(request.messages[0].content).toBe('First');
      expect(request.messages[1].content).toBe('Second');
      expect(request.messages[2].content).toBe('Third');
    });
  });

  describe('estimateTokens()', () => {
    it('counts tokens across all messages', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'This is a test message',
          timestamp: Date.now(),
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'This is a response',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
      ];

      const estimate = builder.estimateTokens({
        messages,
        systemPrompt: 'You are helpful',
      });

      expect(estimate.messages).toBeGreaterThan(0);
      expect(estimate.total).toBeGreaterThan(0);
    });

    it('includes system prompt in token count', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
      ];

      const withoutSystem = builder.estimateTokens({ messages });
      const withSystem = builder.estimateTokens({
        messages,
        systemPrompt: 'You are a helpful assistant with extensive knowledge',
      });

      expect(withSystem.systemPrompt).toBeGreaterThan(0);
      expect(withSystem.total).toBeGreaterThan(withoutSystem.total);
    });

    it('includes tools in token count', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
      ];

      const tools: ToolDefinition[] = [
        {
          name: 'read_file',
          description: 'Read file contents',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
            },
            required: ['path'],
          },
        },
      ];

      const withoutTools = builder.estimateTokens({ messages });
      const withTools = builder.estimateTokens({ messages, tools });

      expect(withTools.tools).toBeGreaterThan(0);
      expect(withTools.total).toBeGreaterThan(withoutTools.total);
    });

    it('returns breakdown of token counts', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const tools: ToolDefinition[] = [
        {
          name: 'test_tool',
          description: 'Test',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ];

      const estimate = builder.estimateTokens({
        messages,
        systemPrompt: 'System',
        tools,
      });

      expect(estimate).toHaveProperty('messages');
      expect(estimate).toHaveProperty('systemPrompt');
      expect(estimate).toHaveProperty('tools');
      expect(estimate).toHaveProperty('total');

      // Total should be sum of parts
      expect(estimate.total).toBe(
        estimate.messages + estimate.systemPrompt + estimate.tools
      );
    });

    it('handles empty inputs', () => {
      const estimate = builder.estimateTokens({
        messages: [],
      });

      expect(estimate.messages).toBe(0);
      expect(estimate.systemPrompt).toBe(0);
      expect(estimate.tools).toBe(0);
      expect(estimate.total).toBe(0);
    });
  });

  describe('truncateHistory()', () => {
    it('removes oldest messages first', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'First message - should be removed',
          timestamp: 1000,
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Second message',
          stopReason: 'end_turn',
          timestamp: 2000,
        },
        {
          id: 'msg_3',
          role: 'user',
          content: 'Third message - should remain',
          timestamp: 3000,
        },
      ];

      const truncated = builder.truncateHistory(messages, 20); // Small token limit

      expect(truncated.length).toBeLessThan(messages.length);
      expect(truncated[truncated.length - 1].content).toContain('should remain');
    });

    it('keeps at least the last user message', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Very long message that exceeds token limit by itself',
          timestamp: Date.now(),
        },
      ];

      const truncated = builder.truncateHistory(messages, 5); // Very small limit

      expect(truncated.length).toBe(1);
      expect(truncated[0].id).toBe('msg_1');
    });

    it('preserves tool call and result pairs together', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Old message - can be removed',
          timestamp: 1000,
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Using tool',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'call_1',
              name: 'read_file',
              arguments: { path: 'test.txt' },
            },
          ],
          timestamp: 2000,
        },
        {
          id: 'msg_3',
          role: 'tool',
          content: 'Tool result',
          toolCallId: 'call_1',
          toolName: 'read_file',
          isError: false,
          timestamp: 3000,
        },
        {
          id: 'msg_4',
          role: 'user',
          content: 'Latest message',
          timestamp: 4000,
        },
      ];

      const truncated = builder.truncateHistory(messages, 30);

      // If msg_2 (tool call) is present, msg_3 (result) must also be present
      const hasToolCall = truncated.some((m) => m.id === 'msg_2');
      const hasToolResult = truncated.some((m) => m.id === 'msg_3');

      if (hasToolCall) {
        expect(hasToolResult).toBe(true);
      }
    });

    it('returns all messages if under token limit', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Short',
          timestamp: Date.now(),
        },
      ];

      const truncated = builder.truncateHistory(messages, 10000);

      expect(truncated.length).toBe(messages.length);
      expect(truncated).toEqual(messages);
    });

    it('handles empty message array', () => {
      const truncated = builder.truncateHistory([], 1000);
      expect(truncated).toEqual([]);
    });

    it('respects token limit accurately', () => {
      const messages: ConversationMessage[] = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `msg_${i}`,
          role: 'user' as const,
          content: `Message number ${i}`,
          timestamp: i * 1000,
        }));

      const maxTokens = 50;
      const truncated = builder.truncateHistory(messages, maxTokens);

      const estimate = builder.estimateTokens({ messages: truncated });

      expect(estimate.messages).toBeLessThanOrEqual(maxTokens);
    });

    it('maintains conversation continuity', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Old question',
          timestamp: 1000,
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Old answer',
          stopReason: 'end_turn',
          timestamp: 2000,
        },
        {
          id: 'msg_3',
          role: 'user',
          content: 'Recent question',
          timestamp: 3000,
        },
        {
          id: 'msg_4',
          role: 'assistant',
          content: 'Recent answer',
          stopReason: 'end_turn',
          timestamp: 4000,
        },
      ];

      const truncated = builder.truncateHistory(messages, 40);

      // Should keep recent exchange
      expect(truncated.some((m) => m.content === 'Recent question')).toBe(true);
      expect(truncated.some((m) => m.content === 'Recent answer')).toBe(true);
    });

    it('includes tool result when tool call is at edge of truncation', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Old message',
          timestamp: 1000,
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Tool call',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: {},
            },
          ],
          timestamp: 2000,
        },
        {
          id: 'msg_3',
          role: 'tool',
          content: 'Result',
          toolCallId: 'call_1',
          toolName: 'test_tool',
          isError: false,
          timestamp: 3000,
        },
      ];

      // Token limit that would exclude msg_1 but must include msg_2 and msg_3 together
      const truncated = builder.truncateHistory(messages, 25);

      // Both tool call and result should be present or both absent
      const hasToolCall = truncated.some((m) => m.id === 'msg_2');
      const hasToolResult = truncated.some((m) => m.id === 'msg_3');

      expect(hasToolCall).toBe(hasToolResult);
    });

    it('excludes orphaned tool call when result would exceed limit', () => {
      const longContent = 'x'.repeat(1000); // Very long content

      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'assistant',
          content: 'Tool call',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: {},
            },
          ],
          timestamp: 1000,
        },
        {
          id: 'msg_2',
          role: 'tool',
          content: longContent,
          toolCallId: 'call_1',
          toolName: 'test_tool',
          isError: false,
          timestamp: 2000,
        },
        {
          id: 'msg_3',
          role: 'user',
          content: 'Short',
          timestamp: 3000,
        },
      ];

      // Small limit that can't fit both tool call and result
      const truncated = builder.truncateHistory(messages, 10);

      // Should only include the user message
      expect(truncated.length).toBe(1);
      expect(truncated[0].id).toBe('msg_3');
    });
  });

  describe('edge cases', () => {
    it('handles messages with very long content', () => {
      const longContent = 'a'.repeat(10000);
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: longContent,
          timestamp: Date.now(),
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        maxTokens: 1024,
      });

      expect(request.messages[0].content).toBe(longContent);
    });

    it('handles messages with tool calls', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'assistant',
          content: 'Using multiple tools',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'call_1',
              name: 'tool_1',
              arguments: { arg1: 'value1' },
            },
            {
              id: 'call_2',
              name: 'tool_2',
              arguments: { arg2: 'value2' },
            },
          ],
          timestamp: Date.now(),
        },
      ];

      const estimate = builder.estimateTokens({ messages });
      expect(estimate.messages).toBeGreaterThan(10);
    });

    it('handles system prompts with special characters', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const systemPrompt = 'System with "quotes" and newlines\n\nAnd unicode: 世界';

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        systemPrompt,
        maxTokens: 1024,
      });

      expect(request.systemPrompt).toBe(systemPrompt);
    });

    it('handles zero maxTokens', () => {
      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const request = builder.buildRequest({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        maxTokens: 0,
      });

      expect(request.maxTokens).toBe(0);
    });
  });
});

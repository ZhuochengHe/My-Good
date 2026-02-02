/**
 * Tests for token counter implementation.
 *
 * TDD RED phase: All tests should initially fail.
 */

import { describe, it, expect } from 'vitest';
import { TokenCounter } from '../../src/agent/token-counter.js';
import type { ConversationMessage } from '../../src/types/messages.js';
import type { ToolDefinition } from '../../src/types/tools.js';

describe('TokenCounter', () => {
  describe('countText()', () => {
    it('estimates tokens for simple text (approx 4 chars per token)', () => {
      const counter = new TokenCounter();

      // "Hello world" = 11 chars, should be ~3 tokens
      const count = counter.countText('Hello world');
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
    });

    it('returns 0 for empty string', () => {
      const counter = new TokenCounter();
      expect(counter.countText('')).toBe(0);
    });

    it('handles unicode characters', () => {
      const counter = new TokenCounter();

      // Unicode tends to use more tokens per character
      const text = 'Hello 世界 🌍';
      const count = counter.countText(text);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(text.length); // Still uses approximation
    });

    it('handles special characters', () => {
      const counter = new TokenCounter();

      const text = 'function test() { return "value"; }';
      const count = counter.countText(text);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(text.length);
    });

    it('handles very long text', () => {
      const counter = new TokenCounter();

      // Create 1000 char string
      const text = 'a'.repeat(1000);
      const count = counter.countText(text);

      // Should be approximately 250 tokens (1000 / 4)
      expect(count).toBeGreaterThan(200);
      expect(count).toBeLessThan(300);
    });

    it('handles text with newlines and whitespace', () => {
      const counter = new TokenCounter();

      const text = 'Line 1\nLine 2\n\nLine 3   ';
      const count = counter.countText(text);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('countMessage()', () => {
    it('counts tokens in user message', () => {
      const counter = new TokenCounter();

      const message: ConversationMessage = {
        id: 'msg_1',
        role: 'user',
        content: 'Please help me with this task',
        timestamp: Date.now(),
      };

      const count = counter.countMessage(message);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(20);
    });

    it('counts tokens in assistant message', () => {
      const counter = new TokenCounter();

      const message: ConversationMessage = {
        id: 'msg_2',
        role: 'assistant',
        content: 'I can help you with that',
        stopReason: 'end_turn',
        timestamp: Date.now(),
      };

      const count = counter.countMessage(message);
      expect(count).toBeGreaterThan(0);
    });

    it('counts tokens in assistant message with tool calls', () => {
      const counter = new TokenCounter();

      const message: ConversationMessage = {
        id: 'msg_3',
        role: 'assistant',
        content: 'Let me read that file',
        stopReason: 'tool_use',
        toolCalls: [
          {
            id: 'call_1',
            name: 'read_file',
            arguments: { path: '/home/user/test.txt' },
          },
        ],
        timestamp: Date.now(),
      };

      const count = counter.countMessage(message);

      // Should count content + tool call overhead
      expect(count).toBeGreaterThan(10);
    });

    it('counts tokens in tool result message', () => {
      const counter = new TokenCounter();

      const message: ConversationMessage = {
        id: 'msg_4',
        role: 'tool',
        content: 'File content goes here...',
        toolCallId: 'call_1',
        toolName: 'read_file',
        isError: false,
        timestamp: Date.now(),
      };

      const count = counter.countMessage(message);
      expect(count).toBeGreaterThan(0);
    });

    it('counts tokens in system message', () => {
      const counter = new TokenCounter();

      const message: ConversationMessage = {
        id: 'msg_5',
        role: 'system',
        content: 'You are a helpful assistant',
        timestamp: Date.now(),
      };

      const count = counter.countMessage(message);
      expect(count).toBeGreaterThan(0);
    });

    it('handles empty message content', () => {
      const counter = new TokenCounter();

      const message: ConversationMessage = {
        id: 'msg_6',
        role: 'user',
        content: '',
        timestamp: Date.now(),
      };

      const count = counter.countMessage(message);

      // Should include role overhead even with empty content
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('countMessages()', () => {
    it('sums tokens across multiple messages', () => {
      const counter = new TokenCounter();

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
        {
          id: 'msg_3',
          role: 'user',
          content: 'Third message',
          timestamp: Date.now(),
        },
      ];

      const totalCount = counter.countMessages(messages);

      // Sum should be greater than any individual message
      const individual1 = counter.countMessage(messages[0]);
      const individual2 = counter.countMessage(messages[1]);
      const individual3 = counter.countMessage(messages[2]);

      expect(totalCount).toBeGreaterThan(individual1);
      expect(totalCount).toBeGreaterThan(individual2);
      expect(totalCount).toBeGreaterThan(individual3);
      expect(totalCount).toBeGreaterThanOrEqual(individual1 + individual2 + individual3);
    });

    it('returns 0 for empty messages array', () => {
      const counter = new TokenCounter();
      expect(counter.countMessages([])).toBe(0);
    });

    it('handles messages with tool calls', () => {
      const counter = new TokenCounter();

      const messages: ConversationMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Read file',
          timestamp: Date.now(),
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Reading file',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'call_1',
              name: 'read_file',
              arguments: { path: 'test.txt' },
            },
          ],
          timestamp: Date.now(),
        },
        {
          id: 'msg_3',
          role: 'tool',
          content: 'File content',
          toolCallId: 'call_1',
          toolName: 'read_file',
          isError: false,
          timestamp: Date.now(),
        },
      ];

      const count = counter.countMessages(messages);
      expect(count).toBeGreaterThan(10);
    });
  });

  describe('countToolDefinitions()', () => {
    it('estimates tokens for tool schema', () => {
      const counter = new TokenCounter();

      const tools: ToolDefinition[] = [
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
            },
            required: ['path'],
          },
        },
      ];

      const count = counter.countToolDefinitions(tools);
      expect(count).toBeGreaterThan(10);
      expect(count).toBeLessThan(100);
    });

    it('returns 0 for empty tools array', () => {
      const counter = new TokenCounter();
      expect(counter.countToolDefinitions([])).toBe(0);
    });

    it('counts multiple tool definitions', () => {
      const counter = new TokenCounter();

      const tools: ToolDefinition[] = [
        {
          name: 'read_file',
          description: 'Read file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
        {
          name: 'write_file',
          description: 'Write file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
      ];

      const count = counter.countToolDefinitions(tools);

      // Should be more than single tool
      const singleToolCount = counter.countToolDefinitions([tools[0]]);
      expect(count).toBeGreaterThan(singleToolCount);
    });

    it('handles complex tool schemas', () => {
      const counter = new TokenCounter();

      const tools: ToolDefinition[] = [
        {
          name: 'complex_tool',
          description: 'A complex tool with nested parameters',
          parameters: {
            type: 'object',
            properties: {
              nested: {
                type: 'object',
                properties: {
                  field1: { type: 'string', description: 'First field' },
                  field2: { type: 'number', description: 'Second field' },
                },
              },
              array: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['nested'],
          },
        },
      ];

      const count = counter.countToolDefinitions(tools);
      expect(count).toBeGreaterThan(20);
    });
  });

  describe('edge cases', () => {
    it('handles null or undefined gracefully', () => {
      const counter = new TokenCounter();

      // TypeScript won't allow null/undefined, but test runtime behavior
      expect(() => counter.countText(null as any)).not.toThrow();
      expect(() => counter.countText(undefined as any)).not.toThrow();
    });

    it('handles very large message arrays efficiently', () => {
      const counter = new TokenCounter();

      const messages: ConversationMessage[] = Array(100).fill(null).map((_, i) => ({
        id: `msg_${i}`,
        role: 'user' as const,
        content: `Message number ${i}`,
        timestamp: Date.now(),
      }));

      const start = Date.now();
      const count = counter.countMessages(messages);
      const duration = Date.now() - start;

      expect(count).toBeGreaterThan(100);
      expect(duration).toBeLessThan(100); // Should be fast
    });

    it('estimation is within reasonable bounds', () => {
      const counter = new TokenCounter();

      // Test with known text
      const text = 'The quick brown fox jumps over the lazy dog';
      const count = counter.countText(text);

      // 9 words, typical tokenization would be 9-12 tokens
      expect(count).toBeGreaterThanOrEqual(8);
      expect(count).toBeLessThanOrEqual(15);
    });
  });
});

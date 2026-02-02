/**
 * Token counter for estimating token usage.
 *
 * Uses approximation: ~4 characters per token for English text.
 * This is intentionally simple for MVP - production would use tiktoken.
 */

import type { ConversationMessage } from '../types/messages.js';
import type { ToolDefinition } from '../types/tools.js';

/** Average characters per token (approximation) */
const CHARS_PER_TOKEN = 4;

/** Fixed overhead tokens for message role/structure */
const MESSAGE_OVERHEAD_TOKENS = 3;

/** Fixed overhead tokens per tool call */
const TOOL_CALL_OVERHEAD_TOKENS = 10;

/**
 * Token counter for estimating token usage in messages and tools.
 *
 * This implementation uses a simple character-based approximation.
 * For production use, consider integrating tiktoken for accurate counts.
 */
export class TokenCounter {
  /**
   * Count tokens in plain text using character approximation.
   *
   * @param text - Text to count tokens for
   * @returns Estimated token count
   */
  countText(text: string): number {
    // Handle null/undefined
    if (!text) {
      return 0;
    }

    // Simple approximation: divide char count by avg chars per token
    const charCount = text.length;
    return Math.ceil(charCount / CHARS_PER_TOKEN);
  }

  /**
   * Count tokens in a single conversation message.
   *
   * Includes overhead for message structure and tool calls.
   *
   * @param message - Conversation message to count
   * @returns Estimated token count
   */
  countMessage(message: ConversationMessage): number {
    let tokens = MESSAGE_OVERHEAD_TOKENS; // Role overhead

    // Count content
    tokens += this.countText(message.content);

    // Count tool calls if present (assistant messages)
    if ('toolCalls' in message && message.toolCalls) {
      for (const toolCall of message.toolCalls) {
        tokens += TOOL_CALL_OVERHEAD_TOKENS;
        tokens += this.countText(toolCall.name);
        tokens += this.countText(JSON.stringify(toolCall.arguments));
      }
    }

    return tokens;
  }

  /**
   * Count tokens across multiple messages.
   *
   * @param messages - Array of conversation messages
   * @returns Total estimated token count
   */
  countMessages(messages: readonly ConversationMessage[]): number {
    if (!messages || messages.length === 0) {
      return 0;
    }

    return messages.reduce((total, message) => {
      return total + this.countMessage(message);
    }, 0);
  }

  /**
   * Count tokens in tool definitions.
   *
   * Estimates tokens needed to send tool schemas to the model.
   *
   * @param tools - Array of tool definitions
   * @returns Estimated token count
   */
  countToolDefinitions(tools: readonly ToolDefinition[]): number {
    if (!tools || tools.length === 0) {
      return 0;
    }

    // Convert tool definitions to JSON and count
    // This approximates the token cost of sending tool schemas
    const toolsJson = JSON.stringify(tools);
    return this.countText(toolsJson);
  }
}

/**
 * Context builder for constructing LLM requests.
 *
 * Handles message formatting, token estimation, and history truncation.
 */

import type { ConversationMessage } from '../types/messages.js';
import type { ToolDefinition } from '../types/tools.js';
import type { CompletionRequest } from '../types/providers.js';
import { TokenCounter } from './token-counter.js';

/**
 * Options for building a completion request.
 */
export interface BuildRequestOptions {
  readonly model: string;
  readonly messages: readonly ConversationMessage[];
  readonly tools?: readonly ToolDefinition[];
  readonly systemPrompt?: string;
  readonly maxTokens: number;
  readonly temperature?: number;
  readonly stopSequences?: readonly string[];
}

/**
 * Token usage estimate breakdown.
 */
export interface TokenEstimate {
  readonly messages: number;
  readonly systemPrompt: number;
  readonly tools: number;
  readonly total: number;
}

/**
 * Options for estimating tokens.
 */
export interface EstimateOptions {
  readonly messages: readonly ConversationMessage[];
  readonly systemPrompt?: string;
  readonly tools?: readonly ToolDefinition[];
}

/**
 * Context builder for constructing completion requests.
 *
 * Responsibilities:
 * - Build completion requests with proper formatting
 * - Estimate token usage across messages and tools
 * - Truncate message history to fit token limits
 */
export class ContextBuilder {
  private readonly tokenCounter: TokenCounter;

  constructor() {
    this.tokenCounter = new TokenCounter();
  }

  /**
   * Build a completion request from messages and options.
   *
   * @param options - Request building options
   * @returns Formatted completion request
   */
  buildRequest(options: BuildRequestOptions): CompletionRequest {
    const {
      model,
      messages,
      tools,
      systemPrompt,
      maxTokens,
      temperature,
      stopSequences,
    } = options;

    // Build request with conditionally included optional fields
    const request: CompletionRequest = {
      model,
      messages,
      maxTokens,
      ...(tools !== undefined && { tools }),
      ...(systemPrompt !== undefined && { systemPrompt }),
      ...(temperature !== undefined && { temperature }),
      ...(stopSequences !== undefined && { stopSequences }),
    };

    return request;
  }

  /**
   * Estimate token usage for a request.
   *
   * Returns breakdown of tokens by component (messages, system, tools).
   *
   * @param options - Components to estimate
   * @returns Token usage estimate
   */
  estimateTokens(options: EstimateOptions): TokenEstimate {
    const { messages, systemPrompt, tools } = options;

    const messagesTokens = this.tokenCounter.countMessages(messages);
    const systemPromptTokens = systemPrompt
      ? this.tokenCounter.countText(systemPrompt)
      : 0;
    const toolsTokens = tools ? this.tokenCounter.countToolDefinitions(tools) : 0;

    return {
      messages: messagesTokens,
      systemPrompt: systemPromptTokens,
      tools: toolsTokens,
      total: messagesTokens + systemPromptTokens + toolsTokens,
    };
  }

  /**
   * Truncate message history to fit within token limit.
   *
   * Strategy:
   * - Remove oldest messages first
   * - Always keep at least the last user message
   * - Preserve tool call/result pairs together
   *
   * @param messages - Full message history
   * @param maxTokens - Maximum tokens allowed
   * @returns Truncated message array
   */
  truncateHistory(
    messages: readonly ConversationMessage[],
    maxTokens: number
  ): ConversationMessage[] {
    if (messages.length === 0) {
      return [];
    }

    // Check if already under limit
    const currentTokens = this.tokenCounter.countMessages(messages);
    if (currentTokens <= maxTokens) {
      return [...messages];
    }

    // Always keep at least the last message
    if (messages.length === 1) {
      return [...messages];
    }

    // Build result from newest to oldest
    const result: ConversationMessage[] = [];
    let tokenCount = 0;

    // Start from the end and work backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message) continue; // Safety check

      const messageTokens = this.tokenCounter.countMessage(message);

      // Check if adding this message would exceed limit
      if (tokenCount + messageTokens > maxTokens && result.length > 0) {
        // Don't add this message
        break;
      }

      // Add message to front of result (since we're going backwards)
      result.unshift(message);
      tokenCount += messageTokens;

      // Handle tool call/result pairs
      // If this is a tool result, ensure we include the corresponding tool call
      if (message.role === 'tool' && i > 0) {
        const prevMessage = messages[i - 1];
        if (!prevMessage) continue;

        if (
          prevMessage.role === 'assistant' &&
          'toolCalls' in prevMessage &&
          prevMessage.toolCalls &&
          prevMessage.toolCalls.some((tc) => tc.id === message.toolCallId)
        ) {
          // Need to include the tool call message
          const toolCallTokens = this.tokenCounter.countMessage(prevMessage);

          // Check if we have room
          if (tokenCount + toolCallTokens <= maxTokens || result.length === 1) {
            result.unshift(prevMessage);
            tokenCount += toolCallTokens;
            i--; // Skip the tool call message in next iteration
          }
        }
      }

      // If this is a tool call message, ensure we include the result
      if (
        message.role === 'assistant' &&
        'toolCalls' in message &&
        message.toolCalls &&
        i < messages.length - 1
      ) {
        const nextMessage = messages[i + 1];
        if (!nextMessage) continue;

        if (
          nextMessage.role === 'tool' &&
          message.toolCalls.some((tc) => tc.id === nextMessage.toolCallId)
        ) {
          // Result should already be in result array (since we're going backwards)
          // Just verify it's there
          const hasResult = result.some(
            (m) =>
              m.role === 'tool' &&
              'toolCalls' in message &&
              message.toolCalls &&
              message.toolCalls.some((tc) => tc.id === m.toolCallId)
          );

          if (!hasResult) {
            // Add the result if not present
            const resultTokens = this.tokenCounter.countMessage(nextMessage);
            if (tokenCount + resultTokens <= maxTokens || result.length === 1) {
              // Find the correct position to insert (should be after current message)
              const insertIndex = result.indexOf(message) + 1;
              result.splice(insertIndex, 0, nextMessage);
              tokenCount += resultTokens;
            }
          }
        }
      }
    }

    return result;
  }
}

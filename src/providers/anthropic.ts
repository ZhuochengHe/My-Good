/**
 * Anthropic provider implementation.
 *
 * Implements the Provider interface for Anthropic's Claude models.
 * Handles message format conversion, tool calling, and streaming.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  MessageCreateParams,
  TextBlock,
  ToolUseBlock,
  Message,
} from '@anthropic-ai/sdk/resources/messages.js';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
} from '../types/providers.js';
import type {
  ConversationMessage,
  AssistantMessage,
} from '../types/messages.js';
import type { ToolDefinition } from '../types/tools.js';
import { BaseProvider } from './base.js';
import {
  isAssistantMessage,
  isToolResultMessage,
  isUserMessage,
} from '../types/messages.js';

/**
 * Anthropic Claude provider.
 *
 * Supports:
 * - Message format conversion between internal and Anthropic formats
 * - Tool calling with proper input schema conversion
 * - Streaming responses with text and tool call deltas
 * - Multiple Claude model families (Opus, Sonnet, Haiku)
 */
export class AnthropicProvider extends BaseProvider {
  private readonly client: Anthropic;
  private readonly models: readonly ModelInfo[];
  private readonly healthCheckModel: string;

  constructor(
    apiKey: string,
    timeout = 30000,
    maxRetries = 3,
    baseUrl?: string,
    models?: readonly ModelInfo[],
    healthCheckModel?: string
  ) {
    super('anthropic', apiKey, timeout, maxRetries);
    this.client = new Anthropic({
      apiKey,
      baseURL: baseUrl,
    });
    this.models = models ?? this.getDefaultModels();
    this.healthCheckModel = healthCheckModel ?? 'claude-3-haiku-20240307';
  }

  /**
   * Get default Claude models.
   */
  private getDefaultModels(): readonly ModelInfo[] {
    return [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        contextWindow: 200000,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        contextWindow: 200000,
        supportsTools: true,
        supportsStreaming: true,
      },
    ];
  }

  /**
   * Complete a conversation request.
   *
   * Converts internal message format to Anthropic's format, sends request,
   * and converts response back to internal format.
   */
  protected async doComplete(
    request: CompletionRequest,
    signal?: AbortSignal
  ): Promise<CompletionResponse> {
    const params = this.buildRequestParams(request);

    const response = await this.client.messages.create(
      {
        ...params,
        stream: false,
      },
      { signal }
    );

    return this.convertResponse(response);
  }

  /**
   * Stream a conversation response.
   *
   * Yields text deltas and tool call information as they arrive.
   */
  protected async *doStream(
    request: CompletionRequest
  ): AsyncIterable<StreamChunk> {
    const params = this.buildRequestParams(request);

    const stream = this.client.messages.stream({
      ...params,
      stream: true,
    });

    // Track tool call state for building complete tool calls
    const toolCallsInProgress = new Map<
      number,
      { id: string; name: string; inputJson: string }
    >();

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolCallsInProgress.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: '',
          });
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield {
            type: 'text_delta',
            delta: event.delta.text,
          };
        } else if (event.delta.type === 'input_json_delta') {
          const toolCall = toolCallsInProgress.get(event.index);
          if (toolCall) {
            toolCall.inputJson += event.delta.partial_json;
          }
        }
      } else if (event.type === 'content_block_stop') {
        const toolCall = toolCallsInProgress.get(event.index);
        if (toolCall) {
          // Parse complete tool call and emit
          const args = JSON.parse(toolCall.inputJson) as Record<string, unknown>;
          yield {
            type: 'tool_call',
            toolCall: {
              id: toolCall.id,
              name: toolCall.name,
              arguments: args,
            },
          };
          toolCallsInProgress.delete(event.index);
        }
      } else if (event.type === 'message_stop') {
        // Get final message for usage stats
        const finalMessage = await stream.finalMessage();
        yield {
          type: 'done',
          usage: {
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
            totalTokens:
              finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
          },
        };
      }
    }
  }

  /**
   * List available Claude models.
   *
   * Returns injected models or default hardcoded list of current Claude models with metadata.
   * Note: Anthropic API doesn't provide a models endpoint, so this is static.
   */
  protected doListModels(): Promise<readonly ModelInfo[]> {
    return Promise.resolve(this.models);
  }

  /**
   * Check if the Anthropic API is accessible.
   *
   * Makes a minimal request to verify API key and connectivity.
   * Uses injected health check model or default cheapest model.
   */
  protected async doHealthCheck(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.healthCheckModel,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build Anthropic API request parameters from internal request.
   */
  private buildRequestParams(request: CompletionRequest): MessageCreateParams {
    const messages = this.convertMessages(request.messages);

    const params: MessageCreateParams = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages,
    };

    if (request.systemPrompt) {
      params.system = request.systemPrompt;
    }

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if (request.stopSequences && request.stopSequences.length > 0) {
      params.stop_sequences = [...request.stopSequences];
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map((tool) => this.convertTool(tool));
    }

    return params;
  }

  /**
   * Convert internal messages to Anthropic message format.
   *
   * Handles:
   * - User/assistant message alternation
   * - Tool result messages (converted to user messages with tool_result content)
   * - Assistant messages with tool calls
   */
  private convertMessages(
    messages: readonly ConversationMessage[]
  ): MessageParam[] {
    const result: MessageParam[] = [];

    for (const msg of messages) {
      if (isUserMessage(msg)) {
        result.push({
          role: 'user',
          content: msg.content,
        });
      } else if (isAssistantMessage(msg)) {
        result.push(this.convertAssistantMessage(msg));
      } else if (isToolResultMessage(msg)) {
        // Tool results must be sent as user messages with tool_result content
        // Group consecutive tool results into a single user message
        const lastMessage = result[result.length - 1];
        const toolResultContent = {
          type: 'tool_result' as const,
          tool_use_id: msg.toolCallId,
          content: msg.content,
          is_error: msg.isError,
        };

        if (lastMessage && lastMessage.role === 'user' && Array.isArray(lastMessage.content)) {
          // Append to existing user message
          lastMessage.content.push(toolResultContent);
        } else {
          // Create new user message with tool result
          result.push({
            role: 'user',
            content: [toolResultContent],
          });
        }
      }
      // Skip system messages - they're handled via systemPrompt parameter
    }

    return result;
  }

  /**
   * Convert internal assistant message to Anthropic format.
   *
   * Handles mixed content (text + tool calls).
   */
  private convertAssistantMessage(msg: AssistantMessage): MessageParam {
    const content: Array<TextBlock | ToolUseBlock> = [];

    // Add text content if present
    if (msg.content) {
      content.push({
        type: 'text',
        text: msg.content,
      });
    }

    // Add tool calls if present
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const toolCall of msg.toolCalls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.arguments,
        });
      }
    }

    return {
      role: 'assistant',
      content,
    };
  }

  /**
   * Convert internal tool definition to Anthropic tool format.
   */
  private convertTool(tool: ToolDefinition): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required as string[],
      },
    };
  }

  /**
   * Convert Anthropic response to internal format.
   */
  private convertResponse(response: Message): CompletionResponse {
    let textContent = '';
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }> = [];

    // Extract content blocks
    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    // Build message with conditional toolCalls to satisfy exactOptionalPropertyTypes
    const message: CompletionResponse['message'] = {
      id: response.id,
      role: 'assistant',
      content: textContent,
      stopReason: this.convertStopReason(response.stop_reason),
      timestamp: Date.now(),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };

    return {
      message,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
    };
  }

  /**
   * Convert Anthropic stop reason to internal format.
   */
  private convertStopReason(
    stopReason: string | null
  ): 'end_turn' | 'tool_use' | 'max_tokens' | 'error' {
    switch (stopReason) {
      case 'end_turn':
        return 'end_turn';
      case 'tool_use':
        return 'tool_use';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'end_turn';
      default:
        return 'error';
    }
  }
}

/**
 * OpenAI provider implementation.
 *
 * Implements the Provider interface for OpenAI's GPT models.
 * Handles message format conversion, tool calling, and streaming.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletion,
} from 'openai/resources/chat/completions.js';
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
 * OpenAI GPT provider.
 *
 * Supports:
 * - Message format conversion between internal and OpenAI formats
 * - Tool calling with proper function format conversion
 * - Streaming responses with text and tool call deltas
 * - Multiple GPT model families (GPT-4, GPT-3.5)
 */
export class OpenAIProvider extends BaseProvider {
  private readonly client: OpenAI;
  private readonly models: readonly ModelInfo[];
  private readonly healthCheckModel: string;

  constructor(
    apiKey: string,
    timeout = 30000,
    maxRetries = 3,
    baseUrl?: string,
    models?: readonly ModelInfo[],
    healthCheckModel?: string,
    providerType = 'openai'
  ) {
    super(providerType, apiKey, timeout, maxRetries);
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });
    this.models = models ?? this.getDefaultModels();
    this.healthCheckModel = healthCheckModel ?? 'gpt-3.5-turbo';
  }

  /**
   * Get default OpenAI models.
   */
  private getDefaultModels(): readonly ModelInfo[] {
    return [
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        contextWindow: 128000,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        contextWindow: 8192,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        contextWindow: 16385,
        supportsTools: true,
        supportsStreaming: true,
      },
    ];
  }

  /**
   * Complete a conversation request.
   *
   * Converts internal message format to OpenAI's format, sends request,
   * and converts response back to internal format.
   */
  protected async doComplete(
    request: CompletionRequest,
    signal?: AbortSignal
  ): Promise<CompletionResponse> {
    const params = this.buildRequestParams(request);

    const response = await this.client.chat.completions.create(
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

    const stream = await this.client.chat.completions.create({
      ...params,
      stream: true,
    });

    // Track tool calls being built across chunks
    const toolCallsInProgress = new Map<
      number,
      { id: string; name: string; argumentsJson: string }
    >();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      // Handle text content delta
      if (delta.content) {
        yield {
          type: 'text_delta',
          delta: delta.content,
        };
      }

      // Handle tool call deltas
      if (delta.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;

          // Initialize tool call if this is the first chunk
          if (toolCallDelta.id) {
            toolCallsInProgress.set(index, {
              id: toolCallDelta.id,
              name: toolCallDelta.function?.name || '',
              argumentsJson: '',
            });
          }

          // Accumulate arguments
          const toolCall = toolCallsInProgress.get(index);
          if (toolCall && toolCallDelta.function?.arguments) {
            toolCall.argumentsJson += toolCallDelta.function.arguments;
          }
        }
      }

      // Handle finish_reason
      if (choice.finish_reason) {
        // Emit complete tool calls
        for (const toolCall of toolCallsInProgress.values()) {
          const args = JSON.parse(toolCall.argumentsJson) as Record<string, unknown>;
          yield {
            type: 'tool_call',
            toolCall: {
              id: toolCall.id,
              name: toolCall.name,
              arguments: args,
            },
          };
        }

        // Emit done with usage if available
        if (chunk.usage) {
          yield {
            type: 'done',
            usage: {
              inputTokens: chunk.usage.prompt_tokens || 0,
              outputTokens: chunk.usage.completion_tokens || 0,
              totalTokens: chunk.usage.total_tokens || 0,
            },
          };
        } else {
          yield {
            type: 'done',
          };
        }
      }
    }
  }

  /**
   * List available GPT models.
   *
   * Returns injected models or default hardcoded list of current GPT models with metadata.
   * Note: OpenAI API doesn't provide detailed model metadata, so this is static.
   */
  protected doListModels(): Promise<readonly ModelInfo[]> {
    return Promise.resolve(this.models);
  }

  /**
   * Check if the OpenAI API is accessible.
   *
   * Makes a minimal request to verify API key and connectivity.
   * Uses injected health check model or default cheapest model.
   */
  protected async doHealthCheck(): Promise<boolean> {
    try {
      await this.client.chat.completions.create(
        {
          model: this.healthCheckModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        },
        {}
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build OpenAI API request parameters from internal request.
   */
  private buildRequestParams(
    request: CompletionRequest
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const messages = this.convertMessages(request.messages, request.systemPrompt);

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages,
    };

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if (request.stopSequences && request.stopSequences.length > 0) {
      params.stop = [...request.stopSequences];
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map((tool) => this.convertTool(tool));
    }

    return params;
  }

  /**
   * Convert internal messages to OpenAI message format.
   *
   * Handles:
   * - System prompt as first message with 'system' role
   * - User/assistant message conversion
   * - Tool result messages (converted to 'tool' role messages)
   * - Assistant messages with tool calls
   */
  private convertMessages(
    messages: readonly ConversationMessage[],
    systemPrompt?: string
  ): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] = [];

    // Add system message first if present
    if (systemPrompt) {
      result.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      if (isUserMessage(msg)) {
        result.push({
          role: 'user',
          content: msg.content,
        });
      } else if (isAssistantMessage(msg)) {
        result.push(this.convertAssistantMessage(msg));
      } else if (isToolResultMessage(msg)) {
        // OpenAI has native 'tool' role for tool results
        result.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId,
        });
      }
      // Skip system messages - they're handled via systemPrompt parameter
    }

    return result;
  }

  /**
   * Convert internal assistant message to OpenAI format.
   *
   * Handles mixed content (text + tool calls).
   */
  private convertAssistantMessage(msg: AssistantMessage): ChatCompletionMessageParam {
    const message: ChatCompletionMessageParam = {
      role: 'assistant',
      content: msg.content,
    };

    // Add tool calls if present
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      message.tool_calls = msg.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: 'function' as const,
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments),
        },
      }));
    }

    return message;
  }

  /**
   * Convert internal tool definition to OpenAI tool format.
   */
  private convertTool(tool: ToolDefinition): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties,
          required: tool.parameters.required,
        },
      },
    };
  }

  /**
   * Convert OpenAI response to internal format.
   */
  private convertResponse(response: ChatCompletion): CompletionResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No choices in OpenAI response');
    }

    const message = choice.message;
    const textContent = message.content || '';
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }> = [];

    // Extract tool calls if present
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        toolCalls.push({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
        });
      }
    }

    // Build message with conditional toolCalls to satisfy exactOptionalPropertyTypes
    const responseMessage: CompletionResponse['message'] = {
      id: response.id,
      role: 'assistant',
      content: textContent,
      stopReason: this.convertStopReason(choice.finish_reason),
      timestamp: Date.now(),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };

    return {
      message: responseMessage,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
    };
  }

  /**
   * Convert OpenAI finish reason to internal format.
   */
  private convertStopReason(
    finishReason: string | null
  ): 'end_turn' | 'tool_use' | 'max_tokens' | 'error' {
    switch (finishReason) {
      case 'stop':
        return 'end_turn';
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'max_tokens';
      case 'content_filter':
        return 'error';
      default:
        return 'error';
    }
  }
}

/**
 * Model provider type definitions.
 */

import type { ConversationMessage, ToolCall } from './messages.js';
import type { ToolDefinition } from './tools.js';

/** Supported model providers (extensible via registry) */
export type ProviderType = string;

/** SDK type for providers */
export type SdkType = 'anthropic' | 'openai';

/** Provider configuration - credentials only */
export interface ProviderConfig {
  /** API key for the provider */
  readonly apiKey: string;
  /** Optional base URL override */
  readonly baseUrl?: string;
  /** Request timeout in milliseconds (default: 60000) */
  readonly timeout?: number;
  /** Maximum retry attempts (default: 3) */
  readonly maxRetries?: number;
}

/** Token usage statistics */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/** Model information */
export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly contextWindow: number;
  readonly supportsTools?: boolean;
  readonly supportsStreaming?: boolean;
  readonly maxOutputTokens?: number;
  readonly supportsToolCalling?: boolean;
}

/** Provider manifest from registry */
export interface ProviderManifest {
  readonly id: string;
  readonly name: string;
  readonly sdk: SdkType;
  readonly baseUrl: string;
  readonly models: readonly ModelInfo[];
  readonly healthCheckModel: string;
  readonly envVars: readonly string[];
}

/** Provider registry structure */
export interface ProviderRegistry {
  readonly version: string;
  readonly providers: Record<string, ProviderManifest>;
}

/** Request to model */
export interface CompletionRequest {
  readonly model: string;
  readonly messages: readonly ConversationMessage[];
  readonly tools?: readonly ToolDefinition[];
  readonly systemPrompt?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stopSequences?: readonly string[];
}

/** Response from model */
export interface CompletionResponse {
  readonly message: {
    readonly id: string;
    readonly role: 'assistant';
    readonly content: string;
    readonly toolCalls?: readonly ToolCall[];
    readonly stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error';
    readonly timestamp: number;
  };
  readonly usage: TokenUsage;
  readonly model: string;
}

/** Streaming response chunk */
export interface StreamChunk {
  readonly type: 'text_delta' | 'tool_call' | 'done' | 'error';
  readonly delta?: string;
  readonly toolCall?: Partial<ToolCall>;
  readonly usage?: TokenUsage;
  readonly error?: string;
}

/** Model provider interface */
export interface ModelProvider {
  readonly type: ProviderType;

  /**
   * Send messages to model and get response.
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Stream response chunks.
   */
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

  /**
   * List available models.
   */
  listModels(): Promise<readonly ModelInfo[]>;

  /**
   * Check provider health.
   */
  healthCheck(): Promise<boolean>;
}

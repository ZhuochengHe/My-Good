/**
 * Anthropic provider implementation (stub).
 *
 * TODO: Full implementation in Stage 2.2
 */

/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable require-yield */

import type {
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
} from '../types/providers.js';
import { BaseProvider } from './base.js';

/**
 * Anthropic provider stub.
 *
 * This is a placeholder implementation.
 * Full implementation will be added in Stage 2.2.
 */
export class AnthropicProvider extends BaseProvider {
  private readonly baseUrl: string | undefined;

  constructor(
    apiKey: string,
    timeout = 30000,
    maxRetries = 3,
    baseUrl?: string
  ) {
    super('anthropic', apiKey, timeout, maxRetries);
    this.baseUrl = baseUrl;
  }

  protected async doComplete(
    _request: CompletionRequest
  ): Promise<CompletionResponse> {
    // Stub implementation
    throw new Error('AnthropicProvider not yet implemented');
  }

  protected async *doStream(
    _request: CompletionRequest
  ): AsyncIterable<StreamChunk> {
    // Stub implementation
    throw new Error('AnthropicProvider streaming not yet implemented');
  }

  protected async doListModels(): Promise<readonly ModelInfo[]> {
    // Stub implementation
    return [];
  }

  protected async doHealthCheck(): Promise<boolean> {
    // Stub implementation - just check if we have an API key
    // baseUrl will be used in full implementation (Stage 2.2)
    void this.baseUrl;
    return this.apiKey.length > 0;
  }
}

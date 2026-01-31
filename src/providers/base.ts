/**
 * Base provider implementation.
 *
 * Abstract class that wraps provider-specific implementations with:
 * - Retry logic with exponential backoff
 * - Timeout enforcement using AbortSignal
 * - Consistent error handling
 */

import type {
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
  ModelProvider,
  ProviderType,
} from '../types/providers.js';
import { withRetry } from './retry.js';

/**
 * Base provider with retry and timeout handling.
 *
 * Concrete providers extend this class and implement the `do*` methods.
 * Public methods wrap the implementations with retry logic and timeout.
 */
export abstract class BaseProvider implements ModelProvider {
  readonly type: ProviderType;
  protected readonly apiKey: string;
  protected readonly timeout: number;
  protected readonly maxRetries: number;

  constructor(
    type: ProviderType,
    apiKey: string,
    timeout = 30000,
    maxRetries = 3
  ) {
    this.type = type;
    this.apiKey = apiKey;
    this.timeout = timeout;
    this.maxRetries = maxRetries;
  }

  /**
   * Send messages to model and get response.
   *
   * Wraps doComplete with retry logic and timeout.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const signal = AbortSignal.timeout(this.timeout);

    return withRetry(
      async () => this.doComplete(request, signal),
      { maxRetries: this.maxRetries, signal }
    );
  }

  /**
   * Stream response chunks.
   *
   * Note: Streaming does NOT use retry logic to avoid duplicate chunks.
   * Errors during streaming fail immediately.
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    yield* this.doStream(request);
  }

  /**
   * List available models.
   *
   * Wraps doListModels with retry logic.
   */
  async listModels(): Promise<readonly ModelInfo[]> {
    return withRetry(
      async () => this.doListModels(),
      { maxRetries: this.maxRetries }
    );
  }

  /**
   * Check provider health.
   *
   * Wraps doHealthCheck with retry logic.
   * Returns false on any error (including non-recoverable).
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await withRetry(
        async () => this.doHealthCheck(),
        { maxRetries: this.maxRetries }
      );
    } catch {
      return false;
    }
  }

  /**
   * Implementation-specific completion logic.
   *
   * @param request Completion request
   * @param signal AbortSignal for timeout
   */
  protected abstract doComplete(
    request: CompletionRequest,
    signal?: AbortSignal
  ): Promise<CompletionResponse>;

  /**
   * Implementation-specific streaming logic.
   *
   * @param request Completion request
   */
  protected abstract doStream(
    request: CompletionRequest
  ): AsyncIterable<StreamChunk>;

  /**
   * Implementation-specific model listing.
   */
  protected abstract doListModels(): Promise<readonly ModelInfo[]>;

  /**
   * Implementation-specific health check.
   */
  protected abstract doHealthCheck(): Promise<boolean>;
}

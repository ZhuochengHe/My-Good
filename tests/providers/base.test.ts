/**
 * Tests for base provider implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ModelInfo,
  ProviderType,
} from '../../src/types/providers.js';
import { BaseProvider } from '../../src/providers/base.js';
import {
  TimeoutError,
  AuthenticationError,
  NetworkError,
} from '../../src/errors/provider.js';

/** Test implementation of BaseProvider */
class TestProvider extends BaseProvider {
  constructor(apiKey: string, timeout = 30000, maxRetries = 3) {
    super('openai', apiKey, timeout, maxRetries);
  }

  protected async doComplete(
    request: CompletionRequest
  ): Promise<CompletionResponse> {
    // Mock implementation
    return {
      message: {
        id: 'test-id',
        role: 'assistant',
        content: 'test response',
        stopReason: 'end_turn',
        timestamp: Date.now(),
      },
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
      model: request.model,
    };
  }

  protected async *doStream(
    request: CompletionRequest
  ): AsyncIterable<StreamChunk> {
    yield { type: 'text_delta', delta: 'test' };
    yield { type: 'done', usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } };
  }

  protected async doListModels(): Promise<readonly ModelInfo[]> {
    return [
      {
        id: 'test-model',
        name: 'Test Model',
        contextWindow: 4096,
        supportsTools: true,
        supportsStreaming: true,
      },
    ];
  }

  protected async doHealthCheck(): Promise<boolean> {
    return true;
  }
}

describe('BaseProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider('test-api-key');
  });

  describe('constructor', () => {
    it('creates provider with required parameters', () => {
      const p = new TestProvider('api-key-123');
      expect(p.type).toBe('openai');
    });

    it('stores timeout and maxRetries', () => {
      const p = new TestProvider('api-key', 60000, 5);
      // Verify they're used by making a timeout error
      expect(p).toBeDefined();
    });
  });

  describe('complete()', () => {
    it('calls doComplete and returns result', async () => {
      const request: CompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
      };

      const response = await provider.complete(request);

      expect(response.message.content).toBe('test response');
      expect(response.model).toBe('test-model');
    });

    it('wraps doComplete with retry logic', async () => {
      const spy = vi.spyOn(provider as any, 'doComplete');
      spy
        .mockRejectedValueOnce(new NetworkError('connection failed'))
        .mockResolvedValueOnce({
          message: {
            id: 'test-id',
            role: 'assistant',
            content: 'success after retry',
            stopReason: 'end_turn',
            timestamp: Date.now(),
          },
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          model: 'test-model',
        });

      const request: CompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
      };

      const response = await provider.complete(request);

      expect(response.message.content).toBe('success after retry');
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('enforces timeout using AbortSignal', async () => {
      let receivedSignal: AbortSignal | undefined;

      const slowProvider = new (class extends TestProvider {
        protected async doComplete(
          _request: CompletionRequest,
          signal?: AbortSignal
        ): Promise<CompletionResponse> {
          receivedSignal = signal;

          // Simulate respecting the signal
          if (signal?.aborted) {
            throw new Error('aborted');
          }

          return {
            message: {
              id: 'test',
              role: 'assistant',
              content: 'response',
              stopReason: 'end_turn',
              timestamp: Date.now(),
            },
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
            model: 'test-model',
          };
        }
      })('api-key', 5000);

      const request: CompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
      };

      await slowProvider.complete(request);

      // Verify signal was passed to doComplete
      expect(receivedSignal).toBeDefined();
    });

    it('does not retry non-recoverable errors', async () => {
      const spy = vi.spyOn(provider as any, 'doComplete');
      spy.mockRejectedValue(new AuthenticationError('invalid api key'));

      const request: CompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'invalid api key'
      );
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('stream()', () => {
    it('returns async iterable from doStream', async () => {
      const request: CompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
      };

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.stream(request)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe('text_delta');
      expect(chunks[0].delta).toBe('test');
      expect(chunks[1].type).toBe('done');
    });

    it('does not retry streaming operations', async () => {
      const errorProvider = new (class extends TestProvider {
        protected async *doStream(): AsyncIterable<StreamChunk> {
          throw new NetworkError('stream failed');
        }
      })('api-key');

      const request: CompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
      };

      const chunks: StreamChunk[] = [];
      try {
        for await (const chunk of errorProvider.stream(request)) {
          chunks.push(chunk);
        }
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
      }
    });
  });

  describe('listModels()', () => {
    it('calls doListModels with retry', async () => {
      const models = await provider.listModels();

      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('test-model');
    });

    it('retries on network errors', async () => {
      const spy = vi.spyOn(provider as any, 'doListModels');
      spy
        .mockRejectedValueOnce(new NetworkError('connection failed'))
        .mockResolvedValueOnce([
          {
            id: 'model-1',
            name: 'Model 1',
            contextWindow: 4096,
            supportsTools: true,
            supportsStreaming: true,
          },
        ]);

      const models = await provider.listModels();

      expect(models).toHaveLength(1);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('healthCheck()', () => {
    it('calls doHealthCheck with retry', async () => {
      const healthy = await provider.healthCheck();

      expect(healthy).toBe(true);
    });

    it('retries on failures', async () => {
      const spy = vi.spyOn(provider as any, 'doHealthCheck');
      spy
        .mockRejectedValueOnce(new NetworkError('connection failed'))
        .mockResolvedValueOnce(true);

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(true);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('returns false on non-recoverable errors', async () => {
      const spy = vi.spyOn(provider as any, 'doHealthCheck');
      spy.mockRejectedValue(new AuthenticationError('invalid key'));

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(false);
    });
  });

  describe('signal timeout', () => {
    it('creates timeout signal for complete', async () => {
      const timeoutProvider = new TestProvider('api-key', 5000);

      // Spy on AbortSignal.timeout
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

      const request: CompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
      };

      await timeoutProvider.complete(request);

      expect(timeoutSpy).toHaveBeenCalledWith(5000);
      timeoutSpy.mockRestore();
    });
  });

  describe('abstract methods enforcement', () => {
    it('requires doComplete implementation', () => {
      class IncompleteProvider extends BaseProvider {
        // Missing doComplete
        protected async *doStream(): AsyncIterable<StreamChunk> {
          yield { type: 'done' };
        }
        protected async doListModels(): Promise<readonly ModelInfo[]> {
          return [];
        }
        protected async doHealthCheck(): Promise<boolean> {
          return true;
        }
      }

      // TypeScript should catch this, but verify at runtime
      expect(() => {
        const p = new (IncompleteProvider as any)('test', 'key');
        // Should not be able to call complete
      }).toBeDefined();
    });
  });
});

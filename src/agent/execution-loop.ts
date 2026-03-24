/**
 * Agent execution loop implementation.
 *
 * Core orchestration logic for the agent:
 * - Manages conversation turns with LLM provider
 * - Handles tool calling workflow
 * - Emits lifecycle events
 * - Supports streaming responses
 * - Implements cancellation and error handling
 */

import type {
  Agent,
  AgentConfig,
  AgentRunOptions,
  AgentRunResult,
  AgentError,
  AgentFinishReason,
} from '../types/agent.js';
import type { ConversationMessage, ToolCall } from '../types/messages.js';
import type { ToolDefinition, ToolResult } from '../types/tools.js';
import type { ModelProvider, TokenUsage } from '../types/providers.js';
import type { AgentEvent } from '../types/events.js';
import type { Session, SessionStore } from '../types/sessions.js';
import type { AgentSettings } from '../types/settings.js';
import type { MemoryStore, EmbeddingIndex } from '../types/memory.js';
import { consolidate } from '../memory/consolidation.js';
import type { ConsolidationConfig } from '../memory/consolidation.js';
import { ContextBuilder } from './context-builder.js';
import { randomUUID } from 'crypto';

/**
 * Tool call context passed to onToolCall handler.
 */
interface ToolCallContext {
  readonly sessionId: string;
  readonly workingDirectory: string;
  readonly signal?: AbortSignal;
}

/**
 * Options for onToolCall callback.
 */
export interface OnToolCallCallback {
  (call: ToolCall, context: ToolCallContext): Promise<ToolResult>;
}

/**
 * Extended run options with tool callback.
 */
export interface ExtendedRunOptions extends AgentRunOptions {
  readonly onToolCall?: OnToolCallCallback;
  /** Optional summary of a compacted prior conversation to inject into the system prompt. */
  readonly compactSummary?: string;
}

/**
 * Agent execution loop.
 *
 * Implements the Agent interface with full execution logic including:
 * - Turn-based conversation loop
 * - Tool call detection and execution
 * - Event emission for observability
 * - Token usage tracking
 * - Error handling and cancellation
 */
export class ExecutionLoop implements Agent {
  readonly config: AgentConfig;
  private readonly settings: AgentSettings;
  private readonly provider: ModelProvider;
  private readonly contextBuilder: ContextBuilder;
  private readonly toolDefinitions: readonly ToolDefinition[];
  private readonly workingDirectory: string;
  private readonly sessionStore: SessionStore | undefined;
  private readonly memoryStore: MemoryStore | undefined;
  private readonly embeddingIndex: EmbeddingIndex | undefined;
  private readonly consolidationConfig: ConsolidationConfig | undefined;

  constructor(
    config: AgentConfig,
    settings: AgentSettings,
    provider: ModelProvider,
    toolDefinitions?: readonly ToolDefinition[],
    workingDirectory?: string,
    sessionStore?: SessionStore,
    memoryStore?: MemoryStore,
    consolidationConfig?: ConsolidationConfig,
    embeddingIndex?: EmbeddingIndex
  ) {
    this.config = config;
    this.settings = settings;
    this.provider = provider;
    this.contextBuilder = new ContextBuilder();
    this.toolDefinitions = toolDefinitions ?? [];
    this.workingDirectory = workingDirectory ?? process.cwd();
    this.sessionStore = sessionStore;
    this.memoryStore = memoryStore;
    this.consolidationConfig = consolidationConfig;
    this.embeddingIndex = embeddingIndex;
  }

  /**
   * Run agent with user input.
   *
   * Executes the agent loop until completion, max turns, error, or cancellation.
   */
  async run(
    input: string,
    options?: ExtendedRunOptions
  ): Promise<AgentRunResult> {
    const sessionId = options?.sessionId ?? randomUUID();
    const signal = options?.signal;
    const onEvent = options?.onEvent;
    const onToolCall = options?.onToolCall;

    // Initialize state — seed messages from conversation history when provided
    const messages: ConversationMessage[] = [...(options?.conversationHistory ?? [])];
    const toolCalls: ToolResult[] = [];
    let totalUsage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    let turnNumber = 0;
    let finishReason: AgentFinishReason = 'completed';
    let error: AgentError | undefined;

    // Emit agent_start event
    await this.emitEvent(
      {
        type: 'agent_start',
        sessionId,
        timestamp: Date.now(),
      },
      onEvent
    );

    try {
      // Check if already cancelled
      if (signal?.aborted) {
        finishReason = 'cancelled';
        return this.buildResult(
          sessionId,
          messages,
          toolCalls,
          totalUsage,
          turnNumber,
          finishReason,
          error
        );
      }

      // Add initial user message
      const userMessage: ConversationMessage = {
        id: randomUUID(),
        role: 'user',
        content: input,
        timestamp: Date.now(),
      };
      messages.push(userMessage);

      // Build system prompt with memory injection before the loop
      const systemPrompt = await this.buildSystemPrompt(options?.compactSummary);

      // Main execution loop
      while (turnNumber < this.settings.behavior.maxTurns) {
        // Check cancellation before each turn
        if (signal?.aborted) {
          finishReason = 'cancelled';
          break;
        }

        turnNumber++;

        // Emit turn_start
        await this.emitEvent(
          {
            type: 'turn_start',
            turnNumber,
          },
          onEvent
        );

        // Build request
        const request = this.contextBuilder.buildRequest({
          model: this.config.model,
          messages,
          systemPrompt,
          maxTokens: this.settings.model.maxTokens,
          ...(this.toolDefinitions.length > 0 && { tools: this.toolDefinitions }),
        });

        // Call provider
        const response = await this.provider.complete(request);

        // Accumulate usage
        totalUsage = {
          inputTokens: totalUsage.inputTokens + response.usage.inputTokens,
          outputTokens: totalUsage.outputTokens + response.usage.outputTokens,
          totalTokens: totalUsage.totalTokens + response.usage.totalTokens,
        };

        // Add assistant message
        const assistantMessage: ConversationMessage = {
          id: response.message.id,
          role: 'assistant',
          content: response.message.content,
          ...(response.message.toolCalls && { toolCalls: response.message.toolCalls }),
          stopReason: response.message.stopReason,
          timestamp: response.message.timestamp,
        };
        messages.push(assistantMessage);

        // Emit turn_end
        await this.emitEvent(
          {
            type: 'turn_end',
            turnNumber,
            usage: response.usage,
            timestamp: Date.now(),
          },
          onEvent
        );

        // Check stop reason
        if (response.message.stopReason === 'error') {
          finishReason = 'error';
          error = {
            code: 'PROVIDER_ERROR',
            message: 'Provider returned error stop reason',
            recoverable: false,
          };
          break;
        }

        if (
          response.message.stopReason === 'end_turn' ||
          response.message.stopReason === 'max_tokens'
        ) {
          finishReason = 'completed';
          break;
        }

        // Handle tool calls
        if (
          response.message.stopReason === 'tool_use' &&
          response.message.toolCalls &&
          response.message.toolCalls.length > 0
        ) {
          // Check if onToolCall is provided
          if (!onToolCall) {
            finishReason = 'error';
            error = {
              code: 'TOOL_ERROR',
              message: 'Tool calls requested but no onToolCall handler provided',
              recoverable: false,
            };
            break;
          }

          // Execute each tool call
          for (const toolCall of response.message.toolCalls) {
            // Emit tool_call_start
            await this.emitEvent(
              {
                type: 'tool_call_start',
                toolCall,
              },
              onEvent
            );

            // Execute tool
            const context: ToolCallContext = {
              sessionId,
              workingDirectory: this.workingDirectory,
              ...(signal && { signal }),
            };

            const result = await onToolCall(toolCall, context);
            toolCalls.push(result);

            // Emit tool_call_end
            await this.emitEvent(
              {
                type: 'tool_call_end',
                result,
              },
              onEvent
            );

            // Add tool result message
            const toolResultMessage: ConversationMessage = {
              id: randomUUID(),
              role: 'tool',
              content: result.output,
              toolCallId: result.callId,
              toolName: result.name,
              isError: !result.success,
              timestamp: Date.now(),
            };
            messages.push(toolResultMessage);
          }

          // Continue loop for next turn
          continue;
        }

        // If we get here, stop reason wasn't handled
        break;
      }

      // Check if we hit max turns
      if (turnNumber >= this.settings.behavior.maxTurns && finishReason === 'completed') {
        finishReason = 'max_turns';
      }
    } catch (err) {
      // Handle any errors during execution
      finishReason = 'error';
      error = {
        code: 'PROVIDER_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error',
        recoverable: false,
        ...(err instanceof Error && { cause: err }),
      };

      // Emit error event
      await this.emitEvent(
        {
          type: 'error',
          error,
          timestamp: Date.now(),
        },
        onEvent
      );
    }

    // Build final result
    const result = this.buildResult(
      sessionId,
      messages,
      toolCalls,
      totalUsage,
      turnNumber,
      finishReason,
      error
    );

    // Emit agent_end
    await this.emitEvent(
      {
        type: 'agent_end',
        result,
        timestamp: Date.now(),
      },
      onEvent
    );

    // Run consolidation after the session ends (fire-and-forget).
    // Failures are silently swallowed — consolidation must never crash a session.
    this.runConsolidation(messages).catch(() => undefined);

    return result;
  }

  /**
   * Stream agent execution.
   *
   * Yields events as they occur during execution.
   */
  async *stream(
    input: string,
    options?: ExtendedRunOptions
  ): AsyncIterable<AgentEvent> {
    const sessionId = options?.sessionId ?? randomUUID();
    const signal = options?.signal;

    // Initialize state — seed messages from conversation history when provided
    const messages: ConversationMessage[] = [...(options?.conversationHistory ?? [])];
    const toolCalls: ToolResult[] = [];
    let totalUsage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    let turnNumber = 0;
    let finishReason: AgentFinishReason = 'completed';
    let error: AgentError | undefined;

    // Yield agent_start
    yield {
      type: 'agent_start',
      sessionId,
      timestamp: Date.now(),
    };

    try {
      // Check if already cancelled
      if (signal?.aborted) {
        finishReason = 'cancelled';
        const result = this.buildResult(
          sessionId,
          messages,
          toolCalls,
          totalUsage,
          turnNumber,
          finishReason,
          error
        );
        yield {
          type: 'agent_end',
          result,
          timestamp: Date.now(),
        };
        return;
      }

      // Add initial user message
      const userMessage: ConversationMessage = {
        id: randomUUID(),
        role: 'user',
        content: input,
        timestamp: Date.now(),
      };
      messages.push(userMessage);

      // Build system prompt with memory injection before the loop
      const systemPrompt = await this.buildSystemPrompt(options?.compactSummary);

      // Main execution loop
      while (turnNumber < this.settings.behavior.maxTurns) {
        // Check cancellation
        if (signal?.aborted) {
          finishReason = 'cancelled';
          break;
        }

        turnNumber++;

        // Yield turn_start
        yield {
          type: 'turn_start',
          turnNumber,
        };

        // Build request
        const request = this.contextBuilder.buildRequest({
          model: this.config.model,
          messages,
          systemPrompt,
          maxTokens: this.settings.model.maxTokens,
          ...(this.toolDefinitions.length > 0 && { tools: this.toolDefinitions }),
        });

        // Stream provider response
        let content = '';
        let responseUsage: TokenUsage = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };
        const pendingToolCalls: ToolCall[] = [];

        for await (const chunk of this.provider.stream(request)) {
          if (chunk.type === 'text_delta' && chunk.delta) {
            content += chunk.delta;
            yield {
              type: 'text_delta',
              delta: chunk.delta,
            };
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            const tc = chunk.toolCall;
            if (tc.id && tc.name && tc.arguments !== undefined) {
              pendingToolCalls.push({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
              });
            }
          } else if (chunk.type === 'done' && chunk.usage) {
            responseUsage = chunk.usage;
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error ?? 'Stream error');
          }
        }

        // Accumulate usage
        totalUsage = {
          inputTokens: totalUsage.inputTokens + responseUsage.inputTokens,
          outputTokens: totalUsage.outputTokens + responseUsage.outputTokens,
          totalTokens: totalUsage.totalTokens + responseUsage.totalTokens,
        };

        if (pendingToolCalls.length > 0) {
          // Treat as tool_use turn

          // Add assistant message with tool calls
          const assistantMessage: ConversationMessage = {
            id: randomUUID(),
            role: 'assistant',
            content,
            toolCalls: pendingToolCalls,
            stopReason: 'tool_use',
            timestamp: Date.now(),
          };
          messages.push(assistantMessage);

          // Yield turn_end
          yield {
            type: 'turn_end',
            turnNumber,
            usage: responseUsage,
            timestamp: Date.now(),
          };

          // Check if onToolCall is provided
          const onToolCall = options?.onToolCall;
          if (!onToolCall) {
            finishReason = 'error';
            error = {
              code: 'TOOL_ERROR',
              message: 'Tool calls requested but no onToolCall handler provided',
              recoverable: false,
            };
            break;
          }

          // Execute each tool call
          for (const toolCallItem of pendingToolCalls) {
            // Yield tool_call_start
            yield {
              type: 'tool_call_start',
              toolCall: toolCallItem,
            };

            const context: ToolCallContext = {
              sessionId,
              workingDirectory: this.workingDirectory,
              ...(signal && { signal }),
            };

            const result = await onToolCall(toolCallItem, context);
            toolCalls.push(result);

            // Yield tool_call_end
            yield {
              type: 'tool_call_end',
              result,
            };

            // Add tool result message
            const toolResultMessage: ConversationMessage = {
              id: randomUUID(),
              role: 'tool',
              content: result.output,
              toolCallId: result.callId,
              toolName: result.name,
              isError: !result.success,
              timestamp: Date.now(),
            };
            messages.push(toolResultMessage);
          }

          // Continue loop for next turn
          continue;
        } else {
          // No tool calls: end_turn

          // Add assistant message
          const assistantMessage: ConversationMessage = {
            id: randomUUID(),
            role: 'assistant',
            content,
            stopReason: 'end_turn',
            timestamp: Date.now(),
          };
          messages.push(assistantMessage);

          // Yield turn_end
          yield {
            type: 'turn_end',
            turnNumber,
            usage: responseUsage,
            timestamp: Date.now(),
          };

          finishReason = 'completed';
          break;
        }
      }

      // Check if we hit max turns
      if (turnNumber >= this.settings.behavior.maxTurns && finishReason === 'completed') {
        finishReason = 'max_turns';
      }
    } catch (err) {
      finishReason = 'error';
      error = {
        code: 'PROVIDER_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error',
        recoverable: false,
        ...(err instanceof Error && { cause: err }),
      };

      yield {
        type: 'error',
        error,
        timestamp: Date.now(),
      };
    }

    // Build and yield final result
    const result = this.buildResult(
      sessionId,
      messages,
      toolCalls,
      totalUsage,
      turnNumber,
      finishReason,
      error
    );

    yield {
      type: 'agent_end',
      result,
      timestamp: Date.now(),
    };

    // Run consolidation after the session ends (fire-and-forget).
    this.runConsolidation(messages).catch(() => undefined);

    return result;
  }

  /**
   * Get available tools.
   *
   * Returns list of tools the agent can use.
   */
  getTools(): readonly ToolDefinition[] {
    return this.toolDefinitions;
  }

  /**
   * Get current session.
   *
   * Retrieves session by ID from session store.
   */
  async getSession(sessionId: string): Promise<Session | null> {
    if (!this.sessionStore) {
      return null;
    }
    return this.sessionStore.load(sessionId);
  }

  /**
   * Runs the memory consolidation pipeline on the session messages.
   * No-op when memoryStore or consolidationConfig is absent.
   *
   * @param messages - All messages from the completed session
   */
  private async runConsolidation(messages: ConversationMessage[]): Promise<void> {
    if (!this.memoryStore || !this.consolidationConfig) return;
    await consolidate(messages, this.memoryStore, this.consolidationConfig, this.embeddingIndex);
  }

  /**
   * Build the system prompt, injecting preference entries and recent episodic entries when
   * a MemoryStore is present. Experiential and semantic entries are NOT injected here; they
   * are retrieved on-demand via the search_memory tool.
   */
  private async buildSystemPrompt(compactSummary?: string): Promise<string> {
    const injectedMemories = this.memoryStore
      ? await this.memoryStore.loadForSystemPrompt()
      : [];

    const identitySection =
      injectedMemories.length > 0
        ? `\n\n## What I Know About You\n${injectedMemories.map((m) => `- ${m.content}`).join('\n')}`
        : '';

    const preferencesSection = '';

    const summarySection =
      compactSummary !== undefined && compactSummary.length > 0
        ? `\n\n## Previous Conversation Summary\n${compactSummary}`
        : '';

    return (
      `${this.settings.behavior.systemPrompt}` +
      identitySection +
      preferencesSection +
      summarySection +
      `\n\nCurrent working directory: ${this.workingDirectory}` +
      `\n\nCurrent date and time: ${new Date().toLocaleString()}`
    );
  }

  /**
   * Build the final result object.
   */
  private buildResult(
    sessionId: string,
    messages: ConversationMessage[],
    toolCalls: ToolResult[],
    usage: TokenUsage,
    turns: number,
    finishReason: AgentFinishReason,
    error?: AgentError
  ): AgentRunResult {
    return {
      sessionId,
      messages,
      toolCalls,
      usage,
      turns,
      finishReason,
      ...(error && { error }),
    };
  }

  /**
   * Emit an event to the callback if provided.
   */
  private async emitEvent(
    event: AgentEvent,
    onEvent?: (event: AgentEvent) => void | Promise<void>
  ): Promise<void> {
    if (onEvent) {
      await onEvent(event);
    }
  }
}

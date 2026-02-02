/**
 * Integration tests for agent execution loop.
 *
 * End-to-end scenarios testing the full agent workflow with realistic use cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionLoop } from '../../src/agent/execution-loop.js';
import type { AgentConfig } from '../../src/types/agent.js';
import type { ModelProvider, CompletionResponse, StreamChunk } from '../../src/types/providers.js';
import type { ToolCall } from '../../src/types/messages.js';
import type { ToolResult } from '../../src/types/tools.js';
import type { AgentEvent } from '../../src/types/events.js';

// Realistic mock provider that simulates actual LLM behavior
class RealisticMockProvider implements ModelProvider {
  readonly type = 'anthropic' as const;

  private callCount = 0;

  async complete(request: any): Promise<CompletionResponse> {
    this.callCount++;

    // Simulate different responses based on message history
    const lastMessage = request.messages[request.messages.length - 1];

    if (!lastMessage) {
      throw new Error('No messages in request');
    }

    // First interaction - respond with greeting and offer tool use
    if (lastMessage.role === 'user' && lastMessage.content.includes('calculate')) {
      return {
        message: {
          id: `msg_${this.callCount}`,
          role: 'assistant',
          content: 'I can help with that calculation.',
          toolCalls: [
            {
              id: `call_${this.callCount}`,
              name: 'calculator',
              arguments: { expression: '123 * 456' },
            },
          ],
          stopReason: 'tool_use',
          timestamp: Date.now(),
        },
        usage: {
          inputTokens: 50,
          outputTokens: 25,
          totalTokens: 75,
        },
        model: 'claude-3-5-sonnet-20241022',
      };
    }

    // After tool result - provide final answer
    if (lastMessage.role === 'tool') {
      return {
        message: {
          id: `msg_${this.callCount}`,
          role: 'assistant',
          content: `The result is ${lastMessage.content}.`,
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: {
          inputTokens: 60,
          outputTokens: 15,
          totalTokens: 75,
        },
        model: 'claude-3-5-sonnet-20241022',
      };
    }

    // Simple query without tools
    if (lastMessage.role === 'user' && lastMessage.content.includes('hello')) {
      return {
        message: {
          id: `msg_${this.callCount}`,
          role: 'assistant',
          content: 'Hello! How can I assist you today?',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: {
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30,
        },
        model: 'claude-3-5-sonnet-20241022',
      };
    }

    // Multi-turn with multiple tools
    if (lastMessage.role === 'user' && lastMessage.content.includes('research')) {
      return {
        message: {
          id: `msg_${this.callCount}`,
          role: 'assistant',
          content: 'Let me search for information and read relevant files.',
          toolCalls: [
            {
              id: `call_${this.callCount}_1`,
              name: 'web_search',
              arguments: { query: 'TypeScript best practices' },
            },
            {
              id: `call_${this.callCount}_2`,
              name: 'read_file',
              arguments: { path: 'docs/README.md' },
            },
          ],
          stopReason: 'tool_use',
          timestamp: Date.now(),
        },
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
        model: 'claude-3-5-sonnet-20241022',
      };
    }

    // After multiple tool results
    if (
      lastMessage.role === 'tool' &&
      request.messages.filter((m: any) => m.role === 'tool').length >= 2
    ) {
      return {
        message: {
          id: `msg_${this.callCount}`,
          role: 'assistant',
          content: 'Based on the search results and documentation, here are the best practices...',
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        usage: {
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
        },
        model: 'claude-3-5-sonnet-20241022',
      };
    }

    // Default response
    return {
      message: {
        id: `msg_${this.callCount}`,
        role: 'assistant',
        content: 'I understand.',
        stopReason: 'end_turn',
        timestamp: Date.now(),
      },
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
      model: 'claude-3-5-sonnet-20241022',
    };
  }

  async *stream(request: any): AsyncIterable<StreamChunk> {
    const response = await this.complete(request);

    // Split content into chunks
    const words = response.message.content.split(' ');
    for (const word of words) {
      yield {
        type: 'text_delta',
        delta: word + ' ',
      };
    }

    yield {
      type: 'done',
      usage: response.usage,
    };
  }

  async listModels() {
    return [];
  }

  async healthCheck() {
    return true;
  }

  reset() {
    this.callCount = 0;
  }
}

// Helper to create config
function createConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: 'integration-test-agent',
    name: 'Integration Test Agent',
    systemPrompt: 'You are a helpful AI assistant.',
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    maxTurns: 10,
    maxTokensPerTurn: 4096,
    tools: {
      allow: ['*'],
      deny: [],
      requireApproval: [],
    },
    ...overrides,
  };
}

describe('ExecutionLoop Integration Tests', () => {
  let provider: RealisticMockProvider;
  let config: AgentConfig;
  let agent: ExecutionLoop;

  beforeEach(() => {
    provider = new RealisticMockProvider();
    config = createConfig();
    agent = new ExecutionLoop(config, provider);
  });

  describe('Simple Interactions', () => {
    it('handles basic greeting without tools', async () => {
      const result = await agent.run('hello');

      expect(result.finishReason).toBe('completed');
      expect(result.turns).toBe(1);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1]?.content).toContain('Hello');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.usage.totalTokens).toBeGreaterThan(0);
    });

    it('maintains conversation context across turns', async () => {
      const result = await agent.run('hello');

      expect(result.messages[0]?.role).toBe('user');
      expect(result.messages[0]?.content).toBe('hello');
      expect(result.messages[1]?.role).toBe('assistant');
    });
  });

  describe('Tool Calling Workflows', () => {
    it('completes single tool call workflow', async () => {
      const onToolCall = async (call: ToolCall): Promise<ToolResult> => {
        expect(call.name).toBe('calculator');
        expect(call.arguments).toHaveProperty('expression');

        return {
          callId: call.id,
          name: call.name,
          success: true,
          output: '56088',
          durationMs: 5,
        };
      };

      const result = await agent.run('calculate 123 * 456', { onToolCall });

      expect(result.finishReason).toBe('completed');
      expect(result.turns).toBe(2);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]?.success).toBe(true);
      expect(result.toolCalls[0]?.output).toBe('56088');

      // Check message sequence: user -> assistant (tool call) -> tool result -> assistant (final)
      expect(result.messages).toHaveLength(4);
      expect(result.messages[0]?.role).toBe('user');
      expect(result.messages[1]?.role).toBe('assistant');
      expect(result.messages[2]?.role).toBe('tool');
      expect(result.messages[3]?.role).toBe('assistant');
      expect(result.messages[3]?.content).toContain('56088');
    });

    it('handles multiple tool calls in parallel', async () => {
      const toolCallCounts = {
        web_search: 0,
        read_file: 0,
      };

      const onToolCall = async (call: ToolCall): Promise<ToolResult> => {
        if (call.name === 'web_search') {
          toolCallCounts.web_search++;
          return {
            callId: call.id,
            name: call.name,
            success: true,
            output: 'Search results: TypeScript uses static typing...',
            durationMs: 100,
          };
        }

        if (call.name === 'read_file') {
          toolCallCounts.read_file++;
          return {
            callId: call.id,
            name: call.name,
            success: true,
            output: '# README\nProject documentation...',
            durationMs: 10,
          };
        }

        throw new Error(`Unexpected tool: ${call.name}`);
      };

      const result = await agent.run('research TypeScript', { onToolCall });

      expect(result.finishReason).toBe('completed');
      expect(result.turns).toBe(2);
      expect(result.toolCalls).toHaveLength(2);
      expect(toolCallCounts.web_search).toBe(1);
      expect(toolCallCounts.read_file).toBe(1);

      // Verify both tool results are in messages
      const toolMessages = result.messages.filter((m) => m.role === 'tool');
      expect(toolMessages).toHaveLength(2);
    });

    it('handles tool execution errors gracefully', async () => {
      const onToolCall = async (call: ToolCall): Promise<ToolResult> => {
        return {
          callId: call.id,
          name: call.name,
          success: false,
          output: '',
          error: {
            code: 'EXECUTION_ERROR',
            message: 'Division by zero',
          },
          durationMs: 1,
        };
      };

      const result = await agent.run('calculate 10 / 0', { onToolCall });

      expect(result.finishReason).toBe('completed');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]?.success).toBe(false);
      expect(result.toolCalls[0]?.error).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    it('emits all lifecycle events in correct order', async () => {
      const events: AgentEvent[] = [];
      const onEvent = (event: AgentEvent) => {
        events.push(event);
      };

      await agent.run('hello', { onEvent });

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toEqual([
        'agent_start',
        'turn_start',
        'turn_end',
        'agent_end',
      ]);
    });

    it('emits tool call events for tool interactions', async () => {
      const events: AgentEvent[] = [];
      const onEvent = (event: AgentEvent) => {
        events.push(event);
      };

      const onToolCall = async (call: ToolCall): Promise<ToolResult> => ({
        callId: call.id,
        name: call.name,
        success: true,
        output: 'result',
        durationMs: 5,
      });

      await agent.run('calculate something', { onEvent, onToolCall });

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('tool_call_start');
      expect(eventTypes).toContain('tool_call_end');

      // Verify tool call start comes before tool call end
      const startIndex = eventTypes.indexOf('tool_call_start');
      const endIndex = eventTypes.indexOf('tool_call_end');
      expect(startIndex).toBeLessThan(endIndex);
    });

    it('provides session ID in agent_start event', async () => {
      const events: AgentEvent[] = [];
      const customSessionId = 'custom-session-123';

      const onEvent = (event: AgentEvent) => {
        events.push(event);
      };

      await agent.run('hello', { sessionId: customSessionId, onEvent });

      const startEvent = events[0];
      expect(startEvent?.type).toBe('agent_start');
      if (startEvent?.type === 'agent_start') {
        expect(startEvent.sessionId).toBe(customSessionId);
      }
    });
  });

  describe('Token Usage Tracking', () => {
    it('accurately accumulates tokens across turns', async () => {
      const onToolCall = async (call: ToolCall): Promise<ToolResult> => ({
        callId: call.id,
        name: call.name,
        success: true,
        output: 'result',
        durationMs: 5,
      });

      const result = await agent.run('calculate something', { onToolCall });

      // Should have usage from 2 turns
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBe(
        result.usage.inputTokens + result.usage.outputTokens
      );
    });

    it('includes token usage in turn_end events', async () => {
      const events: AgentEvent[] = [];
      const onEvent = (event: AgentEvent) => {
        events.push(event);
      };

      await agent.run('hello', { onEvent });

      const turnEndEvents = events.filter((e) => e.type === 'turn_end');
      expect(turnEndEvents).toHaveLength(1);

      const turnEnd = turnEndEvents[0];
      if (turnEnd?.type === 'turn_end') {
        expect(turnEnd.usage.totalTokens).toBeGreaterThan(0);
      }
    });
  });

  describe('Streaming', () => {
    it('streams text deltas for response', async () => {
      const events: AgentEvent[] = [];

      for await (const event of agent.stream('hello')) {
        events.push(event);
      }

      const textDeltas = events.filter((e) => e.type === 'text_delta');
      expect(textDeltas.length).toBeGreaterThan(0);

      // Reconstruct full text from deltas
      let fullText = '';
      for (const event of textDeltas) {
        if (event.type === 'text_delta') {
          fullText += event.delta;
        }
      }

      expect(fullText.trim()).toContain('Hello');
    });

    it('yields agent_end as final event', async () => {
      const events: AgentEvent[] = [];

      for await (const event of agent.stream('hello')) {
        events.push(event);
      }

      const lastEvent = events[events.length - 1];
      expect(lastEvent?.type).toBe('agent_end');
    });

    it('includes final result in agent_end', async () => {
      let agentEndEvent: AgentEvent | null = null;

      for await (const event of agent.stream('hello')) {
        if (event.type === 'agent_end') {
          agentEndEvent = event;
        }
      }

      expect(agentEndEvent?.type).toBe('agent_end');
      if (agentEndEvent?.type === 'agent_end') {
        expect(agentEndEvent.result.finishReason).toBe('completed');
        expect(agentEndEvent.result.messages.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Recovery', () => {
    it('returns error result when provider fails', async () => {
      // Create agent with provider that will fail
      const failingProvider = new RealisticMockProvider();
      failingProvider.complete = async () => {
        throw new Error('Provider error: Rate limit exceeded');
      };

      const failingAgent = new ExecutionLoop(config, failingProvider);

      const result = await failingAgent.run('test');

      expect(result.finishReason).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('PROVIDER_ERROR');
      expect(result.error?.message).toContain('Rate limit exceeded');
    });

    it('continues after non-fatal tool errors', async () => {
      const onToolCall = async (call: ToolCall): Promise<ToolResult> => {
        return {
          callId: call.id,
          name: call.name,
          success: false,
          output: '',
          error: {
            code: 'EXECUTION_ERROR',
            message: 'Tool failed but agent can continue',
          },
          durationMs: 1,
        };
      };

      const result = await agent.run('calculate something', { onToolCall });

      // Agent should complete despite tool error
      expect(result.finishReason).toBe('completed');
      expect(result.turns).toBe(2);
    });
  });

  describe('Cancellation', () => {
    it('stops execution when signal is aborted', async () => {
      const abortController = new AbortController();

      // Abort immediately
      abortController.abort();

      const result = await agent.run('hello', {
        signal: abortController.signal,
      });

      expect(result.finishReason).toBe('cancelled');
      expect(result.turns).toBe(0);
    });

    it('respects abort during tool execution', async () => {
      const abortController = new AbortController();

      const onToolCall = async (call: ToolCall): Promise<ToolResult> => {
        // Abort during tool execution
        abortController.abort();

        return {
          callId: call.id,
          name: call.name,
          success: true,
          output: 'result',
          durationMs: 5,
        };
      };

      const result = await agent.run('calculate something', {
        onToolCall,
        signal: abortController.signal,
      });

      expect(result.finishReason).toBe('cancelled');
      expect(result.turns).toBe(1); // Completed first turn before cancellation
    });
  });

  describe('Configuration', () => {
    it('respects custom maxTurns setting', async () => {
      const limitedConfig = createConfig({ maxTurns: 1 });
      const limitedAgent = new ExecutionLoop(limitedConfig, provider);

      const onToolCall = async (call: ToolCall): Promise<ToolResult> => ({
        callId: call.id,
        name: call.name,
        success: true,
        output: 'result',
        durationMs: 5,
      });

      const result = await limitedAgent.run('calculate something', { onToolCall });

      expect(result.finishReason).toBe('max_turns');
      expect(result.turns).toBe(1);
    });

    it('uses system prompt from config', async () => {
      const customConfig = createConfig({
        systemPrompt: 'You are a math tutor specializing in calculus.',
      });
      const customAgent = new ExecutionLoop(customConfig, provider);

      const result = await customAgent.run('hello');

      // System prompt should be used (verified through config)
      expect(customAgent.config.systemPrompt).toBe(
        'You are a math tutor specializing in calculus.'
      );
      expect(result.finishReason).toBe('completed');
    });
  });
});

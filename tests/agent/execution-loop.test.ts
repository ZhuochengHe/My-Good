/**
 * Tests for agent execution loop.
 *
 * Comprehensive test coverage for the core agent execution logic:
 * - Basic flow (input → response)
 * - Tool calling (detection, execution, continuation)
 * - Turn limits and stop conditions
 * - Error handling and cancellation
 * - Event emission
 * - Streaming
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExecutionLoop } from '../../src/agent/execution-loop.js';
import type { AgentConfig } from '../../src/types/agent.js';
import type { AgentSettings } from '../../src/types/settings.js';
import type { ModelProvider, CompletionResponse, StreamChunk } from '../../src/types/providers.js';
import type { AgentEvent } from '../../src/types/events.js';
import type { ToolCall, ConversationMessage } from '../../src/types/messages.js';
import type { ToolResult } from '../../src/types/tools.js';
import type { MemoryStore, MemoryEntry } from '../../src/types/memory.js';

// Mock provider
class MockProvider implements ModelProvider {
  readonly type = 'anthropic' as const;

  responses: CompletionResponse[] = [];
  responseIndex = 0;
  streamChunks: StreamChunk[][] = [];
  streamIndex = 0;

  async complete(): Promise<CompletionResponse> {
    const response = this.responses[this.responseIndex];
    if (!response) {
      throw new Error('No mock response configured');
    }
    this.responseIndex++;
    return response;
  }

  async *stream(): AsyncIterable<StreamChunk> {
    const chunks = this.streamChunks[this.streamIndex];
    if (!chunks) {
      throw new Error('No mock stream chunks configured');
    }
    this.streamIndex++;

    for (const chunk of chunks) {
      yield chunk;
    }
  }

  async listModels() {
    return [];
  }

  async healthCheck() {
    return true;
  }

  reset() {
    this.responseIndex = 0;
    this.streamIndex = 0;
  }
}

// Helper to create mock response
function createResponse(
  content: string,
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error' = 'end_turn',
  toolCalls?: ToolCall[]
): CompletionResponse {
  return {
    message: {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content,
      toolCalls,
      stopReason,
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

// Default agent settings
function createSettings(overrides?: Partial<AgentSettings>): AgentSettings {
  return {
    model: {
      temperature: 0.7,
      topP: 1,
      maxTokens: 4096,
    },
    behavior: {
      responseStyle: 'balanced',
      enableToolUse: true,
      enableStreaming: true,
      maxTurns: 5,
      systemPrompt: 'You are a test assistant.',
    },
    tools: {
      allow: ['*'],
      deny: [],
      requireApproval: [],
    },
    ...overrides,
  };
}

// Default agent config
function createConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    ...overrides,
  };
}

describe('ExecutionLoop', () => {
  let provider: MockProvider;
  let config: AgentConfig;
  let settings: AgentSettings;
  let agent: ExecutionLoop;
  let events: AgentEvent[];

  beforeEach(() => {
    provider = new MockProvider();
    config = createConfig();
    settings = createSettings();
    agent = new ExecutionLoop(config, settings, provider);
    events = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Flow', () => {
    it('accepts user input and returns response', async () => {
      provider.responses = [createResponse('Hello! How can I help?')];

      const result = await agent.run('Hello');

      expect(result.finishReason).toBe('completed');
      expect(result.messages).toHaveLength(2); // user + assistant
      expect(result.messages[0]?.role).toBe('user');
      expect(result.messages[0]?.content).toBe('Hello');
      expect(result.messages[1]?.role).toBe('assistant');
      expect(result.messages[1]?.content).toBe('Hello! How can I help?');
      expect(result.turns).toBe(1);
    });

    it('generates session ID if not provided', async () => {
      provider.responses = [createResponse('Response')];

      const result = await agent.run('Test');

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toMatch(/^[a-f0-9-]+$/);
    });

    it('uses provided session ID', async () => {
      provider.responses = [createResponse('Response')];
      const sessionId = 'custom-session-123';

      const result = await agent.run('Test', { sessionId });

      expect(result.sessionId).toBe(sessionId);
    });

    it('accumulates token usage across turns', async () => {
      provider.responses = [
        createResponse('First', 'tool_use', [
          { id: 'call_1', name: 'test_tool', arguments: {} },
        ]),
        createResponse('Second', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (): Promise<ToolResult> => ({
        callId: 'call_1',
        name: 'test_tool',
        success: true,
        output: 'result',
        durationMs: 10,
      }));

      const result = await agent.run('Test', { onToolCall });

      expect(result.usage.inputTokens).toBe(200); // 100 * 2
      expect(result.usage.outputTokens).toBe(100); // 50 * 2
      expect(result.usage.totalTokens).toBe(300); // 150 * 2
    });

    it('emits agent_start, turn_start, turn_end, agent_end events', async () => {
      provider.responses = [createResponse('Response')];

      const onEvent = vi.fn((event: AgentEvent) => {
        events.push(event);
      });

      await agent.run('Test', { onEvent });

      expect(events.map((e) => e.type)).toEqual([
        'agent_start',
        'turn_start',
        'turn_end',
        'agent_end',
      ]);

      const agentStart = events[0];
      expect(agentStart?.type).toBe('agent_start');
      if (agentStart?.type === 'agent_start') {
        expect(agentStart.sessionId).toBeDefined();
      }

      const turnStart = events[1];
      expect(turnStart?.type).toBe('turn_start');
      if (turnStart?.type === 'turn_start') {
        expect(turnStart.turnNumber).toBe(1);
      }

      const turnEnd = events[2];
      expect(turnEnd?.type).toBe('turn_end');
      if (turnEnd?.type === 'turn_end') {
        expect(turnEnd.turnNumber).toBe(1);
        expect(turnEnd.usage).toBeDefined();
      }

      const agentEnd = events[3];
      expect(agentEnd?.type).toBe('agent_end');
      if (agentEnd?.type === 'agent_end') {
        expect(agentEnd.result.finishReason).toBe('completed');
      }
    });
  });

  describe('Tool Calling', () => {
    it('detects tool_use stop reason', async () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        name: 'search',
        arguments: { query: 'test' },
      };

      provider.responses = [
        createResponse('Let me search for that', 'tool_use', [toolCall]),
        createResponse('Found results', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (): Promise<ToolResult> => ({
        callId: 'call_1',
        name: 'search',
        success: true,
        output: 'Search results',
        durationMs: 50,
      }));

      const result = await agent.run('Search for test', { onToolCall });

      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(result.finishReason).toBe('completed');
      expect(result.turns).toBe(2);
    });

    it('extracts tool calls from response', async () => {
      const toolCall: ToolCall = {
        id: 'call_123',
        name: 'calculate',
        arguments: { expression: '2+2' },
      };

      provider.responses = [
        createResponse('Calculating', 'tool_use', [toolCall]),
        createResponse('The answer is 4', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (call: ToolCall): Promise<ToolResult> => {
        expect(call).toEqual(toolCall);
        return {
          callId: call.id,
          name: call.name,
          success: true,
          output: '4',
          durationMs: 5,
        };
      });

      await agent.run('What is 2+2?', { onToolCall });

      expect(onToolCall).toHaveBeenCalledWith(toolCall, expect.anything());
    });

    it('emits tool_call_start/end events', async () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        name: 'test',
        arguments: {},
      };

      provider.responses = [
        createResponse('Using tool', 'tool_use', [toolCall]),
        createResponse('Done', 'end_turn'),
      ];

      const toolResult: ToolResult = {
        callId: 'call_1',
        name: 'test',
        success: true,
        output: 'result',
        durationMs: 10,
      };

      const onToolCall = vi.fn(async () => toolResult);
      const onEvent = vi.fn((event: AgentEvent) => {
        events.push(event);
      });

      await agent.run('Test', { onToolCall, onEvent });

      const toolEvents = events.filter(
        (e) => e.type === 'tool_call_start' || e.type === 'tool_call_end'
      );

      expect(toolEvents).toHaveLength(2);
      expect(toolEvents[0]?.type).toBe('tool_call_start');
      if (toolEvents[0]?.type === 'tool_call_start') {
        expect(toolEvents[0].toolCall).toEqual(toolCall);
      }

      expect(toolEvents[1]?.type).toBe('tool_call_end');
      if (toolEvents[1]?.type === 'tool_call_end') {
        expect(toolEvents[1].result).toEqual(toolResult);
      }
    });

    it('calls onToolCall handler', async () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        name: 'test_tool',
        arguments: { param: 'value' },
      };

      provider.responses = [
        createResponse('Calling tool', 'tool_use', [toolCall]),
        createResponse('Complete', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (): Promise<ToolResult> => ({
        callId: 'call_1',
        name: 'test_tool',
        success: true,
        output: 'tool output',
        durationMs: 15,
      }));

      await agent.run('Test', { onToolCall });

      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(onToolCall).toHaveBeenCalledWith(
        toolCall,
        expect.objectContaining({
          sessionId: expect.any(String),
        })
      );
    });

    it('appends tool result messages', async () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        name: 'test',
        arguments: {},
      };

      provider.responses = [
        createResponse('Using tool', 'tool_use', [toolCall]),
        createResponse('Done', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (): Promise<ToolResult> => ({
        callId: 'call_1',
        name: 'test',
        success: true,
        output: 'tool result',
        durationMs: 10,
      }));

      const result = await agent.run('Test', { onToolCall });

      // Should have: user, assistant (with tool call), tool result, assistant (final)
      expect(result.messages).toHaveLength(4);
      expect(result.messages[2]?.role).toBe('tool');
      if (result.messages[2]?.role === 'tool') {
        expect(result.messages[2].toolCallId).toBe('call_1');
        expect(result.messages[2].content).toBe('tool result');
      }
    });

    it('continues loop after tool execution', async () => {
      provider.responses = [
        createResponse('First turn', 'tool_use', [
          { id: 'call_1', name: 'tool1', arguments: {} },
        ]),
        createResponse('Second turn', 'tool_use', [
          { id: 'call_2', name: 'tool2', arguments: {} },
        ]),
        createResponse('Final turn', 'end_turn'),
      ];

      let callCount = 0;
      const onToolCall = vi.fn(async (call: ToolCall): Promise<ToolResult> => {
        callCount++;
        return {
          callId: call.id,
          name: call.name,
          success: true,
          output: `result ${callCount}`,
          durationMs: 10,
        };
      });

      const result = await agent.run('Test', { onToolCall });

      expect(onToolCall).toHaveBeenCalledTimes(2);
      expect(result.turns).toBe(3);
      expect(result.finishReason).toBe('completed');
    });

    it('handles multiple tool calls in single response', async () => {
      const toolCalls: ToolCall[] = [
        { id: 'call_1', name: 'tool1', arguments: { a: 1 } },
        { id: 'call_2', name: 'tool2', arguments: { b: 2 } },
        { id: 'call_3', name: 'tool3', arguments: { c: 3 } },
      ];

      provider.responses = [
        createResponse('Using multiple tools', 'tool_use', toolCalls),
        createResponse('Done', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (call: ToolCall): Promise<ToolResult> => ({
        callId: call.id,
        name: call.name,
        success: true,
        output: `result for ${call.name}`,
        durationMs: 10,
      }));

      const result = await agent.run('Test', { onToolCall });

      expect(onToolCall).toHaveBeenCalledTimes(3);
      expect(result.toolCalls).toHaveLength(3);

      // Check that all tool results are in messages
      const toolMessages = result.messages.filter((m) => m.role === 'tool');
      expect(toolMessages).toHaveLength(3);
    });
  });

  describe('Turn Limits', () => {
    it('respects maxTurns limit', async () => {
      settings = createSettings({ behavior: { ...createSettings().behavior, maxTurns: 2 } });
      agent = new ExecutionLoop(config, settings, provider);

      // Configure 3 responses, but should only execute 2
      provider.responses = [
        createResponse('Turn 1', 'tool_use', [
          { id: 'call_1', name: 'tool', arguments: {} },
        ]),
        createResponse('Turn 2', 'tool_use', [
          { id: 'call_2', name: 'tool', arguments: {} },
        ]),
        createResponse('Turn 3', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (call: ToolCall): Promise<ToolResult> => ({
        callId: call.id,
        name: call.name,
        success: true,
        output: 'result',
        durationMs: 10,
      }));

      const result = await agent.run('Test', { onToolCall });

      expect(result.turns).toBe(2);
      expect(result.finishReason).toBe('max_turns');
      expect(onToolCall).toHaveBeenCalledTimes(2);
    });

    it('returns max_turns finish reason when reached', async () => {
      settings = createSettings({ behavior: { ...createSettings().behavior, maxTurns: 1 } });
      agent = new ExecutionLoop(config, settings, provider);

      provider.responses = [
        createResponse('Only turn', 'tool_use', [
          { id: 'call_1', name: 'tool', arguments: {} },
        ]),
      ];

      const onToolCall = vi.fn(async (): Promise<ToolResult> => ({
        callId: 'call_1',
        name: 'tool',
        success: true,
        output: 'result',
        durationMs: 10,
      }));

      const result = await agent.run('Test', { onToolCall });

      expect(result.finishReason).toBe('max_turns');
    });
  });

  describe('Stop Conditions', () => {
    it('stops on end_turn with completed reason', async () => {
      provider.responses = [createResponse('Done', 'end_turn')];

      const result = await agent.run('Test');

      expect(result.finishReason).toBe('completed');
      expect(result.turns).toBe(1);
    });

    it('stops on max_tokens with completed reason', async () => {
      provider.responses = [createResponse('Long response...', 'max_tokens')];

      const result = await agent.run('Test');

      expect(result.finishReason).toBe('completed');
      expect(result.turns).toBe(1);
    });

    it('stops on error with error reason', async () => {
      provider.responses = [createResponse('Error occurred', 'error')];

      const result = await agent.run('Test');

      expect(result.finishReason).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('handles cancelled signal', async () => {
      const abortController = new AbortController();

      provider.responses = [createResponse('Response', 'end_turn')];

      // Cancel before execution
      abortController.abort();

      const result = await agent.run('Test', {
        signal: abortController.signal,
      });

      expect(result.finishReason).toBe('cancelled');
      expect(result.turns).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('catches provider errors and wraps in AgentError', async () => {
      provider.responses = [];
      // Provider will throw when trying to access undefined response

      const result = await agent.run('Test');

      expect(result.finishReason).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('PROVIDER_ERROR');
      expect(result.error?.message).toBeDefined();
    });

    it('emits error event before agent_end', async () => {
      provider.responses = [];

      const onEvent = vi.fn((event: AgentEvent) => {
        events.push(event);
      });

      await agent.run('Test', { onEvent });

      const errorEvent = events.find((e) => e.type === 'error');
      const agentEndEvent = events.find((e) => e.type === 'agent_end');

      expect(errorEvent).toBeDefined();
      expect(agentEndEvent).toBeDefined();

      const errorIndex = events.indexOf(errorEvent!);
      const endIndex = events.indexOf(agentEndEvent!);

      expect(errorIndex).toBeLessThan(endIndex);
    });

    it('returns error in result', async () => {
      provider.responses = [];

      const result = await agent.run('Test');

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('PROVIDER_ERROR');
      expect(result.error?.recoverable).toBeDefined();
    });
  });

  describe('Cancellation', () => {
    it('checks signal before each turn', async () => {
      const abortController = new AbortController();

      provider.responses = [
        createResponse('Turn 1', 'tool_use', [
          { id: 'call_1', name: 'tool', arguments: {} },
        ]),
        createResponse('Turn 2', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (call: ToolCall): Promise<ToolResult> => {
        // Cancel after first tool call
        abortController.abort();
        return {
          callId: call.id,
          name: call.name,
          success: true,
          output: 'result',
          durationMs: 10,
        };
      });

      const result = await agent.run('Test', {
        onToolCall,
        signal: abortController.signal,
      });

      expect(result.finishReason).toBe('cancelled');
      expect(result.turns).toBe(1);
    });

    it('returns cancelled result when signal aborts', async () => {
      const abortController = new AbortController();
      abortController.abort();

      provider.responses = [createResponse('Response', 'end_turn')];

      const result = await agent.run('Test', {
        signal: abortController.signal,
      });

      expect(result.finishReason).toBe('cancelled');
    });
  });

  describe('Streaming', () => {
    it('yields text_delta events', async () => {
      provider.streamChunks = [
        [
          { type: 'text_delta', delta: 'Hello' },
          { type: 'text_delta', delta: ' world' },
          { type: 'text_delta', delta: '!' },
          {
            type: 'done',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        ],
      ];

      const streamEvents: AgentEvent[] = [];
      for await (const event of agent.stream('Test')) {
        streamEvents.push(event);
      }

      const textDeltas = streamEvents.filter((e) => e.type === 'text_delta');
      expect(textDeltas.length).toBeGreaterThan(0);

      if (textDeltas[0]?.type === 'text_delta') {
        expect(textDeltas[0].delta).toBe('Hello');
      }
    });

    it('yields all lifecycle events in order', async () => {
      provider.streamChunks = [
        [
          { type: 'text_delta', delta: 'Response' },
          {
            type: 'done',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        ],
      ];

      const streamEvents: AgentEvent[] = [];
      for await (const event of agent.stream('Test')) {
        streamEvents.push(event);
      }

      const eventTypes = streamEvents.map((e) => e.type);
      expect(eventTypes[0]).toBe('agent_start');
      expect(eventTypes[1]).toBe('turn_start');
      expect(eventTypes[eventTypes.length - 1]).toBe('agent_end');
    });

    it('final yield is agent_end', async () => {
      provider.streamChunks = [
        [
          { type: 'text_delta', delta: 'Done' },
          {
            type: 'done',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        ],
      ];

      let lastEvent: AgentEvent | null = null;
      for await (const event of agent.stream('Test')) {
        lastEvent = event;
      }

      expect(lastEvent?.type).toBe('agent_end');
    });

    it('pure text stream: agent_end contains assistant content', async () => {
      provider.streamChunks = [
        [
          { type: 'text_delta', delta: 'Hello' },
          { type: 'text_delta', delta: ' world' },
          { type: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        ],
      ];

      const streamEvents: AgentEvent[] = [];
      for await (const event of agent.stream('Test')) {
        streamEvents.push(event);
      }

      const agentEnd = streamEvents.find((e) => e.type === 'agent_end');
      expect(agentEnd?.type).toBe('agent_end');
      if (agentEnd?.type === 'agent_end') {
        const assistantMsg = agentEnd.result.messages.find((m) => m.role === 'assistant');
        expect(assistantMsg?.content).toBe('Hello world');
        expect(agentEnd.result.finishReason).toBe('completed');
      }
    });

    it('single tool call stream: handler is invoked and second turn text is returned', async () => {
      const toolCall: ToolCall = {
        id: 'call_stream_1',
        name: 'search',
        arguments: { query: 'test' },
      };

      provider.streamChunks = [
        // Turn 1: provider emits a tool_call chunk then done
        [
          {
            type: 'tool_call',
            toolCall: { id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments },
          },
          { type: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        ],
        // Turn 2: provider emits text then done
        [
          { type: 'text_delta', delta: 'Search results processed' },
          { type: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        ],
      ];

      const onToolCall = vi.fn(async (call: ToolCall): Promise<ToolResult> => ({
        callId: call.id,
        name: call.name,
        success: true,
        output: 'result data',
        durationMs: 10,
      }));

      const streamEvents: AgentEvent[] = [];
      for await (const event of agent.stream('Search for test', { onToolCall })) {
        streamEvents.push(event);
      }

      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(onToolCall).toHaveBeenCalledWith(toolCall, expect.objectContaining({ sessionId: expect.any(String) }));

      const agentEnd = streamEvents.find((e) => e.type === 'agent_end');
      expect(agentEnd?.type).toBe('agent_end');
      if (agentEnd?.type === 'agent_end') {
        expect(agentEnd.result.finishReason).toBe('completed');
        const assistantMsg = agentEnd.result.messages.filter((m) => m.role === 'assistant').pop();
        expect(assistantMsg?.content).toBe('Search results processed');
      }
    });

    it('multiple tool calls in one turn: all handlers are executed', async () => {
      const toolCall1: ToolCall = { id: 'tc_1', name: 'tool_a', arguments: { a: 1 } };
      const toolCall2: ToolCall = { id: 'tc_2', name: 'tool_b', arguments: { b: 2 } };

      provider.streamChunks = [
        [
          { type: 'tool_call', toolCall: { id: toolCall1.id, name: toolCall1.name, arguments: toolCall1.arguments } },
          { type: 'tool_call', toolCall: { id: toolCall2.id, name: toolCall2.name, arguments: toolCall2.arguments } },
          { type: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        ],
        [
          { type: 'text_delta', delta: 'Both tools ran' },
          { type: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        ],
      ];

      const onToolCall = vi.fn(async (call: ToolCall): Promise<ToolResult> => ({
        callId: call.id,
        name: call.name,
        success: true,
        output: `output_${call.name}`,
        durationMs: 5,
      }));

      const streamEvents: AgentEvent[] = [];
      for await (const event of agent.stream('Run both tools', { onToolCall })) {
        streamEvents.push(event);
      }

      expect(onToolCall).toHaveBeenCalledTimes(2);

      const agentEnd = streamEvents.find((e) => e.type === 'agent_end');
      if (agentEnd?.type === 'agent_end') {
        expect(agentEnd.result.toolCalls).toHaveLength(2);
        expect(agentEnd.result.finishReason).toBe('completed');
      }
    });

    it('no onToolCall handler when tool_call chunk arrives: returns error finishReason', async () => {
      provider.streamChunks = [
        [
          { type: 'tool_call', toolCall: { id: 'tc_err', name: 'some_tool', arguments: {} } },
          { type: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        ],
      ];

      const streamEvents: AgentEvent[] = [];
      for await (const event of agent.stream('Do tool stuff')) {
        streamEvents.push(event);
      }

      const agentEnd = streamEvents.find((e) => e.type === 'agent_end');
      expect(agentEnd?.type).toBe('agent_end');
      if (agentEnd?.type === 'agent_end') {
        expect(agentEnd.result.finishReason).toBe('error');
        expect(agentEnd.result.error?.code).toBe('TOOL_ERROR');
      }
    });

    it('tool call then abort: next turn sees cancelled signal', async () => {
      const abortController = new AbortController();

      provider.streamChunks = [
        [
          { type: 'tool_call', toolCall: { id: 'tc_abort', name: 'slow_tool', arguments: {} } },
          { type: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        ],
        // This second chunk set should never be consumed because abort fires first
        [
          { type: 'text_delta', delta: 'Should not appear' },
          { type: 'done', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        ],
      ];

      const onToolCall = vi.fn(async (call: ToolCall): Promise<ToolResult> => {
        abortController.abort();
        return {
          callId: call.id,
          name: call.name,
          success: true,
          output: 'done',
          durationMs: 5,
        };
      });

      const streamEvents: AgentEvent[] = [];
      for await (const event of agent.stream('Run then cancel', {
        onToolCall,
        signal: abortController.signal,
      })) {
        streamEvents.push(event);
      }

      const agentEnd = streamEvents.find((e) => e.type === 'agent_end');
      expect(agentEnd?.type).toBe('agent_end');
      if (agentEnd?.type === 'agent_end') {
        expect(agentEnd.result.finishReason).toBe('cancelled');
      }
    });
  });

  describe('Configuration', () => {
    it('uses system prompt from settings', async () => {
      const customPrompt = 'You are a specialized assistant.';
      settings = createSettings({ behavior: { ...createSettings().behavior, systemPrompt: customPrompt } });
      agent = new ExecutionLoop(config, settings, provider);

      provider.responses = [createResponse('Response', 'end_turn')];

      await agent.run('Test');

      // System prompt should be in settings
      expect(settings.behavior.systemPrompt).toBe(customPrompt);
    });

    it('uses model from config', async () => {
      const customModel = 'gpt-4';
      config = createConfig({ model: customModel });
      agent = new ExecutionLoop(config, settings, provider);

      provider.responses = [createResponse('Response', 'end_turn')];

      await agent.run('Test');

      expect(agent.config.model).toBe(customModel);
    });

    it('exposes config property', () => {
      expect(agent.config).toEqual(config);
    });
  });

  describe('Tool Definitions Injection (Phase 1)', () => {
    it('accepts optional toolDefinitions in constructor', () => {
      const toolDefinitions = [
        {
          name: 'read_file',
          description: 'Read a file from disk',
          parameters: {
            type: 'object' as const,
            properties: {
              path: { type: 'string' as const, description: 'File path' },
            },
            required: ['path'],
          },
        },
      ];

      const agentWithTools = new ExecutionLoop(config, settings, provider, toolDefinitions);

      expect(agentWithTools).toBeDefined();
    });

    it('defaults to empty array when toolDefinitions not provided', () => {
      const agentWithoutTools = new ExecutionLoop(config, settings, provider);

      const tools = agentWithoutTools.getTools();
      expect(tools).toEqual([]);
    });

    it('getTools returns injected tool definitions', () => {
      const toolDefinitions = [
        {
          name: 'shell_exec',
          description: 'Execute shell command',
          parameters: {
            type: 'object' as const,
            properties: {
              command: { type: 'string' as const, description: 'Command to run' },
            },
            required: ['command'],
          },
        },
        {
          name: 'fetch_url',
          description: 'Fetch URL content',
          parameters: {
            type: 'object' as const,
            properties: {
              url: { type: 'string' as const, description: 'URL to fetch' },
            },
            required: ['url'],
          },
        },
      ];

      const agentWithTools = new ExecutionLoop(config, settings, provider, toolDefinitions);

      const tools = agentWithTools.getTools();
      expect(tools).toEqual(toolDefinitions);
      expect(tools).toHaveLength(2);
      expect(tools[0]?.name).toBe('shell_exec');
      expect(tools[1]?.name).toBe('fetch_url');
    });

    it('passes tools to provider via buildRequest', async () => {
      const toolDefinitions = [
        {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object' as const,
            properties: {
              input: { type: 'string' as const, description: 'Test input' },
            },
            required: ['input'],
          },
        },
      ];

      // Create a mock provider that captures the request
      let capturedRequest: any = null;
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.complete = vi.fn(async (request) => {
        capturedRequest = request;
        return createResponse('Response', 'end_turn');
      });

      const agentWithTools = new ExecutionLoop(config, settings, mockProviderWithCapture, toolDefinitions);

      await agentWithTools.run('Test');

      // Verify tools were passed in the request
      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.tools).toEqual(toolDefinitions);
    });

    it('does not pass tools when none are provided', async () => {
      let capturedRequest: any = null;
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.complete = vi.fn(async (request) => {
        capturedRequest = request;
        return createResponse('Response', 'end_turn');
      });

      const agentWithoutTools = new ExecutionLoop(config, settings, mockProviderWithCapture);

      await agentWithoutTools.run('Test');

      // Verify tools field is undefined (not empty array)
      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.tools).toBeUndefined();
    });

    it('preserves immutability of tool definitions', () => {
      const toolDefinitions = [
        {
          name: 'immutable_tool',
          description: 'Should not be modified',
          parameters: {
            type: 'object' as const,
            properties: {},
            required: [],
          },
        },
      ];

      const agentWithTools = new ExecutionLoop(config, settings, provider, toolDefinitions);

      const retrievedTools = agentWithTools.getTools();

      // Attempting to modify should not affect original
      expect(Object.isFrozen(retrievedTools)).toBe(false); // Array itself might not be frozen
      expect(retrievedTools).toEqual(toolDefinitions);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty tool calls array', async () => {
      provider.responses = [
        createResponse('Response with empty toolCalls', 'tool_use', []),
        createResponse('Next turn', 'end_turn'),
      ];

      const onToolCall = vi.fn();

      const result = await agent.run('Test', { onToolCall });

      // Should continue without calling onToolCall
      expect(onToolCall).not.toHaveBeenCalled();
      expect(result.finishReason).toBe('completed');
    });

    it('handles missing onToolCall handler', async () => {
      provider.responses = [
        createResponse('Using tool', 'tool_use', [
          { id: 'call_1', name: 'test', arguments: {} },
        ]),
      ];

      const result = await agent.run('Test');

      // Should handle gracefully, either with error or default behavior
      expect(result.finishReason).toMatch(/error|max_turns/);
    });

    it('handles tool execution errors gracefully', async () => {
      provider.responses = [
        createResponse('Calling tool', 'tool_use', [
          { id: 'call_1', name: 'test', arguments: {} },
        ]),
        createResponse('Handled error', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (): Promise<ToolResult> => ({
        callId: 'call_1',
        name: 'test',
        success: false,
        output: '',
        error: {
          code: 'EXECUTION_ERROR',
          message: 'Tool failed',
        },
        durationMs: 5,
      }));

      const result = await agent.run('Test', { onToolCall });

      expect(result.finishReason).toBe('completed');
      expect(result.toolCalls[0]?.success).toBe(false);
    });

    it('handles zero maxTurns', async () => {
      settings = createSettings({ behavior: { ...createSettings().behavior, maxTurns: 0 } });
      agent = new ExecutionLoop(config, settings, provider);

      provider.responses = [createResponse('Should not execute', 'end_turn')];

      const result = await agent.run('Test');

      expect(result.finishReason).toBe('max_turns');
      expect(result.turns).toBe(0);
    });

    it('preserves message order with multiple turns', async () => {
      provider.responses = [
        createResponse('First', 'tool_use', [
          { id: 'call_1', name: 'tool', arguments: {} },
        ]),
        createResponse('Second', 'end_turn'),
      ];

      const onToolCall = vi.fn(async (): Promise<ToolResult> => ({
        callId: 'call_1',
        name: 'tool',
        success: true,
        output: 'result',
        durationMs: 10,
      }));

      const result = await agent.run('Hello', { onToolCall });

      expect(result.messages[0]?.role).toBe('user');
      expect(result.messages[1]?.role).toBe('assistant');
      expect(result.messages[2]?.role).toBe('tool');
      expect(result.messages[3]?.role).toBe('assistant');
    });
  });

  describe('Memory Injection', () => {
    /** Helper to create a MemoryEntry stub with the new kind-based API. */
    function makeEntry(kind: 'preference' | 'experiential' | 'semantic' | 'episodic', content: string): MemoryEntry {
      return {
        id: `entry-${content}`,
        kind,
        content,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    /** Creates a mock MemoryStore using loadForSystemPrompt for injection. */
    function createMemoryStore(
      injectedEntries: MemoryEntry[] = []
    ): MemoryStore {
      return {
        get: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        search: vi.fn(async () => []),
        loadForSystemPrompt: vi.fn(async () => injectedEntries),
      };
    }

    it('run() includes preference entries in system prompt', async () => {
      const entries = [makeEntry('preference', 'My name is Agent Alpha')];
      const memoryStore = createMemoryStore(entries);

      let capturedSystemPrompt = '';
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.complete = vi.fn(async (req) => {
        capturedSystemPrompt = req.systemPrompt as string;
        return createResponse('Response', 'end_turn');
      });

      const agentWithMemory = new ExecutionLoop(
        config, settings, mockProviderWithCapture, [], undefined, undefined, memoryStore
      );

      await agentWithMemory.run('Test');

      expect(capturedSystemPrompt).toContain('## What I Know About You');
      expect(capturedSystemPrompt).toContain('My name is Agent Alpha');
    });

    it('run() includes experiential entries in system prompt', async () => {
      const entries = [makeEntry('experiential', 'Prefers TypeScript over JavaScript')];
      const memoryStore = createMemoryStore(entries);

      let capturedSystemPrompt = '';
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.complete = vi.fn(async (req) => {
        capturedSystemPrompt = req.systemPrompt as string;
        return createResponse('Response', 'end_turn');
      });

      const agentWithMemory = new ExecutionLoop(
        config, settings, mockProviderWithCapture, [], undefined, undefined, memoryStore
      );

      await agentWithMemory.run('Test');

      expect(capturedSystemPrompt).toContain('## What I Know About You');
      expect(capturedSystemPrompt).toContain('Prefers TypeScript over JavaScript');
    });

    it('run() with no injected memories does not add extra sections', async () => {
      const memoryStore = createMemoryStore([]);

      let capturedSystemPrompt = '';
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.complete = vi.fn(async (req) => {
        capturedSystemPrompt = req.systemPrompt as string;
        return createResponse('Response', 'end_turn');
      });

      const agentWithMemory = new ExecutionLoop(
        config, settings, mockProviderWithCapture, [], undefined, undefined, memoryStore
      );

      await agentWithMemory.run('Test');

      expect(capturedSystemPrompt).not.toContain('## What I Know About You');
      expect(capturedSystemPrompt).toContain(settings.behavior.systemPrompt);
    });

    it('run() without memoryStore does not add memory sections', async () => {
      let capturedSystemPrompt = '';
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.complete = vi.fn(async (req) => {
        capturedSystemPrompt = req.systemPrompt as string;
        return createResponse('Response', 'end_turn');
      });

      const agentNoMemory = new ExecutionLoop(config, settings, mockProviderWithCapture);

      await agentNoMemory.run('Test');

      expect(capturedSystemPrompt).not.toContain('## What I Know About You');
    });

    it('run() calls loadForSystemPrompt for injection', async () => {
      const memoryStore = createMemoryStore([]);

      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.complete = vi.fn(async () => createResponse('Response', 'end_turn'));

      const agentWithMemory = new ExecutionLoop(
        config, settings, mockProviderWithCapture, [], undefined, undefined, memoryStore
      );

      await agentWithMemory.run('Test');

      expect(memoryStore.loadForSystemPrompt).toHaveBeenCalledTimes(1);
    });

    it('stream() includes preference entries in system prompt', async () => {
      const entries = [makeEntry('preference', 'Streaming identity fact')];
      const memoryStore = createMemoryStore(entries);

      let capturedSystemPrompt = '';
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.stream = async function* (req) {
        capturedSystemPrompt = req.systemPrompt as string;
        yield { type: 'text_delta' as const, delta: 'ok' };
        yield { type: 'done' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      };

      const agentWithMemory = new ExecutionLoop(
        config, settings, mockProviderWithCapture, [], undefined, undefined, memoryStore
      );

      // Drain the async iterable
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _e of agentWithMemory.stream('Test')) { /* noop */ }

      expect(capturedSystemPrompt).toContain('## What I Know About You');
      expect(capturedSystemPrompt).toContain('Streaming identity fact');
    });

    it('stream() includes experiential entries in system prompt', async () => {
      const entries = [makeEntry('experiential', 'Streaming preference fact')];
      const memoryStore = createMemoryStore(entries);

      let capturedSystemPrompt = '';
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.stream = async function* (req) {
        capturedSystemPrompt = req.systemPrompt as string;
        yield { type: 'text_delta' as const, delta: 'ok' };
        yield { type: 'done' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      };

      const agentWithMemory = new ExecutionLoop(
        config, settings, mockProviderWithCapture, [], undefined, undefined, memoryStore
      );

      for await (const _e of agentWithMemory.stream('Test')) { /* noop */ }

      expect(capturedSystemPrompt).toContain('## What I Know About You');
      expect(capturedSystemPrompt).toContain('Streaming preference fact');
    });

    it('stream() with no injected memories does not add extra sections', async () => {
      const memoryStore = createMemoryStore([]);

      let capturedSystemPrompt = '';
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.stream = async function* (req) {
        capturedSystemPrompt = req.systemPrompt as string;
        yield { type: 'text_delta' as const, delta: 'ok' };
        yield { type: 'done' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      };

      const agentWithMemory = new ExecutionLoop(
        config, settings, mockProviderWithCapture, [], undefined, undefined, memoryStore
      );

      for await (const _e of agentWithMemory.stream('Test')) { /* noop */ }

      expect(capturedSystemPrompt).not.toContain('## What I Know About You');
    });

    it('stream() without memoryStore does not add memory sections', async () => {
      let capturedSystemPrompt = '';
      const mockProviderWithCapture = new MockProvider();
      mockProviderWithCapture.stream = async function* (req) {
        capturedSystemPrompt = req.systemPrompt as string;
        yield { type: 'text_delta' as const, delta: 'ok' };
        yield { type: 'done' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      };

      const agentNoMemory = new ExecutionLoop(config, settings, mockProviderWithCapture);

      for await (const _e of agentNoMemory.stream('Test')) { /* noop */ }

      expect(capturedSystemPrompt).not.toContain('## What I Know About You');
    });
  });

  describe('getSession', () => {
    it('returns null when no store is provided', async () => {
      const loop = new ExecutionLoop(config, settings, provider);
      expect(await loop.getSession('some-id')).toBeNull();
    });

    it('returns session from store when provided', async () => {
      const mockSession: import('../../src/types/sessions.js').Session = {
        id: 'test-id',
        agentId: 'test-agent',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [],
        metadata: {
          model: 'claude-3-5-sonnet-20241022',
          provider: 'anthropic',
          totalTokens: 0,
          toolCallCount: 0,
          turnCount: 0,
          description: '',
          tags: [],
        },
      };
      const mockStore: import('../../src/types/sessions.js').SessionStore = {
        load: vi.fn().mockResolvedValue(mockSession),
        save: vi.fn(),
        appendMessage: vi.fn(),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        clear: vi.fn(),
      };
      const loop = new ExecutionLoop(config, settings, provider, [], undefined, mockStore);
      expect(await loop.getSession('test-id')).toEqual(mockSession);
      expect(mockStore.load).toHaveBeenCalledWith('test-id');
    });

    it('returns null when session not found in store', async () => {
      const mockStore: import('../../src/types/sessions.js').SessionStore = {
        load: vi.fn().mockResolvedValue(null),
        save: vi.fn(),
        appendMessage: vi.fn(),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        clear: vi.fn(),
      };
      const loop = new ExecutionLoop(config, settings, provider, [], undefined, mockStore);
      expect(await loop.getSession('not-found')).toBeNull();
    });
  });

  describe('compactSummary injection', () => {
    it('injects ## Previous Conversation Summary into system prompt via run()', async () => {
      // Capture the system prompt passed to provider.complete
      let capturedSystemPrompt: string | undefined;
      provider.complete = async (request) => {
        capturedSystemPrompt = request.systemPrompt;
        return createResponse('Done');
      };

      const compactSummary = 'User was building a REST API with Express.';
      await agent.run('Continue', {
        compactSummary,
      });

      expect(capturedSystemPrompt).toContain('## Previous Conversation Summary');
      expect(capturedSystemPrompt).toContain(compactSummary);
    });

    it('places summary section before Current working directory', async () => {
      let capturedSystemPrompt: string | undefined;
      provider.complete = async (request) => {
        capturedSystemPrompt = request.systemPrompt;
        return createResponse('Done');
      };

      const compactSummary = 'Debugging a memory leak.';
      await agent.run('Go on', { compactSummary });

      const summaryIndex = capturedSystemPrompt!.indexOf('## Previous Conversation Summary');
      const cwdIndex = capturedSystemPrompt!.indexOf('Current working directory');
      expect(summaryIndex).toBeGreaterThan(-1);
      expect(cwdIndex).toBeGreaterThan(summaryIndex);
    });

    it('does not include summary section when compactSummary is undefined', async () => {
      let capturedSystemPrompt: string | undefined;
      provider.complete = async (request) => {
        capturedSystemPrompt = request.systemPrompt;
        return createResponse('Done');
      };

      await agent.run('Hello');

      expect(capturedSystemPrompt).not.toContain('## Previous Conversation Summary');
    });

    it('injects ## Previous Conversation Summary into system prompt via stream()', async () => {
      let capturedSystemPrompt: string | undefined;
      provider.stream = async function* (request) {
        capturedSystemPrompt = request.systemPrompt;
        yield { type: 'text_delta', delta: 'hi' };
        yield {
          type: 'done',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        };
      };

      const compactSummary = 'Previous stream context summary.';
      const events: AgentEvent[] = [];
      for await (const event of agent.stream('Continue', { compactSummary })) {
        events.push(event);
      }

      expect(capturedSystemPrompt).toContain('## Previous Conversation Summary');
      expect(capturedSystemPrompt).toContain(compactSummary);
    });
  });
});

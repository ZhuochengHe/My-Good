/**
 * Integration test for Agent with ToolExecutor.
 *
 * Tests the complete flow: Agent -> Provider -> Tool Execution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionLoop } from '../../src/agent/execution-loop.js';
import { ToolExecutor } from '../../src/plugins/tool-executor.js';
import type { AgentConfig } from '../../src/types/agent.js';
import type { ModelProvider, ProviderRequest, ProviderResponse } from '../../src/types/providers.js';
import type { ToolDefinition, ToolHandler } from '../../src/types/tools.js';

describe('Agent with ToolExecutor Integration', () => {
  let agent: ExecutionLoop;
  let toolExecutor: ToolExecutor;
  let mockProvider: ModelProvider;

  beforeEach(() => {
    // Create tool executor
    toolExecutor = new ToolExecutor();

    // Create mock provider that returns tool calls
    mockProvider = createMockProvider();

    // Create agent config
    const config: AgentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      systemPrompt: 'You are a helpful assistant.',
      model: 'test-model',
      provider: 'anthropic',
      maxTurns: 10,
      maxTokensPerTurn: 4096,
      tools: {
        allow: ['*'],
        deny: [],
        requireApproval: [],
      },
    };

    agent = new ExecutionLoop(config, mockProvider);
  });

  it('executes tools using ToolExecutor', async () => {
    // Register a test tool
    const echoToolDef: ToolDefinition = {
      name: 'echo',
      description: 'Echoes the input message',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Message to echo',
          },
        },
        required: ['message'],
      },
    };

    const echoHandler: ToolHandler = async (args) => ({
      output: `Echo: ${args.message}`,
    });

    toolExecutor.registerTool(echoToolDef, echoHandler);

    // Run agent with tool callback that uses ToolExecutor
    const result = await agent.run('Echo hello!', {
      onToolCall: async (toolCall, context) => {
        return toolExecutor.executeTool(toolCall, context);
      },
    });

    // Verify agent completed successfully
    expect(result.finishReason).toBe('completed');
    expect(result.toolCalls.length).toBeGreaterThan(0);

    // Verify tool was executed
    const toolResult = result.toolCalls[0];
    expect(toolResult.success).toBe(true);
    expect(toolResult.name).toBe('echo');
    expect(toolResult.output).toContain('Echo:');
  });

  it('handles tool validation errors', async () => {
    // Register a tool with required parameters
    const requiredParamTool: ToolDefinition = {
      name: 'required_param_tool',
      description: 'Tool with required parameters',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Required name' },
          age: { type: 'number', description: 'Required age' },
        },
        required: ['name', 'age'],
      },
    };

    toolExecutor.registerTool(requiredParamTool, async () => ({
      output: 'Success',
    }));

    // Mock provider returns tool call with missing required parameter
    const invalidProvider = createMockProviderWithInvalidToolCall();
    const invalidAgent = new ExecutionLoop(agent.config, invalidProvider);

    const result = await invalidAgent.run('Test', {
      onToolCall: async (toolCall, context) => {
        return toolExecutor.executeTool(toolCall, context);
      },
    });

    // Verify validation error was returned
    expect(result.toolCalls.length).toBeGreaterThan(0);
    const toolResult = result.toolCalls[0];
    expect(toolResult.success).toBe(false);
    expect(toolResult.error?.code).toBe('VALIDATION_ERROR');
  });

  it('handles tool not found errors', async () => {
    // Mock provider returns tool call for non-existent tool
    const notFoundProvider = createMockProviderWithNonexistentTool();
    const notFoundAgent = new ExecutionLoop(agent.config, notFoundProvider);

    const result = await notFoundAgent.run('Test', {
      onToolCall: async (toolCall, context) => {
        return toolExecutor.executeTool(toolCall, context);
      },
    });

    // Verify tool not found error
    expect(result.toolCalls.length).toBeGreaterThan(0);
    const toolResult = result.toolCalls[0];
    expect(toolResult.success).toBe(false);
    expect(toolResult.error?.code).toBe('TOOL_NOT_FOUND');
  });

  it('handles tool execution timeouts', async () => {
    // Register a slow tool
    const slowTool: ToolDefinition = {
      name: 'slow_tool',
      description: 'A very slow tool',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    };

    const slowHandler: ToolHandler = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds
      return { output: 'Done' };
    };

    toolExecutor.registerTool(slowTool, slowHandler);

    // Create mock provider that returns slow_tool call
    const slowProvider = createMockProviderWithToolCall('slow_tool', {});
    const slowAgent = new ExecutionLoop(agent.config, slowProvider);

    const result = await slowAgent.run('Run slow tool', {
      onToolCall: async (toolCall, context) => {
        return toolExecutor.executeTool(toolCall, context, { timeout: 100 }); // 100ms timeout
      },
    });

    // Verify timeout error
    expect(result.toolCalls.length).toBeGreaterThan(0);
    const toolResult = result.toolCalls[0];
    expect(toolResult.success).toBe(false);
    expect(toolResult.error?.code).toBe('TIMEOUT');
  });

  it('passes context correctly to tools', async () => {
    // Register a tool that uses context
    const contextTool: ToolDefinition = {
      name: 'context_tool',
      description: 'Uses execution context',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    };

    let capturedContext: any = null;
    const contextHandler: ToolHandler = async (_args, context) => {
      capturedContext = context;
      return { output: `Session: ${context.sessionId}` };
    };

    toolExecutor.registerTool(contextTool, contextHandler);

    // Create mock provider that returns context_tool call
    const contextProvider = createMockProviderWithToolCall('context_tool', {});
    const contextAgent = new ExecutionLoop(agent.config, contextProvider);

    const result = await contextAgent.run('Use context', {
      sessionId: 'test-session-123',
      onToolCall: async (toolCall, context) => {
        return toolExecutor.executeTool(toolCall, context);
      },
    });

    // Verify context was passed
    expect(capturedContext).not.toBeNull();
    expect(capturedContext.sessionId).toBe('test-session-123');
    expect(capturedContext.workingDirectory).toBeDefined();

    // Verify tool result
    const toolResult = result.toolCalls[0];
    expect(toolResult.success).toBe(true);
    expect(toolResult.output).toContain('Session: test-session-123');
  });
});

/**
 * Create a mock provider that returns a tool call.
 */
function createMockProvider(): ModelProvider {
  let callCount = 0;

  return {
    name: 'mock',
    complete: async (_request: ProviderRequest): Promise<ProviderResponse> => {
      callCount++;

      if (callCount === 1) {
        // First call: return tool use
        return {
          message: {
            id: 'msg-1',
            role: 'assistant',
            content: 'I will echo your message.',
            timestamp: Date.now(),
            stopReason: 'tool_use',
            toolCalls: [
              {
                id: 'tool-call-1',
                name: 'echo',
                arguments: { message: 'hello' },
              },
            ],
          },
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
          },
        };
      }

      // Second call: return completion
      return {
        message: {
          id: 'msg-2',
          role: 'assistant',
          content: 'I have echoed your message.',
          timestamp: Date.now(),
          stopReason: 'end_turn',
        },
        usage: {
          inputTokens: 15,
          outputTokens: 10,
          totalTokens: 25,
        },
      };
    },
    stream: async function* () {
      yield {
        type: 'text_delta',
        delta: 'Hello',
      };
      yield {
        type: 'done',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
      };
    },
    listModels: async () => ['test-model'],
    healthCheck: async () => ({ healthy: true }),
  };
}

/**
 * Create a mock provider that returns an invalid tool call.
 */
function createMockProviderWithInvalidToolCall(): ModelProvider {
  return {
    name: 'mock-invalid',
    complete: async (_request: ProviderRequest): Promise<ProviderResponse> => {
      return {
        message: {
          id: 'msg-invalid',
          role: 'assistant',
          content: 'Calling tool with invalid params.',
          timestamp: Date.now(),
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'tool-call-invalid',
              name: 'required_param_tool',
              arguments: { name: 'Alice' }, // Missing 'age'
            },
          ],
        },
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      };
    },
    stream: async function* () {
      yield {
        type: 'done',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    },
    listModels: async () => ['test-model'],
    healthCheck: async () => ({ healthy: true }),
  };
}

/**
 * Create a mock provider that returns a non-existent tool call.
 */
function createMockProviderWithNonexistentTool(): ModelProvider {
  return {
    name: 'mock-notfound',
    complete: async (_request: ProviderRequest): Promise<ProviderResponse> => {
      return {
        message: {
          id: 'msg-notfound',
          role: 'assistant',
          content: 'Calling non-existent tool.',
          timestamp: Date.now(),
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'tool-call-notfound',
              name: 'nonexistent_tool',
              arguments: {},
            },
          ],
        },
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      };
    },
    stream: async function* () {
      yield {
        type: 'done',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    },
    listModels: async () => ['test-model'],
    healthCheck: async () => ({ healthy: true }),
  };
}

/**
 * Create a mock provider that returns a specific tool call.
 */
function createMockProviderWithToolCall(toolName: string, args: Record<string, unknown>): ModelProvider {
  return {
    name: 'mock-custom',
    complete: async (_request: ProviderRequest): Promise<ProviderResponse> => {
      return {
        message: {
          id: 'msg-custom',
          role: 'assistant',
          content: `Calling ${toolName}.`,
          timestamp: Date.now(),
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: `tool-call-${toolName}`,
              name: toolName,
              arguments: args,
            },
          ],
        },
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      };
    },
    stream: async function* () {
      yield {
        type: 'done',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    },
    listModels: async () => ['test-model'],
    healthCheck: async () => ({ healthy: true }),
  };
}

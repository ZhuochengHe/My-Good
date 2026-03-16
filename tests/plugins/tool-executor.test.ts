/**
 * Tool executor tests (TDD - written first).
 *
 * Tests parameter validation, handler invocation, timeout handling, and error wrapping.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolExecutor } from '../../src/plugins/tool-executor.js';
import type { DangerousToolConfirm } from '../../src/plugins/tool-executor.js';
import type {
  ToolDefinition,
  ToolHandler,
  ToolContext,
  ToolResult,
  ToolHandlerResult,
} from '../../src/types/tools.js';
import type { ToolCall } from '../../src/types/messages.js';
import type { MemoryStore } from '../../src/types/memory.js';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let mockContext: ToolContext;

  beforeEach(() => {
    executor = new ToolExecutor();
    mockContext = {
      sessionId: 'test-session',
      workingDirectory: '/test/dir',
      env: { TEST_VAR: 'value' },
    };
  });

  describe('registerTool', () => {
    it('registers a tool with definition and handler', () => {
      const definition: ToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Test message',
            },
          },
          required: ['message'],
        },
      };

      const handler: ToolHandler = async (args) => ({
        output: `Received: ${args.message}`,
      });

      executor.registerTool(definition, handler);

      expect(executor.getTools()).toContain(definition);
    });

    it('throws if tool with same name is already registered', () => {
      const definition: ToolDefinition = {
        name: 'duplicate_tool',
        description: 'A duplicate tool',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      };

      const handler: ToolHandler = async () => ({ output: 'test' });

      executor.registerTool(definition, handler);

      expect(() => {
        executor.registerTool(definition, handler);
      }).toThrow('Tool "duplicate_tool" is already registered');
    });
  });

  describe('unregisterTool', () => {
    it('removes a registered tool', () => {
      const definition: ToolDefinition = {
        name: 'removable_tool',
        description: 'A removable tool',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      };

      const handler: ToolHandler = async () => ({ output: 'test' });

      executor.registerTool(definition, handler);
      expect(executor.getTools()).toHaveLength(1);

      executor.unregisterTool('removable_tool');
      expect(executor.getTools()).toHaveLength(0);
    });

    it('does not throw if tool does not exist', () => {
      expect(() => {
        executor.unregisterTool('nonexistent_tool');
      }).not.toThrow();
    });
  });

  describe('getTools', () => {
    it('returns empty array when no tools registered', () => {
      expect(executor.getTools()).toEqual([]);
    });

    it('returns all registered tool definitions', () => {
      const def1: ToolDefinition = {
        name: 'tool1',
        description: 'Tool 1',
        parameters: { type: 'object', properties: {}, required: [] },
      };
      const def2: ToolDefinition = {
        name: 'tool2',
        description: 'Tool 2',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      executor.registerTool(def1, async () => ({ output: 'test' }));
      executor.registerTool(def2, async () => ({ output: 'test' }));

      const tools = executor.getTools();
      expect(tools).toHaveLength(2);
      expect(tools).toContainEqual(def1);
      expect(tools).toContainEqual(def2);
    });
  });

  describe('executeTool - success cases', () => {
    it('executes a tool successfully with valid parameters', async () => {
      const definition: ToolDefinition = {
        name: 'echo_tool',
        description: 'Echoes the message',
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

      const handler: ToolHandler = async (args) => ({
        output: `Echo: ${args.message}`,
      });

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-123',
        name: 'echo_tool',
        arguments: { message: 'Hello, world!' },
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(true);
      expect(result.callId).toBe('call-123');
      expect(result.name).toBe('echo_tool');
      expect(result.output).toBe('Echo: Hello, world!');
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('passes context to the handler', async () => {
      const definition: ToolDefinition = {
        name: 'context_tool',
        description: 'Uses context',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async (_args, ctx) => ({
        output: `Session: ${ctx.sessionId}, Dir: ${ctx.workingDirectory}`,
      });

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-456',
        name: 'context_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Session: test-session, Dir: /test/dir');
    });

    it('handles handler returning artifacts', async () => {
      const definition: ToolDefinition = {
        name: 'artifact_tool',
        description: 'Returns artifacts',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async () => ({
        output: 'Created file',
        artifacts: [
          {
            type: 'file',
            name: 'test.txt',
            data: 'file contents',
          },
        ],
      });

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-789',
        name: 'artifact_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Created file');
      // Artifacts are included in handler result but not in ToolResult
      // (they could be added to ToolResult in future if needed)
    });
  });

  describe('executeTool - parameter validation', () => {
    it('validates required parameters are present', async () => {
      const definition: ToolDefinition = {
        name: 'required_tool',
        description: 'Requires parameters',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name parameter' },
            age: { type: 'number', description: 'Age parameter' },
          },
          required: ['name', 'age'],
        },
      };

      executor.registerTool(definition, async () => ({ output: 'test' }));

      const toolCall: ToolCall = {
        id: 'call-invalid',
        name: 'required_tool',
        arguments: { name: 'Alice' }, // Missing 'age'
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('age');
      expect(result.error?.message).toContain('required');
    });

    it('validates parameter types - string', async () => {
      const definition: ToolDefinition = {
        name: 'string_tool',
        description: 'String param tool',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text parameter' },
          },
          required: ['text'],
        },
      };

      executor.registerTool(definition, async () => ({ output: 'test' }));

      const toolCall: ToolCall = {
        id: 'call-invalid',
        name: 'string_tool',
        arguments: { text: 123 }, // Wrong type
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('text');
      expect(result.error?.message).toContain('string');
    });

    it('validates parameter types - number', async () => {
      const definition: ToolDefinition = {
        name: 'number_tool',
        description: 'Number param tool',
        parameters: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Count parameter' },
          },
          required: ['count'],
        },
      };

      executor.registerTool(definition, async () => ({ output: 'test' }));

      const toolCall: ToolCall = {
        id: 'call-invalid',
        name: 'number_tool',
        arguments: { count: 'not a number' }, // Wrong type
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('validates parameter types - boolean', async () => {
      const definition: ToolDefinition = {
        name: 'boolean_tool',
        description: 'Boolean param tool',
        parameters: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', description: 'Enabled parameter' },
          },
          required: ['enabled'],
        },
      };

      executor.registerTool(definition, async () => ({ output: 'test' }));

      const toolCall: ToolCall = {
        id: 'call-invalid',
        name: 'boolean_tool',
        arguments: { enabled: 'yes' }, // Wrong type
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('validates enum values', async () => {
      const definition: ToolDefinition = {
        name: 'enum_tool',
        description: 'Enum param tool',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Status parameter',
              enum: ['pending', 'active', 'completed'],
            },
          },
          required: ['status'],
        },
      };

      executor.registerTool(definition, async () => ({ output: 'test' }));

      const toolCall: ToolCall = {
        id: 'call-invalid',
        name: 'enum_tool',
        arguments: { status: 'invalid' }, // Not in enum
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('must be one of');
    });

    it('validates object properties', async () => {
      const definition: ToolDefinition = {
        name: 'object_tool',
        description: 'Object param tool',
        parameters: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              description: 'Config object',
              properties: {
                host: { type: 'string' },
                port: { type: 'number' },
              },
            },
          },
          required: ['config'],
        },
      };

      executor.registerTool(definition, async () => ({ output: 'test' }));

      const toolCall: ToolCall = {
        id: 'call-invalid',
        name: 'object_tool',
        arguments: { config: 'not an object' }, // Wrong type
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('validates array items', async () => {
      const definition: ToolDefinition = {
        name: 'array_tool',
        description: 'Array param tool',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              description: 'Items array',
              items: { type: 'string' },
            },
          },
          required: ['items'],
        },
      };

      executor.registerTool(definition, async () => ({ output: 'test' }));

      const toolCall: ToolCall = {
        id: 'call-invalid',
        name: 'array_tool',
        arguments: { items: 'not an array' }, // Wrong type
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('allows optional parameters to be omitted', async () => {
      const definition: ToolDefinition = {
        name: 'optional_tool',
        description: 'Optional params tool',
        parameters: {
          type: 'object',
          properties: {
            required_param: { type: 'string' },
            optional_param: { type: 'string' },
          },
          required: ['required_param'],
        },
      };

      const handler: ToolHandler = async (args) => ({
        output: `Required: ${args.required_param}, Optional: ${args.optional_param ?? 'not provided'}`,
      });

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-valid',
        name: 'optional_tool',
        arguments: { required_param: 'value' },
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toContain('not provided');
    });

    it('uses default values when parameter is omitted', async () => {
      const definition: ToolDefinition = {
        name: 'default_tool',
        description: 'Default values tool',
        parameters: {
          type: 'object',
          properties: {
            value: {
              type: 'number',
              description: 'Value with default',
              default: 42,
            },
          },
          required: [],
        },
      };

      const handler: ToolHandler = async (args) => ({
        output: `Value: ${args.value}`,
      });

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-default',
        name: 'default_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Value: 42');
    });
  });

  describe('executeTool - error handling', () => {
    it('returns TOOL_NOT_FOUND when tool is not registered', async () => {
      const toolCall: ToolCall = {
        id: 'call-missing',
        name: 'nonexistent_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
      expect(result.error?.message).toContain('nonexistent_tool');
      expect(result.callId).toBe('call-missing');
      expect(result.name).toBe('nonexistent_tool');
    });

    it('wraps handler exceptions as EXECUTION_ERROR', async () => {
      const definition: ToolDefinition = {
        name: 'failing_tool',
        description: 'A failing tool',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async () => {
        throw new Error('Handler failed');
      };

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-fail',
        name: 'failing_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('Handler failed');
      expect(result.error?.details).toBeDefined();
    });

    it('wraps handler rejection as EXECUTION_ERROR', async () => {
      const definition: ToolDefinition = {
        name: 'rejecting_tool',
        description: 'A rejecting tool',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async () => {
        return Promise.reject(new Error('Promise rejected'));
      };

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-reject',
        name: 'rejecting_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('Promise rejected');
    });

    it('handles non-Error exceptions', async () => {
      const definition: ToolDefinition = {
        name: 'weird_throw',
        description: 'Throws non-error',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'String error';
      };

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-weird',
        name: 'weird_throw',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('Unknown error');
    });
  });

  describe('executeTool - timeout handling', () => {
    it('times out handler that exceeds timeout', async () => {
      const definition: ToolDefinition = {
        name: 'slow_tool',
        description: 'A slow tool',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 seconds
        return { output: 'Completed' };
      };

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-slow',
        name: 'slow_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext, {
        timeout: 100,
      }); // 100ms timeout

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.error?.message).toContain('timed out');
      expect(result.durationMs).toBeGreaterThanOrEqual(95); // 5ms tolerance for Node 18 timer precision
    });

    it('succeeds when handler completes within timeout', async () => {
      const definition: ToolDefinition = {
        name: 'fast_tool',
        description: 'A fast tool',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10)); // 10ms
        return { output: 'Completed' };
      };

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-fast',
        name: 'fast_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext, {
        timeout: 1000,
      }); // 1 second timeout

      expect(result.success).toBe(true);
      expect(result.output).toBe('Completed');
    });

    it('uses default timeout when not specified', async () => {
      const definition: ToolDefinition = {
        name: 'default_timeout_tool',
        description: 'Uses default timeout',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { output: 'Completed' };
      };

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-default',
        name: 'default_timeout_tool',
        arguments: {},
      };

      // Should not timeout with default (30 seconds)
      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(true);
    });

    it('respects AbortSignal for cancellation', async () => {
      const definition: ToolDefinition = {
        name: 'abortable_tool',
        description: 'Can be aborted',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async (_args, ctx) => {
        // Simulate long operation that checks signal
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1000);
          ctx.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
          });
        });
        return { output: 'Completed' };
      };

      executor.registerTool(definition, handler);

      const controller = new AbortController();
      const contextWithSignal: ToolContext = {
        ...mockContext,
        signal: controller.signal,
      };

      const toolCall: ToolCall = {
        id: 'call-abort',
        name: 'abortable_tool',
        arguments: {},
      };

      // Abort after 50ms
      setTimeout(() => controller.abort(), 50);

      const result = await executor.executeTool(toolCall, contextWithSignal);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('Aborted');
    });
  });

  describe('executeTool - edge cases', () => {
    it('handles empty tool call arguments', async () => {
      const definition: ToolDefinition = {
        name: 'no_args_tool',
        description: 'No arguments',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async () => ({ output: 'Success' });

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-empty',
        name: 'no_args_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Success');
    });

    it('handles very large output strings', async () => {
      const definition: ToolDefinition = {
        name: 'large_output_tool',
        description: 'Returns large output',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const largeString = 'x'.repeat(1_000_000); // 1MB
      const handler: ToolHandler = async () => ({ output: largeString });

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-large',
        name: 'large_output_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toHaveLength(1_000_000);
    });

    it('tracks execution duration accurately', async () => {
      const definition: ToolDefinition = {
        name: 'timed_tool',
        description: 'Measured tool',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const handler: ToolHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { output: 'Done' };
      };

      executor.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-timed',
        name: 'timed_tool',
        arguments: {},
      };

      const result = await executor.executeTool(toolCall, mockContext);

      expect(result.success).toBe(true);
      // Allow small tolerance for timer resolution differences across Node versions
      expect(result.durationMs).toBeGreaterThanOrEqual(95);
      expect(result.durationMs).toBeLessThan(200); // Should not be way off
    });
  });

  describe('ToolExecutor - memoryStore injection', () => {
    it('forwards memoryStore to handler context when provided in constructor', async () => {
      const mockMemoryStore: MemoryStore = {
        get: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        search: vi.fn(),
        loadLayer1: vi.fn(),
      };

      const executorWithMemory = new ToolExecutor(mockMemoryStore);

      const definition: ToolDefinition = {
        name: 'memory_tool',
        description: 'Accesses memory store',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      let capturedContext: ToolContext | undefined;
      const handler: ToolHandler = async (_args, ctx) => {
        capturedContext = ctx;
        return { output: 'ok' };
      };

      executorWithMemory.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-memory',
        name: 'memory_tool',
        arguments: {},
      };

      await executorWithMemory.executeTool(toolCall, mockContext);

      expect(capturedContext?.memoryStore).toBe(mockMemoryStore);
    });

    it('sets context.memoryStore to undefined when constructor receives no memoryStore', async () => {
      const executorWithoutMemory = new ToolExecutor();

      const definition: ToolDefinition = {
        name: 'no_memory_tool',
        description: 'Has no memory store',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      let capturedContext: ToolContext | undefined;
      const handler: ToolHandler = async (_args, ctx) => {
        capturedContext = ctx;
        return { output: 'ok' };
      };

      executorWithoutMemory.registerTool(definition, handler);

      const toolCall: ToolCall = {
        id: 'call-no-memory',
        name: 'no_memory_tool',
        arguments: {},
      };

      await executorWithoutMemory.executeTool(toolCall, mockContext);

      expect(capturedContext?.memoryStore).toBeUndefined();
    });
  });
});

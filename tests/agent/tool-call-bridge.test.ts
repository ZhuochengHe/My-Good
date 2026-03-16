/**
 * Tests for tool call bridge.
 *
 * Tests the mapping between ToolCallContext (ExecutionLoop) and ToolContext (ToolExecutor).
 */

import { describe, it, expect, vi } from 'vitest';
import { createToolCallBridge } from '../../src/agent/tool-call-bridge.js';
import type { ToolCall } from '../../src/types/messages.js';
import type { ToolResult } from '../../src/types/tools.js';
import type { MemoryStore } from '../../src/types/memory.js';

describe('Tool Call Bridge', () => {
  describe('createToolCallBridge', () => {
    it('creates a bridge function that maps ToolCallContext to ToolContext', async () => {
      const mockExecuteTool = async (call: ToolCall, context: any) => {
        expect(context).toHaveProperty('sessionId');
        expect(context).toHaveProperty('workingDirectory');
        expect(context).toHaveProperty('env');

        return {
          callId: call.id,
          name: call.name,
          success: true,
          output: 'test output',
          durationMs: 10,
        };
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      const toolCall: ToolCall = {
        id: 'test-call-1',
        name: 'test_tool',
        arguments: { arg: 'value' },
      };

      const toolCallContext = {
        sessionId: 'session-123',
        workingDirectory: '/tmp/test',
      };

      const result = await bridge(toolCall, toolCallContext);

      expect(result.callId).toBe('test-call-1');
      expect(result.success).toBe(true);
    });

    it('adds env field to context when calling executeTool', async () => {
      let capturedContext: any = null;

      const mockExecuteTool = async (_call: ToolCall, context: any) => {
        capturedContext = context;
        return {
          callId: 'test-1',
          name: 'test',
          success: true,
          output: '',
          durationMs: 1,
        };
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      await bridge(
        { id: 'call-1', name: 'test', arguments: {} },
        { sessionId: 'sess-1', workingDirectory: '/tmp' }
      );

      expect(capturedContext).toHaveProperty('env');
      expect(capturedContext.env).toBeDefined();
      expect(typeof capturedContext.env).toBe('object');
    });

    it('preserves sessionId from ToolCallContext', async () => {
      let capturedContext: any = null;

      const mockExecuteTool = async (_call: ToolCall, context: any) => {
        capturedContext = context;
        return {
          callId: 'test-1',
          name: 'test',
          success: true,
          output: '',
          durationMs: 1,
        };
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      await bridge(
        { id: 'call-1', name: 'test', arguments: {} },
        { sessionId: 'my-session-456', workingDirectory: '/tmp' }
      );

      expect(capturedContext.sessionId).toBe('my-session-456');
    });

    it('preserves workingDirectory from ToolCallContext', async () => {
      let capturedContext: any = null;

      const mockExecuteTool = async (_call: ToolCall, context: any) => {
        capturedContext = context;
        return {
          callId: 'test-1',
          name: 'test',
          success: true,
          output: '',
          durationMs: 1,
        };
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      await bridge(
        { id: 'call-1', name: 'test', arguments: {} },
        { sessionId: 'sess-1', workingDirectory: '/custom/path' }
      );

      expect(capturedContext.workingDirectory).toBe('/custom/path');
    });

    it('forwards signal from ToolCallContext', async () => {
      let capturedContext: any = null;

      const mockExecuteTool = async (_call: ToolCall, context: any) => {
        capturedContext = context;
        return {
          callId: 'test-1',
          name: 'test',
          success: true,
          output: '',
          durationMs: 1,
        };
      };

      const bridge = createToolCallBridge(mockExecuteTool);
      const abortController = new AbortController();

      await bridge(
        { id: 'call-1', name: 'test', arguments: {} },
        {
          sessionId: 'sess-1',
          workingDirectory: '/tmp',
          signal: abortController.signal,
        }
      );

      expect(capturedContext.signal).toBe(abortController.signal);
    });

    it('passes tool call to executeTool unchanged', async () => {
      let capturedCall: any = null;

      const mockExecuteTool = async (call: ToolCall, _context: any) => {
        capturedCall = call;
        return {
          callId: call.id,
          name: call.name,
          success: true,
          output: '',
          durationMs: 1,
        };
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      const toolCall: ToolCall = {
        id: 'unique-call-id',
        name: 'complex_tool',
        arguments: { nested: { data: 'value' }, array: [1, 2, 3] },
      };

      await bridge(toolCall, { sessionId: 'sess-1', workingDirectory: '/tmp' });

      expect(capturedCall).toEqual(toolCall);
    });

    it('returns result from executeTool unchanged', async () => {
      const mockResult: ToolResult = {
        callId: 'result-1',
        name: 'test_tool',
        success: true,
        output: 'complex output with\nnewlines',
        durationMs: 123,
      };

      const mockExecuteTool = async (_call: ToolCall, _context: any) => {
        return mockResult;
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      const result = await bridge(
        { id: 'call-1', name: 'test', arguments: {} },
        { sessionId: 'sess-1', workingDirectory: '/tmp' }
      );

      expect(result).toEqual(mockResult);
    });

    it('propagates errors from executeTool', async () => {
      const mockExecuteTool = async (_call: ToolCall, _context: any): Promise<ToolResult> => {
        throw new Error('Tool execution failed');
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      await expect(
        bridge(
          { id: 'call-1', name: 'test', arguments: {} },
          { sessionId: 'sess-1', workingDirectory: '/tmp' }
        )
      ).rejects.toThrow('Tool execution failed');
    });

    it('uses process.env for env field by default', async () => {
      let capturedContext: any = null;

      const mockExecuteTool = async (_call: ToolCall, context: any) => {
        capturedContext = context;
        return {
          callId: 'test-1',
          name: 'test',
          success: true,
          output: '',
          durationMs: 1,
        };
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      await bridge(
        { id: 'call-1', name: 'test', arguments: {} },
        { sessionId: 'sess-1', workingDirectory: '/tmp' }
      );

      // Check that env is populated (should have NODE_ENV or other vars)
      expect(Object.keys(capturedContext.env).length).toBeGreaterThan(0);
    });

    it('forwards memoryStore from ToolCallContext to ToolContext', async () => {
      let capturedContext: any = null;

      const mockExecuteTool = async (_call: ToolCall, context: any) => {
        capturedContext = context;
        return {
          callId: 'test-1',
          name: 'test',
          success: true,
          output: '',
          durationMs: 1,
        };
      };

      const mockMemoryStore: MemoryStore = {
        get: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        search: vi.fn(),
        loadLayer1: vi.fn(),
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      await bridge(
        { id: 'call-1', name: 'test', arguments: {} },
        { sessionId: 'sess-1', workingDirectory: '/tmp', memoryStore: mockMemoryStore }
      );

      expect(capturedContext.memoryStore).toBe(mockMemoryStore);
    });

    it('sets memoryStore to undefined in ToolContext when not provided in ToolCallContext', async () => {
      let capturedContext: any = null;

      const mockExecuteTool = async (_call: ToolCall, context: any) => {
        capturedContext = context;
        return {
          callId: 'test-1',
          name: 'test',
          success: true,
          output: '',
          durationMs: 1,
        };
      };

      const bridge = createToolCallBridge(mockExecuteTool);

      await bridge(
        { id: 'call-1', name: 'test', arguments: {} },
        { sessionId: 'sess-1', workingDirectory: '/tmp' }
      );

      expect(capturedContext.memoryStore).toBeUndefined();
    });
  });
});

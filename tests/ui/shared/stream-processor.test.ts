/**
 * Tests for agentEventToAction.
 * Written FIRST following TDD methodology (RED -> GREEN -> REFACTOR).
 */

import { describe, it, expect } from 'vitest';
import { agentEventToAction } from '../../../src/ui/shared/stream-processor.js';
import type { AgentEvent } from '../../../src/types/events.js';

describe('agentEventToAction', () => {
  describe('text_delta', () => {
    it('maps to text_delta action with the delta string', () => {
      const event: AgentEvent = { type: 'text_delta', delta: 'Hello' };
      const action = agentEventToAction(event);
      expect(action).toEqual({ type: 'text_delta', delta: 'Hello' });
    });

    it('preserves an empty delta string', () => {
      const event: AgentEvent = { type: 'text_delta', delta: '' };
      const action = agentEventToAction(event);
      expect(action).toEqual({ type: 'text_delta', delta: '' });
    });
  });

  describe('tool_call_start', () => {
    it('maps to tool_start action with toolName and args from toolCall.arguments', () => {
      const event: AgentEvent = {
        type: 'tool_call_start',
        toolCall: { id: 'tc1', name: 'bash', arguments: { cmd: 'ls' } },
      };
      const action = agentEventToAction(event);
      expect(action).toEqual({
        type: 'tool_start',
        toolName: 'bash',
        args: { cmd: 'ls' },
      });
    });

    it('uses empty object as args when arguments is empty', () => {
      const event: AgentEvent = {
        type: 'tool_call_start',
        toolCall: { id: 'tc2', name: 'list_files', arguments: {} },
      };
      const action = agentEventToAction(event);
      expect(action).toEqual({
        type: 'tool_start',
        toolName: 'list_files',
        args: {},
      });
    });
  });

  describe('tool_call_end', () => {
    it('maps to tool_end action', () => {
      const event: AgentEvent = {
        type: 'tool_call_end',
        result: {
          callId: 'tc1',
          name: 'bash',
          success: true,
          output: 'file list',
          durationMs: 42,
        },
      };
      const action = agentEventToAction(event);
      expect(action).toEqual({ type: 'tool_end', output: 'file list', success: true });
    });
  });

  describe('agent_end', () => {
    it('maps to agent_end action with usage from result', () => {
      const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
      const event: AgentEvent = {
        type: 'agent_end',
        result: {
          sessionId: 'sess1',
          messages: [],
          toolCalls: [],
          usage,
          turns: 1,
          finishReason: 'completed',
        },
        timestamp: Date.now(),
      };
      const action = agentEventToAction(event);
      expect(action).toEqual({ type: 'agent_end', usage });
    });
  });

  describe('error', () => {
    it('maps to error action with the error message', () => {
      const event: AgentEvent = {
        type: 'error',
        error: {
          code: 'PROVIDER_ERROR',
          message: 'API key invalid',
          recoverable: false,
        },
        timestamp: Date.now(),
      };
      const action = agentEventToAction(event);
      expect(action).toEqual({ type: 'error', message: 'API key invalid' });
    });
  });

  describe('events that map to null', () => {
    it('returns null for agent_start', () => {
      const event: AgentEvent = {
        type: 'agent_start',
        sessionId: 'sess1',
        timestamp: Date.now(),
      };
      expect(agentEventToAction(event)).toBeNull();
    });

    it('returns null for turn_start', () => {
      const event: AgentEvent = { type: 'turn_start', turnNumber: 1 };
      expect(agentEventToAction(event)).toBeNull();
    });

    it('returns null for turn_end', () => {
      const event: AgentEvent = {
        type: 'turn_end',
        turnNumber: 1,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        timestamp: Date.now(),
      };
      expect(agentEventToAction(event)).toBeNull();
    });
  });
});

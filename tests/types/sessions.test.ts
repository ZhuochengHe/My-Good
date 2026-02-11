/**
 * Tests for session type definitions.
 * Following TDD - tests written FIRST.
 */

import { describe, it, expect } from 'vitest';

// Import the new types - these should fail until we implement them
import type {
  TurnMetadataRecord,
  ErrorLogRecord,
  JournalRecord,
} from '../../src/types/sessions.js';

// Also verify the types can be used in the actual store
import type { Session } from '../../src/types/sessions.js';

describe('Session Types', () => {
  describe('Type Exports', () => {
    it('exports TurnMetadataRecord type', () => {
      // This test verifies the type is actually exported and usable
      const metadata: TurnMetadataRecord = {
        type: 'turn_metadata',
        turnNumber: 1,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        durationMs: 1000,
        toolCount: 0,
        stopReason: 'end_turn',
        timestamp: Date.now(),
      };

      // Verify the object has the expected shape
      expect(metadata).toHaveProperty('type', 'turn_metadata');
      expect(metadata).toHaveProperty('turnNumber');
      expect(metadata).toHaveProperty('usage');
      expect(metadata).toHaveProperty('durationMs');
      expect(metadata).toHaveProperty('toolCount');
      expect(metadata).toHaveProperty('stopReason');
      expect(metadata).toHaveProperty('timestamp');
    });

    it('exports ErrorLogRecord type', () => {
      const errorLog: ErrorLogRecord = {
        type: 'error_log',
        error: 'TestError',
        message: 'Test message',
        timestamp: Date.now(),
      };

      expect(errorLog).toHaveProperty('type', 'error_log');
      expect(errorLog).toHaveProperty('error');
      expect(errorLog).toHaveProperty('message');
      expect(errorLog).toHaveProperty('timestamp');
    });

    it('exports JournalRecord union type', () => {
      // Verify we can assign different record types to JournalRecord
      const records: JournalRecord[] = [];

      // This will fail to compile if JournalRecord isn't properly defined
      records.push({
        type: 'turn_metadata',
        turnNumber: 1,
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        durationMs: 500,
        toolCount: 0,
        stopReason: 'end_turn',
        timestamp: Date.now(),
      });

      expect(records).toHaveLength(1);
    });
  });

  describe('TurnMetadataRecord', () => {
    it('has correct structure for turn metadata', () => {
      const metadata: TurnMetadataRecord = {
        type: 'turn_metadata',
        turnNumber: 1,
        usage: {
          promptTokens: 150,
          completionTokens: 100,
          totalTokens: 250,
        },
        durationMs: 1200,
        toolCount: 2,
        stopReason: 'tool_use',
        timestamp: Date.now(),
      };

      expect(metadata.type).toBe('turn_metadata');
      expect(metadata.turnNumber).toBe(1);
      expect(metadata.usage.promptTokens).toBe(150);
      expect(metadata.usage.completionTokens).toBe(100);
      expect(metadata.usage.totalTokens).toBe(250);
      expect(metadata.durationMs).toBe(1200);
      expect(metadata.toolCount).toBe(2);
      expect(metadata.stopReason).toBe('tool_use');
      expect(typeof metadata.timestamp).toBe('number');
    });

    it('supports all stop reason values', () => {
      const stopReasons = ['end_turn', 'tool_use', 'max_tokens', 'error'];

      for (const stopReason of stopReasons) {
        const metadata: TurnMetadataRecord = {
          type: 'turn_metadata',
          turnNumber: 1,
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
          durationMs: 1000,
          toolCount: 0,
          stopReason,
          timestamp: Date.now(),
        };

        expect(metadata.stopReason).toBe(stopReason);
      }
    });

    it('handles zero tool calls', () => {
      const metadata: TurnMetadataRecord = {
        type: 'turn_metadata',
        turnNumber: 1,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        durationMs: 800,
        toolCount: 0,
        stopReason: 'end_turn',
        timestamp: Date.now(),
      };

      expect(metadata.toolCount).toBe(0);
    });
  });

  describe('ErrorLogRecord', () => {
    it('has correct structure for error log', () => {
      const errorLog: ErrorLogRecord = {
        type: 'error_log',
        turnNumber: 2,
        error: 'ToolExecutionError',
        message: 'Command timeout after 30s',
        context: 'during shell execution',
        stack: 'Error: Command timeout\n  at ...',
        timestamp: Date.now(),
      };

      expect(errorLog.type).toBe('error_log');
      expect(errorLog.turnNumber).toBe(2);
      expect(errorLog.error).toBe('ToolExecutionError');
      expect(errorLog.message).toBe('Command timeout after 30s');
      expect(errorLog.context).toBe('during shell execution');
      expect(errorLog.stack).toContain('Error: Command timeout');
      expect(typeof errorLog.timestamp).toBe('number');
    });

    it('supports optional turnNumber for errors outside turns', () => {
      const errorLog: ErrorLogRecord = {
        type: 'error_log',
        error: 'ProviderError',
        message: 'API key invalid',
        timestamp: Date.now(),
      };

      expect(errorLog.turnNumber).toBeUndefined();
      expect(errorLog.error).toBe('ProviderError');
    });

    it('supports optional context and stack fields', () => {
      const minimalError: ErrorLogRecord = {
        type: 'error_log',
        turnNumber: 1,
        error: 'ValidationError',
        message: 'Invalid parameter',
        timestamp: Date.now(),
      };

      expect(minimalError.context).toBeUndefined();
      expect(minimalError.stack).toBeUndefined();
    });

    it('captures provider errors', () => {
      const errorLog: ErrorLogRecord = {
        type: 'error_log',
        turnNumber: 3,
        error: 'ProviderError',
        message: 'Rate limit exceeded',
        context: 'during API call to Anthropic',
        timestamp: Date.now(),
      };

      expect(errorLog.error).toBe('ProviderError');
      expect(errorLog.context).toContain('API call');
    });
  });

  describe('JournalRecord Union Type', () => {
    it('accepts session_start records', () => {
      const record: JournalRecord = {
        type: 'session_start',
        timestamp: Date.now(),
        sessionId: 'test-123',
        agentId: 'my-agent',
        metadata: {
          model: 'claude-sonnet-4-20250514',
          provider: 'anthropic',
          totalTokens: 0,
          toolCallCount: 0,
          turnCount: 0,
          description: '',
          tags: ['common'],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(record.type).toBe('session_start');
    });

    it('accepts message records', () => {
      const record: JournalRecord = {
        type: 'message',
        timestamp: Date.now(),
        message: {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
      };

      expect(record.type).toBe('message');
    });

    it('accepts turn_metadata records', () => {
      const record: JournalRecord = {
        type: 'turn_metadata',
        turnNumber: 1,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        durationMs: 1000,
        toolCount: 1,
        stopReason: 'tool_use',
        timestamp: Date.now(),
      };

      expect(record.type).toBe('turn_metadata');
    });

    it('accepts error_log records', () => {
      const record: JournalRecord = {
        type: 'error_log',
        turnNumber: 1,
        error: 'TestError',
        message: 'Test error message',
        timestamp: Date.now(),
      };

      expect(record.type).toBe('error_log');
    });

    it('discriminates record types by type field', () => {
      const records: JournalRecord[] = [
        {
          type: 'session_start',
          timestamp: Date.now(),
          sessionId: 'test',
          agentId: 'agent',
          metadata: {
            model: 'test',
            provider: 'anthropic',
            totalTokens: 0,
            toolCallCount: 0,
            turnCount: 0,
            description: '',
            tags: [],
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          type: 'message',
          timestamp: Date.now(),
          message: {
            id: 'msg-1',
            role: 'user',
            content: 'Test',
            timestamp: Date.now(),
          },
        },
        {
          type: 'turn_metadata',
          turnNumber: 1,
          usage: {
            promptTokens: 50,
            completionTokens: 25,
            totalTokens: 75,
          },
          durationMs: 500,
          toolCount: 0,
          stopReason: 'end_turn',
          timestamp: Date.now(),
        },
        {
          type: 'error_log',
          error: 'Error',
          message: 'Test',
          timestamp: Date.now(),
        },
      ];

      const types = records.map(r => r.type);
      expect(types).toEqual(['session_start', 'message', 'turn_metadata', 'error_log']);
    });
  });
});

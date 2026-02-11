/**
 * Tests for JSONL session store.
 * These tests are written FIRST following TDD methodology.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonlSessionStore } from '../../src/session/jsonl-store.js';
import {
  InvalidSessionIdError,
  SessionNotFoundError,
  SessionLoadError,
  SessionCorruptedError,
} from '../../src/errors/session.js';
import type { Session, SessionSummary } from '../../src/types/sessions.js';
import type { ConversationMessage } from '../../src/types/messages.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const { join } = path;

// Test fixtures directory
const testSessionsDir = path.join(process.cwd(), 'tests', 'fixtures', 'test-sessions');

describe('JsonlSessionStore', () => {
  let store: JsonlSessionStore;

  beforeEach(async () => {
    // Create fresh test directory
    if (existsSync(testSessionsDir)) {
      await fs.rm(testSessionsDir, { recursive: true, force: true });
    }
    await fs.mkdir(testSessionsDir, { recursive: true });
    store = new JsonlSessionStore(testSessionsDir);
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(testSessionsDir)) {
      await fs.rm(testSessionsDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('creates store with specified directory', () => {
      const customDir = '/tmp/custom-sessions';
      const customStore = new JsonlSessionStore(customDir);
      expect(customStore).toBeDefined();
    });

    it('creates store with default directory if none provided', () => {
      const defaultStore = new JsonlSessionStore();
      expect(defaultStore).toBeDefined();
    });
  });

  describe('validateSessionId', () => {
    it('accepts valid session IDs', async () => {
      const validIds = [
        'abc-123',
        'session_456',
        'TEST-Session-789',
        'a1b2c3',
        '123',
      ];

      for (const id of validIds) {
        const session = createTestSession(id);
        await expect(store.save(session)).resolves.not.toThrow();
      }
    });

    it('rejects session IDs with path traversal attempts', async () => {
      const invalidIds = [
        '../etc/passwd',
        'session/../../etc/passwd',
        '..\\windows\\system32',
        './session',
      ];

      for (const id of invalidIds) {
        const session = createTestSession(id);
        await expect(store.save(session)).rejects.toThrow(InvalidSessionIdError);
      }
    });

    it('rejects session IDs with special characters', async () => {
      const invalidIds = [
        'session@123',
        'session#123',
        'session!123',
        'session 123',
        'session/123',
        'session\\123',
      ];

      for (const id of invalidIds) {
        const session = createTestSession(id);
        await expect(store.save(session)).rejects.toThrow(InvalidSessionIdError);
      }
    });

    it('rejects empty session IDs', async () => {
      const session = createTestSession('');
      await expect(store.save(session)).rejects.toThrow(InvalidSessionIdError);
    });
  });

  describe('save', () => {
    it('saves new session successfully', async () => {
      const session = createTestSession('test-session-1');
      await store.save(session);

      const sessionFile = path.join(testSessionsDir, 'test-session-1.jsonl');
      expect(existsSync(sessionFile)).toBe(true);
    });

    it('overwrites existing session', async () => {
      const session1 = createTestSession('test-session-1');
      await store.save(session1);

      const session2: Session = {
        ...session1,
        messages: [
          ...session1.messages,
          createTestMessage('user', 'Hello again'),
        ],
      };
      await store.save(session2);

      const loaded = await store.load('test-session-1');
      expect(loaded).not.toBeNull();
      expect(loaded!.messages).toHaveLength(2);
    });

    it('saves session with multiple messages', async () => {
      const session = createTestSession('multi-message', [
        createTestMessage('user', 'Hello'),
        createTestMessage('assistant', 'Hi there!'),
        createTestMessage('user', 'How are you?'),
      ]);

      await store.save(session);
      const loaded = await store.load('multi-message');
      expect(loaded!.messages).toHaveLength(3);
    });

    it('saves session with unicode characters', async () => {
      const session = createTestSession('unicode-session', [
        createTestMessage('user', 'Hello 世界 🌍'),
        createTestMessage('assistant', 'Bonjour! مرحبا'),
      ]);

      await store.save(session);
      const loaded = await store.load('unicode-session');
      expect(loaded!.messages[0].content).toBe('Hello 世界 🌍');
      expect(loaded!.messages[1].content).toBe('Bonjour! مرحبا');
    });

    it('saves session with very long content', async () => {
      const longContent = 'x'.repeat(100000);
      const session = createTestSession('long-content', [
        createTestMessage('user', longContent),
      ]);

      await store.save(session);
      const loaded = await store.load('long-content');
      expect(loaded!.messages[0].content).toBe(longContent);
    });
  });

  describe('load', () => {
    it('loads existing session successfully', async () => {
      const session = createTestSession('test-session-1');
      await store.save(session);

      const loaded = await store.load('test-session-1');
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('test-session-1');
      expect(loaded!.agentId).toBe(session.agentId);
      expect(loaded!.messages).toHaveLength(1);
    });

    it('returns null for non-existent session', async () => {
      const loaded = await store.load('non-existent');
      expect(loaded).toBeNull();
    });

    it('throws InvalidSessionIdError for invalid session ID', async () => {
      await expect(store.load('../etc/passwd')).rejects.toThrow(
        InvalidSessionIdError
      );
    });

    it('reconstructs session metadata correctly', async () => {
      const session = createTestSession('metadata-test');
      session.metadata.totalTokens = 1234;
      session.metadata.toolCallCount = 5;
      session.metadata.turnCount = 3;

      await store.save(session);
      const loaded = await store.load('metadata-test');

      expect(loaded!.metadata.totalTokens).toBe(1234);
      expect(loaded!.metadata.toolCallCount).toBe(5);
      expect(loaded!.metadata.turnCount).toBe(3);
    });

    it('preserves message order', async () => {
      const messages: ConversationMessage[] = [
        createTestMessage('user', 'First'),
        createTestMessage('assistant', 'Second'),
        createTestMessage('user', 'Third'),
      ];
      const session = createTestSession('order-test', messages);

      await store.save(session);
      const loaded = await store.load('order-test');

      expect(loaded!.messages[0].content).toBe('First');
      expect(loaded!.messages[1].content).toBe('Second');
      expect(loaded!.messages[2].content).toBe('Third');
    });

    it('throws SessionCorruptedError for malformed JSON', async () => {
      const sessionFile = path.join(testSessionsDir, 'corrupted.jsonl');
      await fs.writeFile(sessionFile, 'not valid json\n');

      await expect(store.load('corrupted')).rejects.toThrow(SessionCorruptedError);
    });

    it('throws SessionCorruptedError for missing session_start', async () => {
      const sessionFile = path.join(testSessionsDir, 'no-start.jsonl');
      await fs.writeFile(
        sessionFile,
        JSON.stringify({ type: 'message', timestamp: Date.now() }) + '\n'
      );

      await expect(store.load('no-start')).rejects.toThrow(SessionCorruptedError);
    });

    it('handles empty session file', async () => {
      const sessionFile = path.join(testSessionsDir, 'empty.jsonl');
      await fs.writeFile(sessionFile, '');

      await expect(store.load('empty')).rejects.toThrow(SessionCorruptedError);
    });
  });

  describe('appendMessage', () => {
    it('appends message to existing session', async () => {
      const session = createTestSession('append-test');
      await store.save(session);

      const newMessage = createTestMessage('user', 'New message');
      await store.appendMessage('append-test', newMessage);

      const loaded = await store.load('append-test');
      expect(loaded!.messages).toHaveLength(2);
      expect(loaded!.messages[1].content).toBe('New message');
    });

    it('updates session timestamps on append', async () => {
      const session = createTestSession('timestamp-test');
      await store.save(session);

      const originalUpdatedAt = session.updatedAt;
      await new Promise(resolve => setTimeout(resolve, 10));

      const newMessage = createTestMessage('user', 'New message');
      await store.appendMessage('timestamp-test', newMessage);

      const loaded = await store.load('timestamp-test');
      expect(loaded!.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });

    it('throws SessionNotFoundError for non-existent session', async () => {
      const message = createTestMessage('user', 'Test');
      await expect(store.appendMessage('non-existent', message)).rejects.toThrow(
        SessionNotFoundError
      );
    });

    it('throws InvalidSessionIdError for invalid session ID', async () => {
      const message = createTestMessage('user', 'Test');
      await expect(store.appendMessage('../etc/passwd', message)).rejects.toThrow(
        InvalidSessionIdError
      );
    });

    it('appends multiple messages in sequence', async () => {
      const session = createTestSession('multi-append');
      await store.save(session);

      await store.appendMessage('multi-append', createTestMessage('user', 'Msg 1'));
      await store.appendMessage('multi-append', createTestMessage('assistant', 'Msg 2'));
      await store.appendMessage('multi-append', createTestMessage('user', 'Msg 3'));

      const loaded = await store.load('multi-append');
      expect(loaded!.messages).toHaveLength(4);
      expect(loaded!.messages[1].content).toBe('Msg 1');
      expect(loaded!.messages[2].content).toBe('Msg 2');
      expect(loaded!.messages[3].content).toBe('Msg 3');
    });
  });

  describe('list', () => {
    it('returns empty array when no sessions exist', async () => {
      const sessions = await store.list();
      expect(sessions).toEqual([]);
    });

    it('lists all sessions', async () => {
      await store.save(createTestSession('session-1'));
      await store.save(createTestSession('session-2'));
      await store.save(createTestSession('session-3'));

      const sessions = await store.list();
      expect(sessions).toHaveLength(3);

      const ids = sessions.map(s => s.id).sort();
      expect(ids).toEqual(['session-1', 'session-2', 'session-3']);
    });

    it('returns correct session summaries', async () => {
      const session = createTestSession('summary-test', [
        createTestMessage('user', 'Hello'),
        createTestMessage('assistant', 'Hi'),
      ]);
      await store.save(session);

      const sessions = await store.list();
      expect(sessions).toHaveLength(1);

      const summary = sessions[0];
      expect(summary.id).toBe('summary-test');
      expect(summary.agentId).toBe(session.agentId);
      expect(summary.createdAt).toBe(session.createdAt);
      expect(summary.updatedAt).toBe(session.updatedAt);
      expect(summary.messageCount).toBe(2);
    });

    it('skips corrupted session files', async () => {
      await store.save(createTestSession('valid-session'));

      const corruptedFile = path.join(testSessionsDir, 'corrupted.jsonl');
      await fs.writeFile(corruptedFile, 'invalid json\n');

      const sessions = await store.list();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('valid-session');
    });

    it('ignores non-jsonl files', async () => {
      await store.save(createTestSession('valid-session'));

      await fs.writeFile(path.join(testSessionsDir, 'readme.txt'), 'test');
      await fs.writeFile(path.join(testSessionsDir, 'data.json'), '{}');

      const sessions = await store.list();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('valid-session');
    });
  });

  describe('delete', () => {
    it('deletes existing session', async () => {
      await store.save(createTestSession('delete-test'));

      const sessionFile = path.join(testSessionsDir, 'delete-test.jsonl');
      expect(existsSync(sessionFile)).toBe(true);

      await store.delete('delete-test');
      expect(existsSync(sessionFile)).toBe(false);
    });

    it('throws SessionNotFoundError for non-existent session', async () => {
      await expect(store.delete('non-existent')).rejects.toThrow(
        SessionNotFoundError
      );
    });

    it('throws InvalidSessionIdError for invalid session ID', async () => {
      await expect(store.delete('../etc/passwd')).rejects.toThrow(
        InvalidSessionIdError
      );
    });

    it('deleted session cannot be loaded', async () => {
      await store.save(createTestSession('delete-load-test'));
      await store.delete('delete-load-test');

      const loaded = await store.load('delete-load-test');
      expect(loaded).toBeNull();
    });
  });

  describe('clear', () => {
    it('clears all messages but keeps session', async () => {
      const session = createTestSession('clear-test', [
        createTestMessage('user', 'Message 1'),
        createTestMessage('assistant', 'Message 2'),
        createTestMessage('user', 'Message 3'),
      ]);
      await store.save(session);

      await store.clear('clear-test');

      const loaded = await store.load('clear-test');
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('clear-test');
      expect(loaded!.messages).toHaveLength(0);
    });

    it('preserves session metadata', async () => {
      const session = createTestSession('metadata-clear');
      session.metadata.totalTokens = 9999;
      await store.save(session);

      await store.clear('metadata-clear');

      const loaded = await store.load('metadata-clear');
      expect(loaded!.metadata.totalTokens).toBe(9999);
    });

    it('throws SessionNotFoundError for non-existent session', async () => {
      await expect(store.clear('non-existent')).rejects.toThrow(
        SessionNotFoundError
      );
    });

    it('throws InvalidSessionIdError for invalid session ID', async () => {
      await expect(store.clear('../etc/passwd')).rejects.toThrow(
        InvalidSessionIdError
      );
    });
  });

  describe('error recovery', () => {
    it('backs up corrupted file when loading fails', async () => {
      const sessionFile = path.join(testSessionsDir, 'backup-test.jsonl');
      await fs.writeFile(sessionFile, 'corrupted data\n');

      await expect(store.load('backup-test')).rejects.toThrow(SessionCorruptedError);

      const backupFile = path.join(testSessionsDir, 'backup-test.jsonl.corrupted');
      expect(existsSync(backupFile)).toBe(true);
    });

    it('handles sequential appends correctly', async () => {
      const session = createTestSession('concurrent-test');
      await store.save(session);

      // Sequential appends (not truly concurrent to avoid race conditions)
      for (let i = 0; i < 5; i++) {
        await store.appendMessage('concurrent-test', createTestMessage('user', `Message ${i}`));
      }

      const loaded = await store.load('concurrent-test');
      expect(loaded!.messages.length).toBe(6); // 1 original + 5 appended
    });
  });

  describe('appendTurnMetadata', () => {
    it('appends turn metadata to existing session', async () => {
      const session = createTestSession('turn-metadata-test');
      await store.save(session);

      const metadata: import('../../src/types/sessions.js').TurnMetadataRecord = {
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

      await store.appendTurnMetadata('turn-metadata-test', metadata);

      // Verify file contains the metadata record
      const sessionFile = path.join(testSessionsDir, 'turn-metadata-test.jsonl');
      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      expect(lines.length).toBeGreaterThan(1);
      const lastLine = JSON.parse(lines[lines.length - 1]);
      expect(lastLine.type).toBe('turn_metadata');
      expect(lastLine.turnNumber).toBe(1);
      expect(lastLine.usage.totalTokens).toBe(250);
      expect(lastLine.durationMs).toBe(1200);
      expect(lastLine.toolCount).toBe(2);
      expect(lastLine.stopReason).toBe('tool_use');
    });

    it('appends multiple turn metadata records', async () => {
      const session = createTestSession('multi-turn-test');
      await store.save(session);

      const metadata1: import('../../src/types/sessions.js').TurnMetadataRecord = {
        type: 'turn_metadata',
        turnNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 800,
        toolCount: 0,
        stopReason: 'end_turn',
        timestamp: Date.now(),
      };

      const metadata2: import('../../src/types/sessions.js').TurnMetadataRecord = {
        type: 'turn_metadata',
        turnNumber: 2,
        usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
        durationMs: 1500,
        toolCount: 3,
        stopReason: 'tool_use',
        timestamp: Date.now(),
      };

      await store.appendTurnMetadata('multi-turn-test', metadata1);
      await store.appendTurnMetadata('multi-turn-test', metadata2);

      const sessionFile = path.join(testSessionsDir, 'multi-turn-test.jsonl');
      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      const metadataRecords = lines
        .map(line => JSON.parse(line))
        .filter(record => record.type === 'turn_metadata');

      expect(metadataRecords).toHaveLength(2);
      expect(metadataRecords[0].turnNumber).toBe(1);
      expect(metadataRecords[1].turnNumber).toBe(2);
    });

    it('throws SessionNotFoundError for non-existent session', async () => {
      const metadata: import('../../src/types/sessions.js').TurnMetadataRecord = {
        type: 'turn_metadata',
        turnNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 1000,
        toolCount: 0,
        stopReason: 'end_turn',
        timestamp: Date.now(),
      };

      await expect(
        store.appendTurnMetadata('non-existent', metadata)
      ).rejects.toThrow(SessionNotFoundError);
    });

    it('throws InvalidSessionIdError for invalid session ID', async () => {
      const metadata: import('../../src/types/sessions.js').TurnMetadataRecord = {
        type: 'turn_metadata',
        turnNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 1000,
        toolCount: 0,
        stopReason: 'end_turn',
        timestamp: Date.now(),
      };

      await expect(
        store.appendTurnMetadata('../etc/passwd', metadata)
      ).rejects.toThrow(InvalidSessionIdError);
    });

    it('handles all stop reason types', async () => {
      const session = createTestSession('stop-reason-test');
      await store.save(session);

      const stopReasons = ['end_turn', 'tool_use', 'max_tokens', 'error'];

      for (let i = 0; i < stopReasons.length; i++) {
        const metadata: import('../../src/types/sessions.js').TurnMetadataRecord = {
          type: 'turn_metadata',
          turnNumber: i + 1,
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          durationMs: 1000,
          toolCount: 0,
          stopReason: stopReasons[i],
          timestamp: Date.now(),
        };

        await store.appendTurnMetadata('stop-reason-test', metadata);
      }

      const sessionFile = path.join(testSessionsDir, 'stop-reason-test.jsonl');
      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      const metadataRecords = lines
        .map(line => JSON.parse(line))
        .filter(record => record.type === 'turn_metadata');

      expect(metadataRecords).toHaveLength(4);
      expect(metadataRecords.map(r => r.stopReason)).toEqual(stopReasons);
    });
  });

  describe('appendErrorLog', () => {
    it('appends error log to existing session', async () => {
      const session = createTestSession('error-log-test');
      await store.save(session);

      const errorLog: import('../../src/types/sessions.js').ErrorLogRecord = {
        type: 'error_log',
        turnNumber: 2,
        error: 'ToolExecutionError',
        message: 'Command timeout after 30s',
        context: 'during shell execution',
        stack: 'Error: Command timeout\n  at execute()',
        timestamp: Date.now(),
      };

      await store.appendErrorLog('error-log-test', errorLog);

      const sessionFile = path.join(testSessionsDir, 'error-log-test.jsonl');
      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      const lastLine = JSON.parse(lines[lines.length - 1]);
      expect(lastLine.type).toBe('error_log');
      expect(lastLine.turnNumber).toBe(2);
      expect(lastLine.error).toBe('ToolExecutionError');
      expect(lastLine.message).toBe('Command timeout after 30s');
      expect(lastLine.context).toBe('during shell execution');
      expect(lastLine.stack).toContain('Error: Command timeout');
    });

    it('appends error log without turn number', async () => {
      const session = createTestSession('error-no-turn-test');
      await store.save(session);

      const errorLog: import('../../src/types/sessions.js').ErrorLogRecord = {
        type: 'error_log',
        error: 'ProviderError',
        message: 'API key invalid',
        timestamp: Date.now(),
      };

      await store.appendErrorLog('error-no-turn-test', errorLog);

      const sessionFile = path.join(testSessionsDir, 'error-no-turn-test.jsonl');
      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      const lastLine = JSON.parse(lines[lines.length - 1]);
      expect(lastLine.type).toBe('error_log');
      expect(lastLine.turnNumber).toBeUndefined();
      expect(lastLine.error).toBe('ProviderError');
    });

    it('appends multiple error logs', async () => {
      const session = createTestSession('multi-error-test');
      await store.save(session);

      const error1: import('../../src/types/sessions.js').ErrorLogRecord = {
        type: 'error_log',
        turnNumber: 1,
        error: 'ValidationError',
        message: 'Invalid parameter',
        timestamp: Date.now(),
      };

      const error2: import('../../src/types/sessions.js').ErrorLogRecord = {
        type: 'error_log',
        turnNumber: 3,
        error: 'NetworkError',
        message: 'Connection timeout',
        timestamp: Date.now(),
      };

      await store.appendErrorLog('multi-error-test', error1);
      await store.appendErrorLog('multi-error-test', error2);

      const sessionFile = path.join(testSessionsDir, 'multi-error-test.jsonl');
      const content = await fs.readFile(sessionFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      const errorRecords = lines
        .map(line => JSON.parse(line))
        .filter(record => record.type === 'error_log');

      expect(errorRecords).toHaveLength(2);
      expect(errorRecords[0].error).toBe('ValidationError');
      expect(errorRecords[1].error).toBe('NetworkError');
    });

    it('throws SessionNotFoundError for non-existent session', async () => {
      const errorLog: import('../../src/types/sessions.js').ErrorLogRecord = {
        type: 'error_log',
        error: 'TestError',
        message: 'Test',
        timestamp: Date.now(),
      };

      await expect(
        store.appendErrorLog('non-existent', errorLog)
      ).rejects.toThrow(SessionNotFoundError);
    });

    it('throws InvalidSessionIdError for invalid session ID', async () => {
      const errorLog: import('../../src/types/sessions.js').ErrorLogRecord = {
        type: 'error_log',
        error: 'TestError',
        message: 'Test',
        timestamp: Date.now(),
      };

      await expect(
        store.appendErrorLog('../etc/passwd', errorLog)
      ).rejects.toThrow(InvalidSessionIdError);
    });
  });

  describe('loadWithTrace', () => {
    it('loads session with turn metadata and error logs', async () => {
      const session = createTestSession('trace-test');
      await store.save(session);

      const metadata: import('../../src/types/sessions.js').TurnMetadataRecord = {
        type: 'turn_metadata',
        turnNumber: 1,
        usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 },
        durationMs: 1200,
        toolCount: 2,
        stopReason: 'tool_use',
        timestamp: Date.now(),
      };

      const errorLog: import('../../src/types/sessions.js').ErrorLogRecord = {
        type: 'error_log',
        turnNumber: 1,
        error: 'ToolExecutionError',
        message: 'Test error',
        timestamp: Date.now(),
      };

      await store.appendTurnMetadata('trace-test', metadata);
      await store.appendErrorLog('trace-test', errorLog);

      const result = await store.loadWithTrace('trace-test');

      expect(result).not.toBeNull();
      expect(result!.session.id).toBe('trace-test');
      expect(result!.turnMetadata).toHaveLength(1);
      expect(result!.errorLogs).toHaveLength(1);
      expect(result!.turnMetadata[0].turnNumber).toBe(1);
      expect(result!.errorLogs[0].error).toBe('ToolExecutionError');
    });

    it('loads session with multiple trace records', async () => {
      const session = createTestSession('multi-trace-test');
      await store.save(session);

      for (let i = 1; i <= 3; i++) {
        const metadata: import('../../src/types/sessions.js').TurnMetadataRecord = {
          type: 'turn_metadata',
          turnNumber: i,
          usage: { promptTokens: 100 * i, completionTokens: 50 * i, totalTokens: 150 * i },
          durationMs: 1000 * i,
          toolCount: i,
          stopReason: 'end_turn',
          timestamp: Date.now(),
        };
        await store.appendTurnMetadata('multi-trace-test', metadata);
      }

      for (let i = 1; i <= 2; i++) {
        const errorLog: import('../../src/types/sessions.js').ErrorLogRecord = {
          type: 'error_log',
          turnNumber: i,
          error: `Error${i}`,
          message: `Test error ${i}`,
          timestamp: Date.now(),
        };
        await store.appendErrorLog('multi-trace-test', errorLog);
      }

      const result = await store.loadWithTrace('multi-trace-test');

      expect(result!.turnMetadata).toHaveLength(3);
      expect(result!.errorLogs).toHaveLength(2);
      expect(result!.turnMetadata[0].turnNumber).toBe(1);
      expect(result!.turnMetadata[2].turnNumber).toBe(3);
    });

    it('loads session with no trace data', async () => {
      const session = createTestSession('no-trace-test');
      await store.save(session);

      const result = await store.loadWithTrace('no-trace-test');

      expect(result).not.toBeNull();
      expect(result!.session.id).toBe('no-trace-test');
      expect(result!.turnMetadata).toHaveLength(0);
      expect(result!.errorLogs).toHaveLength(0);
    });

    it('returns null for non-existent session', async () => {
      const result = await store.loadWithTrace('non-existent');
      expect(result).toBeNull();
    });

    it('throws InvalidSessionIdError for invalid session ID', async () => {
      await expect(store.loadWithTrace('../etc/passwd')).rejects.toThrow(
        InvalidSessionIdError
      );
    });

    it('handles backward compatibility with old sessions', async () => {
      // Create an old-style session without trace records
      const session = createTestSession('old-session');
      await store.save(session);

      const result = await store.loadWithTrace('old-session');

      expect(result).not.toBeNull();
      expect(result!.session.id).toBe('old-session');
      expect(result!.turnMetadata).toHaveLength(0);
      expect(result!.errorLogs).toHaveLength(0);
    });

    it('preserves message order when loading with trace', async () => {
      const messages: ConversationMessage[] = [
        createTestMessage('user', 'First'),
        createTestMessage('assistant', 'Second'),
        createTestMessage('user', 'Third'),
      ];
      const session = createTestSession('order-trace-test', messages);
      await store.save(session);

      const metadata: import('../../src/types/sessions.js').TurnMetadataRecord = {
        type: 'turn_metadata',
        turnNumber: 1,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 1000,
        toolCount: 0,
        stopReason: 'end_turn',
        timestamp: Date.now(),
      };
      await store.appendTurnMetadata('order-trace-test', metadata);

      const result = await store.loadWithTrace('order-trace-test');

      expect(result!.session.messages[0].content).toBe('First');
      expect(result!.session.messages[1].content).toBe('Second');
      expect(result!.session.messages[2].content).toBe('Third');
    });
  });
});

// Helper functions for creating test data

function createTestSession(
  id: string,
  messages: ConversationMessage[] = [createTestMessage('user', 'Test message')]
): Session {
  return {
    id,
    agentId: 'test-agent',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
    messages,
    metadata: {
      model: 'test-model',
      provider: 'anthropic',
      totalTokens: 100,
      toolCallCount: 0,
      turnCount: 1,
    },
  };
}

function createTestMessage(
  role: 'user' | 'assistant',
  content: string
): ConversationMessage {
  const baseMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    content,
    timestamp: Date.now(),
  };

  if (role === 'user') {
    return {
      ...baseMessage,
      role: 'user' as const,
    };
  } else {
    return {
      ...baseMessage,
      role: 'assistant' as const,
      stopReason: 'end_turn' as const,
    };
  }
}

/**
 * Security tests for credential sanitization in session files.
 */
describe('JsonlSessionStore - Security', () => {
  let store: JsonlSessionStore;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `session-security-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    store = new JsonlSessionStore(testDir);
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('save() credential sanitization', () => {
    it('should sanitize credentials in assistant message content before saving', async () => {
      const session: Session = {
        id: 'test-session',
        agentId: 'test-agent',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          createTestMessage('assistant', [
            {
              type: 'text',
              text: 'Here is your API key: sk-ant-api03-test123456789012345678901234567890123456789',
            },
          ]),
        ],
        metadata: {},
      };

      await store.save(session);
      const loaded = await store.load('test-session');

      expect(loaded).not.toBeNull();
      const assistantMsg = loaded!.messages[0];
      if (assistantMsg.role === 'assistant') {
        const textContent = assistantMsg.content.find(c => c.type === 'text');
        if (textContent && textContent.type === 'text') {
          expect(textContent.text).toContain('***REDACTED***');
          expect(textContent.text).not.toContain('sk-ant-api03');
        }
      }
    });

    it('should sanitize credentials in tool result messages before saving', async () => {
      const session: Session = {
        id: 'test-session',
        agentId: 'test-agent',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                toolCallId: 'test-call',
                output: 'API Key: sk-proj-test123456789012345678901234567890123456789',
                success: true,
              },
            ],
          },
        ],
        metadata: {},
      };

      await store.save(session);
      const loaded = await store.load('test-session');

      expect(loaded).not.toBeNull();
      const userMsg = loaded!.messages[0];
      if (userMsg.role === 'user') {
        const toolResult = userMsg.content.find(c => c.type === 'tool_result');
        if (toolResult && toolResult.type === 'tool_result') {
          expect(toolResult.output).toContain('***REDACTED***');
          expect(toolResult.output).not.toContain('sk-proj');
        }
      }
    });

    it('should preserve non-sensitive content', async () => {
      const session: Session = {
        id: 'test-session',
        agentId: 'test-agent',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          createTestMessage('assistant', [
            {
              type: 'text',
              text: 'This is normal text without credentials',
            },
          ]),
        ],
        metadata: {},
      };

      await store.save(session);
      const loaded = await store.load('test-session');

      expect(loaded).not.toBeNull();
      const assistantMsg = loaded!.messages[0];
      if (assistantMsg.role === 'assistant') {
        const textContent = assistantMsg.content.find(c => c.type === 'text');
        if (textContent && textContent.type === 'text') {
          expect(textContent.text).toBe('This is normal text without credentials');
          expect(textContent.text).not.toContain('***REDACTED***');
        }
      }
    });

    it('should handle messages without credentials', async () => {
      const session: Session = {
        id: 'test-session',
        agentId: 'test-agent',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          createTestMessage('user', [{ type: 'text', text: 'Hello' }]),
          createTestMessage('assistant', [{ type: 'text', text: 'Hi there!' }]),
        ],
        metadata: {},
      };

      await store.save(session);
      const loaded = await store.load('test-session');

      expect(loaded).not.toBeNull();
      expect(loaded!.messages).toHaveLength(2);
      expect(loaded!.messages[0].content[0]).toEqual({ type: 'text', text: 'Hello' });
    });
  });

  describe('appendMessage() credential sanitization', () => {
    it('should sanitize credentials in appended messages', async () => {
      const session: Session = {
        id: 'test-session',
        agentId: 'test-agent',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          createTestMessage('user', [{ type: 'text', text: 'Initial message' }]),
        ],
        metadata: {},
      };

      await store.save(session);

      const newMessage = createTestMessage('assistant', [
        {
          type: 'text',
          text: 'Your GitHub token is ghp_test123456789012345678901234567890',
        },
      ]);

      await store.appendMessage('test-session', newMessage);
      const loaded = await store.load('test-session');

      expect(loaded).not.toBeNull();
      expect(loaded!.messages).toHaveLength(2);
      const appendedMsg = loaded!.messages[1];
      if (appendedMsg.role === 'assistant') {
        const textContent = appendedMsg.content.find(c => c.type === 'text');
        if (textContent && textContent.type === 'text') {
          expect(textContent.text).toContain('***REDACTED***');
          expect(textContent.text).not.toContain('ghp_');
        }
      }
    });

    it('should sanitize multiple credentials in tool results', async () => {
      const session: Session = {
        id: 'test-session',
        agentId: 'test-agent',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        metadata: {},
      };

      await store.save(session);

      const toolResultMessage: ConversationMessage = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolCallId: 'env-call',
            output: 'ANTHROPIC_API_KEY=sk-ant-api03-test123456789012345678901234567890123456789\nOPENAI_API_KEY=sk-proj-test123456789012345678901234567890123456789',
            success: true,
          },
        ],
      };

      await store.appendMessage('test-session', toolResultMessage);
      const loaded = await store.load('test-session');

      expect(loaded).not.toBeNull();
      const msg = loaded!.messages[0];
      if (msg.role === 'user') {
        const toolResult = msg.content.find(c => c.type === 'tool_result');
        if (toolResult && toolResult.type === 'tool_result') {
          expect(toolResult.output).toContain('***REDACTED***');
          expect(toolResult.output).not.toContain('sk-ant-api03');
          expect(toolResult.output).not.toContain('sk-proj');
        }
      }
    });
  });
});

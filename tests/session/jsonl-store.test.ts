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
import { existsSync } from 'fs';

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

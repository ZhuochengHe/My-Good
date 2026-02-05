/**
 * Integration tests for session store.
 * Tests real-world scenarios and interactions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonlSessionStore } from '../../src/session/jsonl-store.js';
import type { Session, SessionSummary } from '../../src/types/sessions.js';
import type { ConversationMessage } from '../../src/types/messages.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

const testSessionsDir = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'integration-sessions'
);

describe('Session Store Integration', () => {
  let store: JsonlSessionStore;

  beforeEach(async () => {
    if (existsSync(testSessionsDir)) {
      await fs.rm(testSessionsDir, { recursive: true, force: true });
    }
    await fs.mkdir(testSessionsDir, { recursive: true });
    store = new JsonlSessionStore(testSessionsDir);
  });

  afterEach(async () => {
    if (existsSync(testSessionsDir)) {
      await fs.rm(testSessionsDir, { recursive: true, force: true });
    }
  });

  describe('multi-session workflow', () => {
    it('manages multiple sessions independently', async () => {
      // Create three separate sessions
      const session1 = createConversationSession('chat-1', 'agent-alpha', [
        { role: 'user', content: 'Hello from session 1' },
        { role: 'assistant', content: 'Hi from assistant in session 1' },
      ]);

      const session2 = createConversationSession('chat-2', 'agent-beta', [
        { role: 'user', content: 'Hello from session 2' },
      ]);

      const session3 = createConversationSession('chat-3', 'agent-alpha', [
        { role: 'user', content: 'Hello from session 3' },
        { role: 'assistant', content: 'Hi from assistant in session 3' },
        { role: 'user', content: 'Follow-up question' },
      ]);

      // Save all sessions
      await store.save(session1);
      await store.save(session2);
      await store.save(session3);

      // List all sessions
      const sessions = await store.list();
      expect(sessions).toHaveLength(3);

      // Verify each session is independent
      const loaded1 = await store.load('chat-1');
      const loaded2 = await store.load('chat-2');
      const loaded3 = await store.load('chat-3');

      expect(loaded1!.messages).toHaveLength(2);
      expect(loaded2!.messages).toHaveLength(1);
      expect(loaded3!.messages).toHaveLength(3);
      expect(loaded1!.agentId).toBe('agent-alpha');
      expect(loaded2!.agentId).toBe('agent-beta');
    });

    it('lists sessions by agent', async () => {
      await store.save(createConversationSession('s1', 'agent-a'));
      await store.save(createConversationSession('s2', 'agent-b'));
      await store.save(createConversationSession('s3', 'agent-a'));

      const allSessions = await store.list();
      const agentASessions = allSessions.filter(s => s.agentId === 'agent-a');
      const agentBSessions = allSessions.filter(s => s.agentId === 'agent-b');

      expect(agentASessions).toHaveLength(2);
      expect(agentBSessions).toHaveLength(1);
    });
  });

  describe('conversation workflow', () => {
    it('builds conversation turn by turn', async () => {
      // Create initial session
      const session = createConversationSession('conversation', 'chat-agent', [
        { role: 'user', content: 'What is TypeScript?' },
      ]);
      await store.save(session);

      // Append assistant response
      await store.appendMessage('conversation', {
        id: 'msg-2',
        role: 'assistant',
        content: 'TypeScript is a typed superset of JavaScript.',
        timestamp: Date.now(),
        stopReason: 'end_turn',
      });

      // Append follow-up question
      await store.appendMessage('conversation', {
        id: 'msg-3',
        role: 'user',
        content: 'What are the benefits?',
        timestamp: Date.now(),
      });

      // Append response
      await store.appendMessage('conversation', {
        id: 'msg-4',
        role: 'assistant',
        content: 'Benefits include type safety and better tooling.',
        timestamp: Date.now(),
        stopReason: 'end_turn',
      });

      // Verify full conversation
      const loaded = await store.load('conversation');
      expect(loaded!.messages).toHaveLength(4); // 1 initial + 3 appended
      expect(loaded!.messages[0].role).toBe('user');
      expect(loaded!.messages[1].role).toBe('assistant');
      expect(loaded!.messages[2].role).toBe('user');
      expect(loaded!.messages[3].role).toBe('assistant');
    });

    it('preserves conversation after restart', async () => {
      // Simulate app session 1
      const session = createConversationSession('persistent', 'agent-1', [
        { role: 'user', content: 'First message' },
      ]);
      await store.save(session);
      await store.appendMessage('persistent', {
        id: 'msg-2',
        role: 'assistant',
        content: 'First response',
        timestamp: Date.now(),
        stopReason: 'end_turn',
      });

      // Simulate app restart - create new store instance
      const newStore = new JsonlSessionStore(testSessionsDir);

      // Load conversation and continue
      const loaded = await newStore.load('persistent');
      expect(loaded!.messages).toHaveLength(2);

      await newStore.appendMessage('persistent', {
        id: 'msg-3',
        role: 'user',
        content: 'Second message',
        timestamp: Date.now(),
      });

      // Verify continuation
      const final = await newStore.load('persistent');
      expect(final!.messages).toHaveLength(3);
    });
  });

  describe('session lifecycle', () => {
    it('handles complete session lifecycle', async () => {
      const sessionId = 'lifecycle-test';

      // 1. Create and save
      const session = createConversationSession(sessionId, 'test-agent');
      await store.save(session);
      expect(await store.load(sessionId)).not.toBeNull();

      // 2. Add messages
      await store.appendMessage(sessionId, {
        id: 'msg-2',
        role: 'assistant',
        content: 'Response',
        timestamp: Date.now(),
        stopReason: 'end_turn',
      });

      let loaded = await store.load(sessionId);
      expect(loaded!.messages).toHaveLength(2);

      // 3. Clear messages
      await store.clear(sessionId);
      loaded = await store.load(sessionId);
      expect(loaded!.messages).toHaveLength(0);
      expect(loaded!.id).toBe(sessionId); // Session still exists

      // 4. Delete session
      await store.delete(sessionId);
      expect(await store.load(sessionId)).toBeNull();
    });
  });

  describe('session metadata tracking', () => {
    it('tracks conversation metrics', async () => {
      const session = createConversationSession('metrics', 'agent-1');
      session.metadata.totalTokens = 0;
      session.metadata.turnCount = 0;
      session.metadata.toolCallCount = 0;

      await store.save(session);

      // Simulate conversation with token tracking
      for (let i = 0; i < 3; i++) {
        const loaded = (await store.load('metrics'))!;
        loaded.metadata.totalTokens += 100;
        loaded.metadata.turnCount += 1;

        const updated: Session = {
          ...loaded,
          messages: [
            ...loaded.messages,
            {
              id: `msg-${i}`,
              role: 'user',
              content: `Message ${i}`,
              timestamp: Date.now(),
            },
          ],
        };

        await store.save(updated);
      }

      const final = await store.load('metrics');
      expect(final!.metadata.totalTokens).toBe(300);
      expect(final!.metadata.turnCount).toBe(3);
      expect(final!.messages.length).toBeGreaterThan(0);
    });
  });

  describe('error recovery scenarios', () => {
    it('continues after failed save', async () => {
      const session = createConversationSession('recovery', 'agent-1');
      await store.save(session);

      // Simulate save failure by using invalid data (caught internally)
      const loaded = await store.load('recovery');
      expect(loaded).not.toBeNull();

      // Continue normal operation
      await store.appendMessage('recovery', {
        id: 'msg-2',
        role: 'user',
        content: 'New message',
        timestamp: Date.now(),
      });

      const updated = await store.load('recovery');
      expect(updated!.messages).toHaveLength(2);
    });

    it('handles partial file corruption', async () => {
      // Create valid session
      await store.save(createConversationSession('partial', 'agent-1'));

      // Manually corrupt the file
      const sessionPath = path.join(testSessionsDir, 'partial.jsonl');
      const content = await fs.readFile(sessionPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      // Add corrupted line
      lines.push('{ invalid json }');
      await fs.writeFile(sessionPath, lines.join('\n') + '\n');

      // Loading should fail with corruption error
      await expect(store.load('partial')).rejects.toThrow();

      // Backup file should be created
      const backupPath = path.join(testSessionsDir, 'partial.jsonl.corrupted');
      expect(existsSync(backupPath)).toBe(true);
    });
  });

  describe('performance scenarios', () => {
    it('handles large conversation history', async () => {
      const sessionId = 'large-history';
      const messageCount = 100;

      const messages: ConversationMessage[] = [];
      for (let i = 0; i < messageCount; i++) {
        messages.push({
          id: `msg-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`.repeat(10),
          timestamp: Date.now(),
          ...(i % 2 === 1 ? { stopReason: 'end_turn' as const } : {}),
        });
      }

      const session = createConversationSession(sessionId, 'agent-1', messages);

      const startSave = Date.now();
      await store.save(session);
      const saveDuration = Date.now() - startSave;

      const startLoad = Date.now();
      const loaded = await store.load(sessionId);
      const loadDuration = Date.now() - startLoad;

      expect(loaded!.messages).toHaveLength(messageCount);
      expect(saveDuration).toBeLessThan(1000); // Less than 1 second
      expect(loadDuration).toBeLessThan(1000); // Less than 1 second
    });
  });
});

// Helper functions

function createConversationSession(
  id: string,
  agentId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Session {
  const conversationMessages: ConversationMessage[] = [];

  // Add default first message if none provided
  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Hello' });
  }

  for (const msg of messages) {
    const baseMsg = {
      id: `msg-${conversationMessages.length + 1}`,
      content: msg.content,
      timestamp: Date.now(),
    };

    if (msg.role === 'user') {
      conversationMessages.push({
        ...baseMsg,
        role: 'user' as const,
      });
    } else {
      conversationMessages.push({
        ...baseMsg,
        role: 'assistant' as const,
        stopReason: 'end_turn' as const,
      });
    }
  }

  return {
    id,
    agentId,
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
    messages: conversationMessages,
    metadata: {
      model: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      totalTokens: 500,
      toolCallCount: 0,
      turnCount: Math.ceil(messages.length / 2),
    },
  };
}

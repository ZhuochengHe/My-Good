/**
 * Tests for event emitter implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter as EventEmitterImpl } from '../../src/events/emitter.js';
import type {
  AgentEvent,
  AgentStartEvent,
  ToolCallStartEvent,
  ErrorEvent,
  EventSubscriber,
} from '../../src/types/events.js';

describe('EventEmitter', () => {
  let emitter: EventEmitterImpl;

  beforeEach(() => {
    emitter = new EventEmitterImpl();
  });

  describe('subscribe', () => {
    it('returns unsubscribe function', () => {
      const subscriber: EventSubscriber = { onEvent: vi.fn() };

      const unsubscribe = emitter.subscribe(subscriber);

      expect(unsubscribe).toBeTypeOf('function');
    });

    it('allows multiple subscribers', async () => {
      const subscriber1: EventSubscriber = { onEvent: vi.fn() };
      const subscriber2: EventSubscriber = { onEvent: vi.fn() };

      emitter.subscribe(subscriber1);
      emitter.subscribe(subscriber2);

      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      await emitter.emit(event);

      expect(subscriber1.onEvent).toHaveBeenCalledWith(event);
      expect(subscriber2.onEvent).toHaveBeenCalledWith(event);
    });
  });

  describe('emit', () => {
    it('calls all subscribers sequentially', async () => {
      const callOrder: number[] = [];
      const subscriber1: EventSubscriber = {
        onEvent: vi.fn(() => callOrder.push(1)),
      };
      const subscriber2: EventSubscriber = {
        onEvent: vi.fn(() => callOrder.push(2)),
      };

      emitter.subscribe(subscriber1);
      emitter.subscribe(subscriber2);

      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      await emitter.emit(event);

      expect(callOrder).toEqual([1, 2]);
      expect(subscriber1.onEvent).toHaveBeenCalledTimes(1);
      expect(subscriber2.onEvent).toHaveBeenCalledTimes(1);
    });

    it('passes event to all subscribers', async () => {
      const subscriber1: EventSubscriber = { onEvent: vi.fn() };
      const subscriber2: EventSubscriber = { onEvent: vi.fn() };

      emitter.subscribe(subscriber1);
      emitter.subscribe(subscriber2);

      const event: ToolCallStartEvent = {
        type: 'tool_call_start',
        toolCall: {
          id: 'tc_001',
          name: 'read_file',
          arguments: { path: 'test.txt' },
        },
        timestamp: Date.now(),
      };

      await emitter.emit(event);

      expect(subscriber1.onEvent).toHaveBeenCalledWith(event);
      expect(subscriber2.onEvent).toHaveBeenCalledWith(event);
      expect(subscriber1.onEvent).toHaveBeenCalledTimes(1);
      expect(subscriber2.onEvent).toHaveBeenCalledTimes(1);
    });

    it('does not throw with empty subscribers list', async () => {
      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      await expect(emitter.emit(event)).resolves.not.toThrow();
    });

    it('handles multiple events to same subscriber', async () => {
      const subscriber: EventSubscriber = { onEvent: vi.fn() };

      emitter.subscribe(subscriber);

      const event1: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'session-1',
        timestamp: Date.now(),
      };
      const event2: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'session-2',
        timestamp: Date.now(),
      };

      await emitter.emit(event1);
      await emitter.emit(event2);

      expect(subscriber.onEvent).toHaveBeenCalledTimes(2);
      expect(subscriber.onEvent).toHaveBeenNthCalledWith(1, event1);
      expect(subscriber.onEvent).toHaveBeenNthCalledWith(2, event2);
    });
  });

  describe('unsubscribe', () => {
    it('removes only that subscriber', async () => {
      const subscriber1: EventSubscriber = { onEvent: vi.fn() };
      const subscriber2: EventSubscriber = { onEvent: vi.fn() };

      const unsubscribe1 = emitter.subscribe(subscriber1);
      emitter.subscribe(subscriber2);

      unsubscribe1();

      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      await emitter.emit(event);

      expect(subscriber1.onEvent).not.toHaveBeenCalled();
      expect(subscriber2.onEvent).toHaveBeenCalledWith(event);
    });

    it('is safe to call multiple times', async () => {
      const subscriber: EventSubscriber = { onEvent: vi.fn() };

      const unsubscribe = emitter.subscribe(subscriber);

      unsubscribe();
      unsubscribe();

      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      await expect(emitter.emit(event)).resolves.not.toThrow();
      expect(subscriber.onEvent).not.toHaveBeenCalled();
    });

    it('does not affect other subscribers when called', async () => {
      const subscriber1: EventSubscriber = { onEvent: vi.fn() };
      const subscriber2: EventSubscriber = { onEvent: vi.fn() };
      const subscriber3: EventSubscriber = { onEvent: vi.fn() };

      const unsubscribe1 = emitter.subscribe(subscriber1);
      emitter.subscribe(subscriber2);
      emitter.subscribe(subscriber3);

      unsubscribe1();

      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      await emitter.emit(event);

      expect(subscriber1.onEvent).not.toHaveBeenCalled();
      expect(subscriber2.onEvent).toHaveBeenCalledWith(event);
      expect(subscriber3.onEvent).toHaveBeenCalledWith(event);
    });
  });

  describe('async subscribers', () => {
    it('handles async subscribers correctly', async () => {
      const results: string[] = [];
      const asyncSubscriber: EventSubscriber = {
        onEvent: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push('async');
        }),
      };
      const syncSubscriber: EventSubscriber = {
        onEvent: vi.fn(() => {
          results.push('sync');
        }),
      };

      emitter.subscribe(asyncSubscriber);
      emitter.subscribe(syncSubscriber);

      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      // Await emit to ensure ordering
      await emitter.emit(event);

      // Both subscribers should be called and completed
      expect(asyncSubscriber.onEvent).toHaveBeenCalled();
      expect(syncSubscriber.onEvent).toHaveBeenCalled();

      // Results should be in subscription order: async first, then sync
      expect(results).toEqual(['async', 'sync']);
    });
  });

  describe('error handling', () => {
    it('continues to other subscribers if one throws', async () => {
      const errorSubscriber: EventSubscriber = {
        onEvent: vi.fn(() => {
          throw new Error('Subscriber error');
        }),
      };
      const successSubscriber: EventSubscriber = {
        onEvent: vi.fn(),
      };

      emitter.subscribe(errorSubscriber);
      emitter.subscribe(successSubscriber);

      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      // Should not throw despite subscriber error
      await expect(emitter.emit(event)).resolves.not.toThrow();

      expect(errorSubscriber.onEvent).toHaveBeenCalled();
      expect(successSubscriber.onEvent).toHaveBeenCalled();
    });

    it('handles errors from subscribers without throwing', async () => {
      const errorSubscriber: EventSubscriber = {
        onEvent: vi.fn(() => {
          throw new Error('Subscriber error');
        }),
      };

      const normalSubscriber: EventSubscriber = {
        onEvent: vi.fn(),
      };

      emitter.subscribe(errorSubscriber);
      emitter.subscribe(normalSubscriber);

      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      // Should not throw
      await expect(emitter.emit(event)).resolves.not.toThrow();

      // Normal subscriber should still be called
      expect(normalSubscriber.onEvent).toHaveBeenCalledWith(event);
    });
  });

  describe('subscriber order', () => {
    it('calls subscribers in subscription order', async () => {
      const callOrder: number[] = [];
      const subscribers = [1, 2, 3, 4, 5].map((num) => ({
        onEvent: vi.fn(() => callOrder.push(num)),
      }));

      subscribers.forEach((sub) => emitter.subscribe(sub));

      const event: AgentStartEvent = {
        type: 'agent_start',
        sessionId: 'test-session',
        timestamp: Date.now(),
      };

      await emitter.emit(event);

      expect(callOrder).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

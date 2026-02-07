/**
 * Event emitter implementation.
 *
 * Manages event subscriptions and emission for agent lifecycle events.
 * All events are emitted synchronously in subscription order.
 */

import type { AgentEvent, EventSubscriber, EventEmitter as IEventEmitter } from '../types/events.js';

/**
 * Event emitter for agent lifecycle events.
 */
export class EventEmitter implements IEventEmitter {
  private subscribers: EventSubscriber[] = [];

  /**
   * Subscribe to events.
   * Returns an unsubscribe function.
   */
  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.push(subscriber);

    // Return unsubscribe function
    return () => {
      const index = this.subscribers.indexOf(subscriber);
      if (index !== -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event to all subscribers.
   * Subscribers are called sequentially in subscription order.
   * Awaits async subscribers to maintain event ordering.
   * If a subscriber throws, the error is logged and execution continues.
   */
  async emit(event: AgentEvent): Promise<void> {
    // Call subscribers in order, awaiting each one
    for (const subscriber of this.subscribers) {
      try {
        const result = subscriber.onEvent(event);
        // Await if subscriber is async to maintain ordering
        if (result instanceof Promise) {
          await result;
        }
      } catch (error) {
        // Log error but continue to other subscribers
        const errorMessage = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error('Error in event subscriber:', errorMessage);
      }
    }
  }
}

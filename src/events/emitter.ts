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
   * Subscribers are called synchronously in subscription order.
   * If a subscriber throws, the error is logged and execution continues.
   */
  emit(event: AgentEvent): void {
    // Call subscribers in order
    for (const subscriber of this.subscribers) {
      try {
        subscriber.onEvent(event);
      } catch (error) {
        // Log error but continue to other subscribers
        console.error('Error in event subscriber:', error);
      }
    }
  }
}

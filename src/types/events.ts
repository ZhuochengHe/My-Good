/**
 * Event type definitions for the agent lifecycle.
 */

import type { ToolResult } from './tools.js';
import type { ToolCall } from './messages.js';
import type { TokenUsage } from './providers.js';
import type { AgentError, AgentRunResult } from './agent.js';

/** Agent start event */
export interface AgentStartEvent {
  readonly type: 'agent_start';
  readonly sessionId: string;
  readonly timestamp: number;
}

/** Turn start event */
export interface TurnStartEvent {
  readonly type: 'turn_start';
  readonly turnNumber: number;
  readonly timestamp: number;
}

/** Text delta event for streaming */
export interface TextDeltaEvent {
  readonly type: 'text_delta';
  readonly delta: string;
}

/** Tool call start event */
export interface ToolCallStartEvent {
  readonly type: 'tool_call_start';
  readonly toolCall: ToolCall;
  readonly timestamp: number;
}

/** Tool call end event */
export interface ToolCallEndEvent {
  readonly type: 'tool_call_end';
  readonly result: ToolResult;
  readonly timestamp: number;
}

/** Turn end event */
export interface TurnEndEvent {
  readonly type: 'turn_end';
  readonly turnNumber: number;
  readonly usage: TokenUsage;
  readonly timestamp: number;
}

/** Agent end event */
export interface AgentEndEvent {
  readonly type: 'agent_end';
  readonly result: AgentRunResult;
  readonly timestamp: number;
}

/** Error event */
export interface ErrorEvent {
  readonly type: 'error';
  readonly error: AgentError;
  readonly timestamp: number;
}

/** Union type for all agent events */
export type AgentEvent =
  | AgentStartEvent
  | TurnStartEvent
  | TextDeltaEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | TurnEndEvent
  | AgentEndEvent
  | ErrorEvent;

/** Event type string literals */
export type AgentEventType = AgentEvent['type'];

/** Event subscriber interface */
export interface EventSubscriber {
  onEvent(event: AgentEvent): void | Promise<void>;
}

/** Event emitter interface */
export interface EventEmitter {
  /**
   * Subscribe to events.
   */
  subscribe(subscriber: EventSubscriber): () => void;

  /**
   * Emit an event to all subscribers.
   * Awaits async subscribers to maintain event ordering.
   */
  emit(event: AgentEvent): Promise<void>;
}

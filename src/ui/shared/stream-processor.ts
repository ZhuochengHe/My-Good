/**
 * Converts raw AgentEvents emitted by the agent execution loop into
 * ChatActions that can be dispatched to chatReducer.
 *
 * This module is the bridge between the agent event stream and the pure
 * UI state layer. It has no side effects and no Node.js dependencies.
 *
 * WEB-SAFE BOUNDARY: this file must never import Node.js built-ins or
 * any package that depends on them. It is designed to be importable
 * from web frontends as well as the Ink TUI.
 */

import type { AgentEvent } from '../../types/events.js';
import type { ChatAction } from './chat-state.js';

/**
 * Maps a single AgentEvent to the corresponding ChatAction, or null when
 * the event carries no UI-visible information (e.g. lifecycle bookmarks).
 *
 * Mapping table:
 * - text_delta       -> { type: 'text_delta', delta }
 * - tool_call_start  -> { type: 'tool_start', toolName, args }
 * - tool_call_end    -> { type: 'tool_end' }
 * - agent_end        -> { type: 'agent_end', usage }
 * - error            -> { type: 'error', message }
 * - agent_start, turn_start, turn_end -> null
 *
 * @param event - An AgentEvent emitted during an agent run.
 * @returns A ChatAction to dispatch, or null if the event is silent.
 */
export function agentEventToAction(event: AgentEvent): ChatAction | null {
  switch (event.type) {
    case 'text_delta':
      return { type: 'text_delta', delta: event.delta };

    case 'tool_call_start':
      return {
        type: 'tool_start',
        toolName: event.toolCall.name,
        args: event.toolCall.arguments,
      };

    case 'tool_call_end':
      return {
        type: 'tool_end',
        output: event.result.output,
        success: event.result.success,
      };

    case 'agent_end':
      return { type: 'agent_end', usage: event.result.usage };

    case 'error':
      return { type: 'error', message: event.error.message };

    case 'agent_start':
    case 'turn_start':
    case 'turn_end':
      return null;
  }
}

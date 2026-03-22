/**
 * Hook that integrates SessionManager.streamRun with chatReducer.
 *
 * Manages the lifecycle of an agent run: dispatching user messages,
 * consuming the event stream, and updating ChatState via useReducer.
 * Exposes a submit function that callers invoke to start a new turn.
 */

import { useReducer, useCallback, useRef } from 'react';
import type { SessionManager } from '../../../session/session-manager.js';
import {
  chatReducer,
  INITIAL_CHAT_STATE,
  type ChatState,
  type ChatAction,
} from '../../shared/chat-state.js';
import { agentEventToAction } from '../../shared/stream-processor.js';

/**
 * Options for useStreamingSession.
 */
export interface UseStreamingSessionOptions {
  /** The session manager used to run and stream agent turns. */
  readonly sessionManager: SessionManager;
  /** The active session ID. */
  readonly sessionId: string;
}

/**
 * Result returned by useStreamingSession.
 */
export interface UseStreamingSessionResult {
  /** Current immutable chat state. */
  readonly state: ChatState;
  /** Whether a streaming turn is currently in progress. */
  readonly isStreaming: boolean;
  /** Submit a user message to start a new agent turn. */
  readonly submit: (input: string) => void;
  /** Dispatch a ChatAction directly (e.g. confirm_tool, reset_turn). */
  readonly dispatch: (action: ChatAction) => void;
}

/**
 * Hook that streams agent runs and maintains ChatState.
 *
 * Calls {@link SessionManager.streamRun} for each submitted message,
 * mapping each {@link AgentEvent} to a {@link ChatAction} via
 * {@link agentEventToAction} and dispatching it to the local reducer.
 *
 * @param options - Hook configuration.
 * @returns Streaming session state and controls.
 *
 * @example
 * const { state, submit } = useStreamingSession({ sessionManager, sessionId });
 * // User submits a message:
 * submit('Hello');
 */
export function useStreamingSession(
  options: UseStreamingSessionOptions
): UseStreamingSessionResult {
  const { sessionManager, sessionId } = options;

  const [state, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const isStreamingRef = useRef(false);

  const submit = useCallback(
    (input: string): void => {
      if (isStreamingRef.current) return;
      isStreamingRef.current = true;

      dispatch({ type: 'user_message', text: input });

      void (async () => {
        try {
          for await (const event of sessionManager.streamRun(sessionId, input)) {
            const action = agentEventToAction(event);
            if (action !== null) {
              dispatch(action);
            }
          }
        } catch (err) {
          dispatch({
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          isStreamingRef.current = false;
        }
      })();
    },
    [sessionManager, sessionId]
  );

  return {
    state,
    isStreaming: isStreamingRef.current,
    submit,
    dispatch,
  };
}

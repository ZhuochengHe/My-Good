/**
 * Hook that integrates SessionManager.streamRun with chatReducer.
 *
 * Manages the lifecycle of an agent run: dispatching user messages,
 * consuming the event stream, and updating ChatState via useReducer.
 * Exposes a submit function that callers invoke to start a new turn,
 * and a compact function to summarize conversation history.
 */

import { useReducer, useCallback, useRef, useState } from 'react';
import type { SessionManager } from '../../../session/session-manager.js';
import {
  chatReducer,
  INITIAL_CHAT_STATE,
  type ChatState,
  type ChatAction,
} from '../../shared/chat-state.js';
import { agentEventToAction } from '../../shared/stream-processor.js';

/** Token threshold that activates the context warning (~50% of 200k default). */
const CONTEXT_WINDOW_COMPACT_THRESHOLD = 100000;

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
  /** Abort the current streaming turn and return control to the user. */
  readonly abort: () => void;
  /** Dispatch a ChatAction directly (e.g. confirm_tool, reset_turn). */
  readonly dispatch: (action: ChatAction) => void;
  /** Compact the conversation. Resolves with summary or error message. */
  readonly compact: (instructions?: string) => Promise<string>;
}

/**
 * Hook that streams agent runs and maintains ChatState.
 *
 * Calls {@link SessionManager.streamRun} for each submitted message,
 * mapping each AgentEvent to a ChatAction via agentEventToAction and
 * dispatching it to the local reducer. Monitors token usage to set the
 * contextWarning flag when the threshold is crossed.
 *
 * @param options - Hook configuration.
 * @returns Streaming session state and controls.
 *
 * @example
 * const { state, submit } = useStreamingSession({ sessionManager, sessionId });
 * submit('Hello');
 */
export function useStreamingSession(
  options: UseStreamingSessionOptions
): UseStreamingSessionResult {
  const { sessionManager, sessionId } = options;

  const [state, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback((): void => {
    if (!isStreamingRef.current) return;
    abortControllerRef.current?.abort();
  }, []);

  const submit = useCallback(
    (input: string): void => {
      if (isStreamingRef.current) return;
      isStreamingRef.current = true;
      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      dispatch({ type: 'user_message', text: input });

      void (async (): Promise<void> => {
        try {
          for await (const event of sessionManager.streamRun(sessionId, input, controller.signal)) {
            const action = agentEventToAction(event);
            if (action !== null) {
              dispatch(action);
            }

            // Check context warning after agent_end
            if (event.type === 'agent_end') {
              const estimated = sessionManager.estimatePromptTokens(sessionId);
              const warning = estimated >= CONTEXT_WINDOW_COMPACT_THRESHOLD;
              dispatch({ type: 'context_warning', active: warning });
            }
          }
        } catch (err) {
          dispatch({
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          isStreamingRef.current = false;
          abortControllerRef.current = null;
          setIsStreaming(false);
        }
      })();
    },
    [sessionManager, sessionId]
  );

  const compact = useCallback(
    async (instructions?: string): Promise<string> => {
      try {
        const summary = await sessionManager.compact(sessionId, instructions);
        dispatch({ type: 'reset_turn' });
        return summary;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'error', message: `Compact failed: ${message}` });
        return `Compact failed: ${message}`;
      }
    },
    [sessionManager, sessionId]
  );

  return {
    state,
    isStreaming,
    submit,
    abort,
    dispatch,
    compact,
  };
}

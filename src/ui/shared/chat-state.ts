/**
 * Pure shared chat state for the Ink TUI layer.
 *
 * Contains the ChatState interface, ChatAction discriminated union,
 * INITIAL_CHAT_STATE constant, and the chatReducer pure function.
 * No Node.js dependencies — safe to import in any renderer.
 */

import type { TokenUsage } from '../../types/providers.js';

/** Lifecycle phase of a single agent turn. */
export type ChatPhase =
  | 'idle'
  | 'streaming_text'
  | 'tool_call'
  | 'complete'
  | 'error';

/**
 * A single fully-rendered chat message shown in the transcript.
 * Role 'user' for human input, 'agent' for assistant responses.
 */
export interface RenderedMessage {
  readonly role: 'user' | 'agent';
  readonly text: string;
  readonly tokenUsage?: TokenUsage;
}

/**
 * Immutable snapshot of all chat UI state for one session.
 * Consumed by the Ink renderer; produced exclusively by chatReducer.
 */
export interface ChatState {
  /** Current lifecycle phase. */
  readonly phase: ChatPhase;
  /** Fully-committed messages shown in the transcript. */
  readonly messages: readonly RenderedMessage[];
  /** Buffered text not yet committed to messages. */
  readonly pendingText: string;
  /** Name of the tool currently executing, or null. */
  readonly activeToolName: string | null;
  /** Token usage from the most recently completed agent turn. */
  readonly lastTokenUsage: TokenUsage | null;
  /** Human-readable error description, or null when healthy. */
  readonly errorMessage: string | null;
  /** True when the model's context window is nearing its limit. */
  readonly contextWarning: boolean;
  /** Pending tool confirmation gate, or null when none is active. */
  readonly awaitingConfirmation: { toolName: string; args: unknown } | null;
}

/**
 * Discriminated union of every action that can mutate ChatState.
 *
 * Actions are dispatched by the stream-processor layer and by direct
 * user interactions (e.g. confirmation prompts).
 */
export type ChatAction =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; toolName: string; args: unknown }
  | { type: 'tool_end' }
  | { type: 'agent_end'; usage: TokenUsage }
  | { type: 'user_message'; text: string }
  | { type: 'confirm_tool'; approved: boolean }
  | { type: 'error'; message: string }
  | { type: 'reset_turn' };

/**
 * The initial state when a chat session first opens.
 * All collections are empty and the phase is idle.
 */
export const INITIAL_CHAT_STATE: ChatState = {
  phase: 'idle',
  messages: [],
  pendingText: '',
  activeToolName: null,
  lastTokenUsage: null,
  errorMessage: null,
  contextWarning: false,
  awaitingConfirmation: null,
};

/**
 * Pure reducer that produces the next ChatState given the current state
 * and a dispatched action.
 *
 * Follows the Red-Green-Refactor TDD contract: all branches are covered by
 * tests in tests/ui/shared/chat-state.test.ts.
 *
 * @param state - The current immutable chat state.
 * @param action - The action to apply.
 * @returns A new ChatState reflecting the action; the original is never mutated.
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'text_delta':
      return {
        ...state,
        phase: 'streaming_text',
        pendingText: state.pendingText + action.delta,
      };

    case 'tool_start':
      return {
        ...state,
        phase: 'tool_call',
        pendingText: '',
        activeToolName: action.toolName,
        awaitingConfirmation: { toolName: action.toolName, args: action.args },
      };

    case 'tool_end':
      return {
        ...state,
        phase: 'streaming_text',
        activeToolName: null,
        awaitingConfirmation: null,
      };

    case 'agent_end': {
      const flushedMessages: readonly RenderedMessage[] =
        state.pendingText.length > 0
          ? [
              ...state.messages,
              {
                role: 'agent' as const,
                text: state.pendingText,
                tokenUsage: action.usage,
              },
            ]
          : state.messages;

      return {
        ...state,
        phase: 'complete',
        messages: flushedMessages,
        pendingText: '',
        lastTokenUsage: action.usage,
      };
    }

    case 'user_message':
      return {
        ...state,
        phase: 'idle',
        messages: [
          ...state.messages,
          { role: 'user' as const, text: action.text },
        ],
        errorMessage: null,
      };

    case 'confirm_tool':
      return {
        ...state,
        awaitingConfirmation: null,
      };

    case 'error':
      return {
        ...state,
        phase: 'error',
        errorMessage: action.message,
      };

    case 'reset_turn':
      return {
        ...state,
        phase: 'idle',
        pendingText: '',
        activeToolName: null,
        awaitingConfirmation: null,
      };
  }
}

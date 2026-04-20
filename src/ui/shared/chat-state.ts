/**
 * Pure shared chat state for the Ink TUI layer.
 *
 * Contains the ChatState interface, ChatAction discriminated union,
 * INITIAL_CHAT_STATE constant, and the chatReducer pure function.
 *
 * WEB-SAFE BOUNDARY: this file must never import Node.js built-ins or
 * any package that depends on them. It is designed to be importable
 * from web frontends as well as the Ink TUI.
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
 * - 'user': human input
 * - 'agent': assistant text response
 * - 'tool': a completed tool call with its output
 */
export type RenderedMessage =
  | { readonly role: 'user'; readonly text: string; readonly tokenUsage?: TokenUsage }
  | { readonly role: 'agent'; readonly text: string; readonly tokenUsage?: TokenUsage }
  | {
      readonly role: 'tool';
      readonly toolName: string;
      readonly args: unknown;
      readonly output: string;
      readonly success: boolean;
    }
  | { readonly role: 'system'; readonly text: string; readonly isError: boolean };

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
  /** Arguments of the tool currently executing, or null when idle. */
  readonly activeToolArgs: unknown;
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
  | { type: 'tool_end'; output: string; success: boolean }
  | { type: 'agent_end'; usage: TokenUsage }
  | { type: 'user_message'; text: string }
  | { type: 'system_message'; text: string; isError: boolean }
  | { type: 'await_confirmation'; toolName: string; args: unknown }
  | { type: 'confirm_tool'; approved: boolean }
  | { type: 'error'; message: string }
  | { type: 'reset_turn' }
  | { type: 'context_warning'; active: boolean };

/**
 * The initial state when a chat session first opens.
 * All collections are empty and the phase is idle.
 */
export const INITIAL_CHAT_STATE: ChatState = {
  phase: 'idle',
  messages: [],
  pendingText: '',
  activeToolName: null,
  activeToolArgs: null,
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

    case 'tool_start': {
      const flushedOnToolStart: readonly RenderedMessage[] =
        state.pendingText.trim().length > 0
          ? [...state.messages, { role: 'agent' as const, text: state.pendingText }]
          : state.messages;
      return {
        ...state,
        phase: 'tool_call',
        messages: flushedOnToolStart,
        pendingText: '',
        activeToolName: action.toolName,
        activeToolArgs: action.args,
      };
    }

    case 'await_confirmation':
      return {
        ...state,
        awaitingConfirmation: { toolName: action.toolName, args: action.args },
      };

    case 'tool_end': {
      const toolMessage: RenderedMessage = {
        role: 'tool',
        toolName: state.activeToolName ?? 'unknown',
        args: state.activeToolArgs,
        output: action.output,
        success: action.success,
      };
      return {
        ...state,
        phase: 'streaming_text',
        activeToolName: null,
        activeToolArgs: null,
        awaitingConfirmation: null,
        messages: [...state.messages, toolMessage],
      };
    }

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
        activeToolArgs: null,
        awaitingConfirmation: null,
        contextWarning: false,
      };

    case 'system_message':
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: 'system' as const, text: action.text, isError: action.isError },
        ],
      };

    case 'context_warning':
      return {
        ...state,
        contextWarning: action.active,
      };
  }
}

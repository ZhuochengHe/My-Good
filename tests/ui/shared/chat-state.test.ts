/**
 * Tests for chatReducer and INITIAL_CHAT_STATE.
 * Written FIRST following TDD methodology (RED -> GREEN -> REFACTOR).
 */

import { describe, it, expect } from 'vitest';
import {
  chatReducer,
  INITIAL_CHAT_STATE,
} from '../../../src/ui/shared/chat-state.js';
import type { ChatState, ChatAction } from '../../../src/ui/shared/chat-state.js';

/** Convenience builder: run a sequence of actions from initial state. */
function applyActions(actions: readonly ChatAction[]): ChatState {
  return actions.reduce(
    (state, action) => chatReducer(state, action),
    INITIAL_CHAT_STATE,
  );
}

describe('INITIAL_CHAT_STATE', () => {
  it('has phase idle', () => {
    expect(INITIAL_CHAT_STATE.phase).toBe('idle');
  });

  it('has empty messages array', () => {
    expect(INITIAL_CHAT_STATE.messages).toHaveLength(0);
  });

  it('has empty pendingText', () => {
    expect(INITIAL_CHAT_STATE.pendingText).toBe('');
  });

  it('has null activeToolName', () => {
    expect(INITIAL_CHAT_STATE.activeToolName).toBeNull();
  });

  it('has null lastTokenUsage', () => {
    expect(INITIAL_CHAT_STATE.lastTokenUsage).toBeNull();
  });

  it('has null errorMessage', () => {
    expect(INITIAL_CHAT_STATE.errorMessage).toBeNull();
  });

  it('has contextWarning false', () => {
    expect(INITIAL_CHAT_STATE.contextWarning).toBe(false);
  });

  it('has null awaitingConfirmation', () => {
    expect(INITIAL_CHAT_STATE.awaitingConfirmation).toBeNull();
  });
});

describe('chatReducer – text_delta', () => {
  it('appends delta to pendingText when idle', () => {
    const state = chatReducer(INITIAL_CHAT_STATE, {
      type: 'text_delta',
      delta: 'Hello',
    });
    expect(state.pendingText).toBe('Hello');
    expect(state.phase).toBe('streaming_text');
  });

  it('appends delta to pendingText when already streaming_text', () => {
    const state = applyActions([
      { type: 'text_delta', delta: 'Hello' },
      { type: 'text_delta', delta: ' World' },
    ]);
    expect(state.pendingText).toBe('Hello World');
    expect(state.phase).toBe('streaming_text');
  });

  it('appends delta to pendingText when in tool_call phase', () => {
    const state = applyActions([
      { type: 'user_message', text: 'hi' },
      { type: 'tool_start', toolName: 'bash', args: { cmd: 'ls' } },
      { type: 'tool_end' },
      { type: 'text_delta', delta: 'post-tool' },
    ]);
    expect(state.pendingText).toBe('post-tool');
    expect(state.phase).toBe('streaming_text');
  });

  it('does not mutate previous state (immutability)', () => {
    const before = chatReducer(INITIAL_CHAT_STATE, {
      type: 'text_delta',
      delta: 'A',
    });
    chatReducer(before, { type: 'text_delta', delta: 'B' });
    expect(before.pendingText).toBe('A');
  });
});

describe('chatReducer – tool_start', () => {
  it('discards pendingText accumulated before the tool call', () => {
    const state = applyActions([
      { type: 'text_delta', delta: 'thinking…' },
      { type: 'tool_start', toolName: 'bash', args: {} },
    ]);
    expect(state.pendingText).toBe('');
  });

  it('sets activeToolName', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'read_file', args: { path: '/tmp' } },
    ]);
    expect(state.activeToolName).toBe('read_file');
  });

  it('sets phase to tool_call', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args: {} },
    ]);
    expect(state.phase).toBe('tool_call');
  });

  it('sets awaitingConfirmation with toolName and args', () => {
    const args = { cmd: 'rm -rf /' };
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args },
    ]);
    expect(state.awaitingConfirmation).toEqual({ toolName: 'bash', args });
  });
});

describe('chatReducer – tool_end', () => {
  it('clears activeToolName', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args: {} },
      { type: 'tool_end' },
    ]);
    expect(state.activeToolName).toBeNull();
  });

  it('sets phase to streaming_text', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args: {} },
      { type: 'tool_end' },
    ]);
    expect(state.phase).toBe('streaming_text');
  });

  it('clears awaitingConfirmation', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args: {} },
      { type: 'tool_end' },
    ]);
    expect(state.awaitingConfirmation).toBeNull();
  });
});

describe('chatReducer – agent_end', () => {
  const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

  it('flushes non-empty pendingText as an agent RenderedMessage', () => {
    const state = applyActions([
      { type: 'text_delta', delta: 'Final answer' },
      { type: 'agent_end', usage },
    ]);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual({ role: 'agent', text: 'Final answer', tokenUsage: usage });
  });

  it('does not add a message when pendingText is empty', () => {
    const state = applyActions([
      { type: 'agent_end', usage },
    ]);
    expect(state.messages).toHaveLength(0);
  });

  it('clears pendingText', () => {
    const state = applyActions([
      { type: 'text_delta', delta: 'text' },
      { type: 'agent_end', usage },
    ]);
    expect(state.pendingText).toBe('');
  });

  it('sets lastTokenUsage', () => {
    const state = applyActions([
      { type: 'agent_end', usage },
    ]);
    expect(state.lastTokenUsage).toEqual(usage);
  });

  it('sets phase to complete', () => {
    const state = applyActions([
      { type: 'agent_end', usage },
    ]);
    expect(state.phase).toBe('complete');
  });

  it('preserves existing messages when flushing', () => {
    const state = applyActions([
      { type: 'user_message', text: 'hello' },
      { type: 'text_delta', delta: 'hi' },
      { type: 'agent_end', usage },
    ]);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]).toMatchObject({ role: 'user', text: 'hello' });
    expect(state.messages[1]).toMatchObject({ role: 'agent', text: 'hi' });
  });
});

describe('chatReducer – user_message', () => {
  it('adds a user RenderedMessage', () => {
    const state = applyActions([
      { type: 'user_message', text: 'Hello agent' },
    ]);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual({ role: 'user', text: 'Hello agent' });
  });

  it('sets phase to idle', () => {
    const state = applyActions([
      { type: 'error', message: 'boom' },
      { type: 'user_message', text: 'retry' },
    ]);
    expect(state.phase).toBe('idle');
  });

  it('clears errorMessage', () => {
    const state = applyActions([
      { type: 'error', message: 'oops' },
      { type: 'user_message', text: 'new input' },
    ]);
    expect(state.errorMessage).toBeNull();
  });

  it('preserves existing messages', () => {
    const state = applyActions([
      { type: 'user_message', text: 'first' },
      { type: 'user_message', text: 'second' },
    ]);
    expect(state.messages).toHaveLength(2);
  });
});

describe('chatReducer – confirm_tool', () => {
  it('clears awaitingConfirmation when approved', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args: {} },
      { type: 'confirm_tool', approved: true },
    ]);
    expect(state.awaitingConfirmation).toBeNull();
  });

  it('clears awaitingConfirmation when denied', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args: {} },
      { type: 'confirm_tool', approved: false },
    ]);
    expect(state.awaitingConfirmation).toBeNull();
  });

  it('does not change phase', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args: {} },
      { type: 'confirm_tool', approved: true },
    ]);
    // phase remains tool_call (confirm_tool does not change it)
    expect(state.phase).toBe('tool_call');
  });
});

describe('chatReducer – error', () => {
  it('sets errorMessage', () => {
    const state = applyActions([
      { type: 'error', message: 'Network failure' },
    ]);
    expect(state.errorMessage).toBe('Network failure');
  });

  it('sets phase to error', () => {
    const state = applyActions([
      { type: 'error', message: 'boom' },
    ]);
    expect(state.phase).toBe('error');
  });

  it('preserves existing messages', () => {
    const state = applyActions([
      { type: 'user_message', text: 'hi' },
      { type: 'error', message: 'fail' },
    ]);
    expect(state.messages).toHaveLength(1);
  });
});

describe('chatReducer – reset_turn', () => {
  it('sets phase to idle', () => {
    const state = applyActions([
      { type: 'text_delta', delta: 'partial' },
      { type: 'reset_turn' },
    ]);
    expect(state.phase).toBe('idle');
  });

  it('clears pendingText', () => {
    const state = applyActions([
      { type: 'text_delta', delta: 'partial' },
      { type: 'reset_turn' },
    ]);
    expect(state.pendingText).toBe('');
  });

  it('clears activeToolName', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args: {} },
      { type: 'reset_turn' },
    ]);
    expect(state.activeToolName).toBeNull();
  });

  it('clears awaitingConfirmation', () => {
    const state = applyActions([
      { type: 'tool_start', toolName: 'bash', args: {} },
      { type: 'reset_turn' },
    ]);
    expect(state.awaitingConfirmation).toBeNull();
  });

  it('preserves messages accumulated before the reset', () => {
    const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
    const state = applyActions([
      { type: 'user_message', text: 'q' },
      { type: 'text_delta', delta: 'ans' },
      { type: 'agent_end', usage },
      { type: 'reset_turn' },
    ]);
    expect(state.messages).toHaveLength(2);
  });
});

describe('chatReducer — context_warning action', () => {
  it('sets contextWarning to true when active is true', () => {
    const state = chatReducer(INITIAL_CHAT_STATE, { type: 'context_warning', active: true });
    expect(state.contextWarning).toBe(true);
  });

  it('sets contextWarning to false when active is false', () => {
    const state = chatReducer(
      { ...INITIAL_CHAT_STATE, contextWarning: true },
      { type: 'context_warning', active: false },
    );
    expect(state.contextWarning).toBe(false);
  });

  it('reset_turn clears contextWarning', () => {
    const state = applyActions([
      { type: 'context_warning', active: true },
      { type: 'reset_turn' },
    ]);
    expect(state.contextWarning).toBe(false);
  });
});

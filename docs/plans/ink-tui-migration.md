# Ink TUI Migration Plan

Rewrite the CLI UI using Ink (React terminal renderer) while extracting pure
logic into a framework-agnostic shared layer that can later be reused in a web
frontend.

## Goals

1. Replace `ColoredOutput` + `ora` + raw `process.stdout` with Ink React components
2. Extract state machine logic into `src/ui/shared/` — zero Node.js dependencies, web-reusable
3. Keep all non-chat commands (`session`, `plugin`, `config`, etc.) and non-TTY paths unchanged
4. Support: typewriter effect, spinner during tool calls, silent pre-tool thinking, styled header
5. Handle `onDangerousToolCall` as an inline Ink confirmation component (not readline)

## New Directory Structure

```
src/ui/
  shared/                      ← no UI/Node.js deps — safe to import from web
    chat-state.ts              — ChatState, ChatAction, chatReducer (pure function)
    stream-processor.ts        — AgentEvent → ChatAction mapping
  ink/                         ← Node.js only
    components/
      App.tsx                  — root component, owns all render state
      ChatHeader.tsx           — styled header box
      MessageList.tsx          — scrollable list of completed messages
      StreamingMessage.tsx     — active assistant response with typewriter
      ToolCallBlock.tsx        — spinner + tool name during tool execution
      InputLine.tsx            — user prompt input row (multi-line, slash commands)
      TokenUsageLine.tsx       — dim token usage footer
      ConfirmPrompt.tsx        — dangerous tool [y/N] confirmation overlay
    hooks/
      useStreamingSession.ts   — integrates sessionManager.streamRun + chatReducer
      useTypewriter.ts         — character-by-character drain, timer-based
    InkChatRunner.ts           — render(<App/>) entry point; replaces chat() for TTY
```

## Shared Layer Design

### `src/ui/shared/chat-state.ts`

```typescript
export type ChatPhase =
  | 'idle'
  | 'streaming_text'
  | 'tool_call'
  | 'complete'
  | 'error';

export interface RenderedMessage {
  readonly role: 'user' | 'agent';
  readonly text: string;
  readonly tokenUsage?: TokenUsage;
}

export interface ChatState {
  readonly phase: ChatPhase;
  readonly messages: readonly RenderedMessage[];
  readonly pendingText: string;       // buffered pre-tool text (discarded on tool_call)
  readonly activeToolName: string | null;
  readonly lastTokenUsage: TokenUsage | null;
  readonly errorMessage: string | null;
  readonly contextWarning: boolean;
  readonly awaitingConfirmation: { toolName: string; args: unknown } | null;
}

export type ChatAction =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; toolName: string; args: unknown }
  | { type: 'tool_end' }
  | { type: 'agent_end'; usage: TokenUsage }
  | { type: 'user_message'; text: string }
  | { type: 'confirm_tool'; approved: boolean }
  | { type: 'error'; message: string }
  | { type: 'reset_turn' };
```

`chatReducer(state, action) => ChatState` is a plain pure function — fully
serializable state, usable with React `useReducer` in both Ink and web.

### `src/ui/shared/stream-processor.ts`

Single pure function:

```typescript
export function agentEventToAction(event: AgentEvent): ChatAction | null
```

Maps every `AgentEvent` variant to a `ChatAction`. This is the only place where
the agent event type meets the UI. No Ink imports.

## Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `App.tsx` | Root; calls `useStreamingSession`; routes phase → sub-components; handles confirmation overlay |
| `ChatHeader.tsx` | Renders Unicode box with agent/provider/model/session info. Pure, no hooks |
| `MessageList.tsx` | Renders completed `RenderedMessage[]` entries |
| `StreamingMessage.tsx` | Renders `visibleText` from `useTypewriter`; hidden during `tool_call` phase |
| `ToolCallBlock.tsx` | Ink `<Spinner>` + tool name; mounts/unmounts on phase transitions |
| `InputLine.tsx` | User input using `ink-text-input`; backslash multi-line; slash command dispatch; emits `onSubmit` |
| `TokenUsageLine.tsx` | Dim cyan `↑ X  ↓ Y  ∑ Z`; hidden when null |
| `ConfirmPrompt.tsx` | Inline `[y/N]` prompt; resolves `onDangerousToolCall` Promise without readline |

## What Stays Unchanged

- `src/cli/bootstrap.ts` — wiring unchanged; `onDangerousToolCall` now wired to Ink confirmation
- `src/cli/output-adapter.ts` — interface kept as-is; optional methods remain for non-chat commands
- `src/cli/colored-output.ts` — used by all non-chat commands and non-TTY fallback
- `src/cli/plain-text-output.ts` — CI/pipe fallback and test double
- `src/cli/commands/` (all except chat routing in `index.ts`) — untouched
- All of `src/session/`, `src/agent/`, `src/providers/`, `src/memory/`, `src/plugins/`
- All existing tests

## Implementation Phases

### PR 1 — Framework + Routing (Phases 1–3)

**Phase 1 — Pure logic extraction (no Ink, no breakage)**

- [ ] Create `src/ui/shared/chat-state.ts` with `ChatState`, `ChatAction`, `chatReducer`
- [ ] Create `src/ui/shared/stream-processor.ts` with `agentEventToAction`
- [ ] Unit tests for both (pure functions, no mocking needed)

**Phase 2 — Ink skeleton**

- [ ] Add dependencies: `ink`, `react`, `@types/react`, `ink-text-input`
- [ ] Create `src/ui/ink/hooks/useTypewriter.ts` with tests (fake timers)
- [ ] Create `src/ui/ink/hooks/useStreamingSession.ts` with tests (mock SessionManager)
- [ ] Create all Ink components as stubs (render placeholder text, no logic)

**Phase 3 — Wire into CLI**

- [ ] Create `src/ui/ink/InkChatRunner.ts` — `render(<App/>)`, awaits unmount
- [ ] Modify `src/cli/index.ts` chat action: if TTY → `InkChatRunner`, else → existing `chat()` path
- [ ] Verify all existing tests still pass

### PR 2 — Full Ink Components + Cleanup (Phases 4–5)

**Phase 4 — Implement Ink components**

- [ ] `ChatHeader.tsx` — port Unicode box from `ColoredOutput.writeHeader`
- [ ] `MessageList.tsx` — render completed messages
- [ ] `StreamingMessage.tsx` — integrate `useTypewriter`, hide during tool_call phase
- [ ] `ToolCallBlock.tsx` — Ink spinner with tool name
- [ ] `InputLine.tsx` — full input with backslash continuation + slash command dispatch
- [ ] `TokenUsageLine.tsx` — token usage display
- [ ] `ConfirmPrompt.tsx` — dangerous tool confirmation (replaces readline in bootstrap)
- [ ] `App.tsx` — complete state routing, all phases

**Phase 5 — Cleanup**

- [ ] Remove TTY branch in `index.ts`, make Ink the only interactive path
- [ ] Add ESLint comment/rule asserting `src/ui/shared/` has no Node.js imports
- [ ] Delete `startLoading`/`stopLoading`/`writeChunk` usage in old `runStreaming` (or delete `runStreaming`)
- [ ] Update architecture docs

## Key Design Decisions

**`OutputAdapter` not deleted** — kept for all non-chat commands. `writeChunk`,
`formatAgentLine`, `formatUserPrompt`, `writeHeader`, `startLoading`, `stopLoading`
become "deprecated for Ink path" but not removed. Non-TTY chat fallback still uses them.

**`onDangerousToolCall` + Ink stdin** — Ink owns `process.stdin`. The readline-based
confirmation conflicts. Solution: `ConfirmPrompt` component renders inline; the
callback's Promise resolves when user presses y/n via Ink's `useInput`.

**Typewriter re-render frequency** — `useTypewriter` at 30ms = ~33 renders/sec.
Hook must clear interval when queue is empty to avoid idle re-renders.

**`useReducer` over class state machine** — reduces compose cleanly with React hooks,
pure functions are trivially testable, maps 1:1 to how web React will use the same reducer.

**Web reuse boundary** — `src/ui/shared/` must have zero Node.js-specific imports.
`src/ui/ink/` is Node.js only. A web frontend imports only from `src/ui/shared/`.

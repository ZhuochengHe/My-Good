/**
 * Root Ink component for the chat TUI.
 *
 * Owns all render state via useStreamingSession. Routes the current
 * ChatPhase to sub-components and handles the confirmation overlay.
 */

import React, { useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import type { SessionManager } from '../../../session/session-manager.js';
import type { AppConfig } from '../../../types/config.js';
import { useStreamingSession } from '../hooks/useStreamingSession.js';
import { ChatHeader } from './ChatHeader.js';
import { MessageList } from './MessageList.js';
import { StreamingMessage } from './StreamingMessage.js';
import { ToolCallBlock } from './ToolCallBlock.js';
import { InputLine } from './InputLine.js';
import { TokenUsageLine } from './TokenUsageLine.js';
import { ConfirmPrompt } from './ConfirmPrompt.js';

/** Default user label. */
const DEFAULT_USER_LABEL = 'you';
/** Default agent label. */
const DEFAULT_AGENT_LABEL = 'agent';
/** Default typewriter speed in milliseconds. */
const DEFAULT_TYPEWRITER_MS = 30;

/**
 * Props for App.
 */
export interface AppProps {
  /** Session manager. */
  readonly sessionManager: SessionManager;
  /** Active session ID. */
  readonly sessionId: string;
  /** Full application config (optional — uses defaults when absent). */
  readonly config?: AppConfig;
  /** Total memory entries for header display. */
  readonly memoryEntryCount?: number;
  /** Warnings to show on startup. */
  readonly warnings?: readonly string[];
}

/**
 * Root chat application component.
 *
 * Integrates useStreamingSession, routes phases to sub-components,
 * and renders the ConfirmPrompt overlay when a dangerous tool awaits
 * confirmation.
 *
 * @param props - App configuration.
 */
export function App(props: AppProps): React.ReactElement {
  const { sessionManager, sessionId, config, memoryEntryCount, warnings } = props;

  const { exit } = useApp();

  const userLabel = config?.agent.userLabel ?? DEFAULT_USER_LABEL;
  const agentLabel = config?.agent.agentLabel ?? DEFAULT_AGENT_LABEL;
  const typewriterMs =
    config?.agent.typewriterEffect === false
      ? 0
      : (config?.agent.typewriterSpeedMs ?? DEFAULT_TYPEWRITER_MS);

  const { state, isStreaming, submit, dispatch } = useStreamingSession({
    sessionManager,
    sessionId,
  });

  const handleSubmit = useCallback(
    (input: string) => {
      submit(input);
    },
    [submit]
  );

  const handleSlashCommand = useCallback(
    (command: string) => {
      if (command === '/exit' || command === '/quit') {
        exit();
      }
      // Other slash commands can be handled here in PR 2
    },
    [exit]
  );

  const handleConfirm = useCallback(
    (approved: boolean) => {
      dispatch({ type: 'confirm_tool', approved });
    },
    [dispatch]
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <ChatHeader
        agentName={config?.agent.name ?? 'My Agent'}
        provider={config?.agent.provider ?? ''}
        model={config?.agent.model ?? ''}
        sessionId={sessionId.slice(0, 8)}
        userLabel={userLabel}
        agentLabel={agentLabel}
        {...(memoryEntryCount !== undefined && { memoryEntryCount })}
      />

      {warnings && warnings.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {warnings.map((w, i) => (
            <Text key={i} color="red">
              Warning: {w}
            </Text>
          ))}
        </Box>
      )}

      <MessageList
        messages={state.messages}
        userLabel={userLabel}
        agentLabel={agentLabel}
      />

      {state.phase === 'tool_call' && state.activeToolName !== null && (
        <ToolCallBlock toolName={state.activeToolName} />
      )}

      {state.phase !== 'tool_call' && state.pendingText.length > 0 && (
        <StreamingMessage
          agentLabel={agentLabel}
          pendingText={state.pendingText}
          isToolCallActive={false}
          {...(typewriterMs !== 0 && { typewriterMs })}
        />
      )}

      <TokenUsageLine tokenUsage={state.lastTokenUsage} />

      {state.errorMessage !== null && (
        <Box marginBottom={1}>
          <Text color="red">Error: {state.errorMessage}</Text>
        </Box>
      )}

      {state.awaitingConfirmation !== null ? (
        <ConfirmPrompt
          toolName={state.awaitingConfirmation.toolName}
          args={state.awaitingConfirmation.args}
          onConfirm={handleConfirm}
        />
      ) : (
        <InputLine
          userLabel={userLabel}
          isActive={!isStreaming}
          onSubmit={handleSubmit}
          onSlashCommand={handleSlashCommand}
        />
      )}
    </Box>
  );
}

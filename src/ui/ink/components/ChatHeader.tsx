/**
 * Styled header box for the Ink TUI chat interface.
 *
 * Renders a Unicode box containing agent/provider/model/session info.
 * Pure component — no hooks, no side effects.
 */

import React from 'react';
import { Box, Text } from 'ink';

/**
 * Props for ChatHeader.
 */
export interface ChatHeaderProps {
  /** Agent display name. */
  readonly agentName: string;
  /** Provider name (e.g. anthropic, openai). */
  readonly provider: string;
  /** Model name (e.g. claude-3-5-sonnet). */
  readonly model: string;
  /** Truncated session ID (first 8 chars). */
  readonly sessionId: string;
  /** Label used for the user prompt. */
  readonly userLabel: string;
  /** Label used for agent responses. */
  readonly agentLabel: string;
  /** Total memory entries loaded at startup, or undefined if unavailable. */
  readonly memoryEntryCount?: number;
}

/**
 * Header box displayed at the top of the chat session.
 *
 * Shows agent name, provider, model, session ID, and optionally
 * the number of loaded memory entries.
 *
 * @param props - Header display data.
 */
export function ChatHeader(props: ChatHeaderProps): React.ReactElement {
  const {
    agentName,
    provider,
    model,
    sessionId,
    memoryEntryCount,
  } = props;

  const memoryLine =
    memoryEntryCount !== undefined
      ? `  memory: ${memoryEntryCount} entries`
      : '';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color="cyan">
        {agentName}
      </Text>
      <Text dimColor>
        {provider} · {model}
      </Text>
      <Text dimColor>session: {sessionId}{memoryLine}</Text>
    </Box>
  );
}

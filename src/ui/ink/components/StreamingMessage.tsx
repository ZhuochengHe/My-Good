/**
 * Renders the active assistant response with typewriter effect.
 *
 * Hidden during tool_call phase. Integrates with useTypewriter to
 * reveal text character-by-character as text_delta events arrive.
 */

import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTypewriter } from '../hooks/useTypewriter.js';

/**
 * Props for StreamingMessage.
 */
export interface StreamingMessageProps {
  /** Label used for agent responses. */
  readonly agentLabel: string;
  /** The latest pending text chunk to enqueue. */
  readonly pendingText: string;
  /** Whether a tool call is currently active (hides this component). */
  readonly isToolCallActive: boolean;
  /** Typewriter speed in milliseconds. */
  readonly typewriterMs?: number;
}

/**
 * Streaming assistant message with typewriter animation.
 *
 * Renders nothing while a tool call is active. When text arrives via
 * {@link StreamingMessageProps.pendingText}, it is enqueued to the
 * typewriter and revealed incrementally.
 *
 * @param props - Streaming message props.
 */
export function StreamingMessage(props: StreamingMessageProps): React.ReactElement | null {
  const { agentLabel, pendingText, isToolCallActive, typewriterMs } = props;
  const { visibleText, enqueue } = useTypewriter(
    typewriterMs !== undefined ? { intervalMs: typewriterMs } : undefined
  );

  useEffect(() => {
    if (pendingText.length > 0 && !isToolCallActive) {
      enqueue(pendingText);
    }
    // Only enqueue when pendingText changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingText]);

  if (isToolCallActive || visibleText.length === 0) {
    return null;
  }

  return (
    <Box marginBottom={1}>
      <Text color="green">
        {agentLabel} › {visibleText}
      </Text>
    </Box>
  );
}

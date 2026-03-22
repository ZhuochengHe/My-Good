/**
 * Renders the active assistant response with typewriter effect.
 *
 * Hidden during tool_call phase. Integrates with useTypewriter to
 * reveal text character-by-character as text_delta events arrive.
 * Only the incremental delta (new characters since last render) is
 * enqueued, preventing duplicate output.
 */

import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { useTypewriter } from '../hooks/useTypewriter.js';

/**
 * Props for StreamingMessage.
 */
export interface StreamingMessageProps {
  /** Label used for agent responses. */
  readonly agentLabel: string;
  /** Accumulated pending text from the reducer. */
  readonly pendingText: string;
  /** Whether a tool call is currently active (hides this component). */
  readonly isToolCallActive: boolean;
  /** Typewriter drain interval in milliseconds. */
  readonly typewriterMs?: number;
}

/**
 * Streaming assistant message with typewriter animation.
 *
 * Tracks the previous pendingText value so that only the incremental
 * delta is enqueued on each render, preventing duplicate characters.
 * Renders nothing while a tool call is active.
 *
 * @param props - Streaming message props.
 */
export function StreamingMessage(props: StreamingMessageProps): React.ReactElement | null {
  const { agentLabel, pendingText, isToolCallActive, typewriterMs } = props;

  const { visibleText, enqueue, flush } = useTypewriter(
    typewriterMs !== undefined ? { intervalMs: typewriterMs } : undefined
  );

  // Track the previous pendingText to compute only the new delta.
  const prevPendingRef = useRef('');

  useEffect(() => {
    if (isToolCallActive) return;
    const prev = prevPendingRef.current;
    if (pendingText.startsWith(prev) && pendingText.length > prev.length) {
      const delta = pendingText.slice(prev.length);
      enqueue(delta);
      prevPendingRef.current = pendingText;
    } else if (!pendingText.startsWith(prev)) {
      // pendingText was reset (e.g. new turn) — flush and restart
      flush();
      prevPendingRef.current = '';
      if (pendingText.length > 0) {
        enqueue(pendingText);
        prevPendingRef.current = pendingText;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingText, isToolCallActive]);

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

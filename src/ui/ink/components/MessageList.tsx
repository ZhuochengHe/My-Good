/**
 * Renders the list of completed chat messages.
 *
 * Each RenderedMessage is displayed with a role-based color and label prefix.
 * Tool call records are collapsible; arrow keys and Tab move focus between them.
 * Pure component — receives messages as props, no local state except focus index.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RenderedMessage } from '../../shared/chat-state.js';
import { ToolCallRecord } from './ToolCallRecord.js';

/**
 * Props for MessageList.
 */
export interface MessageListProps {
  /** Fully-committed messages to display. */
  readonly messages: readonly RenderedMessage[];
  /** Label used for the user prompt. */
  readonly userLabel: string;
  /** Label used for agent responses. */
  readonly agentLabel: string;
}

/**
 * Scrollable list of completed chat messages.
 *
 * Renders each message with a colored role label prefix.
 * User messages are shown in white; agent messages in green.
 * Tool call records are collapsible with keyboard navigation:
 *   - ↑ / ↓ or k / j — move focus between tool records
 *   - Enter / Space   — expand or collapse the focused record
 *
 * @param props - Message list display data.
 */
export function MessageList(props: MessageListProps): React.ReactElement {
  const { messages, userLabel, agentLabel } = props;

  // Indices into `messages` that are tool records
  const toolIndices = messages.reduce<number[]>((acc, msg, i) => {
    if (msg.role === 'tool') acc.push(i);
    return acc;
  }, []);

  // Which tool record (by position in toolIndices) has focus; -1 = none
  const [focusedToolPos, setFocusedToolPos] = useState(-1);

  const moveFocus = useCallback(
    (delta: number): void => {
      if (toolIndices.length === 0) return;
      setFocusedToolPos((prev) => {
        if (prev === -1) return delta > 0 ? 0 : toolIndices.length - 1;
        const next = prev + delta;
        if (next < 0) return toolIndices.length - 1;
        if (next >= toolIndices.length) return 0;
        return next;
      });
    },
    [toolIndices.length]
  );

  useInput((input, key) => {
    if (toolIndices.length === 0) return;
    if (key.upArrow || input === 'k') moveFocus(-1);
    if (key.downArrow || input === 'j') moveFocus(1);
    if (key.tab) moveFocus(1);
  });

  // Map message index → focused flag
  const focusedMsgIndex =
    focusedToolPos >= 0 ? toolIndices[focusedToolPos] : -1;

  return (
    <Box flexDirection="column">
      {messages.map((msg, index) => {
        if (msg.role === 'tool') {
          return (
            <ToolCallRecord
              key={index}
              toolName={msg.toolName}
              args={msg.args}
              output={msg.output}
              success={msg.success}
              focused={index === focusedMsgIndex}
            />
          );
        }

        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Text
              color={msg.role === 'user' ? 'white' : 'green'}
              bold={msg.role === 'user'}
            >
              {msg.role === 'user' ? `${userLabel} › ` : `${agentLabel} › `}
              {msg.text}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

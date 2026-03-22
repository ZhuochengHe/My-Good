/**
 * Renders the list of completed chat messages.
 *
 * Each RenderedMessage is displayed with a role-based color and label prefix.
 * Pure component — receives messages as props, no local state.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { RenderedMessage } from '../../shared/chat-state.js';

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
 *
 * @param props - Message list display data.
 */
export function MessageList(props: MessageListProps): React.ReactElement {
  const { messages, userLabel, agentLabel } = props;

  return (
    <Box flexDirection="column">
      {messages.map((msg, index) => (
        <Box key={index} flexDirection="column" marginBottom={1}>
          <Text
            color={msg.role === 'user' ? 'white' : 'green'}
            bold={msg.role === 'user'}
          >
            {msg.role === 'user' ? `${userLabel} › ` : `${agentLabel} › `}
            {msg.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

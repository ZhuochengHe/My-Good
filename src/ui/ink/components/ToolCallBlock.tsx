/**
 * Displays a spinner and tool name during tool execution.
 *
 * Mounts when phase transitions to tool_call, unmounts on tool_end.
 * Pure component driven by props from App.tsx.
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

/**
 * Props for ToolCallBlock.
 */
export interface ToolCallBlockProps {
  /** Name of the tool currently executing. */
  readonly toolName: string;
}

/**
 * Animated spinner with the executing tool name.
 *
 * Rendered only while a tool call is active.
 *
 * @param props - Tool call display data.
 */
export function ToolCallBlock(props: ToolCallBlockProps): React.ReactElement {
  const { toolName } = props;

  return (
    <Box marginBottom={1}>
      <Text color="yellow">
        <Spinner type="dots" />
      </Text>
      <Text color="yellow"> Using tool: {toolName}</Text>
    </Box>
  );
}

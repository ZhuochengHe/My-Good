/**
 * Collapsible tool call record rendered in the message transcript.
 *
 * Shows a one-line summary by default. The focused record can be
 * expanded/collapsed by pressing Enter or Space. Arrow keys move focus
 * between records; Tab also moves focus forward.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

/**
 * Props for ToolCallRecord.
 */
export interface ToolCallRecordProps {
  /** Tool name. */
  readonly toolName: string;
  /** Arguments passed to the tool. */
  readonly args: unknown;
  /** Output returned by the tool. */
  readonly output: string;
  /** Whether the tool call succeeded. */
  readonly success: boolean;
  /** Whether this record currently has keyboard focus. */
  readonly focused: boolean;
}

/** Maximum characters of output shown in the collapsed preview. */
const PREVIEW_LENGTH = 120;

/** Maximum lines of output shown when expanded. */
const MAX_EXPANDED_LINES = 20;

/**
 * Single collapsible tool call entry.
 *
 * Pressing Enter or Space while focused toggles the expanded view.
 *
 * @param props - Tool call record data and focus state.
 */
export function ToolCallRecord(props: ToolCallRecordProps): React.ReactElement {
  const { toolName, args, output, success, focused } = props;
  const [expanded, setExpanded] = useState(false);

  useInput(
    (input, key) => {
      if (input === ' ' || key.return) {
        setExpanded((prev) => !prev);
      }
    },
    { isActive: focused }
  );

  const statusColor = success ? 'green' : 'red';
  const statusIcon = success ? '✓' : '✗';
  const focusIndicator = focused ? '▶ ' : '  ';
  const expandIcon = expanded ? '▼' : '▶';

  const safeOutput = output ?? '';
  const outputPreview =
    safeOutput.length > PREVIEW_LENGTH
      ? `${safeOutput.slice(0, PREVIEW_LENGTH)}…`
      : safeOutput;

  const expandedLines = safeOutput.split('\n').slice(0, MAX_EXPANDED_LINES);
  const truncated = safeOutput.split('\n').length > MAX_EXPANDED_LINES;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Summary line */}
      <Box>
        <Text color={focused ? 'cyan' : 'gray'}>{focusIndicator}</Text>
        <Text color={statusColor}>{statusIcon} </Text>
        <Text color="yellow" bold>
          {toolName}
        </Text>
        <Text color="gray"> {expandIcon} </Text>
        {!expanded && (
          <Text color="gray" dimColor>
            {outputPreview}
          </Text>
        )}
      </Box>

      {/* Expanded view */}
      {expanded && (
        <Box flexDirection="column" marginLeft={4} marginTop={1}>
          {/* Args */}
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray" dimColor>
              args:
            </Text>
            <Text color="gray">{JSON.stringify(args, null, 2)}</Text>
          </Box>
          {/* Output */}
          <Box flexDirection="column">
            <Text color="gray" dimColor>
              output:
            </Text>
            {expandedLines.map((line, i) => (
              <Text key={i} color={success ? 'white' : 'red'}>
                {line}
              </Text>
            ))}
            {truncated && (
              <Text color="gray" dimColor>
                … (truncated to {MAX_EXPANDED_LINES} lines, {safeOutput.split('\n').length} total)
              </Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

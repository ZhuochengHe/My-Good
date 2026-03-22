/**
 * Displays token usage statistics after each agent turn.
 *
 * Hidden when tokenUsage is null. Shows input, output, and total tokens
 * in a dim style footer line.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { TokenUsage } from '../../../types/providers.js';

/**
 * Props for TokenUsageLine.
 */
export interface TokenUsageLineProps {
  /** Token usage to display, or null to hide the component. */
  readonly tokenUsage: TokenUsage | null;
}

/**
 * Dim token usage footer: ↑ X  ↓ Y  ∑ Z
 *
 * Returns null when tokenUsage is not available.
 *
 * @param props - Token usage data.
 */
export function TokenUsageLine(props: TokenUsageLineProps): React.ReactElement | null {
  const { tokenUsage } = props;
  if (tokenUsage === null || tokenUsage.totalTokens === 0) {
    return null;
  }

  return (
    <Box marginBottom={1}>
      <Text dimColor color="cyan">
        ↑ {tokenUsage.inputTokens}  ↓ {tokenUsage.outputTokens}  ∑ {tokenUsage.totalTokens}
      </Text>
    </Box>
  );
}

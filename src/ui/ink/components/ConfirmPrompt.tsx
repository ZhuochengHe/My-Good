/**
 * Inline dangerous tool confirmation overlay for the Ink TUI.
 *
 * Renders a [y/N] prompt using Ink's useInput hook, resolving the
 * caller-provided Promise when the user presses y or n/Enter.
 * Replaces the readline-based confirmation that conflicts with Ink stdin.
 */

import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

/**
 * Props for ConfirmPrompt.
 */
export interface ConfirmPromptProps {
  /** Name of the tool awaiting confirmation. */
  readonly toolName: string;
  /** Serializable tool arguments to preview. */
  readonly args: unknown;
  /** Called with true (approved) or false (denied) when user responds. */
  readonly onConfirm: (approved: boolean) => void;
}

/**
 * Inline confirmation prompt for dangerous tool calls.
 *
 * Renders the tool name and a JSON preview of arguments.
 * Listens for a single y/n/Enter keypress via Ink's useInput.
 * Calls {@link ConfirmPromptProps.onConfirm} once and unmounts.
 *
 * @param props - Confirmation prompt data and callback.
 */
export function ConfirmPrompt(props: ConfirmPromptProps): React.ReactElement {
  const { toolName, args, onConfirm } = props;

  const preview = JSON.stringify(args, null, 2).slice(0, 300);

  useInput((input, key) => {
    if (input.toLowerCase() === 'y') {
      onConfirm(true);
    } else if (input.toLowerCase() === 'n' || key.return) {
      onConfirm(false);
    }
  });

  // Suppress unused-vars warning for key — useInput requires the signature
  useEffect(() => {}, []);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>
        ⚠  Tool &quot;{toolName}&quot; requires confirmation
      </Text>
      <Text dimColor>{preview}</Text>
      <Text>
        Proceed? <Text bold>[y/N]</Text>
      </Text>
    </Box>
  );
}

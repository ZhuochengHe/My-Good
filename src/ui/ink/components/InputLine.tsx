/**
 * User input row for the Ink TUI chat interface.
 *
 * Wraps ink-text-input to provide: multi-line continuation via trailing
 * backslash, slash command detection, and submit-on-Enter behavior.
 * Disabled (non-focussed) while a streaming turn is in progress.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

/**
 * Props for InputLine.
 */
export interface InputLineProps {
  /** Label shown before the input cursor. */
  readonly userLabel: string;
  /** Whether input should be focused (disabled while streaming). */
  readonly isActive: boolean;
  /** Called when the user submits a complete message. */
  readonly onSubmit: (value: string) => void;
  /** Called when a slash command is entered (e.g. '/exit'). */
  readonly onSlashCommand: (command: string) => void;
}

/**
 * Interactive user input with backslash multi-line continuation.
 *
 * When the user ends a line with `\`, the line is buffered and a new
 * prompt is shown for continuation. On a normal Enter, the buffered
 * content is joined with `\n` and submitted.
 *
 * Slash commands (starting with `/`) are routed to
 * {@link InputLineProps.onSlashCommand} instead of {@link InputLineProps.onSubmit}.
 *
 * @param props - Input line configuration.
 */
export function InputLine(props: InputLineProps): React.ReactElement {
  const { userLabel, isActive, onSubmit, onSlashCommand } = props;

  const [value, setValue] = useState('');
  const [buffer, setBuffer] = useState<string[]>([]);

  const handleSubmit = useCallback(
    (submitted: string) => {
      const trimmed = submitted.trim();

      // Backslash continuation
      if (submitted.endsWith('\\')) {
        setBuffer((prev) => [...prev, submitted.slice(0, -1)]);
        setValue('');
        return;
      }

      const fullText =
        buffer.length > 0 ? [...buffer, trimmed].join('\n') : trimmed;
      setBuffer([]);
      setValue('');

      if (fullText === '') return;

      if (fullText.startsWith('/')) {
        onSlashCommand(fullText);
      } else {
        onSubmit(fullText);
      }
    },
    [buffer, onSubmit, onSlashCommand]
  );

  const promptText =
    buffer.length > 0 ? '  > ' : `${userLabel} › `;

  return (
    <Box>
      <Text color={isActive ? 'white' : 'gray'}>{promptText}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        focus={isActive}
        placeholder={isActive ? '' : '(waiting...)'}
      />
    </Box>
  );
}

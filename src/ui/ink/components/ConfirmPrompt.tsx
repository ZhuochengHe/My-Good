/**
 * Inline dangerous tool confirmation overlay for the Ink TUI.
 *
 * For write_file: reads the existing file (if any) and renders a
 * line-numbered red/green diff of the changes before confirming.
 * For all other tools: shows a collapsed JSON preview of arguments.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

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

// ── Diff helpers ──────────────────────────────────────────────────────────────

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  lineNo: number;      // line number in the relevant file (new for added, old for removed)
  content: string;
}

/**
 * Compute a simple line-level diff between oldText and newText.
 * Uses a naive LCS-based approach sufficient for file review purposes.
 */
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const result: DiffLine[] = [];
  let o = 0;
  let n = 0;

  while (o < oldLines.length || n < newLines.length) {
    if (o < oldLines.length && n < newLines.length && oldLines[o] === newLines[n]) {
      result.push({ type: 'unchanged', lineNo: n + 1, content: oldLines[o]! });
      o++;
      n++;
    } else {
      // Look ahead up to 3 lines to find a match (simple heuristic)
      let matchedOld = -1;
      let matchedNew = -1;
      outer: for (let ahead = 1; ahead <= 3; ahead++) {
        if (n + ahead < newLines.length && o < oldLines.length) {
          if (newLines[n + ahead] === oldLines[o]) {
            matchedNew = ahead;
            break outer;
          }
        }
        if (o + ahead < oldLines.length && n < newLines.length) {
          if (oldLines[o + ahead] === newLines[n]) {
            matchedOld = ahead;
            break outer;
          }
        }
      }

      if (matchedNew > 0) {
        // Emit added lines up to the match
        for (let i = 0; i < matchedNew; i++) {
          result.push({ type: 'added', lineNo: n + 1, content: newLines[n]! });
          n++;
        }
      } else if (matchedOld > 0) {
        // Emit removed lines up to the match
        for (let i = 0; i < matchedOld; i++) {
          result.push({ type: 'removed', lineNo: o + 1, content: oldLines[o]! });
          o++;
        }
      } else {
        // No match found — emit one removed and one added
        if (o < oldLines.length) {
          result.push({ type: 'removed', lineNo: o + 1, content: oldLines[o]! });
          o++;
        }
        if (n < newLines.length) {
          result.push({ type: 'added', lineNo: n + 1, content: newLines[n]! });
          n++;
        }
      }
    }
  }

  return result;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

interface WriteFileDiffProps {
  readonly path: string;
  readonly content: string;
}

function WriteFileDiff({ path, content }: WriteFileDiffProps): React.ReactElement {
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    try {
      const absPath = isAbsolute(path) ? path : resolve(process.cwd(), path);
      const existing = readFileSync(absPath, 'utf-8');
      setDiff(computeDiff(existing, content));
      setIsNew(false);
    } catch {
      // File doesn't exist — all lines are additions
      const lines = content.split('\n').map<DiffLine>((line, i) => ({
        type: 'added',
        lineNo: i + 1,
        content: line,
      }));
      setDiff(lines);
      setIsNew(true);
    }
  }, [path, content]);

  if (diff === null) {
    return <Text dimColor>Loading diff...</Text>;
  }

  const added = diff.filter((l) => l.type === 'added').length;
  const removed = diff.filter((l) => l.type === 'removed').length;

  // Only show changed lines + a small context window (3 lines around changes)
  const changedIndices = new Set(
    diff.flatMap((l, i) => (l.type !== 'unchanged' ? [i - 2, i - 1, i, i + 1, i + 2] : []))
  );
  const visibleLines = diff.filter((_, i) => changedIndices.has(i));

  // Insert ellipsis markers between non-contiguous sections
  const sections: Array<DiffLine | null> = [];
  let lastIdx = -2;
  diff.forEach((line, i) => {
    if (!changedIndices.has(i)) return;
    if (i > lastIdx + 1 && sections.length > 0) sections.push(null); // null = ellipsis
    sections.push(line);
    lastIdx = i;
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>{isNew ? '(new file)' : ''} </Text>
        <Text color="green">+{added}</Text>
        <Text> </Text>
        <Text color="red">-{removed}</Text>
        <Text dimColor>  {path}</Text>
      </Box>
      {sections.map((line, i) => {
        if (line === null) {
          return (
            <Text key={`ellipsis-${i}`} dimColor>
              {'     ···'}
            </Text>
          );
        }
        const lineNumStr = String(line.lineNo).padStart(4, ' ');
        const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
        const color = line.type === 'added' ? 'green' : line.type === 'removed' ? 'red' : undefined;
        return (
          <Text key={i} color={color}>
            {lineNumStr} {prefix} {line.content}
          </Text>
        );
      })}
      {visibleLines.length === 0 && (
        <Text dimColor>(no changes)</Text>
      )}
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Inline confirmation prompt for dangerous tool calls.
 *
 * write_file: renders a red/green line-numbered diff.
 * Other tools: shows a truncated JSON preview.
 *
 * @param props - Confirmation prompt data and callback.
 */
export function ConfirmPrompt(props: ConfirmPromptProps): React.ReactElement {
  const { toolName, args, onConfirm } = props;

  useInput((input, key) => {
    if (input.toLowerCase() === 'y') {
      onConfirm(true);
    } else if (input.toLowerCase() === 'n' || key.return) {
      onConfirm(false);
    }
  });

  const isWriteFile =
    toolName === 'write_file' &&
    args !== null &&
    typeof args === 'object' &&
    'path' in (args as object) &&
    'content' in (args as object);

  const a = args as Record<string, unknown>;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>
        ⚠  {toolName}
      </Text>

      <Box marginY={1}>
        {isWriteFile ? (
          <WriteFileDiff path={String(a['path'])} content={String(a['content'])} />
        ) : (
          <Text dimColor>{JSON.stringify(args, null, 2).slice(0, 400)}</Text>
        )}
      </Box>

      <Text>
        Proceed? <Text bold>[y/N]</Text>
      </Text>
    </Box>
  );
}

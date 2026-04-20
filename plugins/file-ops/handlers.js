/**
 * File operations plugin handlers.
 *
 * read_file  — paginated read with total line count
 * write_file — full overwrite or create (dangerous, requires confirmation)
 * edit_file  — surgical old→new line replacement (dangerous, requires confirmation)
 */

import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir } from 'fs/promises';
import { resolve, dirname, isAbsolute } from 'path';

const READ_LIMIT = 200;   // max lines per read_file call
const EDIT_LIMIT = 100;   // max lines in new_lines per edit_file call

function resolvePath(targetPath, workingDirectory) {
  if (isAbsolute(targetPath)) return targetPath;
  return resolve(workingDirectory, targetPath);
}

/**
 * Read a file with optional pagination. Always returns total line count.
 */
export async function read_file(args, context) {
  if (!args.path || typeof args.path !== 'string') {
    return { output: 'Error: Missing or invalid required parameter "path"' };
  }

  const filePath = resolvePath(args.path, context.workingDirectory);

  let raw;
  try {
    raw = await fsReadFile(filePath, 'utf-8');
  } catch (error) {
    return { output: `Error reading file "${args.path}": ${error.message}` };
  }

  const allLines = raw.split('\n');
  const totalLines = allLines.length;

  const offset = typeof args.offset === 'number' ? Math.max(0, Math.floor(args.offset)) : 0;
  const limit  = typeof args.limit  === 'number' ? Math.min(READ_LIMIT, Math.max(1, Math.floor(args.limit))) : READ_LIMIT;

  const slice = allLines.slice(offset, offset + limit);
  const numbered = slice.map((line, i) => `${offset + i + 1}\t${line}`).join('\n');

  const rangeEnd = offset + slice.length;
  const truncated = rangeEnd < totalLines;

  return {
    output: [
      `total_lines: ${totalLines}`,
      `showing: ${offset + 1}–${rangeEnd}${truncated ? ` (${totalLines - rangeEnd} more lines — use offset=${rangeEnd} to continue)` : ''}`,
      '',
      numbered,
    ].join('\n'),
  };
}

/**
 * Overwrite a file entirely (or create it). Use for new files or large rewrites.
 * For small changes use edit_file instead.
 */
export async function write_file(args, context) {
  if (!args.path || typeof args.path !== 'string') {
    return { output: 'Error: Missing or invalid required parameter "path"' };
  }
  // content is optional — omitting it creates an empty file (touch semantics)
  const content = args.content === null || args.content === undefined ? '' : String(args.content);

  const encoding = typeof args.encoding === 'string' ? args.encoding : 'utf-8';
  const filePath = resolvePath(args.path, context.workingDirectory);

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await fsWriteFile(filePath, content, encoding);
    const lines = content.length === 0 ? 0 : content.split('\n').length;
    return { output: `File written: "${args.path}" (${lines} lines)` };
  } catch (error) {
    return { output: `Error writing file "${args.path}": ${error.message}` };
  }
}

/**
 * Replace exact lines in a file. Matches the first occurrence of old_lines and
 * substitutes it with new_lines. Fails if old_lines is not found exactly once.
 *
 * new_lines is limited to EDIT_LIMIT lines to encourage focused edits.
 * For larger changes, use write_file.
 */
export async function edit_file(args, context) {
  if (!args.path || typeof args.path !== 'string') {
    return { output: 'Error: Missing required parameter "path"' };
  }
  if (!args.old_lines || typeof args.old_lines !== 'string') {
    return { output: 'Error: Missing required parameter "old_lines"' };
  }
  if (args.new_lines === null || args.new_lines === undefined) {
    return { output: 'Error: Missing required parameter "new_lines"' };
  }

  const newLines = String(args.new_lines);
  if (newLines.split('\n').length > EDIT_LIMIT) {
    return {
      output: `Error: new_lines exceeds the ${EDIT_LIMIT}-line limit. Use write_file for large rewrites.`,
    };
  }

  const filePath = resolvePath(args.path, context.workingDirectory);

  let original;
  try {
    original = await fsReadFile(filePath, 'utf-8');
  } catch (error) {
    return { output: `Error reading file "${args.path}": ${error.message}` };
  }

  const oldStr = String(args.old_lines);

  // Count occurrences to ensure unambiguous match
  let count = 0;
  let idx = original.indexOf(oldStr);
  while (idx !== -1) {
    count++;
    idx = original.indexOf(oldStr, idx + 1);
  }

  if (count === 0) {
    return { output: `Error: old_lines not found in "${args.path}". Read the file first to get the exact content.` };
  }
  if (count > 1) {
    return { output: `Error: old_lines matches ${count} locations in "${args.path}". Provide more context to make it unique.` };
  }

  const updated = original.replace(oldStr, newLines);

  try {
    await fsWriteFile(filePath, updated, 'utf-8');
    const delta = newLines.split('\n').length - oldStr.split('\n').length;
    const sign = delta >= 0 ? '+' : '';
    return { output: `Edited "${args.path}" (${sign}${delta} lines)` };
  } catch (error) {
    return { output: `Error writing file "${args.path}": ${error.message}` };
  }
}

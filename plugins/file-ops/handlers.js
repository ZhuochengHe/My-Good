/**
 * File operations plugin handlers.
 *
 * Only write_file remains — read and list operations are handled via shell_exec
 * (cat, ls, find) which are more flexible. write_file is kept as a dedicated
 * tool so the user can see exactly what content is being written.
 */

import { writeFile as fsWriteFile, mkdir } from 'fs/promises';
import { resolve, dirname, isAbsolute } from 'path';

/**
 * Resolves a path relative to the working directory.
 *
 * @param {string} targetPath - The path to resolve.
 * @param {string} workingDirectory - The working directory.
 * @returns {string} The resolved absolute path.
 */
function resolvePath(targetPath, workingDirectory) {
  if (isAbsolute(targetPath)) {
    return targetPath;
  }
  return resolve(workingDirectory, targetPath);
}

/**
 * Writes content to a file.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {import('../../src/types/tools.js').ToolContext} context - Tool context.
 * @returns {Promise<import('../../src/types/tools.js').ToolHandlerResult>} Handler result.
 */
export async function write_file(args, context) {
  if (!args.path || typeof args.path !== 'string') {
    return { output: 'Error: Missing or invalid required parameter "path"' };
  }

  if (args.content === null || args.content === undefined) {
    return { output: 'Error: Missing or invalid required parameter "content"' };
  }

  const encoding = args.encoding || 'utf-8';
  const filePath = resolvePath(args.path, context.workingDirectory);

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await fsWriteFile(filePath, args.content, encoding);
    return { output: `File written: "${args.path}"` };
  } catch (error) {
    return { output: `Error writing file "${args.path}": ${error.message}` };
  }
}

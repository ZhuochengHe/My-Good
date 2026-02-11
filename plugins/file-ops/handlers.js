/**
 * File operations plugin handlers.
 *
 * Implements readFile, writeFile, and listDirectory operations.
 */

import { readFile as fsReadFile, writeFile as fsWriteFile, readdir, stat, mkdir } from 'fs/promises';
import { resolve, dirname, join, isAbsolute, basename, extname } from 'path';

/**
 * Credential detection patterns (duplicated from credential-detector.ts for JS compatibility).
 */
const CREDENTIAL_PATTERNS = [
  /sk-ant-api03-[a-zA-Z0-9_-]{20,}/g,
  /sk-proj-[a-zA-Z0-9_-]{20,}/g,
  /sk-(?!ant-|proj-)[a-zA-Z0-9_-]{20,}/g,
  /gh[posr]_[a-zA-Z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi,
];

/**
 * Redact credentials from a string.
 *
 * @param {string} input - String potentially containing credentials
 * @returns {string} String with credentials replaced
 */
function detectAndRedactCredentials(input) {
  let result = input;
  for (const pattern of CREDENTIAL_PATTERNS) {
    result = result.replace(pattern, '***REDACTED***');
  }
  return result;
}

/**
 * Patterns for files that should be blocked from reading due to sensitive content.
 */
const BLOCKED_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,         // .env, .env.local, .env.production, etc.
  /^config\.ya?ml$/i,        // config.yaml, config.yml
  /^\.npmrc$/i,              // npm config
  /^\.gitconfig$/i,          // git config
  /\.pem$/i,                 // PEM certificates
  /\.key$/i,                 // Private keys
  /^id_rsa$/i,               // SSH private key
  /^id_dsa$/i,               // SSH DSA key
  /^id_ecdsa$/i,             // SSH ECDSA key
  /^id_ed25519$/i,           // SSH Ed25519 key
  /^credentials$/i,          // AWS credentials
];

/**
 * Blocked directory patterns that contain sensitive files.
 */
const BLOCKED_PATHS = [
  '.aws/credentials',
  '.ssh/id_rsa',
  '.ssh/id_dsa',
  '.ssh/id_ecdsa',
  '.ssh/id_ed25519',
];

/**
 * Check if a file path should be blocked from reading.
 *
 * @param {string} filePath - The file path to check.
 * @returns {boolean} True if file should be blocked.
 */
function isBlockedFile(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = basename(filePath);

  // Check blocked path patterns
  for (const blockedPath of BLOCKED_PATHS) {
    if (normalizedPath.includes(blockedPath) || normalizedPath.endsWith(blockedPath)) {
      return true;
    }
  }

  // Check blocked file name patterns
  for (const pattern of BLOCKED_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return true;
    }
  }

  return false;
}

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
 * Reads the contents of a file.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {import('../../src/types/tools.js').ToolContext} context - Tool context.
 * @returns {Promise<import('../../src/types/tools.js').ToolHandlerResult>} Handler result.
 */
export async function read_file(args, context) {
  try {
    // Validate required parameters
    if (!args.path || typeof args.path !== 'string') {
      return {
        output: 'Error: Missing or invalid required parameter "path"',
      };
    }

    // Check if file is blocked due to sensitive content
    if (isBlockedFile(args.path)) {
      return {
        output: `Error: Access to file "${args.path}" is blocked for security reasons (sensitive credential file)`,
      };
    }

    const encoding = args.encoding || 'utf-8';
    const filePath = resolvePath(args.path, context.workingDirectory);

    // Check if the path is a directory
    const stats = await stat(filePath);
    if (stats.isDirectory()) {
      return {
        output: `Error: Path "${args.path}" is a directory, not a file`,
      };
    }

    const content = await fsReadFile(filePath, encoding);

    // Sanitize any credentials that might be in the file content
    const sanitizedContent = detectAndRedactCredentials(content);

    return {
      output: sanitizedContent,
    };
  } catch (error) {
    return {
      output: `Error reading file "${args.path}": ${error.message}`,
    };
  }
}

/**
 * Writes content to a file.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {import('../../src/types/tools.js').ToolContext} context - Tool context.
 * @returns {Promise<import('../../src/types/tools.js').ToolHandlerResult>} Handler result.
 */
export async function write_file(args, context) {
  try {
    // Validate required parameters
    if (!args.path || typeof args.path !== 'string') {
      return {
        output: 'Error: Missing or invalid required parameter "path"',
      };
    }

    if (args.content === null || args.content === undefined) {
      return {
        output: 'Error: Missing or invalid required parameter "content"',
      };
    }

    const encoding = args.encoding || 'utf-8';
    const filePath = resolvePath(args.path, context.workingDirectory);

    // Create parent directories if they don't exist
    const parentDir = dirname(filePath);
    await mkdir(parentDir, { recursive: true });

    // Write the file
    await fsWriteFile(filePath, args.content, encoding);

    return {
      output: `File successfully written: "${args.path}"`,
    };
  } catch (error) {
    return {
      output: `Error writing file "${args.path}": ${error.message}`,
    };
  }
}

/**
 * Lists files and directories at the specified path.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {import('../../src/types/tools.js').ToolContext} context - Tool context.
 * @returns {Promise<import('../../src/types/tools.js').ToolHandlerResult>} Handler result.
 */
export async function list_directory(args, context) {
  try {
    // Validate required parameters
    if (!args.path || typeof args.path !== 'string') {
      return {
        output: 'Error: Missing or invalid required parameter "path"',
      };
    }

    const recursive = args.recursive === true;
    const dirPath = resolvePath(args.path, context.workingDirectory);

    // Check if the path exists and is a directory
    const stats = await stat(dirPath);
    if (!stats.isDirectory()) {
      return {
        output: `Error: Path "${args.path}" is not a directory`,
      };
    }

    // List directory contents
    const entries = await listDirectoryRecursive(dirPath, dirPath, recursive);

    if (entries.length === 0) {
      return {
        output: 'Directory is empty',
      };
    }

    // Format output as JSON for structured data
    const output = JSON.stringify(entries, null, 2);
    return {
      output,
    };
  } catch (error) {
    return {
      output: `Error listing directory "${args.path}": ${error.message}`,
    };
  }
}

/**
 * Recursively lists directory contents.
 *
 * @param {string} currentPath - Current directory path.
 * @param {string} basePath - Base directory path for relative paths.
 * @param {boolean} recursive - Whether to list recursively.
 * @returns {Promise<Array<{name: string, type: string, size: number, modified: string, path: string}>>} Directory entries.
 */
async function listDirectoryRecursive(currentPath, basePath, recursive) {
  const entries = [];
  const items = await readdir(currentPath);

  for (const item of items) {
    const itemPath = join(currentPath, item);
    const stats = await stat(itemPath);
    const relativePath = itemPath.substring(basePath.length + 1);

    const entry = {
      name: item,
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      modified: stats.mtime.toISOString(),
      path: relativePath || item,
    };

    entries.push(entry);

    // Recursively list subdirectories if requested
    if (recursive && stats.isDirectory()) {
      const subEntries = await listDirectoryRecursive(itemPath, basePath, recursive);
      entries.push(...subEntries);
    }
  }

  return entries;
}

/**
 * Shell plugin handlers.
 *
 * Implements execCommand for shell command execution.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, isAbsolute } from 'path';

const execAsync = promisify(exec);

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
 * Sanitizes environment variables by filtering out sensitive credentials.
 *
 * Removes environment variables that match sensitive patterns:
 * - Variables containing: API_KEY, SECRET, TOKEN, PASSWORD, AUTH
 * - Preserves safe variables: PATH, HOME, USER, PWD, SHELL, LANG, etc.
 *
 * @param {Record<string, string>} env - Environment variables object.
 * @returns {Record<string, string>} Sanitized environment variables.
 */
function sanitizeEnv(env) {
  if (!env || typeof env !== 'object') {
    return {};
  }

  const sanitized = {};

  // Patterns that indicate sensitive environment variables
  const sensitivePatterns = [
    /API_KEY/i,
    /SECRET/i,
    /TOKEN/i,
    /PASSWORD/i,
    /AUTH/i,
  ];

  for (const [key, value] of Object.entries(env)) {
    // Check if key matches any sensitive pattern
    const isSensitive = sensitivePatterns.some((pattern) => pattern.test(key));

    if (!isSensitive) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Executes a shell command and returns its output.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {import('../../src/types/tools.js').ToolContext} context - Tool context.
 * @returns {Promise<import('../../src/types/tools.js').ToolHandlerResult>} Handler result.
 */
export async function execCommand(args, context) {
  try {
    // Validate required parameters
    if (!args.command || typeof args.command !== 'string') {
      return {
        output: 'Error: Missing or invalid required parameter "command"',
      };
    }

    if (args.command.trim() === '') {
      return {
        output: 'Error: Command parameter cannot be empty',
      };
    }

    // Resolve cwd
    const cwd = args.cwd
      ? resolvePath(args.cwd, context.workingDirectory)
      : context.workingDirectory;

    // Default timeout to 30000ms
    const timeout = typeof args.timeout === 'number' ? args.timeout : 30000;

    // Create AbortController for timeout and cancellation
    const controller = new AbortController();
    let timeoutId;

    // Set up timeout
    if (timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    // If context has a signal, listen to it and propagate abort
    if (context.signal) {
      context.signal.addEventListener('abort', () => {
        controller.abort();
      });
    }

    try {
      // Execute the command with sanitized environment
      const { stdout, stderr } = await execAsync(args.command, {
        cwd,
        env: sanitizeEnv(context.env),
        signal: controller.signal,
        encoding: 'utf-8',
      });

      // Clear timeout if command completed
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Format output with stdout, stderr, and exit code
      let output = '';

      if (stdout) {
        output += `STDOUT:\n${stdout}\n`;
      }

      if (stderr) {
        output += `STDERR:\n${stderr}\n`;
      }

      output += 'exit code: 0';

      return { output };
    } catch (error) {
      // Clear timeout if command failed
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Handle abort/timeout
      if (error.name === 'AbortError' || controller.signal.aborted) {
        return {
          output: 'Error: Command execution aborted (timeout or cancelled)',
        };
      }

      // Handle command execution error (non-zero exit code or other errors)
      let output = '';

      if (error.stdout) {
        output += `STDOUT:\n${error.stdout}\n`;
      }

      if (error.stderr) {
        output += `STDERR:\n${error.stderr}\n`;
      }

      // Include exit code if available
      if (typeof error.code === 'number') {
        output += `exit code: ${error.code}`;
      } else {
        // Command not found or other error
        output += `Error: ${error.message}`;
      }

      return { output };
    }
  } catch (error) {
    // Handle unexpected errors
    return {
      output: `Error executing command: ${error.message}`,
    };
  }
}

// PluginManager looks up handlers by tool name; export aliases for both names
export { execCommand as shell_exec };

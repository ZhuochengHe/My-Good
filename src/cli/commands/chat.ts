/**
 * Chat command for CLI.
 * Handles interactive chat and single message execution.
 */

import type { SessionManager } from '../../session/session-manager.js';
import type { OutputAdapter } from '../output-adapter.js';
import type { InputReader } from '../input-reader.js';

/**
 * Chat command options.
 */
export interface ChatOptions {
  /** Session manager */
  readonly sessionManager: SessionManager;
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Input reader */
  readonly input: InputReader;
  /** Existing session ID to resume (optional) */
  readonly sessionId?: string;
  /** Single message to send (non-interactive mode) */
  readonly message?: string;
}

/**
 * Run interactive chat or single message.
 *
 * If message is provided, runs in single-message mode.
 * Otherwise, runs interactive REPL until user types "exit" or "quit".
 *
 * @param options - Command options
 *
 * @example
 * // Interactive mode
 * await chat({ sessionManager, output, input });
 *
 * @example
 * // Single message mode
 * await chat({ sessionManager, output, input, message: 'Hello' });
 *
 * @example
 * // Resume existing session
 * await chat({ sessionManager, output, input, sessionId: 'abc-123' });
 */
export async function chat(options: ChatOptions): Promise<void> {
  try {
    // Create or resume session
    let sessionId: string;

    if (options.sessionId) {
      await options.sessionManager.resumeSession(options.sessionId);
      sessionId = options.sessionId;
      options.output.write(`Resumed session: ${sessionId}\n`);
    } else {
      sessionId = await options.sessionManager.createSession();
      options.output.write(`Created new session: ${sessionId}\n`);
    }

    // Single message mode
    if (options.message) {
      await runSingleMessage(options, sessionId);
      return;
    }

    // Interactive mode
    await runInteractive(options, sessionId);
  } catch (error) {
    options.output.writeError(
      `Chat error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Run single message and exit.
 *
 * @param options - Command options
 * @param sessionId - Session ID
 */
async function runSingleMessage(
  options: ChatOptions,
  sessionId: string
): Promise<void> {
  if (!options.message) {
    return;
  }

  options.output.write('');

  // Run agent with message
  const result = await options.sessionManager.run(sessionId, options.message);

  // Display result
  if (result.success) {
    options.output.write(result.response);
    options.output.write('');

    // Display token usage
    if (result.tokenUsage) {
      options.output.writeTokenUsage(result.tokenUsage);
    }
  } else {
    options.output.writeError(result.error ?? 'Unknown error');
  }
}

/**
 * Run interactive REPL.
 *
 * @param options - Command options
 * @param sessionId - Session ID
 */
async function runInteractive(
  options: ChatOptions,
  sessionId: string
): Promise<void> {
  // Display welcome message
  options.output.write('\nWelcome to interactive chat!');
  options.output.write('Type your message and press Enter.');
  options.output.write('Use \\ at the end of a line to continue on the next line.');
  options.output.write('Type "exit" or "quit" to end the session.\n');

  // REPL loop
  let isRunning = true;

  while (isRunning) {
    try {
      // Prompt for input
      const userInput = await options.input.prompt('> ');

      // Check for exit commands
      const trimmedInput = userInput.trim().toLowerCase();
      if (trimmedInput === 'exit' || trimmedInput === 'quit') {
        options.output.write('Goodbye!');
        isRunning = false;
        break;
      }

      // Skip empty input
      if (userInput.trim() === '') {
        continue;
      }

      // Run agent
      const result = await options.sessionManager.run(sessionId, userInput);

      // Display result
      options.output.write('');
      if (result.success) {
        options.output.write(result.response);
        options.output.write('');

        // Display token usage
        if (result.tokenUsage) {
          options.output.writeTokenUsage(result.tokenUsage);
        }
      } else {
        options.output.writeError(result.error ?? 'Unknown error');
      }

      options.output.write('');
    } catch (error) {
      options.output.writeError(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Clean up
  options.input.close();
}

/**
 * Standard input reader.
 * Reads user input from stdin with multi-line support.
 */

import * as readline from 'readline';
import type { InputReader } from './input-reader.js';

/**
 * Standard input reader.
 * Reads from stdin with support for multi-line input using backslash continuation.
 *
 * Example:
 *   const reader = new StdinInputReader();
 *
 *   // Single line input
 *   const input1 = await reader.prompt('> ');  // User: Hello
 *   // Returns: "Hello"
 *
 *   // Multi-line input
 *   const input2 = await reader.prompt('> ');  // User: First line \
 *                                               //       ... Second line
 *   // Returns: "First line Second line"
 *
 *   reader.close();
 */
export class StdinInputReader implements InputReader {
  /**
   * Prompt user for input.
   * Supports multi-line input with backslash (\) continuation.
   *
   * When a line ends with '\', prompts for continuation with '... '.
   * Continuation lines are joined with spaces, preserving internal whitespace.
   *
   * @param promptText - Initial prompt text to display
   * @returns Promise resolving to complete user input
   */
  async prompt(promptText: string): Promise<string> {
    const lines: string[] = [];
    let currentPrompt = promptText;
    let shouldContinue = true;

    while (shouldContinue) {
      const line = await this.readLine(currentPrompt);

      // Check if line ends with backslash (with optional trailing whitespace)
      const trimmedLine = line.trimEnd();
      if (trimmedLine.endsWith('\\')) {
        // Remove trailing backslash and add to lines
        const lineWithoutBackslash = trimmedLine.slice(0, -1).trimEnd();
        lines.push(lineWithoutBackslash);
        // Use continuation prompt
        currentPrompt = '... ';
      } else {
        // No continuation, add final line
        lines.push(trimmedLine);
        shouldContinue = false;
      }
    }

    // Join all lines with spaces
    return lines.join(' ').trim();
  }

  /**
   * Read a single line from stdin.
   *
   * @param promptText - Prompt text to display
   * @returns Promise resolving to line of input
   */
  private async readLine(promptText: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  /**
   * Close the input reader.
   * For stdin reader, this is a no-op as readline interfaces are closed per-prompt.
   */
  close(): void {
    // No-op: readline interfaces are created and closed per-prompt
  }
}

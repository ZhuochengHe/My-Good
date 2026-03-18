/**
 * Plain text output adapter.
 * Writes to stdout/stderr without colors or formatting.
 */

import type { OutputAdapter, TokenUsage } from './output-adapter.js';

/**
 * Plain text output adapter.
 * Writes to stdout/stderr with simple text formatting.
 *
 * Example:
 *   const output = new PlainTextOutput();
 *   output.write('Hello');                    // stdout: Hello
 *   output.writeError('Failed');              // stderr: Error: Failed
 *   output.writeSuccess('Done');              // stdout: Success: Done
 *   output.writeTokenUsage({...});            // stdout: [Tokens: ...]
 */
export class PlainTextOutput implements OutputAdapter {
  /**
   * Write normal output text to stdout.
   * Adds newline if not present.
   *
   * @param text - Text to write
   */
  write(text: string): void {
    const output = text.endsWith('\n') ? text : `${text}\n`;
    process.stdout.write(output);
  }

  /**
   * Write error message to stderr.
   * Adds "Error: " prefix if not present.
   *
   * @param text - Error message to write
   */
  writeError(text: string): void {
    const message = text.startsWith('Error:') ? text : `Error: ${text}`;
    const output = message.endsWith('\n') ? message : `${message}\n`;
    process.stderr.write(output);
  }

  /**
   * Write success message to stdout.
   * Adds "Success: " prefix if not present.
   *
   * @param text - Success message to write
   */
  writeSuccess(text: string): void {
    const message = text.startsWith('Success:') ? text : `Success: ${text}`;
    const output = message.endsWith('\n') ? message : `${message}\n`;
    process.stdout.write(output);
  }

  /**
   * Write token usage information to stdout.
   * Format: ↑ X  ↓ Y  ∑ Z
   *
   * @param usage - Token usage statistics
   */
  writeTokenUsage(usage: TokenUsage): void {
    process.stdout.write(`  ↑ ${usage.inputTokens}  ↓ ${usage.outputTokens}  ∑ ${usage.totalTokens}\n`);
  }

  /**
   * Format the user prompt string as plain text.
   *
   * @param label - User label (e.g. "you")
   * @returns Plain prompt string
   */
  formatUserPrompt(label: string): string {
    return `${label} › `;
  }

  /**
   * Format an agent response line as plain text.
   *
   * @param label - Agent label (e.g. "agent")
   * @param response - Agent response text
   * @returns Plain agent line string
   */
  formatAgentLine(label: string, response: string): string {
    return `${label} › ${response}`;
  }

  /**
   * Start loading indicator.
   * For plain text output, just writes the message.
   *
   * @param message - Loading message to display
   */
  startLoading(message: string): void {
    this.write(message);
  }

  /**
   * Stop loading indicator.
   * For plain text output, this is a no-op (no spinner to clear).
   */
  stopLoading(): void {
    // No-op for plain text output
  }

  /**
   * Update loading indicator text.
   * For plain text output, this is a no-op (no spinner to update).
   *
   * @param _message - Ignored for plain text output
   */
  updateLoading(_message: string): void {
    // no-op for plain text output
  }
}

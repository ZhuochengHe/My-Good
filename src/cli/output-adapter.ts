/**
 * Output adapter interface for CLI.
 * Provides abstraction layer for different output formats (plain text, colored, TUI).
 */

/**
 * Token usage information for display.
 */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/**
 * Output adapter interface.
 * Implementations can provide different output formats (plain text, colors, TUI).
 *
 * Example:
 *   const output = new PlainTextOutput();
 *   output.write('Hello, world!');
 *   output.writeError('Something failed');
 *   output.writeSuccess('Task completed');
 *   output.writeTokenUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
 */
export interface OutputAdapter {
  /**
   * Write normal output text.
   *
   * @param text - Text to write
   */
  write(text: string): void;

  /**
   * Write error message.
   *
   * @param text - Error message to write
   */
  writeError(text: string): void;

  /**
   * Write success message.
   *
   * @param text - Success message to write
   */
  writeSuccess(text: string): void;

  /**
   * Write token usage information.
   *
   * @param usage - Token usage statistics
   */
  writeTokenUsage(usage: TokenUsage): void;

  /**
   * Start loading indicator (optional).
   *
   * @param message - Loading message to display
   */
  startLoading?(message: string): void;

  /**
   * Stop loading indicator (optional).
   */
  stopLoading?(): void;
}

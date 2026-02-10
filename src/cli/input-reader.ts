/**
 * Input reader interface for CLI.
 * Provides abstraction for reading user input.
 */

/**
 * Input reader interface.
 * Implementations can provide different input sources (stdin, file, network).
 *
 * Example:
 *   const reader = new StdinInputReader();
 *   const input = await reader.prompt('> ');
 *   console.log('User said:', input);
 *   reader.close();
 */
export interface InputReader {
  /**
   * Prompt user for input.
   * Supports multi-line input with backslash continuation.
   *
   * @param promptText - Prompt text to display
   * @returns Promise resolving to user input
   *
   * @example
   * // Single line
   * await reader.prompt('> ')  // User types: Hello
   * // Returns: "Hello"
   *
   * @example
   * // Multi-line with backslash
   * await reader.prompt('> ')  // User types: First line \
   *                            //            ... Second line
   * // Returns: "First line Second line"
   */
  prompt(promptText: string): Promise<string>;

  /**
   * Close the input reader and cleanup resources.
   */
  close(): void;
}

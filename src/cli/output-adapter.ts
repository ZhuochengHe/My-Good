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
 * Information used to render the chat session header.
 *
 * Example:
 *   const info: ChatHeaderInfo = {
 *     agentName: 'My Agent',
 *     provider: 'kimi',
 *     model: 'kimi-k2-0905-preview',
 *     sessionId: 'a1b2c3d4',
 *     userLabel: 'you',
 *     agentLabel: 'agent',
 *   };
 */
export interface ChatHeaderInfo {
  /** Display name of the agent */
  readonly agentName: string;
  /** Provider identifier (e.g. "anthropic", "openai") */
  readonly provider: string;
  /** Model identifier */
  readonly model: string;
  /** Session ID (typically shortened to first 8 chars at the call site) */
  readonly sessionId: string;
  /** Label shown in the user prompt (e.g. "you") */
  readonly userLabel: string;
  /** Label shown before each agent response (e.g. "agent") */
  readonly agentLabel: string;
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

  /**
   * Render a styled chat session header (optional).
   * Implementations should display agent name, provider, model,
   * session ID, and exit hint in a visually distinct box.
   *
   * @param info - Header data to render
   */
  writeHeader?(info: ChatHeaderInfo): void;
}

/**
 * Colored output adapter using chalk and ora.
 * Provides styled terminal output with colors and spinner support.
 */

import { Chalk } from 'chalk';
import ora, { type Ora } from 'ora';
import type { OutputAdapter, TokenUsage } from './output-adapter.js';

// Determine color support level.
// process.stdout.isTTY is undefined in some WSL2/subprocess contexts even
// when the terminal supports colors. Fall back to TERM/COLORTERM env vars.
function resolveChalkLevel(): 0 | 1 | 2 | 3 {
  if (process.stdout.isTTY) return 3;
  const term = process.env['TERM'] ?? '';
  const colorterm = process.env['COLORTERM'] ?? '';
  if (colorterm === 'truecolor' || colorterm === '24bit') return 3;
  if (term.includes('256color')) return 2;
  if (term !== '' && term !== 'dumb') return 1;
  return 0;
}

const chalk = new Chalk({ level: resolveChalkLevel() });

/**
 * Factory function that creates a spinner instance.
 */
export type SpinnerFactory = (text: string) => Ora;

/**
 * Options for ColoredOutput construction.
 */
export interface ColoredOutputOptions {
  /** Injectable spinner factory for testing. Defaults to ora. */
  readonly spinnerFactory?: SpinnerFactory;
}

/**
 * Colored terminal output adapter.
 * Uses chalk for colors and ora for spinner support.
 *
 * Example:
 *   const output = new ColoredOutput();
 *   output.write('Hello');                    // stdout: Hello
 *   output.writeError('Failed');              // stderr: Error: Failed  (bold red)
 *   output.writeSuccess('Done');              // stdout: Success: Done  (bold green)
 *   output.writeTokenUsage({...});            // stdout: tokens 100→50  total 150  (dim cyan)
 *   output.startLoading('Thinking...');       // spinner starts
 *   output.stopLoading();                     // spinner stops
 */
export class ColoredOutput implements OutputAdapter {
  private spinner: Ora | null = null;
  private readonly spinnerFactory: SpinnerFactory;

  constructor(options: ColoredOutputOptions = {}) {
    this.spinnerFactory = options.spinnerFactory ?? ((text: string): Ora => ora({ text }));
  }

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
   * Write error message to stderr in bold red.
   * Adds "Error: " prefix if not present.
   *
   * @param text - Error message to write
   */
  writeError(text: string): void {
    const message = text.startsWith('Error:') ? text : `Error: ${text}`;
    process.stderr.write(chalk.bold.red(message.trimEnd()) + '\n');
  }

  /**
   * Write success message to stdout in bold green.
   * Adds "Success: " prefix if not present.
   *
   * @param text - Success message to write
   */
  writeSuccess(text: string): void {
    const message = text.startsWith('Success:') ? text : `Success: ${text}`;
    process.stdout.write(chalk.bold.green(message.trimEnd()) + '\n');
  }

  /**
   * Write token usage information to stdout in dim cyan.
   * Format: tokens 150→75  total 225
   *
   * @param usage - Token usage statistics
   */
  writeTokenUsage(usage: TokenUsage): void {
    const message = `tokens ${usage.inputTokens}→${usage.outputTokens}  total ${usage.totalTokens}`;
    process.stdout.write(chalk.dim.cyan(message) + '\n');
  }

  /**
   * Start ora spinner with a loading message.
   *
   * @param message - Loading message to display
   */
  startLoading(message: string): void {
    this.spinner = this.spinnerFactory(message);
    this.spinner.start();
  }

  /**
   * Stop the active spinner.
   * No-op if no spinner is running.
   */
  stopLoading(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }
}

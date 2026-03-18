/**
 * Colored output adapter using chalk and ora.
 * Provides styled terminal output with colors and spinner support.
 */

import { Chalk } from 'chalk';
import ora, { type Ora } from 'ora';
import type { OutputAdapter, TokenUsage, ChatHeaderInfo } from './output-adapter.js';

/**
 * Determine the chalk color support level for the current environment.
 * Respects NO_COLOR per https://no-color.org, then falls back to TTY detection
 * and TERM/COLORTERM env vars for WSL2/subprocess contexts.
 *
 * @returns Chalk color level (0 = no color, 1 = basic, 2 = 256, 3 = truecolor)
 */
export function resolveChalkLevel(): 0 | 1 | 2 | 3 {
  if (process.env['NO_COLOR'] !== undefined) return 0;
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
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private loadingStartTime: number = 0;

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
   * Format: ↑ 150  ↓ 75  ∑ 225
   *
   * @param usage - Token usage statistics
   */
  writeTokenUsage(usage: TokenUsage): void {
    const line = `↑ ${usage.inputTokens}  ↓ ${usage.outputTokens}  ∑ ${usage.totalTokens}`;
    process.stdout.write(chalk.dim.cyan(`  ${line}\n`));
  }

  /**
   * Start ora spinner with a loading message.
   * After 5 seconds, updates the spinner text to include elapsed time.
   *
   * @param message - Loading message to display
   */
  startLoading(message: string): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    this.spinner = this.spinnerFactory(message);
    this.spinner.start();
    this.loadingStartTime = Date.now();

    this.elapsedTimer = setInterval(() => {
      if (!this.spinner) return;
      const elapsed = Math.floor((Date.now() - this.loadingStartTime) / 1000);
      if (elapsed >= 5) {
        this.spinner.text = `${message} (${elapsed}s)`;
      }
    }, 1000);
  }

  /**
   * Update the active spinner text without stopping it.
   * No-op if no spinner is running.
   *
   * @param message - New spinner message to display
   */
  updateLoading(message: string): void {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  /**
   * Stop the active spinner and clear the elapsed timer.
   * No-op if no spinner is running.
   */
  stopLoading(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /**
   * Render a styled chat header box to stdout.
   * Fixed 56-char inner width; fits cleanly on standard 80-col terminals.
   *
   * Example output (no memory entries):
   *   ╭──────────────────────────────────────────────────────╮
   *   │  My Agent  ·  anthropic  ·  claude-sonnet-4          │
   *   │  Session: a1b2c3d4  ·  ? for help · exit            │
   *   ╰──────────────────────────────────────────────────────╯
   *
   * Example output (with memory entries):
   *   ╭──────────────────────────────────────────────────────╮
   *   │  My Agent  ·  anthropic  ·  claude-sonnet-4          │
   *   │  Session: a1b2c3d4  ·  mem 12  ·  exit              │
   *   ╰──────────────────────────────────────────────────────╯
   *
   * @param info - Header data to render
   */
  writeHeader(info: ChatHeaderInfo): void {
    // Inner width between the two vertical bars (excluding the bars themselves).
    const INNER = 56;
    const HORIZONTAL = '─'.repeat(INNER);

    const top    = chalk.dim(`╭${HORIZONTAL}╮`);
    const bottom = chalk.dim(`╰${HORIZONTAL}╯`);

    // Row 1: agent name  ·  provider  ·  model
    const agentPart    = chalk.bold.white(info.agentName);
    const providerPart = chalk.dim(info.provider);
    const modelPart    = chalk.dim.cyan(info.model);
    const separator    = chalk.dim('  ·  ');
    const row1Content  = `${agentPart}${separator}${providerPart}${separator}${modelPart}`;
    const row1         = this.buildBoxRow(row1Content, INNER);

    // Row 2: Session: <short id>  ·  [mem N  ·  ]? for help · exit
    // When memoryEntryCount is provided and > 0, a compact "mem N  ·  exit"
    // variant is shown so all content fits within INNER=56 visible characters.
    // Without memory indicator the full hint "? for help · exit" is shown.
    const sessionPart = chalk.dim(`Session: ${chalk.white(info.sessionId)}`);
    let row2Content: string;
    if (info.memoryEntryCount !== undefined && info.memoryEntryCount > 0) {
      const memPart  = chalk.dim(`mem ${info.memoryEntryCount}`);
      const exitPart = chalk.dim('exit');
      row2Content = `${sessionPart}${separator}${memPart}${separator}${exitPart}`;
    } else {
      const hintPart = chalk.dim('? for help · exit');
      row2Content = `${sessionPart}${separator}${hintPart}`;
    }
    const row2 = this.buildBoxRow(row2Content, INNER);

    process.stdout.write(`\n${top}\n${row1}\n${row2}\n${bottom}\n\n`);
  }

  /**
   * Format the user prompt string with cyan label and dim separator.
   *
   * @param label - User label (e.g. "you")
   * @returns Chalk-styled prompt string
   */
  formatUserPrompt(label: string): string {
    return chalk.cyan(label) + chalk.dim(' › ');
  }

  /**
   * Format an agent response line with green label and dim separator.
   *
   * @param label - Agent label (e.g. "agent")
   * @param response - Agent response text
   * @returns Chalk-styled agent line string
   */
  formatAgentLine(label: string, response: string): string {
    return chalk.green(label) + chalk.dim(' › ') + response;
  }

  /**
   * Build a single box row padded to INNER visible characters.
   * Because chalk escape sequences have zero visible width, we pad based
   * on the raw text length rather than the styled string length.
   *
   * @param styledContent - Chalk-styled string for the row body
   * @param innerWidth - Total inner width in visible characters
   * @returns Formatted box row string with dim vertical borders
   */
  private buildBoxRow(styledContent: string, innerWidth: number): string {
    // Strip ANSI codes to measure visible length.
    // eslint-disable-next-line no-control-regex
    const ansiPattern = /\x1B\[[0-9;]*m/g;
    const visibleLength = styledContent.replace(ansiPattern, '').length;
    // Leading two spaces + content + trailing padding + two spaces before border
    const contentWithPadding = `  ${styledContent}${' '.repeat(Math.max(0, innerWidth - visibleLength - 2))}`;
    return `${chalk.dim('│')}${contentWithPadding}${chalk.dim('│')}`;
  }
}

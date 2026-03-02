/**
 * Password input reader for CLI.
 * Reads sensitive input (like API keys) without echoing to terminal.
 */

import * as readline from 'readline';

/**
 * Read a password from stdin without echoing.
 *
 * @param promptText - Prompt text to display
 * @returns Promise resolving to password input
 *
 * @example
 * const password = await promptPassword('Enter API key: ');
 */
export async function promptPassword(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    // If not a TTY, fall back to normal readline (can't hide input)
    if (!stdin.isTTY) {
      const rl = readline.createInterface({
        input: stdin,
        output: stdout,
      });

      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    // For TTY, use raw mode to hide input
    stdout.write(promptText);
    stdin.setRawMode(true);
    stdin.resume();

    let password = '';

    const onData = (data: Buffer): void => {
      const char = data.toString('utf8');
      const keyCode = data[0];

      // Handle Ctrl+C
      if (keyCode === 3) {
        stdout.write('\n');
        stdin.setRawMode(false);
        process.exit(0);
      }

      // Handle Enter
      if (keyCode === 13 || keyCode === 10) {
        stdout.write('\n');
        stdin.off('data', onData);
        stdin.setRawMode(false);
        resolve(password);
        return;
      }

      // Handle Backspace
      if (keyCode === 127) {
        if (password.length > 0) {
          password = password.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }

      // Add printable characters to password, one '*' per character
      const printable = char.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '');
      if (printable.length > 0) {
        password += printable;
        stdout.write('*'.repeat(printable.length));
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Read a line from stdin with visible input.
 *
 * @param promptText - Prompt text to display
 * @returns Promise resolving to user input
 *
 * @example
 * const input = await promptLine('Enter value: ');
 */
export async function promptLine(promptText: string): Promise<string> {
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

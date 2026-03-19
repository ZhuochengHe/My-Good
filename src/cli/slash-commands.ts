/**
 * Slash command dispatcher for the interactive chat REPL.
 * Handles built-in commands (/help, /session, /model, /clear, /exit)
 * without forwarding input to the LLM.
 */

import type { OutputAdapter } from './output-adapter.js';
import type { SessionManager, SearchFilters } from '../session/session-manager.js';
import type { AppConfig } from '../types/config.js';

/**
 * Context provided to slash command handlers.
 */
export interface SlashCommandContext {
  /** Output adapter for writing results. */
  readonly output: OutputAdapter;
  /** Session manager for session operations. */
  readonly sessionManager: SessionManager;
  /** Active session ID for the current chat. */
  readonly sessionId: string;
  /** Full application config (optional). */
  readonly config?: AppConfig;
}

/**
 * Result returned by a slash command handler.
 */
export interface SlashCommandResult {
  /** True if the input was a recognized slash command (do not send to LLM). */
  readonly handled: boolean;
  /** True if the REPL should exit after this command. */
  readonly shouldExit: boolean;
}

/**
 * Dispatches a slash command input to the appropriate handler.
 * Returns { handled: false, shouldExit: false } for non-slash or unknown commands.
 *
 * @param input - Raw user input string
 * @param context - Context including output adapter, session manager, and config
 * @returns Result indicating whether the command was handled and if REPL should exit
 *
 * @example
 * const result = await handleSlashCommand('/help', context);
 * if (result.handled) {
 *   // do not forward to LLM
 * }
 */
export async function handleSlashCommand(
  input: string,
  context: SlashCommandContext,
): Promise<SlashCommandResult> {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { handled: false, shouldExit: false };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase() ?? '';
  const args = parts.slice(1);

  switch (command) {
    case 'help':
    case '?':
      writeHelp(context.output);
      return { handled: true, shouldExit: false };

    case 'exit':
    case 'quit':
      return { handled: true, shouldExit: true };

    case 'clear':
      context.output.write('\x1Bc');
      return { handled: true, shouldExit: false };

    case 'session':
      await handleSession(args, context);
      return { handled: true, shouldExit: false };

    case 'model':
      handleModel(context);
      return { handled: true, shouldExit: false };

    default:
      context.output.writeError(
        `Unknown command: /${command}. Type /help for available commands.`,
      );
      return { handled: true, shouldExit: false };
  }
}

/**
 * Write the help text listing all available slash commands.
 *
 * @param output - Output adapter to write to
 */
function writeHelp(output: OutputAdapter): void {
  output.write('');
  output.write('Available commands:');
  output.write('  /help, /?          Show this help');
  output.write('  /session           List recent sessions');
  output.write('  /session <id>      Show session details');
  output.write('  /model             Show current model');
  output.write('  /clear             Clear the terminal');
  output.write('  /exit, /quit       Exit the chat');
  output.write('');
  output.write('Tips:');
  output.write('  exit, quit         Also exits the chat');
  output.write('  \\                  Continue input on next line');
  output.write('');
}

/**
 * Handle the /session command.
 * With no arguments, lists recent sessions.
 * With an id argument, shows details for that session.
 *
 * @param args - Remaining command arguments after "session"
 * @param context - Slash command context
 */
async function handleSession(
  args: string[],
  context: SlashCommandContext,
): Promise<void> {
  if (args.length > 0) {
    const sessionId = args[0]!;
    try {
      // Search all sessions and find the one matching this id prefix/exact match.
      const all = await context.sessionManager.searchSessions({} as SearchFilters);
      const match = all.find(
        (s) => s.id === sessionId || s.id.startsWith(sessionId),
      );
      if (!match) {
        context.output.writeError(`Session not found: ${sessionId}`);
        return;
      }
      context.output.write('');
      context.output.write(`Session: ${match.id}`);
      context.output.write(
        `Created: ${new Date(match.createdAt).toLocaleString()}`,
      );
      if (match.description) {
        context.output.write(`Description: ${match.description}`);
      }
      context.output.write(`Messages: ${match.messageCount}`);
      context.output.write('');
    } catch {
      context.output.writeError(`Failed to load session: ${sessionId}`);
    }
    return;
  }

  // List recent sessions
  try {
    const sessions = await context.sessionManager.searchSessions(
      {} as SearchFilters,
    );
    if (sessions.length === 0) {
      context.output.write('No sessions found.');
      return;
    }
    context.output.write('');
    context.output.write('Recent sessions:');
    // Show up to 10 most recent (store returns all; slice from end for recency).
    const recent = sessions.slice(-10).reverse();
    for (const s of recent) {
      const date = new Date(s.createdAt).toLocaleDateString();
      const desc = s.description || '(no description)';
      context.output.write(`  ${s.id.slice(0, 8)}  ${date}  ${desc}`);
    }
    context.output.write('');
    context.output.write(
      `Use /session <id> for details or --session <id> to resume.`,
    );
    context.output.write('');
  } catch {
    context.output.writeError('Failed to list sessions.');
  }
}

/**
 * Handle the /model command.
 * Prints the current provider and model from config.
 *
 * @param context - Slash command context
 */
function handleModel(context: SlashCommandContext): void {
  const provider = context.config?.agent.provider ?? 'unknown';
  const model = context.config?.agent.model ?? 'unknown';
  context.output.write('');
  context.output.write(`Provider: ${provider}`);
  context.output.write(`Model:    ${model}`);
  context.output.write('');
  context.output.write('To change: my-agent setup');
  context.output.write('');
}

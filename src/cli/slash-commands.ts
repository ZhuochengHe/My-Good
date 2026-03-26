/**
 * Slash command dispatcher for the interactive chat REPL.
 * Handles built-in commands (/help, /session, /model, /clear, /exit)
 * without forwarding input to the LLM.
 */

import type { OutputAdapter } from './output-adapter.js';
import type { SessionManager, SearchFilters } from '../session/session-manager.js';
import type { AppConfig } from '../types/config.js';
import type { MemoryStore, MemoryKind } from '../types/memory.js';
import type { InputReader } from './input-reader.js';

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
  /** Memory store for /memory command (optional). */
  readonly memoryStore?: MemoryStore;
  /** Input reader for interactive prompts in /memory command (optional). */
  readonly input?: InputReader;
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

    case 'compact':
      await handleCompact(args, context);
      return { handled: true, shouldExit: false };

    case 'memory':
      await handleMemory(args, context);
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
  output.write('  /compact [hint]    Summarize and reset conversation context');
  output.write('  /memory            Browse and delete memory entries');
  output.write('  /memory clear-all  Delete ALL memories (prompts for confirmation)');
  output.write('  /clear             Clear the terminal');
  output.write('  /exit, /quit       Exit the chat');
  output.write('');
  output.write('Tips:');
  output.write('  exit, quit         Also exits the chat');
  output.write('  \\                  Continue input on next line');
  output.write('');
}

/**
 * Handle the /compact [instructions] command.
 * Summarizes conversation history and resets in-memory context.
 *
 * @param args - Optional instruction words after "compact"
 * @param context - Slash command context
 */
async function handleCompact(
  args: string[],
  context: SlashCommandContext,
): Promise<void> {
  const instructions = args.length > 0 ? args.join(' ') : undefined;
  context.output.write('');
  context.output.write('Compacting conversation...');
  try {
    const summary = await context.sessionManager.compact(context.sessionId, instructions);
    context.output.write('');
    context.output.write('Conversation compacted. Summary:');
    context.output.write('');
    context.output.write(summary);
    context.output.write('');
    context.output.write('Context reset. You can continue the conversation.');
    context.output.write('');
  } catch (err) {
    context.output.writeError(
      `Failed to compact: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
 * Handle the /memory [clear-all] command.
 *
 * With no arguments: interactive flow — choose kind → pick entry → confirm delete.
 * With "clear-all": prompt once then delete every memory entry.
 *
 * @param args - Remaining command arguments after "memory"
 * @param context - Slash command context (requires memoryStore and input)
 */
async function handleMemory(
  args: string[],
  context: SlashCommandContext,
): Promise<void> {
  const { output, memoryStore, input } = context;

  if (!memoryStore || !input) {
    output.writeError('Memory management is not available in this mode.');
    return;
  }

  // /memory clear-all — delete everything after a single confirmation
  if (args[0]?.toLowerCase() === 'clear-all') {
    output.write('');
    output.write('This will permanently delete ALL memory entries.');
    const confirm = await input.prompt('Type "yes" to confirm: ');
    if (confirm.trim().toLowerCase() !== 'yes') {
      output.write('Cancelled.');
      output.write('');
      return;
    }
    const all = await memoryStore.search({});
    let deleted = 0;
    for (const entry of all) {
      await memoryStore.delete(entry.id);
      deleted++;
    }
    output.write('');
    output.writeSuccess(`Deleted ${deleted} memory ${deleted === 1 ? 'entry' : 'entries'}.`);
    output.write('');
    return;
  }

  // /memory — interactive browse and delete
  const KINDS: MemoryKind[] = ['preference', 'experiential', 'semantic', 'episodic'];

  output.write('');
  output.write('Memory kinds:');
  output.write('  [1] preference');
  output.write('  [2] experiential');
  output.write('  [3] semantic');
  output.write('  [4] episodic');
  output.write('  [5] all');
  output.write('');

  const kindChoice = await input.prompt('Select kind (1–5, or Enter to cancel): ');
  const kindTrimmed = kindChoice.trim();
  if (kindTrimmed === '') {
    output.write('Cancelled.');
    output.write('');
    return;
  }

  const kindIndex = parseInt(kindTrimmed, 10);
  if (isNaN(kindIndex) || kindIndex < 1 || kindIndex > 5) {
    output.writeError('Invalid choice.');
    output.write('');
    return;
  }

  const selectedKind: MemoryKind | undefined = kindIndex <= 4 ? KINDS[kindIndex - 1] : undefined;
  const entries = await memoryStore.search(selectedKind ? { kind: selectedKind } : {});

  if (entries.length === 0) {
    output.write('No memory entries found.');
    output.write('');
    return;
  }

  output.write('');
  output.write(`Found ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}:`);
  output.write('');

  entries.forEach((entry, i) => {
    const preview = entry.content.length > 80
      ? entry.content.slice(0, 77) + '...'
      : entry.content;
    const kindLabel = `[${entry.kind}]`.padEnd(14);
    output.write(`  [${i + 1}] ${kindLabel} ${preview}`);
  });
  output.write('');

  const entryChoice = await input.prompt('Select entry to view/delete (number, or Enter to cancel): ');
  const entryTrimmed = entryChoice.trim();
  if (entryTrimmed === '') {
    output.write('Cancelled.');
    output.write('');
    return;
  }

  const entryIndex = parseInt(entryTrimmed, 10);
  if (isNaN(entryIndex) || entryIndex < 1 || entryIndex > entries.length) {
    output.writeError('Invalid selection.');
    output.write('');
    return;
  }

  const selected = entries[entryIndex - 1]!;
  const createdAt = new Date(selected.createdAt).toLocaleDateString();

  output.write('');
  output.write('─'.repeat(60));
  output.write(`Kind:    ${selected.kind}`);
  output.write(`Created: ${createdAt}`);
  output.write(`Tags:    ${selected.tags.join(', ') || '(none)'}`);
  output.write('');
  output.write(selected.content);
  output.write('─'.repeat(60));
  output.write('');

  const deleteChoice = await input.prompt('Delete this entry? [y/N]: ');
  if (deleteChoice.trim().toLowerCase() !== 'y') {
    output.write('Not deleted.');
    output.write('');
    return;
  }

  await memoryStore.delete(selected.id);
  output.writeSuccess('Entry deleted.');
  output.write('');
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

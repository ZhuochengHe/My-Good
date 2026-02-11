/**
 * Session commands for CLI.
 * Handles session list, show, and delete operations.
 */

import type { SessionManager } from '../../session/session-manager.js';
import type { OutputAdapter } from '../output-adapter.js';
import type {
  Session,
  SessionStoreWithTrace,
  TurnMetadataRecord,
  ErrorLogRecord,
} from '../../types/sessions.js';

/**
 * Session list command options.
 */
export interface SessionListOptions {
  /** Session manager */
  readonly sessionManager: SessionManager;
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Filter by tag */
  readonly tag?: string;
  /** Filter by query string */
  readonly query?: string;
}

/**
 * Session show command options.
 */
export interface SessionShowOptions {
  /** Session manager */
  readonly sessionManager: SessionManager;
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Session ID to show */
  readonly sessionId: string;
  /** Show trace data (turn metadata and error logs) */
  readonly trace?: boolean;
}

/**
 * Session delete command options.
 */
export interface SessionDeleteOptions {
  /** Session manager */
  readonly sessionManager: SessionManager;
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Session ID to delete */
  readonly sessionId: string;
}

/**
 * List all sessions.
 * Displays session IDs, descriptions, tags, and message counts.
 *
 * @param options - Command options
 *
 * @example
 * await sessionList({ sessionManager, output, tag: 'coding' });
 */
export async function sessionList(options: SessionListOptions): Promise<void> {
  try {
    // Build search filters
    const filters: { tag?: string; query?: string } = {};
    if (options.tag) {
      filters.tag = options.tag;
    }
    if (options.query) {
      filters.query = options.query;
    }

    // Search sessions
    const sessions = await options.sessionManager.searchSessions(filters);

    if (sessions.length === 0) {
      options.output.write('No sessions found.');
      return;
    }

    // Display header
    options.output.write(`\nFound ${sessions.length} session(s):\n`);

    // Display each session
    for (const session of sessions) {
      options.output.write(`\nID: ${session.id}`);
      options.output.write(`Description: ${session.description || '(none)'}`);
      options.output.write(`Tags: ${session.tags.join(', ') || '(none)'}`);
      options.output.write(`Messages: ${session.messageCount}`);
      options.output.write(
        `Created: ${new Date(session.createdAt).toLocaleString()}`
      );
      options.output.write(
        `Updated: ${new Date(session.updatedAt).toLocaleString()}`
      );
    }

    options.output.write('');
  } catch (error) {
    options.output.writeError(
      `Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Show session details.
 * Displays full session metadata and message history.
 * When trace flag is enabled, also displays turn metadata and error logs.
 *
 * @param options - Command options
 *
 * @example
 * await sessionShow({ sessionManager, output, sessionId: 'abc-123' });
 * await sessionShow({ sessionManager, output, sessionId: 'abc-123', trace: true });
 */
export async function sessionShow(options: SessionShowOptions): Promise<void> {
  try {
    let session: Session;
    let turnMetadata: readonly TurnMetadataRecord[] = [];
    let errorLogs: readonly ErrorLogRecord[] = [];

    // Load session with or without trace data
    if (options.trace) {
      // Check if store supports trace data
      interface SessionManagerInternal {
        store?: SessionStoreWithTrace;
      }
      const manager = options.sessionManager as unknown as SessionManagerInternal;
      if (!manager.store || typeof manager.store.loadWithTrace !== 'function') {
        options.output.writeError(
          'Trace data not available: Session store does not support trace functionality'
        );
        return;
      }

      const result = await manager.store.loadWithTrace(options.sessionId);
      if (!result) {
        options.output.writeError(`Session not found: ${options.sessionId}`);
        return;
      }

      session = result.session;
      turnMetadata = result.turnMetadata;
      errorLogs = result.errorLogs;
    } else {
      const loadedSession = await options.sessionManager.loadSession(options.sessionId);
      if (!loadedSession) {
        options.output.writeError(`Session not found: ${options.sessionId}`);
        return;
      }
      session = loadedSession;
    }

    // Display session header
    options.output.write(`\nSession: ${session.id}\n`);
    options.output.write('---');

    // Display metadata
    options.output.write(`Agent ID: ${session.agentId}`);
    options.output.write(`Model: ${session.metadata.model}`);
    options.output.write(`Provider: ${session.metadata.provider}`);
    options.output.write(
      `Description: ${session.metadata.description || '(none)'}`
    );
    options.output.write(
      `Tags: ${session.metadata.tags.join(', ') || '(none)'}`
    );
    options.output.write(`Total Tokens: ${session.metadata.totalTokens}`);
    options.output.write(`Tool Calls: ${session.metadata.toolCallCount}`);
    options.output.write(`Turns: ${session.metadata.turnCount}`);
    options.output.write(`Messages: ${session.messages.length}`);
    const createdDate = new Date(session.createdAt);
    const updatedDate = new Date(session.updatedAt);
    options.output.write(`Created: ${createdDate.toLocaleString()}`);
    options.output.write(`Updated: ${updatedDate.toLocaleString()}`);

    options.output.write('\n---\n');

    // Display trace data if requested
    if (options.trace) {
      displayTraceData(options.output, turnMetadata, errorLogs);
    }
  } catch (error) {
    options.output.writeError(
      `Failed to show session: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Display trace data (turn metadata and error logs).
 *
 * @param output - Output adapter
 * @param turnMetadata - Array of turn metadata records
 * @param errorLogs - Array of error log records
 */
function displayTraceData(
  output: OutputAdapter,
  turnMetadata: readonly TurnMetadataRecord[],
  errorLogs: readonly ErrorLogRecord[]
): void {
  // Check if any trace data exists
  if (turnMetadata.length === 0 && errorLogs.length === 0) {
    output.write('\n=== TRACE DATA ===');
    output.write('No trace data available for this session.\n');
    return;
  }

  // Display turn metadata
  if (turnMetadata.length > 0) {
    output.write('\n=== TURN METADATA ===\n');

    for (const turn of turnMetadata) {
      output.write(`\nTurn ${turn.turnNumber}:`);
      output.write(
        `  Duration: ${formatDuration(turn.durationMs)} | Tokens: ${turn.usage.totalTokens} (in: ${turn.usage.promptTokens}, out: ${turn.usage.completionTokens}) | Tools: ${turn.toolCount} | Stop: ${turn.stopReason}`
      );
    }
    output.write('');
  }

  // Display error logs
  if (errorLogs.length > 0) {
    output.write('\n=== ERRORS ===\n');

    for (const error of errorLogs) {
      const turnInfo = error.turnNumber !== undefined ? `[Turn ${error.turnNumber}]` : '[No Turn]';
      output.write(`\n${turnInfo} ${error.error}: ${error.message}`);
      if (error.context) {
        output.write(`  Context: ${error.context}`);
      }
      if (error.stack) {
        output.write(`  Stack: ${error.stack}`);
      }
    }
    output.write('');
  }
}

/**
 * Format duration in milliseconds to human-readable string.
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted duration string (e.g., "1.2s")
 */
function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * Delete a session.
 * Removes session from storage.
 *
 * @param options - Command options
 *
 * @example
 * await sessionDelete({ sessionManager, output, sessionId: 'abc-123' });
 */
export async function sessionDelete(
  options: SessionDeleteOptions
): Promise<void> {
  try {
    await options.sessionManager.deleteSession(options.sessionId);
    options.output.writeSuccess(`Session deleted: ${options.sessionId}`);
  } catch (error) {
    options.output.writeError(
      `Failed to delete session: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

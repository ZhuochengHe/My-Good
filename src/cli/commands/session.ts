/**
 * Session commands for CLI.
 * Handles session list, show, and delete operations.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import type { SessionManager } from '../../session/session-manager.js';
import type { OutputAdapter } from '../output-adapter.js';

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
 *
 * @param options - Command options
 *
 * @example
 * await sessionShow({ sessionManager, output, sessionId: 'abc-123' });
 */
export async function sessionShow(options: SessionShowOptions): Promise<void> {
  try {
    // Load session
    const session = await options.sessionManager.loadSession(options.sessionId);

    if (!session) {
      options.output.writeError(`Session not found: ${options.sessionId}`);
      return;
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
  } catch (error) {
    options.output.writeError(
      `Failed to show session: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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

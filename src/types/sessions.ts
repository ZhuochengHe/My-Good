/**
 * Session type definitions for conversation persistence.
 */

import type { ConversationMessage } from './messages.js';
import type { ProviderType } from './providers.js';

/** Session metadata */
export interface SessionMetadata {
  readonly model: string;
  readonly provider: ProviderType;
  readonly totalTokens: number;
  readonly toolCallCount: number;
  readonly turnCount: number;
  readonly description: string;
  readonly tags: readonly string[];
}

/** Session state */
export interface Session {
  readonly id: string;
  readonly agentId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly ConversationMessage[];
  readonly metadata: SessionMetadata;
}

/** Session summary for listing */
export interface SessionSummary {
  readonly id: string;
  readonly agentId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messageCount: number;
}

/** Session group for manual organization */
export interface SessionGroup {
  readonly name: string;
  readonly sessionIds: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Session store interface */
export interface SessionStore {
  /**
   * Load session by ID.
   */
  load(sessionId: string): Promise<Session | null>;

  /**
   * Save session state.
   */
  save(session: Session): Promise<void>;

  /**
   * Append message to session (optimized for JSONL).
   */
  appendMessage(sessionId: string, message: ConversationMessage): Promise<void>;

  /**
   * List all sessions.
   */
  list(): Promise<readonly SessionSummary[]>;

  /**
   * Delete session.
   */
  delete(sessionId: string): Promise<void>;

  /**
   * Clear all messages but keep session.
   */
  clear(sessionId: string): Promise<void>;
}

/** Result from loading a session with trace data */
export interface SessionWithTrace {
  readonly session: Session;
  readonly turnMetadata: readonly TurnMetadataRecord[];
  readonly errorLogs: readonly ErrorLogRecord[];
}

/** Extended store interface for stores that support trace data */
export interface SessionStoreWithTrace extends SessionStore {
  /**
   * Load session with trace data (turn metadata and error logs).
   * Only available in stores that support event persistence.
   */
  loadWithTrace(sessionId: string): Promise<SessionWithTrace | null>;
}

/** Session group store interface */
export interface SessionGroupStore {
  /**
   * Load group by name.
   */
  loadGroup(name: string): Promise<SessionGroup | null>;

  /**
   * Save group.
   */
  saveGroup(group: SessionGroup): Promise<void>;

  /**
   * List all groups.
   */
  listGroups(): Promise<readonly SessionGroup[]>;

  /**
   * Delete group.
   */
  deleteGroup(name: string): Promise<void>;
}

// ============================================================
// JSONL Journal Record Types
// ============================================================

/**
 * Turn metadata record for JSONL persistence.
 * Captures metrics about an LLM turn for debugging and analytics.
 */
export interface TurnMetadataRecord {
  readonly type: 'turn_metadata';
  readonly turnNumber: number;
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
  readonly durationMs: number;
  readonly toolCount: number;
  readonly stopReason: string;
  readonly timestamp: number;
}

/**
 * Error log record for JSONL persistence.
 * Captures errors during session execution for debugging.
 */
export interface ErrorLogRecord {
  readonly type: 'error_log';
  readonly turnNumber?: number;
  readonly error: string;
  readonly message: string;
  readonly context?: string;
  readonly stack?: string;
  readonly timestamp: number;
}

/**
 * Union type for all JSONL record types.
 * Each session file contains a mix of these record types.
 */
export type JournalRecord =
  | SessionStartRecord
  | MessageRecord
  | TurnMetadataRecord
  | ErrorLogRecord;

/**
 * Session start record (internal to JSONL format).
 * This is the first line in every session file.
 */
export interface SessionStartRecord {
  readonly type: 'session_start';
  readonly timestamp: number;
  readonly sessionId: string;
  readonly agentId: string;
  readonly metadata: SessionMetadata;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Message record (internal to JSONL format).
 * Wraps a conversation message with metadata.
 */
export interface MessageRecord {
  readonly type: 'message';
  readonly timestamp: number;
  readonly message: ConversationMessage;
}

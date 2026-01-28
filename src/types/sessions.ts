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

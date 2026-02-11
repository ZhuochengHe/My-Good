/**
 * JSONL-based session store implementation.
 * Stores sessions as JSON Lines files for efficient append-only operations.
 */

import type {
  Session,
  SessionStore,
  SessionSummary,
  TurnMetadataRecord,
  ErrorLogRecord,
} from '../types/sessions.js';
import type { ConversationMessage } from '../types/messages.js';
import {
  InvalidSessionIdError,
  SessionNotFoundError,
  SessionLoadError,
  SessionSaveError,
  SessionCorruptedError,
  SessionDeleteError,
  SessionTooLargeError,
} from '../errors/session.js';
import { CredentialDetector } from '../security/credential-detector.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import { homedir } from 'os';

/** Maximum number of messages allowed in a session (prevents resource exhaustion) */
const MAX_MESSAGE_COUNT = 10000;

/** Maximum session file size in bytes (100 MB, prevents resource exhaustion) */
const MAX_SESSION_SIZE = 100 * 1024 * 1024;

/** Content block types for structured message content */
interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

interface ToolResultBlock {
  readonly type: 'tool_result';
  readonly toolCallId: string;
  readonly output: string;
  readonly success: boolean;
}

/** Type guard to check if value is a text block */
function isTextBlock(block: unknown): block is TextBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    block.type === 'text' &&
    'text' in block &&
    typeof block.text === 'string'
  );
}

/** Type guard to check if value is a tool result block */
function isToolResultBlock(block: unknown): block is ToolResultBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    block.type === 'tool_result' &&
    'output' in block &&
    typeof block.output === 'string'
  );
}

/** JSONL record types */
type JsonlRecordType = 'session_start' | 'message' | 'turn_metadata' | 'error_log';

/** Base JSONL record */
interface JsonlRecord {
  readonly type: JsonlRecordType;
  readonly timestamp: number;
}

/** Session start record */
interface SessionStartRecord extends JsonlRecord {
  readonly type: 'session_start';
  readonly sessionId: string;
  readonly agentId: string;
  readonly metadata: Session['metadata'];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Message record */
interface MessageRecord extends JsonlRecord {
  readonly type: 'message';
  readonly message: ConversationMessage;
}

/**
 * JSONL-based session store.
 * Each session is stored as a .jsonl file with one JSON object per line.
 *
 * Format:
 * - Line 1: session_start record (metadata)
 * - Line 2+: message records (conversation history)
 *
 * Features:
 * - Atomic saves using temp file + rename
 * - Streaming reads for large files
 * - Automatic backup of corrupted files
 * - Session ID validation to prevent path traversal
 *
 * @example
 * ```typescript
 * const store = new JsonlSessionStore('/path/to/sessions');
 *
 * // Save a session
 * await store.save(session);
 *
 * // Load a session
 * const loaded = await store.load('session-id');
 *
 * // Append a message
 * await store.appendMessage('session-id', message);
 * ```
 */
export class JsonlSessionStore implements SessionStore {
  private readonly sessionsDir: string;

  /**
   * Create a new JSONL session store.
   *
   * @param sessionsDir - Directory to store session files (defaults to ~/.my-agent/sessions)
   */
  constructor(sessionsDir?: string) {
    this.sessionsDir =
      sessionsDir ?? path.join(homedir(), '.my-agent', 'sessions');
  }

  /**
   * Sanitize a message by redacting credentials from its content.
   *
   * This prevents credentials from being stored in session files.
   * Handles both string content and array-based content structures.
   *
   * @param message - Message to sanitize
   * @returns Sanitized copy of the message
   */
  private sanitizeMessage(message: ConversationMessage): ConversationMessage {
    // Handle string content (simple messages)
    if (typeof message.content === 'string') {
      return {
        ...message,
        content: CredentialDetector.detectAndRedact(message.content),
      };
    }

    // Handle array content (structured messages with text blocks, tool results, etc.)
    // Runtime data can have content as array for Anthropic API compatibility
    const content = message.content as unknown;
    if (Array.isArray(content)) {
      const sanitizedContent = content.map((block: unknown): unknown => {
        if (isTextBlock(block)) {
          return {
            ...block,
            text: CredentialDetector.detectAndRedact(block.text),
          };
        } else if (isToolResultBlock(block)) {
          return {
            ...block,
            output: CredentialDetector.detectAndRedact(block.output),
          };
        }
        return block;
      });

      return {
        ...message,
        content: sanitizedContent as unknown as string,
      };
    }

    // Return message as-is if content type is unexpected
    return message;
  }

  /**
   * Validate session ID to prevent path traversal attacks.
   *
   * Allowed characters: [a-zA-Z0-9-_]
   *
   * @param sessionId - Session ID to validate
   * @throws {InvalidSessionIdError} If session ID is invalid
   */
  private validateSessionId(sessionId: string): void {
    if (!sessionId || sessionId.length === 0) {
      throw new InvalidSessionIdError(sessionId, 'Session ID cannot be empty');
    }

    // Only allow alphanumeric, hyphens, and underscores
    const validPattern = /^[a-zA-Z0-9-_]+$/;
    if (!validPattern.test(sessionId)) {
      throw new InvalidSessionIdError(
        sessionId,
        'Session ID can only contain letters, numbers, hyphens, and underscores'
      );
    }

    // Prevent path traversal
    if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
      throw new InvalidSessionIdError(
        sessionId,
        'Session ID cannot contain path traversal characters'
      );
    }
  }

  /**
   * Get the file path for a session.
   *
   * @param sessionId - Session ID
   * @returns Full path to session JSONL file
   */
  private getSessionPath(sessionId: string): string {
    this.validateSessionId(sessionId);
    return path.join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  /**
   * Ensure sessions directory exists.
   */
  private async ensureSessionsDir(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  /**
   * Check if a path is a symlink and throw an error if it is.
   * This prevents symlink attacks where an attacker creates a symlink
   * to trick the application into reading/writing to a different file.
   *
   * @param filePath - Path to check
   * @param sessionId - Session ID for error messages
   * @throws {SessionLoadError} If path is a symlink
   */
  private async checkNotSymlink(filePath: string, sessionId: string): Promise<void> {
    try {
      const stats = await fs.lstat(filePath);
      if (stats.isSymbolicLink()) {
        throw new SessionLoadError(
          sessionId,
          'Session file is a symbolic link (symlinks are not allowed for security)'
        );
      }
    } catch (error) {
      // If lstat fails with ENOENT, file doesn't exist yet - that's okay
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      // Re-throw SessionLoadError
      if (error instanceof SessionLoadError) {
        throw error;
      }
      // Other errors are ignored (file might not exist yet for save operations)
    }
  }

  /**
   * Load session by ID.
   *
   * Reads the JSONL file line by line, parsing the session_start record
   * and all message records to reconstruct the full session state.
   *
   * @param sessionId - Unique session identifier
   * @returns Session object or null if not found
   * @throws {InvalidSessionIdError} If session ID is invalid
   * @throws {SessionCorruptedError} If JSONL file is corrupted
   * @throws {SessionLoadError} If loading fails for other reasons
   */
  async load(sessionId: string): Promise<Session | null> {
    this.validateSessionId(sessionId);

    const sessionPath = this.getSessionPath(sessionId);

    try {
      // Try to access the file to check if it exists
      await fs.access(sessionPath);
    } catch (error) {
      // File doesn't exist
      return null;
    }

    // Check for symlink attacks
    await this.checkNotSymlink(sessionPath, sessionId);

    // Check file size before loading
    try {
      const stats = await fs.stat(sessionPath);
      if (stats.size > MAX_SESSION_SIZE) {
        throw new SessionTooLargeError(
          sessionId,
          `File size ${stats.size} bytes exceeds maximum ${MAX_SESSION_SIZE} bytes`
        );
      }
    } catch (error) {
      if (error instanceof SessionTooLargeError) {
        throw error;
      }
      // Ignore stat errors, let the read fail naturally
    }

    try {
      const fileStream = createReadStream(sessionPath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let sessionStart: SessionStartRecord | null = null;
      const messages: ConversationMessage[] = [];
      let lineNumber = 0;

      for await (const line of rl) {
        lineNumber++;

        if (!line.trim()) {
          continue; // Skip empty lines
        }

        // Check message count limit
        if (messages.length >= MAX_MESSAGE_COUNT) {
          throw new SessionTooLargeError(
            sessionId,
            `Message count exceeds maximum ${MAX_MESSAGE_COUNT} messages`
          );
        }

        try {
          const record = JSON.parse(line) as JsonlRecord;

          if (record.type === 'session_start') {
            if (sessionStart !== null) {
              throw new SessionCorruptedError(
                sessionId,
                'Multiple session_start records found',
                lineNumber
              );
            }
            sessionStart = record as SessionStartRecord;
          } else if (record.type === 'message') {
            const messageRecord = record as MessageRecord;
            messages.push(messageRecord.message);
          }
        } catch (error) {
          if (error instanceof SessionCorruptedError) {
            throw error;
          }

          // Backup corrupted file
          await this.backupCorruptedFile(sessionPath);

          throw new SessionCorruptedError(
            sessionId,
            `Invalid JSON at line ${lineNumber}: ${(error as Error).message}`,
            lineNumber
          );
        }
      }

      if (sessionStart === null) {
        await this.backupCorruptedFile(sessionPath);
        throw new SessionCorruptedError(
          sessionId,
          'Missing session_start record'
        );
      }

      const session: Session = {
        id: sessionStart.sessionId,
        agentId: sessionStart.agentId,
        createdAt: sessionStart.createdAt,
        updatedAt: sessionStart.updatedAt,
        messages,
        metadata: sessionStart.metadata,
      };

      return session;
    } catch (error) {
      if (
        error instanceof InvalidSessionIdError ||
        error instanceof SessionCorruptedError ||
        error instanceof SessionTooLargeError
      ) {
        throw error;
      }

      throw new SessionLoadError(
        sessionId,
        `Failed to read session file: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Save session state.
   *
   * This overwrites the entire session file atomically using a
   * temp file + rename strategy to prevent partial writes.
   *
   * @param session - Session to save
   * @throws {InvalidSessionIdError} If session ID is invalid
   * @throws {SessionSaveError} If saving fails
   */
  async save(session: Session): Promise<void> {
    this.validateSessionId(session.id);

    // Validate message count before saving
    if (session.messages.length > MAX_MESSAGE_COUNT) {
      throw new SessionTooLargeError(
        session.id,
        `Message count ${session.messages.length} exceeds maximum ${MAX_MESSAGE_COUNT} messages`
      );
    }

    await this.ensureSessionsDir();

    const sessionPath = this.getSessionPath(session.id);

    // Check for symlink attacks before writing
    await this.checkNotSymlink(sessionPath, session.id);

    const tempPath = `${sessionPath}.tmp`;

    try {
      const lines: string[] = [];

      // Write session start record
      const sessionStart: SessionStartRecord = {
        type: 'session_start',
        timestamp: Date.now(),
        sessionId: session.id,
        agentId: session.agentId,
        metadata: session.metadata,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };
      lines.push(JSON.stringify(sessionStart));

      // Write message records (sanitize credentials before saving)
      for (const message of session.messages) {
        const sanitizedMessage = this.sanitizeMessage(message);
        const messageRecord: MessageRecord = {
          type: 'message',
          timestamp: Date.now(),
          message: sanitizedMessage,
        };
        lines.push(JSON.stringify(messageRecord));
      }

      // Write to temp file then rename for atomic save
      // Use mode 0o600 for secure permissions (owner read/write only)
      await fs.writeFile(tempPath, lines.join('\n') + '\n', {
        encoding: 'utf-8',
        mode: 0o600,
      });
      await fs.rename(tempPath, sessionPath);
    } catch (error) {
      // Clean up temp file if it exists (ignore errors)
      await fs.unlink(tempPath).catch(() => {
        /* ignore */
      });

      throw new SessionSaveError(
        session.id,
        `Failed to write session file: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Append message to session (optimized for JSONL).
   *
   * This implementation uses a hybrid approach:
   * 1. Reads the session to get metadata and validate it exists
   * 2. Updates the session_start record with new updatedAt timestamp
   * 3. Appends the new message to the file
   *
   * This avoids rewriting all messages while keeping metadata in sync.
   *
   * @param sessionId - Session ID to append to
   * @param message - Message to append
   * @throws {InvalidSessionIdError} If session ID is invalid
   * @throws {SessionNotFoundError} If session doesn't exist
   * @throws {SessionSaveError} If append fails
   */
  async appendMessage(
    sessionId: string,
    message: ConversationMessage
  ): Promise<void> {
    this.validateSessionId(sessionId);

    try {
      // Load the session to validate it exists and get metadata
      const session = await this.load(sessionId);
      if (session === null) {
        throw new SessionNotFoundError(sessionId);
      }

      // Check message count limit
      if (session.messages.length >= MAX_MESSAGE_COUNT) {
        throw new SessionTooLargeError(
          sessionId,
          `Message count ${session.messages.length} exceeds maximum ${MAX_MESSAGE_COUNT} messages`
        );
      }

      const sessionPath = this.getSessionPath(sessionId);
      const tempPath = `${sessionPath}.tmp`;

      // Read the entire file
      const content = await fs.readFile(sessionPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        throw new SessionCorruptedError(sessionId, 'Session file is empty');
      }

      // Update the first line (session_start) with new updatedAt
      const firstLine = lines[0];
      if (!firstLine) {
        throw new SessionCorruptedError(sessionId, 'Missing session_start record');
      }
      const sessionStart = JSON.parse(firstLine) as SessionStartRecord;
      const updatedSessionStart: SessionStartRecord = {
        ...sessionStart,
        updatedAt: Date.now(),
      };
      lines[0] = JSON.stringify(updatedSessionStart);

      // Create new message record (sanitize credentials before saving)
      const sanitizedMessage = this.sanitizeMessage(message);
      const messageRecord: MessageRecord = {
        type: 'message',
        timestamp: Date.now(),
        message: sanitizedMessage,
      };
      lines.push(JSON.stringify(messageRecord));

      // Write to temp file then rename for atomic operation
      await fs.writeFile(tempPath, lines.join('\n') + '\n', {
        encoding: 'utf-8',
        mode: 0o600,
      });
      await fs.rename(tempPath, sessionPath);
    } catch (error) {
      if (
        error instanceof InvalidSessionIdError ||
        error instanceof SessionNotFoundError ||
        error instanceof SessionTooLargeError
      ) {
        throw error;
      }

      throw new SessionSaveError(
        sessionId,
        `Failed to append message: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * List all sessions.
   *
   * Returns summary information for all sessions in the store.
   * Skips corrupted session files silently.
   *
   * @returns Array of session summaries
   */
  async list(): Promise<readonly SessionSummary[]> {
    await this.ensureSessionsDir();

    try {
      const files = await fs.readdir(this.sessionsDir);
      const summaries: SessionSummary[] = [];

      for (const file of files) {
        if (!file.endsWith('.jsonl')) {
          continue;
        }

        const sessionId = file.slice(0, -6); // Remove .jsonl extension

        try {
          const session = await this.load(sessionId);
          if (session !== null) {
            summaries.push({
              id: session.id,
              agentId: session.agentId,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              messageCount: session.messages.length,
            });
          }
        } catch (error) {
          // Skip corrupted sessions
          continue;
        }
      }

      return summaries;
    } catch (error) {
      // If directory doesn't exist, return empty array
      return [];
    }
  }

  /**
   * Delete session.
   *
   * Permanently removes the session file from disk.
   *
   * @param sessionId - Session ID to delete
   * @throws {InvalidSessionIdError} If session ID is invalid
   * @throws {SessionNotFoundError} If session doesn't exist
   * @throws {SessionDeleteError} If deletion fails
   */
  async delete(sessionId: string): Promise<void> {
    this.validateSessionId(sessionId);

    const sessionPath = this.getSessionPath(sessionId);

    // Check for symlink attacks before deleting
    await this.checkNotSymlink(sessionPath, sessionId);

    try {
      await fs.unlink(sessionPath);
    } catch (error) {
      // Check if error is because file doesn't exist
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SessionNotFoundError(sessionId);
      }
      throw new SessionDeleteError(
        sessionId,
        `Failed to delete session file: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Clear all messages but keep session.
   *
   * Removes all messages from the session but preserves the session
   * metadata (ID, agent, timestamps, etc.).
   *
   * @param sessionId - Session ID to clear
   * @throws {InvalidSessionIdError} If session ID is invalid
   * @throws {SessionNotFoundError} If session doesn't exist
   */
  async clear(sessionId: string): Promise<void> {
    this.validateSessionId(sessionId);

    const session = await this.load(sessionId);
    if (session === null) {
      throw new SessionNotFoundError(sessionId);
    }

    // Save session with no messages
    const clearedSession: Session = {
      ...session,
      updatedAt: Date.now(),
      messages: [],
    };

    await this.save(clearedSession);
  }

  /**
   * Append turn metadata to session (for trace/debug data).
   *
   * Writes a turn_metadata record to the JSONL file containing
   * metrics about an LLM turn (tokens, duration, tool count, etc.).
   *
   * @param sessionId - Session ID to append to
   * @param metadata - Turn metadata record
   * @throws {InvalidSessionIdError} If session ID is invalid
   * @throws {SessionNotFoundError} If session doesn't exist
   * @throws {SessionSaveError} If append fails
   */
  async appendTurnMetadata(
    sessionId: string,
    metadata: TurnMetadataRecord
  ): Promise<void> {
    this.validateSessionId(sessionId);

    try {
      // Verify session exists
      const session = await this.load(sessionId);
      if (session === null) {
        throw new SessionNotFoundError(sessionId);
      }

      const sessionPath = this.getSessionPath(sessionId);
      const line = JSON.stringify(metadata) + '\n';

      // Append to file atomically
      await fs.appendFile(sessionPath, line, {
        encoding: 'utf-8',
        mode: 0o600,
      });
    } catch (error) {
      if (
        error instanceof InvalidSessionIdError ||
        error instanceof SessionNotFoundError
      ) {
        throw error;
      }

      throw new SessionSaveError(
        sessionId,
        `Failed to append turn metadata: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Append error log to session (for trace/debug data).
   *
   * Writes an error_log record to the JSONL file containing
   * error information for debugging session failures.
   *
   * @param sessionId - Session ID to append to
   * @param errorLog - Error log record
   * @throws {InvalidSessionIdError} If session ID is invalid
   * @throws {SessionNotFoundError} If session doesn't exist
   * @throws {SessionSaveError} If append fails
   */
  async appendErrorLog(
    sessionId: string,
    errorLog: ErrorLogRecord
  ): Promise<void> {
    this.validateSessionId(sessionId);

    try {
      // Verify session exists
      const session = await this.load(sessionId);
      if (session === null) {
        throw new SessionNotFoundError(sessionId);
      }

      const sessionPath = this.getSessionPath(sessionId);
      const line = JSON.stringify(errorLog) + '\n';

      // Append to file atomically
      await fs.appendFile(sessionPath, line, {
        encoding: 'utf-8',
        mode: 0o600,
      });
    } catch (error) {
      if (
        error instanceof InvalidSessionIdError ||
        error instanceof SessionNotFoundError
      ) {
        throw error;
      }

      throw new SessionSaveError(
        sessionId,
        `Failed to append error log: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Load session with trace data (turn metadata and error logs).
   *
   * Similar to load(), but also extracts and returns turn_metadata
   * and error_log records for debugging and analysis.
   *
   * @param sessionId - Unique session identifier
   * @returns Session with trace data arrays, or null if not found
   * @throws {InvalidSessionIdError} If session ID is invalid
   * @throws {SessionCorruptedError} If JSONL file is corrupted
   * @throws {SessionLoadError} If loading fails for other reasons
   */
  async loadWithTrace(sessionId: string): Promise<{
    session: Session;
    turnMetadata: TurnMetadataRecord[];
    errorLogs: ErrorLogRecord[];
  } | null> {
    this.validateSessionId(sessionId);

    const sessionPath = this.getSessionPath(sessionId);

    try {
      // Try to access the file to check if it exists
      await fs.access(sessionPath);
    } catch (error) {
      // File doesn't exist
      return null;
    }

    // Check for symlink attacks
    await this.checkNotSymlink(sessionPath, sessionId);

    // Check file size before loading
    try {
      const stats = await fs.stat(sessionPath);
      if (stats.size > MAX_SESSION_SIZE) {
        throw new SessionTooLargeError(
          sessionId,
          `File size ${stats.size} bytes exceeds maximum ${MAX_SESSION_SIZE} bytes`
        );
      }
    } catch (error) {
      if (error instanceof SessionTooLargeError) {
        throw error;
      }
      // Ignore stat errors, let the read fail naturally
    }

    try {
      const fileStream = createReadStream(sessionPath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let sessionStart: SessionStartRecord | null = null;
      const messages: ConversationMessage[] = [];
      const turnMetadata: TurnMetadataRecord[] = [];
      const errorLogs: ErrorLogRecord[] = [];
      let lineNumber = 0;

      for await (const line of rl) {
        lineNumber++;

        if (!line.trim()) {
          continue; // Skip empty lines
        }

        // Check message count limit
        if (messages.length >= MAX_MESSAGE_COUNT) {
          throw new SessionTooLargeError(
            sessionId,
            `Message count exceeds maximum ${MAX_MESSAGE_COUNT} messages`
          );
        }

        try {
          const record = JSON.parse(line) as JsonlRecord;

          if (record.type === 'session_start') {
            if (sessionStart !== null) {
              throw new SessionCorruptedError(
                sessionId,
                'Multiple session_start records found',
                lineNumber
              );
            }
            sessionStart = record as SessionStartRecord;
          } else if (record.type === 'message') {
            const messageRecord = record as MessageRecord;
            messages.push(messageRecord.message);
          } else if (record.type === 'turn_metadata') {
            const metadataRecord = record as TurnMetadataRecord;
            turnMetadata.push(metadataRecord);
          } else if (record.type === 'error_log') {
            const errorLogRecord = record as ErrorLogRecord;
            errorLogs.push(errorLogRecord);
          }
          // Silently ignore unknown record types for forward compatibility
        } catch (error) {
          if (error instanceof SessionCorruptedError) {
            throw error;
          }

          // Backup corrupted file
          await this.backupCorruptedFile(sessionPath);

          throw new SessionCorruptedError(
            sessionId,
            `Invalid JSON at line ${lineNumber}: ${(error as Error).message}`,
            lineNumber
          );
        }
      }

      if (sessionStart === null) {
        await this.backupCorruptedFile(sessionPath);
        throw new SessionCorruptedError(
          sessionId,
          'Missing session_start record'
        );
      }

      const session: Session = {
        id: sessionStart.sessionId,
        agentId: sessionStart.agentId,
        createdAt: sessionStart.createdAt,
        updatedAt: sessionStart.updatedAt,
        messages,
        metadata: sessionStart.metadata,
      };

      return {
        session,
        turnMetadata,
        errorLogs,
      };
    } catch (error) {
      if (
        error instanceof InvalidSessionIdError ||
        error instanceof SessionCorruptedError ||
        error instanceof SessionTooLargeError
      ) {
        throw error;
      }

      throw new SessionLoadError(
        sessionId,
        `Failed to read session file: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Backup a corrupted file.
   *
   * Creates a copy of the corrupted file with .corrupted extension
   * for debugging and recovery purposes. Errors during backup are
   * silently ignored.
   *
   * @param sessionPath - Path to corrupted session file
   */
  private async backupCorruptedFile(sessionPath: string): Promise<void> {
    try {
      const backupPath = `${sessionPath}.corrupted`;
      await fs.copyFile(sessionPath, backupPath);
    } catch (error) {
      // Ignore backup errors (file might not exist or be inaccessible)
    }
  }
}

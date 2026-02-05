/**
 * Session error types for session storage, loading, and persistence.
 */

/** Session error codes */
export type SessionErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_LOAD_FAILED'
  | 'SESSION_SAVE_FAILED'
  | 'SESSION_CORRUPTED'
  | 'INVALID_SESSION_ID'
  | 'SESSION_DELETE_FAILED'
  | 'SESSION_TOO_LARGE';

/**
 * Base class for session-related errors.
 */
export class SessionError extends Error {
  readonly code: SessionErrorCode;
  readonly details?: unknown;

  constructor(
    message: string,
    code: SessionErrorCode,
    details?: unknown,
    cause?: Error
  ) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
    this.details = details;
    if (cause) {
      this.cause = cause;
    }
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a session is not found.
 */
export class SessionNotFoundError extends SessionError {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(
      `Session not found: ${sessionId}`,
      'SESSION_NOT_FOUND',
      { sessionId }
    );
    this.name = 'SessionNotFoundError';
    this.sessionId = sessionId;
  }
}

/**
 * Error thrown when a session fails to load.
 */
export class SessionLoadError extends SessionError {
  readonly sessionId: string;

  constructor(sessionId: string, reason: string, cause?: Error) {
    super(
      `Failed to load session ${sessionId}: ${reason}`,
      'SESSION_LOAD_FAILED',
      { sessionId, reason },
      cause
    );
    this.name = 'SessionLoadError';
    this.sessionId = sessionId;
  }
}

/**
 * Error thrown when a session fails to save.
 */
export class SessionSaveError extends SessionError {
  readonly sessionId: string;

  constructor(sessionId: string, reason: string, cause?: Error) {
    super(
      `Failed to save session ${sessionId}: ${reason}`,
      'SESSION_SAVE_FAILED',
      { sessionId, reason },
      cause
    );
    this.name = 'SessionSaveError';
    this.sessionId = sessionId;
  }
}

/**
 * Error thrown when a session file is corrupted.
 */
export class SessionCorruptedError extends SessionError {
  readonly sessionId: string;
  readonly lineNumber?: number;

  constructor(sessionId: string, reason: string, lineNumber?: number) {
    const lineInfo = lineNumber !== undefined ? ` at line ${lineNumber}` : '';
    super(
      `Session ${sessionId} is corrupted${lineInfo}: ${reason}`,
      'SESSION_CORRUPTED',
      { sessionId, reason, lineNumber }
    );
    this.name = 'SessionCorruptedError';
    this.sessionId = sessionId;
    if (lineNumber !== undefined) {
      this.lineNumber = lineNumber;
    }
  }
}

/**
 * Error thrown when a session ID is invalid.
 */
export class InvalidSessionIdError extends SessionError {
  readonly sessionId: string;

  constructor(sessionId: string, reason: string) {
    super(
      `Invalid session ID "${sessionId}": ${reason}`,
      'INVALID_SESSION_ID',
      { sessionId, reason }
    );
    this.name = 'InvalidSessionIdError';
    this.sessionId = sessionId;
  }
}

/**
 * Error thrown when a session fails to delete.
 */
export class SessionDeleteError extends SessionError {
  readonly sessionId: string;

  constructor(sessionId: string, reason: string, cause?: Error) {
    super(
      `Failed to delete session ${sessionId}: ${reason}`,
      'SESSION_DELETE_FAILED',
      { sessionId, reason },
      cause
    );
    this.name = 'SessionDeleteError';
    this.sessionId = sessionId;
  }
}

/**
 * Type guard to check if an error is a SessionError.
 */
export function isSessionError(error: unknown): error is SessionError {
  return error instanceof SessionError;
}

/**
 * Error thrown when a session exceeds resource limits.
 */
export class SessionTooLargeError extends SessionError {
  readonly sessionId: string;

  constructor(sessionId: string, reason: string) {
    super(
      `Session ${sessionId} exceeds resource limits: ${reason}`,
      'SESSION_TOO_LARGE',
      { sessionId, reason }
    );
    this.name = 'SessionTooLargeError';
    this.sessionId = sessionId;
  }
}

/**
 * Check if a session error is recoverable.
 * SESSION_NOT_FOUND and SESSION_CORRUPTED are considered recoverable.
 */
export function isRecoverableSessionError(error: unknown): boolean {
  if (!isSessionError(error)) {
    return false;
  }
  return error.code === 'SESSION_NOT_FOUND' || error.code === 'SESSION_CORRUPTED';
}

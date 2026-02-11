/**
 * User-friendly error message format.
 *
 * Provides structured error information for CLI display.
 */
export interface UserErrorMessage {
  /** Error code (e.g., E301) */
  readonly code: string;
  /** User-friendly error message (what happened) */
  readonly message: string;
  /** Context explaining why the error occurred */
  readonly context?: string;
  /** Actionable suggestion for recovery */
  readonly suggestion?: string;
  /** Technical details for debugging */
  readonly technicalDetails?: string;
}

/**
 * Interface for errors that can be formatted for users.
 */
export interface FormattableError {
  /**
   * Convert error to user-friendly message format.
   *
   * @returns Structured error message for display
   */
  toUserMessage(): UserErrorMessage;
}

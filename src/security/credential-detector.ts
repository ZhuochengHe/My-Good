/**
 * Credential detection and redaction utilities.
 *
 * Provides functions to detect and redact sensitive credentials (API keys,
 * tokens, passwords, etc.) from strings and objects to prevent credential
 * leakage in logs, config displays, and session files.
 */

/**
 * Credential detection patterns.
 * Each pattern is designed to match common credential formats.
 */
const CREDENTIAL_PATTERNS = [
  // Anthropic API keys: sk-ant-api03-... (at least 20 characters after prefix)
  /sk-ant-api03-[a-zA-Z0-9_-]{20,}/g,

  // OpenAI API keys: sk-proj-... (at least 20 characters after prefix)
  /sk-proj-[a-zA-Z0-9_-]{20,}/g,

  // OpenAI API keys: sk-... (at least 20 characters after prefix, but not sk-ant or sk-proj)
  /sk-(?!ant-|proj-)[a-zA-Z0-9_-]{20,}/g,

  // GitHub tokens: ghp_..., gho_..., ghs_..., ghr_... (at least 20 characters)
  /gh[posr]_[a-zA-Z0-9]{20,}/g,

  // AWS access keys: AKIA... (exactly 16 more characters)
  /AKIA[0-9A-Z]{16}/g,

  // Bearer tokens (JWT and similar): Bearer <base64-like-string>
  /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi,
];

/** Redaction placeholder text */
const REDACTED = '***REDACTED***';

/**
 * Credential detector utilities.
 *
 * Provides static methods for detecting and redacting credentials from
 * various data types (strings, objects, etc.).
 *
 * @example
 * ```typescript
 * // Redact credentials from a string
 * const safe = CredentialDetector.detectAndRedact('My key: sk-ant-api03-...');
 * // => 'My key: ***REDACTED***'
 *
 * // Check if string contains credentials
 * const hasCredentials = CredentialDetector.containsCredentials('sk-ant-api03-...');
 * // => true
 *
 * // Sanitize an object recursively
 * const safeObj = CredentialDetector.sanitizeObject({ apiKey: 'sk-ant-api03-...' });
 * // => { apiKey: '***REDACTED***' }
 * ```
 */
export class CredentialDetector {
  /**
   * Detect and redact credentials from a string.
   *
   * Replaces all detected credentials with the REDACTED placeholder.
   * Supports multiple credential types including API keys, tokens, and
   * bearer tokens.
   *
   * @param input - String potentially containing credentials
   * @returns String with credentials replaced by REDACTED
   *
   * @example
   * ```typescript
   * const input = 'API key: sk-ant-api03-test123';
   * const output = CredentialDetector.detectAndRedact(input);
   * // => 'API key: ***REDACTED***'
   * ```
   */
  static detectAndRedact(input: string): string {
    let result = input;

    for (const pattern of CREDENTIAL_PATTERNS) {
      result = result.replace(pattern, REDACTED);
    }

    return result;
  }

  /**
   * Check if a string contains any credentials.
   *
   * Returns true if any credential pattern is found in the input string.
   *
   * @param input - String to check
   * @returns True if credentials detected, false otherwise
   *
   * @example
   * ```typescript
   * const hasCredentials = CredentialDetector.containsCredentials('sk-ant-api03-test');
   * // => true
   *
   * const noCredentials = CredentialDetector.containsCredentials('normal text');
   * // => false
   * ```
   */
  static containsCredentials(input: string): boolean {
    for (const pattern of CREDENTIAL_PATTERNS) {
      // Create a new RegExp to avoid state issues with global flag
      // Clone the pattern with same source and flags
      const testPattern = new RegExp(pattern.source, pattern.flags);
      if (testPattern.test(input)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Sanitize an object by redacting credentials from all string values.
   *
   * Recursively traverses the object and replaces any string values
   * containing credentials with the REDACTED placeholder. Preserves
   * the object structure and non-string values.
   *
   * @param obj - Object to sanitize
   * @returns New object with credentials redacted
   *
   * @example
   * ```typescript
   * const input = {
   *   apiKey: 'sk-ant-api03-test',
   *   config: { token: 'ghp_test' },
   *   safe: 'value'
   * };
   * const output = CredentialDetector.sanitizeObject(input);
   * // => {
   * //   apiKey: '***REDACTED***',
   * //   config: { token: '***REDACTED***' },
   * //   safe: 'value'
   * // }
   * ```
   */
  static sanitizeObject<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle primitive types
    if (typeof obj === 'string') {
      return this.detectAndRedact(obj) as T;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      const sanitizedArray: unknown[] = obj.map((item: unknown) =>
        this.sanitizeObject(item)
      );
      return sanitizedArray as unknown as T;
    }

    // Handle objects
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.detectAndRedact(value);
      } else if (value !== null && typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized as T;
  }
}

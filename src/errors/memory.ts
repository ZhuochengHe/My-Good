/**
 * Memory error types for memory storage, retrieval, and validation operations.
 */

/**
 * Base class for all memory-related errors.
 */
export class MemoryError extends Error {
  /** Error code identifying the failure category. */
  readonly code: string;

  constructor(
    code: string,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = 'MemoryError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when a memory entry is not found by ID. Code: MEMORY_001.
 */
export class MemoryNotFoundError extends MemoryError {
  /** The ID that was not found. */
  readonly id: string;

  constructor(id: string) {
    super('MEMORY_001', `Memory entry not found: ${id}`);
    this.name = 'MemoryNotFoundError';
    this.id = id;
  }
}

/**
 * Thrown when a memory entry ID does not conform to UUID v4 format. Code: MEMORY_002.
 */
export class MemoryInvalidIdError extends MemoryError {
  /** The invalid ID value that was provided. */
  readonly id: string;

  constructor(id: string) {
    super('MEMORY_002', `Invalid memory entry ID format: "${id}"`);
    this.name = 'MemoryInvalidIdError';
    this.id = id;
  }
}

/**
 * Thrown when a memory kind value is not a valid MemoryKind. Code: MEMORY_003.
 */
export class MemoryInvalidKindError extends MemoryError {
  /** The invalid kind value that was provided. */
  readonly kind: unknown;

  constructor(kind: unknown) {
    super(
      'MEMORY_003',
      `Invalid memory kind: "${String(kind)}". Must be one of: preference, experiential, semantic, episodic`
    );
    this.name = 'MemoryInvalidKindError';
    this.kind = kind;
  }
}

/**
 * Thrown when entry content is empty or exceeds 10000 characters. Code: MEMORY_004.
 */
export class MemoryInvalidContentError extends MemoryError {
  constructor(reason: string) {
    super('MEMORY_004', `Invalid memory content: ${reason}`);
    this.name = 'MemoryInvalidContentError';
  }
}

/**
 * Thrown when a filesystem I/O operation fails. Code: MEMORY_005.
 */
export class MemoryStorageError extends MemoryError {
  constructor(operation: string, cause?: unknown) {
    super('MEMORY_005', `Memory storage operation failed: ${operation}`, cause);
    this.name = 'MemoryStorageError';
  }
}

/**
 * Thrown when a memory entry's TTL has expired. Code: MEMORY_006.
 */
export class MemoryExpiredError extends MemoryError {
  /** The ID of the expired entry. */
  readonly id: string;
  /** The timestamp at which the entry expired. */
  readonly expiredAt: number;

  constructor(id: string, expiredAt: number) {
    super('MEMORY_006', `Memory entry ${id} expired at ${new Date(expiredAt).toISOString()}`);
    this.name = 'MemoryExpiredError';
    this.id = id;
    this.expiredAt = expiredAt;
  }
}

/**
 * Type guard to check if an error is a MemoryError.
 *
 * @param error - Value to test
 * @returns True if error is an instance of MemoryError
 */
export function isMemoryError(error: unknown): error is MemoryError {
  return error instanceof MemoryError;
}

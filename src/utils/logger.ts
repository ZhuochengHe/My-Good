/**
 * Structured logging utility with support for multiple output formats,
 * log levels, and file/console output.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Available log levels in order of severity.
 * error > warn > info > debug
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Available output formats for log messages.
 */
export type LogFormat = 'json' | 'pretty';

/**
 * Configuration for logger output destinations.
 */
export interface LogOutputConfig {
  /** Whether to output to console. Defaults to true. */
  readonly console?: boolean;
  /** Path to log file. If specified, logs will be written to this file. */
  readonly file?: string;
}

/**
 * Configuration for creating a logger instance.
 */
export interface LoggerConfig {
  /** Minimum log level to output. Defaults to 'info'. */
  readonly level?: LogLevel;
  /** Output format. Defaults to 'pretty'. */
  readonly format?: LogFormat;
  /** Output destinations configuration. */
  readonly output?: LogOutputConfig;
}

/**
 * Logger interface with methods for each log level.
 */
export interface Logger {
  /**
   * Log an error message.
   * @param message - The message to log
   * @param context - Optional context fields to include
   */
  error(message: string, context?: Record<string, unknown>): void;

  /**
   * Log a warning message.
   * @param message - The message to log
   * @param context - Optional context fields to include
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Log an info message.
   * @param message - The message to log
   * @param context - Optional context fields to include
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * Log a debug message.
   * @param message - The message to log
   * @param context - Optional context fields to include
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * Create a child logger with additional context fields.
   * Child logger inherits configuration and base context from parent.
   * @param context - Context fields to add to all log messages from this child
   * @returns New logger instance with inherited configuration and merged context
   */
  child(context: Record<string, unknown>): Logger;
}

/** Numeric priority for log levels (higher = more severe). */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** ANSI color codes for pretty printing. */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
} as const;

/** Color mapping for log levels. */
const LEVEL_COLORS: Record<LogLevel, string> = {
  error: COLORS.red,
  warn: COLORS.yellow,
  info: COLORS.blue,
  debug: COLORS.gray,
};

/**
 * Internal log entry structure.
 */
interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly [key: string]: unknown;
}

/**
 * Safely serializes a value for JSON output.
 * Handles circular references, Error objects, and Date objects.
 *
 * @param value - Value to serialize
 * @returns Serialized value safe for JSON.stringify
 */
function safeSerialize(value: unknown): unknown {
  const seen = new WeakSet();

  function serialize(val: unknown): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    if (typeof val === 'function') {
      return '[Function]';
    }

    if (val instanceof Date) {
      return val.toISOString();
    }

    if (val instanceof Error) {
      return {
        name: val.name,
        message: val.message,
        stack: val.stack,
      };
    }

    if (typeof val === 'object') {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);

      if (Array.isArray(val)) {
        return val.map(serialize);
      }

      const result: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(val)) {
        result[key] = serialize(v);
      }
      return result;
    }

    return val;
  }

  return serialize(value);
}

/**
 * Formats a log entry as JSON string.
 *
 * @param entry - Log entry to format
 * @returns JSON formatted string
 */
function formatJson(entry: LogEntry): string {
  const serialized = safeSerialize(entry) as Record<string, unknown>;
  return JSON.stringify(serialized);
}

/**
 * Formats a log entry as pretty human-readable string.
 *
 * @param entry - Log entry to format
 * @returns Pretty formatted string
 */
function formatPretty(entry: LogEntry): string {
  const { timestamp, level, message, ...context } = entry;
  const timePart = timestamp.split('T')[1] ?? '';
  const time = timePart.split('.')[0] ?? ''; // Extract HH:MM:SS
  const levelColor = LEVEL_COLORS[level];
  const levelPadded = level.toUpperCase().padEnd(5);

  let output = `${COLORS.gray}${time}${COLORS.reset} ${levelColor}${COLORS.bold}${levelPadded}${COLORS.reset} ${message}`;

  if (Object.keys(context).length > 0) {
    const contextStr = JSON.stringify(safeSerialize(context));
    output += ` ${COLORS.gray}${contextStr}${COLORS.reset}`;
  }

  return output;
}

/**
 * Manages a queue of file writes to ensure ordered, non-blocking writes.
 */
class FileWriteQueue {
  private readonly queues: Map<string, Promise<void>> = new Map();

  /**
   * Enqueues a write operation for a file.
   * Writes are processed sequentially per file to maintain order.
   *
   * @param filePath - Path to log file
   * @param content - Content to append
   */
  enqueue(filePath: string, content: string): void {
    const currentQueue = this.queues.get(filePath) ?? Promise.resolve();
    const newQueue = currentQueue.then(() => this.writeToFile(filePath, content));
    this.queues.set(filePath, newQueue);
  }

  /**
   * Writes content to a file.
   * Creates parent directories if they do not exist.
   */
  private async writeToFile(filePath: string, content: string): Promise<void> {
    try {
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true });
      await appendFile(filePath, content + '\n', 'utf-8');
    } catch {
      // Silently fail on file write errors - don't crash the application
    }
  }
}

/** Global file write queue for ordered async writes. */
const fileWriteQueue = new FileWriteQueue();

/**
 * Internal logger implementation.
 */
class LoggerImpl implements Logger {
  private readonly level: LogLevel;
  private readonly format: LogFormat;
  private readonly consoleOutput: boolean;
  private readonly filePath: string | undefined;
  private readonly baseContext: Record<string, unknown>;

  constructor(
    config: LoggerConfig = {},
    baseContext: Record<string, unknown> = {},
    filePath?: string
  ) {
    this.level = config.level ?? 'info';
    this.format = config.format ?? 'pretty';
    this.consoleOutput = config.output?.console ?? true;
    // Use provided filePath if available, otherwise get from config
    this.filePath = filePath !== undefined ? filePath : config.output?.file;
    this.baseContext = baseContext;
  }

  /**
   * Checks if a log level should be output based on configured minimum level.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  /**
   * Creates a log entry with timestamp and merged context.
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.baseContext,
      ...context,
    };
  }

  /**
   * Outputs a log entry to configured destinations.
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.createEntry(level, message, context);
    const formatted = this.format === 'json'
      ? formatJson(entry)
      : formatPretty(entry);

    // Console output (eslint-disable is intentional - logger must use console)
    if (this.consoleOutput) {
      switch (level) {
        case 'error':
          // eslint-disable-next-line no-console
          console.error(formatted);
          break;
        case 'warn':
          // eslint-disable-next-line no-console
          console.warn(formatted);
          break;
        default:
          // eslint-disable-next-line no-console
          console.log(formatted);
      }
    }

    // File output (non-blocking, ordered via queue)
    if (this.filePath) {
      // Always use JSON format for file output for parseability
      const fileContent = this.format === 'json'
        ? formatted
        : formatJson(entry);
      fileWriteQueue.enqueue(this.filePath, fileContent);
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  child(context: Record<string, unknown>): Logger {
    const mergedContext = { ...this.baseContext, ...context };
    return new LoggerImpl(
      {
        level: this.level,
        format: this.format,
        output: {
          console: this.consoleOutput,
        },
      },
      mergedContext,
      this.filePath
    );
  }
}

/**
 * Creates a new logger instance with the specified configuration.
 *
 * @param config - Logger configuration options
 * @returns Logger instance
 *
 * @example
 * // Create a basic logger
 * const logger = createLogger();
 * logger.info('Application started');
 *
 * @example
 * // Create a JSON logger for production
 * const logger = createLogger({
 *   level: 'warn',
 *   format: 'json',
 *   output: { file: '/var/log/app.log' }
 * });
 *
 * @example
 * // Create a child logger with context
 * const requestLogger = logger.child({ requestId: '123' });
 * requestLogger.info('Processing request');
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new LoggerImpl(config);
}

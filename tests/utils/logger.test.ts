/**
 * Tests for structured logging utility.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Import functions to test (will fail initially - that's expected in TDD)
import {
  createLogger,
  type Logger,
  type LoggerConfig,
  type LogLevel,
} from '../../src/utils/logger.js';

describe('Logger', () => {
  let testDir: string;
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    // Spy on console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    // Restore console methods
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('creates a logger with default configuration', () => {
      const logger = createLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('creates a logger with custom configuration', () => {
      const config: LoggerConfig = {
        level: 'debug',
        format: 'json',
        output: {
          console: true,
        },
      };

      const logger = createLogger(config);

      expect(logger).toBeDefined();
    });

    it('defaults to info level if not specified', () => {
      const logger = createLogger();

      // Debug should not be logged at info level
      logger.debug('debug message');
      expect(consoleSpy.log).not.toHaveBeenCalled();

      // Info should be logged
      logger.info('info message');
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('defaults to pretty format if not specified', () => {
      const logger = createLogger({ level: 'info' });

      logger.info('test message');

      // Pretty format should NOT be valid JSON
      const output = consoleSpy.log.mock.calls[0][0];
      expect(() => JSON.parse(output)).toThrow();
    });

    it('defaults to console output if not specified', () => {
      const logger = createLogger({ level: 'info' });

      logger.info('test message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('Log Levels', () => {
    describe('error level', () => {
      it('logs error messages', () => {
        const logger = createLogger({ level: 'error', format: 'json' });

        logger.error('error message');

        expect(consoleSpy.error).toHaveBeenCalled();
        const output = JSON.parse(consoleSpy.error.mock.calls[0][0]);
        expect(output.level).toBe('error');
        expect(output.message).toBe('error message');
      });

      it('only logs error at error level', () => {
        const logger = createLogger({ level: 'error' });

        logger.warn('warn message');
        logger.info('info message');
        logger.debug('debug message');

        expect(consoleSpy.warn).not.toHaveBeenCalled();
        expect(consoleSpy.log).not.toHaveBeenCalled();
      });
    });

    describe('warn level', () => {
      it('logs warn and error messages', () => {
        const logger = createLogger({ level: 'warn', format: 'json' });

        logger.error('error message');
        logger.warn('warn message');

        expect(consoleSpy.error).toHaveBeenCalled();
        expect(consoleSpy.warn).toHaveBeenCalled();
      });

      it('does not log info or debug at warn level', () => {
        const logger = createLogger({ level: 'warn' });

        logger.info('info message');
        logger.debug('debug message');

        expect(consoleSpy.log).not.toHaveBeenCalled();
      });
    });

    describe('info level', () => {
      it('logs error, warn, and info messages', () => {
        const logger = createLogger({ level: 'info', format: 'json' });

        logger.error('error message');
        logger.warn('warn message');
        logger.info('info message');

        expect(consoleSpy.error).toHaveBeenCalled();
        expect(consoleSpy.warn).toHaveBeenCalled();
        expect(consoleSpy.log).toHaveBeenCalled();
      });

      it('does not log debug at info level', () => {
        const logger = createLogger({ level: 'info' });

        logger.debug('debug message');

        // debug uses console.log, but should be filtered
        expect(consoleSpy.log).not.toHaveBeenCalled();
      });
    });

    describe('debug level', () => {
      it('logs all message levels', () => {
        const logger = createLogger({ level: 'debug', format: 'json' });

        logger.error('error message');
        logger.warn('warn message');
        logger.info('info message');
        logger.debug('debug message');

        expect(consoleSpy.error).toHaveBeenCalled();
        expect(consoleSpy.warn).toHaveBeenCalled();
        // info and debug both use console.log
        expect(consoleSpy.log).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Output Formats', () => {
    describe('JSON format', () => {
      it('outputs valid JSON', () => {
        const logger = createLogger({ level: 'info', format: 'json' });

        logger.info('test message');

        const output = consoleSpy.log.mock.calls[0][0];
        expect(() => JSON.parse(output)).not.toThrow();
      });

      it('includes timestamp in ISO format', () => {
        const logger = createLogger({ level: 'info', format: 'json' });

        logger.info('test message');

        const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
        expect(output.timestamp).toBeDefined();
        // Verify it's a valid ISO date
        expect(new Date(output.timestamp).toISOString()).toBe(output.timestamp);
      });

      it('includes level in output', () => {
        const logger = createLogger({ level: 'info', format: 'json' });

        logger.info('test message');

        const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
        expect(output.level).toBe('info');
      });

      it('includes message in output', () => {
        const logger = createLogger({ level: 'info', format: 'json' });

        logger.info('test message');

        const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
        expect(output.message).toBe('test message');
      });

      it('includes context fields in output', () => {
        const logger = createLogger({ level: 'info', format: 'json' });

        logger.info('test message', { requestId: '123', userId: 'user-456' });

        const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
        expect(output.requestId).toBe('123');
        expect(output.userId).toBe('user-456');
      });
    });

    describe('Pretty format', () => {
      it('outputs human-readable format', () => {
        const logger = createLogger({ level: 'info', format: 'pretty' });

        logger.info('test message');

        const output = consoleSpy.log.mock.calls[0][0];
        expect(output).toContain('test message');
        expect(output).toContain('INFO');
      });

      it('includes timestamp', () => {
        const logger = createLogger({ level: 'info', format: 'pretty' });

        logger.info('test message');

        const output = consoleSpy.log.mock.calls[0][0];
        // Should contain time pattern like HH:MM:SS
        expect(output).toMatch(/\d{2}:\d{2}:\d{2}/);
      });

      it('includes context fields', () => {
        const logger = createLogger({ level: 'info', format: 'pretty' });

        logger.info('test message', { requestId: '123' });

        const output = consoleSpy.log.mock.calls[0][0];
        expect(output).toContain('requestId');
        expect(output).toContain('123');
      });

      it('uses different formatting for different levels', () => {
        const logger = createLogger({ level: 'debug', format: 'pretty' });

        logger.error('error message');
        logger.warn('warn message');
        logger.info('info message');
        logger.debug('debug message');

        const errorOutput = consoleSpy.error.mock.calls[0][0];
        const warnOutput = consoleSpy.warn.mock.calls[0][0];
        const infoOutput = consoleSpy.log.mock.calls[0][0];
        const debugOutput = consoleSpy.log.mock.calls[1][0];

        expect(errorOutput).toContain('ERROR');
        expect(warnOutput).toContain('WARN');
        expect(infoOutput).toContain('INFO');
        expect(debugOutput).toContain('DEBUG');
      });
    });
  });

  describe('Context Fields', () => {
    it('accepts context as second parameter', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      logger.info('message', { key: 'value' });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.key).toBe('value');
    });

    it('handles nested context objects', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      logger.info('message', { nested: { deep: { value: 123 } } });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.nested.deep.value).toBe(123);
    });

    it('handles arrays in context', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      logger.info('message', { items: [1, 2, 3] });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.items).toEqual([1, 2, 3]);
    });

    it('handles null and undefined in context', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      logger.info('message', { nullValue: null, undefinedValue: undefined });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.nullValue).toBeNull();
      // undefined values are typically omitted in JSON
      expect('undefinedValue' in output).toBe(false);
    });

    it('logs without context when not provided', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      logger.info('message');

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.message).toBe('message');
      expect(output.timestamp).toBeDefined();
      expect(output.level).toBe('info');
    });
  });

  describe('Child Loggers', () => {
    it('creates a child logger with inherited context', () => {
      const logger = createLogger({ level: 'info', format: 'json' });
      const childLogger = logger.child({ service: 'auth' });

      childLogger.info('child message');

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.service).toBe('auth');
      expect(output.message).toBe('child message');
    });

    it('child logger merges additional context', () => {
      const logger = createLogger({ level: 'info', format: 'json' });
      const childLogger = logger.child({ service: 'auth' });

      childLogger.info('message', { requestId: '123' });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.service).toBe('auth');
      expect(output.requestId).toBe('123');
    });

    it('child logger can create grandchild loggers', () => {
      const logger = createLogger({ level: 'info', format: 'json' });
      const childLogger = logger.child({ service: 'auth' });
      const grandchildLogger = childLogger.child({ module: 'login' });

      grandchildLogger.info('grandchild message');

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.service).toBe('auth');
      expect(output.module).toBe('login');
    });

    it('child context overrides parent context on conflict', () => {
      const logger = createLogger({ level: 'info', format: 'json' });
      const childLogger = logger.child({ version: '1.0' });
      const grandchildLogger = childLogger.child({ version: '2.0' });

      grandchildLogger.info('message');

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.version).toBe('2.0');
    });

    it('child logger inherits log level', () => {
      const logger = createLogger({ level: 'warn', format: 'json' });
      const childLogger = logger.child({ service: 'test' });

      childLogger.info('info message');
      childLogger.debug('debug message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('child logger inherits format', () => {
      const logger = createLogger({ level: 'info', format: 'json' });
      const childLogger = logger.child({ service: 'test' });

      childLogger.info('message');

      const output = consoleSpy.log.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('does not modify parent logger context', () => {
      const logger = createLogger({ level: 'info', format: 'json' });
      logger.child({ childOnly: 'value' });

      logger.info('parent message');

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.childOnly).toBeUndefined();
    });
  });

  describe('File Output', () => {
    it('writes logs to file when file path specified', async () => {
      const logFile = join(testDir, 'test.log');
      const logger = createLogger({
        level: 'info',
        format: 'json',
        output: {
          console: false,
          file: logFile,
        },
      });

      logger.info('file log message');

      // Wait for async file write
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(existsSync(logFile)).toBe(true);
      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('file log message');
    });

    it('appends to existing log file', async () => {
      const logFile = join(testDir, 'append.log');
      writeFileSync(logFile, 'existing content\n');

      const logger = createLogger({
        level: 'info',
        format: 'json',
        output: {
          console: false,
          file: logFile,
        },
      });

      logger.info('new message');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('existing content');
      expect(content).toContain('new message');
    });

    it('creates parent directories if they do not exist', async () => {
      const logFile = join(testDir, 'nested', 'deep', 'test.log');
      const logger = createLogger({
        level: 'info',
        format: 'json',
        output: {
          console: false,
          file: logFile,
        },
      });

      logger.info('nested log message');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(existsSync(logFile)).toBe(true);
    });

    it('can output to both console and file', async () => {
      const logFile = join(testDir, 'both.log');
      const logger = createLogger({
        level: 'info',
        format: 'json',
        output: {
          console: true,
          file: logFile,
        },
      });

      logger.info('dual output message');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(consoleSpy.log).toHaveBeenCalled();
      expect(existsSync(logFile)).toBe(true);
      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('dual output message');
    });

    it('handles file write errors gracefully', async () => {
      // Use an invalid path that should fail
      const logger = createLogger({
        level: 'info',
        format: 'json',
        output: {
          console: true,
          file: '/nonexistent/path/that/should/fail/test.log',
        },
      });

      // Should not throw, just log to console
      expect(() => logger.info('message')).not.toThrow();
    });

    it('child logger inherits file output', async () => {
      const logFile = join(testDir, 'child-file.log');
      const logger = createLogger({
        level: 'info',
        format: 'json',
        output: {
          console: false,
          file: logFile,
        },
      });

      const childLogger = logger.child({ service: 'test' });
      childLogger.info('child file message');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('child file message');
      expect(content).toContain('service');
    });

    it('writes each log entry on a new line', async () => {
      const logFile = join(testDir, 'multiline.log');
      const logger = createLogger({
        level: 'info',
        format: 'json',
        output: {
          console: false,
          file: logFile,
        },
      });

      logger.info('first message');
      logger.info('second message');
      logger.info('third message');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(3);
      expect(JSON.parse(lines[0]).message).toBe('first message');
      expect(JSON.parse(lines[1]).message).toBe('second message');
      expect(JSON.parse(lines[2]).message).toBe('third message');
    });
  });

  describe('Console Output Control', () => {
    it('suppresses console output when console is false', () => {
      const logger = createLogger({
        level: 'info',
        format: 'json',
        output: {
          console: false,
        },
      });

      logger.info('silent message');
      logger.error('silent error');
      logger.warn('silent warn');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('enables console output when console is true', () => {
      const logger = createLogger({
        level: 'info',
        format: 'json',
        output: {
          console: true,
        },
      });

      logger.info('console message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty message', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      logger.info('');

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.message).toBe('');
    });

    it('handles very long messages', () => {
      const logger = createLogger({ level: 'info', format: 'json' });
      const longMessage = 'A'.repeat(10000);

      logger.info(longMessage);

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.message).toBe(longMessage);
    });

    it('handles special characters in message', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      logger.info('Message with "quotes" and \n newlines');

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.message).toBe('Message with "quotes" and \n newlines');
    });

    it('handles unicode in message', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      logger.info('Unicode: \u{1F600} \u{1F4A5} \u{1F389}');

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.message).toContain('\u{1F600}');
    });

    it('handles circular references in context gracefully', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;

      // Should not throw
      expect(() => logger.info('circular', circular)).not.toThrow();
    });

    it('handles Error objects in context', () => {
      const logger = createLogger({ level: 'info', format: 'json' });
      const error = new Error('test error');

      logger.info('with error', { error });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.error).toBeDefined();
    });

    it('handles Date objects in context', () => {
      const logger = createLogger({ level: 'info', format: 'json' });
      const date = new Date('2024-01-15T10:30:00Z');

      logger.info('with date', { date });

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.date).toBe('2024-01-15T10:30:00.000Z');
    });

    it('handles empty context object', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      logger.info('message', {});

      const output = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(output.message).toBe('message');
    });

    it('handles rapid successive calls', () => {
      const logger = createLogger({ level: 'info', format: 'json' });

      for (let i = 0; i < 100; i++) {
        logger.info(`message ${i}`);
      }

      expect(consoleSpy.log).toHaveBeenCalledTimes(100);
    });
  });

  describe('Type Exports', () => {
    it('exports LogLevel type', () => {
      // This test verifies type exports are correct at compile time
      const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
      expect(levels).toHaveLength(4);
    });

    it('exports LoggerConfig type', () => {
      const config: LoggerConfig = {
        level: 'info',
        format: 'json',
        output: {
          console: true,
          file: '/tmp/test.log',
        },
      };
      expect(config.level).toBe('info');
    });

    it('exports Logger type', () => {
      const logger: Logger = createLogger();
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.child).toBe('function');
    });
  });
});

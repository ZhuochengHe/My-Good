/**
 * Tests for CLI output adapters.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OutputAdapter } from '../../src/cli/output-adapter.js';
import { PlainTextOutput } from '../../src/cli/plain-text-output.js';

describe('PlainTextOutput', () => {
  let output: OutputAdapter;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on process.stdout.write and process.stderr.write
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    output = new PlainTextOutput();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('write', () => {
    it('should write text to stdout', () => {
      output.write('Hello, world!');

      expect(stdoutSpy).toHaveBeenCalledWith('Hello, world!\n');
    });

    it('should write multiple lines', () => {
      output.write('Line 1');
      output.write('Line 2');

      expect(stdoutSpy).toHaveBeenCalledTimes(2);
      expect(stdoutSpy).toHaveBeenNthCalledWith(1, 'Line 1\n');
      expect(stdoutSpy).toHaveBeenNthCalledWith(2, 'Line 2\n');
    });

    it('should handle empty string', () => {
      output.write('');

      expect(stdoutSpy).toHaveBeenCalledWith('\n');
    });

    it('should not add extra newline if text ends with newline', () => {
      output.write('Text with newline\n');

      expect(stdoutSpy).toHaveBeenCalledWith('Text with newline\n');
    });
  });

  describe('writeError', () => {
    it('should write error to stderr with prefix', () => {
      output.writeError('Something went wrong');

      expect(stderrSpy).toHaveBeenCalledWith('Error: Something went wrong\n');
    });

    it('should handle error with existing Error prefix', () => {
      output.writeError('Error: Duplicate error');

      expect(stderrSpy).toHaveBeenCalledWith('Error: Duplicate error\n');
    });

    it('should write multiple errors', () => {
      output.writeError('Error 1');
      output.writeError('Error 2');

      expect(stderrSpy).toHaveBeenCalledTimes(2);
      expect(stderrSpy).toHaveBeenNthCalledWith(1, 'Error: Error 1\n');
      expect(stderrSpy).toHaveBeenNthCalledWith(2, 'Error: Error 2\n');
    });

    it('should handle empty error message', () => {
      output.writeError('');

      expect(stderrSpy).toHaveBeenCalledWith('Error: \n');
    });
  });

  describe('writeSuccess', () => {
    it('should write success message to stdout with prefix', () => {
      output.writeSuccess('Operation completed');

      expect(stdoutSpy).toHaveBeenCalledWith('Success: Operation completed\n');
    });

    it('should handle success with existing Success prefix', () => {
      output.writeSuccess('Success: Already prefixed');

      expect(stdoutSpy).toHaveBeenCalledWith('Success: Already prefixed\n');
    });

    it('should write multiple success messages', () => {
      output.writeSuccess('Task 1 done');
      output.writeSuccess('Task 2 done');

      expect(stdoutSpy).toHaveBeenCalledTimes(2);
      expect(stdoutSpy).toHaveBeenNthCalledWith(1, 'Success: Task 1 done\n');
      expect(stdoutSpy).toHaveBeenNthCalledWith(2, 'Success: Task 2 done\n');
    });
  });

  describe('writeTokenUsage', () => {
    it('should write token usage in readable format', () => {
      output.writeTokenUsage({
        inputTokens: 150,
        outputTokens: 75,
        totalTokens: 225,
      });

      expect(stdoutSpy).toHaveBeenCalledWith(
        '  ↑ 150  ↓ 75  ∑ 225\n'
      );
    });

    it('should handle zero tokens', () => {
      output.writeTokenUsage({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });

      expect(stdoutSpy).toHaveBeenCalledWith(
        '  ↑ 0  ↓ 0  ∑ 0\n'
      );
    });

    it('should handle large token counts', () => {
      output.writeTokenUsage({
        inputTokens: 12345,
        outputTokens: 67890,
        totalTokens: 80235,
      });

      expect(stdoutSpy).toHaveBeenCalledWith(
        '  ↑ 12345  ↓ 67890  ∑ 80235\n'
      );
    });
  });

  describe('startLoading and stopLoading', () => {
    it('should have optional loading methods', () => {
      expect(output.startLoading).toBeDefined();
      expect(output.stopLoading).toBeDefined();
    });

    it('should handle startLoading call', () => {
      // For PlainTextOutput, this should write the loading message
      output.startLoading?.('Processing...');

      expect(stdoutSpy).toHaveBeenCalledWith('Processing...\n');
    });

    it('should handle stopLoading call', () => {
      // For PlainTextOutput, this should be a no-op (no spinner to clear)
      output.stopLoading?.();

      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should handle loading without message', () => {
      output.startLoading?.('');

      expect(stdoutSpy).toHaveBeenCalledWith('\n');
    });
  });

  describe('edge cases', () => {
    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      output.write(longText);

      expect(stdoutSpy).toHaveBeenCalledWith(`${longText}\n`);
    });

    it('should handle text with multiple newlines', () => {
      output.write('Line 1\nLine 2\nLine 3');

      expect(stdoutSpy).toHaveBeenCalledWith('Line 1\nLine 2\nLine 3\n');
    });

    it('should handle special characters', () => {
      output.write('Special: \t\r\n🚀');

      expect(stdoutSpy).toHaveBeenCalledWith('Special: \t\r\n🚀\n');
    });

    it('should handle Unicode characters', () => {
      output.write('Unicode: 你好世界');

      expect(stdoutSpy).toHaveBeenCalledWith('Unicode: 你好世界\n');
    });
  });
});

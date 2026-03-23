/**
 * Tests for ColoredOutput adapter.
 * Following TDD: tests written before implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OutputAdapter } from '../../src/cli/output-adapter.js';
import { ColoredOutput } from '../../src/cli/colored-output.js';

describe('ColoredOutput', () => {
  let output: OutputAdapter;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    output = new ColoredOutput();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('implements OutputAdapter', () => {
    it('should have all required methods', () => {
      expect(typeof output.write).toBe('function');
      expect(typeof output.writeError).toBe('function');
      expect(typeof output.writeSuccess).toBe('function');
      expect(typeof output.writeTokenUsage).toBe('function');
      expect(typeof output.startLoading).toBe('function');
      expect(typeof output.stopLoading).toBe('function');
    });
  });

  describe('write', () => {
    it('should write text to stdout', () => {
      output.write('Hello, world!');
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('Hello, world!');
    });

    it('should add newline if not present', () => {
      output.write('No newline');
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toMatch(/No newline\n$/);
    });

    it('should not add extra newline if text ends with newline', () => {
      output.write('Already has newline\n');
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).not.toMatch(/\n\n$/);
    });

    it('should handle empty string', () => {
      output.write('');
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('writeError', () => {
    it('should write to stderr', () => {
      output.writeError('Something went wrong');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('should include the error message text', () => {
      output.writeError('Something went wrong');
      const written = String(stderrSpy.mock.calls[0][0]);
      expect(written).toContain('Something went wrong');
    });

    it('should add Error prefix if not present', () => {
      output.writeError('Something went wrong');
      const written = String(stderrSpy.mock.calls[0][0]);
      expect(written).toContain('Error');
    });

    it('should not double-prefix if already starts with Error:', () => {
      output.writeError('Error: Already prefixed');
      const written = String(stderrSpy.mock.calls[0][0]);
      expect(written).not.toMatch(/Error:.*Error:/);
    });
  });

  describe('writeSuccess', () => {
    it('should write to stdout', () => {
      output.writeSuccess('Operation completed');
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should include the success message text', () => {
      output.writeSuccess('Operation completed');
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('Operation completed');
    });

    it('should add Success prefix if not present', () => {
      output.writeSuccess('Operation completed');
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('Success');
    });

    it('should not double-prefix if already starts with Success:', () => {
      output.writeSuccess('Success: Already prefixed');
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).not.toMatch(/Success:.*Success:/);
    });
  });

  describe('writeTokenUsage', () => {
    it('should write to stdout', () => {
      output.writeTokenUsage({ inputTokens: 150, outputTokens: 75, totalTokens: 225 });
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should include all token counts', () => {
      output.writeTokenUsage({ inputTokens: 150, outputTokens: 75, totalTokens: 225 });
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('150');
      expect(written).toContain('75');
      expect(written).toContain('225');
    });

    it('should handle zero tokens', () => {
      output.writeTokenUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('startLoading and stopLoading with injectable spinner', () => {
    it('should start spinner on startLoading', () => {
      const mockSpinner = {
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
      };
      const coloredOutput = new ColoredOutput({ spinnerFactory: () => mockSpinner as never });

      coloredOutput.startLoading('Thinking...');

      expect(mockSpinner.start).toHaveBeenCalledTimes(1);
    });

    it('should stop spinner on stopLoading', () => {
      const mockSpinner = {
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
      };
      const coloredOutput = new ColoredOutput({ spinnerFactory: () => mockSpinner as never });

      coloredOutput.startLoading('Thinking...');
      coloredOutput.stopLoading();

      expect(mockSpinner.stop).toHaveBeenCalledTimes(1);
    });

    it('should be safe to call stopLoading without startLoading', () => {
      const coloredOutput = new ColoredOutput();
      expect(() => coloredOutput.stopLoading()).not.toThrow();
    });

    it('should pass message to spinner', () => {
      let capturedText = '';
      const mockSpinner = {
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
      };
      const coloredOutput = new ColoredOutput({
        spinnerFactory: (text: string) => {
          capturedText = text;
          return mockSpinner as never;
        },
      });

      coloredOutput.startLoading('Processing files...');

      expect(capturedText).toBe('Processing files...');
    });
  });
});

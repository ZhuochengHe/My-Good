/**
 * Tests for ColoredOutput adapter.
 * Following TDD: tests written before implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OutputAdapter } from '../../src/cli/output-adapter.js';
import { ColoredOutput, resolveChalkLevel } from '../../src/cli/colored-output.js';

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

  describe('formatUserPrompt', () => {
    it('should return string containing the label', () => {
      const coloredOutput = new ColoredOutput();
      const result = coloredOutput.formatUserPrompt('you');
      expect(result).toContain('you');
    });

    it('should return string containing the › separator', () => {
      const coloredOutput = new ColoredOutput();
      const result = coloredOutput.formatUserPrompt('you');
      expect(result).toContain('›');
    });
  });

  describe('formatAgentLine', () => {
    it('should return string containing the label', () => {
      const coloredOutput = new ColoredOutput();
      const result = coloredOutput.formatAgentLine('agent', 'hello');
      expect(result).toContain('agent');
    });

    it('should return string containing the › separator', () => {
      const coloredOutput = new ColoredOutput();
      const result = coloredOutput.formatAgentLine('agent', 'hello');
      expect(result).toContain('›');
    });

    it('should return string containing the response', () => {
      const coloredOutput = new ColoredOutput();
      const result = coloredOutput.formatAgentLine('agent', 'hello');
      expect(result).toContain('hello');
    });
  });

  describe('startLoading and stopLoading with injectable spinner', () => {
    it('should start spinner on startLoading', () => {
      const mockSpinner = {
        text: '',
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
      };
      const coloredOutput = new ColoredOutput({ spinnerFactory: () => mockSpinner as never });

      coloredOutput.startLoading('Thinking...');
      coloredOutput.stopLoading();

      expect(mockSpinner.start).toHaveBeenCalledTimes(1);
    });

    it('should stop spinner on stopLoading', () => {
      const mockSpinner = {
        text: '',
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
        text: '',
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
      coloredOutput.stopLoading();

      expect(capturedText).toBe('Processing files...');
    });
  });

  describe('startLoading elapsed timer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows original message before 5s', () => {
      let spinnerText = 'Thinking...';
      const mockSpinner = {
        get text() { return spinnerText; },
        set text(v: string) { spinnerText = v; },
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
      };
      const coloredOutput = new ColoredOutput({ spinnerFactory: () => mockSpinner as never });

      coloredOutput.startLoading('Thinking...');
      vi.advanceTimersByTime(3000);

      expect(spinnerText).toBe('Thinking...');

      coloredOutput.stopLoading();
    });

    it('shows elapsed time after 5s', () => {
      let spinnerText = 'Thinking...';
      const mockSpinner = {
        get text() { return spinnerText; },
        set text(v: string) { spinnerText = v; },
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
      };
      const coloredOutput = new ColoredOutput({ spinnerFactory: () => mockSpinner as never });

      coloredOutput.startLoading('Thinking...');
      vi.advanceTimersByTime(6000);

      expect(spinnerText).toContain('(6s)');

      coloredOutput.stopLoading();
    });

    it('clears timer on stopLoading', () => {
      let spinnerText = 'Thinking...';
      const mockSpinner = {
        get text() { return spinnerText; },
        set text(v: string) { spinnerText = v; },
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
      };
      const coloredOutput = new ColoredOutput({ spinnerFactory: () => mockSpinner as never });

      coloredOutput.startLoading('Thinking...');
      coloredOutput.stopLoading();
      vi.advanceTimersByTime(10000);

      expect(spinnerText).toBe('Thinking...');
    });
  });
});

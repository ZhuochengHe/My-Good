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

    it('should include Unicode direction symbols', () => {
      output.writeTokenUsage({ inputTokens: 150, outputTokens: 75, totalTokens: 225 });
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('↑');
      expect(written).toContain('↓');
      expect(written).toContain('∑');
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

  describe('resolveChalkLevel', () => {
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      savedEnv['NO_COLOR'] = process.env['NO_COLOR'];
      savedEnv['TERM'] = process.env['TERM'];
      savedEnv['COLORTERM'] = process.env['COLORTERM'];
    });

    afterEach(() => {
      if (savedEnv['NO_COLOR'] === undefined) {
        delete process.env['NO_COLOR'];
      } else {
        process.env['NO_COLOR'] = savedEnv['NO_COLOR'];
      }
      if (savedEnv['TERM'] === undefined) {
        delete process.env['TERM'];
      } else {
        process.env['TERM'] = savedEnv['TERM'];
      }
      if (savedEnv['COLORTERM'] === undefined) {
        delete process.env['COLORTERM'];
      } else {
        process.env['COLORTERM'] = savedEnv['COLORTERM'];
      }
    });

    it('returns 0 when NO_COLOR is set to empty string', () => {
      process.env['NO_COLOR'] = '';
      expect(resolveChalkLevel()).toBe(0);
    });

    it('returns 0 when NO_COLOR is set to any value', () => {
      process.env['NO_COLOR'] = '1';
      expect(resolveChalkLevel()).toBe(0);
    });

    it('returns 2 for 256color terminal when NO_COLOR is absent', () => {
      delete process.env['NO_COLOR'];
      delete process.env['COLORTERM'];
      process.env['TERM'] = 'xterm-256color';
      // isTTY is likely undefined in test env so TERM fallback applies
      if (!process.stdout.isTTY) {
        expect(resolveChalkLevel()).toBe(2);
      }
    });

    it('returns 3 for truecolor COLORTERM when NO_COLOR is absent', () => {
      delete process.env['NO_COLOR'];
      process.env['COLORTERM'] = 'truecolor';
      if (!process.stdout.isTTY) {
        expect(resolveChalkLevel()).toBe(3);
      }
    });

    it('returns 3 for 24bit COLORTERM when NO_COLOR is absent', () => {
      delete process.env['NO_COLOR'];
      process.env['COLORTERM'] = '24bit';
      if (!process.stdout.isTTY) {
        expect(resolveChalkLevel()).toBe(3);
      }
    });
  });

  describe('updateLoading', () => {
    it('updates spinner text when spinner is active', () => {
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
      coloredOutput.updateLoading('Using tool: read_file');

      expect(spinnerText).toBe('Using tool: read_file');

      coloredOutput.stopLoading();
    });

    it('is a no-op when spinner is not active', () => {
      const coloredOutput = new ColoredOutput();
      // Should not throw when no spinner is running
      expect(() => coloredOutput.updateLoading('test')).not.toThrow();
    });

    it('resets spinner text back to original message after tool call', () => {
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
      coloredOutput.updateLoading('Using tool: shell');
      coloredOutput.updateLoading('Thinking...');

      expect(spinnerText).toBe('Thinking...');

      coloredOutput.stopLoading();
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

  describe('writeHeader', () => {
    /** Minimal ChatHeaderInfo fixture for header tests. */
    const BASE_INFO = {
      agentName:  'Test Agent',
      provider:   'anthropic',
      model:      'claude-3',
      sessionId:  'a1b2c3d4',
      userLabel:  'you',
      agentLabel: 'agent',
    };

    it('should write to stdout', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader(BASE_INFO);
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should include agent name in output', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader(BASE_INFO);
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('Test Agent');
    });

    it('should include session id in output', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader(BASE_INFO);
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('a1b2c3d4');
    });

    it('hint text contains "? for help" when no memoryEntryCount', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader(BASE_INFO);
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('? for help');
    });

    it('hint text contains "exit" when no memoryEntryCount', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader(BASE_INFO);
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('exit');
    });

    it('should not show memory indicator when memoryEntryCount is 0', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader({ ...BASE_INFO, memoryEntryCount: 0 });
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).not.toContain('mem');
    });

    it('should not show memory indicator when memoryEntryCount is undefined', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader({ ...BASE_INFO, memoryEntryCount: undefined });
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).not.toContain('mem');
    });

    it('should show memory indicator when memoryEntryCount is 5', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader({ ...BASE_INFO, memoryEntryCount: 5 });
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('mem');
      expect(written).toContain('5');
    });

    it('should show memory count value when memoryEntryCount is 42', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader({ ...BASE_INFO, memoryEntryCount: 42 });
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).toContain('42');
    });

    it('should not show "? for help" hint when memory indicator is present', () => {
      const coloredOutput = new ColoredOutput();
      coloredOutput.writeHeader({ ...BASE_INFO, memoryEntryCount: 7 });
      const written = String(stdoutSpy.mock.calls[0][0]);
      expect(written).not.toContain('? for help');
    });
  });
});

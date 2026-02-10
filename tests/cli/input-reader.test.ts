/**
 * Tests for CLI input readers.
 * Following TDD: Write tests FIRST, then implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { InputReader } from '../../src/cli/input-reader.js';

// Mock readline module
const mockRl = {
  question: vi.fn(),
  close: vi.fn(),
};

vi.mock('readline', () => ({
  createInterface: vi.fn(() => mockRl),
}));

describe('StdinInputReader', () => {
  let reader: InputReader;

  beforeEach(async () => {
    // Dynamic import after mocking
    const { StdinInputReader } = await import('../../src/cli/stdin-input-reader.js');
    reader = new StdinInputReader();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('prompt', () => {
    it('should return single line input', async () => {
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          callback('Hello, world!');
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toBe('Hello, world!');
      expect(mockRl.close).toHaveBeenCalled();
    });

    it('should handle multi-line input with backslash continuation', async () => {
      let questionCount = 0;
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          if (questionCount === 0) {
            questionCount++;
            callback('First line \\');
          } else if (questionCount === 1) {
            questionCount++;
            callback('Second line \\');
          } else {
            callback('Third line');
          }
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toBe('First line Second line Third line');
      expect(mockRl.question).toHaveBeenCalledTimes(3);
      expect(mockRl.close).toHaveBeenCalled();
    });

    it('should trim trailing backslash and whitespace', async () => {
      let questionCount = 0;
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          if (questionCount === 0) {
            questionCount++;
            callback('Line with backslash \\   ');
          } else {
            callback('next line');
          }
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toBe('Line with backslash next line');
    });

    it('should use continuation prompt for multi-line', async () => {
      let questionCount = 0;
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          if (questionCount === 0) {
            expect(query).toBe('> ');
            questionCount++;
            callback('First \\');
          } else {
            expect(query).toBe('... ');
            callback('Second');
          }
        }
      );

      await reader.prompt('> ');

      expect(mockRl.question).toHaveBeenCalledTimes(2);
    });

    it('should handle empty input', async () => {
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          callback('');
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toBe('');
    });

    it('should handle only backslash input', async () => {
      let questionCount = 0;
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          if (questionCount === 0) {
            questionCount++;
            callback('\\');
          } else {
            callback('next');
          }
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toBe('next');
    });

    it('should handle multiple consecutive backslashes', async () => {
      let questionCount = 0;
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          if (questionCount === 0) {
            questionCount++;
            callback('Line 1 \\');
          } else if (questionCount === 1) {
            questionCount++;
            callback('Line 2 \\');
          } else if (questionCount === 2) {
            questionCount++;
            callback('Line 3 \\');
          } else {
            callback('Line 4');
          }
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toBe('Line 1 Line 2 Line 3 Line 4');
      expect(mockRl.question).toHaveBeenCalledTimes(4);
    });

    it('should handle whitespace-only lines with backslash', async () => {
      let questionCount = 0;
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          if (questionCount === 0) {
            questionCount++;
            callback('First \\');
          } else if (questionCount === 1) {
            questionCount++;
            callback('   \\');
          } else {
            callback('Last');
          }
        }
      );

      const input = await reader.prompt('> ');

      // Whitespace-only line becomes empty string, joined with space
      expect(input).toBe('First  Last');
    });

    it('should preserve spaces within lines', async () => {
      let questionCount = 0;
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          if (questionCount === 0) {
            questionCount++;
            callback('  Leading spaces \\');
          } else {
            callback('trailing spaces  ');
          }
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toBe('Leading spaces trailing spaces');
    });
  });

  describe('close', () => {
    it('should cleanup resources', () => {
      // Reader doesn't hold persistent readline interface, so close is a no-op
      reader.close();

      // Should not throw
      expect(() => reader.close()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle very long single line', async () => {
      const longInput = 'a'.repeat(10000);
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          callback(longInput);
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toBe(longInput);
    });

    it('should handle many continuation lines', async () => {
      let questionCount = 0;
      const maxLines = 50;

      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          if (questionCount < maxLines - 1) {
            questionCount++;
            callback(`Line ${questionCount} \\`);
          } else {
            callback('Last line');
          }
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toContain('Line 1');
      expect(input).toContain('Line 49');
      expect(input).toContain('Last line');
      expect(mockRl.question).toHaveBeenCalledTimes(maxLines);
    });

    it('should handle special characters in input', async () => {
      mockRl.question.mockImplementation(
        (query: string, callback: (answer: string) => void) => {
          callback('Special: \t\n🚀 \\u0041');
        }
      );

      const input = await reader.prompt('> ');

      expect(input).toBe('Special: \t\n🚀 \\u0041');
    });
  });
});

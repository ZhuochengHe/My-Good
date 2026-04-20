/**
 * File operations plugin tests.
 *
 * The file-ops plugin is write-only: read_file and list_directory were removed
 * in favour of shell_exec (cat/ls). Only write_file remains.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ToolContext, ToolHandlerResult } from '../../src/types/tools.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let write_file: any;

describe('file-ops plugin', () => {
  let testDir: string;
  let mockContext: ToolContext;

  beforeEach(async () => {
    testDir = join(tmpdir(), `file-ops-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    mockContext = {
      sessionId: 'test-session',
      workingDirectory: testDir,
      env: {},
    };

    const handlers = await import('../../plugins/file-ops/handlers.js');
    write_file = handlers.write_file;
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('writeFile', () => {
    it('writes content to a file with utf-8 encoding by default', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: 'output.txt', content: 'Test content' },
        mockContext
      );

      expect(result.output).toContain('output.txt');

      const content = await readFile(join(testDir, 'output.txt'), 'utf-8');
      expect(content).toBe('Test content');
    });

    it('writes content with specified encoding', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: 'ascii-output.txt', content: 'ASCII', encoding: 'ascii' },
        mockContext
      );

      expect(result.output).toBeDefined();

      const content = await readFile(join(testDir, 'ascii-output.txt'), 'ascii');
      expect(content).toBe('ASCII');
    });

    it('creates parent directories if they do not exist', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: 'nested/deep/file.txt', content: 'Deep content' },
        mockContext
      );

      expect(result.output).toContain('nested/deep/file.txt');

      const content = await readFile(
        join(testDir, 'nested/deep/file.txt'),
        'utf-8'
      );
      expect(content).toBe('Deep content');
    });

    it('overwrites existing file', async () => {
      await writeFile(join(testDir, 'existing.txt'), 'Old content', 'utf-8');

      await write_file(
        { path: 'existing.txt', content: 'New content' },
        mockContext
      );

      const content = await readFile(join(testDir, 'existing.txt'), 'utf-8');
      expect(content).toBe('New content');
    });

    it('resolves relative paths from working directory', async () => {
      await mkdir(join(testDir, 'subdir'));

      await write_file(
        { path: 'subdir/relative.txt', content: 'Relative write' },
        mockContext
      );

      const content = await readFile(
        join(testDir, 'subdir/relative.txt'),
        'utf-8'
      );
      expect(content).toBe('Relative write');
    });

    it('resolves absolute paths correctly', async () => {
      const absolutePath = join(testDir, 'absolute-write.txt');

      await write_file(
        { path: absolutePath, content: 'Absolute write' },
        mockContext
      );

      const content = await readFile(absolutePath, 'utf-8');
      expect(content).toBe('Absolute write');
    });

    it('handles empty content', async () => {
      await write_file(
        { path: 'empty.txt', content: '' },
        mockContext
      );

      const content = await readFile(join(testDir, 'empty.txt'), 'utf-8');
      expect(content).toBe('');
    });

    it('returns error message when path is null', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: null as unknown as string, content: 'test' },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('treats null content as empty string (touch semantics)', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: 'test.txt', content: null as unknown as string },
        mockContext
      );

      expect(result.output).toContain('File written');
    });

    it('returns error message when required parameters are missing', async () => {
      const result: ToolHandlerResult = await write_file(
        {},
        mockContext
      );

      expect(result.output).toContain('Error');
    });
  });

  describe('edge cases', () => {
    it('handles special characters in filenames', async () => {
      const specialName = 'file with spaces & special-chars.txt';

      await write_file(
        { path: specialName, content: 'special' },
        mockContext
      );

      const content = await readFile(join(testDir, specialName), 'utf-8');
      expect(content).toBe('special');
    });

    it('handles unicode content', async () => {
      const unicodeContent = 'Hello 世界 🌍';

      await write_file(
        { path: 'unicode.txt', content: unicodeContent },
        mockContext
      );

      const content = await readFile(join(testDir, 'unicode.txt'), 'utf-8');
      expect(content).toBe(unicodeContent);
    });

    it('handles large file content', async () => {
      const largeContent = 'x'.repeat(10000);

      await write_file(
        { path: 'large.txt', content: largeContent },
        mockContext
      );

      const content = await readFile(join(testDir, 'large.txt'), 'utf-8');
      expect(content).toBe(largeContent);
    });
  });
});

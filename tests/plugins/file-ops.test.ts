/**
 * File operations plugin tests (TDD - written first).
 *
 * Tests readFile, writeFile, and listDirectory handlers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ToolContext, ToolHandlerResult } from '../../src/types/tools.js';

// Import handlers from the plugin (JavaScript module)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let read_file: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let write_file: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let list_directory: any;

describe('file-ops plugin', () => {
  let testDir: string;
  let mockContext: ToolContext;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `file-ops-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    mockContext = {
      sessionId: 'test-session',
      workingDirectory: testDir,
      env: {},
    };

    // Dynamically import the handlers
    const handlers = await import(
      '../../plugins/file-ops/handlers.js'
    );
    read_file = handlers.read_file;
    write_file = handlers.write_file;
    list_directory = handlers.list_directory;
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('readFile', () => {
    it('reads a file with utf-8 encoding by default', async () => {
      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, 'Hello, World!', 'utf-8');

      const result: ToolHandlerResult = await read_file(
        { path: 'test.txt' },
        mockContext
      );

      expect(result.output).toBe('Hello, World!');
      expect(result.artifacts).toBeUndefined();
    });

    it('reads a file with specified encoding', async () => {
      const testFile = join(testDir, 'test-ascii.txt');
      await writeFile(testFile, 'ASCII text', 'ascii');

      const result: ToolHandlerResult = await read_file(
        { path: 'test-ascii.txt', encoding: 'ascii' },
        mockContext
      );

      expect(result.output).toBe('ASCII text');
    });

    it('resolves relative paths from working directory', async () => {
      const subDir = join(testDir, 'subdir');
      await mkdir(subDir);
      const testFile = join(subDir, 'nested.txt');
      await writeFile(testFile, 'Nested content', 'utf-8');

      const result: ToolHandlerResult = await read_file(
        { path: 'subdir/nested.txt' },
        mockContext
      );

      expect(result.output).toBe('Nested content');
    });

    it('resolves absolute paths correctly', async () => {
      const testFile = join(testDir, 'absolute.txt');
      await writeFile(testFile, 'Absolute path content', 'utf-8');

      const result: ToolHandlerResult = await read_file(
        { path: testFile },
        mockContext
      );

      expect(result.output).toBe('Absolute path content');
    });

    it('returns error message when file does not exist', async () => {
      const result: ToolHandlerResult = await read_file(
        { path: 'nonexistent.txt' },
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toContain('nonexistent.txt');
    });

    it('returns error message when path is a directory', async () => {
      const subDir = join(testDir, 'isdir');
      await mkdir(subDir);

      const result: ToolHandlerResult = await read_file(
        { path: 'isdir' },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('handles null path gracefully', async () => {
      const result: ToolHandlerResult = await read_file(
        { path: null as unknown as string },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('handles undefined path gracefully', async () => {
      const result: ToolHandlerResult = await read_file(
        {},
        mockContext
      );

      expect(result.output).toContain('Error');
    });
  });

  describe('writeFile', () => {
    it('writes content to a file with utf-8 encoding by default', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: 'output.txt', content: 'Test content' },
        mockContext
      );

      expect(result.output).toContain('success');
      expect(result.output).toContain('output.txt');

      const content = await readFile(join(testDir, 'output.txt'), 'utf-8');
      expect(content).toBe('Test content');
    });

    it('writes content with specified encoding', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: 'ascii-output.txt', content: 'ASCII', encoding: 'ascii' },
        mockContext
      );

      expect(result.output).toContain('success');

      const content = await readFile(join(testDir, 'ascii-output.txt'), 'ascii');
      expect(content).toBe('ASCII');
    });

    it('creates parent directories if they do not exist', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: 'nested/deep/file.txt', content: 'Deep content' },
        mockContext
      );

      expect(result.output).toContain('success');

      const content = await readFile(
        join(testDir, 'nested/deep/file.txt'),
        'utf-8'
      );
      expect(content).toBe('Deep content');
    });

    it('overwrites existing file', async () => {
      await writeFile(join(testDir, 'existing.txt'), 'Old content', 'utf-8');

      const result: ToolHandlerResult = await write_file(
        { path: 'existing.txt', content: 'New content' },
        mockContext
      );

      expect(result.output).toContain('success');

      const content = await readFile(join(testDir, 'existing.txt'), 'utf-8');
      expect(content).toBe('New content');
    });

    it('resolves relative paths from working directory', async () => {
      await mkdir(join(testDir, 'subdir'));

      const result: ToolHandlerResult = await write_file(
        { path: 'subdir/relative.txt', content: 'Relative write' },
        mockContext
      );

      expect(result.output).toContain('success');

      const content = await readFile(
        join(testDir, 'subdir/relative.txt'),
        'utf-8'
      );
      expect(content).toBe('Relative write');
    });

    it('resolves absolute paths correctly', async () => {
      const absolutePath = join(testDir, 'absolute-write.txt');

      const result: ToolHandlerResult = await write_file(
        { path: absolutePath, content: 'Absolute write' },
        mockContext
      );

      expect(result.output).toContain('success');

      const content = await readFile(absolutePath, 'utf-8');
      expect(content).toBe('Absolute write');
    });

    it('handles empty content', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: 'empty.txt', content: '' },
        mockContext
      );

      expect(result.output).toContain('success');

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

    it('returns error message when content is null', async () => {
      const result: ToolHandlerResult = await write_file(
        { path: 'test.txt', content: null as unknown as string },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('returns error message when required parameters are missing', async () => {
      const result: ToolHandlerResult = await write_file(
        {},
        mockContext
      );

      expect(result.output).toContain('Error');
    });
  });

  describe('listDirectory', () => {
    beforeEach(async () => {
      // Create test directory structure
      await mkdir(join(testDir, 'subdir'));
      await mkdir(join(testDir, 'subdir/nested'));
      await writeFile(join(testDir, 'file1.txt'), 'content1', 'utf-8');
      await writeFile(join(testDir, 'file2.md'), 'content2', 'utf-8');
      await writeFile(join(testDir, 'subdir/file3.js'), 'content3', 'utf-8');
      await writeFile(
        join(testDir, 'subdir/nested/file4.json'),
        'content4',
        'utf-8'
      );
    });

    it('lists files and directories in a directory', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: '.' },
        mockContext
      );

      expect(result.output).toContain('file1.txt');
      expect(result.output).toContain('file2.md');
      expect(result.output).toContain('subdir');
    });

    it('includes metadata (type, size, modified)', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: '.' },
        mockContext
      );

      // Should include type information
      expect(result.output).toMatch(/type.*file|file.*type/i);
      expect(result.output).toMatch(/type.*directory|directory.*type/i);

      // Should include size information
      expect(result.output).toMatch(/size/i);
    });

    it('lists non-recursively by default', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: '.' },
        mockContext
      );

      expect(result.output).toContain('file1.txt');
      expect(result.output).toContain('subdir');
      // Nested files should not appear
      expect(result.output).not.toContain('file3.js');
      expect(result.output).not.toContain('file4.json');
    });

    it('lists recursively when recursive is true', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: '.', recursive: true },
        mockContext
      );

      expect(result.output).toContain('file1.txt');
      expect(result.output).toContain('file2.md');
      expect(result.output).toContain('file3.js');
      expect(result.output).toContain('file4.json');
    });

    it('lists subdirectory contents', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: 'subdir' },
        mockContext
      );

      expect(result.output).toContain('file3.js');
      expect(result.output).toContain('nested');
      expect(result.output).not.toContain('file1.txt');
    });

    it('resolves relative paths from working directory', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: 'subdir/nested' },
        mockContext
      );

      expect(result.output).toContain('file4.json');
    });

    it('resolves absolute paths correctly', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: testDir },
        mockContext
      );

      expect(result.output).toContain('file1.txt');
      expect(result.output).toContain('subdir');
    });

    it('returns error message when directory does not exist', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: 'nonexistent-dir' },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('returns error message when path is a file', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: 'file1.txt' },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('returns error message when path is null', async () => {
      const result: ToolHandlerResult = await list_directory(
        { path: null as unknown as string },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('returns error message when path is undefined', async () => {
      const result: ToolHandlerResult = await list_directory(
        {},
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('handles empty directory', async () => {
      await mkdir(join(testDir, 'empty-dir'));

      const result: ToolHandlerResult = await list_directory(
        { path: 'empty-dir' },
        mockContext
      );

      expect(result.output).toContain('empty');
    });
  });

  describe('edge cases', () => {
    it('handles special characters in filenames', async () => {
      const specialName = 'file with spaces & special-chars.txt';
      await writeFile(join(testDir, specialName), 'special', 'utf-8');

      const readResult: ToolHandlerResult = await read_file(
        { path: specialName },
        mockContext
      );

      expect(readResult.output).toBe('special');

      const listResult: ToolHandlerResult = await list_directory(
        { path: '.' },
        mockContext
      );

      expect(listResult.output).toContain(specialName);
    });

    it('handles unicode content', async () => {
      const unicodeContent = 'Hello 世界 🌍';

      await write_file(
        { path: 'unicode.txt', content: unicodeContent },
        mockContext
      );

      const result: ToolHandlerResult = await read_file(
        { path: 'unicode.txt' },
        mockContext
      );

      expect(result.output).toBe(unicodeContent);
    });

    it('handles large file content', async () => {
      const largeContent = 'x'.repeat(10000);

      await write_file(
        { path: 'large.txt', content: largeContent },
        mockContext
      );

      const result: ToolHandlerResult = await read_file(
        { path: 'large.txt' },
        mockContext
      );

      expect(result.output).toBe(largeContent);
    });
  });

  describe('security - credential file blocking', () => {
    it('should block reading .env files', async () => {
      await writeFile(join(testDir, '.env'), 'API_KEY=secret123', 'utf-8');

      const result: ToolHandlerResult = await read_file(
        { path: '.env' },
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toMatch(/blocked|denied|not allowed/i);
    });

    it('should block reading config.yaml in root', async () => {
      await writeFile(join(testDir, 'config.yaml'), 'apiKey: secret', 'utf-8');

      const result: ToolHandlerResult = await read_file(
        { path: 'config.yaml' },
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toMatch(/blocked|denied|not allowed/i);
    });

    it('should block reading .aws/credentials', async () => {
      await mkdir(join(testDir, '.aws'), { recursive: true });
      await writeFile(join(testDir, '.aws', 'credentials'), '[default]\naws_access_key_id=AKIA...', 'utf-8');

      const result: ToolHandlerResult = await read_file(
        { path: '.aws/credentials' },
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toMatch(/blocked|denied|not allowed/i);
    });

    it('should block reading SSH private keys', async () => {
      await mkdir(join(testDir, '.ssh'), { recursive: true });
      await writeFile(join(testDir, '.ssh', 'id_rsa'), '-----BEGIN PRIVATE KEY-----', 'utf-8');

      const result: ToolHandlerResult = await read_file(
        { path: '.ssh/id_rsa' },
        mockContext
      );

      expect(result.output).toContain('Error');
      expect(result.output).toMatch(/blocked|denied|not allowed/i);
    });

    it('should allow reading normal files', async () => {
      await writeFile(join(testDir, 'normal.txt'), 'Normal content', 'utf-8');

      const result: ToolHandlerResult = await read_file(
        { path: 'normal.txt' },
        mockContext
      );

      expect(result.output).toBe('Normal content');
      expect(result.output).not.toContain('Error');
    });

    it('should sanitize credentials in file content', async () => {
      await writeFile(join(testDir, 'log.txt'), 'Key: sk-ant-api03-test123456789012345678901234567890123456789', 'utf-8');

      const result: ToolHandlerResult = await read_file(
        { path: 'log.txt' },
        mockContext
      );

      expect(result.output).toContain('***REDACTED***');
      expect(result.output).not.toContain('sk-ant-api03');
    });
  });
});

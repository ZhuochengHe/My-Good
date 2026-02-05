/**
 * Shell plugin tests (TDD - written first).
 *
 * Tests execCommand handler for shell command execution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ToolContext, ToolHandlerResult } from '../../src/types/tools.js';

// Skip tests on Windows (plugin is gated to linux/darwin)
const shouldSkip = process.platform === 'win32';

// Import handlers from the plugin (JavaScript module)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let execCommand: any;

describe('shell plugin', { skip: shouldSkip }, () => {
  let testDir: string;
  let mockContext: ToolContext;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `shell-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    mockContext = {
      sessionId: 'test-session',
      workingDirectory: testDir,
      env: { PATH: process.env.PATH || '' },
    };

    // Dynamically import the handlers
    const handlers = await import('../../plugins/shell/handlers.js');
    execCommand = handlers.execCommand;
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('execCommand', () => {
    it('executes simple echo command and captures stdout', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'echo "Hello, World!"' },
        mockContext
      );

      expect(result.output).toContain('Hello, World!');
      expect(result.output).toContain('exit code: 0');
    });

    it('executes pwd command', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'pwd' },
        mockContext
      );

      expect(result.output).toContain(testDir);
      expect(result.output).toContain('exit code: 0');
    });

    it('executes ls command', async () => {
      // Create test files
      await writeFile(join(testDir, 'test1.txt'), 'content1', 'utf-8');
      await writeFile(join(testDir, 'test2.txt'), 'content2', 'utf-8');

      const result: ToolHandlerResult = await execCommand(
        { command: 'ls' },
        mockContext
      );

      expect(result.output).toContain('test1.txt');
      expect(result.output).toContain('test2.txt');
      expect(result.output).toContain('exit code: 0');
    });

    it('captures stderr output', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'echo "error message" >&2' },
        mockContext
      );

      expect(result.output).toContain('error message');
    });

    it('handles commands with non-zero exit codes gracefully', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'exit 42' },
        mockContext
      );

      expect(result.output).toContain('exit code: 42');
      // Should not throw, just return the result
      expect(result.output).toBeDefined();
    });

    it('handles invalid commands gracefully', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'nonexistent-command-xyz' },
        mockContext
      );

      expect(result.output).toContain('not found');
      // Should return error info, not throw
      expect(result.output).toBeDefined();
    });

    it('respects custom cwd parameter', async () => {
      const subDir = join(testDir, 'subdir');
      await mkdir(subDir);
      await writeFile(join(subDir, 'subfile.txt'), 'subcontent', 'utf-8');

      const result: ToolHandlerResult = await execCommand(
        { command: 'pwd', cwd: subDir },
        mockContext
      );

      expect(result.output).toContain(subDir);
      expect(result.output).toContain('exit code: 0');
    });

    it('uses context.workingDirectory as default cwd', async () => {
      await writeFile(join(testDir, 'default-cwd.txt'), 'test', 'utf-8');

      const result: ToolHandlerResult = await execCommand(
        { command: 'ls default-cwd.txt' },
        mockContext
      );

      expect(result.output).toContain('default-cwd.txt');
      expect(result.output).toContain('exit code: 0');
    });

    it('respects custom timeout parameter', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'sleep 0.1', timeout: 200 },
        mockContext
      );

      // Should complete within timeout
      expect(result.output).toContain('exit code: 0');
    });

    it('handles timeout expiration', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'sleep 10', timeout: 100 },
        mockContext
      );

      expect(result.output.toLowerCase()).toMatch(/timeout|killed|abort/);
    });

    it('handles AbortSignal cancellation', async () => {
      const controller = new AbortController();
      const contextWithSignal: ToolContext = {
        ...mockContext,
        signal: controller.signal,
      };

      // Start long-running command and abort it
      const promise = execCommand(
        { command: 'sleep 10' },
        contextWithSignal
      );

      // Abort immediately
      controller.abort();

      const result: ToolHandlerResult = await promise;

      expect(result.output.toLowerCase()).toMatch(/abort|cancel|killed/);
    });

    it('passes environment variables from context', async () => {
      const contextWithEnv: ToolContext = {
        ...mockContext,
        env: { ...mockContext.env, TEST_VAR: 'test-value-123' },
      };

      const result: ToolHandlerResult = await execCommand(
        { command: 'echo $TEST_VAR' },
        contextWithEnv
      );

      expect(result.output).toContain('test-value-123');
    });

    it('uses default timeout of 30000ms when not specified', async () => {
      // This should complete quickly and not timeout
      const result: ToolHandlerResult = await execCommand(
        { command: 'echo "quick"' },
        mockContext
      );

      expect(result.output).toContain('quick');
      expect(result.output).toContain('exit code: 0');
    });

    it('handles missing command parameter', async () => {
      const result: ToolHandlerResult = await execCommand({}, mockContext);

      expect(result.output).toContain('Error');
      expect(result.output.toLowerCase()).toMatch(/command|required|missing/);
    });

    it('handles null command parameter', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: null as unknown as string },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('handles empty command parameter', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: '' },
        mockContext
      );

      expect(result.output).toContain('Error');
    });

    it('executes commands with special characters', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'echo "Test & special | chars"' },
        mockContext
      );

      expect(result.output).toContain('Test & special | chars');
      expect(result.output).toContain('exit code: 0');
    });

    it('executes piped commands', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'echo "line1\nline2\nline3" | grep line2' },
        mockContext
      );

      expect(result.output).toContain('line2');
      expect(result.output).not.toContain('line1');
      expect(result.output).toContain('exit code: 0');
    });

    it('handles relative cwd paths', async () => {
      const subDir = join(testDir, 'rel-subdir');
      await mkdir(subDir);

      const result: ToolHandlerResult = await execCommand(
        { command: 'pwd', cwd: 'rel-subdir' },
        mockContext
      );

      expect(result.output).toContain(subDir);
    });

    it('handles invalid cwd gracefully', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'pwd', cwd: '/nonexistent/directory/path' },
        mockContext
      );

      expect(result.output.toLowerCase()).toMatch(/error|enoent|no such/);
    });

    it('captures both stdout and stderr in output', async () => {
      const result: ToolHandlerResult = await execCommand(
        {
          command: 'echo "stdout message" && echo "stderr message" >&2',
        },
        mockContext
      );

      expect(result.output).toContain('stdout message');
      expect(result.output).toContain('stderr message');
    });

    it('handles commands that produce large output', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'seq 1 1000' },
        mockContext
      );

      expect(result.output).toContain('1');
      expect(result.output).toContain('1000');
      expect(result.output).toContain('exit code: 0');
    });

    it('handles commands with unicode output', async () => {
      const result: ToolHandlerResult = await execCommand(
        { command: 'echo "Hello 世界 🌍"' },
        mockContext
      );

      expect(result.output).toContain('Hello 世界 🌍');
      expect(result.output).toContain('exit code: 0');
    });
  });
});

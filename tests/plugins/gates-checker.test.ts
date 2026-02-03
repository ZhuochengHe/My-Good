/**
 * Tests for plugin gates checker.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkGates } from '../../src/plugins/gates-checker.js';
import type { PluginGates } from '../../src/types/plugins.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('checkGates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('no gates', () => {
    it('returns success when no gates defined', () => {
      const result = checkGates(undefined);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns success when gates object is empty', () => {
      const gates: PluginGates = {};
      const result = checkGates(gates);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('platform gates', () => {
    it('passes when current platform is in allowed list', () => {
      const gates: PluginGates = {
        platforms: [process.platform as 'linux' | 'darwin' | 'win32'],
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('fails when current platform is not in allowed list', () => {
      const gates: PluginGates = {
        platforms: ['darwin'], // Assuming test runs on linux
      };
      const result = checkGates(gates);

      if (process.platform !== 'darwin') {
        expect(result.passed).toBe(false);
        expect(result.errors).toContain(
          `Platform ${process.platform} not supported (requires: darwin)`
        );
      }
    });

    it('passes when platform list includes current platform', () => {
      const gates: PluginGates = {
        platforms: ['linux', 'darwin', 'win32'],
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(true);
    });
  });

  describe('required binaries', () => {
    it('passes when all required binaries are available', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/bin/git'));

      const gates: PluginGates = {
        requiredBinaries: ['git'],
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git'),
        expect.any(Object)
      );
    });

    it('fails when required binary is missing', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const gates: PluginGates = {
        requiredBinaries: ['nonexistent'],
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('Missing required binary: nonexistent');
    });

    it('checks multiple binaries', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync)
        .mockReturnValueOnce(Buffer.from('/usr/bin/git'))
        .mockReturnValueOnce(Buffer.from('/usr/bin/node'));

      const gates: PluginGates = {
        requiredBinaries: ['git', 'node'],
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(true);
      expect(execSync).toHaveBeenCalledTimes(2);
    });

    it('reports all missing binaries', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const gates: PluginGates = {
        requiredBinaries: ['missing1', 'missing2'],
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('Missing required binary: missing1');
      expect(result.errors).toContain('Missing required binary: missing2');
    });
  });

  describe('required environment variables', () => {
    it('passes when all required env vars are set', () => {
      process.env.TEST_VAR = 'test-value';

      const gates: PluginGates = {
        requiredEnv: {
          TEST_VAR: 'API key for testing',
        },
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);

      delete process.env.TEST_VAR;
    });

    it('fails when required env var is missing', () => {
      delete process.env.MISSING_VAR;

      const gates: PluginGates = {
        requiredEnv: {
          MISSING_VAR: 'Required API key',
        },
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        'Missing required environment variable: MISSING_VAR (Required API key)'
      );
    });

    it('fails when required env var is empty string', () => {
      process.env.EMPTY_VAR = '';

      const gates: PluginGates = {
        requiredEnv: {
          EMPTY_VAR: 'Cannot be empty',
        },
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        'Missing required environment variable: EMPTY_VAR (Cannot be empty)'
      );

      delete process.env.EMPTY_VAR;
    });

    it('checks multiple env vars', () => {
      process.env.VAR1 = 'value1';
      process.env.VAR2 = 'value2';

      const gates: PluginGates = {
        requiredEnv: {
          VAR1: 'First var',
          VAR2: 'Second var',
        },
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(true);

      delete process.env.VAR1;
      delete process.env.VAR2;
    });

    it('reports all missing env vars', () => {
      delete process.env.MISSING1;
      delete process.env.MISSING2;

      const gates: PluginGates = {
        requiredEnv: {
          MISSING1: 'First missing',
          MISSING2: 'Second missing',
        },
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        'Missing required environment variable: MISSING1 (First missing)'
      );
      expect(result.errors).toContain(
        'Missing required environment variable: MISSING2 (Second missing)'
      );
    });
  });

  describe('combined gates', () => {
    it('passes when all gate types pass', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/bin/git'));
      process.env.API_KEY = 'test-key';

      const gates: PluginGates = {
        platforms: [process.platform as 'linux' | 'darwin' | 'win32'],
        requiredBinaries: ['git'],
        requiredEnv: {
          API_KEY: 'API key',
        },
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);

      delete process.env.API_KEY;
    });

    it('fails when any gate type fails', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });
      delete process.env.MISSING_VAR;

      const gates: PluginGates = {
        platforms: ['darwin'], // Will fail on non-darwin
        requiredBinaries: ['missing-bin'],
        requiredEnv: {
          MISSING_VAR: 'Missing var',
        },
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('collects all errors from all gate types', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });
      delete process.env.MISSING_VAR;

      const currentPlatform = process.platform;
      const otherPlatform = currentPlatform === 'linux' ? 'darwin' : 'linux';

      const gates: PluginGates = {
        platforms: [otherPlatform as 'linux' | 'darwin'],
        requiredBinaries: ['missing-bin'],
        requiredEnv: {
          MISSING_VAR: 'Missing var',
        },
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('handles empty arrays gracefully', () => {
      const gates: PluginGates = {
        platforms: [],
        requiredBinaries: [],
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(true);
    });

    it('handles empty env object gracefully', () => {
      const gates: PluginGates = {
        requiredEnv: {},
      };
      const result = checkGates(gates);

      expect(result.passed).toBe(true);
    });
  });
});

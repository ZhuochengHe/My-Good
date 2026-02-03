/**
 * Plugin gates checker for validating plugin loading requirements.
 */

import { execSync } from 'child_process';
import type { PluginGates } from '../types/plugins.js';

/**
 * Result of gates check.
 */
export interface GatesCheckResult {
  readonly passed: boolean;
  readonly errors: readonly string[];
}

/**
 * Check if a binary exists in PATH.
 *
 * @param binary - Binary name to check
 * @returns True if binary exists
 */
function isBinaryAvailable(binary: string): boolean {
  try {
    const command =
      process.platform === 'win32' ? `where ${binary}` : `which ${binary}`;
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an environment variable is set and non-empty.
 *
 * @param envVar - Environment variable name
 * @returns True if env var is set and non-empty
 */
function isEnvVarSet(envVar: string): boolean {
  const value = process.env[envVar];
  return value !== undefined && value !== '';
}

/**
 * Check if current platform is in allowed platforms list.
 *
 * @param platforms - List of allowed platforms
 * @returns True if current platform is allowed
 */
function isPlatformAllowed(
  platforms: readonly ('linux' | 'darwin' | 'win32')[]
): boolean {
  return platforms.includes(process.platform as 'linux' | 'darwin' | 'win32');
}

/**
 * Check plugin gates to determine if plugin can be loaded.
 *
 * @param gates - Plugin gates to check
 * @returns Result indicating if all gates passed
 */
export function checkGates(gates: PluginGates | undefined): GatesCheckResult {
  if (!gates) {
    return { passed: true, errors: [] };
  }

  const errors: string[] = [];

  // Check platform requirements
  if (gates.platforms && gates.platforms.length > 0) {
    if (!isPlatformAllowed(gates.platforms)) {
      errors.push(
        `Platform ${process.platform} not supported (requires: ${gates.platforms.join(', ')})`
      );
    }
  }

  // Check required binaries
  if (gates.requiredBinaries && gates.requiredBinaries.length > 0) {
    for (const binary of gates.requiredBinaries) {
      if (!isBinaryAvailable(binary)) {
        errors.push(`Missing required binary: ${binary}`);
      }
    }
  }

  // Check required environment variables
  if (gates.requiredEnv) {
    for (const [envVar, description] of Object.entries(gates.requiredEnv)) {
      if (!isEnvVarSet(envVar)) {
        errors.push(
          `Missing required environment variable: ${envVar} (${description})`
        );
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

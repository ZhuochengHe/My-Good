/**
 * Authentication error handler with user prompts.
 *
 * Provides utilities to detect authentication errors and create
 * helpful error messages with expected environment variables.
 */

import { AuthenticationError } from '../errors/provider.js';
import { getProvider } from './registry.js';

/**
 * Check if error is an authentication failure (401/403).
 *
 * Works with both OpenAI and Anthropic SDK errors.
 */
export function isAuthError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    // OpenAI SDK error
    if ('status' in error && (error.status === 401 || error.status === 403)) {
      return true;
    }
    // Anthropic SDK error
    if ('statusCode' in error && (error.statusCode === 401 || error.statusCode === 403)) {
      return true;
    }
    // Check error message for auth keywords
    if ('message' in error && typeof error.message === 'string') {
      const msg = error.message.toLowerCase();
      return msg.includes('authentication') ||
             msg.includes('unauthorized') ||
             msg.includes('forbidden') ||
             msg.includes('invalid api key') ||
             msg.includes('api key');
    }
  }
  return false;
}

/**
 * Create authentication error with helpful message including expected env vars.
 *
 * @param providerId Provider ID (e.g., 'kimi', 'openai', 'anthropic')
 * @param originalError Original error from SDK
 * @returns AuthenticationError with enhanced message
 */
export function createAuthError(
  providerId: string,
  originalError?: Error
): AuthenticationError {
  const manifest = getProvider(providerId);

  if (!manifest) {
    return new AuthenticationError(
      `Authentication failed for provider: ${providerId}`,
      originalError
    );
  }

  const envVars = manifest.envVars.join(' or ');
  const message =
    `Authentication failed for ${manifest.name} provider.\n` +
    `Expected environment variable(s): ${envVars}\n` +
    `Please set your API key in ~/.my-agent/config.yaml or as an environment variable.`;

  return new AuthenticationError(message, originalError);
}

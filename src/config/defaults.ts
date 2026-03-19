/**
 * Default configuration values for the agent system.
 */

import type { AppConfig } from '../types/config.js';

/**
 * Returns the default application configuration.
 * This is a minimal config - users must run 'setup' to configure model and API keys.
 *
 * @returns Complete default configuration
 */
export function getDefaultConfig(): AppConfig {
  return {
    agent: {
      id: 'default',
      name: 'My Agent',
      // Placeholder values - user must run setup
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      typewriterEffect: true,
      typewriterSpeedMs: 30,
    },
    providers: {
      // Placeholder API key - user must configure
      anthropic: {
        apiKey: 'YOUR_ANTHROPIC_API_KEY_HERE',
      },
    },
    plugins: {
      directories: ['./plugins'],
      enabled: [],
      disabled: [],
    },
    session: {
      storePath: './.sessions',
      maxMessages: 100,
      idleTimeoutMinutes: 30,
    },
    logging: {
      level: 'info',
      format: 'pretty',
    },
  };
}

/**
 * Default configuration values for the agent system.
 */

import type { AppConfig } from '../types/config.js';

/**
 * Returns the default application configuration.
 * All values are sensible defaults that can be overridden via config file.
 *
 * @returns Complete default configuration
 */
export function getDefaultConfig(): AppConfig {
  return {
    agent: {
      id: 'default',
      name: 'My Agent',
      systemPrompt: 'You are a helpful AI assistant.',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      maxTurns: 25,
      maxTokensPerTurn: 8192,
      tools: {
        allow: [],
        deny: [],
        requireApproval: [],
      },
    },
    providers: {
      anthropic: {
        type: 'anthropic',
        apiKey: '',
        defaultModel: 'claude-sonnet-4-20250514',
        timeout: 60000,
        maxRetries: 3,
      },
      openai: {
        type: 'openai',
        apiKey: '',
        defaultModel: 'gpt-4o',
        timeout: 60000,
        maxRetries: 3,
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

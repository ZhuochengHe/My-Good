/**
 * Settings command for CLI.
 * Manages agent behavior settings stored in settings.yaml.
 */

import { access } from 'node:fs/promises';
import type { OutputAdapter } from '../output-adapter.js';
import {
  loadSettings,
  saveSettings,
  resetSettings,
  DEFAULT_SETTINGS_PATH,
} from '../../config/settings-loader.js';
import {
  DEFAULT_SETTINGS,
  getSettingValue,
  setSettingValue,
  validateSettingValue,
  type SettingsKey,
  type AgentSettings,
} from '../../types/settings.js';

/**
 * Settings command options.
 */
export interface SettingsCommandOptions {
  /** Output adapter */
  readonly output: OutputAdapter;
  /** Settings file path */
  readonly settingsPath?: string;
}

/**
 * Show all current settings.
 */
export async function settingsShow(options: SettingsCommandOptions): Promise<void> {
  const { output, settingsPath = DEFAULT_SETTINGS_PATH } = options;

  try {
    // Check if settings file exists
    try {
      await access(settingsPath);
    } catch {
      output.write('No custom settings found. Using defaults:\n');
      output.write(formatSettings(DEFAULT_SETTINGS));
      return;
    }

    const settings = await loadSettings(settingsPath);
    output.write(`Settings (${settingsPath}):\n`);
    output.write(formatSettings(settings));
  } catch (error) {
    output.writeError(
      `Failed to load settings: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get a specific setting value.
 */
export async function settingsGet(
  options: SettingsCommandOptions & { key: string }
): Promise<void> {
  const { output, settingsPath = DEFAULT_SETTINGS_PATH, key } = options;

  // Validate key
  if (!isValidSettingsKey(key)) {
    output.writeError(`Unknown setting: ${key}`);
    output.write('\nValid settings:');
    output.write(getValidSettingsList());
    return;
  }

  try {
    const settings = await loadSettings(settingsPath);
    const value = getSettingValue(settings, key);

    if (value === undefined) {
      output.writeError(`Setting ${key} not found`);
      return;
    }

    // Format array values nicely
    if (Array.isArray(value)) {
      output.write(`${key}:`);
      if (value.length === 0) {
        output.write('  (empty)');
      } else {
        for (const item of value) {
          output.write(`  - ${item}`);
        }
      }
    } else {
      output.write(`${key}: ${JSON.stringify(value)}`);
    }
  } catch (error) {
    output.writeError(
      `Failed to get setting: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Set a specific setting value.
 */
export async function settingsSet(
  options: SettingsCommandOptions & { key: string; value: string }
): Promise<void> {
  const { output, settingsPath = DEFAULT_SETTINGS_PATH, key, value } = options;

  // Validate key
  if (!isValidSettingsKey(key)) {
    output.writeError(`Unknown setting: ${key}`);
    output.write('\nValid settings:');
    output.write(getValidSettingsList());
    return;
  }

  // Parse value based on key type
  const parsedValue = parseSettingValue(key, value);
  if (parsedValue === undefined) {
    output.writeError(`Invalid value for ${key}: ${value}`);
    return;
  }

  // Validate value
  const validation = validateSettingValue(key, parsedValue);
  if (!validation.valid) {
    output.writeError(`Invalid value for ${key}:`);
    for (const error of validation.errors) {
      output.writeError(`  - ${error}`);
    }
    return;
  }

  try {
    const settings = await loadSettings(settingsPath);
    const newSettings = setSettingValue(settings, key, parsedValue);
    await saveSettings(newSettings, settingsPath);

    output.writeSuccess(`${key} set to ${formatValue(parsedValue)}`);
  } catch (error) {
    output.writeError(
      `Failed to save setting: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Reset settings to defaults.
 */
export async function settingsReset(options: SettingsCommandOptions): Promise<void> {
  const { output, settingsPath = DEFAULT_SETTINGS_PATH } = options;

  try {
    await resetSettings(settingsPath);
    output.writeSuccess('Settings reset to defaults');
    output.write('\nCurrent settings:');
    output.write(formatSettings(DEFAULT_SETTINGS));
  } catch (error) {
    output.writeError(
      `Failed to reset settings: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if a string is a valid settings key.
 */
function isValidSettingsKey(key: string): key is SettingsKey {
  const validKeys: readonly string[] = [
    'model.temperature',
    'model.topP',
    'model.maxTokens',
    'behavior.responseStyle',
    'behavior.enableToolUse',
    'behavior.enableStreaming',
    'behavior.maxTurns',
    'behavior.systemPrompt',
    'tools.allow',
    'tools.deny',
    'tools.requireApproval',
  ];
  return validKeys.includes(key);
}

/**
 * Get list of valid settings with descriptions.
 */
function getValidSettingsList(): string {
  return `
  model.temperature          - Response temperature (0-2)
  model.topP                 - Top P sampling (0-1)
  model.maxTokens            - Maximum tokens per response
  behavior.responseStyle     - Response style (concise/detailed/balanced)
  behavior.enableToolUse     - Enable tool use (true/false)
  behavior.enableStreaming   - Enable streaming (true/false)
  behavior.maxTurns          - Maximum conversation turns
  behavior.systemPrompt      - System prompt text
  tools.allow                - Allowed tool IDs (comma-separated)
  tools.deny                 - Denied tool IDs (comma-separated)
  tools.requireApproval      - Tools requiring approval (comma-separated)
`;
}

/**
 * Parse a setting value from string based on key type.
 */
function parseSettingValue(key: SettingsKey, value: string): unknown {
  switch (key) {
    case 'model.temperature':
    case 'model.topP':
      return parseFloat(value);

    case 'model.maxTokens':
    case 'behavior.maxTurns':
      return parseInt(value, 10);

    case 'behavior.enableToolUse':
    case 'behavior.enableStreaming':
      return value.toLowerCase() === 'true' || value === '1';

    case 'tools.allow':
    case 'tools.deny':
    case 'tools.requireApproval':
      return value.split(',').map((s) => s.trim()).filter(Boolean);

    default:
      return value;
  }
}

/**
 * Format a value for display.
 */
function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '(empty)';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

/**
 * Format all settings for display.
 */
function formatSettings(settings: AgentSettings): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('Model Settings:');
  lines.push(`  temperature: ${settings.model.temperature}`);
  lines.push(`  topP: ${settings.model.topP}`);
  lines.push(`  maxTokens: ${settings.model.maxTokens}`);

  lines.push('');
  lines.push('Behavior Settings:');
  lines.push(`  responseStyle: ${settings.behavior.responseStyle}`);
  lines.push(`  enableToolUse: ${settings.behavior.enableToolUse}`);
  lines.push(`  enableStreaming: ${settings.behavior.enableStreaming}`);
  lines.push(`  maxTurns: ${settings.behavior.maxTurns}`);
  lines.push(`  systemPrompt: "${settings.behavior.systemPrompt.substring(0, 50)}${settings.behavior.systemPrompt.length > 50 ? '...' : ''}"`);

  lines.push('');
  lines.push('Tool Settings:');
  lines.push(`  allow: ${settings.tools.allow.length > 0 ? settings.tools.allow.join(', ') : '(empty)'}`);
  lines.push(`  deny: ${settings.tools.deny.length > 0 ? settings.tools.deny.join(', ') : '(empty)'}`);
  lines.push(`  requireApproval: ${settings.tools.requireApproval.length > 0 ? settings.tools.requireApproval.join(', ') : '(empty)'}`);

  return lines.join('\n');
}

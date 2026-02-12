/**
 * Settings loader for agent behavior configuration.
 * Handles reading/writing settings.yaml separately from credentials.
 */

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parse, stringify } from 'yaml';
import {
  type AgentSettings,
  DEFAULT_SETTINGS,
} from '../types/settings.js';

/** Default settings file path */
export const DEFAULT_SETTINGS_PATH = join(
  homedir(),
  '.my-agent',
  'settings.yaml'
);

/**
 * Check if settings file exists.
 */
export async function settingsExists(
  settingsPath: string = DEFAULT_SETTINGS_PATH
): Promise<boolean> {
  try {
    await access(settingsPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load settings from YAML file.
 * Returns default settings if file doesn't exist.
 */
export async function loadSettings(
  settingsPath: string = DEFAULT_SETTINGS_PATH
): Promise<AgentSettings> {
  try {
    const content = await readFile(settingsPath, 'utf-8');
    const parsed = parse(content) as Partial<AgentSettings>;

    // Merge with defaults for any missing fields
    return mergeWithDefaults(parsed);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      // File doesn't exist, return defaults
      return DEFAULT_SETTINGS;
    }
    throw new Error(
      `Failed to load settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Save settings to YAML file.
 */
export async function saveSettings(
  settings: AgentSettings,
  settingsPath: string = DEFAULT_SETTINGS_PATH
): Promise<void> {
  try {
    // Ensure parent directory exists
    const parentDir = dirname(settingsPath);
    await mkdir(parentDir, { recursive: true });

    // Write settings file
    const yaml = stringify(settings, {
      indent: 2,
      sortMapEntries: true,
    });
    await writeFile(settingsPath, yaml, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to save settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Merge partial settings with defaults.
 */
function mergeWithDefaults(partial: Partial<AgentSettings>): AgentSettings {
  return {
    model: {
      ...DEFAULT_SETTINGS.model,
      ...partial.model,
    },
    behavior: {
      ...DEFAULT_SETTINGS.behavior,
      ...partial.behavior,
    },
    tools: {
      ...DEFAULT_SETTINGS.tools,
      ...partial.tools,
    },
  };
}

/**
 * Reset settings to defaults.
 */
export async function resetSettings(
  settingsPath: string = DEFAULT_SETTINGS_PATH
): Promise<AgentSettings> {
  await saveSettings(DEFAULT_SETTINGS, settingsPath);
  return DEFAULT_SETTINGS;
}

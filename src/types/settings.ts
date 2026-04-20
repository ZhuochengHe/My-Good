/**
 * Settings type definitions for agent behavior configuration.
 * Settings are stored separately from credentials in settings.yaml.
 */

/** Model behavior settings */
export interface ModelSettings {
  /** Response temperature (0-2, default: 0.7) */
  readonly temperature: number;
  /** Top P sampling (0-1, default: 1) */
  readonly topP: number;
  /** Maximum tokens per response (default: 4096) */
  readonly maxTokens: number;
}

/** Agent behavior settings */
export interface BehaviorSettings {
  /** Response style preference (default: 'balanced') */
  readonly responseStyle: 'concise' | 'detailed' | 'balanced';
  /** Enable tool use (default: true) */
  readonly enableToolUse: boolean;
  /** Enable streaming responses (default: true) */
  readonly enableStreaming: boolean;
  /** Maximum conversation turns (default: 25) */
  readonly maxTurns: number;
  /**
   * System prompt sent to the LLM at the start of every conversation.
   * The default includes guidance for the three-layer persistent memory system
   * (Identity, Preferences & Skills, Episodic) so the assistant proactively
   * saves and retrieves context across sessions.
   */
  readonly systemPrompt: string;
}

/** Memory eviction settings */
export interface MemorySettings {
  /** Max L3 memory count before eviction sweep runs (default: 100) */
  readonly evictionThreshold: number;
}

/** Tool behavior settings */
export interface ToolSettings {
  /** Allowed tool IDs (empty = all allowed) */
  readonly allow: readonly string[];
  /** Denied tool IDs */
  readonly deny: readonly string[];
  /** Tool IDs requiring user approval */
  readonly requireApproval: readonly string[];
}

/** Complete settings structure for settings.yaml */
export interface AgentSettings {
  /** Model behavior settings */
  readonly model: ModelSettings;
  /** Agent behavior settings */
  readonly behavior: BehaviorSettings;
  /** Tool configuration */
  readonly tools: ToolSettings;
  /** Memory eviction settings */
  readonly memory: MemorySettings;
}

/** Default settings values */
export const DEFAULT_SETTINGS: AgentSettings = {
  model: {
    temperature: 0.7,
    topP: 1,
    maxTokens: 4096,
  },
  behavior: {
    responseStyle: 'balanced',
    enableToolUse: true,
    enableStreaming: true,
    maxTurns: 100,
    systemPrompt: `You are a helpful AI assistant.

You have access to a persistent memory system. Memories are written automatically at the end of each session — you do not need to save them yourself.

Your job is to read from memory proactively:
- At the start of a new topic or task, use search_memory to check what you already know
- Use tags or keywords that match the current context (e.g., "typescript", "architecture", "preference")
- Preference memories and recent episodic memories are already injected above — no need to search for those

Memory kinds (for reference when reading search results):
- preference: How to treat the user — preferences, response style, behavioral rules
- experiential: How to do tasks effectively — workflows, patterns, project techniques
- semantic: Objective project facts — architecture, tech stack, domain knowledge
- episodic: Time-bound context — active tasks, recent decisions, current bugs`,
  },
  tools: {
    allow: [],
    deny: [],
    requireApproval: [],
  },
  memory: {
    evictionThreshold: 100,
  },
};

/** Flat settings key for CLI get/set commands */
export type SettingsKey =
  | 'model.temperature'
  | 'model.topP'
  | 'model.maxTokens'
  | 'behavior.responseStyle'
  | 'behavior.enableToolUse'
  | 'behavior.enableStreaming'
  | 'behavior.maxTurns'
  | 'behavior.systemPrompt'
  | 'tools.allow'
  | 'tools.deny'
  | 'tools.requireApproval'
  | 'memory.evictionThreshold';

/** Settings validation result */
export interface SettingsValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Get a nested value from settings using dot notation.
 */
export function getSettingValue(
  settings: AgentSettings,
  key: SettingsKey
): unknown {
  const parts = key.split('.');
  let current: unknown = settings;

  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set a nested value in settings using dot notation.
 * Returns new settings object (immutable update).
 */
export function setSettingValue(
  settings: AgentSettings,
  key: SettingsKey,
  value: unknown
): AgentSettings {
  const parts = key.split('.');

  function update(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
    if (depth === parts.length) {
      return obj;
    }

    const part = parts[depth]!;
    const current = obj[part];
    const currentObj =
      current !== null && typeof current === 'object'
        ? (current as Record<string, unknown>)
        : {};

    const result: Record<string, unknown> = { ...obj };
    if (depth === parts.length - 1) {
      result[part] = value;
    } else {
      result[part] = update(currentObj, depth + 1);
    }

    return result;
  }

  return update(settings as unknown as Record<string, unknown>, 0) as unknown as AgentSettings;
}

/**
 * Validate a settings key and value.
 */
export function validateSettingValue(
  key: SettingsKey,
  value: unknown
): SettingsValidationResult {
  const errors: string[] = [];

  switch (key) {
    case 'model.temperature':
      if (
        typeof value !== 'number' ||
        value < 0 ||
        value > 2
      ) {
        errors.push('temperature must be a number between 0 and 2');
      }
      break;

    case 'model.topP':
      if (
        typeof value !== 'number' ||
        value < 0 ||
        value > 1
      ) {
        errors.push('topP must be a number between 0 and 1');
      }
      break;

    case 'model.maxTokens':
      if (
        typeof value !== 'number' ||
        value < 1 ||
        !Number.isInteger(value)
      ) {
        errors.push('maxTokens must be a positive integer');
      }
      break;

    case 'behavior.responseStyle':
      if (
        typeof value !== 'string' ||
        !['concise', 'detailed', 'balanced'].includes(value)
      ) {
        errors.push('responseStyle must be one of: concise, detailed, balanced');
      }
      break;

    case 'behavior.enableToolUse':
    case 'behavior.enableStreaming':
      if (typeof value !== 'boolean') {
        errors.push(`${key.split('.')[1]} must be a boolean (true/false)`);
      }
      break;

    case 'behavior.maxTurns':
      if (
        typeof value !== 'number' ||
        value < 1 ||
        !Number.isInteger(value)
      ) {
        errors.push('maxTurns must be a positive integer');
      }
      break;

    case 'behavior.systemPrompt':
      if (typeof value !== 'string' || value.length === 0) {
        errors.push('systemPrompt must be a non-empty string');
      }
      break;

    case 'tools.allow':
    case 'tools.deny':
    case 'tools.requireApproval':
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        errors.push(`${key.split('.')[1]} must be an array of strings`);
      }
      break;

    case 'memory.evictionThreshold':
      if (
        typeof value !== 'number' ||
        value < 1 ||
        !Number.isInteger(value)
      ) {
        errors.push('evictionThreshold must be a positive integer');
      }
      break;

    default:
      // TypeScript exhaustiveness check - this should never happen
      errors.push('Unknown setting key');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Tests for settings type definitions and DEFAULT_SETTINGS.
 * Following TDD - tests written FIRST.
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_SETTINGS,
  getSettingValue,
  setSettingValue,
  validateSettingValue,
} from '../../src/types/settings.js';

describe('DEFAULT_SETTINGS', () => {
  describe('behavior.systemPrompt', () => {
    it('starts with the standard helpful assistant preamble', () => {
      expect(DEFAULT_SETTINGS.behavior.systemPrompt).toContain(
        'You are a helpful AI assistant.'
      );
    });

    it('includes memory system introduction', () => {
      expect(DEFAULT_SETTINGS.behavior.systemPrompt).toContain(
        'persistent memory system'
      );
    });

    it('includes preference kind guidance', () => {
      expect(DEFAULT_SETTINGS.behavior.systemPrompt).toContain('preference');
    });

    it('includes experiential kind guidance', () => {
      expect(DEFAULT_SETTINGS.behavior.systemPrompt).toContain('experiential');
    });

    it('includes semantic kind guidance', () => {
      expect(DEFAULT_SETTINGS.behavior.systemPrompt).toContain('semantic');
    });

    it('includes episodic kind guidance', () => {
      expect(DEFAULT_SETTINGS.behavior.systemPrompt).toContain('episodic');
    });

    it('instructs agent to read memory proactively, not write', () => {
      expect(DEFAULT_SETTINGS.behavior.systemPrompt).toContain(
        'Memories are written automatically'
      );
    });

    it('includes search_memory tool guidance', () => {
      expect(DEFAULT_SETTINGS.behavior.systemPrompt).toContain(
        'search_memory'
      );
    });

    it('is a non-empty string', () => {
      expect(typeof DEFAULT_SETTINGS.behavior.systemPrompt).toBe('string');
      expect(DEFAULT_SETTINGS.behavior.systemPrompt.length).toBeGreaterThan(0);
    });
  });

  describe('model defaults', () => {
    it('has default temperature of 0.7', () => {
      expect(DEFAULT_SETTINGS.model.temperature).toBe(0.7);
    });

    it('has default topP of 1', () => {
      expect(DEFAULT_SETTINGS.model.topP).toBe(1);
    });

    it('has default maxTokens of 4096', () => {
      expect(DEFAULT_SETTINGS.model.maxTokens).toBe(4096);
    });
  });

  describe('behavior defaults', () => {
    it('has default responseStyle of balanced', () => {
      expect(DEFAULT_SETTINGS.behavior.responseStyle).toBe('balanced');
    });

    it('has enableToolUse enabled by default', () => {
      expect(DEFAULT_SETTINGS.behavior.enableToolUse).toBe(true);
    });

    it('has enableStreaming enabled by default', () => {
      expect(DEFAULT_SETTINGS.behavior.enableStreaming).toBe(true);
    });

    it('has default maxTurns of 25', () => {
      expect(DEFAULT_SETTINGS.behavior.maxTurns).toBe(25);
    });
  });

  describe('tools defaults', () => {
    it('has empty allow list by default', () => {
      expect(DEFAULT_SETTINGS.tools.allow).toEqual([]);
    });

    it('has empty deny list by default', () => {
      expect(DEFAULT_SETTINGS.tools.deny).toEqual([]);
    });

    it('has empty requireApproval list by default', () => {
      expect(DEFAULT_SETTINGS.tools.requireApproval).toEqual([]);
    });
  });
});

describe('getSettingValue', () => {
  it('retrieves a top-level nested value', () => {
    expect(getSettingValue(DEFAULT_SETTINGS, 'model.temperature')).toBe(0.7);
  });

  it('retrieves behavior.systemPrompt', () => {
    const value = getSettingValue(DEFAULT_SETTINGS, 'behavior.systemPrompt');
    expect(typeof value).toBe('string');
    expect((value as string).length).toBeGreaterThan(0);
  });

  it('retrieves tools.allow', () => {
    expect(getSettingValue(DEFAULT_SETTINGS, 'tools.allow')).toEqual([]);
  });
});

describe('setSettingValue', () => {
  it('returns a new settings object with updated value', () => {
    const updated = setSettingValue(DEFAULT_SETTINGS, 'model.temperature', 1.0);
    expect(updated.model.temperature).toBe(1.0);
    expect(DEFAULT_SETTINGS.model.temperature).toBe(0.7);
  });

  it('updates behavior.systemPrompt immutably', () => {
    const newPrompt = 'Custom system prompt.';
    const updated = setSettingValue(
      DEFAULT_SETTINGS,
      'behavior.systemPrompt',
      newPrompt
    );
    expect(updated.behavior.systemPrompt).toBe(newPrompt);
    expect(DEFAULT_SETTINGS.behavior.systemPrompt).not.toBe(newPrompt);
  });
});

describe('validateSettingValue', () => {
  it('validates a valid temperature', () => {
    const result = validateSettingValue('model.temperature', 0.5);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects temperature out of range', () => {
    const result = validateSettingValue('model.temperature', 3);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('validates a non-empty systemPrompt string', () => {
    const result = validateSettingValue('behavior.systemPrompt', 'Hello');
    expect(result.valid).toBe(true);
  });

  it('rejects an empty systemPrompt string', () => {
    const result = validateSettingValue('behavior.systemPrompt', '');
    expect(result.valid).toBe(false);
  });

  it('rejects a non-string systemPrompt', () => {
    const result = validateSettingValue('behavior.systemPrompt', 42);
    expect(result.valid).toBe(false);
  });
});

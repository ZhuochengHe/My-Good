/**
 * Tests for agent error types.
 */

import { describe, it, expect } from 'vitest';
import {
  AgentError,
  MaxTurnsError,
  CancelledError,
  ToolExecutionError,
  ContextOverflowError,
  isAgentError,
  isRecoverableAgentError,
} from '../../src/errors/agent.js';

describe('AgentError', () => {
  it('creates AgentError with code and message', () => {
    const error = new AgentError('test error', 'TIMEOUT', true);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AgentError);
    expect(error.name).toBe('AgentError');
    expect(error.message).toBe('test error');
    expect(error.code).toBe('TIMEOUT');
    expect(error.recoverable).toBe(true);
    expect(error.cause).toBeUndefined();
  });

  it('creates AgentError with cause', () => {
    const originalError = new Error('original error');
    const error = new AgentError('wrapped error', 'PROVIDER_ERROR', false, originalError);

    expect(error.message).toBe('wrapped error');
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(error.recoverable).toBe(false);
    expect(error.cause).toBe(originalError);
  });

  it('captures stack trace correctly', () => {
    const error = new AgentError('test error', 'TIMEOUT', true);

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('AgentError');
  });
});

describe('MaxTurnsError', () => {
  it('has correct code and is not recoverable', () => {
    const error = new MaxTurnsError(20);

    expect(error).toBeInstanceOf(AgentError);
    expect(error.name).toBe('MaxTurnsError');
    expect(error.code).toBe('MAX_TURNS');
    expect(error.recoverable).toBe(false);
    expect(error.maxTurns).toBe(20);
    expect(error.message).toContain('20');
  });

  it('includes maxTurns in message', () => {
    const error = new MaxTurnsError(15);

    expect(error.message).toBe('Maximum turns (15) exceeded');
  });
});

describe('CancelledError', () => {
  it('has correct code and is recoverable', () => {
    const error = new CancelledError();

    expect(error).toBeInstanceOf(AgentError);
    expect(error.name).toBe('CancelledError');
    expect(error.code).toBe('CANCELLED');
    expect(error.recoverable).toBe(true);
    expect(error.message).toBe('Agent execution cancelled by user');
  });

  it('accepts custom message', () => {
    const error = new CancelledError('Custom cancellation message');

    expect(error.message).toBe('Custom cancellation message');
  });
});

describe('ToolExecutionError', () => {
  it('includes tool name and original error', () => {
    const originalError = new Error('file not found');
    const error = new ToolExecutionError('read_file', originalError);

    expect(error).toBeInstanceOf(AgentError);
    expect(error.name).toBe('ToolExecutionError');
    expect(error.code).toBe('TOOL_ERROR');
    expect(error.recoverable).toBe(true);
    expect(error.toolName).toBe('read_file');
    expect(error.cause).toBe(originalError);
    expect(error.message).toContain('read_file');
    expect(error.message).toContain('file not found');
  });

  it('handles error without message', () => {
    const originalError = new Error('');
    const error = new ToolExecutionError('exec_command', originalError);

    expect(error.message).toContain('exec_command');
    expect(error.cause).toBe(originalError);
  });
});

describe('ContextOverflowError', () => {
  it('includes token counts', () => {
    const error = new ContextOverflowError(150000, 128000);

    expect(error).toBeInstanceOf(AgentError);
    expect(error.name).toBe('ContextOverflowError');
    expect(error.code).toBe('CONTEXT_OVERFLOW');
    expect(error.recoverable).toBe(false);
    expect(error.usedTokens).toBe(150000);
    expect(error.maxTokens).toBe(128000);
    expect(error.message).toContain('150000');
    expect(error.message).toContain('128000');
  });

  it('formats message correctly', () => {
    const error = new ContextOverflowError(100000, 50000);

    expect(error.message).toBe('Context overflow: used 100000 tokens, max 50000 tokens');
  });
});

describe('Type Guards', () => {
  describe('isAgentError', () => {
    it('returns true for AgentError instances', () => {
      const error = new AgentError('test', 'TIMEOUT', true);

      expect(isAgentError(error)).toBe(true);
    });

    it('returns true for AgentError subclasses', () => {
      expect(isAgentError(new MaxTurnsError(10))).toBe(true);
      expect(isAgentError(new CancelledError())).toBe(true);
      expect(isAgentError(new ToolExecutionError('test', new Error()))).toBe(true);
      expect(isAgentError(new ContextOverflowError(1000, 500))).toBe(true);
    });

    it('returns false for regular errors', () => {
      expect(isAgentError(new Error('test'))).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(isAgentError(null)).toBe(false);
      expect(isAgentError(undefined)).toBe(false);
      expect(isAgentError('error')).toBe(false);
      expect(isAgentError({ code: 'TIMEOUT' })).toBe(false);
    });
  });

  describe('isRecoverableAgentError', () => {
    it('returns true for recoverable agent errors', () => {
      const error = new AgentError('test', 'TIMEOUT', true);

      expect(isRecoverableAgentError(error)).toBe(true);
    });

    it('returns false for non-recoverable agent errors', () => {
      const error = new AgentError('test', 'PROVIDER_ERROR', false);

      expect(isRecoverableAgentError(error)).toBe(false);
    });

    it('returns true for CancelledError', () => {
      expect(isRecoverableAgentError(new CancelledError())).toBe(true);
    });

    it('returns false for MaxTurnsError', () => {
      expect(isRecoverableAgentError(new MaxTurnsError(10))).toBe(false);
    });

    it('returns true for ToolExecutionError', () => {
      expect(isRecoverableAgentError(new ToolExecutionError('test', new Error()))).toBe(true);
    });

    it('returns false for ContextOverflowError', () => {
      expect(isRecoverableAgentError(new ContextOverflowError(1000, 500))).toBe(false);
    });

    it('returns false for non-agent errors', () => {
      expect(isRecoverableAgentError(new Error('test'))).toBe(false);
      expect(isRecoverableAgentError(null)).toBe(false);
    });
  });
});

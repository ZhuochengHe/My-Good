/**
 * Tests for session error user messages.
 */

import { describe, it, expect } from 'vitest';
import {
  SessionError,
  SessionNotFoundError,
  SessionLoadError,
  SessionSaveError,
  SessionCorruptedError,
  InvalidSessionIdError,
  SessionDeleteError,
  SessionTooLargeError,
} from '../../src/errors/session.js';

describe('SessionError.toUserMessage', () => {
  it('returns user-friendly message for base SessionError', () => {
    const error = new SessionError('Test error', 'SESSION_NOT_FOUND');
    const msg = error.toUserMessage();

    expect(msg.code).toBe('E300');
    expect(msg.message).toBe('Session operation failed');
    expect(msg.context).toBeDefined();
    expect(msg.technicalDetails).toContain('Test error');
  });
});

describe('SessionNotFoundError.toUserMessage', () => {
  it('returns user-friendly message with session ID', () => {
    const error = new SessionNotFoundError('abc123');
    const msg = error.toUserMessage();

    expect(msg.code).toBe('E301');
    expect(msg.message).toBe('Session not found');
    expect(msg.context).toContain('abc123');
    expect(msg.suggestion).toContain('session list');
    expect(msg.technicalDetails).toContain('SessionNotFoundError');
  });
});

describe('SessionLoadError.toUserMessage', () => {
  it('returns user-friendly message with reason', () => {
    const error = new SessionLoadError('xyz789', 'file not readable');
    const msg = error.toUserMessage();

    expect(msg.code).toBe('E302');
    expect(msg.message).toBe('Failed to load session');
    expect(msg.context).toContain('xyz789');
    expect(msg.context).toContain('file not readable');
    expect(msg.suggestion).toBeDefined();
    expect(msg.technicalDetails).toContain('SessionLoadError');
  });
});

describe('SessionSaveError.toUserMessage', () => {
  it('returns user-friendly message with reason', () => {
    const error = new SessionSaveError('session1', 'disk full');
    const msg = error.toUserMessage();

    expect(msg.code).toBe('E303');
    expect(msg.message).toBe('Failed to save session');
    expect(msg.context).toContain('session1');
    expect(msg.context).toContain('disk full');
    expect(msg.suggestion).toContain('disk space');
    expect(msg.technicalDetails).toContain('SessionSaveError');
  });
});

describe('SessionCorruptedError.toUserMessage', () => {
  it('returns user-friendly message without line number', () => {
    const error = new SessionCorruptedError('corrupt1', 'invalid JSON');
    const msg = error.toUserMessage();

    expect(msg.code).toBe('E304');
    expect(msg.message).toBe('Session file is corrupted');
    expect(msg.context).toContain('corrupt1');
    expect(msg.context).toContain('invalid JSON');
    expect(msg.suggestion).toContain('delete');
    expect(msg.technicalDetails).toContain('SessionCorruptedError');
  });

  it('returns user-friendly message with line number', () => {
    const error = new SessionCorruptedError('corrupt2', 'parse error', 42);
    const msg = error.toUserMessage();

    expect(msg.code).toBe('E304');
    expect(msg.context).toContain('line 42');
  });
});

describe('InvalidSessionIdError.toUserMessage', () => {
  it('returns user-friendly message with validation reason', () => {
    const error = new InvalidSessionIdError('bad@id', 'contains invalid characters');
    const msg = error.toUserMessage();

    expect(msg.code).toBe('E305');
    expect(msg.message).toBe('Invalid session ID');
    expect(msg.context).toContain('bad@id');
    expect(msg.context).toContain('contains invalid characters');
    expect(msg.suggestion).toBeDefined();
    expect(msg.technicalDetails).toContain('InvalidSessionIdError');
  });
});

describe('SessionDeleteError.toUserMessage', () => {
  it('returns user-friendly message with reason', () => {
    const error = new SessionDeleteError('del1', 'permission denied');
    const msg = error.toUserMessage();

    expect(msg.code).toBe('E306');
    expect(msg.message).toBe('Failed to delete session');
    expect(msg.context).toContain('del1');
    expect(msg.context).toContain('permission denied');
    expect(msg.suggestion).toBeDefined();
    expect(msg.technicalDetails).toContain('SessionDeleteError');
  });
});

describe('SessionTooLargeError.toUserMessage', () => {
  it('returns user-friendly message with limits', () => {
    const error = new SessionTooLargeError('large1', 'exceeds 10MB limit');
    const msg = error.toUserMessage();

    expect(msg.code).toBe('E307');
    expect(msg.message).toBe('Session exceeds resource limits');
    expect(msg.context).toContain('large1');
    expect(msg.context).toContain('exceeds 10MB limit');
    expect(msg.suggestion).toContain('new session');
    expect(msg.technicalDetails).toContain('SessionTooLargeError');
  });
});

/**
 * Tests for credential detector.
 *
 * Verifies that sensitive credentials are properly detected and redacted
 * from various sources (config files, logs, session files, etc.).
 */

import { describe, it, expect } from 'vitest';
import { CredentialDetector } from '../../src/security/credential-detector.js';

describe('CredentialDetector', () => {
  describe('detectAndRedact', () => {
    it('detects and redacts Anthropic API keys', () => {
      const input = 'My key is sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz0123456789 here';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toBe('My key is ***REDACTED*** here');
      expect(result).not.toContain('sk-ant-api03');
      expect(result).not.toContain('1234567890abcdef');
    });

    it('detects and redacts OpenAI API keys with sk-proj prefix', () => {
      const input = 'OpenAI key: sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toBe('OpenAI key: ***REDACTED***');
      expect(result).not.toContain('sk-proj');
    });

    it('detects and redacts OpenAI API keys with sk- prefix', () => {
      const input = 'Key is sk-1234567890abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ here';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toBe('Key is ***REDACTED*** here');
      expect(result).not.toContain('sk-1234567890');
    });

    it('detects and redacts GitHub personal access tokens', () => {
      const input = 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz0123456789';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toBe('Token: ***REDACTED***');
      expect(result).not.toContain('ghp_');
    });

    it('detects and redacts GitHub OAuth tokens', () => {
      const input = 'OAuth: gho_1234567890abcdefghijklmnopqrstuvwxyz0123456789';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toBe('OAuth: ***REDACTED***');
      expect(result).not.toContain('gho_');
    });

    it('detects and redacts AWS access keys', () => {
      const input = 'AWS key: AKIAIOSFODNN7EXAMPLE';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toBe('AWS key: ***REDACTED***');
      expect(result).not.toContain('AKIA');
    });

    it('detects and redacts bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toBe('Authorization: ***REDACTED***');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('handles multiple credentials in the same string', () => {
      const input = 'Keys: sk-ant-api03-abc123xyz789012345678901234567890 and ghp_xyz789012345678901234567890 and AKIAIOSFODNN7EXAMPLE';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toBe('Keys: ***REDACTED*** and ***REDACTED*** and ***REDACTED***');
      expect(result).not.toContain('sk-ant-api03');
      expect(result).not.toContain('ghp_');
      expect(result).not.toContain('AKIA');
    });

    it('preserves non-sensitive content', () => {
      const input = 'This is a normal string with no credentials';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toBe(input);
    });

    it('handles empty strings', () => {
      const result = CredentialDetector.detectAndRedact('');
      expect(result).toBe('');
    });

    it('handles strings with only whitespace', () => {
      const input = '   \n\t  ';
      const result = CredentialDetector.detectAndRedact(input);
      expect(result).toBe(input);
    });

    it('detects credentials in JSON strings', () => {
      const input = JSON.stringify({
        apiKey: 'sk-ant-api03-test123456789012345678901234567890123456789',
        normalField: 'value',
      });
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toContain('***REDACTED***');
      expect(result).toContain('normalField');
      expect(result).toContain('value');
      expect(result).not.toContain('sk-ant-api03');
    });

    it('detects credentials in YAML-like strings', () => {
      const input = 'anthropic:\n  apiKey: sk-ant-api03-test123456789012345678901234567890123456789\nother: value';
      const result = CredentialDetector.detectAndRedact(input);

      expect(result).toContain('***REDACTED***');
      expect(result).toContain('other: value');
      expect(result).not.toContain('sk-ant-api03');
    });
  });

  describe('containsCredentials', () => {
    it('returns true when Anthropic API key is present', () => {
      const input = 'Key: sk-ant-api03-test123456789012345678901234567890';
      expect(CredentialDetector.containsCredentials(input)).toBe(true);
    });

    it('returns true when OpenAI API key is present', () => {
      const input = 'Key: sk-proj-test123456789012345678901234567890';
      expect(CredentialDetector.containsCredentials(input)).toBe(true);
    });

    it('returns true when GitHub token is present', () => {
      const input = 'Token: ghp_test123456789012345678901234567890';
      expect(CredentialDetector.containsCredentials(input)).toBe(true);
    });

    it('returns true when AWS key is present', () => {
      const input = 'Key: AKIAIOSFODNN7EXAMPLE';
      expect(CredentialDetector.containsCredentials(input)).toBe(true);
    });

    it('returns true when bearer token is present', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      expect(CredentialDetector.containsCredentials(input)).toBe(true);
    });

    it('returns false when no credentials are present', () => {
      const input = 'This is a normal string';
      expect(CredentialDetector.containsCredentials(input)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(CredentialDetector.containsCredentials('')).toBe(false);
    });
  });

  describe('sanitizeObject', () => {
    it('sanitizes credentials in nested objects', () => {
      const input = {
        apiKey: 'sk-ant-api03-test123456789012345678901234567890',
        nested: {
          token: 'ghp_test123456789012345678901234567890',
          safe: 'value',
        },
        normalField: 'data',
      };

      const result = CredentialDetector.sanitizeObject(input);

      expect(result.apiKey).toBe('***REDACTED***');
      expect(result.nested.token).toBe('***REDACTED***');
      expect(result.nested.safe).toBe('value');
      expect(result.normalField).toBe('data');
    });

    it('sanitizes credentials in arrays', () => {
      const input = {
        keys: ['sk-ant-api03-test123456789012345678901234567890', 'normal-value', 'ghp_test123456789012345678901234567890'],
      };

      const result = CredentialDetector.sanitizeObject(input);

      expect(result.keys[0]).toBe('***REDACTED***');
      expect(result.keys[1]).toBe('normal-value');
      expect(result.keys[2]).toBe('***REDACTED***');
    });

    it('preserves non-string values', () => {
      const input = {
        number: 42,
        boolean: true,
        nullValue: null,
        array: [1, 2, 3],
      };

      const result = CredentialDetector.sanitizeObject(input);

      expect(result.number).toBe(42);
      expect(result.boolean).toBe(true);
      expect(result.nullValue).toBe(null);
      expect(result.array).toEqual([1, 2, 3]);
    });

    it('handles deeply nested structures', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              apiKey: 'sk-ant-api03-test123456789012345678901234567890',
            },
          },
        },
      };

      const result = CredentialDetector.sanitizeObject(input);

      expect(result.level1.level2.level3.apiKey).toBe('***REDACTED***');
    });

    it('returns original object if no credentials found', () => {
      const input = {
        field1: 'value1',
        field2: 'value2',
      };

      const result = CredentialDetector.sanitizeObject(input);

      expect(result).toEqual(input);
    });
  });
});

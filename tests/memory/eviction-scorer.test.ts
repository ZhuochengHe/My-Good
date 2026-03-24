/**
 * Tests for the eviction scorer.
 * scoreMemory() assigns a retention score in [0, 1] to expired episodic entries.
 * Only episodic entries are ever scored — other kinds are never evicted.
 */

import { describe, it, expect } from 'vitest';
import { scoreMemory } from '../../src/memory/eviction-scorer.js';
import type { MemoryEntry } from '../../src/types/memory.js';
import { randomUUID } from 'crypto';

/**
 * Builds a minimal expired episodic MemoryEntry for scorer tests.
 *
 * Defaults: ttlDays=1, createdAt 1.5 days ago (expired), lastAccessed 1.5 days ago
 * (within 2× TTL — so the stale-access penalty does NOT fire unless overridden).
 */
function makeEpisodicEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const now = Date.now();
  const createdAt = now - Math.round(1.5 * 86400000);
  return {
    id: randomUUID(),
    kind: 'episodic',
    content: 'Short content',
    tags: [],
    createdAt,
    updatedAt: createdAt,
    lastAccessed: createdAt, // within 2× ttlDays=1 (i.e. < 2 days ago) — no penalty
    ttlDays: 1,
    ...overrides,
  };
}

describe('scoreMemory', () => {
  // ---------------------------------------------------------------------------
  // Score range invariant
  // ---------------------------------------------------------------------------

  describe('score is always clamped to [0, 1]', () => {
    it('returns a number >= 0 for an entry with no positive signals', () => {
      const entry = makeEpisodicEntry();
      expect(scoreMemory(entry)).toBeGreaterThanOrEqual(0);
    });

    it('returns a number <= 1 even when all positive signals apply', () => {
      const entry = makeEpisodicEntry({
        tags: ['architecture', 'decision', 'convention'],
        accessCount: 5,
        ttlRenewals: 3,
        content: 'x'.repeat(300),
      });
      expect(scoreMemory(entry)).toBeLessThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Tag category factor (+0.4)
  // High-value tags: 'architecture', 'decision', 'convention'
  // ---------------------------------------------------------------------------

  describe('tag category factor (+0.4)', () => {
    it('adds 0.4 when tags include "architecture"', () => {
      const withTag = makeEpisodicEntry({ tags: ['architecture'] });
      const without = makeEpisodicEntry({ tags: [] });
      expect(scoreMemory(withTag) - scoreMemory(without)).toBeCloseTo(0.4);
    });

    it('adds 0.4 when tags include "decision"', () => {
      const withTag = makeEpisodicEntry({ tags: ['decision'] });
      const without = makeEpisodicEntry({ tags: [] });
      expect(scoreMemory(withTag) - scoreMemory(without)).toBeCloseTo(0.4);
    });

    it('adds 0.4 when tags include "convention"', () => {
      const withTag = makeEpisodicEntry({ tags: ['convention'] });
      const without = makeEpisodicEntry({ tags: [] });
      expect(scoreMemory(withTag) - scoreMemory(without)).toBeCloseTo(0.4);
    });

    it('applies tag bonus only once even with multiple qualifying tags', () => {
      const multiTag = makeEpisodicEntry({ tags: ['architecture', 'decision', 'convention'] });
      const singleTag = makeEpisodicEntry({ tags: ['architecture'] });
      // Boolean factor — three matching tags score identically to one
      expect(scoreMemory(multiTag)).toBeCloseTo(scoreMemory(singleTag));
    });

    it('does not add tag bonus for non-qualifying tags', () => {
      // Tags that belong to other memory kinds (preference, experiential, semantic)
      // or are general labels should not trigger the high-value bonus
      const unrelated = makeEpisodicEntry({ tags: ['sprint-goal', 'bug', 'preference'] });
      const noTags = makeEpisodicEntry({ tags: [] });
      expect(scoreMemory(unrelated)).toBeCloseTo(scoreMemory(noTags));
    });
  });

  // ---------------------------------------------------------------------------
  // Access frequency factor (+0.25)
  // Threshold: accessCount >= 3
  // ---------------------------------------------------------------------------

  describe('access frequency factor (+0.25)', () => {
    it('adds 0.25 when accessCount >= 3', () => {
      const highAccess = makeEpisodicEntry({ accessCount: 3 });
      const noAccess = makeEpisodicEntry({ accessCount: 0 });
      expect(scoreMemory(highAccess) - scoreMemory(noAccess)).toBeCloseTo(0.25);
    });

    it('adds 0.25 when accessCount > 3', () => {
      const veryHighAccess = makeEpisodicEntry({ accessCount: 10 });
      const noAccess = makeEpisodicEntry({ accessCount: 0 });
      expect(scoreMemory(veryHighAccess) - scoreMemory(noAccess)).toBeCloseTo(0.25);
    });

    it('does not add access bonus when accessCount < 3', () => {
      const lowAccess = makeEpisodicEntry({ accessCount: 2 });
      const noAccess = makeEpisodicEntry({ accessCount: 0 });
      expect(scoreMemory(lowAccess)).toBeCloseTo(scoreMemory(noAccess));
    });

    it('treats undefined accessCount as 0', () => {
      const undefinedAccess = makeEpisodicEntry({ accessCount: undefined });
      const zeroAccess = makeEpisodicEntry({ accessCount: 0 });
      expect(scoreMemory(undefinedAccess)).toBeCloseTo(scoreMemory(zeroAccess));
    });
  });

  // ---------------------------------------------------------------------------
  // TTL renewals factor (+0.2)
  // Threshold: ttlRenewals >= 1
  // ---------------------------------------------------------------------------

  describe('TTL renewals factor (+0.2)', () => {
    it('adds 0.2 when ttlRenewals >= 1', () => {
      const renewed = makeEpisodicEntry({ ttlRenewals: 1 });
      const notRenewed = makeEpisodicEntry({ ttlRenewals: 0 });
      expect(scoreMemory(renewed) - scoreMemory(notRenewed)).toBeCloseTo(0.2);
    });

    it('adds 0.2 when ttlRenewals > 1 (bonus does not stack)', () => {
      const manyRenewals = makeEpisodicEntry({ ttlRenewals: 5 });
      const oneRenewal = makeEpisodicEntry({ ttlRenewals: 1 });
      expect(scoreMemory(manyRenewals)).toBeCloseTo(scoreMemory(oneRenewal));
    });

    it('treats undefined ttlRenewals as 0', () => {
      const undefinedRenewals = makeEpisodicEntry({ ttlRenewals: undefined });
      const zeroRenewals = makeEpisodicEntry({ ttlRenewals: 0 });
      expect(scoreMemory(undefinedRenewals)).toBeCloseTo(scoreMemory(zeroRenewals));
    });
  });

  // ---------------------------------------------------------------------------
  // Content specificity factor (+0.1)
  // Threshold: content.length > 200
  // ---------------------------------------------------------------------------

  describe('content specificity factor (+0.1)', () => {
    it('adds 0.1 when content.length > 200', () => {
      const long = makeEpisodicEntry({ content: 'x'.repeat(201) });
      const short = makeEpisodicEntry({ content: 'short' });
      expect(scoreMemory(long) - scoreMemory(short)).toBeCloseTo(0.1);
    });

    it('does not add bonus at exactly 200 characters', () => {
      const exactlyTwoHundred = makeEpisodicEntry({ content: 'x'.repeat(200) });
      const short = makeEpisodicEntry({ content: 'short' });
      expect(scoreMemory(exactlyTwoHundred)).toBeCloseTo(scoreMemory(short));
    });
  });

  // ---------------------------------------------------------------------------
  // Stale access penalty (-0.1)
  // Fires when lastAccessed > 2 × ttlDays ago (entry was never re-read after expiry)
  // ---------------------------------------------------------------------------

  describe('stale access penalty (-0.1)', () => {
    it('subtracts 0.1 when lastAccessed is older than 2× ttlDays period', () => {
      const threeMonthsAgo = Date.now() - 90 * 86400000;
      const stale = makeEpisodicEntry({
        ttlDays: 30,
        lastAccessed: threeMonthsAgo, // 90 days ago > 2×30 = 60 days — penalty fires
        content: 'x'.repeat(201),     // +0.1 so there's a visible baseline to compare
      });
      const fresh = makeEpisodicEntry({
        ttlDays: 30,
        lastAccessed: Date.now() - 2 * 86400000, // recently accessed — no penalty
        content: 'x'.repeat(201),
      });
      expect(scoreMemory(stale)).toBeLessThan(scoreMemory(fresh));
      expect(scoreMemory(fresh) - scoreMemory(stale)).toBeCloseTo(0.1);
    });

    it('does not subtract when lastAccessed is undefined', () => {
      const noAccessRecord = makeEpisodicEntry({
        ttlDays: 30,
        lastAccessed: undefined,
        content: 'x'.repeat(201),
      });
      const staleAccessRecord = makeEpisodicEntry({
        ttlDays: 30,
        lastAccessed: Date.now() - 90 * 86400000, // > 2× TTL — penalty applies
        content: 'x'.repeat(201),
      });
      expect(scoreMemory(noAccessRecord)).toBeGreaterThan(scoreMemory(staleAccessRecord));
    });

    it('does not subtract when ttlDays is undefined (no TTL baseline to measure against)', () => {
      const threeMonthsAgo = Date.now() - 90 * 86400000;
      const noTtl = makeEpisodicEntry({
        ttlDays: undefined,
        lastAccessed: threeMonthsAgo, // stale timestamp but no ttlDays → penalty never fires
        content: 'x'.repeat(201),
      });
      const withTtl = makeEpisodicEntry({
        ttlDays: 30,
        lastAccessed: threeMonthsAgo, // > 2×30 days → penalty fires
        content: 'x'.repeat(201),
      });
      expect(scoreMemory(noTtl)).toBeGreaterThan(scoreMemory(withTtl));
    });

    it('does not subtract when lastAccessed is within 2× ttlDays', () => {
      // ttlDays=30 → stale cutoff = 60 days; lastAccessed 45 days ago → still safe
      const withinWindow = makeEpisodicEntry({
        ttlDays: 30,
        lastAccessed: Date.now() - 45 * 86400000, // < 60 day cutoff — no penalty
      });
      const baseline = makeEpisodicEntry({
        ttlDays: 30,
        lastAccessed: Date.now() - 1 * 86400000, // very recent — definitely no penalty
      });
      expect(scoreMemory(withinWindow)).toBeCloseTo(scoreMemory(baseline));
    });
  });

  // ---------------------------------------------------------------------------
  // Combined scoring scenarios
  // ---------------------------------------------------------------------------

  describe('combined scoring', () => {
    it('entry with no signals scores 0', () => {
      const entry = makeEpisodicEntry({
        tags: [],
        accessCount: 0,
        ttlRenewals: 0,
        content: 'short',
        // lastAccessed kept at default (recent) so stale penalty does not apply
      });
      // No positive signals → 0; stale penalty clamped at 0
      expect(scoreMemory(entry)).toBeGreaterThanOrEqual(0);
      expect(scoreMemory(entry)).toBeLessThan(0.1);
    });

    it('architecture tag + high access + renewals = high value (>= 0.6)', () => {
      const entry = makeEpisodicEntry({
        tags: ['architecture'],
        accessCount: 5,
        ttlRenewals: 2,
        content: 'short',
      });
      // 0.4 + 0.25 + 0.2 = 0.85 >= 0.6 threshold
      expect(scoreMemory(entry)).toBeGreaterThanOrEqual(0.6);
    });

    it('decision tag + long content = below high-value threshold (0.5)', () => {
      const entry = makeEpisodicEntry({
        tags: ['decision'],
        accessCount: 0,
        ttlRenewals: 0,
        content: 'x'.repeat(201),
      });
      // 0.4 + 0.1 = 0.5 — below the 0.6 pendingKB threshold
      expect(scoreMemory(entry)).toBeCloseTo(0.5, 1);
    });

    it('all signals active scores close to 0.95', () => {
      const entry = makeEpisodicEntry({
        tags: ['architecture'],
        accessCount: 5,
        ttlRenewals: 3,
        content: 'x'.repeat(300),
        // lastAccessed is recent (default) so stale penalty does not apply
      });
      // 0.4 + 0.25 + 0.2 + 0.1 = 0.95
      expect(scoreMemory(entry)).toBeCloseTo(0.95, 1);
    });

    it('stale penalty reduces a borderline entry below 0.6', () => {
      // Without stale penalty: decision(0.4) + content(0.1) = 0.5 — already below 0.6
      // Add stale: 0.5 - 0.1 = 0.4 (clamped to 0 if negative, but 0.4 is valid)
      const stale = makeEpisodicEntry({
        tags: ['decision'],
        content: 'x'.repeat(201),
        ttlDays: 30,
        lastAccessed: Date.now() - 90 * 86400000, // > 2× TTL — penalty fires
      });
      expect(scoreMemory(stale)).toBeCloseTo(0.4, 1);
      expect(scoreMemory(stale)).toBeLessThan(0.6);
    });
  });
});

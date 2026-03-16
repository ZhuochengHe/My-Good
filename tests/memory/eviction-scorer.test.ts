/**
 * Tests for eviction scorer.
 * Written FIRST following TDD methodology (RED → GREEN → REFACTOR).
 */

import { describe, it, expect } from 'vitest';
import { scoreMemory } from '../../src/memory/eviction-scorer.js';
import type { MemoryEntry } from '../../src/types/memory.js';
import { randomUUID } from 'crypto';

/** Builds a minimal expired layer-3 MemoryEntry for scorer tests.
 *
 * Default: ttlDays=1, createdAt 1.5 days ago — expired but well within 2× TTL
 * so the age-penalty factor never fires unless overridden.
 */
function makeL3Entry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const now = Date.now();
  return {
    id: randomUUID(),
    layer: 3,
    content: 'Short content',
    tags: [],
    // 1.5 days ago with ttlDays=1: expired (> 1d) but not "old" (< 2d = 2× TTL)
    createdAt: now - Math.round(1.5 * 86400000),
    updatedAt: now - 86400000,
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
      const entry = makeL3Entry();
      expect(scoreMemory(entry)).toBeGreaterThanOrEqual(0);
    });

    it('returns a number <= 1 even when all positive signals apply', () => {
      const entry = makeL3Entry({
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
  // ---------------------------------------------------------------------------

  describe('tag category factor', () => {
    it('adds 0.4 when tags include "architecture"', () => {
      const withArch = makeL3Entry({ tags: ['architecture'] });
      const withoutArch = makeL3Entry({ tags: [] });
      expect(scoreMemory(withArch)).toBeGreaterThan(scoreMemory(withoutArch));
      expect(scoreMemory(withArch) - scoreMemory(withoutArch)).toBeCloseTo(0.4);
    });

    it('adds 0.4 when tags include "decision"', () => {
      const withDecision = makeL3Entry({ tags: ['decision'] });
      const withoutDecision = makeL3Entry({ tags: [] });
      expect(scoreMemory(withDecision) - scoreMemory(withoutDecision)).toBeCloseTo(0.4);
    });

    it('adds 0.4 when tags include "convention"', () => {
      const withConvention = makeL3Entry({ tags: ['convention'] });
      const withoutConvention = makeL3Entry({ tags: [] });
      expect(scoreMemory(withConvention) - scoreMemory(withoutConvention)).toBeCloseTo(0.4);
    });

    it('applies tag bonus only once even with multiple qualifying tags', () => {
      const multiTag = makeL3Entry({ tags: ['architecture', 'decision', 'convention'] });
      const singleTag = makeL3Entry({ tags: ['architecture'] });
      // Both should produce the same score since it's a boolean +0.4 factor
      expect(scoreMemory(multiTag)).toBeCloseTo(scoreMemory(singleTag));
    });

    it('does not add tag bonus for unrelated tags', () => {
      const unrelated = makeL3Entry({ tags: ['sprint-goal', 'bug', 'feature'] });
      const noTags = makeL3Entry({ tags: [] });
      expect(scoreMemory(unrelated)).toBeCloseTo(scoreMemory(noTags));
    });
  });

  // ---------------------------------------------------------------------------
  // Access frequency factor (+0.25)
  // ---------------------------------------------------------------------------

  describe('access frequency factor', () => {
    it('adds 0.25 when accessCount >= 3', () => {
      const highAccess = makeL3Entry({ accessCount: 3 });
      const noAccess = makeL3Entry({ accessCount: 0 });
      expect(scoreMemory(highAccess) - scoreMemory(noAccess)).toBeCloseTo(0.25);
    });

    it('adds 0.25 when accessCount > 3', () => {
      const veryHighAccess = makeL3Entry({ accessCount: 10 });
      const noAccess = makeL3Entry({ accessCount: 0 });
      expect(scoreMemory(veryHighAccess) - scoreMemory(noAccess)).toBeCloseTo(0.25);
    });

    it('does not add access bonus when accessCount < 3', () => {
      const lowAccess = makeL3Entry({ accessCount: 2 });
      const noAccess = makeL3Entry({ accessCount: 0 });
      expect(scoreMemory(lowAccess)).toBeCloseTo(scoreMemory(noAccess));
    });

    it('does not add access bonus when accessCount is undefined', () => {
      const undefinedAccess = makeL3Entry({ accessCount: undefined });
      const zeroAccess = makeL3Entry({ accessCount: 0 });
      expect(scoreMemory(undefinedAccess)).toBeCloseTo(scoreMemory(zeroAccess));
    });
  });

  // ---------------------------------------------------------------------------
  // TTL renewals factor (+0.2)
  // ---------------------------------------------------------------------------

  describe('TTL renewals factor', () => {
    it('adds 0.2 when ttlRenewals >= 1', () => {
      const renewed = makeL3Entry({ ttlRenewals: 1 });
      const notRenewed = makeL3Entry({ ttlRenewals: 0 });
      expect(scoreMemory(renewed) - scoreMemory(notRenewed)).toBeCloseTo(0.2);
    });

    it('adds 0.2 when ttlRenewals > 1', () => {
      const manyRenewals = makeL3Entry({ ttlRenewals: 5 });
      const notRenewed = makeL3Entry({ ttlRenewals: 0 });
      expect(scoreMemory(manyRenewals) - scoreMemory(notRenewed)).toBeCloseTo(0.2);
    });

    it('does not add TTL bonus when ttlRenewals is 0', () => {
      const zeroRenewals = makeL3Entry({ ttlRenewals: 0 });
      const undefinedRenewals = makeL3Entry({ ttlRenewals: undefined });
      expect(scoreMemory(zeroRenewals)).toBeCloseTo(scoreMemory(undefinedRenewals));
    });

    it('does not add TTL bonus when ttlRenewals is undefined', () => {
      const baseline = makeL3Entry({ ttlRenewals: undefined });
      const zeroBaseline = makeL3Entry({ ttlRenewals: 0 });
      expect(scoreMemory(baseline)).toBeCloseTo(scoreMemory(zeroBaseline));
    });
  });

  // ---------------------------------------------------------------------------
  // Content specificity factor (+0.1)
  // ---------------------------------------------------------------------------

  describe('content specificity factor', () => {
    it('adds 0.1 when content.length > 200', () => {
      const longContent = makeL3Entry({ content: 'x'.repeat(201) });
      const shortContent = makeL3Entry({ content: 'short' });
      expect(scoreMemory(longContent) - scoreMemory(shortContent)).toBeCloseTo(0.1);
    });

    it('does not add content bonus when content.length is exactly 200', () => {
      const exactlyTwoHundred = makeL3Entry({ content: 'x'.repeat(200) });
      const shortContent = makeL3Entry({ content: 'short' });
      expect(scoreMemory(exactlyTwoHundred)).toBeCloseTo(scoreMemory(shortContent));
    });

    it('does not add content bonus for short content', () => {
      const shortContent = makeL3Entry({ content: 'hello' });
      const baseline = makeL3Entry({ content: 'x' });
      expect(scoreMemory(shortContent)).toBeCloseTo(scoreMemory(baseline));
    });
  });

  // ---------------------------------------------------------------------------
  // Age at expiry factor (negative: -0.1 when ttlRenewals === 0 and old)
  // ---------------------------------------------------------------------------

  describe('age at expiry factor', () => {
    it('subtracts 0.1 when ttlRenewals === 0 and entry survived multiple TTL periods', () => {
      const threeMonthsAgo = Date.now() - 90 * 86400000;
      // Baseline: long content (+0.1). Old unrewened entry should score lower.
      const oldEntry = makeL3Entry({
        ttlRenewals: 0,
        createdAt: threeMonthsAgo,
        ttlDays: 30,
        content: 'x'.repeat(201), // +0.1 so we have a visible positive baseline
      });
      const recentEntry = makeL3Entry({
        ttlRenewals: 0,
        createdAt: Date.now() - 2 * 86400000, // within first TTL period — no penalty
        ttlDays: 30,
        content: 'x'.repeat(201), // same positive signal
      });
      // oldEntry survived > 2 TTL periods → penalty applies → lower score
      expect(scoreMemory(oldEntry)).toBeLessThan(scoreMemory(recentEntry));
    });

    it('does not subtract when ttlRenewals >= 1 (renewed entry is not penalised)', () => {
      const threeMonthsAgo = Date.now() - 90 * 86400000;
      const oldRenewed = makeL3Entry({
        ttlRenewals: 1,
        createdAt: threeMonthsAgo,
        ttlDays: 30,
        content: 'x'.repeat(201),
      });
      const oldNotRenewed = makeL3Entry({
        ttlRenewals: 0,
        createdAt: threeMonthsAgo,
        ttlDays: 30,
        content: 'x'.repeat(201),
      });
      expect(scoreMemory(oldRenewed)).toBeGreaterThan(scoreMemory(oldNotRenewed));
    });

    it('does not subtract when ttlDays is undefined', () => {
      const threeMonthsAgo = Date.now() - 90 * 86400000;
      const entryNoTtl = makeL3Entry({
        ttlRenewals: 0,
        ttlDays: undefined,
        createdAt: threeMonthsAgo,
        content: 'x'.repeat(201), // give a baseline positive signal
      });
      const entryWithTtl = makeL3Entry({
        ttlRenewals: 0,
        ttlDays: 30,
        createdAt: threeMonthsAgo,
        content: 'x'.repeat(201), // same positive signal
      });
      // entryWithTtl should be penalised (survived >2 TTL periods), entryNoTtl should not
      expect(scoreMemory(entryNoTtl)).toBeGreaterThan(scoreMemory(entryWithTtl));
    });
  });

  // ---------------------------------------------------------------------------
  // Combined scoring scenarios
  // ---------------------------------------------------------------------------

  describe('combined scoring', () => {
    it('entry with no signals scores 0', () => {
      const entry = makeL3Entry({
        tags: [],
        accessCount: 0,
        ttlRenewals: 0,
        content: 'short',
        createdAt: Date.now() - 2 * 86400000,
        ttlDays: 1,
      });
      // Should be 0 (no positive signals), possibly -0.1 from age penalty clamped to 0
      expect(scoreMemory(entry)).toBeGreaterThanOrEqual(0);
      expect(scoreMemory(entry)).toBeLessThan(0.1);
    });

    it('architecture tag + high access + renewals = high value (>= 0.6)', () => {
      const entry = makeL3Entry({
        tags: ['architecture'],
        accessCount: 5,
        ttlRenewals: 2,
        content: 'short',
      });
      // 0.4 + 0.25 + 0.2 = 0.85 >= 0.6
      expect(scoreMemory(entry)).toBeGreaterThanOrEqual(0.6);
    });

    it('decision tag + long content = borderline high value', () => {
      const entry = makeL3Entry({
        tags: ['decision'],
        accessCount: 0,
        ttlRenewals: 0,
        content: 'x'.repeat(201),
      });
      // 0.4 + 0.1 = 0.5 — below 0.6 unless age penalty does not apply
      expect(scoreMemory(entry)).toBeCloseTo(0.5, 1);
    });

    it('all signals active scores close to 1', () => {
      const entry = makeL3Entry({
        tags: ['architecture'],
        accessCount: 5,
        ttlRenewals: 3,
        content: 'x'.repeat(300),
      });
      // 0.4 + 0.25 + 0.2 + 0.1 = 0.95
      expect(scoreMemory(entry)).toBeCloseTo(0.95, 1);
    });
  });
});

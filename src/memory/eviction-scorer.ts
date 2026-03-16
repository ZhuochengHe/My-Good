/**
 * Eviction scorer for Layer 3 memory entries.
 * Computes a retention score in [0, 1] using a weighted rule-based approach.
 * High scores (>= 0.6) indicate high-value entries to archive; low scores trigger deletion.
 *
 * Scoring is isolated here so the rule-based implementation can be swapped for
 * an ML model in the future without changing the call-site interface.
 */

import type { MemoryEntry } from '../types/memory.js';

/** Tags that indicate architecturally significant memories worth retaining. */
const HIGH_VALUE_TAGS = new Set<string>(['architecture', 'decision', 'convention']);

/** Weight applied when the entry carries a high-value tag. */
const WEIGHT_HIGH_VALUE_TAG = 0.4;

/** Minimum accessCount to qualify for the access-frequency bonus. */
const ACCESS_FREQUENCY_THRESHOLD = 3;

/** Weight applied when accessCount meets or exceeds ACCESS_FREQUENCY_THRESHOLD. */
const WEIGHT_ACCESS_FREQUENCY = 0.25;

/** Weight applied when at least one TTL renewal has occurred. */
const WEIGHT_TTL_RENEWALS = 0.2;

/** Minimum content length (in characters) to qualify for the specificity bonus. */
const CONTENT_SPECIFICITY_MIN_LENGTH = 200;

/** Weight applied when content exceeds CONTENT_SPECIFICITY_MIN_LENGTH. */
const WEIGHT_CONTENT_SPECIFICITY = 0.1;

/** Penalty applied when the entry survived multiple TTL periods without renewal. */
const PENALTY_OLD_UNRENEWED = 0.1;

/**
 * Returns true when the entry has survived at least two full TTL periods
 * without any renewal — a signal that the information has become stale.
 * Requires age > 2 × ttlDays to distinguish clearly expired from borderline.
 *
 * @param entry - Memory entry to evaluate
 */
function isOldUnrenewed(entry: MemoryEntry): boolean {
  if ((entry.ttlRenewals ?? 0) > 0) {
    return false;
  }
  if (entry.ttlDays === undefined || entry.ttlDays <= 0) {
    return false;
  }
  const ageMs = Date.now() - entry.createdAt;
  const ttlMs = entry.ttlDays * 86400000;
  // "Survived multiple TTL periods" means age > 2 full TTL periods
  return ageMs > 2 * ttlMs;
}

/**
 * Computes a retention score for a memory entry.
 *
 * The score is a weighted sum of the following boolean factors:
 *   +0.4  — tags include "architecture", "decision", or "convention"
 *   +0.25 — accessCount >= 3
 *   +0.2  — ttlRenewals >= 1
 *   +0.1  — content.length > 200
 *   -0.1  — no renewals and entry is older than one TTL period (stale)
 *
 * The result is clamped to [0, 1].
 *
 * @param entry - The MemoryEntry to score
 * @returns A number in [0, 1]; values >= 0.6 are considered high-value
 */
export function scoreMemory(entry: MemoryEntry): number {
  let score = 0;

  // Factor 1: high-value tag category (+0.4)
  if (entry.tags.some(tag => HIGH_VALUE_TAGS.has(tag))) {
    score += WEIGHT_HIGH_VALUE_TAG;
  }

  // Factor 2: access frequency (+0.25)
  if ((entry.accessCount ?? 0) >= ACCESS_FREQUENCY_THRESHOLD) {
    score += WEIGHT_ACCESS_FREQUENCY;
  }

  // Factor 3: TTL renewals (+0.2)
  if ((entry.ttlRenewals ?? 0) >= 1) {
    score += WEIGHT_TTL_RENEWALS;
  }

  // Factor 4: content specificity (+0.1)
  if (entry.content.length > CONTENT_SPECIFICITY_MIN_LENGTH) {
    score += WEIGHT_CONTENT_SPECIFICITY;
  }

  // Factor 5: age penalty (-0.1) for unrenewed old entries
  if (isOldUnrenewed(entry)) {
    score -= PENALTY_OLD_UNRENEWED;
  }

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, score));
}

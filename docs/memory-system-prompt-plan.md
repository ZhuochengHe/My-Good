# Plan: Memory Layer System — Implementation Roadmap

## Overview

The memory module (3 layers, 5 tools) is implemented. This document tracks the full roadmap for making it useful and robust. Work is sequenced from simplest to most complex.

---

## Phase 1: System Prompt Guidance (NEXT)

**Goal:** Give the agent instructions on when and how to use the memory system proactively.

**File:** `src/types/settings.ts` — extend `DEFAULT_SETTINGS.behavior.systemPrompt`.

No new files. No new logic. Pure prompt text.

### Layer Classification Rules

| Layer | When to use | TTL |
|-------|-------------|-----|
| **L1 — Identity** | Permanent facts about the user that never change: name, role, persistent working style, fundamental preferences | No TTL |
| **L2 — Preferences & Skills** | Semi-stable facts: preferred languages/frameworks, coding conventions, project-level prefs, how user likes responses | No TTL (but updatable) |
| **L3 — Episodic/Domain** | Time-sensitive context: current project facts, active bugs, sprint goals, "last time we did X" | Always set `ttlDays` (7–90d depending on relevance) |

### Save Triggers (to embed in system prompt)

1. User explicitly states a preference or fact about themselves → L1 or L2
2. User corrects the agent's behavior in a way that should persist → L1 or L2
3. Agent learns a domain fact specific to the project (tech stack, architecture decision, naming conventions) → L2 or L3
4. User mentions a short-term context item (active feature, current bug) → L3 with TTL
5. **Do NOT** save: conversational filler, single-turn context, task instructions that don't generalize

### Proposed System Prompt Text

```
You have access to a persistent memory system with three layers. Use it proactively to remember information across sessions.

Memory layers:
- Layer 1 (Identity): Permanent facts about the user — name, role, fundamental preferences that never change. Save once, rarely update.
- Layer 2 (Preferences & Skills): User's working style, preferred tools/languages, coding conventions, how they like responses formatted. Update when preferences change.
- Layer 3 (Episodic): Time-sensitive project context — active features, current bugs, recent decisions, project-specific facts. Always set ttlDays (7–90 days).

When to save a memory:
- User states a preference, corrects your behavior, or reveals something persistent about themselves → save to L1 or L2
- You learn a domain fact about the project (architecture, tech stack, conventions) → save to L2 or L3
- User mentions a short-term goal or active context item → save to L3 with appropriate TTL
- Do NOT save: transient task instructions, single-session context, conversational filler

Always use descriptive tags (e.g., ["typescript", "testing", "preference"]) to make memories searchable.
Use search_memory at the start of a new topic to check if you already know relevant context.
```

### Implementation

Update `DEFAULT_SETTINGS.behavior.systemPrompt` from `'You are a helpful AI assistant.'` to the full text above. Check and update any tests that assert the exact old string.

**Verification:**
1. `npm run build` — no errors
2. `npm run lint` — no errors
3. `npm test` — update any tests asserting old prompt string
4. Manual smoke test: `my-agent chat` → agent should call `save_memory` when user states a preference

---

## Phase 2: TTL Enforcement at Read-Time

**Goal:** Expired L3 memories are never returned to the LLM. Enforcement is lazy (on read), requiring no background process.

### Design

- In `JsonMemoryStore`, filter out expired L3 entries in `search`, `get`, and `list` operations before returning results.
- Expiry check: `memory.layer === 3 && memory.ttlDays && Date.now() > memory.createdAt + memory.ttlDays * 86400000`
- Expired entries remain in the JSON file (soft eviction) — they are silently excluded from results.
- No deletion yet; deletion happens in Phase 3.

### What changes

- `src/memory/memory-store.ts` — add TTL filter to read paths
- `tests/memory/memory-store.test.ts` — add TTL expiry test cases

---

## Phase 3: Automatic L3 Eviction (Size-Based Cleanup)

**Goal:** Prevent unbounded growth of L3 memories by evicting expired entries when the store exceeds a size threshold.

### Trigger

Eviction runs when either:
- Total L3 memory count exceeds a configurable threshold (e.g., 100 entries), OR
- Session start sweep (run once at startup to clean stale entries)

### Eviction Policy: Score-Based

Each expired L3 memory gets a retention score. High-scoring entries are promoted to a "pending KB" archive; low-scoring entries are deleted.

**Scoring factors (weighted rules, no ML):**

| Factor | Signal | Weight |
|--------|--------|--------|
| Access frequency | Read N+ times → valuable | High |
| Tag category | `architecture`, `decision`, `convention` → keep; `sprint-goal`, `active-bug` → drop | High |
| TTL renewals | User explicitly refreshed TTL → strong keep signal | Medium |
| Content specificity | Longer, more detailed entries → more valuable | Low |
| Age at expiry | Survived multiple TTL periods without renewal → less relevant | Low (negative) |

A simple weighted sum produces a score in [0, 1]. Entries above a threshold (e.g., 0.6) are promoted; below are deleted.

**Note on ML:** A learned scoring model would be more accurate but requires labeled data (user decisions across many sessions). Deferred — the rule-based scorer is a placeholder that can be swapped out later without interface changes.

### What changes

- `src/memory/memory-store.ts` — add eviction sweep method
- `src/memory/eviction-scorer.ts` — scoring logic (isolated for future ML swap)
- `src/types/memory.ts` — add `accessCount`, `ttlRenewals` fields to memory schema
- `src/types/settings.ts` — add `memory.evictionThreshold` config option
- Tests for scorer and sweep

---

## Phase 4: Knowledge Base (Deferred)

**Status: Not yet designed. Defer until Phase 3 is in use and real L3 accumulation patterns are observable.**

### Tentative direction

- KB stores **objective, durable project/domain facts** — architecture decisions, API contracts, tech stack choices, key algorithms.
- Distinct from L1/L2 which are subjective (user identity, preferences).
- Initial implementation: append-only JSONL with full-text search (no vector store yet).
- V2: sqlite-vec or similar for RAG-style semantic retrieval.
- Promotion hook: Phase 3 eviction scorer sets a `promoteToKB: true` flag on high-value expired L3 entries; a separate KB writer ingests these.

### Open questions (to resolve before Phase 4)

- Boundary between L2 "project prefs" and KB "project facts" — e.g., "we use hexagonal architecture" is both. Where does it live?
- KB scope: per-project (cwd-scoped) or global?
- Who can write to KB: only eviction pipeline, or also LLM directly?
- Retrieval: full-text vs semantic (RAG) — when is the complexity worth it?

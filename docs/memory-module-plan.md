# Memory Module Implementation Plan

## Context

The my_good agent currently has no cross-session memory. Each conversation starts fresh. We want to add a three-layer persistent memory system so the agent can remember identity facts, user preferences, and domain knowledge across sessions.

User decisions:
- Pure text search (no embeddings/vectors)
- Agent-initiated via tool calls (save_memory, search_memory, etc.)
- Layers separated by lifecycle: Layer 1 = permanent, Layer 2 = semi-persistent, Layer 3 = time-sensitive with TTL
- Memory tools go in a dedicated top-level `memory` plugin

---

## Three-Layer Architecture

| Layer | Name | Lifecycle | Injection | Example |
|-------|------|-----------|-----------|---------|
| 1 | Identity | Permanent, never expires | Always in system prompt | "User prefers concise answers" |
| 2 | Preferences & Skills | Semi-persistent, updatable | Once at run() start | "User works in TypeScript on Node.js projects" |
| 3 | Episodic / Domain | Time-sensitive, TTL-based | On-demand via search_memory tool | "Project phoenix uses PostgreSQL 15" |

---

## File Structure

### New files to create
```
src/types/memory.ts              # MemoryEntry, MemoryLayer, MemoryStore interface, etc.
src/errors/memory.ts             # MemoryError hierarchy (MEMORY_001–006)
src/memory/memory-store.ts       # JsonMemoryStore implementation
src/memory/index.ts              # Re-exports
plugins/memory/plugin.json       # Plugin manifest (5 tools)
plugins/memory/handlers.js       # Tool handler implementations (ESM JS)
```

### Files to modify
```
src/types/tools.ts               # Add readonly memoryStore?: MemoryStore to ToolContext
src/types/index.ts               # Re-export memory types
src/plugins/tool-executor.ts     # Accept memoryStore in constructor, pass in context
src/agent/tool-call-bridge.ts    # Forward memoryStore in ToolContext
src/agent/execution-loop.ts      # Add memoryStore param; inject L1+L2 into system prompt
src/cli/bootstrap.ts             # Construct JsonMemoryStore, wire to ToolExecutor + ExecutionLoop
```

---

## Key Interfaces (`src/types/memory.ts`)

```typescript
export type MemoryLayer = 1 | 2 | 3;

export interface MemoryEntry {
  readonly id: string;              // UUID
  readonly layer: MemoryLayer;
  readonly content: string;         // The factual text to remember
  readonly tags: readonly string[]; // Keyword tags for search
  readonly createdAt: number;       // Unix ms
  readonly updatedAt: number;       // Unix ms
  readonly expiresAt?: number;      // Unix ms, Layer 3 only
  readonly source?: string;         // "user" | "agent"
}

export interface MemoryStore {
  get(id: string): Promise<MemoryEntry | null>;
  save(entry: MemoryEntry): Promise<void>;
  update(id: string, input: MemoryUpdateInput): Promise<MemoryEntry>;
  delete(id: string): Promise<void>;
  search(options: MemorySearchOptions): Promise<readonly MemoryEntry[]>;
  loadLayer1(): Promise<readonly MemoryEntry[]>;  // For system prompt injection
}
```

---

## Storage Format

Files stored in `~/.my-agent/memory/layer{1,2,3}/<uuid>.json`.

Each file is a single JSON object (one entry per file — same atomicity philosophy as session JSONL).

Atomic writes: temp file + `fs.rename()` with mode `0o600`.

---

## System Prompt Injection (execution-loop.ts)

Current line 169:
```typescript
const systemPrompt = `${this.settings.behavior.systemPrompt}\n\nCurrent working directory: ${this.workingDirectory}`;
```

New pattern (before the while loop, called once per run):
```typescript
const layer1 = this.memoryStore ? await this.memoryStore.loadLayer1() : [];
const layer2 = this.memoryStore ? await this.memoryStore.search({ layer: 2 }) : [];

const identitySection = layer1.length > 0
  ? `\n\n## Persistent Identity\n${layer1.map(m => `- ${m.content}`).join('\n')}`
  : '';

const preferencesSection = layer2.length > 0
  ? `\n\n## User Preferences & Skills\n${layer2.map(m => `- ${m.content}`).join('\n')}`
  : '';

const systemPrompt =
  `${this.settings.behavior.systemPrompt}` +
  identitySection +
  preferencesSection +
  `\n\nCurrent working directory: ${this.workingDirectory}`;
```

Layer 3 is NOT injected — retrieved on-demand via `search_memory` tool call.

---

## Memory Plugin Tools (`plugins/memory/`)

5 tools in `plugin.json`:

| Tool | Purpose | Required params |
|------|---------|-----------------|
| `save_memory` | Create new memory entry | `content`, `layer` |
| `search_memory` | Search by query/tags/layer | none (all optional) |
| `update_memory` | Update content/tags/TTL | `id` |
| `delete_memory` | Permanently delete entry | `id` |
| `list_memories` | List all in a layer | none |

Handlers are named ESM exports in `handlers.js`, following the `plugins/file-ops/handlers.js` pattern. Each handler uses `context.memoryStore` (passed through ToolContext).

---

## ToolContext Extension (`src/types/tools.ts`)

Add one optional field (backward-compatible):
```typescript
export interface ToolContext {
  readonly sessionId: string;
  readonly workingDirectory: string;
  readonly env: Record<string, string>;
  readonly signal?: AbortSignal;
  readonly memoryStore?: MemoryStore;  // NEW
}
```

---

## Bootstrap Wiring (`src/cli/bootstrap.ts`)

Insert between ToolExecutor creation and ExecutionLoop creation:
```typescript
const memoryDir = join(homedir(), '.my-agent', 'memory');
const memoryStore = new JsonMemoryStore(memoryDir);
// Ensure subdirectories exist: layer1/, layer2/, layer3/
```

Pass `memoryStore` to both `ToolExecutor` constructor and `ExecutionLoop` constructor.

---

## Implementation Phases (TDD)

### Phase 1 — Types & Errors
- `src/types/memory.ts` — all interfaces
- `src/errors/memory.ts` — MemoryError hierarchy (MEMORY_001–006)
- Export from index files

### Phase 2 — JsonMemoryStore
- `src/memory/memory-store.ts` — CRUD + text search + TTL filtering
- Tests: save, get, update, delete, search (tag/content/layer filters), TTL expiry, atomic write, ID validation

### Phase 3 — ToolContext + ToolExecutor
- Add `memoryStore?` to `ToolContext`
- `ToolExecutor` constructor accepts optional `memoryStore`, passes to context
- Update `tool-call-bridge.ts` to forward it

### Phase 4 — Memory Plugin
- `plugins/memory/plugin.json` + `handlers.js`
- Tests: all 5 handlers with mock store, edge cases

### Phase 5 — ExecutionLoop Injection
- Add 7th constructor param `memoryStore?`
- Inject L1 + L2 into system prompt before while loop (same in `run()` and `stream()`)
- Tests: prompt contains L1, L2 not repeated per turn, empty store = unchanged prompt

### Phase 6 — Bootstrap Wiring
- Wire JsonMemoryStore into bootstrap.ts
- Verify no regressions in existing 1095 tests

---

## Verification

1. Run `npm test` — all 1095 existing tests pass, ~60–90 new tests added
2. Run `npm run lint && npm run build` — zero errors
3. Manual smoke test:
   ```
   my-agent chat
   > save_memory: "I prefer TypeScript strict mode" layer=2
   > exit
   my-agent chat  # new session
   # Verify "I prefer TypeScript strict mode" appears in agent behavior
   ```
4. Check `~/.my-agent/memory/layer2/<uuid>.json` was written correctly

---

## Canonical Patterns to Follow

- Atomic writes: `src/session/jsonl-store.ts` (temp file + rename, mode 0o600)
- Plugin handlers: `plugins/file-ops/handlers.js` (named ESM exports, args+context, formatted string output)
- Error hierarchy: `src/errors/session.ts`
- ID validation: `JsonlSessionStore.validateSessionId()` pattern

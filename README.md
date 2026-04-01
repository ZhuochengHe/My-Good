# 🤖 my-agent

[中文版](./README.zh-CN.md)



<div align="center">

**A Personal AI Terminal Assistant — Built from Scratch in TypeScript**

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥20-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-1481%20passing-brightgreen?style=flat-square)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/ZhuochengHe/My-Good)

</div>

---

my-agent is a fully autonomous AI assistant that runs in your terminal. It can read and write files, execute shell commands, search the web, and build a persistent semantic memory across sessions — all wired through a multi-provider LLM backend with a streaming Ink/React TUI.

---

## ✨ Features

### Tools and Capabilities

| Plugin | Tools | Notes |
|--------|-------|-------|
| `file-ops` | `read_file`, `write_file` | `write_file` shows a red/green diff and requires confirmation |
| `shell` | `shell_exec` | Arbitrary shell commands; dangerous by default — requires confirmation |
| `web-search` | `web_search`, `fetch_page` | DuckDuckGo search, no API key required |
| `memory` | `save_memory`, `search_memory`, `list_memories`, `delete_memory` | Full CRUD on the persistent memory store |
| `planning` | `create_plan`, `update_plan` | Used internally by the planning loop |
| `soul` | `read_soul`, `update_soul` | Agent reads and updates its own `soul.md` character file between sessions |

### Multi-Provider LLM Support

Supports Anthropic (Claude), OpenAI (GPT), and Moonshot (Kimi) out of the box. Any additional OpenAI-compatible endpoint can be added via `providers.json` without code changes.

### Terminal UI

Built with [Ink](https://github.com/vadimdemedes/ink) (React for terminals). Features include:
- Streaming output with 30ms typewriter cadence
- Live tool-call status blocks (pending / running / done / error)
- Token usage display per turn
- Multi-step slash command state machine (`/memory` browse/delete, `/help`)

---

## 🚀 Quick Start

```bash
npm install

# Build and install to ~/.local/bin (recommended)
./install.sh

# Initialize: select provider, enter API key, choose model
my-agent setup
```

After `install.sh`, `my-agent` is available system-wide. Re-run `install.sh` after any code changes.

**Manual install:**
```bash
npm run build
# Add ./bin/my-agent to PATH
```

---

## 💬 Usage

### Chat

```bash
my-agent chat                            # Interactive TUI (default)
my-agent chat -m "Summarize README.md"  # Single-shot mode
my-agent chat -s <session-id>           # Resume a previous session
```

**Slash commands (inside TUI):**

```
/memory           Browse and delete memory entries by kind
/memory clear     Wipe all entries of a specific kind
/help             List available slash commands
```

### Session Management

```bash
my-agent session list                    # List all sessions
my-agent session list -t debugging       # Filter by tag
my-agent session show <id> --trace       # Detailed turn-by-turn metrics
my-agent session delete <id>
```

### Other

```bash
my-agent plugin list                     # Show loaded plugins and their tools
my-agent settings set behavior.maxTurns 30
my-agent model update                    # Refresh model list from provider
```

---

## 🧠 Memory System

The memory system gives the agent persistent context across sessions. Entries are stored as individual JSON files under `~/.my-agent/memory/<kind>/<uuid>.json` with atomic writes (`tmp → rename`, mode `0o600`).

### Four Memory Kinds

| Kind | Contents | Persistence | Injection |
|------|----------|-------------|-----------|
| `preference` | User preferences, response style, behavior rules | Permanent | Always in system prompt |
| `experiential` | Workflows, project tips, recurring patterns | Permanent | Retrieved on demand |
| `semantic` | Technical architecture, domain knowledge, concepts | Permanent | Retrieved on demand |
| `episodic` | Current tasks, decisions, recent bugs | TTL-based | Most recent 5 entries in prompt |

### Hybrid Retrieval

Retrieval uses a three-signal scoring model:

```
score = 0.75 × cosine_similarity
      + 0.25 × BM25-TF(k₁=1.2)
      + 0.10 × tag_overlap
```

**Vector search** uses `text-embedding-3-small` (1536 dimensions) via an HNSW index (`hnswlib-node`, M=16, efConstruction=200). The HNSW graph gives O(log n) approximate nearest-neighbour queries instead of a full O(n×d) cosine scan.

**Keyword scoring** applies BM25-TF with saturation parameter k₁=1.2 over the top candidates returned by HNSW. This re-ranks entries when keyword overlap is a stronger signal than cosine distance — useful for queries with specific names, identifiers, or exact phrases.

**Tag boost** adds a soft bonus for tag overlap rather than hard-filtering by tag, so relevant entries without matching tags are still surfaced.

### In-Memory Cache

A two-tier write-back cache eliminates O(n) disk I/O on the search hot path:

- **Hot tier** (`Map`): `preference` + `experiential` kinds — full set, always resident, write-through
- **LRU tier** (`LruCache`, default 500 entries): `semantic` + `episodic` — bounded, write-back with 500ms debounce on `accessCount` updates

Cold start: first search scans all four kind directories once and populates both tiers. All subsequent reads are served from RAM.

### Performance

**Vector index (A1 — `searchByCosine` latency):**

| Index size | Brute-force (before) | HNSW (after) | Speedup |
|------------|---------------------|--------------|---------|
| 1 000 entries | 2.56 ms | 0.25 ms | 10× |
| 5 000 entries | 14.04 ms | 0.40 ms | 36× |
| 10 000 entries | 28.15 ms | 0.41 ms | **69×** |

**Hybrid search end-to-end (A2 — HNSW + BM25 + LRU cache):**

| Store size | Before (HNSW only, no cache) | After (HNSW + cache) | Speedup |
|------------|------------------------------|----------------------|---------|
| 100 entries | 14.73 ms | 0.96 ms | 15× |
| 1 000 entries | 111.72 ms | 2.37 ms | **47×** |
| 5 000 entries | 535.24 ms | 3.69 ms | **145×** |

Latency is now dominated by HNSW graph traversal and BM25 CPU scoring — no disk reads after cold start.

### MemBench Evaluation

Evaluated on [MemBench](https://github.com/import-myself/Membench) (`simple.json`, 4-choice MCQ, 100 trajectories):

| Version | Description | Accuracy | Recall@10 |
|---------|-------------|----------|-----------|
| v2-baseline | Substring search, recency fallback | 49.0% | 8.0% |
| v2-embedding | `text-embedding-3-small` cosine search | 94.0% | 100.0% |
| v3-hnsw-hybrid | HNSW + hybrid search + LRU cache | **94.0%** | **100.0%** |

The jump from v2-baseline to v2-embedding (+45pp accuracy, +92pp Recall@10) was entirely due to resolving vocabulary mismatch — substring search could not handle paraphrased questions (e.g. "When was Landon born?" vs. stored "his birthday is on August 23rd"). v3 maintains the same accuracy with significantly lower latency.

---

## 🗺️ Planning System

The planning loop activates when the agent classifies a request as requiring multiple distinct stages, cross-file coordination, or design decisions. Simple single-turn requests bypass planning entirely.

### Architecture

```
Goal
 ├── Subgoal 1
 │    ├── Task 1.1
 │    └── Task 1.2
 ├── Subgoal 2
 │    └── Task 2.1
 └── Subgoal 3
      └── Task 3.1
```

Tasks within each subgoal are generated lazily — just before execution — so later subgoals can incorporate findings from earlier ones. This avoids planning all tasks upfront when the plan is likely to change.

### Execution Flow

1. **Goal decomposition** — LLM generates subgoals from the top-level goal
2. **Lazy task planning** — tasks for each subgoal generated just before execution
3. **Execution loop** — agentic tool-call loop with up to 25 turns per subgoal
4. **Verification** — three modes: automated rule check / LLM-as-judge / human escalation
5. **Reflection** — if verification fails, the agent reflects and replans before retrying

---

## 🔌 Plugin System

Plugins are JSON manifests describing tool schemas and pointing to a handler file. The `ToolExecutor` validates parameters against JSON Schema, enforces timeouts (`Promise.race`, 30s default), and routes dangerous tools through a confirmation callback before execution.

**Minimal plugin manifest:**

```json
{
  "id": "my-plugin",
  "version": "1.0.0",
  "tools": [{
    "name": "my_tool",
    "description": "Does something useful",
    "dangerous": false,
    "parameters": {
      "type": "object",
      "properties": { "input": { "type": "string" } },
      "required": ["input"]
    },
    "handler": "handlers.js"
  }]
}
```

Place the manifest and handler in `~/.my-agent/plugins/my-plugin/` and it will be auto-discovered at startup.

---

## 🛠️ Development

```bash
npm test                                  # Run all 1481+ tests
npm run test:coverage                     # Coverage report
npm run build                             # Compile TypeScript
npm run lint                              # ESLint (flat config, strict TS rules)

npx vitest run tests/memory               # Memory module tests only
npx vitest run tests/planning             # Planning module tests only
npx vitest bench                          # Performance benchmarks
```

---

## ☁️ Supported Providers

| Provider | SDK | Notes |
|----------|-----|-------|
| `anthropic` | Anthropic SDK | Claude model series |
| `openai` | OpenAI SDK | GPT model series |
| `kimi` | OpenAI SDK (compatible) | Moonshot AI |

Additional providers can be added in `providers.json` without modifying source code.

---

## 📚 Documentation

- [Architecture](docs/reference/ARCHITECTURE.md) — system design, component diagram, key decisions
- [Performance Benchmarks](docs/bench.md) — A1–A5 benchmark results with before/after comparisons
- [MemBench Results](docs/membench-results.md) — retrieval accuracy evaluation across versions

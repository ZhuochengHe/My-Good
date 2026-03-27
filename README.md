# 🤖 my-agent

[中文版](./README.zh-CN.md)

<div align="center">

**Your Personal AI Terminal Assistant** 💬✨

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥20-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Test-Vitest-6E9F18?style=flat-square)](https://vitest.dev/)

*Chat, Work, Remember — AI Assistant Built from Scratch in TypeScript*

</div>

---

## 🌟 Key Features

### 🛠️ **Multi-Tool Collaboration**
- 📁 **File Operations** — Read/write files, browse directories
- 💻 **Command Line** — Execute shell commands (with safety confirmation)
- 🌐 **Web Search** — DuckDuckGo search, no API key required
- 🧠 **Intelligent Memory** — Persistent memory across sessions
- 📋 **Task Planning** — Auto-decompose and execute complex tasks

### 🎯 **Multi-Model Support**
- 🔥 **Claude** (Anthropic) — Strongest reasoning capabilities
- 💡 **GPT** (OpenAI) — Stable and reliable
- 🚀 **Kimi** (Moonshot) — Optimized for Chinese
- 🔧 **Custom** — Any OpenAI-compatible API

### ⚡ **Smart Experience**
- 🎬 **Real-time Streaming** — Typewriter effect output
- 🔒 **Safety Confirmation** — Dangerous operations require confirmation
- 📊 **Session Management** — Complete session lifecycle
- 🔌 **Plugin Extension** — Easy to add new features

---

## 🚀 Quick Start

```bash
# 📦 Install dependencies
npm install

# 🔧 One-click install (recommended)
./install.sh   # Build and install to ~/.local/bin

# ⚙️ Initialize configuration
my-agent setup # Select provider, input API key, choose model
```

> 💡 `install.sh` automatically builds the project, creates symlinks, and checks PATH configuration. Just re-run after code updates!

### 📝 Manual Installation
```bash
npm run build
# Add ./bin/my-agent to PATH
```

---

## 💬 Usage Guide

### 🎯 Basic Chat
```bash
my-agent chat                           # 🔄 Interactive REPL
my-agent chat -m "Summarize README.md"  # 📋 Single message mode
my-agent chat -s <session-id>           # 📂 Continue previous session
```

### 📊 Session Management
```bash
my-agent session list                   # 📋 List all sessions
my-agent session list -t debugging      # 🔍 Filter by tags
my-agent session show <id> --trace      # 📈 View detailed metrics
my-agent session delete <id>            # 🗑️ Delete session
```

### ⚙️ Other Commands
```bash
my-agent plugin list                    # 🔌 View loaded plugins
my-agent settings set behavior.maxTurns 30
my-agent model update                   # 🔄 Get latest model list
```

---

## 🧠 Memory System

> 🎯 **Goal**: Make AI truly remember you, not start over every time

my-agent has a **four-layer memory structure** that automatically builds persistent memory:

### 📚 Memory Types

| 🏷️ Type         | 💾 Storage Content           | ⏰ Validity | 🎯 Use Case |
| -------------- | ---------------------------- | -------- | ---------- |
| `preference`   | User preferences, response style, behavior rules | 🚫 Permanent | 💯 Always injected |
| `experiential` | Workflows, tips, project experience | 🚫 Permanent | 🔍 Search on demand |
| `semantic`     | Technical architecture, domain knowledge | 🚫 Permanent | 🔍 Search on demand |
| `episodic`     | Current tasks, decisions, bugs | 📅 With TTL | 🕐 Last 5 entries |

### 🎯 Intelligent Retrieval

Uses **triple signal hybrid scoring**:

```
📊 Total Score = 0.75×Semantic Similarity + 0.25×Keyword Match + 0.10×Tag Overlap
```

- 🔍 **Semantic Search**: Vector similarity based on `text-embedding-3-small`
- 🔤 **Keyword Matching**: BM25 algorithm with saturation parameter k₁=1.2
- 🏷️ **Tag Enhancement**: Smart tag matching, avoiding hard filtering

### 📈 Performance

In [MemBench](https://github.com/import-myself/Membench) benchmark tests:

| 📅 Date     | 🔢 Version       | 🎯 Accuracy  | 🔍 Recall@10 | 💡 Improvement |
| ---------- | ------------ | --------- | ----------- | --------- |
| 2026-03-23 | v2-baseline  | 49.0%     | 8.0%        | Baseline |
| 2026-03-24 | v2-embedding | **94.0%** | **100.0%**  | **+45pp** |

> 🚀 **45 percentage points** accuracy improvement! Huge leap from lexical matching to semantic search.

---

## 📋 Planning System

### 🎯 When It Activates

Intelligent complexity detection:
- ✅ **Simple tasks** — Execute directly, no planning needed
- 🎯 **Complex tasks** — Auto-enable planning mode (3+ stages, multiple files, design decisions)

### 🗺️ Three-Layer Architecture

```
🎯 Goal: "Build REST API with authentication and tests"
  │
  ├─ 📝 sg-1: "Design API architecture and routes"
  │     ├─ ✅ Create OpenAPI spec
  │     └─ ✅ Define request/response types
  │
  ├─ 🔐 sg-2: "Implement authentication middleware"
  │     ├─ ✅ JWT validation handler
  │     └─ ✅ Route authentication config
  │
  └─ 🧪 sg-3: "Write integration tests"
        └─ ✅ Authentication failure path coverage
```

### 🔄 Execution Flow

1. **🎯 Pre-planning** — Goal + subgoals
2. **📝 Lazy task loading** — Plan specific tasks just before execution
3. **⚡ Loop execution** — With validation and retry mechanisms
4. **✅ Result validation** — Automatic/LLM/Human verification

---

## 🔌 Plugin Ecosystem

| 🔌 Plugin       | 🛠️ Tool Set   | 💡 Description                   |
| -------------- | ---------- | ------------------------------ |
| `file-ops`     | 📁 File Operations | Read/write files, directory browsing |
| `shell`        | 💻 Command Line | Execute shell commands (requires confirmation) |
| `web-search`   | 🌐 Web Search | DuckDuckGo search, webpage fetching |
| `memory`       | 🧠 Memory Management | Complete memory CRUD operations |
| `planning`     | 📋 Task Planning | Planning and execution of complex tasks |

### 🚀 Create Plugin

```json
{
  "id": "my-plugin",
  "version": "1.0.0",
  "tools": [{
    "name": "my_tool",
    "description": "Do useful things",
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

---

## 🛠️ Development Guide

```bash
# 🧪 Run tests (1481+ test cases)
npm test

# 📊 Test coverage
npm run test:coverage

# 🔨 Build project
npm run build

# 🔍 Code linting
npm run lint

# 🎯 Module testing
npx vitest run tests/memory    # Memory module only
npx vitest run tests/planning  # Planning module only
```

---

## 🏢 Supported Providers

| 🏢 Provider    | 🔗 SDK         | 📝 Notes                    |
| ----------- | ------------- | ------------------------- |
| `anthropic` | Anthropic SDK | Claude model series       |
| `openai`    | OpenAI SDK    | GPT model series          |
| `kimi`      | OpenAI SDK    | Moonshot AI (OpenAI compatible) |

> 🔧 **Add custom providers**: Just add configuration in `providers.json`, no code modification needed!

---

## 📚 Learn More

- 🏗️ **Architecture Docs** — [`docs/reference/ARCHITECTURE.md`](docs/reference/ARCHITECTURE.md)
- 📊 **Benchmark Tests** — [`docs/benchmark-adaptation.md`](docs/benchmark-adaptation.md)
- 📈 **Performance Results** — [`docs/bench-results.md`](docs/bench-results.md)

---

<div align="center">

### 🌟 If this project helps you, please give it a Star!

**[⭐ Click here to star my-agent](https://github.com/ZhuochengHe/my-agent)**

*Made with ❤️ by TypeScript enthusiasts*

</div>
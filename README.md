# my-agent

A personal AI assistant that runs in your terminal. You talk to it, it uses tools to get things done — reading files, running commands, searching the web — and remembers your conversation across sessions.

Built from scratch in TypeScript with a custom agent loop. No frameworks, full control.

## What it does

- Executes multi-step tasks autonomously using tool calling
- Works with Claude (Anthropic), GPT (OpenAI), and Kimi (Moonshot AI)
- Persists conversation history across restarts
- **Persistent memory across sessions** — at session end, a consolidation pipeline extracts structured facts via `gpt-4o-mini`, embeds them with `text-embedding-3-small`, deduplicates by cosine similarity, and stores them. Future sessions inject relevant memories and retrieve more on demand via embedding search.
- Streams responses in real time with typewriter effect
- Collapsible tool call history — see what the agent did, expand for full args and output
- Dangerous tool confirmation prompt built into the TUI (no readline conflicts)
- Web search via DuckDuckGo — no API key needed
- Extensible via plugins — drop in a `plugin.json` and it just works

## Install

```bash
npm install
./install.sh   # builds and installs my-agent to ~/.local/bin
my-agent setup # pick a provider, enter your API key, select a model
```

`install.sh` builds the project, symlinks `my-agent` to `~/.local/bin`, and checks that directory is on your PATH. Re-run it whenever you pull new changes.

> **Manual install:** if you prefer not to use the script, run `npm run build` then add `./bin/my-agent` to your PATH manually.

## Usage

```bash
my-agent chat                            # start a conversation
my-agent chat -m "summarize README.md"  # one-shot
my-agent chat -s <session-id>           # resume a previous session
```

### Managing sessions

```bash
my-agent session list
my-agent session list -t debugging      # filter by tag
my-agent session show <id> --trace      # with per-turn token metrics
my-agent session delete <id>
```

### Other commands

```bash
my-agent plugin list                    # see loaded plugins and their tools
my-agent settings set behavior.maxTurns 30
my-agent model update                   # fetch latest models from provider APIs
```

## Plugins included

| Plugin | Tools |
|---|---|
| `file-ops` | `read_file`, `write_file`, `list_directory` |
| `shell` | `shell_exec` (linux/darwin) |
| `web-search` | `web_search`, `fetch_url` |
| `memory` | `save_memory`, `search_memory`, `update_memory`, `delete_memory`, `list_memories` |

## Development

```bash
npm test              # 1435+ tests across 55 files
npm run test:coverage
npm run build
npm run lint
```

See [docs/reference/ARCHITECTURE.md](docs/reference/ARCHITECTURE.md) for design decisions, source layout, memory module, and interface definitions.

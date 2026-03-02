# my-agent

A personal AI assistant that runs in your terminal. You talk to it, it uses tools to get things done — reading files, running commands, searching the web — and remembers your conversation across sessions.

Built from scratch in TypeScript with a custom agent loop. No frameworks, full control.

## What it does

- Executes multi-step tasks autonomously using tool calling
- Works with Claude (Anthropic), GPT (OpenAI), and Kimi (Moonshot AI)
- Persists conversation history across restarts
- Streams responses in real time
- Extensible via plugins — drop in a `plugin.json` and it just works

## Install

```bash
npm install
npm run build
./bin/my-agent setup   # pick a provider, enter your API key, select a model
```

## Usage

```bash
./bin/my-agent chat                      # start a conversation
./bin/my-agent chat -m "summarize README.md"   # one-shot
./bin/my-agent chat -s <session-id>      # resume a previous session
```

### Managing sessions

```bash
./bin/my-agent session list
./bin/my-agent session list -t debugging        # filter by tag
./bin/my-agent session show <id> --trace        # with per-turn token metrics
./bin/my-agent session delete <id>
```

### Other commands

```bash
./bin/my-agent plugin list               # see loaded plugins and their tools
./bin/my-agent settings set behavior.maxTurns 30
./bin/my-agent model update              # fetch latest models from provider APIs
```

## Plugins included

| Plugin | Tools |
|---|---|
| `file-ops` | `read_file`, `write_file`, `list_directory` |
| `shell` | `shell_exec` (linux/darwin) |
| `web-search` | `web_search`, `fetch_url` |

## Development

```bash
npm test              # 1095 tests across 46 files
npm run test:coverage
npm run build
npm run lint
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions, source layout, and interface definitions.

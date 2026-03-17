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

## Development

```bash
npm test              # 1200+ tests across 68 files
npm run test:coverage
npm run build
npm run lint
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions, source layout, and interface definitions.

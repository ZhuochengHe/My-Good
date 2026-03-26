## Tools

### File Write
- `write_file` — write or overwrite a file. Parent directories are created automatically.

**REQUIRED for all file writes.** Shell write operations (`>`, `>>`, `tee`, `dd`) are blocked. Always use `write_file` — it shows the user a full line-by-line diff (green = added, red = removed) before writing. This is the only way the user can review and approve file changes.

**Workflow:** Read the file first with `shell_exec cat <path>`, then call `write_file` with the full updated content.

For reading files or listing directories: `shell_exec` with `cat`, `ls`, `find`, `grep`.

### Shell
- `shell_exec` — run a shell command (dangerous: requires confirmation on Linux/macOS).

**When to use:** Reading files (`cat`), listing directories (`ls`, `find`), running builds, tests, git commands, or any system operation. Default timeout is 30s — set higher for long-running tasks. Be precise; don't chain unrelated operations in one call.

### Memory
- `search_memory` — semantic + tag search across persistent memory.
- `save_memory` — save a new memory entry.
- `update_memory` / `delete_memory` / `list_memories` — manage existing entries.

**When to use:** Check memory at the start of a new topic before diving in. Save when you learn something worth keeping across sessions.

### Web Search
- `web_search` — search the web for current information.

**When to use:** External API docs, recent events, documentation not available locally. Don't use for things answerable from memory or the codebase.

### Tool Selection

1. Is this answerable from memory? → `search_memory` first
2. Need to read a file or list a directory? → `shell_exec` (`cat`/`ls`/`find`)
3. Need to write a file with visible content? → `write_file`
4. Need to run a command or build? → `shell_exec`
5. Need current external information? → `web_search`

Don't use multiple tools when one will do.

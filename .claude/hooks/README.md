# Claude Code Hooks

This directory contains hooks that automate development workflows.

## Available Hooks

### post-session-summarize.js

**Purpose:** Generate personalized session summaries after each Claude Code session

**Trigger:** Automatically when session closes (and manual `/summarize` command)

**Output:** Markdown diary entry in `docs/sessions/YYYY-MM-DD_SessionName.md`

**What it captures:**
- Design ideas and decisions explored
- Files created/modified during session
- Development notes from `docs/DEV_LOG.md`
- Session outcome and next steps

**Example output:** See `docs/sessions/2026-01-28_Project_Structure.md`

## How Hooks Work

1. **Session naming:** Use `/rename "Session Name"` to name your session
2. **Automatic save:** When you close Claude Code, the hook runs
3. **Summary generated:** Creates markdown file with narrative + data
4. **Stored in:** `docs/sessions/` folder

## Manual Execution

```bash
node .claude/hooks/post-session-summarize.js
```

Or through Claude Code CLI:
```bash
claude-code /summarize
```

## Hook Configuration

Edit `hooks.json` to enable/disable hooks:

```json
{
  "hooks": [
    {
      "event": "session-close",
      "name": "post-session-summarize",
      "script": "./post-session-summarize.js",
      "enabled": true
    }
  ]
}
```

## Tips for Good Summaries

### During Session
- Update `docs/DEV_LOG.md` with:
  - Key decisions made
  - What was implemented
  - Blockers encountered
  - Next priorities
- Reference other files instead of duplicating content

### Session Naming
Use descriptive names:
- ❌ Bad: "Work"
- ✅ Good: "Agent Loop Implementation"
- ✅ Good: "Config System & Testing Setup"

### Referencing Documentation
In DEV_LOG.md, write:
```
- See docs/ARCHITECTURE.md § 3 for provider details
```

NOT:
```
The provider interface is defined as follows:
  interface ModelProvider {
    ...200 lines of code...
  }
```

## Extending Hooks

The `post-session-summarize.js` script is designed to be hackable:

1. **Change summary template:** Edit `createSummary()` function
2. **Add custom sections:** Insert new sections in the markdown
3. **Change what's captured:** Modify `getGitChanges()`, `getSessionNotes()`, etc.

## Troubleshooting

### Hook doesn't run on session close
- Check that `hooks.json` exists and has `"enabled": true`
- Verify session name is set via `/rename`

### Summary is missing information
- Make sure `docs/DEV_LOG.md` has today's entries
- Check that files referenced exist

### Permission errors
```bash
chmod +x .claude/hooks/post-session-summarize.js
```

---

See `.claude/hooks/SESSION_SUMMARY_GUIDE.md` for detailed guide on session summaries.

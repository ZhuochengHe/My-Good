---
name: session-summary
description: "Generate personalized session summaries capturing design decisions, what was built, and next steps. Automatically saves to docs/sessions/ as markdown diary entries."
metadata: {"moltbot":{"emoji":"📝"}}
---

# Session Summary Skill

Use `/session-summary` to generate a personalized narrative summary of the current work session.

## What It Captures

- **Design ideas & decisions** explored during the session
- **Files created/modified** via git status
- **Development notes** from docs/DEV_LOG.md
- **Session outcome** and what's ready for next time
- **Next steps** and priorities

## Usage

```bash
# Generate summary for current session
/session-summary
```

The summary will be saved to:
```
docs/sessions/YYYY-MM-DD_SessionName.md
```

## Requirements

- Session must be named via `/rename "Session Name"`
- Best results when docs/DEV_LOG.md is kept updated during session
- Git repository with changes to track

## Output Format

The generated markdown includes:
- 🎯 What We Did - Narrative summary
- 💡 Design Ideas & Decisions - Key architectural choices
- 🔨 What We Built - Files changed and created
- 📚 Resources & References - Links to documentation
- ✅ Session Outcome - Status and what's ready
- 🚀 For Next Session - Immediate next steps

## Tips for Better Summaries

### During Your Session
Update `docs/DEV_LOG.md` with:
- Key decisions made
- What was implemented
- Blockers encountered
- Next priorities

### Session Naming
Use descriptive names:
- ❌ Bad: "Work"
- ✅ Good: "Agent Loop Implementation"
- ✅ Good: "Config System & Testing Setup"

### Reference, Don't Duplicate
In DEV_LOG.md, write:
```
- See docs/ARCHITECTURE.md § 3 for provider details
```

NOT:
```
The provider interface is defined as follows:
  interface ModelProvider { ...200 lines... }
```

## Manual Execution

You can also run the script directly:

```bash
node scripts/session-summary.js
```

Or with a custom session name:
```bash
CLAUDE_SESSION_NAME="My Session" node scripts/session-summary.js
```

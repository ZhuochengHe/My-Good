# Session Summary Guide

## Overview

After each Claude Code session, a summary is automatically generated and saved to `docs/sessions/` as a personalized diary entry.

The summary captures:
- **Design ideas** explored during the session
- **What we built** (file changes, implementations)
- **Attempts & trials** (from DEV_LOG.md)
- **Session outcome** (what's complete, what's next)

## How It Works

### Automatic Trigger
When you close Claude Code, the hook automatically:
1. Reads your most recent DEV_LOG.md entries
2. Captures git changes
3. Identifies referenced files
4. Generates a markdown summary with personal narrative

### Manual Trigger
```bash
claude-code /summarize
```

Or directly:
```bash
node .claude/hooks/post-session-summarize.js
```

## Session Naming

Use the `/rename` command to name your session:
```bash
/rename "Building the Agent Loop"
```

The hook uses this name in the generated filename:
```
docs/sessions/2026-01-28_Building_the_Agent_Loop.md
```

## Maintaining Good Summaries

### Update DEV_LOG.md During Session

Add entries that capture:
- **Design Decisions:** Why we chose approach X over Y
- **Work Completed:** What was implemented
- **Blockers:** What slowed us down
- **Next Steps:** What's the next priority

Example format in DEV_LOG.md:
```markdown
## 2026-01-28

### Session Summary
**Focus:** [Main objective]

### Decisions Made
1. **[Topic]:** [Decision]
   - Rationale: [Why]

### Work Completed
- [x] Task 1
- [x] Task 2

### Next Steps
1. Step 1
2. Step 2
```

### Reference Files Instead of Duplicating

In DEV_LOG.md, write:
```markdown
### Architecture Updates
- Updated ARCHITECTURE.md with complete interface definitions
- See docs/ARCHITECTURE.md for details
```

NOT:
```markdown
### Architecture Updates
Here is the complete interface definition for Agent:
interface Agent {
  ...very long content...
}
```

This keeps:
- DEV_LOG.md concise (daily notes)
- docs/sessions summaries focused on narrative
- ARCHITECTURE.md as the single source of truth

## Session Summary Structure

```markdown
# Session: [Name]

**Date:** [Auto-filled]

---

## 🎯 What We Did
Personal narrative of what was accomplished

## 💡 Design Ideas & Decisions
Key decisions with brief explanations and file references

## 🔨 What We Built
Git changes formatted as a list with emojis

## 📚 Resources & References
Links to related documentation files

## ✅ Session Outcome
- Status summary
- What's ready
- Next steps
- Key insights

## 🚀 For Next Session
Immediate action items for next time
```

## File Organization

```
docs/
├── ARCHITECTURE.md        # Technical reference (detailed)
├── ROADMAP.md            # Project timeline (detailed)
├── DEV_LOG.md            # Daily notes (concise, evolving)
├── LLM_CONTEXT.md        # Quick reference for LLMs
└── sessions/             # Diary entries (personalized narrative)
    ├── 2026-01-28_Project_Structure.md
    ├── 2026-01-29_Config_System.md
    └── 2026-01-30_Agent_Loop.md
```

## Example Session Summary

See `2026-01-28_Project_Structure.md` for a real example generated during the architecture design session.

## Customizing the Hook

Edit `.claude/hooks/post-session-summarize.js` to:
- Change summary template
- Modify how changes are captured
- Add custom sections

The hook is designed to be readable and hackable!

---

**Pro tip:** Review session summaries periodically to see project evolution and remind yourself of design rationale.

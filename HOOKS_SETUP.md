# Session Summary Hook Setup

## What Was Created

A post-session hook that automatically generates personalized session summaries after each Claude Code session.

### Files Created

```
.claude/hooks/
├── post-session-summarize.js    # Main hook implementation
├── hooks.json                   # Hook configuration
├── README.md                    # Hook documentation
└── SESSION_SUMMARY_GUIDE.md     # Detailed usage guide

docs/sessions/
└── 2026-01-28_Project_Structure.md  # Example summary from this session
```

## How It Works

**Automatic triggers:**
1. When you close Claude Code → generates summary automatically
2. Manual command: `/summarize` → generates summary on demand

**Data collection:**
- Reads latest entries from `docs/DEV_LOG.md`
- Captures git file changes
- Identifies referenced documentation files
- Generates personal narrative (not just technical report)

**Output:**
Markdown diary entry like:
```
docs/sessions/2026-01-28_Project_Structure.md
```

Stored for future reference with:
- 🎯 What We Did (narrative)
- 💡 Design Ideas & Decisions
- 🔨 What We Built (file changes)
- 📚 Resources & References
- ✅ Session Outcome
- 🚀 For Next Session

## Key Features

1. **Personal narrative style** - Not a dry technical report
2. **File references** - Links to ARCHITECTURE.md instead of duplicating content
3. **Dev log integration** - Automatically pulls from your DEV_LOG.md entries
4. **Git-aware** - Shows what files were created/modified with emojis
5. **Session naming** - Use `/rename "Session Name"` for descriptive filenames

## Usage

### Session Naming
```bash
/rename "Building the Config System"
```

This creates:
```
docs/sessions/2026-01-28_Building_the_Config_System.md
```

### Maintaining Good Summaries

Update `docs/DEV_LOG.md` during work:
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
```

### Reference vs. Duplicate

**Reference (good):**
```markdown
### Architecture
- See docs/ARCHITECTURE.md § 4 for complete interface definitions
```

**Duplicate (bad):**
```markdown
### Architecture
Here is the Agent interface:
  interface Agent {
    run(...): Promise<AgentRunResult>;
    stream(...): AsyncIterable<AgentEvent>;
    getTools(): ToolDefinition[];
  }
```

## Directory Structure

```
project/
├── docs/
│   ├── ARCHITECTURE.md      # Detailed technical reference
│   ├── ROADMAP.md          # Project timeline
│   ├── DEV_LOG.md          # Daily notes (evolving)
│   ├── LLM_CONTEXT.md      # Quick reference
│   ├── TODO.md             # Task tracking
│   └── sessions/           # 📔 Session summaries (diary)
│       ├── 2026-01-28_Project_Structure.md
│       ├── 2026-01-29_Config_System.md
│       └── ...
└── .claude/
    └── hooks/
        ├── post-session-summarize.js
        ├── hooks.json
        ├── README.md
        └── SESSION_SUMMARY_GUIDE.md
```

## Next Session

When you start the next session:

1. **Rename the session:**
   ```bash
   /rename "Config System Implementation"
   ```

2. **Update DEV_LOG.md** with daily notes

3. **Reference files** instead of duplicating:
   ```markdown
   - See docs/ARCHITECTURE.md § 8 for config structure
   ```

4. **On session close**, the hook automatically:
   - Reads your DEV_LOG entries
   - Captures what files changed
   - Generates personalized summary
   - Saves to `docs/sessions/YYYY-MM-DD_SessionName.md`

## Customization

The hook is fully customizable. Edit `.claude/hooks/post-session-summarize.js`:

- **Change summary template:** Edit `createSummary()` function
- **Add custom sections:** Insert new markdown sections
- **Modify data collection:** Change how git changes are formatted

The script is readable and well-commented for easy hacking.

## Benefits

✅ **For you:**
- Review design rationale months later
- See project evolution over time
- Personal record of how you built things

✅ **For team/LLMs:**
- LLMs can read summaries to understand design context
- Clear narrative of decision-making
- Easy to onboard new people

✅ **For documentation:**
- Links between summary and technical docs
- Single source of truth (no duplication)
- Living history of the project

---

**Documentation:**
- Hook guide: `.claude/hooks/SESSION_SUMMARY_GUIDE.md`
- Hook source: `.claude/hooks/post-session-summarize.js` (readable, hackable)
- Example: `docs/sessions/2026-01-28_Project_Structure.md`

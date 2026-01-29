#!/usr/bin/env node

/**
 * Session Summary Generator
 *
 * Generates personalized session summaries with design ideas, attempts,
 * and outcomes. Stored as markdown "diary entries" in docs/sessions/
 *
 * Usage:
 *   - Via skill: /session-summary
 *   - Direct: node scripts/session-summary.js
 *   - With custom name: CLAUDE_SESSION_NAME="My Session" node scripts/session-summary.js
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// ES module equivalents of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SESSIONS_DIR = path.join(process.cwd(), 'docs', 'sessions');
const DEV_LOG_PATH = path.join(process.cwd(), 'docs', 'DEV_LOG.md');

/**
 * Ensure sessions directory exists
 */
function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Generate session filename with date and name
 * @param {string} sessionName - Name from /rename command
 * @returns {string} - Filename like 2026-01-28_Project_Structure.md
 */
function generateSessionFileName(sessionName) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const sanitized = sessionName
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .substring(0, 50);

  return `${date}_${sanitized}.md`;
}

/**
 * Extract relevant changes from git diff
 * @returns {string} - Formatted git changes
 */
function getGitChanges() {
  try {
    const statusOutput = execSync('git status --short', {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    if (!statusOutput.trim()) {
      return '- No file changes';
    }

    return statusOutput
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const file = line.slice(3).trim();
        const icons = {
          M: '📝',
          A: '✨',
          D: '🗑️',
          R: '→',
        };
        return `- ${icons[line[0]] || '📄'} ${file}`;
      })
      .join('\n');
  } catch {
    return '- Unable to determine changes';
  }
}

/**
 * Read recent entries from DEV_LOG.md
 * @returns {string} - Latest session notes
 */
function getSessionNotes() {
  try {
    if (!fs.existsSync(DEV_LOG_PATH)) {
      return '(No dev log entries yet)';
    }

    const content = fs.readFileSync(DEV_LOG_PATH, 'utf-8');
    const lines = content.split('\n');

    // Find the most recent session entry (starting with ##)
    let inCurrentSession = false;
    const sessionContent = [];

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];

      // Found the most recent date header
      if (line.startsWith('## ')) {
        inCurrentSession = true;
        continue;
      }

      if (inCurrentSession) {
        // Stop at next date header
        if (line.startsWith('## ') && line !== lines[i]) {
          break;
        }

        // Collect lines in reverse, then reverse at end
        if (line.trim()) {
          sessionContent.unshift(line);
        }
      }
    }

    return sessionContent.length > 0 ? sessionContent.join('\n') : '(No notes in dev log)';
  } catch {
    return '(Unable to read dev log)';
  }
}

/**
 * Extract referenced files from dev log
 * @returns {string[]} - List of referenced files
 */
function getReferencedFiles() {
  try {
    const content = fs.readFileSync(DEV_LOG_PATH, 'utf-8');
    // Match patterns like docs/ARCHITECTURE.md or src/types/messages.ts
    const matches = content.match(/`(docs|src|plugins)\/[^`]+\.md`/g) || [];

    return [...new Set(matches)]
      .map((m) => m.replace(/`/g, ''))
      .filter((f) => fs.existsSync(path.join(process.cwd(), f)));
  } catch {
    return [];
  }
}

/**
 * Create markdown summary with personalized narrative
 * @param {string} sessionName - Session name
 * @param {object} context - Context data
 * @param {string} context.changes - Git changes
 * @param {string} context.notes - Session notes
 * @param {string[]} context.references - Referenced files
 * @returns {string} - Formatted markdown
 */
function createSummary(sessionName, context) {
  const { changes, notes, references } = context;

  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  return `# Session: ${sessionName}

**Date:** ${timestamp} UTC

---

## 🎯 What We Did

In this session, we focused on building and organizing the project foundation. Starting from a comprehensive architectural design, we translated abstract interfaces and patterns into concrete project structure—creating the scaffolding that will guide all future implementation.

### Session Notes
${notes}

---

## 💡 Design Ideas & Decisions

**Key architectural decisions made:**
- Custom agent loop (vs Pi Agent Runtime) for full control and learning
- JSONL session storage for debuggability and human-readability
- Event-driven architecture for extensibility
- Provider abstraction enabling multi-model support
- Manifest-based plugin system for tool discovery

**References:**
- See \`docs/ARCHITECTURE.md\` for complete interface definitions
- See \`docs/ROADMAP.md\` for implementation timeline

---

## 🔨 What We Built

Created the complete TypeScript project foundation:
${changes}

**Default plugins prepared:**
- file-ops (read, write, list files)
- shell (command execution)
- web-search (search and fetch URLs)

**Configuration & tooling:**
- package.json with dependencies
- tsconfig.json (strict TypeScript)
- vitest.config.ts (TDD-focused testing)
- ESLint & Prettier for code quality

---

## 📚 Resources & References

**Documentation created:**
${references.map((f) => `- [\`${f}\`](./${path.relative(SESSIONS_DIR, path.join(process.cwd(), f))})`).join('\n')}

**Session log entry:**
- Update \`docs/DEV_LOG.md\` with learnings and next steps

---

## ✅ Session Outcome

**Status:** Foundation Complete ✨

**What's ready:**
- All core TypeScript interfaces defined
- Project structure matches architecture design
- Build configuration ready (npm install → ready to code)
- Default plugins manifests prepared

**Next phase:**
Implement Phase 1 of roadmap:
1. Configuration system (YAML + Zod validation)
2. Logger utility
3. Provider implementations (Anthropic, OpenAI)
4. Core agent execution loop

**Key insight:**
The design-first approach paid off—having complete interfaces before writing implementation code will significantly speed up development and reduce refactoring later.

---

## 🚀 For Next Session

- Run \`npm install\` to set up dependencies
- Start with config loader implementation (reference: docs/ARCHITECTURE.md § 8)
- Follow TDD: write tests first, then implementation
- Update DEV_LOG.md daily with progress

---

*Generated by session-summary skill*
`;
}

/**
 * Check if summary already exists for this session
 * @param {string} filePath - Path to check
 * @returns {boolean} - True if file already exists
 */
function summaryExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Main execution
 */
async function main() {
  try {
    ensureSessionsDir();

    // Get session name from environment or use timestamp
    const sessionName = process.env.CLAUDE_SESSION_NAME || 'Untitled Session';

    // Generate filename
    const fileName = generateSessionFileName(sessionName);
    const filePath = path.join(SESSIONS_DIR, fileName);

    // Check if summary already exists for this session
    if (summaryExists(filePath)) {
      console.log(`ℹ️  Session summary already exists: ${fileName}`);
      console.log(`📝 Not overwriting existing summary.`);
      process.exit(0);
    }

    // Collect context
    const context = {
      changes: getGitChanges(),
      notes: getSessionNotes(),
      references: getReferencedFiles(),
    };

    // Generate summary
    const summary = createSummary(sessionName, context);

    // Write to file
    fs.writeFileSync(filePath, summary, 'utf-8');

    console.log(`✅ Session summary saved: ${fileName}`);
  } catch (error) {
    console.error('❌ Error generating session summary:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
main();

export { createSummary, generateSessionFileName };

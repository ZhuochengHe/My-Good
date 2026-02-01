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
 * Extract session notes with proper structure
 * @returns {string} - Latest session notes
 */
function getSessionNotes() {
  try {
    if (!fs.existsSync(DEV_LOG_PATH)) {
      return '(No dev log entries yet)';
    }

    const content = fs.readFileSync(DEV_LOG_PATH, 'utf-8');
    const lines = content.split('\n');

    // Find the most recent entry (everything after last ## date header)
    let lastHeaderIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('## ') && /^\## \d{4}-\d{2}-\d{2}/.test(lines[i])) {
        lastHeaderIdx = i;
        break;
      }
    }

    if (lastHeaderIdx === -1) {
      return '(No dated entries in dev log)';
    }

    // Collect content after the last date header until EOF or next date header
    const sessionContent = [];
    for (let i = lastHeaderIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      // Stop if we hit another date header
      if (line.startsWith('## ') && /^\## \d{4}-\d{2}-\d{2}/.test(line)) {
        break;
      }
      if (line.trim()) {
        sessionContent.push(line);
      }
    }

    if (sessionContent.length === 0) {
      return '(No notes in dev log)';
    }

    // Return first 30 lines of notes to avoid bloat, preserve structure
    return sessionContent.slice(0, 30).join('\n');
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
 * Summarize session notes (extract focus/key points)
 * @param {string} notes - Full session notes from DEV_LOG
 * @returns {string} - Summary based on notes structure
 */
function summarizeNotes(notes) {
  if (notes.includes('(No notes in dev log)') || notes.includes('(Unable to read dev log)')) {
    return 'Session focused on implementation tasks.';
  }

  // Try to extract "Focus:" line if available
  const focusMatch = notes.match(/\*\*Focus:\*\*\s*([^\n]+)/);
  if (focusMatch) {
    return focusMatch[1].trim();
  }

  // Try to extract "### Session Summary" or similar
  const summaryMatch = notes.match(/#{2,4}\s*Session\s*Summary\s*\n([^\n]+)/i);
  if (summaryMatch) {
    return summaryMatch[1].trim();
  }

  // Fallback: use first meaningful line
  const lines = notes.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  return lines[0] || 'Session focused on implementation tasks.';
}

/**
 * Categorize and count git changes
 * @param {string} changes - Formatted git changes
 * @returns {object} - Change summary
 */
function categorizeChanges(changes) {
  const lines = changes.split('\n');
  const stats = {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
  };

  lines.forEach((line) => {
    if (line.includes('📝')) stats.modified++;
    if (line.includes('✨')) stats.added++;
    if (line.includes('🗑️')) stats.deleted++;
    if (line.includes('→')) stats.renamed++;
  });

  return { stats, lines: lines.filter((l) => l.trim()) };
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
  const { stats, lines: changeLines } = categorizeChanges(changes);
  const noteSummary = summarizeNotes(notes);

  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  // Build dynamic outcome based on actual work
  const totalChanges = changeLines.length;
  let statusEmoji = '✨';
  let statusText = 'In Progress';

  if (totalChanges === 0) {
    statusEmoji = '📝';
    statusText = 'Planning & Discussion';
  } else if (stats.added > stats.deleted && stats.added > stats.modified) {
    statusEmoji = '🚀';
    statusText = 'New Features Added';
  } else if (stats.modified > stats.added && stats.modified > stats.deleted) {
    statusEmoji = '🔧';
    statusText = 'Refinement & Fixes';
  } else if (stats.deleted > 0) {
    statusEmoji = '🧹';
    statusText = 'Cleanup & Refactoring';
  }

  const changesSummary =
    totalChanges > 0
      ? `${changeLines.slice(0, 5).join('\n')}${changeLines.length > 5 ? `\n- ...and ${changeLines.length - 5} more files` : ''}`
      : '- No file changes yet';

  const referencesList =
    references.length > 0
      ? references.map((f) => `- [\`${f}\`](./${path.relative(SESSIONS_DIR, path.join(process.cwd(), f))})`).join('\n')
      : '- None';

  return `# Session: ${sessionName}

**Date:** ${timestamp} UTC

---

## 🎯 What We Did

${noteSummary}

### Session Notes
${notes}

---

## 📊 Session Activity

**Files Changed:**
- Added: ${stats.added}
- Modified: ${stats.modified}
- Deleted: ${stats.deleted}
- Renamed: ${stats.renamed}

**Files touched this session:**
${changesSummary}

---

## 📚 References & Documentation

${referencesList}

---

## ✅ Session Status

**${statusEmoji} Status:** ${statusText}

**Outcome:** Session work captured. Review notes above for details and next steps.

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
function main() {
  try {
    ensureSessionsDir();

    // Get session name from environment (set by Claude Code when /session-summary is invoked)
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

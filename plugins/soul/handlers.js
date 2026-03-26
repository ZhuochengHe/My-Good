/**
 * Soul plugin handlers.
 *
 * Reads and updates ~/.my-agent/prompts/system-prompts/soul.md —
 * the agent's evolving self-description and character file.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SOUL_PATH = join(homedir(), '.my-agent', 'prompts', 'system-prompts', 'soul.md');

/**
 * @param {object} _args
 * @param {object} _context
 * @returns {Promise<{ content: string }>}
 */
export async function read_soul(_args, _context) {
  try {
    const content = await readFile(SOUL_PATH, 'utf-8');
    return { content };
  } catch {
    return { content: '(soul.md not found — it will be created on first update)' };
  }
}

/**
 * @param {{ content: string }} args
 * @param {object} _context
 * @returns {Promise<{ success: boolean; path: string }>}
 */
export async function update_soul(args, _context) {
  const { content } = args;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('content must be a non-empty string');
  }

  await mkdir(join(homedir(), '.my-agent', 'prompts', 'system-prompts'), { recursive: true });
  await writeFile(SOUL_PATH, content, 'utf-8');

  return { success: true, path: SOUL_PATH };
}

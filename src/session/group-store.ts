/**
 * JSON-based session group store implementation.
 * Stores groups in a single groups.json file.
 */

import type { SessionGroup, SessionGroupStore } from '../types/sessions.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

/** All groups stored in a single file */
interface GroupsFile {
  readonly groups: Record<string, SessionGroup>;
}

/**
 * JSON-based session group store.
 * Stores all groups in a single groups.json file for atomic updates.
 *
 * Example:
 *   const store = new JsonGroupStore('/path/to/sessions');
 *
 *   // Create a group
 *   await store.saveGroup({
 *     name: 'work-projects',
 *     sessionIds: ['session-1', 'session-2'],
 *     createdAt: Date.now(),
 *     updatedAt: Date.now()
 *   });
 *
 *   // List all groups
 *   const groups = await store.listGroups();
 */
export class JsonGroupStore implements SessionGroupStore {
  private readonly groupsFile: string;

  /**
   * Create a new JSON group store.
   *
   * @param sessionsDir - Directory containing session files (defaults to ~/.my-agent/sessions)
   */
  constructor(sessionsDir?: string) {
    const baseDir = sessionsDir ?? path.join(homedir(), '.my-agent', 'sessions');
    this.groupsFile = path.join(baseDir, 'groups.json');
  }

  /**
   * Load group by name.
   *
   * @param name - Group name
   * @returns Group object or null if not found
   */
  async loadGroup(name: string): Promise<SessionGroup | null> {
    try {
      const data = await this.readGroupsFile();
      return data.groups[name] ?? null;
    } catch (error) {
      // If file doesn't exist, return null
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Save group.
   *
   * Creates or updates a group in the groups file.
   *
   * @param group - Group to save
   */
  async saveGroup(group: SessionGroup): Promise<void> {
    const data = await this.readGroupsFile();
    const updatedData: GroupsFile = {
      groups: {
        ...data.groups,
        [group.name]: group,
      },
    };
    await this.writeGroupsFile(updatedData);
  }

  /**
   * List all groups.
   *
   * @returns Array of all groups
   */
  async listGroups(): Promise<readonly SessionGroup[]> {
    try {
      const data = await this.readGroupsFile();
      return Object.values(data.groups);
    } catch (error) {
      // If file doesn't exist, return empty array
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete group.
   *
   * @param name - Group name to delete
   */
  async deleteGroup(name: string): Promise<void> {
    const data = await this.readGroupsFile();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [name]: _removed, ...remainingGroups } = data.groups;
    const updatedData: GroupsFile = {
      groups: remainingGroups,
    };
    await this.writeGroupsFile(updatedData);
  }

  /**
   * Read groups file.
   *
   * @returns Parsed groups data
   */
  private async readGroupsFile(): Promise<GroupsFile> {
    try {
      const content = await fs.readFile(this.groupsFile, 'utf-8');
      return JSON.parse(content) as GroupsFile;
    } catch (error) {
      // If file doesn't exist, return empty structure
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { groups: {} };
      }
      throw error;
    }
  }

  /**
   * Write groups file atomically.
   *
   * Uses temp file + rename strategy for atomic writes.
   *
   * @param data - Groups data to write
   */
  private async writeGroupsFile(data: GroupsFile): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(path.dirname(this.groupsFile), { recursive: true });

    const tempFile = `${this.groupsFile}.tmp`;
    const content = JSON.stringify(data, null, 2);

    try {
      // Write to temp file with secure permissions
      await fs.writeFile(tempFile, content, {
        encoding: 'utf-8',
        mode: 0o600,
      });

      // Atomic rename
      await fs.rename(tempFile, this.groupsFile);
    } catch (error) {
      // Clean up temp file if it exists
      await fs.unlink(tempFile).catch(() => {
        /* ignore */
      });
      throw error;
    }
  }
}

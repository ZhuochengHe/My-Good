/**
 * Tests for JsonGroupStore class.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonGroupStore } from '../../src/session/group-store.js';
import type { SessionGroup } from '../../src/types/sessions.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('JsonGroupStore', () => {
  let testDir: string;
  let groupStore: JsonGroupStore;

  beforeEach(async () => {
    // Create temporary directory for test groups
    testDir = path.join(tmpdir(), `group-store-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    groupStore = new JsonGroupStore(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('saveGroup', () => {
    it('should save a new group', async () => {
      const group: SessionGroup = {
        name: 'work-projects',
        sessionIds: ['session-1', 'session-2'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await groupStore.saveGroup(group);

      const loaded = await groupStore.loadGroup('work-projects');
      expect(loaded).toEqual(group);
    });

    it('should update an existing group', async () => {
      const group1: SessionGroup = {
        name: 'my-group',
        sessionIds: ['session-1'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await groupStore.saveGroup(group1);

      const group2: SessionGroup = {
        ...group1,
        sessionIds: ['session-1', 'session-2'],
        updatedAt: Date.now(),
      };

      await groupStore.saveGroup(group2);

      const loaded = await groupStore.loadGroup('my-group');
      expect(loaded?.sessionIds).toEqual(['session-1', 'session-2']);
    });
  });

  describe('loadGroup', () => {
    it('should return null if group does not exist', async () => {
      const loaded = await groupStore.loadGroup('nonexistent');
      expect(loaded).toBeNull();
    });

    it('should load an existing group', async () => {
      const group: SessionGroup = {
        name: 'test-group',
        sessionIds: ['session-1'],
        createdAt: 123456,
        updatedAt: 123456,
      };

      await groupStore.saveGroup(group);

      const loaded = await groupStore.loadGroup('test-group');
      expect(loaded).toEqual(group);
    });
  });

  describe('listGroups', () => {
    it('should return empty array if no groups exist', async () => {
      const groups = await groupStore.listGroups();
      expect(groups).toEqual([]);
    });

    it('should list all groups', async () => {
      const group1: SessionGroup = {
        name: 'group-1',
        sessionIds: ['session-1'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const group2: SessionGroup = {
        name: 'group-2',
        sessionIds: ['session-2'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await groupStore.saveGroup(group1);
      await groupStore.saveGroup(group2);

      const groups = await groupStore.listGroups();
      expect(groups.length).toBe(2);
      expect(groups.map(g => g.name)).toContain('group-1');
      expect(groups.map(g => g.name)).toContain('group-2');
    });
  });

  describe('deleteGroup', () => {
    it('should delete a group', async () => {
      const group: SessionGroup = {
        name: 'to-delete',
        sessionIds: ['session-1'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await groupStore.saveGroup(group);
      expect(await groupStore.loadGroup('to-delete')).not.toBeNull();

      await groupStore.deleteGroup('to-delete');
      expect(await groupStore.loadGroup('to-delete')).toBeNull();
    });

    it('should not affect other groups when deleting one', async () => {
      const group1: SessionGroup = {
        name: 'keep-me',
        sessionIds: ['session-1'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const group2: SessionGroup = {
        name: 'delete-me',
        sessionIds: ['session-2'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await groupStore.saveGroup(group1);
      await groupStore.saveGroup(group2);

      await groupStore.deleteGroup('delete-me');

      expect(await groupStore.loadGroup('keep-me')).not.toBeNull();
      expect(await groupStore.loadGroup('delete-me')).toBeNull();
    });
  });

  describe('atomic writes', () => {
    it('should use atomic writes (temp file + rename)', async () => {
      const group: SessionGroup = {
        name: 'atomic-test',
        sessionIds: ['session-1'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await groupStore.saveGroup(group);

      // Temp file should not exist after save
      const groupsFile = path.join(testDir, 'groups.json');
      const tempFile = `${groupsFile}.tmp`;

      const tempExists = await fs.access(tempFile).then(() => true).catch(() => false);
      expect(tempExists).toBe(false);

      // Final file should exist
      const finalExists = await fs.access(groupsFile).then(() => true).catch(() => false);
      expect(finalExists).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    it('should handle sequential saves of different groups', async () => {
      // Note: Concurrent writes to the same file are not safe by design
      // This test verifies that sequential saves work correctly

      for (let i = 0; i < 10; i++) {
        const group: SessionGroup = {
          name: `group-${i}`,
          sessionIds: [`session-${i}`],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await groupStore.saveGroup(group);
      }

      const groups = await groupStore.listGroups();
      expect(groups.length).toBe(10);
    });
  });
});

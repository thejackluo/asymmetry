import { describe, expect, it, vi } from 'vitest';
import { subchatRoom, userRoom } from '@asymmetry/shared';
import {
  agentByUser,
  closeSubchat,
  createSubchat,
  createTask,
  getTask,
  getTaskScope,
  insertMessage,
  listMainThreadMessages,
  listParticipants,
  listSubchatsByTask,
  listSubchatMessages,
  outgoingTrustEdges,
  putTaskScope,
  setAgentStatus,
  setTaskStatus,
  userByAgent,
} from './repo.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';

describe('agent repository', () => {
  it('creates, loads, and updates tasks', () => {
    const db = createFixtureDb();
    try {
      const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a sublet');
      expect(getTask(db, task.id)).toEqual(task);
      expect(setTaskStatus(db, task.id, 'done')).toBe(true);
      expect(getTask(db, task.id)?.status).toBe('done');
    } finally {
      db.close();
    }
  });

  it('persists the canonical scope once and never overwrites it', () => {
    const db = createFixtureDb();
    try {
      const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a sublet');
      const canonical = { taskId: task.id, purpose: 'sublet', fields: ['price', 'dates'] };
      expect(putTaskScope(db, canonical)).toBe(true);
      expect(putTaskScope(db, { ...canonical, purpose: 'changed', fields: ['mileage'] })).toBe(false);
      expect(getTaskScope(db, task.id)).toEqual(canonical);
    } finally {
      db.close();
    }
  });

  it('creates pair and group subchats with participants and closes them', () => {
    const db = createFixtureDb();
    try {
      const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a car');
      const pair = createSubchat(db, task.id, [FIXTURE_IDS.agents.alice, FIXTURE_IDS.agents.bob]);
      const group = createSubchat(db, task.id, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
        FIXTURE_IDS.agents.carol,
      ]);

      expect(pair.kind).toBe('pair');
      expect(group.kind).toBe('group');
      expect(pair).toMatchObject({ outcome: null, summary: null, closedAt: null });
      expect(db.prepare('SELECT outcome, summary, closed_at FROM subchats WHERE id = ?').get(pair.id))
        .toEqual({ outcome: null, summary: null, closed_at: null });
      expect(listSubchatsByTask(db, task.id).find(({ id }) => id === group.id))
        .toMatchObject({ outcome: null, summary: null, closedAt: null });
      expect(listParticipants(db, group.id)).toEqual([
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
        FIXTURE_IDS.agents.carol,
      ]);
      expect(closeSubchat(db, pair.id, 'done', 'finished')).toBe(true);
      expect(db.prepare('SELECT status, outcome, summary FROM subchats WHERE id = ?').get(pair.id)).toEqual({
        status: 'closed',
        outcome: 'done',
        summary: 'finished',
      });
    } finally {
      db.close();
    }
  });

  it('uses contract room names and lists main-thread and subchat messages separately', () => {
    const db = createFixtureDb();
    try {
      const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a sublet');
      const subchat = createSubchat(db, task.id, [FIXTURE_IDS.agents.alice, FIXTURE_IDS.agents.bob]);
      const main = insertMessage(db, {
        taskId: task.id,
        senderType: 'human',
        senderId: FIXTURE_IDS.users.alice,
        body: 'Need a room',
      });
      const peer = insertMessage(db, {
        taskId: task.id,
        subchatId: subchat.id,
        senderType: 'agent',
        senderId: FIXTURE_IDS.agents.bob,
        body: 'I can help',
      });

      expect(main.roomId).toBe(userRoom(FIXTURE_IDS.users.alice));
      expect(peer.roomId).toBe(subchatRoom(subchat.id));
      expect(listMainThreadMessages(db, task.id)).toEqual([main]);
      expect(listSubchatMessages(db, subchat.id)).toEqual([peer]);
    } finally {
      db.close();
    }
  });

  it('orders messages and subchats by id when created_at timestamps tie', () => {
    const db = createFixtureDb();
    const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a room');
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const subchat = createSubchat(db, task.id, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const firstMain = insertMessage(db, {
        taskId: task.id,
        senderType: 'human',
        senderId: FIXTURE_IDS.users.alice,
        body: 'first',
      });
      const secondMain = insertMessage(db, {
        taskId: task.id,
        senderType: 'human',
        senderId: FIXTURE_IDS.users.alice,
        body: 'second',
      });
      const firstPeer = insertMessage(db, {
        taskId: task.id,
        subchatId: subchat.id,
        senderType: 'agent',
        senderId: FIXTURE_IDS.agents.bob,
        body: 'first peer',
      });
      const secondPeer = insertMessage(db, {
        taskId: task.id,
        subchatId: subchat.id,
        senderType: 'agent',
        senderId: FIXTURE_IDS.agents.bob,
        body: 'second peer',
      });
      sortRowsAgainstIdOrder(db, firstMain.id, secondMain.id);
      sortRowsAgainstIdOrder(db, firstPeer.id, secondPeer.id);

      db.prepare(
        `INSERT INTO subchats (id, task_id, kind, status, outcome, summary, closed_at, created_at)
         VALUES (?, ?, 'pair', 'open', NULL, NULL, NULL, ?)`,
      ).run('z-subchat', task.id, Date.now());
      db.prepare(
        `INSERT INTO subchats (id, task_id, kind, status, outcome, summary, closed_at, created_at)
         VALUES (?, ?, 'pair', 'open', NULL, NULL, NULL, ?)`,
      ).run('a-subchat', task.id, Date.now());

      expect(firstMain.createdAt).toBe(secondMain.createdAt);
      expect(firstPeer.createdAt).toBe(secondPeer.createdAt);
      expect(listMainThreadMessages(db, task.id).map(({ id }) => id))
        .toEqual([firstMain.id, secondMain.id].sort((a, b) => a.localeCompare(b)));
      expect(listSubchatMessages(db, subchat.id).map(({ id }) => id))
        .toEqual([firstPeer.id, secondPeer.id].sort((a, b) => a.localeCompare(b)));
      expect(listSubchatsByTask(db, task.id).map(({ id }) => id))
        .toEqual([subchat.id, 'z-subchat', 'a-subchat'].sort((a, b) => a.localeCompare(b)));
    } finally {
      now.mockRestore();
      db.close();
    }
  });

  it('updates agent status and maps users, agents, and outgoing trust edges', () => {
    const db = createFixtureDb();
    try {
      expect(agentByUser(db, FIXTURE_IDS.users.alice)?.id).toBe(FIXTURE_IDS.agents.alice);
      expect(userByAgent(db, FIXTURE_IDS.agents.bob)?.id).toBe(FIXTURE_IDS.users.bob);
      expect(setAgentStatus(db, FIXTURE_IDS.agents.alice, 'negotiating')).toBe(true);
      expect(agentByUser(db, FIXTURE_IDS.users.alice)?.status).toBe('negotiating');
      expect(outgoingTrustEdges(db, FIXTURE_IDS.users.alice).map(({ trustedUserId }) => trustedUserId)).toEqual([
        FIXTURE_IDS.users.bob,
        FIXTURE_IDS.users.carol,
      ]);
    } finally {
      db.close();
    }
  });
});

function sortRowsAgainstIdOrder(
  db: ReturnType<typeof createFixtureDb>,
  firstId: string,
  secondId: string,
): void {
  if (firstId.localeCompare(secondId) < 0) {
    db.prepare('UPDATE messages SET id = ? WHERE id = ?').run(`temporary-${firstId}`, firstId);
    db.prepare('UPDATE messages SET id = ? WHERE id = ?').run(firstId, secondId);
    db.prepare('UPDATE messages SET id = ? WHERE id = ?').run(secondId, `temporary-${firstId}`);
  }
}

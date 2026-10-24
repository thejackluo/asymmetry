import { describe, expect, it } from 'vitest';
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
      expect(listParticipants(db, group.id)).toEqual([
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
        FIXTURE_IDS.agents.carol,
      ]);
      expect(closeSubchat(db, pair.id)).toBe(true);
      expect(db.prepare('SELECT status FROM subchats WHERE id = ?').get(pair.id)).toEqual({ status: 'closed' });
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

      expect(main.roomId).toBe(`user:${FIXTURE_IDS.users.alice}`);
      expect(peer.roomId).toBe(`subchat:${subchat.id}`);
      expect(listMainThreadMessages(db, task.id)).toEqual([main]);
      expect(listSubchatMessages(db, subchat.id)).toEqual([peer]);
    } finally {
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

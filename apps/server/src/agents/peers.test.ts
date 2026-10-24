import { describe, expect, it } from 'vitest';
import { createTask, createSubchat } from './repo.js';
import { buildDirectory, networkPayload } from './peers.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';

describe('peer directory', () => {
  it("lists Alice's one- and two-hop peers before other agents and caps at four", () => {
    const db = createFixtureDb();
    try {
      const insertUser = db.prepare(
        `INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const insertAgent = db.prepare(
        'INSERT INTO agents (id, user_id, name, status) VALUES (?, ?, ?, ?)',
      );
      for (const [id, username, name] of [
        ['user-frank', 'frank', 'Frank'],
        ['user-gina', 'gina', 'Gina'],
      ]) {
        insertUser.run(id, username, name, 'fixture-hash', `agent-${username}`, 6);
        insertAgent.run(`agent-${username}`, id, `${name}'s Agent`, 'idle');
      }
      const directory = buildDirectory(db, FIXTURE_IDS.users.alice);
      expect(directory).toEqual([
        { agentId: FIXTURE_IDS.agents.bob, name: 'Bob', hop: 1 },
        { agentId: FIXTURE_IDS.agents.carol, name: 'Carol', hop: 1 },
        { agentId: FIXTURE_IDS.agents.dave, name: 'Dave', hop: 2 },
        { agentId: FIXTURE_IDS.agents.erin, name: 'Erin', hop: 'other' },
      ]);
      expect(directory).toHaveLength(4);
    } finally {
      db.close();
    }
  });

  it('exposes only agentId, display name, and hop in the directory', () => {
    const db = createFixtureDb();
    try {
      const directory = buildDirectory(db, FIXTURE_IDS.users.alice);
      expect(directory.every((peer) => Object.keys(peer).sort().join(',') === 'agentId,hop,name')).toBe(true);
      expect(JSON.stringify(directory)).not.toContain('username');
      expect(JSON.stringify(directory)).not.toContain('goal');
      expect(JSON.stringify(directory)).not.toContain('memory');
    } finally {
      db.close();
    }
  });

  it('returns trusted agent ids and subchat-derived discovered ids in network payload', () => {
    const db = createFixtureDb();
    try {
      const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a car');
      db.prepare(
        'INSERT INTO trust_edges (owner_user_id, trusted_user_id, created_at) VALUES (?, ?, ?)',
      ).run(FIXTURE_IDS.users.alice, FIXTURE_IDS.users.alice, 10);
      createSubchat(db, task.id, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.dave,
        FIXTURE_IDS.agents.erin,
      ]);

      const payload = networkPayload(db, FIXTURE_IDS.users.alice);
      expect(payload.trusted).toEqual([FIXTURE_IDS.agents.bob, FIXTURE_IDS.agents.carol]);
      expect(payload.discovered).toEqual([FIXTURE_IDS.agents.dave, FIXTURE_IDS.agents.erin]);
      expect(payload.agents.map(({ id }) => id)).toContain(FIXTURE_IDS.agents.alice);
      expect(payload.agents).toHaveLength(5);
    } finally {
      db.close();
    }
  });
});

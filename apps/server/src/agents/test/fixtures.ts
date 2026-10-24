import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from '../../db.js';

export const FIXTURE_IDS = {
  users: {
    alice: 'user-alice',
    bob: 'user-bob',
    carol: 'user-carol',
    dave: 'user-dave',
    erin: 'user-erin',
  },
  agents: {
    alice: 'agent-alice',
    bob: 'agent-bob',
    carol: 'agent-carol',
    dave: 'agent-dave',
    erin: 'agent-erin',
  },
} as const;

const PEOPLE = [
  ['alice', 'Alice'],
  ['bob', 'Bob'],
  ['carol', 'Carol'],
  ['dave', 'Dave'],
  ['erin', 'Erin'],
] as const;

export function createFixtureDb(): DatabaseType {
  const db = new Database(':memory:');
  db.exec(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'));

  const insertUser = db.prepare(
    `INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAgent = db.prepare(
    'INSERT INTO agents (id, user_id, name, status) VALUES (?, ?, ?, ?)',
  );
  for (const [username, displayName] of PEOPLE) {
    const userId = FIXTURE_IDS.users[username];
    const agentId = FIXTURE_IDS.agents[username];
    insertUser.run(userId, username, displayName, 'fixture-hash', agentId, 1);
    insertAgent.run(agentId, userId, `${displayName}'s Agent`, 'idle');
  }

  const insertTrust = db.prepare(
    'INSERT INTO trust_edges (owner_user_id, trusted_user_id, created_at) VALUES (?, ?, ?)',
  );
  const trustEdges = [
    ['alice', 'bob'],
    ['alice', 'carol'],
    ['bob', 'alice'],
    ['carol', 'alice'],
    ['bob', 'dave'],
  ] as const;
  trustEdges.forEach(([owner, trusted], index) => {
    insertTrust.run(FIXTURE_IDS.users[owner], FIXTURE_IDS.users[trusted], index + 1);
  });

  return db;
}

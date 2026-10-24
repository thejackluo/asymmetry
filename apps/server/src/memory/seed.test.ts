import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../db.js';
import { SEED_FACTS, SEED_TRUST, SEED_USERS, seed } from '../seed.js';
import { createMemoryEngine } from './engine.js';
import { addTask, count, fakeOpenAI } from './testutil.js';

const TABLES = ['users', 'agents', 'trust_edges', 'memory_items'];
const dirs: string[] = [];
const tempDb = (): Database => {
  const dir = mkdtempSync(join(tmpdir(), 'asym-seed-'));
  dirs.push(dir);
  return openDatabase(join(dir, 'seed.db'));
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('seed', () => {
  it('is idempotent, additive, and preserves unrelated rows', () => {
    const db = tempDb();
    db.prepare(
      "INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at) VALUES ('z','zed','Zed','h','az',1)",
    ).run();
    db.prepare("INSERT INTO agents (id, user_id, name) VALUES ('az','z','Zed agent')").run();
    db.prepare(
      "INSERT INTO memory_items (id, user_id, content, classification, field_tags, source, created_at) VALUES ('zm','z','mine','private','[]','chat',1)",
    ).run();

    const first = seed(db);
    expect(first.created).toEqual({ users: 5, trustEdges: SEED_TRUST.length, memoryItems: SEED_FACTS.length });
    const counts = TABLES.map((t) => count(db, t));
    const second = seed(db);
    expect(second.created).toEqual({ users: 0, trustEdges: 0, memoryItems: 0 });
    expect(TABLES.map((t) => count(db, t))).toEqual(counts);
    expect(second.users).toEqual(first.users);
    expect(db.prepare("SELECT content FROM memory_items WHERE id='zm'").get()).toEqual({ content: 'mine' });
    expect(counts).toEqual([6, 6, 5, SEED_FACTS.length + 1]);
  });

  it('creates five demo identities with password demo and the directional trust graph', () => {
    const db = tempDb();
    const { users } = seed(db);
    for (const u of SEED_USERS) {
      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(u.username) as Record<string, string>;
      expect(bcrypt.compareSync('demo', row.pass_hash)).toBe(true);
      expect(db.prepare('SELECT id FROM agents WHERE user_id = ?').get(row.id)).toEqual({ id: row.agent_id });
    }
    const edges = (db.prepare('SELECT owner_user_id o, trusted_user_id t FROM trust_edges').all() as { o: string; t: string }[])
      .map((e) => `${e.o}>${e.t}`)
      .sort();
    expect(edges).toEqual(SEED_TRUST.map(([o, t]) => `${users[o].userId}>${users[t].userId}`).sort());
    expect(edges).not.toContain(`${users.dave.userId}>${users.alice.userId}`);
  });

  it('refuses to grant demo trust to a pre-existing non-fixture account and changes nothing', () => {
    const db = tempDb();
    db.prepare(
      "INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at) VALUES ('pre','alice','Alice','h','pre-agent',1)",
    ).run();
    db.prepare("INSERT INTO agents (id, user_id, name) VALUES ('pre-agent','pre','A')").run();
    expect(() => seed(db)).toThrow(/non-fixture account/);
    expect([count(db, 'users'), count(db, 'trust_edges'), count(db, 'memory_items')]).toEqual([1, 0, 0]);
  });

  it('Bob has separate private address/phone and atomic network room facts', () => {
    const db = tempDb();
    const { users } = seed(db);
    const bob = db
      .prepare('SELECT content, classification, field_tags FROM memory_items WHERE user_id = ?')
      .all(users.bob.userId) as { content: string; classification: string; field_tags: string }[];
    const byTag = Object.fromEntries(bob.map((r) => [JSON.parse(r.field_tags)[0], r]));
    expect(byTag.address).toMatchObject({ classification: 'private', content: expect.stringContaining('726 Spring St') });
    expect(byTag.phone).toMatchObject({ classification: 'private', content: expect.stringContaining('404-555-0182') });
    for (const t of ['location_area', 'price', 'dates', 'furnished']) expect(byTag[t].classification).toBe('network');
    expect(bob.every((r) => JSON.parse(r.field_tags).length === 1)).toBe(true);
  });

  it('demo flows against seeded data: money shot, Erin public, Dave denied', async () => {
    const db = tempDb();
    const { users } = seed(db);
    const { alice, bob, dave, erin } = users;
    addTask(db, 't', alice.userId, ['location_area', 'price', 'dates', 'furnished'], {
      id: 'sc',
      agents: [alice.agentId, bob.agentId],
    });
    addTask(db, 'civic', alice.userId, ['vehicle', 'mileage', 'title_status', 'price'], {
      id: 'sc-dave',
      agents: [alice.agentId, dave.agentId],
    });
    db.prepare("INSERT INTO subchats (id, task_id, kind, status, created_at) VALUES ('sc-erin','t','discovery','open',1)").run();
    for (const a of [alice.agentId, erin.agentId]) {
      db.prepare("INSERT INTO subchat_participants (subchat_id, agent_id) VALUES ('sc-erin', ?)").run(a);
    }
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);

    const money = await engine.queryMemory(bob.userId, alice.userId, {
      taskId: 't',
      purpose: 'sublet',
      fields: ['location_area', 'price', 'dates'],
      subchatId: 'sc',
    });
    expect(money.items.map((i) => i.fieldTags[0]).sort()).toEqual(['dates', 'location_area', 'price']);
    expect(money.withheldCount).toBe(3);
    expect(money.disclosure.decision).toBe('partial');
    expect(JSON.stringify(money)).not.toMatch(/726 Spring|404-555/);

    const erinRes = await engine.queryMemory(erin.userId, alice.userId, {
      taskId: 't',
      purpose: 'sublet',
      fields: ['location_area'],
      subchatId: 'sc-erin',
    });
    expect(erinRes.items).toHaveLength(1);
    expect(erinRes.items[0].classification).toBe('public');

    const civic = await engine.queryMemory(dave.userId, alice.userId, {
      taskId: 'civic',
      purpose: 'buy a car',
      fields: ['vehicle', 'mileage', 'title_status', 'price'],
      subchatId: 'sc-dave',
    });
    expect(civic.items).toEqual([]);
    expect(civic.disclosure.decision).toBe('denied');
  });
});

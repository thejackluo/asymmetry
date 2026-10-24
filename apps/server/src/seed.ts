import { fileURLToPath, pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { Classification } from '@asymmetry/shared';
import { openDatabase, type Database } from './db.js';

interface SeedUser {
  key: string;
  username: string;
  displayName: string;
}

interface SeedFact {
  id: string;
  user: string;
  content: string;
  classification: Classification;
  fieldTags: string[];
}

export const SEED_PASSWORD = 'demo';

export const SEED_USERS: SeedUser[] = [
  { key: 'bayzhan', username: 'bayzhan', displayName: 'Bayzhan' },
  { key: 'jack', username: 'jack', displayName: 'Jack' },
  { key: 'jad', username: 'jad', displayName: 'Jad' },
  { key: 'aziz', username: 'aziz', displayName: 'Aziz' },
  { key: 'akash', username: 'akash', displayName: 'Akash' },
];

export const SEED_TRUST: [string, string][] = [
  ['bayzhan', 'jack'],
  ['bayzhan', 'jad'],
  ['jack', 'bayzhan'],
  ['jad', 'bayzhan'],
  ['jack', 'aziz'],
];

export const SEED_FACTS: SeedFact[] = [
  { id: 'seed-mem-bayzhan-salary', user: 'bayzhan', content: 'Works at Stripe, salary $185k', classification: 'private', fieldTags: ['salary'] },
  { id: 'seed-mem-bayzhan-ssn', user: 'bayzhan', content: 'SSN on file', classification: 'private', fieldTags: ['ssn'] },
  { id: 'seed-mem-bayzhan-need-area', user: 'bayzhan', content: 'Looking for a summer sublet near Georgia Tech', classification: 'network', fieldTags: ['location_area'] },
  { id: 'seed-mem-bayzhan-need-dates', user: 'bayzhan', content: 'Needs the sublet May–Aug', classification: 'network', fieldTags: ['dates'] },
  { id: 'seed-mem-bayzhan-need-budget', user: 'bayzhan', content: 'Sublet budget under $1200/mo', classification: 'network', fieldTags: ['price'] },
  { id: 'seed-mem-jack-area', user: 'jack', content: 'Has a room for sublet 0.4mi from Georgia Tech campus', classification: 'network', fieldTags: ['location_area'] },
  { id: 'seed-mem-jack-price', user: 'jack', content: 'Room rent is $950/mo', classification: 'network', fieldTags: ['price'] },
  { id: 'seed-mem-jack-dates', user: 'jack', content: 'Room available May 15–Aug 10', classification: 'network', fieldTags: ['dates'] },
  { id: 'seed-mem-jack-furnished', user: 'jack', content: 'Room is furnished', classification: 'network', fieldTags: ['furnished'] },
  { id: 'seed-mem-jack-address', user: 'jack', content: 'Exact address: 726 Spring St NW Apt 4', classification: 'private', fieldTags: ['address'] },
  { id: 'seed-mem-jack-phone', user: 'jack', content: 'Phone 404-555-0182', classification: 'private', fieldTags: ['phone'] },
  { id: 'seed-mem-jad-mechanic', user: 'jad', content: "Knows a trusted mechanic (Mike's Auto) for pre-purchase inspection", classification: 'network', fieldTags: ['mechanic'] },
  { id: 'seed-mem-jad-ceramics', user: 'jad', content: 'Sells handmade ceramics', classification: 'public', fieldTags: ['ceramics'] },
  { id: 'seed-mem-aziz-vehicle', user: 'aziz', content: 'Selling a 2019 Honda Civic', classification: 'network', fieldTags: ['vehicle'] },
  { id: 'seed-mem-aziz-mileage', user: 'aziz', content: 'The Civic has 62k miles', classification: 'network', fieldTags: ['mileage'] },
  { id: 'seed-mem-aziz-price', user: 'aziz', content: 'Asking $14,500 OBO for the Civic', classification: 'network', fieldTags: ['price'] },
  { id: 'seed-mem-aziz-title', user: 'aziz', content: 'The Civic has a clean title', classification: 'network', fieldTags: ['title_status'] },
  { id: 'seed-mem-akash-tip', user: 'akash', content: 'Public housing tip: GT summer sublet listings are available through the campus housing board', classification: 'public', fieldTags: ['location_area'] },
];

export const fixtureUserId = (key: string): string => `seed-user-${key}`;
export const fixtureAgentId = (key: string): string => `seed-agent-${key}`;

export interface SeedResult {
  users: Record<string, { userId: string; agentId: string }>;
  created: { users: number; trustEdges: number; memoryItems: number };
}

export function seed(db: Database): SeedResult {
  const passHash = bcrypt.hashSync(SEED_PASSWORD, 10);
  return db.transaction((): SeedResult => {
    const created = { users: 0, trustEdges: 0, memoryItems: 0 };
    const users: SeedResult['users'] = {};
    const now = Date.now();

    for (const u of SEED_USERS) {
      const existing = db
        .prepare('SELECT id, agent_id FROM users WHERE username = ?')
        .get(u.username) as { id: string; agent_id: string } | undefined;
      let userId: string;
      let agentId: string;
      if (existing && existing.id !== fixtureUserId(u.key)) {
        throw new Error(
          `username "${u.username}" already belongs to a non-fixture account; ` +
            'seed into a fresh DATABASE_PATH instead of granting demo trust to a real account',
        );
      }
      if (existing) {
        userId = existing.id;
        agentId = existing.agent_id;
      } else {
        userId = fixtureUserId(u.key);
        agentId = fixtureAgentId(u.key);
        db.prepare(
          'INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(userId, u.username, u.displayName, passHash, agentId, now);
        created.users += 1;
      }
      db.prepare('INSERT OR IGNORE INTO agents (id, user_id, name) VALUES (?, ?, ?)').run(
        agentId,
        userId,
        `${u.displayName}'s Agent`,
      );
      users[u.key] = { userId, agentId };
    }

    const trust = db.prepare(
      'INSERT OR IGNORE INTO trust_edges (owner_user_id, trusted_user_id, created_at) VALUES (?, ?, ?)',
    );
    for (const [owner, trusted] of SEED_TRUST) {
      created.trustEdges += trust.run(users[owner].userId, users[trusted].userId, now).changes;
    }

    const fact = db.prepare(
      `INSERT OR IGNORE INTO memory_items (id, user_id, content, classification, field_tags, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'seed', ?)`,
    );
    for (const f of SEED_FACTS) {
      created.memoryItems += fact.run(
        f.id,
        users[f.user].userId,
        f.content,
        f.classification,
        JSON.stringify(f.fieldTags),
        now,
      ).changes;
    }
    return { users, created };
  })();
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
  const db = openDatabase();
  try {
    const { created } = seed(db);
    const count = (table: string): number =>
      (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    console.log(
      `seed ok: created users=${created.users} trust_edges=${created.trustEdges} memory_items=${created.memoryItems}; ` +
        `totals users=${count('users')} trust_edges=${count('trust_edges')} memory_items=${count('memory_items')}`,
    );
  } catch (err) {
    console.error('seed failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

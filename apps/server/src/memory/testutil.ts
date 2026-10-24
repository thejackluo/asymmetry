import type OpenAI from 'openai';
import { vi } from 'vitest';
import { openDatabase, type Database } from '../db.js';

export type Reply = string | Error | (() => never);

export function fakeOpenAI(...replies: Reply[]) {
  const create = vi.fn(async () => {
    const r = replies.length > 1 ? replies.shift()! : replies[0];
    if (r instanceof Error) throw r;
    if (typeof r === 'function') r();
    return { choices: [{ message: { content: r as string } }] };
  });
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

export const facts = (...f: { content: string; classification: string; fieldTags: unknown }[]): string =>
  JSON.stringify({ facts: f });

export function freshDb(): Database {
  return openDatabase(':memory:');
}

export function addUser(db: Database, key: string): { userId: string; agentId: string } {
  const userId = `u-${key}`;
  const agentId = `a-${key}`;
  db.prepare(
    'INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userId, key, key, 'x', agentId, 1);
  db.prepare('INSERT INTO agents (id, user_id, name) VALUES (?, ?, ?)').run(agentId, userId, `${key} agent`);
  return { userId, agentId };
}

export function trust(db: Database, owner: string, trusted: string): void {
  db.prepare('INSERT INTO trust_edges (owner_user_id, trusted_user_id, created_at) VALUES (?, ?, 1)').run(
    owner,
    trusted,
  );
}

let seq = 0;
export function addFact(
  db: Database,
  userId: string,
  content: string,
  classification: string,
  tags: string[] | string,
): string {
  const id = `m-${++seq}`;
  db.prepare(
    `INSERT INTO memory_items (id, user_id, content, classification, field_tags, source, created_at)
     VALUES (?, ?, ?, ?, ?, 'chat', ?)`,
  ).run(id, userId, content, classification, typeof tags === 'string' ? tags : JSON.stringify(tags), seq);
  return id;
}

export function addTask(
  db: Database,
  taskId: string,
  ownerUserId: string,
  fields: string[] | null,
  subchat?: { id: string; agents: string[] },
): void {
  db.prepare('INSERT INTO tasks (id, user_id, title, status, created_at) VALUES (?, ?, ?, ?, 1)').run(
    taskId,
    ownerUserId,
    'task',
    'active',
  );
  if (fields) {
    db.prepare('INSERT INTO task_scopes (task_id, purpose, fields_json) VALUES (?, ?, ?)').run(
      taskId,
      'purpose',
      JSON.stringify(fields),
    );
  }
  if (subchat) {
    db.prepare('INSERT INTO subchats (id, task_id, kind, status, created_at) VALUES (?, ?, ?, ?, 1)').run(
      subchat.id,
      taskId,
      'negotiation',
      'open',
    );
    for (const a of subchat.agents) {
      db.prepare('INSERT INTO subchat_participants (subchat_id, agent_id) VALUES (?, ?)').run(subchat.id, a);
    }
  }
}

export function fakeIo(): {
  io: never;
  emits: { rooms: string[]; event: string; payload: unknown }[];
  globalEmit: (...args: unknown[]) => unknown;
} {
  const emits: { rooms: string[]; event: string; payload: unknown }[] = [];
  const globalEmit: (...args: unknown[]) => unknown = vi.fn();
  const io = {
    emit: globalEmit,
    to(rooms: string | string[]) {
      const list = Array.isArray(rooms) ? rooms : [rooms];
      return { emit: (event: string, payload: unknown) => emits.push({ rooms: list, event, payload }) };
    },
  };
  return { io: io as never, emits, globalEmit };
}

export const count = (db: Database, table: string): number =>
  (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

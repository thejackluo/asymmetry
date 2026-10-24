import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import type { Server } from 'socket.io';
import type {
  Classification,
  Disclosure,
  Goal,
  ID,
  InfoScope,
  MemoryEngine,
  MemoryItem,
} from '@asymmetry/shared';
import type { Database } from '../db.js';
import { KNOWN_TAGS, classifyFacts } from './classify.js';
import { emitNotice, persistDisclosure, toNotice } from './disclosure.js';
import { extractGoals } from './goals.js';

export class MemoryAccessError extends Error {
  constructor(reason: string) {
    super(`memory access denied: ${reason}`);
    this.name = 'MemoryAccessError';
  }
}

interface MemoryRow {
  id: string;
  user_id: string;
  content: string;
  classification: string;
  field_tags: string;
  source: string;
  created_at: number;
}

const CLASSIFICATIONS: ReadonlySet<string> = new Set(['public', 'network', 'private']);

const parseTags = (raw: string): string[] => {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
};

export const toMemoryItem = (r: MemoryRow): MemoryItem => ({
  id: r.id,
  userId: r.user_id,
  content: r.content,
  classification: r.classification as Classification,
  fieldTags: parseTags(r.field_tags),
  source: r.source === 'seed' ? 'seed' : 'chat',
  createdAt: r.created_at,
});

const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export const ALLOWED_CLASSES: Record<'owner' | 'trusted' | 'stranger', ReadonlySet<Classification>> = {
  owner: new Set<Classification>(['public', 'network', 'private']),
  trusted: new Set<Classification>(['public', 'network']),
  stranger: new Set<Classification>(['public']),
};

export function listMemory(db: Database, userId: ID): MemoryItem[] {
  return (
    db.prepare('SELECT * FROM memory_items WHERE user_id = ? ORDER BY created_at, id').all(userId) as MemoryRow[]
  ).map(toMemoryItem);
}

export function createMemoryEngine(db: Database, openai: OpenAI, io?: Server): MemoryEngine {
  const agentOf = (userId: ID): ID | undefined =>
    (db.prepare('SELECT id FROM agents WHERE user_id = ?').get(userId) as { id: string } | undefined)?.id;

  async function ingest(userId: ID, text: string, source: 'chat' | 'seed'): Promise<MemoryItem[]> {
    if (!nonEmptyString(userId)) throw new Error('ingest: invalid user');
    if (source !== 'chat' && source !== 'seed') throw new Error('ingest: invalid source');
    if (typeof text !== 'string' || text.trim().length === 0) return [];
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('ingest: unknown user');

    const facts = await classifyFacts(openai, text);
    const now = Date.now();
    const items: MemoryItem[] = facts.map((f) => ({
      id: randomUUID(),
      userId,
      content: f.content,
      classification: f.classification,
      fieldTags: f.fieldTags,
      source,
      createdAt: now,
    }));
    const insert = db.prepare(
      `INSERT INTO memory_items (id, user_id, content, classification, field_tags, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    db.transaction(() => {
      for (const i of items) {
        insert.run(i.id, i.userId, i.content, i.classification, JSON.stringify(i.fieldTags), i.source, i.createdAt);
      }
    })();
    return items;
  }

  async function queryMemory(
    ownerUserId: ID,
    requesterUserId: ID,
    scope: InfoScope,
  ): Promise<{ items: MemoryItem[]; withheldCount: number; disclosure: Disclosure }> {
    if (!nonEmptyString(ownerUserId) || !nonEmptyString(requesterUserId)) {
      throw new MemoryAccessError('invalid owner or requester');
    }
    if (
      typeof scope !== 'object' ||
      scope === null ||
      !nonEmptyString(scope.taskId) ||
      typeof scope.purpose !== 'string' ||
      !Array.isArray(scope.fields) ||
      scope.fields.length === 0 ||
      !scope.fields.every(nonEmptyString) ||
      (scope.subchatId !== undefined && !nonEmptyString(scope.subchatId))
    ) {
      throw new MemoryAccessError('malformed scope');
    }

    const ownerAgentId = agentOf(ownerUserId);
    const requesterAgentId = agentOf(requesterUserId);
    if (!ownerAgentId || !requesterAgentId) throw new MemoryAccessError('unknown owner or requester');

    const task = db.prepare('SELECT id, user_id FROM tasks WHERE id = ?').get(scope.taskId) as
      | { id: string; user_id: string }
      | undefined;
    if (!task) throw new MemoryAccessError('unknown task');

    const scopeRow = db.prepare('SELECT fields_json FROM task_scopes WHERE task_id = ?').get(task.id) as
      | { fields_json: string }
      | undefined;
    if (!scopeRow) throw new MemoryAccessError('task has no canonical scope');
    const canonical = new Set(parseTags(scopeRow.fields_json).filter((f) => KNOWN_TAGS.has(f)));
    const requested = [...new Set(scope.fields)];
    if (canonical.size === 0 || requested.some((f) => !canonical.has(f))) {
      throw new MemoryAccessError('requested fields exceed canonical task scope');
    }

    let observers: ID[] = [];
    if (scope.subchatId === undefined) {
      if (ownerUserId !== requesterUserId || task.user_id !== ownerUserId) {
        throw new MemoryAccessError('peer reads require a subchat; owner reads require an owned task');
      }
    } else {
      const subchat = db.prepare('SELECT task_id FROM subchats WHERE id = ?').get(scope.subchatId) as
        | { task_id: string }
        | undefined;
      if (!subchat || subchat.task_id !== task.id) throw new MemoryAccessError('subchat does not belong to task');
      const participants = db
        .prepare(
          `SELECT p.agent_id, a.user_id FROM subchat_participants p
           LEFT JOIN agents a ON a.id = p.agent_id WHERE p.subchat_id = ?`,
        )
        .all(scope.subchatId) as { agent_id: string; user_id: string | null }[];
      const agentIds = new Set(participants.map((p) => p.agent_id));
      const taskOwnerAgentId = agentOf(task.user_id);
      if (
        !agentIds.has(ownerAgentId) ||
        !agentIds.has(requesterAgentId) ||
        !taskOwnerAgentId ||
        !agentIds.has(taskOwnerAgentId)
      ) {
        throw new MemoryAccessError('owner, requester, and task owner must all be subchat participants');
      }
      if (participants.some((p) => p.user_id === null)) {
        throw new MemoryAccessError('subchat has an unknown participant');
      }
      observers = [...new Set(participants.map((p) => p.user_id as string))].filter((u) => u !== ownerUserId);
    }

    const trusts = db.prepare('SELECT 1 FROM trust_edges WHERE owner_user_id = ? AND trusted_user_id = ?');
    const allowedClasses = new Set<Classification>(ALLOWED_CLASSES.owner);
    for (const observer of observers) {
      const permitted = ALLOWED_CLASSES[trusts.get(ownerUserId, observer) ? 'trusted' : 'stranger'];
      for (const c of [...allowedClasses]) if (!permitted.has(c)) allowedClasses.delete(c);
    }
    const requestedSet = new Set(requested);

    const rows = db
      .prepare('SELECT * FROM memory_items WHERE user_id = ? ORDER BY created_at, id')
      .all(ownerUserId) as MemoryRow[];
    const released: MemoryItem[] = [];
    for (const row of rows) {
      if (!CLASSIFICATIONS.has(row.classification)) continue;
      if (!allowedClasses.has(row.classification as Classification)) continue;
      const item = toMemoryItem(row);
      if (!item.fieldTags.some((t) => requestedSet.has(t))) continue;
      released.push(item);
    }
    const withheldCount = rows.length - released.length;

    const disclosure = persistDisclosure(db, {
      ownerUserId,
      requesterAgentId,
      scope: { taskId: task.id, purpose: scope.purpose, fields: requested, subchatId: scope.subchatId },
      released: released.map((i) => i.id),
      withheldCount,
    });
    emitNotice(io, toNotice(disclosure, ownerAgentId), task.user_id, ownerUserId);

    return { items: released, withheldCount, disclosure };
  }

  return {
    ingest,
    queryMemory,
    extractGoals: (userId: ID, taskId: ID, text: string): Promise<Goal[]> =>
      extractGoals(db, openai, userId, taskId, text),
  };
}

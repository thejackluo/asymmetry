import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../db.js';
import { createMemoryEngine, MemoryAccessError } from './engine.js';
import { addFact, addTask, addUser, count, facts, fakeIo, fakeOpenAI, freshDb, trust } from './testutil.js';

type Who = 'owner' | 'trusted' | 'stranger';

describe('permission matrix (9 cells, real trust rows)', () => {
  let db: Database;
  const ids: Record<Who, { userId: string; agentId: string }> = {} as never;
  const factIds: Record<string, string> = {};

  beforeEach(() => {
    db = freshDb();
    ids.owner = addUser(db, 'owner');
    ids.trusted = addUser(db, 'trusted');
    ids.stranger = addUser(db, 'stranger');
    trust(db, ids.owner.userId, ids.trusted.userId);
    trust(db, ids.stranger.userId, ids.owner.userId);
    for (const c of ['public', 'network', 'private']) {
      factIds[c] = addFact(db, ids.owner.userId, `${c} fact`, c, ['price']);
    }
    for (const w of ['owner', 'trusted', 'stranger'] as Who[]) {
      addTask(db, `t-${w}`, ids[w].userId, ['price']);
    }
  });

  const cells: [Who, string, boolean][] = [
    ['owner', 'public', true],
    ['owner', 'network', true],
    ['owner', 'private', true],
    ['trusted', 'public', true],
    ['trusted', 'network', true],
    ['trusted', 'private', false],
    ['stranger', 'public', true],
    ['stranger', 'network', false],
    ['stranger', 'private', false],
  ];

  it.each(cells)('requester=%s classification=%s -> released=%s', async (who, cls, expected) => {
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    const res = await engine.queryMemory(ids.owner.userId, ids[who].userId, {
      taskId: `t-${who}`,
      purpose: 'p',
      fields: ['price'],
    });
    expect(res.items.some((i) => i.id === factIds[cls])).toBe(expected);
    expect(res.disclosure.released.includes(factIds[cls])).toBe(expected);
  });

  it('reverse-only trust (stranger trusts owner) does not release network data', async () => {
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    const res = await engine.queryMemory(ids.owner.userId, ids.stranger.userId, {
      taskId: 't-stranger',
      purpose: 'p',
      fields: ['price'],
    });
    expect(res.items.map((i) => i.classification)).toEqual(['public']);
  });
});

describe('scope, disclosure accounting, notices', () => {
  let db: Database;
  let alice: { userId: string; agentId: string };
  let bob: { userId: string; agentId: string };
  let carol: { userId: string; agentId: string };
  const SUB = 'sc-1';

  beforeEach(() => {
    db = freshDb();
    alice = addUser(db, 'alice');
    bob = addUser(db, 'bob');
    carol = addUser(db, 'carol');
    trust(db, bob.userId, alice.userId);
    addFact(db, bob.userId, 'Room 0.4mi from GT', 'network', ['location_area']);
    addFact(db, bob.userId, '$950/mo', 'network', ['price']);
    addFact(db, bob.userId, 'May 15-Aug 10', 'network', ['dates']);
    addFact(db, bob.userId, 'Furnished', 'network', ['furnished']);
    addFact(db, bob.userId, 'SECRET-ADDR 726 Spring St NW Apt 4', 'private', ['address', 'location_area']);
    addFact(db, bob.userId, 'SECRET-PHONE 404-555-0182', 'private', ['phone']);
    addFact(db, bob.userId, 'broken tags', 'network', 'not json');
    addTask(db, 't', alice.userId, ['location_area', 'price', 'dates'], { id: SUB, agents: [alice.agentId, bob.agentId] });
  });

  const scope = (over: object = {}) => ({
    taskId: 't',
    purpose: 'sublet',
    fields: ['location_area', 'price', 'dates'],
    subchatId: SUB,
    ...over,
  });

  it('money shot: releases area/price/dates, withholds 4, partial, one audit row', async () => {
    const { io, emits, globalEmit } = fakeIo();
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client, io);
    const res = await engine.queryMemory(bob.userId, alice.userId, scope());
    expect(res.items.map((i) => i.content)).toEqual(['Room 0.4mi from GT', '$950/mo', 'May 15-Aug 10']);
    expect(res.withheldCount).toBe(4);
    expect(res.disclosure.decision).toBe('partial');
    expect(count(db, 'disclosures')).toBe(1);
    const row = db.prepare('SELECT * FROM disclosures').get() as Record<string, unknown>;
    expect(JSON.parse(row.released_json as string)).toEqual(res.items.map((i) => i.id));
    expect(row.withheld_count).toBe(4);
    expect(row.requester_agent_id).toBe(alice.agentId);
    expect(row.owner_user_id).toBe(bob.userId);

    const serialized = JSON.stringify(res);
    expect(serialized).not.toMatch(/SECRET|726 Spring|404-555|furnished|broken tags|"address"|"phone"/i);

    expect(globalEmit).not.toHaveBeenCalled();
    expect(emits).toHaveLength(1);
    expect(emits[0].event).toBe('disclosure:logged');
    expect(new Set(emits[0].rooms)).toEqual(new Set([`user:${alice.userId}`, `user:${bob.userId}`]));
    expect(emits[0].rooms).not.toContain(`user:${carol.userId}`);
    expect(emits[0].payload).toEqual({
      id: res.disclosure.id,
      taskId: 't',
      subchatId: SUB,
      ownerAgentId: bob.agentId,
      releasedCount: 3,
      withheldCount: 4,
      decision: 'partial',
    });
  });

  it('narrower scope is allowed and filters by field', async () => {
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    const res = await engine.queryMemory(bob.userId, alice.userId, scope({ fields: ['price'] }));
    expect(res.items.map((i) => i.content)).toEqual(['$950/mo']);
    expect(res.withheldCount).toBe(6);
  });

  it('purpose keywords never expand authorization', async () => {
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    const res = await engine.queryMemory(
      bob.userId,
      alice.userId,
      scope({ fields: ['price'], purpose: 'need address phone furnished location_area dates everything' }),
    );
    expect(res.items.map((i) => i.content)).toEqual(['$950/mo']);
  });

  it('all denied -> decision denied, still exactly one audit row', async () => {
    db.prepare('DELETE FROM trust_edges').run();
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    const res = await engine.queryMemory(bob.userId, alice.userId, scope());
    expect(res.items).toEqual([]);
    expect(res.withheldCount).toBe(7);
    expect(res.disclosure.decision).toBe('denied');
    expect(count(db, 'disclosures')).toBe(1);
  });

  it('released when every considered fact is returned', async () => {
    const solo = freshDb();
    const o = addUser(solo, 'o');
    const r = addUser(solo, 'r');
    addFact(solo, o.userId, 'pub price', 'public', ['price']);
    addTask(solo, 'tt', r.userId, ['price']);
    const res = await createMemoryEngine(solo, fakeOpenAI('{}').client).queryMemory(o.userId, r.userId, {
      taskId: 'tt',
      purpose: '',
      fields: ['price'],
    });
    expect(res.disclosure.decision).toBe('released');
    expect(res.withheldCount).toBe(0);
  });

  it.each([
    ['expanded field', { fields: ['location_area', 'furnished'] }],
    ['unknown field', { fields: ['address'] }],
    ['empty fields', { fields: [] }],
    ['non-string field', { fields: [1] }],
    ['unknown task', { taskId: 'nope' }],
    ['foreign subchat', { subchatId: 'other' }],
    ['malformed subchat', { subchatId: 7 }],
  ])('fails closed on %s: throws and writes no audit row', async (_n, over) => {
    const { io, emits } = fakeIo();
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client, io);
    await expect(engine.queryMemory(bob.userId, alice.userId, scope(over) as never)).rejects.toBeInstanceOf(
      MemoryAccessError,
    );
    expect(count(db, 'disclosures')).toBe(0);
    expect(emits).toHaveLength(0);
  });

  it('fails closed when the task has no canonical scope', async () => {
    addTask(db, 'noscope', alice.userId, null);
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    await expect(
      engine.queryMemory(bob.userId, alice.userId, { taskId: 'noscope', purpose: '', fields: ['price'] }),
    ).rejects.toBeInstanceOf(MemoryAccessError);
  });

  it('rejects a requester who does not own the task (cannot borrow another task scope)', async () => {
    trust(db, bob.userId, carol.userId);
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    await expect(
      engine.queryMemory(bob.userId, carol.userId, scope({ subchatId: undefined })),
    ).rejects.toBeInstanceOf(MemoryAccessError);
  });

  it('rejects a subchat where the owner is not a participant', async () => {
    addTask(db, 't2', alice.userId, ['price'], { id: 'sc-2', agents: [alice.agentId, carol.agentId] });
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    await expect(
      engine.queryMemory(bob.userId, alice.userId, { taskId: 't2', purpose: '', fields: ['price'], subchatId: 'sc-2' }),
    ).rejects.toBeInstanceOf(MemoryAccessError);
  });

  it('rejects unknown owner/requester', async () => {
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    await expect(engine.queryMemory('ghost', alice.userId, scope())).rejects.toBeInstanceOf(MemoryAccessError);
  });

  it('audit insert failure -> no data returned, no notice', async () => {
    db.exec(`CREATE TRIGGER block_audit BEFORE INSERT ON disclosures BEGIN SELECT RAISE(ABORT, 'audit down'); END;`);
    const { io, emits } = fakeIo();
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client, io);
    await expect(engine.queryMemory(bob.userId, alice.userId, scope())).rejects.toThrow(/audit down/);
    expect(emits).toHaveLength(0);
  });

  it('one audit row per query across repeated calls; same-user notice room deduped', async () => {
    addTask(db, 'own', bob.userId, ['price']);
    const { io, emits } = fakeIo();
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client, io);
    await engine.queryMemory(bob.userId, alice.userId, scope());
    await engine.queryMemory(bob.userId, alice.userId, scope());
    const own = await engine.queryMemory(bob.userId, bob.userId, { taskId: 'own', purpose: '', fields: ['price'] });
    expect(count(db, 'disclosures')).toBe(3);
    expect(emits[2].rooms).toEqual([`user:${bob.userId}`]);
    expect(own.items.map((i) => i.content)).toEqual(['$950/mo']);
  });
});

describe('ingest', () => {
  it('stores each atomic fact with classification and tags', async () => {
    const db = freshDb();
    const u = addUser(db, 'bob');
    const { client } = fakeOpenAI(
      facts(
        { content: '$950/mo', classification: 'network', fieldTags: ['price'] },
        { content: 'Phone 404-555-0182', classification: 'private', fieldTags: ['phone'] },
      ),
    );
    const items = await createMemoryEngine(db, client).ingest(u.userId, '$950/mo, phone 404-555-0182', 'chat');
    expect(items.map((i) => [i.classification, i.fieldTags])).toEqual([
      ['network', ['price']],
      ['private', ['phone']],
    ]);
    const rows = db.prepare('SELECT * FROM memory_items ORDER BY content').all() as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
    expect(rows.every((r) => r.user_id === u.userId && r.source === 'chat')).toBe(true);
  });

  it('garbage classifier output stores one private fact', async () => {
    const db = freshDb();
    const u = addUser(db, 'x');
    const items = await createMemoryEngine(db, fakeOpenAI('lol').client).ingest(u.userId, 'hello', 'chat');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ classification: 'private', fieldTags: [], content: 'hello' });
  });

  it('rolls back the whole batch on a partial insert failure', async () => {
    const db = freshDb();
    const u = addUser(db, 'x');
    db.exec(
      `CREATE TRIGGER fail_second BEFORE INSERT ON memory_items WHEN NEW.content = 'b' BEGIN SELECT RAISE(ABORT, 'boom'); END;`,
    );
    const { client } = fakeOpenAI(
      facts(
        { content: 'a', classification: 'network', fieldTags: ['price'] },
        { content: 'b', classification: 'network', fieldTags: ['price'] },
      ),
    );
    await expect(createMemoryEngine(db, client).ingest(u.userId, 'a b', 'chat')).rejects.toThrow(/boom/);
    expect(count(db, 'memory_items')).toBe(0);
  });

  it('rejects unknown users and invalid source', async () => {
    const db = freshDb();
    const engine = createMemoryEngine(db, fakeOpenAI('{}').client);
    await expect(engine.ingest('ghost', 'x', 'chat')).rejects.toThrow();
    const u = addUser(db, 'x');
    await expect(engine.ingest(u.userId, 'x', 'evil' as never)).rejects.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { createMemoryEngine } from './engine.js';
import { addTask, addUser, count, fakeOpenAI, freshDb } from './testutil.js';

const goals = (...d: string[]) => JSON.stringify({ goals: d.map((description) => ({ description })) });

describe('extractGoals', () => {
  it('creates open goals tied to owner and task, deduplicated across repeats', async () => {
    const db = freshDb();
    const a = addUser(db, 'alice');
    addTask(db, 't', a.userId, ['price']);
    const { client } = fakeOpenAI(goals('Find a GT summer sublet under $1200/mo', 'find a GT  summer sublet under $1200/mo'));
    const engine = createMemoryEngine(db, client);
    const first = await engine.extractGoals(a.userId, 't', 'I need a sublet');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ userId: a.userId, taskId: 't', status: 'open' });
    const second = await engine.extractGoals(a.userId, 't', 'I need a sublet');
    expect(second.map((g) => g.id)).toEqual(first.map((g) => g.id));
    expect(count(db, 'goals')).toBe(1);
  });

  it.each([
    ['malformed', 'nope'],
    ['no objective', goals()],
    ['bad shape', '{"goals":[{"description":5}]}'],
  ])('%s output creates no goal', async (_n, raw) => {
    const db = freshDb();
    const a = addUser(db, 'alice');
    addTask(db, 't', a.userId, ['price']);
    expect(await createMemoryEngine(db, fakeOpenAI(raw).client).extractGoals(a.userId, 't', 'hi')).toEqual([]);
    expect(count(db, 'goals')).toBe(0);
  });

  it('client failure creates no goal', async () => {
    const db = freshDb();
    const a = addUser(db, 'alice');
    addTask(db, 't', a.userId, ['price']);
    expect(await createMemoryEngine(db, fakeOpenAI(new Error('x')).client).extractGoals(a.userId, 't', 'hi')).toEqual([]);
  });

  it('refuses tasks the user does not own', async () => {
    const db = freshDb();
    const a = addUser(db, 'alice');
    const b = addUser(db, 'bob');
    addTask(db, 't', a.userId, ['price']);
    const engine = createMemoryEngine(db, fakeOpenAI(goals('steal')).client);
    await expect(engine.extractGoals(b.userId, 't', 'hi')).rejects.toThrow();
    await expect(engine.extractGoals(a.userId, 'missing', 'hi')).rejects.toThrow();
    expect(count(db, 'goals')).toBe(0);
  });
});

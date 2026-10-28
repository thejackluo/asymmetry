import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from './events.js';
import { createAgentRuntime } from './runtime.js';
import { createTask, getTask, getTaskScope, listMainThreadMessages, listSubchatsByTask, putTaskScope } from './repo.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';
import { createFakeIO } from './test/fakeIO.js';
import { createFakeMemory } from './test/fakeMemory.js';
import { routedLLM } from './test/routedLLM.js';

vi.mock('./repo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repo.js')>();
  return {
    ...actual,
    getTaskScope: vi.fn(actual.getTaskScope),
    listMainThreadMessages: vi.fn(actual.listMainThreadMessages),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('post-persistence inbox failures', () => {
  it('reports a safe stuck result after an internal scope lookup failure without a second ack', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO();
    const { memory } = createFakeMemory();
    const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a summer room');
    putTaskScope(db, {
      taskId: task.id,
      purpose: 'find a summer room',
      fields: ['location_area', 'price', 'dates'],
    });
    const llm = routedLLM({});
    const runtime = createAgentRuntime({ io, db, memory, llm });
    const marker = 'POST-PERSIST-SENTINEL';
    const errorName = 'POST-PERSIST-ERROR-NAME';
    const failure = Object.assign(new Error(marker), { name: errorName });
    const logSpies = [
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
    ];
    let acked = false;
    vi.mocked(getTaskScope).mockImplementationOnce(() => {
      expect(acked).toBe(true);
      throw failure;
    });
    try {
      const ack = vi.fn(() => {
        acked = true;
      });
      await runtime.handleChatSend({
        data: { userId: FIXTURE_IDS.users.alice },
      } as never, {
        taskId: task.id,
        body: 'The initial request',
      }, ack);

      const rows = listMainThreadMessages(db, task.id);
      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith({
        ok: true,
        data: expect.objectContaining({ body: 'The initial request' }),
      });
      expect(getTask(db, task.id)?.status).toBe('stuck');
      expect(rows.map(({ body }) => body)).toContain('Task stopped after an internal error.');
      const logs = JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls));
      const payloads = JSON.stringify(emissions.map(({ payload }) => payload));
      expect(logs).not.toContain(marker);
      expect(logs).not.toContain(errorName);
      expect(payloads).not.toContain(marker);
      expect(payloads).not.toContain(errorName);
      expect(JSON.stringify(rows)).not.toContain(marker);
      expect(JSON.stringify(rows)).not.toContain(errorName);
      expect(llm.calls).toHaveLength(0);
      expect(emissions.some(({ event }) => event === EVENTS.TASK_UPDATED)).toBe(true);
    } finally {
      logSpies.forEach((spy) => spy.mockRestore());
      db.close();
    }
  });

  it('maps provider quota exhaustion to an actionable stuck summary without leaking secrets', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO();
    const { memory } = createFakeMemory();
    const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a summer room');
    const providerError = Object.assign(new Error('PROVIDER-SECRET'), {
      status: 429,
      code: 'credit_balance_exhausted',
      name: 'PROVIDER-SECRET-NAME',
    });
    const llm = routedLLM({ scope: [() => { throw providerError; }] });
    const runtime = createAgentRuntime({ io, db, memory, llm });
    const logSpies = [
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
    ];
    try {
      const ack = vi.fn();
      await runtime.handleChatSend({
        data: { userId: FIXTURE_IDS.users.alice },
      } as never, {
        taskId: task.id,
        body: 'hello wanna buy honda civic 10000$ below, not crashed',
      }, ack);

      const rows = listMainThreadMessages(db, task.id);
      const expected = 'Model service credits are exhausted. Add credits or configure a funded API key, then create a new task.';
      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith({
        ok: true,
        data: expect.objectContaining({ body: 'hello wanna buy honda civic 10000$ below, not crashed' }),
      });
      expect(getTask(db, task.id)?.status).toBe('stuck');
      expect(rows.map(({ body }) => body)).toContain(expected);
      expect(getTaskScope(db, task.id)).toBeNull();
      expect(llm.calls).toHaveLength(1);
      const logs = JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls));
      const payloads = JSON.stringify(emissions.map(({ payload }) => payload));
      expect(logs).not.toContain('PROVIDER-SECRET');
      expect(payloads).not.toContain('PROVIDER-SECRET');
      expect(emissions.filter(({ event }) => event === EVENTS.CHAT_MESSAGE)
        .some(({ payload }) => JSON.stringify(payload).includes(expected))).toBe(true);
      expect(emissions.filter(({ event }) => event === EVENTS.TASK_UPDATED)
        .some(({ payload }) => JSON.stringify(payload).includes('stuck'))).toBe(true);
      expect(emissions.some(({ event }) => event === EVENTS.SUBCHAT_STARTED)).toBe(false);
      expect(listSubchatsByTask(db, task.id)).toHaveLength(0);
      const allText = JSON.stringify(rows) + payloads + logs;
      expect(allText).not.toContain('PROVIDER-SECRET');
      expect(allText).not.toContain('PROVIDER-SECRET-NAME');
    } finally {
      logSpies.forEach((spy) => spy.mockRestore());
      db.close();
    }
  });

  it('keeps a scope-setup DB read failure as generic internal error without model calls', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO();
    const { memory } = createFakeMemory();
    const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a summer room');
    const dbError = new Error('DB-SENTINEL-9f2c');
    const llm = routedLLM({ scope: [() => { throw new Error('unreachable'); }] });
    const runtime = createAgentRuntime({ io, db, memory, llm });
    const logSpies = [
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
    ];
    vi.mocked(listMainThreadMessages).mockImplementationOnce(() => {
      throw dbError;
    });
    try {
      const ack = vi.fn();
      await runtime.handleChatSend({
        data: { userId: FIXTURE_IDS.users.alice },
      } as never, {
        taskId: task.id,
        body: 'Find me a room under budget',
      }, ack);

      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith({
        ok: true,
        data: expect.objectContaining({ body: 'Find me a room under budget' }),
      });
      expect(getTask(db, task.id)?.status).toBe('stuck');
      const rows = listMainThreadMessages(db, task.id);
      expect(rows.map(({ body }) => body)).toContain('Task stopped after an internal error.');
      expect(llm.calls).toHaveLength(0);
      const allText = JSON.stringify(rows)
        + JSON.stringify(emissions.map(({ payload }) => payload))
        + JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls));
      expect(allText).not.toContain('DB-SENTINEL-9f2c');
    } finally {
      logSpies.forEach((spy) => spy.mockRestore());
      db.close();
    }
  });
});

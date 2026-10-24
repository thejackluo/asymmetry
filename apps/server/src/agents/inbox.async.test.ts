import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from './events.js';
import { createAgentRuntime } from './runtime.js';
import { createTask, getTask, getTaskScope, listMainThreadMessages, putTaskScope } from './repo.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';
import { createFakeIO } from './test/fakeIO.js';
import { createFakeMemory } from './test/fakeMemory.js';
import { routedLLM } from './test/routedLLM.js';

vi.mock('./repo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repo.js')>();
  return {
    ...actual,
    getTaskScope: vi.fn(actual.getTaskScope),
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
    const task = createTask(db, FIXTURE_IDS.users.bayzhan, 'Find a summer room');
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
        data: { userId: FIXTURE_IDS.users.bayzhan },
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
});

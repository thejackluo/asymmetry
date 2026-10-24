import type { Socket } from 'socket.io';
import { describe, expect, it, vi } from 'vitest';
import { userRoom } from '@asymmetry/shared';
import { createAgentRuntime } from './runtime.js';
import { EVENTS } from './events.js';
import { createTask, getTask, getTaskScope, listMainThreadMessages, listSubchatsByTask, listSubchatMessages, putTaskScope } from './repo.js';
import { networkPayload } from './peers.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';
import { createFakeIO } from './test/fakeIO.js';
import { createFakeMemory } from './test/fakeMemory.js';
import { llmTool, routedLLM } from './test/routedLLM.js';

function fakeSocket(userId: string | undefined): Socket {
  return { data: { userId } } as unknown as Socket;
}

describe('agent inbox handlers', () => {
  it('returns contract acks for task creation without starting a model request', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO((emission) => {
      if (emission.event === EVENTS.TASK_CREATED) {
        expect(db.inTransaction).toBe(false);
        expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 1 });
      }
    });
    const llm = routedLLM({});
    const runtime = createAgentRuntime({ io, db, memory: createFakeMemory().memory, llm });
    try {
      const createdAck = vi.fn((_result: unknown) => {
        expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 1 });
      });
      await runtime.handleTaskCreate(fakeSocket(FIXTURE_IDS.users.alice), { title: '  Find a room  ' }, createdAck);
      expect(createdAck).toHaveBeenCalledWith({
        ok: true,
        data: expect.objectContaining({ title: 'Find a room' }),
      });
      expect(Object.keys(createdAck.mock.calls[0]?.[0] as Record<string, unknown>).sort()).toEqual(['data', 'ok']);
      expect(emissions.filter(({ event }) => event === EVENTS.TASK_CREATED)).toHaveLength(1);
      expect(llm.calls).toHaveLength(0);

      const invalidAck = vi.fn();
      await runtime.handleTaskCreate(fakeSocket(FIXTURE_IDS.users.alice), { title: '   ' }, invalidAck);
      expect(invalidAck).toHaveBeenCalledWith({
        ok: false,
        error: {
          code: 'BAD_INPUT',
          message: 'title must be between 1 and 200 characters',
        },
      });

      const unauthenticatedAck = vi.fn();
      await runtime.handleTaskCreate(fakeSocket(undefined), { title: 'A task' }, unauthenticatedAck);
      expect(unauthenticatedAck).toHaveBeenCalledWith({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'authenticated user is required' },
      });
      expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it('validates chat payloads and returns UNAUTHORIZED or NOT_FOUND for rejected commands', async () => {
    const db = createFixtureDb();
    const { io } = createFakeIO();
    const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a room');
    const runtime = createAgentRuntime({ io, db, memory: createFakeMemory().memory, llm: routedLLM({}) });
    try {
      for (const body of ['', '   ', 'x'.repeat(4001)]) {
        const ack = vi.fn();
        await runtime.handleChatSend(fakeSocket(FIXTURE_IDS.users.alice), { taskId: task.id, body }, ack);
        expect(ack).toHaveBeenCalledWith({
          ok: false,
          error: { code: 'BAD_INPUT', message: expect.any(String) },
        });
      }

      const unauthenticated = vi.fn();
      await runtime.handleChatSend(fakeSocket(undefined), { taskId: task.id, body: 'Need a room' }, unauthenticated);
      expect(unauthenticated).toHaveBeenCalledWith({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'authenticated user is required' },
      });

      const notFound = vi.fn();
      await runtime.handleChatSend(fakeSocket(FIXTURE_IDS.users.dave), { taskId: task.id, body: 'Need a room' }, notFound);
      expect(notFound).toHaveBeenCalledWith({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'task not found or not owned by this user' },
      });
      expect(db.prepare('SELECT COUNT(*) AS count FROM messages').get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it('returns generic INTERNAL_ERROR acks for failed writes without leaking database errors', async () => {
    const db = createFixtureDb();
    const { io } = createFakeIO();
    const runtime = createAgentRuntime({ io, db, memory: createFakeMemory().memory, llm: routedLLM({}) });
    const rawError = 'raw database failure marker';
    try {
      db.exec(`CREATE TRIGGER reject_task BEFORE INSERT ON tasks
        BEGIN SELECT RAISE(ABORT, '${rawError}'); END`);
      const taskAck = vi.fn();
      await runtime.handleTaskCreate(fakeSocket(FIXTURE_IDS.users.alice), { title: 'A room' }, taskAck);
      expect(taskAck).toHaveBeenCalledWith({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
      expect(JSON.stringify(taskAck.mock.calls)).not.toContain(rawError);

      db.exec('DROP TRIGGER reject_task');
      const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a room');
      db.exec(`CREATE TRIGGER reject_message BEFORE INSERT ON messages
        BEGIN SELECT RAISE(ABORT, '${rawError}'); END`);
      const chatAck = vi.fn();
      await runtime.handleChatSend(fakeSocket(FIXTURE_IDS.users.alice), {
        taskId: task.id,
        body: 'Need a room',
      }, chatAck);
      expect(chatAck).toHaveBeenCalledWith({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
      expect(JSON.stringify(chatAck.mock.calls)).not.toContain(rawError);
    } finally {
      db.close();
    }
  });

  it('A2A-01: validates ownership, persists one human row, triggers once, and survives memory errors', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO((emission) => {
      if (
        emission.event === EVENTS.CHAT_MESSAGE
        && (emission.payload as { senderType?: string }).senderType === 'human'
      ) {
        expect(db.inTransaction).toBe(false);
      }
    });
    const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a summer room');
    putTaskScope(db, {
      taskId: task.id,
      purpose: 'find a summer room',
      fields: ['location_area', 'price', 'dates'],
    });
    const { memory, calls } = createFakeMemory({
      ingestError: new Error('ingest unavailable'),
      extractGoalsError: new Error('goal extractor unavailable'),
    });
    const llm = routedLLM({
      "Alice's Agent": [{ reply: 'I will look for a summer room.' }],
    });
    const runtime = createAgentRuntime({ io, db, memory, llm });
    try {
      const ack = vi.fn((_result: unknown) => {
        expect(listMainThreadMessages(db, task.id)
          .some(({ senderType, body }) => senderType === 'human' && body === 'Need a summer room.')).toBe(true);
      });
      await runtime.handleChatSend(fakeSocket(FIXTURE_IDS.users.alice), {
        taskId: task.id,
        body: 'Need a summer room.',
      }, ack);
      await runtime.idle();
      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith({
        ok: true,
        data: expect.objectContaining({
          senderType: 'human',
          body: 'Need a summer room.',
        }),
      });
      expect(Object.keys(ack.mock.calls[0]?.[0] as Record<string, unknown>).sort()).toEqual(['data', 'ok']);
      expect(listMainThreadMessages(db, task.id).filter(({ senderType }) => senderType === 'human')).toHaveLength(1);
      expect(emissions.filter(({ event, payload }) =>
        event === EVENTS.CHAT_MESSAGE && (payload as { senderType?: string }).senderType === 'human')).toHaveLength(1);
      expect(emissions.filter(({ event, payload }) =>
        event === EVENTS.CHAT_MESSAGE && (payload as { senderType?: string }).senderType === 'human')
        .every(({ room }) => room === userRoom(FIXTURE_IDS.users.alice))).toBe(true);
      expect(listMainThreadMessages(db, task.id).some(({ senderType }) => senderType === 'system')).toBe(false);
      expect(llm.calls.filter(({ route }) => route === "Alice's Agent")).toHaveLength(1);
      expect(calls.ingest).toEqual([{
        userId: FIXTURE_IDS.users.alice,
        text: 'Need a summer room.',
        source: 'chat',
      }]);
      expect(calls.extractGoals).toEqual([{
        userId: FIXTURE_IDS.users.alice,
        taskId: task.id,
        text: 'Need a summer room.',
      }]);

      const rejectedAck = vi.fn();
      await runtime.handleChatSend(fakeSocket(FIXTURE_IDS.users.dave), {
        taskId: task.id,
        body: 'Try to spoof Alice',
      }, rejectedAck);
      expect(rejectedAck).toHaveBeenCalledWith({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'task not found or not owned by this user' },
      });
      expect(listMainThreadMessages(db, task.id).filter(({ senderType }) => senderType === 'human')).toHaveLength(1);
      expect(llm.calls.filter(({ route }) => route === "Alice's Agent")).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('A2A-07: transitions clarifying → negotiating → done after canonical scope is derived', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO();
    const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a summer room');
    const llm = routedLLM({
      scope: [llmTool('set_task_scope', {
        purpose: 'find a summer room',
        fields: ['location_area', 'price', 'dates'],
      })],
      "Alice's Agent": [
        llmTool('open_subchat', { taskId: task.id, agentIds: [FIXTURE_IDS.agents.bob] }),
        llmTool('report_to_human', {
          taskId: task.id,
          status: 'done',
          summary: 'I found a room and can propose a warm introduction.',
        }),
      ],
    });
    const runtime = createAgentRuntime({ io, db, memory: createFakeMemory().memory, llm });
    try {
      await runtime.handleChatSend(fakeSocket(FIXTURE_IDS.users.alice), {
        taskId: task.id,
        body: 'Near campus in summer under $1200.',
      });
      await runtime.idle();

      expect(getTaskScope(db, task.id)?.fields).toEqual(['location_area', 'price', 'dates']);
      expect(getTask(db, task.id)?.status).toBe('done');
      expect(emissions
        .filter(({ event, payload }) => event === EVENTS.AGENT_STATUS
          && (payload as { agentId?: string }).agentId === FIXTURE_IDS.agents.alice)
        .map(({ payload }) => (payload as { status: string }).status)).toEqual([
        'clarifying',
        'negotiating',
        'done',
      ]);
      expect(llm.calls.map(({ route }) => route)).toEqual([
        'scope',
        "Alice's Agent",
        "Alice's Agent",
      ]);
    } finally {
      db.close();
    }
  });

  it('uses one no-tools clarification per message and becomes stuck at the clarification cap', async () => {
    const db = createFixtureDb();
    const { io } = createFakeIO();
    const task = createTask(db, FIXTURE_IDS.users.alice, 'Help me find something');
    const llm = routedLLM({
      scope: [{}, {}, {}],
      "Alice's Agent": [
        { reply: 'What area should I focus on?' },
        { reply: 'What budget should I use?' },
      ],
    });
    const runtime = createAgentRuntime({ io, db, memory: createFakeMemory().memory, llm });
    try {
      for (const body of ['Help me find something.', 'I need a place.', 'Still looking.']) {
        await runtime.handleChatSend(fakeSocket(FIXTURE_IDS.users.alice), { taskId: task.id, body });
        await runtime.idle();
      }
      expect(llm.calls.filter(({ route }) => route === 'scope')).toHaveLength(3);
      const clarificationCalls = llm.calls.filter(({ route }) => route === "Alice's Agent");
      expect(clarificationCalls).toHaveLength(2);
      expect(clarificationCalls.every(({ tools }) => tools.length === 0)).toBe(true);
      expect(listMainThreadMessages(db, task.id)
        .filter(({ senderType }) => senderType === 'agent')
        .map(({ body }) => body)).toEqual([
        'What area should I focus on?',
        'What budget should I use?',
        "couldn't determine what information this task needs",
      ]);
      expect(getTask(db, task.id)?.status).toBe('stuck');
    } finally {
      db.close();
    }
  });

  it('A2A-12: completes the Alice/Bob/Erin demo with withheld facts and a warm-intro proposal only', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO();
    const task = createTask(
      db,
      FIXTURE_IDS.users.alice,
      'Find a room 0.4 miles from Georgia Tech, May 15–August 10, under $1200/mo',
    );
    const { memory, calls } = createFakeMemory({
      itemsByOwner: {
        [FIXTURE_IDS.users.bob]: [
        {
          id: 'fact-room-1',
          userId: FIXTURE_IDS.users.bob,
          content: 'A room 0.4 miles from Georgia Tech.',
          classification: 'network',
          fieldTags: ['location_area'],
          source: 'seed',
          createdAt: 1,
        },
        {
          id: 'fact-room-2',
          userId: FIXTURE_IDS.users.bob,
          content: '$950/month.',
          classification: 'network',
          fieldTags: ['price'],
          source: 'seed',
          createdAt: 2,
        },
        {
          id: 'fact-room-3',
          userId: FIXTURE_IDS.users.bob,
          content: 'Available May 15 through August 10.',
          classification: 'network',
          fieldTags: ['dates'],
          source: 'seed',
          createdAt: 3,
        },
        ],
      },
      withheldCountByOwner: { [FIXTURE_IDS.users.bob]: 3 },
    });
    const finalReportText = 'Bob has a room 0.4 miles from campus for $950/month from May 15 through August 10. Would you like a warm introduction?';
    const latestSubchatId = (messages: Array<{ role: string; content: string }>): string => {
      const toolMessage = [...messages].reverse().find(({ role }) => role === 'tool');
      if (!toolMessage) {
        throw new Error('expected a previous open_subchat tool result');
      }
      return (JSON.parse(toolMessage.content) as { id: string }).id;
    };
    const llm = routedLLM({
      scope: [llmTool('set_task_scope', {
        purpose: 'find a room near Georgia Tech for May 15 through August 10 under $1200/month',
        fields: ['location_area', 'price', 'dates'],
      })],
      "Alice's Agent": [
        llmTool('open_subchat', { taskId: task.id, agentIds: [FIXTURE_IDS.agents.bob] }),
        (messages) => ({
          toolCalls: [{
            id: 'send-to-bob',
            name: 'send_subchat_message',
            args: { subchatId: latestSubchatId(messages), body: 'Please share a room near Georgia Tech for May 15 through August 10 under $1200.' },
          }],
        }),
        { reply: 'I have asked Bob and will wait for his response.' },
        llmTool('open_subchat', { taskId: task.id, agentIds: [FIXTURE_IDS.agents.erin] }),
        (messages) => ({
          toolCalls: [{
            id: 'send-to-erin',
            name: 'send_subchat_message',
            args: { subchatId: latestSubchatId(messages), body: 'Do you know of summer sublets near Georgia Tech under $1200?' },
          }],
        }),
        { reply: 'I have also asked Erin for an option.' },
        llmTool('report_to_human', {
          taskId: task.id,
          status: 'done',
          summary: finalReportText,
        }),
      ],
      "Bob's Agent": [
        llmTool('query_memory', {
          ownerUserId: FIXTURE_IDS.users.bob,
          scope: { fields: ['location_area', 'price', 'dates'] },
        }),
        { reply: 'I have a room 0.4 miles from campus for $950/month, available May 15 through August 10.' },
      ],
      "Erin's Agent": [
        llmTool('query_memory', {
          ownerUserId: FIXTURE_IDS.users.erin,
          scope: { fields: ['location_area', 'price', 'dates'] },
        }),
        { reply: 'I know of a summer room near campus for $1150/month.' },
      ],
    });
    const runtime = createAgentRuntime({ io, db, memory, llm });
    try {
      await runtime.handleChatSend(fakeSocket(FIXTURE_IDS.users.alice), {
        taskId: task.id,
        body: 'Find a room 0.4 miles from Georgia Tech, May 15–August 10, under $1200/mo',
      });
      await runtime.idle();

      expect(getTaskScope(db, task.id)?.fields).toEqual(['location_area', 'price', 'dates']);
      expect(getTask(db, task.id)?.status).toBe('done');
      const subchats = listSubchatsByTask(db, task.id);
      expect(subchats).toHaveLength(2);
      expect(subchats[0]?.participantAgentIds).toContain(FIXTURE_IDS.agents.bob);
      expect(subchats[1]?.participantAgentIds).toContain(FIXTURE_IDS.agents.erin);
      expect(subchats.flatMap(({ id }) => listSubchatMessages(db, id))
        .some(({ body }) => body.includes('0.4 miles from campus'))).toBe(true);
      const bobCall = llm.calls.find(({ route, messages }) => route === "Bob's Agent"
        && messages.some(({ role }) => role === 'tool'));
      const bobFacts = JSON.parse(bobCall?.messages.find(({ role }) => role === 'tool')?.content ?? '{}') as {
        facts: string[];
        withheldCount: number;
      };
      expect(bobFacts.facts).toEqual([
        'A room 0.4 miles from Georgia Tech.',
        '$950/month.',
        'Available May 15 through August 10.',
      ]);
      expect(bobFacts.withheldCount).toBe(3);
      expect(calls.queryMemory.find(({ ownerUserId }) => ownerUserId === FIXTURE_IDS.users.bob)?.scope.fields)
        .toEqual(['location_area', 'price', 'dates']);
      expect(db.prepare('SELECT status FROM agents WHERE id = ?').get(FIXTURE_IDS.agents.bob))
        .toEqual({ status: 'idle' });
      expect(listMainThreadMessages(db, task.id).at(-1)?.body).toBe(finalReportText);
      expect(listMainThreadMessages(db, task.id).some(({ senderType }) => senderType === 'system')).toBe(false);
      expect(networkPayload(db, FIXTURE_IDS.users.alice).discovered).toContain(FIXTURE_IDS.agents.erin);
      expect(emissions.some(({ room }) => room === userRoom(FIXTURE_IDS.users.dave))).toBe(false);
      expect(emissions.some(({ event }) => event === EVENTS.DISCLOSURE_LOGGED)).toBe(false);
    } finally {
      db.close();
    }
  });
});

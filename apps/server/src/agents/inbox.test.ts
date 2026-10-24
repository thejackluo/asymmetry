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

function fakeSocket(userId: string): Socket {
  return { data: { userId } } as unknown as Socket;
}

describe('agent inbox handlers', () => {
  it('trims valid task titles and rejects invalid or unauthenticated task creation', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO();
    const runtime = createAgentRuntime({ io, db, memory: createFakeMemory().memory, llm: routedLLM({}) });
    try {
      const createdAck = vi.fn();
      await runtime.handleTaskCreate(fakeSocket(FIXTURE_IDS.users.alice), { title: '  Find a room  ' }, createdAck);
      expect(createdAck).toHaveBeenCalledWith(expect.objectContaining({
        ok: true,
        task: expect.objectContaining({ title: 'Find a room' }),
      }));
      expect(emissions.filter(({ event }) => event === EVENTS.TASK_CREATED)).toHaveLength(1);

      const invalidAck = vi.fn();
      await runtime.handleTaskCreate(fakeSocket(FIXTURE_IDS.users.alice), { title: '   ' }, invalidAck);
      expect(invalidAck).toHaveBeenCalledWith({
        ok: false,
        error: 'title must be between 1 and 200 characters',
      });

      const unauthenticatedAck = vi.fn();
      await runtime.handleTaskCreate(fakeSocket(''), { title: 'A task' }, unauthenticatedAck);
      expect(unauthenticatedAck).toHaveBeenCalledWith({
        ok: false,
        error: 'authenticated user is required',
      });
      expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it('A2A-01: validates ownership, persists one human row, triggers once, and survives memory errors', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO();
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
      const ack = vi.fn();
      await runtime.handleChatSend(fakeSocket(FIXTURE_IDS.users.alice), {
        taskId: task.id,
        body: 'Need a summer room.',
      }, ack);
      await runtime.idle();
      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
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
        error: 'task not found or not owned by this user',
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
      'Find a summer sublet near Georgia Tech, May–Aug, under $1200/mo',
    );
    const { memory } = createFakeMemory({
      itemsByOwner: {
        [FIXTURE_IDS.users.bob]: [
        {
          id: 'fact-room-1',
          userId: FIXTURE_IDS.users.bob,
          content: 'Room A near Georgia Tech, $1100/month, available May through August.',
          classification: 'network',
          fieldTags: ['location_area', 'price', 'dates'],
          source: 'seed',
          createdAt: 1,
        },
        {
          id: 'fact-room-2',
          userId: FIXTURE_IDS.users.bob,
          content: 'Room B near campus, $1150/month, available in summer.',
          classification: 'network',
          fieldTags: ['location_area', 'price', 'dates'],
          source: 'seed',
          createdAt: 2,
        },
        {
          id: 'fact-room-3',
          userId: FIXTURE_IDS.users.bob,
          content: 'Room C, $1000/month, available June through August.',
          classification: 'network',
          fieldTags: ['location_area', 'price', 'dates'],
          source: 'seed',
          createdAt: 3,
        },
        ],
      },
      withheldCountByOwner: { [FIXTURE_IDS.users.bob]: 2 },
    });
    const latestSubchatId = (messages: Array<{ role: string; content: string }>): string => {
      const toolMessage = [...messages].reverse().find(({ role }) => role === 'tool');
      if (!toolMessage) {
        throw new Error('expected a previous open_subchat tool result');
      }
      return (JSON.parse(toolMessage.content) as { id: string }).id;
    };
    const llm = routedLLM({
      scope: [llmTool('set_task_scope', {
        purpose: 'find a summer sublet near Georgia Tech',
        fields: ['location_area', 'price', 'dates'],
      })],
      "Alice's Agent": [
        llmTool('open_subchat', { taskId: task.id, agentIds: [FIXTURE_IDS.agents.bob] }),
        (messages) => ({
          toolCalls: [{
            id: 'send-to-bob',
            name: 'send_subchat_message',
            args: { subchatId: latestSubchatId(messages), body: 'Please share summer room options near Georgia Tech under $1200.' },
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
          summary: 'I found several summer options under $1200. Would you like me to propose a warm introduction to the owner of Room A?',
        }),
      ],
      "Bob's Agent": [
        llmTool('query_memory', {
          ownerUserId: FIXTURE_IDS.users.bob,
          scope: { fields: ['location_area', 'price', 'dates'] },
        }),
        { reply: 'Room A is near Georgia Tech for $1100/month from May through August.' },
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
        body: 'Find a summer sublet near Georgia Tech, May–Aug, under $1200/mo',
      });
      await runtime.idle();

      expect(getTaskScope(db, task.id)?.fields).toEqual(['location_area', 'price', 'dates']);
      expect(getTask(db, task.id)?.status).toBe('done');
      const subchats = listSubchatsByTask(db, task.id);
      expect(subchats).toHaveLength(2);
      expect(subchats[0]?.participantAgentIds).toContain(FIXTURE_IDS.agents.bob);
      expect(subchats[1]?.participantAgentIds).toContain(FIXTURE_IDS.agents.erin);
      expect(subchats.flatMap(({ id }) => listSubchatMessages(db, id))
        .some(({ body }) => body.includes('Room A is near Georgia Tech'))).toBe(true);
      const bobCall = llm.calls.find(({ route, messages }) => route === "Bob's Agent"
        && messages.some(({ role }) => role === 'tool'));
      const bobFacts = JSON.parse(bobCall?.messages.find(({ role }) => role === 'tool')?.content ?? '{}') as {
        facts: string[];
        withheldCount: number;
      };
      expect(bobFacts.facts).toHaveLength(3);
      expect(bobFacts.withheldCount).toBe(2);
      expect(db.prepare('SELECT status FROM agents WHERE id = ?').get(FIXTURE_IDS.agents.bob))
        .toEqual({ status: 'idle' });
      expect(listMainThreadMessages(db, task.id).at(-1)?.body).toContain('warm introduction');
      expect(listMainThreadMessages(db, task.id).some(({ senderType }) => senderType === 'system')).toBe(false);
      expect(networkPayload(db, FIXTURE_IDS.users.alice).discovered).toContain(FIXTURE_IDS.agents.erin);
      expect(emissions.some(({ room }) => room === userRoom(FIXTURE_IDS.users.dave))).toBe(false);
      expect(emissions.some(({ event }) => event === EVENTS.DISCLOSURE_LOGGED)).toBe(false);
    } finally {
      db.close();
    }
  });
});

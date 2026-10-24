import { describe, expect, it, vi } from 'vitest';
import { userRoom, type MemoryItem } from '@asymmetry/shared';
import { Budget } from './budgets.js';
import { EVENTS } from './events.js';
import {
  AGENT_TOOLS,
  executeToolCall,
  OWNER_AGENT_TOOLS,
  type RuntimeHooks,
  type TrustedCtx,
} from './tools.js';
import { mockLLM } from './llm.js';
import {
  createSubchat,
  createTask,
  getTask,
  getTaskScope,
  insertMessage,
  listMainThreadMessages,
  listSubchatMessages,
  listSubchatsByTask,
  putTaskScope,
} from './repo.js';
import { closeSubchatAndNotify } from './subchats.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';
import { createFakeIO } from './test/fakeIO.js';
import { createFakeMemory } from './test/fakeMemory.js';

function setup() {
  const db = createFixtureDb();
  const { io, emissions } = createFakeIO();
  const { memory, calls } = createFakeMemory({
    items: [{
      id: 'fact-1',
      userId: FIXTURE_IDS.users.bob,
      content: 'A room near campus',
      classification: 'network',
      fieldTags: ['location_area'],
      source: 'seed',
      createdAt: 1,
    }],
    withheldCount: 2,
  });
  const budget = new Budget('task');
  type ReleasedFact = { id: string; ownerAgentName: string; text: string };
  const releasedFacts = new Map<string, Map<string, ReleasedFact>>();
  const rt: RuntimeHooks & {
    recordPeerFacts(taskId: string, ownerAgentName: string, facts: Array<{ id: string; text: string }>): void;
    takePeerFacts(taskId: string): ReleasedFact[];
  } = {
    budgetFor: vi.fn(() => budget),
    wakeOwner: vi.fn(),
    reportOwnerFailure: vi.fn(async () => {}),
    runPeer: vi.fn(),
    recordPeerFacts(taskId, ownerAgentName, facts) {
      let byId = releasedFacts.get(taskId);
      if (!byId) {
        byId = new Map();
        releasedFacts.set(taskId, byId);
      }
      for (const fact of facts) {
        byId.set(fact.id, { ...fact, ownerAgentName });
      }
    },
    takePeerFacts(taskId) {
      const facts = [...(releasedFacts.get(taskId)?.values() ?? [])];
      releasedFacts.delete(taskId);
      return facts;
    },
  };
  const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a summer sublet');
  const scope = { taskId: task.id, purpose: 'find a summer sublet', fields: ['location_area', 'price', 'dates'] };
  putTaskScope(db, scope);
  const ownerCtx: TrustedCtx = {
    db,
    io,
    memory,
    rt,
    taskId: task.id,
    taskOwnerUserId: FIXTURE_IDS.users.alice,
    ownerAgentId: FIXTURE_IDS.agents.alice,
    actingAgentId: FIXTURE_IDS.agents.alice,
    mode: 'owner',
    subchatId: null,
  };
  return { db, io, emissions, memory, calls, budget, rt, task, scope, ownerCtx };
}

function toolCall(name: string, args: unknown) {
  return { id: `call-${name}`, name, args };
}

describe('trusted-context agent tools', () => {
  it('offers owners an ID-only relay tool while peers retain their own message body', () => {
    const ownerTool = OWNER_AGENT_TOOLS.find(({ name }) => name === 'send_subchat_message');
    const peerTool = AGENT_TOOLS.find(({ name }) => name === 'send_subchat_message');

    expect(ownerTool?.parameters).toMatchObject({
      properties: { subchatId: { type: 'string' } },
      required: ['subchatId'],
    });
    expect(ownerTool?.parameters).not.toHaveProperty('properties.body');
    expect(peerTool?.parameters).toHaveProperty('properties.body');
  });

  it('A2A-02/03: opens authorized pair and group subchats and rejects invalid peers/modes', async () => {
    const { db, ownerCtx, rt, emissions } = setup();
    try {
      const pairResult = await executeToolCall(ownerCtx, toolCall('open_subchat', {
        taskId: ownerCtx.taskId,
        agentIds: [FIXTURE_IDS.agents.bob],
      }));
      const pair = JSON.parse(pairResult.content) as { id: string; kind: string };
      expect(pair.kind).toBe('pair');
      expect(emissions.some(({ event }) => event === EVENTS.SUBCHAT_STARTED)).toBe(true);

      const groupResult = await executeToolCall(ownerCtx, toolCall('open_subchat', {
        taskId: ownerCtx.taskId,
        agentIds: [FIXTURE_IDS.agents.carol, FIXTURE_IDS.agents.dave],
      }));
      expect(JSON.parse(groupResult.content).kind).toBe('group');

      for (const agentIds of [
        [FIXTURE_IDS.agents.alice],
        ['agent-not-in-directory'],
      ]) {
        const rejected = await executeToolCall(ownerCtx, toolCall('open_subchat', {
          taskId: ownerCtx.taskId,
          agentIds,
        }));
        expect(rejected.content).toMatch(/^Error:/);
      }
      const capBudget = ownerCtx.rt.budgetFor(ownerCtx.taskId);
      for (const agentId of ['agent-one', 'agent-two', 'agent-three', 'agent-four']) {
        capBudget.addPeer(agentId);
      }
      const capResult = await executeToolCall(ownerCtx, toolCall('open_subchat', {
        taskId: ownerCtx.taskId,
        agentIds: [FIXTURE_IDS.agents.erin],
      }));
      expect(capResult.content).toContain('peer cap');

      const peerResult = await executeToolCall({
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.bob,
        mode: 'peer',
        subchatId: pair.id,
      }, toolCall('open_subchat', {
        taskId: ownerCtx.taskId,
        agentIds: [FIXTURE_IDS.agents.carol],
      }));
      expect(peerResult.content).toMatch(/^Error:/);
      expect(vi.mocked(rt.budgetFor)).toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it('rejects a second subchat with a peer already used by the task', async () => {
    const { db, ownerCtx } = setup();
    try {
      const first = await executeToolCall(ownerCtx, toolCall('open_subchat', {
        taskId: ownerCtx.taskId,
        agentIds: [FIXTURE_IDS.agents.bob],
      }));
      expect(first.content).not.toMatch(/^Error:/);

      const second = await executeToolCall(ownerCtx, toolCall('open_subchat', {
        taskId: ownerCtx.taskId,
        agentIds: [FIXTURE_IDS.agents.bob],
      }));
      expect(second.content).toMatch(/^Error:/);
      expect(listSubchatsByTask(db, ownerCtx.taskId)).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('rejects spoofed memory owners and enforces canonical scope and requester identity', async () => {
    const { db, ownerCtx, calls, memory, scope } = setup();
    try {
      const subchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const bobCtx: TrustedCtx = {
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.bob,
        mode: 'peer',
        subchatId: subchat.id,
      };
      const unbound = await executeToolCall({ ...bobCtx, subchatId: null }, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.bob,
        scope: { fields: ['location_area'] },
      }));
      expect(unbound.content).toContain('subchat');
      expect(calls.queryMemory).toHaveLength(0);

      const spoofed = await executeToolCall(bobCtx, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.alice,
        scope: { fields: ['location_area'] },
      }));
      expect(spoofed.content).toContain('acting agent’s owner');
      expect(calls.queryMemory).toHaveLength(0);

      const correct = await executeToolCall(bobCtx, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.bob,
        scope: { fields: ['location_area', 'price'] },
      }));
      expect(JSON.parse(correct.content)).toEqual({
        facts: ['A room near campus'],
        withheldCount: 2,
      });
      expect(calls.queryMemory).toEqual([{
        ownerUserId: FIXTURE_IDS.users.bob,
        requesterUserId: FIXTURE_IDS.users.alice,
        scope: {
          taskId: ownerCtx.taskId,
          purpose: scope.purpose,
          fields: ['location_area', 'price'],
          subchatId: subchat.id,
        },
      }]);

      const outsideScope = await executeToolCall(bobCtx, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.bob,
        scope: { fields: ['location_area', 'mechanic'] },
      }));
      expect(outsideScope.content).toContain('outside the canonical');
      expect(calls.queryMemory).toHaveLength(1);

      db.prepare('DELETE FROM task_scopes WHERE task_id = ?').run(ownerCtx.taskId);
      const noScope = await executeToolCall(bobCtx, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.bob,
        scope: { fields: ['location_area'] },
      }));
      expect(noScope.content).toContain('canonical task scope');
      expect(getTaskScope(db, ownerCtx.taskId)).toBeNull();
      expect(memory).toBeDefined();
    } finally {
      db.close();
    }
  });

  it('fails closed for mismatched or non-participating peer memory contexts', async () => {
    const { db, ownerCtx, calls } = setup();
    try {
      const otherTask = createTask(db, FIXTURE_IDS.users.bob, 'Another task');
      putTaskScope(db, {
        taskId: otherTask.id,
        purpose: 'another task',
        fields: ['location_area'],
      });
      const mismatchedSubchat = createSubchat(db, otherTask.id, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const bobCtx: TrustedCtx = {
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.bob,
        mode: 'peer',
        subchatId: mismatchedSubchat.id,
      };
      const mismatched = await executeToolCall(bobCtx, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.bob,
        scope: { fields: ['location_area'] },
      }));
      expect(mismatched.content).toContain('subchat');

      const missingOwnerSubchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.bob,
        FIXTURE_IDS.agents.carol,
      ]);
      const missingOwner = await executeToolCall({
        ...bobCtx,
        taskId: ownerCtx.taskId,
        subchatId: missingOwnerSubchat.id,
      }, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.bob,
        scope: { fields: ['location_area'] },
      }));
      expect(missingOwner.content).toContain('subchat');

      const missingRequesterSubchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.carol,
      ]);
      const missingRequester = await executeToolCall({
        ...bobCtx,
        taskId: ownerCtx.taskId,
        subchatId: missingRequesterSubchat.id,
      }, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.bob,
        scope: { fields: ['location_area'] },
      }));
      expect(missingRequester.content).toContain('subchat');
      expect(calls.queryMemory).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('does not expose memory engine exceptions to the model', async () => {
    const { db, ownerCtx, task, scope } = setup();
    try {
      const subchat = createSubchat(db, task.id, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const errorMessage = 'private disclosure audit details';
      const { memory } = createFakeMemory({ queryMemoryError: new Error(errorMessage) });
      const result = await executeToolCall({
        ...ownerCtx,
        memory,
        actingAgentId: FIXTURE_IDS.agents.bob,
        mode: 'peer',
        subchatId: subchat.id,
      }, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.bob,
        scope: { fields: ['location_area'] },
      }));

      expect(result.content).toBe('Error: no data available for this request');
      expect(result.content).not.toContain(errorMessage);
      expect(scope.fields).toContain('location_area');
    } finally {
      db.close();
    }
  });

  it('uses the task owner as requester for owner-mode memory queries', async () => {
    const { db, ownerCtx, calls } = setup();
    try {
      const result = await executeToolCall(ownerCtx, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.alice,
        scope: { fields: ['price'] },
      }));
      expect(JSON.parse(result.content).withheldCount).toBe(2);
      expect(calls.queryMemory[0]).toEqual({
        ownerUserId: FIXTURE_IDS.users.alice,
        requesterUserId: FIXTURE_IDS.users.alice,
        scope: {
          taskId: ownerCtx.taskId,
          purpose: 'find a summer sublet',
          fields: ['price'],
        },
      });
    } finally {
      db.close();
    }
  });

  it('rejects owner-self memory reads when the task belongs to another owner', async () => {
    const { db, ownerCtx, calls } = setup();
    try {
      const bobTask = createTask(db, FIXTURE_IDS.users.bob, 'Bob task');
      putTaskScope(db, {
        taskId: bobTask.id,
        purpose: 'Bob task',
        fields: ['location_area'],
      });
      const result = await executeToolCall({
        ...ownerCtx,
        taskId: bobTask.id,
      }, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.alice,
        scope: { fields: ['location_area'] },
      }));

      expect(result.content).toMatch(/^Error:/);
      expect(calls.queryMemory).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('A2A-04: sends owner requests to every peer but rejects non-participants', async () => {
    const { db, ownerCtx, rt, emissions } = setup();
    try {
      const subchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
        FIXTURE_IDS.agents.carol,
      ]);
      const result = await executeToolCall(ownerCtx, toolCall('send_subchat_message', {
        subchatId: subchat.id,
      }));
      expect(result.content).toContain('Please return only information authorized');
      expect(vi.mocked(rt.runPeer)).toHaveBeenCalledWith(subchat.id, FIXTURE_IDS.agents.bob);
      expect(vi.mocked(rt.runPeer)).toHaveBeenCalledWith(subchat.id, FIXTURE_IDS.agents.carol);
      expect(emissions.some(({ event }) => event === EVENTS.SUBCHAT_MESSAGE)).toBe(true);

      const outsider = await executeToolCall({
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.dave,
        mode: 'peer',
        subchatId: subchat.id,
      }, toolCall('send_subchat_message', { body: 'No participation' }));
      expect(outsider.content).toContain('not a subchat participant');
    } finally {
      db.close();
    }
  });

  it('closes a subchat done after one explicit peer reply and wakes the owner once', async () => {
    const { db, ownerCtx, rt, emissions } = setup();
    try {
      const subchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const result = await executeToolCall({
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.bob,
        mode: 'peer',
        subchatId: subchat.id,
      }, toolCall('send_subchat_message', {
        body: 'I can share the authorized room facts.',
      }));

      expect(result.content).toContain('authorized room facts');
      expect(listSubchatsByTask(db, ownerCtx.taskId)[0]).toMatchObject({
        status: 'closed',
        outcome: 'done',
      });
      expect(emissions.find(({ event }) => event === EVENTS.SUBCHAT_CLOSED)?.payload).toMatchObject({
        subchatId: subchat.id,
        outcome: 'done',
      });
      expect(vi.mocked(rt.wakeOwner)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(rt.wakeOwner)).toHaveBeenCalledWith(ownerCtx.taskId);
    } finally {
      db.close();
    }
  });

  it('keeps a group subchat open until every peer replies, then lets the owner report done', async () => {
    const { db, ownerCtx, rt } = setup();
    try {
      const subchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
        FIXTURE_IDS.agents.carol,
      ]);
      await executeToolCall(ownerCtx, toolCall('send_subchat_message', {
        subchatId: subchat.id,
      }));
      vi.mocked(rt.runPeer).mockClear();
      vi.mocked(rt.wakeOwner).mockClear();

      const sendPeerReply = (agentId: string, body: string) => executeToolCall({
        ...ownerCtx,
        actingAgentId: agentId,
        mode: 'peer',
        subchatId: subchat.id,
      }, toolCall('send_subchat_message', { body }));

      await sendPeerReply(FIXTURE_IDS.agents.bob, 'Bob can share the room facts.');
      expect(listSubchatsByTask(db, ownerCtx.taskId)[0]).toMatchObject({
        status: 'open',
        outcome: null,
      });
      expect(vi.mocked(rt.wakeOwner)).not.toHaveBeenCalled();
      expect(vi.mocked(rt.runPeer)).not.toHaveBeenCalled();

      await sendPeerReply(FIXTURE_IDS.agents.carol, 'Carol has nothing relevant.');
      expect(listSubchatsByTask(db, ownerCtx.taskId)[0]).toMatchObject({
        status: 'closed',
        outcome: 'done',
      });
      expect(vi.mocked(rt.wakeOwner)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(rt.wakeOwner)).toHaveBeenCalledWith(ownerCtx.taskId);
      expect(vi.mocked(rt.runPeer)).not.toHaveBeenCalled();

      const report = await executeToolCall(ownerCtx, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'done',
        summary: 'Bob found a match and Carol had nothing relevant.',
      }));
      expect(report.stop).toBe(true);
      expect(getTask(db, ownerCtx.taskId)?.status).toBe('done');
    } finally {
      db.close();
    }
  });

  it('rejects owner messages to a closed subchat without scheduling a peer run', async () => {
    const { db, ownerCtx, rt } = setup();
    try {
      const subchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      closeSubchatAndNotify(db, ownerCtx.io, subchat.id, 'done', 'Peer response received.');
      vi.mocked(rt.runPeer).mockClear();

      const result = await executeToolCall(ownerCtx, toolCall('send_subchat_message', {
        subchatId: subchat.id,
      }));

      expect(result.content).toMatch(/^Error:/);
      expect(vi.mocked(rt.runPeer)).not.toHaveBeenCalled();
      expect(listSubchatMessages(db, subchat.id)).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('closes at the turn cap before persisting and wakes the owner', async () => {
    const { db, ownerCtx, budget, rt, emissions } = setup();
    try {
      const subchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      for (let turn = 0; turn < 12; turn += 1) {
        expect(budget.reserveSubchatTurn(subchat.id)).toBe(true);
      }
      const before = listMainThreadMessages(db, ownerCtx.taskId);
      const rejected = await executeToolCall(ownerCtx, toolCall('send_subchat_message', {
        subchatId: subchat.id,
        body: 'This should not persist',
      }));
      expect(rejected.content).toContain('turn cap');
      expect(db.prepare('SELECT status FROM subchats WHERE id = ?').get(subchat.id)).toEqual({ status: 'closed' });
      expect(listMainThreadMessages(db, ownerCtx.taskId)).toEqual(before);
      expect(emissions.find(({ event }) => event === EVENTS.SUBCHAT_CLOSED)?.payload).toEqual({
        subchatId: subchat.id,
        outcome: 'stuck',
        summary: 'turn cap reached',
      });
      expect(vi.mocked(rt.wakeOwner)).toHaveBeenCalledWith(
        ownerCtx.taskId,
        expect.stringContaining('turn cap'),
      );
    } finally {
      db.close();
    }
  });

  it('A2A-06: blocks peer completion and lets the owner report and close open subchats', async () => {
    const { db, ownerCtx, emissions } = setup();
    try {
      const subchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const peerResult = await executeToolCall({
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.bob,
        mode: 'peer',
        subchatId: subchat.id,
      }, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'done',
        summary: 'Peer cannot finish',
      }));
      expect(peerResult.content).toBe("only the task owner's agent can finish this task");

      await executeToolCall({
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.bob,
        mode: 'peer',
        subchatId: subchat.id,
      }, toolCall('send_subchat_message', {
        body: 'A room is available.',
      }));
      const report = await executeToolCall(ownerCtx, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'done',
        summary: 'A room is available; I can propose a warm introduction.',
      }));
      expect(report.stop).toBe(true);
      expect(getTask(db, ownerCtx.taskId)?.status).toBe('done');
      expect(db.prepare('SELECT status FROM subchats WHERE id = ?').get(subchat.id)).toEqual({ status: 'closed' });
      expect(listMainThreadMessages(db, ownerCtx.taskId)
        .some(({ body }) => body.includes('warm introduction'))).toBe(true);
      expect(emissions.some(({ event }) => event === EVENTS.TASK_UPDATED)).toBe(true);
      expect(emissions.some(({ event, payload }) => event === EVENTS.SUBCHAT_CLOSED
        && (payload as { outcome?: string }).outcome === 'done')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('keeps an owner report out of every peer event, closure payload, and row', async () => {
    const { db, ownerCtx, emissions } = setup();
    try {
      const bobSubchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const erinSubchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.erin,
      ]);
      insertMessage(db, {
        taskId: ownerCtx.taskId,
        subchatId: erinSubchat.id,
        senderType: 'agent',
        senderId: FIXTURE_IDS.agents.alice,
        body: 'Can you check for any other options?',
      });
      const sentinel = 'BOBNET-91c';
      const summary = `Bob found a room for $950. ${sentinel}`;

      await executeToolCall({
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.bob,
        mode: 'peer',
        subchatId: bobSubchat.id,
      }, toolCall('send_subchat_message', { body: 'Bob has an authorized reply.' }));
      await executeToolCall({
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.erin,
        mode: 'peer',
        subchatId: erinSubchat.id,
      }, toolCall('send_subchat_message', { body: 'Erin has an authorized reply.' }));
      const report = await executeToolCall(ownerCtx, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'done',
        summary,
      }));

      expect(report.stop).toBe(true);
      expect(listMainThreadMessages(db, ownerCtx.taskId).some(({ body }) => body === summary)).toBe(true);
      const erinPayloads = emissions
        .filter(({ room }) => room === userRoom(FIXTURE_IDS.users.erin))
        .map(({ event, payload }) => `${event} ${JSON.stringify(payload)}`)
        .join('\n');
      expect(erinPayloads).not.toContain(sentinel);
      expect(JSON.stringify(listSubchatMessages(db, erinSubchat.id))).not.toContain(sentinel);
      const erinClosure = emissions.find(({ room, event, payload }) =>
        room === userRoom(FIXTURE_IDS.users.erin)
        && event === EVENTS.SUBCHAT_CLOSED
        && (payload as { subchatId?: string }).subchatId === erinSubchat.id);
      expect(erinClosure?.payload).toEqual({
        subchatId: erinSubchat.id,
        outcome: 'done',
        summary: 'Closed: all peers provided a response.',
      });
      expect(db.prepare('SELECT summary FROM subchats WHERE id = ?').get(erinSubchat.id)).toEqual({
        summary: 'Closed: all peers provided a response.',
      });
      expect(db.prepare('SELECT summary FROM subchats WHERE id = ?').get(bobSubchat.id)).toEqual({
        summary: 'Closed: all peers provided a response.',
      });
    } finally {
      db.close();
    }
  });

  it('rejects model reports while peers are replying without changing the task', async () => {
    const { db, ownerCtx } = setup();
    try {
      const subchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const report = await executeToolCall(ownerCtx, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'stuck',
        summary: 'I have not received a response yet.',
      }));

      expect(report.content).toBe(
        'Error: peers are still replying; end your turn with a short status message and you will be woken when they answer.',
      );
      expect(getTask(db, ownerCtx.taskId)?.status).toBe('active');
      expect(listSubchatsByTask(db, ownerCtx.taskId)[0]).toMatchObject({
        status: 'open',
        outcome: null,
      });
      expect(listMainThreadMessages(db, ownerCtx.taskId)).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('replaces an owner-supplied peer message with the canonical field request', async () => {
    const { db, ownerCtx, emissions } = setup();
    try {
      const bobSubchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const erinSubchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.erin,
      ]);
      const sentinel = 'Bob found a room for $950, 0.4mi from campus.';
      const fixedBody = 'Please return only information authorized for these task fields: location_area, price, dates.';

      await executeToolCall(ownerCtx, toolCall('send_subchat_message', {
        subchatId: erinSubchat.id,
        body: sentinel,
      }));

      expect(listSubchatMessages(db, bobSubchat.id)).toHaveLength(0);
      expect(listSubchatMessages(db, erinSubchat.id).map(({ body }) => body)).toEqual([fixedBody]);
      const erinPayloads = emissions
        .filter(({ room }) => room === userRoom(FIXTURE_IDS.users.erin))
        .map(({ payload }) => JSON.stringify(payload))
        .join('\n');
      expect(erinPayloads).toContain(fixedBody);
      expect(erinPayloads).not.toContain('$950');
      expect(erinPayloads).not.toContain('0.4mi');
    } finally {
      db.close();
    }
  });

  it('keeps the owner negotiating while another scoped owned task remains active', async () => {
    const { db, ownerCtx } = setup();
    try {
      const otherTask = createTask(db, FIXTURE_IDS.users.alice, 'Another scoped task');
      putTaskScope(db, {
        taskId: otherTask.id,
        purpose: 'another task',
        fields: ['location_area'],
      });

      await executeToolCall(ownerCtx, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'done',
        summary: 'The reported task is complete.',
      }));

      expect(db.prepare('SELECT status FROM agents WHERE id = ?').get(FIXTURE_IDS.agents.alice))
        .toEqual({ status: 'negotiating' });
    } finally {
      db.close();
    }
  });

  it('keeps an owner negotiating while its agent participates in another owner’s open subchat', async () => {
    const { db, ownerCtx } = setup();
    try {
      const bobTask = createTask(db, FIXTURE_IDS.users.bob, 'Bob’s active task');
      putTaskScope(db, {
        taskId: bobTask.id,
        purpose: 'Bob’s active task',
        fields: ['price'],
      });
      createSubchat(db, bobTask.id, [
        FIXTURE_IDS.agents.bob,
        FIXTURE_IDS.agents.alice,
      ]);

      await executeToolCall(ownerCtx, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'done',
        summary: 'The reported task is complete.',
      }));

      expect(db.prepare('SELECT status FROM agents WHERE id = ?').get(FIXTURE_IDS.agents.alice))
        .toEqual({ status: 'negotiating' });
    } finally {
      db.close();
    }
  });

  it('keeps the owner clarifying while another owned active task is unscoped', async () => {
    const { db, ownerCtx } = setup();
    try {
      createTask(db, FIXTURE_IDS.users.alice, 'Another unscoped task');

      await executeToolCall(ownerCtx, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'done',
        summary: 'The reported task is complete.',
      }));

      expect(db.prepare('SELECT status FROM agents WHERE id = ?').get(FIXTURE_IDS.agents.alice))
        .toEqual({ status: 'clarifying' });
    } finally {
      db.close();
    }
  });

  it('uses the reported terminal status when the owner has no remaining work', async () => {
    const { db, ownerCtx } = setup();
    try {
      await executeToolCall(ownerCtx, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'done',
        summary: 'The reported task is complete.',
      }));

      expect(db.prepare('SELECT status FROM agents WHERE id = ?').get(FIXTURE_IDS.agents.alice))
        .toEqual({ status: 'done' });
    } finally {
      db.close();
    }
  });

  it('returns error strings for malformed and unknown tool calls without throwing', async () => {
    const { db, ownerCtx } = setup();
    try {
      await expect(executeToolCall(ownerCtx, toolCall('query_memory', null))).resolves.toMatchObject({
        content: expect.stringContaining('Invalid arguments'),
        stop: false,
      });
      await expect(executeToolCall(ownerCtx, toolCall('not_a_tool', {}))).resolves.toMatchObject({
        content: expect.stringContaining('unknown tool'),
        stop: false,
      });
    } finally {
      db.close();
    }
  });

  it('appends only released peer facts to the owner report', async () => {
    const { db, ownerCtx, emissions } = setup();
    try {
      const bobSubchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);
      const erinSubchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.erin,
      ]);
      const bobFacts: MemoryItem[] = [
        {
          id: 'bob-price-released',
          userId: FIXTURE_IDS.users.bob,
          content: 'Room rent is $950/mo.',
          classification: 'network',
          fieldTags: ['price'],
          source: 'seed',
          createdAt: 1,
        },
        {
          id: 'bob-location-released',
          userId: FIXTURE_IDS.users.bob,
          content: 'Room is 0.4mi from Georgia Tech.',
          classification: 'network',
          fieldTags: ['location_area'],
          source: 'seed',
          createdAt: 2,
        },
      ];
      const ownerOnlyFact: MemoryItem = {
        id: 'alice-owner-only',
        userId: FIXTURE_IDS.users.alice,
        content: 'OWNER-ONLY-SENTINEL',
        classification: 'private',
        fieldTags: ['price'],
        source: 'seed',
        createdAt: 3,
      };
      const withheldSentinel = 'WITHHELD-FACT-739';
      const { memory } = createFakeMemory({
        itemsByOwner: {
          [FIXTURE_IDS.users.alice]: [ownerOnlyFact],
          [FIXTURE_IDS.users.bob]: bobFacts,
        },
        withheldCountByOwner: { [FIXTURE_IDS.users.bob]: 1 },
      });
      const peerCtx: TrustedCtx = {
        ...ownerCtx,
        memory,
        actingAgentId: FIXTURE_IDS.agents.bob,
        mode: 'peer',
        subchatId: bobSubchat.id,
      };

      const peerQuery = toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.bob,
        scope: { fields: ['price', 'location_area'] },
      });
      const firstQuery = await executeToolCall(peerCtx, peerQuery);
      expect(JSON.parse(firstQuery.content).facts).toEqual(bobFacts.map(({ content }) => content));
      await executeToolCall(peerCtx, peerQuery);

      const ownerQuery = await executeToolCall({ ...ownerCtx, memory }, toolCall('query_memory', {
        ownerUserId: FIXTURE_IDS.users.alice,
        scope: { fields: ['price'] },
      }));
      expect(ownerQuery.content).toContain('OWNER-ONLY-SENTINEL');
      await executeToolCall(peerCtx, toolCall('send_subchat_message', {
        body: 'Bob can share the scoped room details.',
      }));
      await executeToolCall({
        ...ownerCtx,
        actingAgentId: FIXTURE_IDS.agents.erin,
        mode: 'peer',
        subchatId: erinSubchat.id,
      }, toolCall('send_subchat_message', {
        body: 'Erin has no additional option.',
      }));

      const ownerReport = 'I found a place, want an intro?';
      const ownerModel = mockLLM([{
        toolCalls: [{
          id: 'owner-report',
          name: 'report_to_human',
          args: {
            taskId: ownerCtx.taskId,
            status: 'done',
            summary: ownerReport,
          },
        }],
      }]);
      const ownerResult = await ownerModel.chat([], OWNER_AGENT_TOOLS);
      const reportCall = ownerResult.toolCalls?.[0];
      expect(reportCall).toBeDefined();
      if (!reportCall) {
        throw new Error('owner report tool call was not returned');
      }
      await executeToolCall({ ...ownerCtx, memory }, reportCall);

      const report = listMainThreadMessages(db, ownerCtx.taskId)
        .find(({ body }) => body.startsWith(ownerReport))?.body ?? '';
      expect(report).toContain(
        '\n\nShared with you:\n- Bob\'s Agent: Room rent is $950/mo.; Room is 0.4mi from Georgia Tech.',
      );
      expect(report.match(/\$950/g)).toHaveLength(1);
      expect(report).not.toContain('OWNER-ONLY-SENTINEL');
      expect(report).not.toContain(withheldSentinel);

      const erinPayloads = emissions
        .filter(({ room }) => room === userRoom(FIXTURE_IDS.users.erin))
        .map(({ event, payload }) => `${event} ${JSON.stringify(payload)}`)
        .join('\n');
      expect(erinPayloads).toContain('Closed: all peers provided a response.');
      expect(erinPayloads).not.toContain('$950');
      expect(erinPayloads).not.toContain('0.4mi');
      expect(erinPayloads).not.toContain('OWNER-ONLY-SENTINEL');
      expect(erinPayloads).not.toContain(withheldSentinel);
      const erinRows = listSubchatMessages(db, erinSubchat.id);
      expect(JSON.stringify(erinRows)).not.toContain('$950');
      expect(JSON.stringify(erinRows)).not.toContain('0.4mi');
      expect(JSON.stringify(erinRows)).not.toContain(withheldSentinel);
    } finally {
      db.close();
    }
  });
});

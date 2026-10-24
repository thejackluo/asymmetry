import { describe, expect, it, vi } from 'vitest';
import { userRoom } from '@asymmetry/shared';
import { Budget } from './budgets.js';
import { EVENTS } from './events.js';
import { executeToolCall, type RuntimeHooks, type TrustedCtx } from './tools.js';
import {
  createSubchat,
  createTask,
  getTask,
  getTaskScope,
  insertMessage,
  listMainThreadMessages,
  listSubchatMessages,
  putTaskScope,
} from './repo.js';
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
  const rt: RuntimeHooks = {
    budgetFor: vi.fn(() => budget),
    wakeOwner: vi.fn(),
    reportOwnerFailure: vi.fn(async () => {}),
    runPeer: vi.fn(),
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

  it('A2A-04: sends participant messages and schedules every other peer but rejects non-participants', async () => {
    const { db, ownerCtx, rt, emissions } = setup();
    try {
      const subchat = createSubchat(db, ownerCtx.taskId, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
        FIXTURE_IDS.agents.carol,
      ]);
      const result = await executeToolCall(ownerCtx, toolCall('send_subchat_message', {
        subchatId: subchat.id,
        body: 'Could you check availability?',
      }));
      expect(result.content).toContain('Could you check availability?');
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

  it('keeps an owner report out of peer subchat closure payloads and rows', async () => {
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

      const report = await executeToolCall(ownerCtx, toolCall('report_to_human', {
        taskId: ownerCtx.taskId,
        status: 'done',
        summary,
      }));

      expect(report.stop).toBe(true);
      expect(listMainThreadMessages(db, ownerCtx.taskId).some(({ body }) => body === summary)).toBe(true);
      const erinPayloads = emissions
        .filter(({ event, payload }) => event === EVENTS.SUBCHAT_MESSAGE
          && (payload as { subchatId?: string }).subchatId === erinSubchat.id)
        .map(({ payload }) => JSON.stringify(payload))
        .join('\n');
      expect(erinPayloads).not.toContain(sentinel);
      expect(JSON.stringify(listSubchatMessages(db, erinSubchat.id))).not.toContain(sentinel);
      expect(db.prepare('SELECT summary FROM subchats WHERE id = ?').get(erinSubchat.id)).toEqual({
        summary: 'Closed: the requesting agent finished the task.',
      });
      expect(db.prepare('SELECT summary FROM subchats WHERE id = ?').get(bobSubchat.id)).toEqual({
        summary: 'Closed: the requesting agent finished the task.',
      });
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

  it('derives the owner status from other active tasks', async () => {
    for (const scenario of [
      { expected: 'negotiating' as const, openSubchat: true },
      { expected: 'clarifying' as const, openSubchat: false },
    ]) {
      const { db, ownerCtx } = setup();
      try {
        const otherTask = createTask(db, FIXTURE_IDS.users.alice, 'Another active task');
        if (scenario.openSubchat) {
          putTaskScope(db, {
            taskId: otherTask.id,
            purpose: 'another task',
            fields: ['location_area'],
          });
          createSubchat(db, otherTask.id, [
            FIXTURE_IDS.agents.alice,
            FIXTURE_IDS.agents.bob,
          ]);
        }

        await executeToolCall(ownerCtx, toolCall('report_to_human', {
          taskId: ownerCtx.taskId,
          status: 'done',
          summary: 'The reported task is complete.',
        }));

        expect(db.prepare('SELECT status FROM agents WHERE id = ?').get(FIXTURE_IDS.agents.alice))
          .toEqual({ status: scenario.expected });
      } finally {
        db.close();
      }
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
});

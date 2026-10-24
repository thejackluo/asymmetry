import { describe, expect, it, vi } from 'vitest';
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
      db.prepare(
        `INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('user-frank', 'frank', 'Frank', 'fixture-hash', 'agent-frank', 6);
      db.prepare(
        'INSERT INTO agents (id, user_id, name, status) VALUES (?, ?, ?, ?)',
      ).run('agent-frank', 'user-frank', "Frank's Agent", 'idle');
      const capBudget = ownerCtx.rt.budgetFor(ownerCtx.taskId);
      for (const agentId of [
        FIXTURE_IDS.agents.bob,
        FIXTURE_IDS.agents.carol,
        FIXTURE_IDS.agents.dave,
        FIXTURE_IDS.agents.erin,
      ]) {
        capBudget.addPeer(agentId);
      }
      const capResult = await executeToolCall(ownerCtx, toolCall('open_subchat', {
        taskId: ownerCtx.taskId,
        agentIds: ['agent-frank'],
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
      expect(listMainThreadMessages(db, ownerCtx.taskId).at(-1)?.body).toContain('warm introduction');
      expect(emissions.some(({ event }) => event === EVENTS.TASK_UPDATED)).toBe(true);
      expect(emissions.some(({ event, payload }) => event === EVENTS.SUBCHAT_CLOSED
        && (payload as { outcome?: string }).outcome === 'done')).toBe(true);
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
});

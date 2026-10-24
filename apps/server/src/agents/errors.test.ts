import type { Socket } from 'socket.io';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Budget } from './budgets.js';
import { createAgentRuntime } from './runtime.js';
import { createSubchat, createTask, insertMessage, putTaskScope } from './repo.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';
import { createFakeIO } from './test/fakeIO.js';
import { createFakeMemory } from './test/fakeMemory.js';
import { routedLLM } from './test/routedLLM.js';
import { executeToolCall, type RuntimeHooks, type TrustedCtx } from './tools.js';

const SENTINEL = 'SENTINEL-7f3a private 726 Spring St';

afterEach(() => {
  vi.restoreAllMocks();
});

function createScopedTask(db: ReturnType<typeof createFixtureDb>) {
  const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a room');
  putTaskScope(db, {
    taskId: task.id,
    purpose: 'find a room',
    fields: ['location_area', 'price', 'dates'],
  });
  return task;
}

function socketFor(userId: string): Socket {
  return { data: { userId } } as unknown as Socket;
}

interface ConsoleSpy {
  mock: { calls: unknown[][] };
}

function consoleOutput(spies: ConsoleSpy[]): string {
  return spies.flatMap(({ mock }) => mock.calls)
    .flatMap((args) => args.map((arg) => (
      arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)
    )))
    .join('\n');
}

describe('safe agent failures', () => {
  it('keeps exception details out of persisted, emitted, modeled, and logged output', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const dbs: ReturnType<typeof createFixtureDb>[] = [];
    const emissions: unknown[] = [];
    const llmCalls: Array<{ messages: Array<{ content: string }> }> = [];
    const toolResults: string[] = [];

    const ownerDb = createFixtureDb();
    dbs.push(ownerDb);
    const ownerTask = createScopedTask(ownerDb);
    const ownerSubchat = createSubchat(ownerDb, ownerTask.id, [
      FIXTURE_IDS.agents.alice,
      FIXTURE_IDS.agents.bob,
    ]);
    const ownerIO = createFakeIO();
    const ownerLLM = routedLLM({
      "Alice's Agent": [() => { throw new Error(SENTINEL); }],
    });
    const ownerRuntime = createAgentRuntime({
      io: ownerIO.io,
      db: ownerDb,
      memory: createFakeMemory().memory,
      llm: ownerLLM,
    });
    ownerRuntime.wakeOwner(ownerTask.id);
    await ownerRuntime.idle();
    expect.soft(ownerDb.prepare('SELECT summary FROM subchats WHERE id = ?').get(ownerSubchat.id)).toEqual({
      summary: 'Closed: the requesting agent stopped the task.',
    });
    emissions.push(...ownerIO.emissions.map(({ payload }) => payload));
    llmCalls.push(...ownerLLM.calls);

    const peerDb = createFixtureDb();
    dbs.push(peerDb);
    const peerTask = createScopedTask(peerDb);
    const subchat = createSubchat(peerDb, peerTask.id, [
      FIXTURE_IDS.agents.alice,
      FIXTURE_IDS.agents.bob,
    ]);
    const peerIO = createFakeIO();
    const peerLLM = routedLLM({
      "Bob's Agent": [() => { throw new Error(SENTINEL); }],
      "Alice's Agent": [{ reply: 'I will follow up safely.' }],
    });
    const peerRuntime = createAgentRuntime({
      io: peerIO.io,
      db: peerDb,
      memory: createFakeMemory().memory,
      llm: peerLLM,
    });
    peerRuntime.runPeer(subchat.id, FIXTURE_IDS.agents.bob);
    await peerRuntime.idle();
    expect.soft(peerDb.prepare('SELECT summary FROM subchats WHERE id = ?').get(subchat.id)).toEqual({
      summary: 'Closed: a peer agent stopped before completing this subchat.',
    });
    emissions.push(...peerIO.emissions.map(({ payload }) => payload));
    llmCalls.push(...peerLLM.calls);

    const toolDb = createFixtureDb();
    dbs.push(toolDb);
    const toolTask = createScopedTask(toolDb);
    const toolIO = createFakeIO();
    const baseHooks: RuntimeHooks = {
      budgetFor: () => new Budget(toolTask.id),
      wakeOwner: () => undefined,
      reportOwnerFailure: async () => undefined,
      runPeer: () => undefined,
    };
    const throwingMemory = createFakeMemory({ queryMemoryError: new Error(SENTINEL) }).memory;
    const toolCtx: TrustedCtx = {
      db: toolDb,
      io: toolIO.io,
      memory: throwingMemory,
      rt: baseHooks,
      taskId: toolTask.id,
      taskOwnerUserId: FIXTURE_IDS.users.alice,
      ownerAgentId: FIXTURE_IDS.agents.alice,
      actingAgentId: FIXTURE_IDS.agents.alice,
      mode: 'owner',
      subchatId: null,
    };
    const memoryResult = await executeToolCall(toolCtx, {
      id: 'memory',
      name: 'query_memory',
      args: {
        ownerUserId: FIXTURE_IDS.users.alice,
        scope: { fields: ['price'] },
      },
    });
    expect(memoryResult.content).toBe('Error: no data available for this request');
    toolResults.push(memoryResult.content);

    const throwingHooks: RuntimeHooks = {
      ...baseHooks,
      budgetFor: () => { throw new Error(SENTINEL); },
    };
    const toolFailure = await executeToolCall({ ...toolCtx, rt: throwingHooks }, {
      id: 'open',
      name: 'open_subchat',
      args: { taskId: toolTask.id, agentIds: [FIXTURE_IDS.agents.bob] },
    });
    expect(toolFailure.content).toBe('Error: tool failed');
    toolResults.push(toolFailure.content);
    emissions.push(...toolIO.emissions.map(({ payload }) => payload));

    const ingestDb = createFixtureDb();
    dbs.push(ingestDb);
    const ingestTask = createScopedTask(ingestDb);
    const ingestIO = createFakeIO();
    const ingestLLM = routedLLM({
      "Alice's Agent": [{ reply: 'A safe response.' }],
    });
    const ingestRuntime = createAgentRuntime({
      io: ingestIO.io,
      db: ingestDb,
      memory: createFakeMemory({ ingestError: new Error(SENTINEL) }).memory,
      llm: ingestLLM,
    });
    await ingestRuntime.handleChatSend(socketFor(FIXTURE_IDS.users.alice), {
      taskId: ingestTask.id,
      body: 'Find a room.',
    });
    await ingestRuntime.idle();
    emissions.push(...ingestIO.emissions.map(({ payload }) => payload));
    llmCalls.push(...ingestLLM.calls);

    const queueDb = createFixtureDb();
    dbs.push(queueDb);
    const queueTask = createScopedTask(queueDb);
    const queueIO = createFakeIO((emission) => {
      if (
        emission.event === 'chat:message'
        && (emission.payload as { senderType?: string }).senderType === 'agent'
      ) {
        const error = new Error(SENTINEL);
        error.name = `Custom-${SENTINEL}`;
        throw error;
      }
    });
    const queueLLM = routedLLM({
      "Alice's Agent": [{ reply: 'A safe queued response.' }],
    });
    const queueRuntime = createAgentRuntime({
      io: queueIO.io,
      db: queueDb,
      memory: createFakeMemory().memory,
      llm: queueLLM,
    });
    await queueRuntime.handleChatSend(socketFor(FIXTURE_IDS.users.alice), {
      taskId: queueTask.id,
      body: 'Find a room.',
    });
    await queueRuntime.idle();
    emissions.push(...queueIO.emissions.map(({ payload }) => payload));
    llmCalls.push(...queueLLM.calls);

    const stored = dbs.flatMap((db) => [
      ...(db.prepare('SELECT body FROM messages').all() as Array<{ body: string }>).map(({ body }) => body),
      ...(db.prepare('SELECT summary FROM subchats').all() as Array<{ summary: string | null }>).map(
        ({ summary }) => summary ?? '',
      ),
    ]).join('\n');
    const modelContent = llmCalls.flatMap(({ messages }) => messages.map(({ content }) => content)).join('\n');
    const capturedLogs = consoleOutput([errorSpy, warnSpy, logSpy]);
    const emittedPayloads = JSON.stringify(emissions);
    const assertSafe = (value: string) => {
      expect(value).not.toContain('SENTINEL-7f3a');
      expect(value).not.toContain('726 Spring St');
    };

    assertSafe(emittedPayloads);
    assertSafe(stored);
    assertSafe(modelContent);
    assertSafe(capturedLogs);
    assertSafe(toolResults.join('\n'));
    expect(errorSpy).toHaveBeenCalled();

    for (const db of dbs) {
      db.close();
    }
  });
});

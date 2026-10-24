import type { Socket } from 'socket.io';
import type { MemoryItem } from '@asymmetry/shared';
import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from './runtime.js';
import { openAILLM, type LLMClient, type LLMMessage } from './llm.js';
import {
  agentById,
  getTask,
  getTaskScope,
  listMainThreadMessages,
  listSubchatMessages,
  listSubchatsByTask,
} from './repo.js';
import { createFakeIO } from './test/fakeIO.js';
import { createFakeMemory } from './test/fakeMemory.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';

function fakeSocket(userId: string): Socket {
  return { data: { userId } } as unknown as Socket;
}

describe.skipIf(!process.env.OPENAI_API_KEY)('live OpenAI smoke', () => {
  it('runs a private owner/peer task through the real OpenAI adapter', async () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO();
    const jackFacts: MemoryItem[] = [
      {
        id: 'jack-location',
        userId: FIXTURE_IDS.users.jack,
        content: 'Room is 0.4mi from Georgia Tech.',
        classification: 'network',
        fieldTags: ['location_area'],
        source: 'seed',
        createdAt: 1,
      },
      {
        id: 'jack-price',
        userId: FIXTURE_IDS.users.jack,
        content: 'Room rent is $950/mo.',
        classification: 'network',
        fieldTags: ['price'],
        source: 'seed',
        createdAt: 2,
      },
      {
        id: 'jack-dates',
        userId: FIXTURE_IDS.users.jack,
        content: 'Room available May 15–Aug 10.',
        classification: 'network',
        fieldTags: ['dates'],
        source: 'seed',
        createdAt: 3,
      },
    ];
    const { memory, calls } = createFakeMemory({
      itemsByOwner: { [FIXTURE_IDS.users.jack]: jackFacts },
      withheldCountByOwner: { [FIXTURE_IDS.users.jack]: 3 },
    });
    const model = openAILLM();
    const modelMessages: LLMMessage[] = [];
    const modelOutputs: string[] = [];
    const llm: LLMClient = {
      async chat(messages, tools, opts) {
        modelMessages.push(...messages.map((message) => ({ ...message })));
        const result = await model.chat(messages, tools, opts);
        if (result.reply) {
          modelOutputs.push(result.reply);
        }
        if (result.toolCalls) {
          modelOutputs.push(JSON.stringify(result.toolCalls));
        }
        return result;
      },
    };
    const runtime = createAgentRuntime({ io, db, memory, llm });

    try {
      const taskAcks: unknown[] = [];
      await runtime.handleTaskCreate(
        fakeSocket(FIXTURE_IDS.users.bayzhan),
        { title: 'Find a summer sublet' },
        (result) => taskAcks.push(result),
      );
      const createResult = taskAcks[0] as { ok?: boolean; data?: { id?: string } } | undefined;
      expect(createResult?.ok).toBe(true);
      const taskId = createResult?.data?.id;
      expect(taskId).toBeTruthy();
      if (!taskId) {
        return;
      }

      const chatAcks: unknown[] = [];
      await runtime.handleChatSend(
        fakeSocket(FIXTURE_IDS.users.bayzhan),
        {
          taskId,
          body: 'Find a summer sublet near Georgia Tech, May 15–Aug 10, under $1200/mo',
        },
        (result) => chatAcks.push(result),
      );
      expect(chatAcks[0]).toMatchObject({ ok: true });
      await runtime.idle();

      const task = getTask(db, taskId);
      const canonicalScope = getTaskScope(db, taskId);
      expect(canonicalScope?.fields).toEqual(
        expect.arrayContaining(['location_area', 'price', 'dates']),
      );
      const subchats = listSubchatsByTask(db, taskId);
      expect(subchats.some(({ participantAgentIds }) =>
        participantAgentIds.includes(FIXTURE_IDS.agents.jack))).toBe(true);

      const jackQueries = calls.queryMemory.filter(({ ownerUserId, requesterUserId }) =>
        ownerUserId === FIXTURE_IDS.users.jack
        && requesterUserId === FIXTURE_IDS.users.bayzhan);
      expect(jackQueries.length).toBeGreaterThan(0);
      expect(jackQueries.some(({ scope }) =>
        Boolean(scope.subchatId)
        && scope.fields.length > 0
        && scope.fields.every((field) => canonicalScope?.fields.includes(field)))).toBe(true);

      const toolResults = modelMessages
        .filter(({ role }) => role === 'tool')
        .flatMap(({ content }) => {
          try {
            return [JSON.parse(content) as { facts?: string[]; withheldCount?: number }];
          } catch {
            return [];
          }
        });
      expect(toolResults.some(({ facts, withheldCount }) =>
        withheldCount === 3
        && facts?.some((fact) => fact.includes('$950'))
        && facts.some((fact) => fact.includes('0.4mi')))).toBe(true);

      expect(['done', 'stuck']).toContain(task?.status);
      const mainMessages = listMainThreadMessages(db, taskId);
      const report = mainMessages
        .filter(({ senderType }) => senderType === 'agent')
        .map(({ body }) => body)
        .join('\n');
      console.info(`[live smoke] report: ${report.slice(0, 400)}`);
      expect(/\$950|0\.4mi/.test(report)).toBe(true);

      const storedMessages = db.prepare(
        'SELECT body FROM messages WHERE task_id = ?',
      ).all(taskId) as Array<{ body: string }>;
      const storedSummaries = db.prepare(
        'SELECT summary FROM subchats WHERE task_id = ?',
      ).all(taskId) as Array<{ summary: string | null }>;
      const subchatMessages = subchats.flatMap(({ id }) => listSubchatMessages(db, id));
      const observableText = JSON.stringify({
        emissions,
        storedMessages,
        storedSummaries,
        subchatMessages,
        modelMessages,
        modelOutputs,
      });
      expect(observableText.includes('726 Spring St')).toBe(false);
      expect(observableText.includes('404-555-0182')).toBe(false);

      if (task?.status === 'stuck') {
        const reason = mainMessages.filter(({ senderType }) => senderType === 'agent').at(-1)?.body ?? '';
        expect(reason.length).toBeGreaterThan(0);
        console.info(`[live smoke] task stuck; reason: ${reason.slice(0, 80)}`);
      } else {
        console.info(`[live smoke] task status: ${task?.status ?? 'missing'}`);
      }

      const transcript = [
        ...mainMessages,
        ...subchatMessages,
      ].sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
      console.info('[live smoke] transcript:');
      for (const message of transcript) {
        const sender = message.senderType === 'human'
          ? 'Bayzhan'
          : message.senderType === 'agent'
            ? agentById(db, message.senderId)?.name ?? 'Agent'
            : 'System';
        console.info(`${sender}: ${message.body.slice(0, 80)}`);
      }
    } finally {
      await runtime.idle();
      db.close();
    }
  }, 120_000);
});

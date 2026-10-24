import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { io as ioc, type Socket } from 'socket.io-client';
import type OpenAI from 'openai';
import type { DisclosureNotice, Message, Subchat, Task } from '@asymmetry/shared';
import { all, get } from './db.js';
import type { LLMClient, LLMMessage, LLMResult } from './agents/llm.js';

const adapter = vi.hoisted(() => ({
  client: undefined as unknown as LLMClient & { calls: { messages: LLMMessage[] }[] },
}));

vi.mock('./agents/llm.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./agents/llm.js')>();
  return {
    ...actual,
    openAILLM: () => adapter.client,
  };
});

const { createServer } = await import('./index.js');
type Server = Awaited<ReturnType<typeof createServer>>;

const HUMAN_REQUEST =
  'Find a summer sublet near Georgia Tech under $1200 per month, May 15-August 10.';
const SCOPE_FIELDS = ['location_area', 'price', 'dates'];
const PRIVATE_SENTINELS = [/404-555/i, /726 Spring/i, /SSN/i, /salary|\$185k/i, /Stripe/i];
const JACK_NETWORK_SENTINELS = [/\$950|950\/mo/i, /0\.4mi/i];

const SEED_IDS = {
  bayzhan: { userId: 'seed-user-bayzhan', agentId: 'seed-agent-bayzhan' },
  jack: { userId: 'seed-user-jack', agentId: 'seed-agent-jack' },
  jad: { userId: 'seed-user-jad', agentId: 'seed-agent-jad' },
  akash: { userId: 'seed-user-akash', agentId: 'seed-agent-akash' },
};

let dir: string;
let server: Server;
let base: string;
let openaiCalls: unknown[];
let runtimeCalls: { messages: LLMMessage[] }[];
let clients: ClientRecorder[] = [];
let adapterImpl: (messages: LLMMessage[]) => LLMResult | Promise<LLMResult>;
let openaiUserInputs: string[];
let classifierFacts: { content: string; classification: string; fieldTags: string[] }[];
let scopePurpose: string;

const fakeOpenAI = (): OpenAI => {
  openaiCalls = [];
  openaiUserInputs = [];
  return {
    chat: {
      completions: {
        create: async (req: { messages?: { role: string; content?: string }[] }) => {
          openaiCalls.push(req);
          for (const m of req.messages ?? []) {
            if (m.role === 'user' && typeof m.content === 'string') openaiUserInputs.push(m.content);
          }
          const sys = req.messages?.find((m) => m.role === 'system')?.content ?? '';
          if (sys.includes('classify')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({ facts: classifierFacts }),
                },
              }],
            };
          }
          if (sys.includes('OBJECTIVES')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    goals: [{ description: 'Find a summer sublet near Georgia Tech' }],
                  }),
                },
              }],
            };
          }
          throw new Error('fakeOpenAI: unrecognized prompt path');
        },
      },
    },
  } as unknown as OpenAI;
};

const makeAdapter = (impl: typeof adapterImpl): void => {
  adapterImpl = impl;
  runtimeCalls = [];
  adapter.client = {
    calls: runtimeCalls,
    async chat(messages, tools) {
      runtimeCalls.push({ messages: structuredClone(messages) });
      if (tools?.some((t) => t.name === 'set_task_scope')) {
        return {
          toolCalls: [{
            id: 'scope-1',
            name: 'set_task_scope',
            args: { purpose: scopePurpose, fields: SCOPE_FIELDS },
          }],
        };
      }
      try {
        return await adapterImpl(messages);
      } catch {
        throw new Error('adapter script failure (content withheld)');
      }
    },
  };
};

const serializedRuntimeContext = (): string =>
  JSON.stringify(runtimeCalls.map((c) => c.messages));

const hasSentinel = (serialized: string, patterns: RegExp[]): boolean =>
  patterns.some((p) => p.test(serialized));

const waitFor = async (cond: () => boolean, ms = 20_000, step = 100): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error('waitFor timed out');
};

const seedDatabase = (dbPath: string): void => {
  execFileSync('npx', ['tsx', 'src/seed.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_PATH: dbPath },
    stdio: 'pipe',
  });
};

const login = async (username: string): Promise<{ token: string; user: { id: string; agentId: string } }> => {
  const res = await request(base).post('/api/login').send({ username, password: 'demo' });
  expect(res.status).toBe(200);
  return res.body;
};

interface ClientRecorder {
  socket: Socket;
  events: { event: string; payload: unknown }[];
}

const connectClient = async (token: string): Promise<ClientRecorder> => {
  const rec: ClientRecorder = { socket: undefined as unknown as Socket, events: [] };
  const socket = await new Promise<Socket>((resolve, reject) => {
    const s = ioc(base, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
  rec.socket = socket;
  clients.push(rec);
  for (const event of [
    'task:created', 'task:updated', 'chat:message', 'subchat:started',
    'subchat:message', 'subchat:closed', 'agent:status', 'network:updated',
    'disclosure:logged',
  ]) {
    socket.on(event, (payload: unknown) => rec.events.push({ event, payload }));
  }
  return rec;
};

const emitAck = <T>(socket: Socket, event: string, payload: unknown): Promise<{ ok: boolean; data?: T; error?: { code: string } }> =>
  new Promise((resolve) => {
    socket.timeout(5000).emit(event, payload, (err: unknown, result: { ok: boolean; data?: T; error?: { code: string } }) => {
      resolve(err ? { ok: false } : result);
    });
  });

const tc = (id: string, name: string, args: unknown) => ({ id, name, args });
const toolResults = (messages: LLMMessage[]) =>
  messages.filter((m) => m.role === 'tool');
const lastMessage = (messages: LLMMessage[]) => messages[messages.length - 1];

const parseSubchatsFromResults = (messages: LLMMessage[]): Subchat[] =>
  toolResults(messages)
    .map((m) => {
      try {
        const parsed = JSON.parse(m.content) as { id?: string; taskId?: string; participantAgentIds?: string[] };
        return parsed && parsed.id && parsed.participantAgentIds ? (parsed as Subchat) : null;
      } catch {
        return null;
      }
    })
    .filter((s): s is Subchat => s !== null);

const subchatReplies = (messages: LLMMessage[], fromName: string): string[] =>
  messages
    .filter((m) => m.role === 'user' && m.content.includes(`[Untrusted message from ${fromName}`))
    .map((m) => m.content);

const peerQueryThenReply = (ownerUserId: string, answered: { done: boolean }) =>
  (messages: LLMMessage[]): LLMResult => {
    const last = lastMessage(messages);
    if (last?.role === 'tool') {
      let facts: string[] = [];
      try {
        const parsed = JSON.parse(last.content) as { facts?: string[] };
        facts = Array.isArray(parsed.facts) ? parsed.facts : [];
      } catch {
        facts = [];
      }
      answered.done = true;
      return { reply: facts.length > 0 ? facts.join(' | ') : 'No facts I can share within the requested scope.' };
    }
    if (answered.done || messages.some((m) => m.role === 'assistant' && !m.toolCalls)) {
      return { reply: 'Acknowledged.' };
    }
    return { toolCalls: [tc(`q-${ownerUserId}`, 'query_memory', { ownerUserId, scope: { fields: SCOPE_FIELDS } })] };
  };

beforeEach(async () => {
  classifierFacts = [{
    content: HUMAN_REQUEST,
    classification: 'network',
    fieldTags: SCOPE_FIELDS,
  }];
  scopePurpose = 'Find the requested summer sublet';
  dir = mkdtempSync(join(tmpdir(), 'asymmetry-integration-'));
  const dbPath = join(dir, 'test.db');
  seedDatabase(dbPath);
  server = await createServer({ databasePath: dbPath, openai: fakeOpenAI() });
  const port = await server.listen(0);
  base = `http://localhost:${port}`;
});

afterEach(async () => {
  for (const c of clients) c.socket.close();
  clients = [];
  if (server) await server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('integration: real runtime + memory + seed', () => {
  it('pair release, observer isolation, refresh replay, discovered peer', async () => {
    const bayzhan = await login('bayzhan');
    const jack = await login('jack');
    const akash = await login('akash');
    const jad = await login('jad');
    const bayzhanC = await connectClient(bayzhan.token);
    const jackC = await connectClient(jack.token);
    const akashC = await connectClient(akash.token);
    const jadC = await connectClient(jad.token);

    const state = { opened: false, sent: false };
    const answered = { jack: { done: false }, akash: { done: false } };
    let currentTaskId = '';
    makeAdapter((messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('Available peer directory')) {
        const subchats = parseSubchatsFromResults(messages);
        if (!state.opened) {
          state.opened = true;
          return {
            toolCalls: [
              tc('open-jack', 'open_subchat', { agentIds: [SEED_IDS.jack.agentId], taskId: currentTaskId }),
              tc('open-akash', 'open_subchat', { agentIds: [SEED_IDS.akash.agentId], taskId: currentTaskId }),
            ],
          };
        }
        if (subchats.length > 0 && !state.sent) {
          state.sent = true;
          return {
            toolCalls: subchats.map((s, i) =>
              tc(`req-${i}`, 'send_subchat_message', {
                subchatId: s.id,
                body: 'Please share what you can within scope: location_area, price, dates.',
              }),
            ),
          };
        }
        const jackReplies = subchatReplies(messages, "Jack's Agent");
        const akashReplies = subchatReplies(messages, "Akash's Agent");
        if (jackReplies.length > 0 && akashReplies.length > 0) {
          const synthesis = `Peer answers received. ${jackReplies[jackReplies.length - 1].split('\n').pop()} Proposing a warm introduction to Jack.`;
          return { toolCalls: [tc('report', 'report_to_human', { taskId: currentTaskId, status: 'done', summary: synthesis })] };
        }
        return { reply: 'Waiting for peer updates.' };
      }
      if (sys.includes("Jack's Agent")) return peerQueryThenReply(SEED_IDS.jack.userId, answered.jack)(messages);
      if (sys.includes("Akash's Agent")) return peerQueryThenReply(SEED_IDS.akash.userId, answered.akash)(messages);
      throw new Error(`adapter: unexpected invocation: ${sys.slice(0, 120)}`);
    });

    const created = await emitAck<Task>(bayzhanC.socket, 'task:create', { title: 'Sublet search', userId: 'forged' });
    expect(created.ok).toBe(true);
    const task = created.data as Task;
    currentTaskId = task.id;
    expect(task.userId).toBe(bayzhan.user.id);
    expect(runtimeCalls).toHaveLength(0);

    const sent = await emitAck<Message>(bayzhanC.socket, 'chat:send', { taskId: task.id, body: HUMAN_REQUEST });
    expect(sent.ok).toBe(true);
    expect((sent.data as Message).senderId).toBe(bayzhan.user.id);
    expect((sent.data as Message).subchatId).toBeNull();

    await waitFor(() => {
      const t = get<{ status: string }>(server.db, 'SELECT status FROM tasks WHERE id = ?', task.id);
      return t?.status === 'done';
    }, 30_000);
    await new Promise((r) => setTimeout(r, 500));

    const scope = get<{ fields_json: string }>(server.db, 'SELECT fields_json FROM task_scopes WHERE task_id = ?', task.id);
    expect(JSON.parse(scope?.fields_json ?? '[]').sort()).toEqual([...SCOPE_FIELDS].sort());

    const audits = all<{ released_json: string; withheld_count: number; decision: string }>(
      server.db,
      'SELECT released_json, withheld_count, decision FROM disclosures',
    );
    expect(audits).toHaveLength(2);
    const jackAudit = get<{ released_json: string; withheld_count: number; decision: string }>(
      server.db,
      'SELECT released_json, withheld_count, decision FROM disclosures WHERE owner_user_id = ?',
      SEED_IDS.jack.userId,
    );
    expect(jackAudit).toBeDefined();
    const releasedIds = JSON.parse(jackAudit!.released_json) as string[];
    expect(releasedIds).toHaveLength(3);
    const tags = all<{ field_tags: string }>(
      server.db,
      `SELECT field_tags FROM memory_items WHERE id IN (${releasedIds.map(() => '?').join(',')})`,
      ...releasedIds,
    ).flatMap((r) => JSON.parse(r.field_tags) as string[]);
    expect(new Set(tags)).toEqual(new Set(SCOPE_FIELDS));
    expect(jackAudit!.withheld_count).toBe(3);
    expect(jackAudit!.decision).toBe('partial');

    const notices = bayzhanC.events.filter((e) => e.event === 'disclosure:logged');
    const jackNotice = notices.find((e) => (e.payload as DisclosureNotice).ownerAgentId === SEED_IDS.jack.agentId);
    expect(jackNotice).toBeDefined();
    const notice = jackNotice!.payload as DisclosureNotice;
    expect(Object.keys(notice).sort()).toEqual(
      ['decision', 'id', 'ownerAgentId', 'releasedCount', 'subchatId', 'taskId', 'withheldCount'].sort(),
    );
    expect(notice.releasedCount).toBe(3);
    expect(notice.withheldCount).toBe(3);
    expect(notice.decision).toBe('partial');
    const noticesJson = JSON.stringify(notices.map((n) => n.payload));
    expect(releasedIds.some((id) => noticesJson.includes(id))).toBe(false);

    const subchats = all<{ status: string; outcome: string | null; summary: string | null; closed_at: number | null }>(
      server.db, 'SELECT * FROM subchats WHERE task_id = ?', task.id,
    );
    expect(subchats.length).toBe(2);
    for (const s of subchats) {
      expect(s.status).toBe('closed');
      expect(s.outcome).toBe('done');
      expect(typeof s.summary).toBe('string');
      expect(typeof s.closed_at).toBe('number');
    }

    const hist = await request(base).get(`/api/tasks/${task.id}/messages`).set('Authorization', `Bearer ${bayzhan.token}`);
    expect(hist.status).toBe(200);
    expect(hist.body.subchats).toHaveLength(2);
    expect(hist.body.disclosures.length).toBeGreaterThanOrEqual(2);
    const otherHist = await request(base).get(`/api/tasks/${task.id}/messages`).set('Authorization', `Bearer ${akash.token}`);
    expect(otherHist.status).toBe(404);

    const allContexts = serializedRuntimeContext() + JSON.stringify(openaiUserInputs);
    const socketPayloads = JSON.stringify([
      ...bayzhanC.events, ...jackC.events, ...akashC.events, ...jadC.events,
    ]);
    const restPayloads = JSON.stringify([hist.body, otherHist.body]);
    expect(hasSentinel(allContexts + socketPayloads + restPayloads, PRIVATE_SENTINELS)).toBe(false);

    const akashPayloads = JSON.stringify(akashC.events);
    expect(hasSentinel(akashPayloads, JACK_NETWORK_SENTINELS)).toBe(false);

    const jadPayloads = JSON.stringify(jadC.events);
    expect(jadC.events.filter((e) =>
      ['chat:message', 'subchat:started', 'subchat:message', 'subchat:closed', 'disclosure:logged'].includes(e.event),
    )).toHaveLength(0);
    expect(hasSentinel(jadPayloads, JACK_NETWORK_SENTINELS)).toBe(false);

    const network = await request(base).get('/api/network').set('Authorization', `Bearer ${bayzhan.token}`);
    expect(network.status).toBe(200);
    expect(new Set(network.body.trusted)).toEqual(new Set([SEED_IDS.jack.agentId, SEED_IDS.jad.agentId]));
    expect(network.body.discovered).toEqual([SEED_IDS.akash.agentId]);

    bayzhanC.socket.close(); jackC.socket.close(); akashC.socket.close(); jadC.socket.close();
  }, 60_000);

  it('untrusted group observer blocks Jack network facts', async () => {
    const bayzhan = await login('bayzhan');
    const jack = await login('jack');
    const jad = await login('jad');
    const bayzhanC = await connectClient(bayzhan.token);
    const jackC = await connectClient(jack.token);
    const jadC = await connectClient(jad.token);

    const state = { opened: false, sent: false };
    const answered = { jack: { done: false }, jad: { done: false } };
    let currentTaskId = '';
    makeAdapter((messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('Available peer directory')) {
        const subchats = parseSubchatsFromResults(messages);
        if (!state.opened) {
          state.opened = true;
          return { toolCalls: [tc('open-group', 'open_subchat', { agentIds: [SEED_IDS.jack.agentId, SEED_IDS.jad.agentId], taskId: currentTaskId })] };
        }
        if (subchats.length > 0 && !state.sent) {
          state.sent = true;
          return { toolCalls: [tc('req', 'send_subchat_message', { subchatId: subchats[0].id, body: 'Share what you can within scope.' })] };
        }
        const jackReplies = subchatReplies(messages, "Jack's Agent");
        const jadReplies = subchatReplies(messages, "Jad's Agent");
        if (jackReplies.length > 0 && jadReplies.length > 0) {
          return { toolCalls: [tc('report', 'report_to_human', { taskId: currentTaskId, status: 'stuck', summary: 'No authorized match available from trusted peers.' })] };
        }
        return { reply: 'Waiting.' };
      }
      if (sys.includes("Jack's Agent")) return peerQueryThenReply(SEED_IDS.jack.userId, answered.jack)(messages);
      if (sys.includes("Jad's Agent")) {
        answered.jad.done = true;
        return { reply: 'Acknowledged.' };
      }
      throw new Error(`adapter: unexpected invocation: ${sys.slice(0, 120)}`);
    });

    const created = await emitAck<Task>(bayzhanC.socket, 'task:create', { title: 'Sublet search' });
    expect(created.ok).toBe(true);
    currentTaskId = (created.data as Task).id;
    const sent = await emitAck<Message>(bayzhanC.socket, 'chat:send', { taskId: currentTaskId, body: HUMAN_REQUEST });
    expect(sent.ok).toBe(true);

    await waitFor(() => {
      const t = get<{ status: string }>(server.db, 'SELECT status FROM tasks WHERE id = ?', currentTaskId);
      return t?.status === 'stuck';
    }, 30_000);
    await new Promise((r) => setTimeout(r, 500));

    const audits = all<{ released_json: string; withheld_count: number; decision: string }>(
      server.db, 'SELECT released_json, withheld_count, decision FROM disclosures',
    );
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].released_json)).toHaveLength(0);
    expect(audits[0].withheld_count).toBe(6);
    expect(audits[0].decision).toBe('denied');

    const notices = bayzhanC.events.filter((e) => e.event === 'disclosure:logged');
    expect(notices).toHaveLength(1);
    expect((notices[0].payload as DisclosureNotice).releasedCount).toBe(0);
    expect((notices[0].payload as DisclosureNotice).withheldCount).toBe(6);

    const jackSubchat = get<{ status: string; outcome: string | null; summary: string | null; closed_at: number | null }>(
      server.db, 'SELECT * FROM subchats WHERE task_id = ?', currentTaskId,
    );
    expect(jackSubchat?.status).toBe('closed');
    expect(jackSubchat?.outcome).toBe('stuck');
    expect(JACK_NETWORK_SENTINELS.concat(PRIVATE_SENTINELS).some((p) => p.test(jackSubchat?.summary ?? ''))).toBe(false);
    expect(typeof jackSubchat?.closed_at).toBe('number');

    const peerContexts = JSON.stringify([...jackC.events, ...jadC.events]);
    const allContexts = serializedRuntimeContext() + peerContexts + JSON.stringify(openaiUserInputs);
    expect(hasSentinel(allContexts, [...PRIVATE_SENTINELS, ...JACK_NETWORK_SENTINELS])).toBe(false);

    bayzhanC.socket.close(); jackC.socket.close(); jadC.socket.close();
  }, 60_000);

  it('bounded ping-pong reaches stuck without deadlock', async () => {
    const bayzhan = await login('bayzhan');
    const jack = await login('jack');
    const bayzhanC = await connectClient(bayzhan.token);
    const jackC = await connectClient(jack.token);

    let currentTaskId = '';
    const state = { opened: false };
    makeAdapter((messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('Available peer directory')) {
        const subchats = parseSubchatsFromResults(messages);
        if (subchats.length === 0 && !state.opened) {
          state.opened = true;
          return { toolCalls: [tc('open', 'open_subchat', { agentIds: [SEED_IDS.jack.agentId], taskId: currentTaskId })] };
        }
        if (subchats.length === 0) {
          return { reply: 'Waiting.' };
        }
        const capped = toolResults(messages).some((m) => m.content.includes('turn cap reached'));
        if (capped) {
          return { toolCalls: [tc('report', 'report_to_human', { taskId: currentTaskId, status: 'stuck', summary: 'Peer exchange reached its turn limit.' })] };
        }
        return { toolCalls: [tc(`ping-${runtimeCalls.length}`, 'send_subchat_message', { subchatId: subchats[0].id, body: 'ping' })] };
      }
      if (sys.includes("Jack's Agent")) {
        return { reply: 'pong' };
      }
      throw new Error(`adapter: unexpected invocation: ${sys.slice(0, 120)}`);
    });

    const created = await emitAck<Task>(bayzhanC.socket, 'task:create', { title: 'Ping test' });
    currentTaskId = (created.data as Task).id;
    await emitAck<Message>(bayzhanC.socket, 'chat:send', { taskId: currentTaskId, body: HUMAN_REQUEST });

    await waitFor(() => {
      const t = get<{ status: string }>(server.db, 'SELECT status FROM tasks WHERE id = ?', currentTaskId);
      return t?.status === 'stuck';
    }, 45_000);
    await new Promise((r) => setTimeout(r, 300));

    const subchat = get<{ id: string; status: string; outcome: string | null }>(
      server.db, 'SELECT * FROM subchats WHERE task_id = ?', currentTaskId,
    );
    expect(subchat?.status).toBe('closed');
    expect(subchat?.outcome).toBe('stuck');
    const agentMsgs = all<{ id: string }>(
      server.db,
      "SELECT id FROM messages WHERE subchat_id = ? AND sender_type = 'agent'",
      subchat!.id,
    );
    expect(agentMsgs.length).toBeLessThanOrEqual(12);
    expect(runtimeCalls.length).toBeLessThanOrEqual(30);
    const closedEvent = bayzhanC.events.find((e) => e.event === 'subchat:closed');
    const closedRow = get<{ outcome: string | null; summary: string | null; closed_at: number | null }>(
      server.db, 'SELECT outcome, summary, closed_at FROM subchats WHERE id = ?', subchat!.id,
    );
    const closedPayload = closedEvent?.payload as { outcome: string; summary: string };
    expect(closedPayload.outcome).toBe('stuck');
    expect(closedRow?.outcome).toBe(closedPayload.outcome);
    expect(closedRow?.summary).toBe(closedPayload.summary);
    expect(typeof closedRow?.closed_at).toBe('number');
    const capHist = await request(base).get(`/api/tasks/${currentTaskId}/messages`).set('Authorization', `Bearer ${bayzhan.token}`);
    expect(capHist.status).toBe(200);
    expect(capHist.body.subchats[0].status).toBe('closed');
    expect(capHist.body.subchats[0].outcome).toBe(closedPayload.outcome);
    expect(capHist.body.subchats[0].closedAt).toBe(closedRow?.closed_at);

    bayzhanC.socket.close(); jackC.socket.close();
  }, 90_000);

  it("owner model cannot relay one peer's authorized facts to an untrusted peer", async () => {
    const bayzhan = await login('bayzhan');
    const jack = await login('jack');
    const akash = await login('akash');
    const bayzhanC = await connectClient(bayzhan.token);
    const jackC = await connectClient(jack.token);
    const akashC = await connectClient(akash.token);

    let currentTaskId = '';
    const state = { openedJack: false, sentJack: false, openedAkash: false, sentAkash: false };
    const jackAnswered = { done: false };
    const akashAnswered = { done: false };
    makeAdapter((messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('Available peer directory')) {
        const subchats = parseSubchatsFromResults(messages);
        const jackReplies = subchatReplies(messages, "Jack's Agent");
        const akashReplies = subchatReplies(messages, "Akash's Agent");
        if (!state.openedJack) {
          state.openedJack = true;
          return { toolCalls: [tc('open-jack', 'open_subchat', { agentIds: [SEED_IDS.jack.agentId], taskId: currentTaskId })] };
        }
        if (subchats.length > 0 && !state.sentJack) {
          state.sentJack = true;
          return { toolCalls: [tc('req-jack', 'send_subchat_message', { subchatId: subchats[subchats.length - 1].id, body: 'Please share what you can within scope: location_area, price, dates.' })] };
        }
        if (jackReplies.length === 0) {
          return { reply: 'Waiting for Jack.' };
        }
        if (!state.openedAkash) {
          state.openedAkash = true;
          return { toolCalls: [tc('open-akash', 'open_subchat', { agentIds: [SEED_IDS.akash.agentId], taskId: currentTaskId })] };
        }
        if (!state.sentAkash) {
          state.sentAkash = true;
          const jackBody = jackReplies[jackReplies.length - 1].split('\n').pop() as string;
          const akashSubchat = subchats[subchats.length - 1];
          return { toolCalls: [tc('relay', 'send_subchat_message', { subchatId: akashSubchat.id, body: jackBody })] };
        }
        if (toolResults(messages).some((m) => m.toolCallId === 'relay' && /^(Error:|Invalid arguments:)/.test(m.content))) {
          return { toolCalls: [tc('report', 'report_to_human', { taskId: currentTaskId, status: 'stuck', summary: 'Relay blocked' })] };
        }
        if (akashReplies.length > 0) {
          return { toolCalls: [tc('report', 'report_to_human', { taskId: currentTaskId, status: 'done', summary: 'Peer exchange completed.' })] };
        }
        return { reply: 'Waiting for Akash.' };
      }
      if (sys.includes("Jack's Agent")) return peerQueryThenReply(SEED_IDS.jack.userId, jackAnswered)(messages);
      if (sys.includes("Akash's Agent")) return peerQueryThenReply(SEED_IDS.akash.userId, akashAnswered)(messages);
      throw new Error('adapter: unexpected invocation');
    });

    const created = await emitAck<Task>(bayzhanC.socket, 'task:create', { title: 'Sublet search' });
    expect(created.ok).toBe(true);
    currentTaskId = (created.data as Task).id;
    const sent = await emitAck<Message>(bayzhanC.socket, 'chat:send', { taskId: currentTaskId, body: HUMAN_REQUEST });
    expect(sent.ok).toBe(true);

    await waitFor(() => {
      const t = get<{ status: string }>(server.db, 'SELECT status FROM tasks WHERE id = ?', currentTaskId);
      return t?.status === 'done' || t?.status === 'stuck';
    }, 30_000);
    await new Promise((r) => setTimeout(r, 500));

    const jackAudit = get<{ released_json: string; withheld_count: number; decision: string }>(
      server.db,
      'SELECT released_json, withheld_count, decision FROM disclosures WHERE owner_user_id = ?',
      SEED_IDS.jack.userId,
    );
    expect(jackAudit).toBeDefined();
    expect(JSON.parse(jackAudit!.released_json)).toHaveLength(3);
    expect(jackAudit!.withheld_count).toBe(3);
    expect(jackAudit!.decision).toBe('partial');

    const akashSocketPayloads = JSON.stringify(akashC.events);
    const akashModelInputs = JSON.stringify(
      runtimeCalls.filter((c) => String(c.messages[0]?.content ?? '').includes("Akash's Agent")).map((c) => c.messages),
    );
    expect(hasSentinel(akashSocketPayloads + akashModelInputs, JACK_NETWORK_SENTINELS)).toBe(false);

    const bayzhanMain = all<{ body: string }>(
      server.db,
      "SELECT body FROM messages WHERE task_id = ? AND subchat_id IS NULL",
      currentTaskId,
    ).map((m) => m.body);
    expect(hasSentinel(JSON.stringify(bayzhanMain), PRIVATE_SENTINELS)).toBe(false);
  }, 60_000);

  it('private owner note in explanatory scope purpose never enters peer context', async () => {
    const bayzhan = await login('bayzhan');
    const akash = await login('akash');
    const bayzhanC = await connectClient(bayzhan.token);
    const akashC = await connectClient(akash.token);

    const NOTE = 'Private owner note: OWNER-CONTEXT-SENTINEL';
    classifierFacts = [
      { content: HUMAN_REQUEST, classification: 'network', fieldTags: SCOPE_FIELDS },
      { content: NOTE, classification: 'private', fieldTags: ['identifier'] },
    ];
    scopePurpose = `Find the requested summer sublet. ${NOTE}`;

    let currentTaskId = '';
    const state = { opened: false, sent: false };
    const akashAnswered = { done: false };
    makeAdapter((messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('Available peer directory')) {
        const subchats = parseSubchatsFromResults(messages);
        if (!state.opened) {
          state.opened = true;
          return { toolCalls: [tc('open-akash', 'open_subchat', { agentIds: [SEED_IDS.akash.agentId], taskId: currentTaskId })] };
        }
        if (subchats.length > 0 && !state.sent) {
          state.sent = true;
          return { toolCalls: [tc('req', 'send_subchat_message', { subchatId: subchats[0].id, body: 'Share what you can within scope.' })] };
        }
        const akashReplies = subchatReplies(messages, "Akash's Agent");
        if (akashReplies.length > 0) {
          return { toolCalls: [tc('report', 'report_to_human', { taskId: currentTaskId, status: 'done', summary: 'Peer exchange completed.' })] };
        }
        return { reply: 'Waiting for Akash.' };
      }
      if (sys.includes("Akash's Agent")) return peerQueryThenReply(SEED_IDS.akash.userId, akashAnswered)(messages);
      throw new Error('adapter: unexpected invocation');
    });

    const created = await emitAck<Task>(bayzhanC.socket, 'task:create', { title: 'Sublet search' });
    currentTaskId = (created.data as Task).id;
    const sent = await emitAck<Message>(bayzhanC.socket, 'chat:send', {
      taskId: currentTaskId,
      body: `${HUMAN_REQUEST}\n${NOTE}`,
    });
    expect(sent.ok).toBe(true);

    await waitFor(() => {
      const t = get<{ status: string }>(server.db, 'SELECT status FROM tasks WHERE id = ?', currentTaskId);
      return t?.status === 'done' || t?.status === 'stuck';
    }, 30_000);
    await new Promise((r) => setTimeout(r, 500));

    const noteRow = get<{ classification: string; field_tags: string }>(
      server.db,
      "SELECT classification, field_tags FROM memory_items WHERE content LIKE '%OWNER-CONTEXT-SENTINEL%'",
    );
    expect(noteRow).toBeDefined();
    expect(noteRow!.classification).toBe('private');
    expect(JSON.parse(noteRow!.field_tags)).toContain('identifier');

    const akashSocketPayloads = JSON.stringify(akashC.events);
    const akashModelInputs = JSON.stringify(
      runtimeCalls.filter((c) => String(c.messages[0]?.content ?? '').includes("Akash's Agent")).map((c) => c.messages),
    );
    const foreignHist = await request(base).get(`/api/tasks/${currentTaskId}/messages`).set('Authorization', `Bearer ${akash.token}`);
    expect(foreignHist.status).toBe(404);
    const scan = akashSocketPayloads + akashModelInputs + JSON.stringify(foreignHist.body);
    expect(scan.includes('OWNER-CONTEXT-SENTINEL')).toBe(false);
  }, 60_000);
});

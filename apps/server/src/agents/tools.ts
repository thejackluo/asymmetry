import type { MemoryEngine, ID } from '@asymmetry/shared';
import type { Server } from 'socket.io';
import type { Database } from '../db.js';
import { Budget, PEER_CAP } from './budgets.js';
import { emitAgentStatus, emitMainMessage, emitNetworkUpdated, emitSubchatEvent, emitTaskUpdated } from './emit.js';
import { EVENTS } from './events.js';
import {
  agentById,
  agentByUser,
  createSubchat,
  getTask,
  getTaskScope,
  insertMessage,
  listParticipants,
  listSubchatMessages,
  listSubchatsByTask,
  setAgentStatus,
  setTaskStatus,
  subchatById,
  userByAgent,
} from './repo.js';
import { closeSubchatAndNotify } from './subchats.js';
import { buildDirectory } from './peers.js';
import { validateScopeRequest } from './scope.js';
import type { LLMMessage, ToolCall, ToolSpec } from './llm.js';

export interface RuntimeHooks {
  budgetFor(taskId: ID): Budget;
  wakeOwner(taskId: ID, note?: string): void;
  reportOwnerFailure(taskId: ID, reason: string): Promise<void>;
  runPeer(subchatId: ID, agentId: ID): void;
  recordPeerFacts?(
    taskId: ID,
    ownerAgentName: string,
    facts: Array<{ id: ID; text: string }>,
    subchatId?: ID,
  ): void;
  takePeerFacts?(taskId: ID): ReleasedPeerFact[];
  getPeerMemoryResult?(subchatId: ID, actingAgentId: ID): string | undefined;
  cachePeerMemoryResult?(subchatId: ID, actingAgentId: ID, result: string): void;
}

export interface ReleasedPeerFact {
  id: ID;
  ownerAgentName: string;
  text: string;
}

export interface TrustedCtx {
  db: Database;
  io: Server;
  memory: MemoryEngine;
  rt: RuntimeHooks;
  taskId: ID;
  taskOwnerUserId: ID;
  ownerAgentId: ID;
  actingAgentId: ID;
  mode: 'owner' | 'peer';
  subchatId: ID | null;
}

export const AGENT_TOOLS: ToolSpec[] = [
  {
    name: 'query_memory',
    description: 'Read only the acting agent owner’s facts within the canonical task scope.',
    parameters: {
      type: 'object',
      properties: {
        ownerUserId: { type: 'string' },
        scope: {
          type: 'object',
          properties: {
            fields: { type: 'array', items: { type: 'string' } },
          },
          required: ['fields'],
          additionalProperties: false,
        },
      },
      required: ['ownerUserId', 'scope'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_subchat',
    description: 'Open a task subchat with one or more authorized peers.',
    parameters: {
      type: 'object',
      properties: {
        agentIds: { type: 'array', items: { type: 'string' } },
        taskId: { type: 'string' },
      },
      required: ['agentIds', 'taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_subchat_message',
    description: 'Send a message in an open subchat where the acting agent participates.',
    parameters: {
      type: 'object',
      properties: {
        subchatId: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['body'],
      additionalProperties: false,
    },
  },
  {
    name: 'report_to_human',
    description: 'Finish the task with a concise outcome and options for its human owner.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['done', 'stuck'] },
        summary: { type: 'string' },
      },
      required: ['taskId', 'status', 'summary'],
      additionalProperties: false,
    },
  },
];

export const OWNER_AGENT_TOOLS: ToolSpec[] = AGENT_TOOLS.map((tool) =>
  tool.name === 'send_subchat_message'
    ? {
      ...tool,
      parameters: {
        type: 'object',
        properties: { subchatId: { type: 'string' } },
        required: ['subchatId'],
        additionalProperties: false,
      },
    }
    : tool,
);

type Args = Record<string, unknown>;

function isRecord(value: unknown): value is Args {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function toolArgs(call: ToolCall): Args | string {
  if (call.args instanceof Error) {
    return `Invalid arguments: ${call.args.message}`;
  }
  if (!isRecord(call.args)) {
    return 'Invalid arguments: expected an object';
  }
  return call.args;
}

function assertOwnerContext(ctx: TrustedCtx): string | null {
  if (ctx.mode !== 'owner') {
    return 'only the task owner’s agent can perform this action';
  }
  if (ctx.actingAgentId !== ctx.ownerAgentId) {
    return 'the acting agent does not match the task owner’s agent';
  }
  return null;
}

async function queryMemory(ctx: TrustedCtx, args: Args): Promise<string> {
  if (typeof args.ownerUserId !== 'string' || !isRecord(args.scope) || !stringArray(args.scope.fields)) {
    return 'Invalid arguments: ownerUserId and scope.fields are required';
  }
  const actingOwner = userByAgent(ctx.db, ctx.actingAgentId);
  if (!actingOwner || args.ownerUserId !== actingOwner.id) {
    return 'Error: memory access is limited to the acting agent’s owner';
  }
  const task = getTask(ctx.db, ctx.taskId);
  if (!task) {
    return 'Error: task is not available';
  }
  if (ctx.mode === 'owner' && task.userId !== actingOwner.id) {
    return 'Error: owner memory reads require an owned task';
  }
  if (ctx.mode === 'peer') {
    if (!ctx.subchatId) {
      return 'Error: peer memory reads require a subchat';
    }
    const subchat = subchatById(ctx.db, ctx.subchatId);
    const participants = subchat ? listParticipants(ctx.db, subchat.id) : [];
    const taskOwnerAgent = agentByUser(ctx.db, ctx.taskOwnerUserId);
    if (
      !subchat
      || subchat.taskId !== ctx.taskId
      || subchat.status !== 'open'
      || !participants.includes(ctx.actingAgentId)
      || !participants.includes(ctx.ownerAgentId)
      || !taskOwnerAgent
      || taskOwnerAgent.id !== ctx.ownerAgentId
      || !participants.includes(taskOwnerAgent.id)
      || task.userId !== ctx.taskOwnerUserId
    ) {
      return 'Error: peer memory reads require task participants in an open subchat';
    }
  }
  const canonical = getTaskScope(ctx.db, ctx.taskId);
  if (!canonical) {
    return 'Error: canonical task scope is not available';
  }
  const scope = validateScopeRequest(canonical, args.scope.fields);
  if (!scope.ok) {
    return `Error: fields outside the canonical task scope: ${scope.fields.join(', ')}`;
  }
  if (ctx.mode === 'peer' && ctx.subchatId) {
    const cached = ctx.rt.getPeerMemoryResult?.(ctx.subchatId, ctx.actingAgentId);
    if (cached !== undefined) {
      return cached;
    }
  }
  const requesterUserId = ctx.mode === 'owner' ? actingOwner.id : ctx.taskOwnerUserId;
  if (ctx.mode === 'peer' && !ctx.subchatId) {
    return 'Error: peer memory reads require a subchat';
  }
  let result: Awaited<ReturnType<MemoryEngine['queryMemory']>>;
  try {
    result = await ctx.memory.queryMemory(actingOwner.id, requesterUserId, {
      taskId: ctx.taskId,
      purpose: canonical.purpose,
      fields: scope.fields,
      ...(ctx.mode === 'peer' ? { subchatId: ctx.subchatId! } : {}),
    });
  } catch {
    const error = 'Error: no data available for this request';
    if (ctx.mode === 'peer' && ctx.subchatId) {
      ctx.rt.cachePeerMemoryResult?.(ctx.subchatId, ctx.actingAgentId, error);
    }
    return error;
  }
  if (ctx.mode === 'peer' && result.items.length > 0) {
    const ownerAgent = agentByUser(ctx.db, actingOwner.id);
    if (ownerAgent) {
      ctx.rt.recordPeerFacts?.(
        ctx.taskId,
        ownerAgent.name,
        result.items.map(({ id, content }) => ({ id, text: content })),
        ctx.subchatId ?? undefined,
      );
    }
  }
  const response = JSON.stringify({
    facts: result.items.map((item) => item.content),
    withheldCount: result.withheldCount,
  });
  if (ctx.mode === 'peer' && ctx.subchatId) {
    ctx.rt.cachePeerMemoryResult?.(ctx.subchatId, ctx.actingAgentId, response);
  }
  return response;
}

async function openSubchat(ctx: TrustedCtx, args: Args): Promise<string> {
  const ownerError = assertOwnerContext(ctx);
  if (ownerError) {
    return `Error: ${ownerError}`;
  }
  if (typeof args.taskId !== 'string' || args.taskId !== ctx.taskId || !stringArray(args.agentIds)) {
    return 'Invalid arguments: taskId must match this task and agentIds must be a string array';
  }
  if (args.agentIds.length === 0) {
    return 'Invalid arguments: at least one peer is required';
  }
  if (!getTaskScope(ctx.db, ctx.taskId)) {
    return 'Error: canonical task scope is not available';
  }
  const requestedIds = [...new Set(args.agentIds)];
  if (requestedIds.some((agentId) => agentId === ctx.ownerAgentId)) {
    return 'Error: the owner agent cannot be added as a peer';
  }
  const directory = buildDirectory(ctx.db, ctx.taskOwnerUserId);
  const directoryIds = new Set(directory.map(({ agentId }) => agentId));
  const unauthorized = requestedIds.filter((agentId) => !directoryIds.has(agentId));
  if (unauthorized.length > 0) {
    return `Error: peers are not in the task directory: ${unauthorized.join(', ')}`;
  }

  const requestedParticipants = new Set([ctx.ownerAgentId, ...requestedIds]);
  const existing = listSubchatsByTask(ctx.db, ctx.taskId).find((subchat) =>
    subchat.participantAgentIds.length === requestedParticipants.size
    && subchat.participantAgentIds.every((agentId) => requestedParticipants.has(agentId)));
  if (existing) {
    const names = requestedIds
      .map((agentId) => directory.find((peer) => peer.agentId === agentId)?.name ?? 'peer')
      .join(', ');
    return `Already contacted ${names} in subchat ${existing.id}; wait for its result.`;
  }

  const budget = ctx.rt.budgetFor(ctx.taskId);
  const peerSet = new Set([...budget.peers, ...requestedIds]);
  if (peerSet.size > PEER_CAP) {
    return `Error: task peer cap of ${PEER_CAP} would be exceeded`;
  }
  for (const agentId of requestedIds) {
    budget.addPeer(agentId);
  }

  const subchat = createSubchat(ctx.db, ctx.taskId, [ctx.ownerAgentId, ...requestedIds]);
  emitSubchatEvent(ctx.io, ctx.db, subchat.id, EVENTS.SUBCHAT_STARTED, subchat);
  for (const agentId of subchat.participantAgentIds) {
    setAgentStatus(ctx.db, agentId, 'negotiating');
    emitAgentStatus(ctx.io, ctx.db, agentId, 'negotiating', ctx.taskOwnerUserId);
  }
  emitNetworkUpdated(ctx.io, ctx.db, ctx.taskOwnerUserId);
  return JSON.stringify(subchat);
}

async function sendSubchatMessage(ctx: TrustedCtx, args: Args): Promise<string> {
  let subchatId: ID | null = null;
  let body: string;
  if (ctx.mode === 'owner') {
    if (typeof args.subchatId !== 'string') {
      return 'Invalid arguments: owner mode requires subchatId';
    }
    subchatId = args.subchatId;
    const canonical = getTaskScope(ctx.db, ctx.taskId);
    if (!canonical) {
      return 'Error: canonical task scope is not set';
    }
    body = `Please return only information authorized for these task fields: ${canonical.fields.join(', ')}.`;
  } else {
    if (typeof args.body !== 'string' || args.body.trim().length === 0 || args.body.length > 4000) {
      return 'Invalid arguments: body must be non-empty and at most 4000 characters';
    }
    if (!ctx.subchatId) {
      return 'Error: peer mode is not bound to a subchat';
    }
    if (args.subchatId !== undefined && args.subchatId !== ctx.subchatId) {
      return 'Error: peer mode cannot send to another subchat';
    }
    subchatId = ctx.subchatId;
    body = args.body;
  }

  const subchat = subchatById(ctx.db, subchatId);
  if (!subchat || subchat.taskId !== ctx.taskId) {
    return 'Error: subchat must be open and belong to this task';
  }
  if (subchat.status !== 'open') {
    return 'Error: subchat is closed';
  }
  const participants = listParticipants(ctx.db, subchatId);
  if (!participants.includes(ctx.actingAgentId)) {
    return 'Error: acting agent is not a subchat participant';
  }
  if (
    ctx.mode === 'owner'
    && listSubchatMessages(ctx.db, subchatId).some((message) =>
      message.senderType === 'agent' && message.senderId === ctx.actingAgentId)
  ) {
    return 'Already asked; wait for the peer reply.';
  }

  if (!ctx.rt.budgetFor(ctx.taskId).reserveSubchatTurn(subchatId)) {
    closeSubchatAndNotify(ctx.db, ctx.io, subchatId, 'stuck', 'turn cap reached');
    const agentName = agentById(ctx.db, ctx.actingAgentId)?.name ?? 'Agent';
    ctx.rt.wakeOwner(ctx.taskId, `${agentName} stopped: subchat turn cap reached.`);
    return 'Error: subchat turn cap reached';
  }

  const message = insertMessage(ctx.db, {
    taskId: ctx.taskId,
    subchatId,
    senderType: 'agent',
    senderId: ctx.actingAgentId,
    body,
  });
  emitSubchatEvent(ctx.io, ctx.db, subchatId, EVENTS.SUBCHAT_MESSAGE, message);
  if (ctx.mode === 'owner') {
    for (const participantId of participants) {
      if (participantId !== ctx.actingAgentId && participantId !== ctx.ownerAgentId) {
        ctx.rt.runPeer(subchatId, participantId);
      }
    }
  }
  return JSON.stringify(message);
}

export function formatReleasedPeerFacts(releasedFacts: ReleasedPeerFact[]): string {
  const factsById = new Map<ID, ReleasedPeerFact>();
  for (const fact of releasedFacts) {
    factsById.set(fact.id, fact);
  }
  if (factsById.size === 0) {
    return '';
  }

  const factsByAgent = new Map<string, string[]>();
  for (const fact of factsById.values()) {
    const facts = factsByAgent.get(fact.ownerAgentName) ?? [];
    facts.push(fact.text);
    factsByAgent.set(fact.ownerAgentName, facts);
  }
  return [...factsByAgent]
    .map(([ownerAgentName, facts]) => `- ${ownerAgentName}: ${facts.join('; ')}`)
    .join('\n');
}

function releasedFactsAppendix(ctx: TrustedCtx): string {
  const facts = formatReleasedPeerFacts(ctx.rt.takePeerFacts?.(ctx.taskId) ?? []);
  return facts ? `\n\nShared with you:\n${facts}` : '';
}

export async function persistOwnerReport(
  ctx: TrustedCtx,
  status: 'done' | 'stuck',
  report: string,
): Promise<string> {
  if (ctx.mode === 'peer') {
    return "only the task owner's agent can finish this task";
  }
  if (report.trim().length === 0) {
    return 'Invalid arguments: taskId, status, and a non-empty summary are required';
  }
  const task = getTask(ctx.db, ctx.taskId);
  if (!task || task.userId !== ctx.taskOwnerUserId) {
    return 'Error: task owner context is invalid';
  }

  const message = insertMessage(ctx.db, {
    taskId: ctx.taskId,
    senderType: 'agent',
    senderId: ctx.actingAgentId,
    body: report,
  });
  emitMainMessage(ctx.io, ctx.taskOwnerUserId, message);

  const closureSummary = status === 'done'
    ? 'Closed: the requesting agent finished the task.'
    : 'Closed: the requesting agent stopped the task.';
  for (const subchat of listSubchatsByTask(ctx.db, ctx.taskId)) {
    if (subchat.status !== 'open') {
      continue;
    }
    closeSubchatAndNotify(ctx.db, ctx.io, subchat.id, status, closureSummary);
  }
  setTaskStatus(ctx.db, ctx.taskId, status);

  const otherActiveTasks = ctx.db.prepare(
    `SELECT id FROM tasks
     WHERE user_id = ? AND id <> ? AND status = 'active'
     ORDER BY created_at, id`,
  ).all(ctx.taskOwnerUserId, ctx.taskId) as Array<{ id: ID }>;
  const hasOtherOpenSubchat = agentHasOtherActiveSubchat(
    ctx.db,
    ctx.actingAgentId,
    ctx.taskId,
  );
  const hasOtherScopedTask = otherActiveTasks.some(({ id }) => Boolean(getTaskScope(ctx.db, id)));
  const hasOtherUnscopedTask = otherActiveTasks.some(({ id }) => !getTaskScope(ctx.db, id));
  const agentStatus = hasOtherOpenSubchat || hasOtherScopedTask
    ? 'negotiating'
    : hasOtherUnscopedTask
      ? 'clarifying'
      : status;
  setAgentStatus(ctx.db, ctx.actingAgentId, agentStatus);
  emitAgentStatus(ctx.io, ctx.db, ctx.actingAgentId, agentStatus, ctx.taskOwnerUserId);
  emitNetworkUpdated(ctx.io, ctx.db, ctx.taskOwnerUserId);
  emitTaskUpdated(ctx.io, ctx.taskOwnerUserId, { id: task.id, status });
  return 'Task reported to human.';
}

async function reportToHuman(ctx: TrustedCtx, args: Args): Promise<string> {
  if (ctx.mode === 'peer') {
    return "only the task owner's agent can finish this task";
  }
  const ownerError = assertOwnerContext(ctx);
  if (ownerError) {
    return `Error: ${ownerError}`;
  }
  if (
    typeof args.taskId !== 'string'
    || args.taskId !== ctx.taskId
    || (args.status !== 'done' && args.status !== 'stuck')
    || typeof args.summary !== 'string'
    || args.summary.trim().length === 0
    || args.summary.length > 4000
  ) {
    return 'Invalid arguments: taskId, status, and a non-empty summary are required';
  }
  const task = getTask(ctx.db, ctx.taskId);
  if (!task || task.userId !== ctx.taskOwnerUserId) {
    return 'Error: task owner context is invalid';
  }
  const report = `${args.summary}${releasedFactsAppendix(ctx)}`;
  return persistOwnerReport(ctx, args.status, report);
}

function agentHasOtherActiveSubchat(db: Database, agentId: ID, excludeTaskId: ID): boolean {
  return Boolean(db.prepare(
    `SELECT 1
     FROM subchat_participants AS participants
     JOIN subchats ON subchats.id = participants.subchat_id
     JOIN tasks ON tasks.id = subchats.task_id
     WHERE participants.agent_id = ?
       AND subchats.status = 'open'
       AND tasks.status = 'active'
       AND tasks.id <> ?
     LIMIT 1`,
  ).get(agentId, excludeTaskId));
}

export interface ToolExecution {
  content: string;
  stop: boolean;
}

export async function executeToolCall(ctx: TrustedCtx, call: ToolCall): Promise<ToolExecution> {
  const parsed = toolArgs(call);
  if (typeof parsed === 'string') {
    return { content: parsed, stop: false };
  }

  let content: string;
  try {
    switch (call.name) {
      case 'query_memory':
        content = await queryMemory(ctx, parsed);
        break;
      case 'open_subchat':
        content = await openSubchat(ctx, parsed);
        break;
      case 'send_subchat_message':
        content = await sendSubchatMessage(ctx, parsed);
        break;
      case 'report_to_human':
        content = await reportToHuman(ctx, parsed);
        break;
      default:
        content = `Error: unknown tool ${call.name}`;
    }
  } catch (error) {
    content = 'Error: tool failed';
  }
  return {
    content,
    stop: call.name === 'report_to_human' && content === 'Task reported to human.',
  };
}

export function toolResultMessage(call: ToolCall, content: string): LLMMessage {
  return { role: 'tool', toolCallId: call.id, content };
}

export function toolCallMessage(calls: ToolCall[]): LLMMessage {
  return { role: 'assistant', content: '', toolCalls: calls };
}

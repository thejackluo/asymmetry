import type BetterSqlite3 from 'better-sqlite3';
import type { MemoryEngine, ID } from '@asymmetry/shared';
import type { Server } from 'socket.io';
import { Budget, PEER_CAP } from './budgets.js';
import { emitAgentStatus, emitMainMessage, emitNetworkUpdated, emitSubchatEvent, emitTaskUpdated } from './emit.js';
import { EVENTS } from './events.js';
import {
  agentHasOtherActiveSubchat,
  closeSubchat,
  createSubchat,
  getTask,
  getTaskScope,
  insertMessage,
  listParticipants,
  listSubchatsByTask,
  setAgentStatus,
  setTaskStatus,
  subchatById,
  userByAgent,
} from './repo.js';
import { buildDirectory } from './peers.js';
import { validateScopeRequest } from './scope.js';
import type { LLMMessage, ToolCall, ToolSpec } from './llm.js';

type Database = BetterSqlite3.Database;

export interface RuntimeHooks {
  budgetFor(taskId: ID): Budget;
  wakeOwner(taskId: ID, note?: string): void;
  runPeer(subchatId: ID, agentId: ID): void;
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

type Args = Record<string, unknown>;

function isRecord(value: unknown): value is Args {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const canonical = getTaskScope(ctx.db, ctx.taskId);
  if (!canonical) {
    return 'Error: canonical task scope is not available';
  }
  const scope = validateScopeRequest(canonical, args.scope.fields);
  if (!scope.ok) {
    return `Error: fields outside the canonical task scope: ${scope.fields.join(', ')}`;
  }
  const requesterUserId = ctx.mode === 'owner' ? actingOwner.id : ctx.taskOwnerUserId;
  const result = await ctx.memory.queryMemory(actingOwner.id, requesterUserId, {
    taskId: ctx.taskId,
    purpose: canonical.purpose,
    fields: scope.fields,
    ...(ctx.subchatId ? { subchatId: ctx.subchatId } : {}),
  });
  return JSON.stringify({
    facts: result.items.map((item) => item.content),
    withheldCount: result.withheldCount,
  });
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
  const directoryIds = new Set(buildDirectory(ctx.db, ctx.taskOwnerUserId).map(({ agentId }) => agentId));
  const unauthorized = requestedIds.filter((agentId) => !directoryIds.has(agentId));
  if (unauthorized.length > 0) {
    return `Error: peers are not in the task directory: ${unauthorized.join(', ')}`;
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
  emitNetworkUpdated(ctx.io, ctx.db, ctx.taskOwnerUserId);
  for (const agentId of subchat.participantAgentIds) {
    setAgentStatus(ctx.db, agentId, 'negotiating');
    emitAgentStatus(ctx.io, ctx.db, agentId, 'negotiating', ctx.taskOwnerUserId);
  }
  return JSON.stringify(subchat);
}

async function sendSubchatMessage(ctx: TrustedCtx, args: Args): Promise<string> {
  if (typeof args.body !== 'string' || args.body.trim().length === 0 || args.body.length > 4000) {
    return 'Invalid arguments: body must be non-empty and at most 4000 characters';
  }
  let subchatId: ID | null = null;
  if (ctx.mode === 'owner') {
    if (typeof args.subchatId !== 'string') {
      return 'Invalid arguments: owner mode requires subchatId';
    }
    subchatId = args.subchatId;
  } else {
    if (!ctx.subchatId) {
      return 'Error: peer mode is not bound to a subchat';
    }
    if (args.subchatId !== undefined && args.subchatId !== ctx.subchatId) {
      return 'Error: peer mode cannot send to another subchat';
    }
    subchatId = ctx.subchatId;
  }

  const subchat = subchatById(ctx.db, subchatId);
  if (!subchat || subchat.taskId !== ctx.taskId || subchat.status !== 'open') {
    return 'Error: subchat must be open and belong to this task';
  }
  const participants = listParticipants(ctx.db, subchatId);
  if (!participants.includes(ctx.actingAgentId)) {
    return 'Error: acting agent is not a subchat participant';
  }

  if (!ctx.rt.budgetFor(ctx.taskId).reserveSubchatTurn(subchatId)) {
    closeSubchat(ctx.db, subchatId);
    emitSubchatEvent(ctx.io, ctx.db, subchatId, EVENTS.SUBCHAT_CLOSED, {
      subchatId,
      outcome: 'stuck',
      summary: 'turn cap reached',
    });
    ctx.rt.wakeOwner(ctx.taskId, `Subchat ${subchatId} closed because the turn cap was reached.`);
    return 'Error: subchat turn cap reached';
  }

  const message = insertMessage(ctx.db, {
    taskId: ctx.taskId,
    subchatId,
    senderType: 'agent',
    senderId: ctx.actingAgentId,
    body: args.body,
  });
  emitSubchatEvent(ctx.io, ctx.db, subchatId, EVENTS.SUBCHAT_MESSAGE, message);
  for (const participantId of participants) {
    if (participantId !== ctx.actingAgentId && participantId !== ctx.ownerAgentId) {
      ctx.rt.runPeer(subchatId, participantId);
    }
  }
  if (ctx.actingAgentId !== ctx.ownerAgentId) {
    ctx.rt.wakeOwner(ctx.taskId, `New subchat message from agent ${ctx.actingAgentId}.`);
  }
  return JSON.stringify(message);
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

  const message = insertMessage(ctx.db, {
    taskId: ctx.taskId,
    senderType: 'agent',
    senderId: ctx.actingAgentId,
    body: args.summary,
  });
  emitMainMessage(ctx.io, ctx.taskOwnerUserId, message);
  setTaskStatus(ctx.db, ctx.taskId, args.status);

  for (const subchat of listSubchatsByTask(ctx.db, ctx.taskId)) {
    if (subchat.status !== 'open') {
      continue;
    }
    closeSubchat(ctx.db, subchat.id);
    emitSubchatEvent(ctx.io, ctx.db, subchat.id, EVENTS.SUBCHAT_CLOSED, {
      subchatId: subchat.id,
      outcome: args.status,
      summary: args.summary,
    });
  }

  const status = agentHasOtherActiveSubchat(ctx.db, ctx.actingAgentId, ctx.taskId)
    ? 'negotiating'
    : args.status;
  setAgentStatus(ctx.db, ctx.actingAgentId, status);
  emitAgentStatus(ctx.io, ctx.db, ctx.actingAgentId, status, ctx.taskOwnerUserId);
  emitTaskUpdated(ctx.io, ctx.taskOwnerUserId, { id: task.id, status: args.status });
  return 'Task reported to human.';
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
    content = `Error: ${errorText(error)}`;
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

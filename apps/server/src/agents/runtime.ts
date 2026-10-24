import type { ID, MemoryEngine, Message, Task } from '@asymmetry/shared';
import type { Server } from 'socket.io';
import type { Database } from '../db.js';
import { Budget, MODEL_TIMEOUT_MS, TASK_MODEL_CALL_CAP, TOOL_ITER_CAP } from './budgets.js';
import { logAgentError, safeFailureReason } from './errors.js';
import { emitMainMessage, emitSubchatEvent } from './emit.js';
import { EVENTS } from './events.js';
import { agentById, agentByUser, getTask, getTaskScope, insertMessage, listMainThreadMessages, listSubchatMessages, listSubchatsByTask, subchatById, userByAgent } from './repo.js';
import { buildDirectory } from './peers.js';
import { closeSubchatAndNotify } from './subchats.js';
import { buildOwnerPrompt, buildPeerPrompt, peerMessageToLLM } from './persona.js';
import { withTimeout, type LLMClient, type LLMMessage } from './llm.js';
import {
  AGENT_TOOLS,
  executeToolCall,
  toolCallMessage,
  toolResultMessage,
  type RuntimeHooks,
  type TrustedCtx,
} from './tools.js';
import { createInboxHandlers } from './inbox.js';

export interface CreateAgentRuntimeOptions {
  io: Server;
  db: Database;
  memory: MemoryEngine;
  llm: LLMClient;
  timeoutMs?: number;
}

export interface AgentRuntime {
  handleTaskCreate: ReturnType<typeof createInboxHandlers>['handleTaskCreate'];
  handleChatSend: ReturnType<typeof createInboxHandlers>['handleChatSend'];
  wakeOwner(taskId: ID, note?: string): void;
  runPeer(subchatId: ID, agentId: ID): void;
  idle(): Promise<void>;
}

interface OwnerWakeState {
  pending: boolean;
  scheduled: boolean;
}

function senderName(db: Database, message: Message): string {
  return message.senderType === 'agent'
    ? agentById(db, message.senderId)?.name ?? 'Agent'
    : message.senderType === 'human' ? 'Human' : 'System';
}

function ownerHistory(
  db: Database,
  task: Task,
  ownerAgentId: ID,
  ownerDisplayName: string,
): LLMMessage[] {
  const scope = getTaskScope(db, task.id);
  const mainMessages = listMainThreadMessages(db, task.id);
  const history: LLMMessage[] = [{
    role: 'system',
    content: buildOwnerPrompt({
      agent: agentById(db, ownerAgentId)!,
      ownerDisplayName,
      task,
      scope,
      directory: buildDirectory(db, task.userId),
      clarificationsUsed: mainMessages.filter(({ senderType }) => senderType === 'agent').length,
    }),
  }];

  for (const message of mainMessages) {
    if (message.senderType === 'human') {
      history.push({ role: 'user', content: message.body });
    } else if (message.senderType === 'system') {
      history.push({ role: 'user', content: `[System note] ${message.body}` });
    } else {
      history.push({ role: 'assistant', content: message.body });
    }
  }

  for (const subchat of listSubchatsByTask(db, task.id)) {
    for (const message of listSubchatMessages(db, subchat.id)) {
      if (message.senderType === 'agent' && message.senderId === ownerAgentId) {
        history.push({ role: 'assistant', content: `[Subchat ${subchat.id}] ${message.body}` });
      } else {
        const wrapped = peerMessageToLLM(message, senderName(db, message));
        history.push({
          role: 'user',
          content: `[Subchat ${subchat.id}] ${wrapped.content}`,
        });
      }
    }
  }
  return history;
}

function peerHistory(
  db: Database,
  task: Task,
  subchatId: ID,
  agentId: ID,
  ownerDisplayName: string,
  ownerAgentId: ID,
): LLMMessage[] {
  const agent = agentById(db, agentId)!;
  const ownerAgent = agentById(db, ownerAgentId)!;
  const scope = getTaskScope(db, task.id);
  const history: LLMMessage[] = [{
    role: 'system',
    content: buildPeerPrompt({
      agent,
      ownerDisplayName,
      requesterAgentName: ownerAgent.name,
      taskId: task.id,
      subchatId,
      scope,
    }),
  }];
  for (const message of listSubchatMessages(db, subchatId)) {
    if (message.senderType === 'agent' && message.senderId === agentId) {
      history.push({ role: 'assistant', content: message.body });
    } else {
      history.push(peerMessageToLLM(message, senderName(db, message)));
    }
  }
  return history;
}

export function createAgentRuntime({
  io,
  db,
  memory,
  llm,
  timeoutMs = MODEL_TIMEOUT_MS,
}: CreateAgentRuntimeOptions): AgentRuntime {
  const timedLLM = withTimeout(llm, timeoutMs);
  const budgets = new Map<ID, Budget>();
  const ownerWakeStates = new Map<ID, OwnerWakeState>();
  const queueTails = new Map<string, Promise<void>>();
  const idleWaiters = new Set<() => void>();
  let activeJobs = 0;

  const budgetFor = (taskId: ID): Budget => {
    let budget = budgets.get(taskId);
    if (!budget) {
      budget = new Budget(taskId);
      budgets.set(taskId, budget);
    }
    return budget;
  };

  function enqueue(key: string, job: () => Promise<void>): void {
    const previous = queueTails.get(key) ?? Promise.resolve();
    activeJobs += 1;
    let queued: Promise<void>;
    queued = previous
      .catch(() => undefined)
      .then(job)
      .catch((error: unknown) => {
        logAgentError(`queue ${key}`, error);
      })
      .finally(() => {
        if (queueTails.get(key) === queued) {
          queueTails.delete(key);
        }
        activeJobs -= 1;
        if (activeJobs === 0) {
          for (const resolve of idleWaiters) {
            resolve();
          }
          idleWaiters.clear();
        }
      });
    queueTails.set(key, queued);
  }

  function contextFor(
    task: Task,
    ownerAgentId: ID,
    actingAgentId: ID,
    mode: 'owner' | 'peer',
    subchatId: ID | null,
  ): TrustedCtx {
    const rt: RuntimeHooks = { budgetFor, wakeOwner, reportOwnerFailure, runPeer };
    return {
      db,
      io,
      memory,
      rt,
      taskId: task.id,
      taskOwnerUserId: task.userId,
      ownerAgentId,
      actingAgentId,
      mode,
      subchatId,
    };
  }

  async function reportOwnerFailure(taskId: ID, reason: string): Promise<void> {
    const task = getTask(db, taskId);
    if (!task || task.status !== 'active') {
      return;
    }
    const ownerAgent = agentByUser(db, task.userId);
    if (!ownerAgent) {
      return;
    }
    await executeToolCall(
      contextFor(task, ownerAgent.id, ownerAgent.id, 'owner', null),
      {
        id: 'server-failure-report',
        name: 'report_to_human',
        args: { taskId, status: 'stuck', summary: reason },
      },
    );
  }

  async function runOwnerLoop(taskId: ID): Promise<void> {
    const task = getTask(db, taskId);
    if (!task || task.status !== 'active') {
      return;
    }
    const ownerAgent = agentByUser(db, task.userId);
    const ownerUser = ownerAgent ? userByAgent(db, ownerAgent.id) : undefined;
    if (!ownerAgent || !ownerUser || !getTaskScope(db, taskId)) {
      return;
    }
    const messages = ownerHistory(db, task, ownerAgent.id, ownerUser.displayName);
    const ctx = contextFor(task, ownerAgent.id, ownerAgent.id, 'owner', null);

    for (let iteration = 0; iteration < TOOL_ITER_CAP; iteration += 1) {
      if (!budgetFor(taskId).reserveModelCall()) {
        await reportOwnerFailure(taskId, `task model-call budget exhausted (cap ${TASK_MODEL_CALL_CAP})`);
        return;
      }
      let result;
      try {
        result = await timedLLM.chat(messages, AGENT_TOOLS);
      } catch (error) {
        await reportOwnerFailure(taskId, safeFailureReason(error));
        return;
      }

      const calls = result.toolCalls ?? [];
      if (calls.length > 0) {
        messages.push(toolCallMessage(calls));
        for (const call of calls) {
          const execution = await executeToolCall(ctx, call);
          messages.push(toolResultMessage(call, execution.content));
          if (execution.stop) {
            return;
          }
          if (getTask(db, taskId)?.status !== 'active') {
            return;
          }
        }
        continue;
      }

      if (typeof result.reply === 'string' && result.reply.trim().length > 0) {
        const message = insertMessage(db, {
          taskId,
          senderType: 'agent',
          senderId: ownerAgent.id,
          body: result.reply,
        });
        emitMainMessage(io, task.userId, message);
        return;
      }
      await reportOwnerFailure(taskId, 'model returned no text reply or tool call');
      return;
    }
    await reportOwnerFailure(taskId, `tool iteration cap reached (${TOOL_ITER_CAP})`);
  }

  async function failPeer(subchatId: ID, agentId: ID, taskId: ID, reason: string): Promise<void> {
    const subchat = subchatById(db, subchatId);
    if (!subchat || subchat.status !== 'open') {
      return;
    }
    const task = getTask(db, taskId);
    if (!task) {
      return;
    }
    closeSubchatAndNotify(
      db,
      io,
      subchatId,
      'stuck',
      'Closed: a peer agent stopped before completing this subchat.',
    );
    const peerName = agentById(db, agentId)?.name ?? 'Peer agent';
    wakeOwner(taskId, `${peerName} stopped: ${reason}`);
  }

  async function runPeerLoop(subchatId: ID, agentId: ID): Promise<void> {
    const subchat = subchatById(db, subchatId);
    const task = subchat ? getTask(db, subchat.taskId) : undefined;
    if (!subchat || !task || task.status !== 'active' || subchat.status !== 'open') {
      return;
    }
    const participants = subchat.participantAgentIds;
    if (!participants.includes(agentId)) {
      return;
    }
    const ownerAgent = agentByUser(db, task.userId);
    const ownerUser = ownerAgent ? userByAgent(db, ownerAgent.id) : undefined;
    const peerUser = userByAgent(db, agentId);
    const peerAgent = agentById(db, agentId);
    if (!ownerAgent || !ownerUser || !peerUser || !peerAgent || agentId === ownerAgent.id) {
      return;
    }
    if (!getTaskScope(db, task.id)) {
      await failPeer(subchatId, agentId, task.id, 'canonical task scope is missing');
      return;
    }
    const messages = peerHistory(db, task, subchatId, agentId, peerUser.displayName, ownerAgent.id);
    const ctx = contextFor(task, ownerAgent.id, agentId, 'peer', subchatId);

    for (let iteration = 0; iteration < TOOL_ITER_CAP; iteration += 1) {
      if (!budgetFor(task.id).reserveModelCall()) {
        await failPeer(subchatId, agentId, task.id, `task model-call budget exhausted (cap ${TASK_MODEL_CALL_CAP})`);
        return;
      }
      let result;
      try {
        result = await timedLLM.chat(messages, AGENT_TOOLS);
      } catch (error) {
        await failPeer(subchatId, agentId, task.id, safeFailureReason(error));
        return;
      }

      const calls = result.toolCalls ?? [];
      if (calls.length > 0) {
        messages.push(toolCallMessage(calls));
        for (const call of calls) {
          const execution = await executeToolCall(ctx, call);
          messages.push(toolResultMessage(call, execution.content));
          if (getTask(db, task.id)?.status !== 'active' || subchatById(db, subchatId)?.status !== 'open') {
            return;
          }
        }
        continue;
      }

      if (typeof result.reply === 'string' && result.reply.trim().length > 0) {
        const execution = await executeToolCall(ctx, {
          id: 'peer-text-reply',
          name: 'send_subchat_message',
          args: { body: result.reply },
        });
        if (execution.content.startsWith('Error:') || execution.content.startsWith('Invalid arguments:')) {
          if (subchatById(db, subchatId)?.status === 'open') {
            await failPeer(subchatId, agentId, task.id, 'peer reply could not be sent');
          }
        }
        return;
      }
      await failPeer(subchatId, agentId, task.id, 'model returned no text reply or tool call');
      return;
    }
    await failPeer(subchatId, agentId, task.id, `tool iteration cap reached (${TOOL_ITER_CAP})`);
  }

  function wakeOwner(taskId: ID, note?: string): void {
    const task = getTask(db, taskId);
    if (!task) {
      return;
    }
    if (note) {
      const ownerAgent = agentByUser(db, task.userId);
      if (ownerAgent) {
        const message = insertMessage(db, {
          taskId,
          senderType: 'system',
          senderId: ownerAgent.id,
          body: note,
        });
        emitMainMessage(io, task.userId, message);
      }
    }
    const state = ownerWakeStates.get(taskId) ?? { pending: false, scheduled: false };
    ownerWakeStates.set(taskId, state);
    state.pending = true;
    if (state.scheduled) {
      return;
    }
    state.scheduled = true;
    enqueue(`main:${taskId}`, async () => {
      while (state.pending) {
        state.pending = false;
        await runOwnerLoop(taskId);
      }
      state.scheduled = false;
      if (state.pending) {
        wakeOwner(taskId);
      }
    });
  }

  function runPeer(subchatId: ID, agentId: ID): void {
    enqueue(`sub:${subchatId}:${agentId}`, () => runPeerLoop(subchatId, agentId));
  }

  const hooks: RuntimeHooks = { budgetFor, wakeOwner, reportOwnerFailure, runPeer };
  const inbox = createInboxHandlers({ io, db, memory, llm, timeoutMs, rt: hooks });

  return {
    ...inbox,
    wakeOwner,
    runPeer,
    async idle() {
      if (activeJobs === 0) {
        return;
      }
      await new Promise<void>((resolve) => idleWaiters.add(resolve));
      if (activeJobs > 0) {
        await this.idle();
      }
    },
  };
}

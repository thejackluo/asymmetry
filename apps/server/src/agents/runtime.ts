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
  OWNER_AGENT_TOOLS,
  executeToolCall,
  formatReleasedPeerFacts,
  persistOwnerReport,
  toolCallMessage,
  toolResultMessage,
  type ReleasedPeerFact,
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
  const releasedPeerFacts = new Map<ID, Map<ID, ReleasedPeerFact>>();
  const releasedPeerFactIdsBySubchat = new Map<ID, Set<ID>>();
  const peerMemoryResults = new Map<ID, Map<ID, string>>();
  const finalizingTasks = new Set<ID>();
  const finalizedTasks = new Set<ID>();
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

  function recordPeerFacts(
    taskId: ID,
    ownerAgentName: string,
    facts: Array<{ id: ID; text: string }>,
    subchatId?: ID,
  ): void {
    let factsById = releasedPeerFacts.get(taskId);
    if (!factsById) {
      factsById = new Map();
      releasedPeerFacts.set(taskId, factsById);
    }
    for (const fact of facts) {
      factsById.set(fact.id, { ...fact, ownerAgentName });
      if (subchatId) {
        let factIds = releasedPeerFactIdsBySubchat.get(subchatId);
        if (!factIds) {
          factIds = new Set();
          releasedPeerFactIdsBySubchat.set(subchatId, factIds);
        }
        factIds.add(fact.id);
      }
    }
  }

  function takePeerFacts(taskId: ID): ReleasedPeerFact[] {
    const facts = [...(releasedPeerFacts.get(taskId)?.values() ?? [])];
    releasedPeerFacts.delete(taskId);
    return facts;
  }

  function getPeerMemoryResult(subchatId: ID, agentId: ID): string | undefined {
    return peerMemoryResults.get(subchatId)?.get(agentId);
  }

  function cachePeerMemoryResult(subchatId: ID, agentId: ID, result: string): void {
    let resultsByAgent = peerMemoryResults.get(subchatId);
    if (!resultsByAgent) {
      resultsByAgent = new Map();
      peerMemoryResults.set(subchatId, resultsByAgent);
    }
    resultsByAgent.set(agentId, result);
  }

  function clearPeerMemoryResults(subchatId: ID): void {
    peerMemoryResults.delete(subchatId);
    releasedPeerFactIdsBySubchat.delete(subchatId);
  }

  function hasPeerFactsInSubchat(subchatId: ID): boolean {
    return (releasedPeerFactIdsBySubchat.get(subchatId)?.size ?? 0) > 0;
  }

  function clearTaskPeerMemoryResults(taskId: ID): void {
    for (const { id } of listSubchatsByTask(db, taskId)) {
      clearPeerMemoryResults(id);
    }
  }

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
    const rt: RuntimeHooks = {
      budgetFor,
      wakeOwner,
      reportOwnerFailure,
      runPeer,
      recordPeerFacts,
      takePeerFacts,
      getPeerMemoryResult,
      cachePeerMemoryResult,
    };
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

  function allSubchatsClosed(taskId: ID): boolean {
    const subchats = listSubchatsByTask(db, taskId);
    return subchats.length > 0 && subchats.every(({ status }) => status !== 'open');
  }

  async function finalizeDeterministically(taskId: ID): Promise<void> {
    if (finalizedTasks.has(taskId) || finalizingTasks.has(taskId)) {
      return;
    }
    const task = getTask(db, taskId);
    const ownerAgent = task ? agentByUser(db, task.userId) : undefined;
    if (!task || task.status !== 'active' || !ownerAgent) {
      return;
    }

    finalizingTasks.add(taskId);
    try {
      const facts = takePeerFacts(taskId);
      const hasFacts = facts.length > 0;
      const report = hasFacts
        ? `Here's what I found in your network:\n${formatReleasedPeerFacts(facts)}\nWant me to propose a warm intro? Nothing is sent without your OK.`
        : "I couldn't find a matching option in your network yet.";
      const result = await persistOwnerReport(
        contextFor(task, ownerAgent.id, ownerAgent.id, 'owner', null),
        hasFacts ? 'done' : 'stuck',
        report,
      );
      if (result === 'Task reported to human.') {
        finalizedTasks.add(taskId);
        clearTaskPeerMemoryResults(taskId);
      }
    } finally {
      finalizingTasks.delete(taskId);
    }
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
    clearTaskPeerMemoryResults(taskId);
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
        await finalizeDeterministically(taskId);
        return;
      }
      let result;
      try {
        result = await timedLLM.chat(messages, OWNER_AGENT_TOOLS);
      } catch (error) {
        if (allSubchatsClosed(taskId)) {
          await finalizeDeterministically(taskId);
        } else {
          await reportOwnerFailure(taskId, safeFailureReason(error));
        }
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
            clearTaskPeerMemoryResults(taskId);
            return;
          }
        }
        if (allSubchatsClosed(taskId)) {
          await finalizeDeterministically(taskId);
          return;
        }
        continue;
      }

      if (typeof result.reply === 'string' && result.reply.trim().length > 0) {
        if (allSubchatsClosed(taskId)) {
          await finalizeDeterministically(taskId);
          return;
        }
        const message = insertMessage(db, {
          taskId,
          senderType: 'agent',
          senderId: ownerAgent.id,
          body: result.reply,
        });
        emitMainMessage(io, task.userId, message);
        return;
      }
      if (allSubchatsClosed(taskId)) {
        await finalizeDeterministically(taskId);
      } else {
        await reportOwnerFailure(taskId, 'model returned no text reply or tool call');
      }
      return;
    }
    await finalizeDeterministically(taskId);
  }

  function closePeerAnswer(subchatId: ID, taskId: ID): void {
    const outcome = hasPeerFactsInSubchat(subchatId) ? 'done' : 'stuck';
    if (closeSubchatAndNotify(
      db,
      io,
      subchatId,
      outcome,
      'Closed: the peer agent answered.',
    )) {
      clearPeerMemoryResults(subchatId);
      wakeOwner(taskId);
    }
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
    clearPeerMemoryResults(subchatId);
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
          if (call.name === 'send_subchat_message') {
            if (execution.content.startsWith('Error:') || execution.content.startsWith('Invalid arguments:')) {
              await failPeer(subchatId, agentId, task.id, 'peer reply could not be sent');
            } else {
              closePeerAnswer(subchatId, task.id);
            }
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
        } else {
          closePeerAnswer(subchatId, task.id);
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
      try {
        while (state.pending) {
          state.pending = false;
          await runOwnerLoop(taskId);
        }
      } finally {
        state.scheduled = false;
        if (state.pending) {
          wakeOwner(taskId);
        }
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

import type BetterSqlite3 from 'better-sqlite3';
import type { ID, MemoryEngine, Message, Task } from '@asymmetry/shared';
import type { Server, Socket } from 'socket.io';
import { CLARIFY_CAP, MODEL_TIMEOUT_MS } from './budgets.js';
import { emitAgentStatus, emitMainMessage, emitTaskUpdated } from './emit.js';
import { EVENTS } from './events.js';
import { LLMTimeoutError, withTimeout, type LLMClient, type LLMMessage } from './llm.js';
import { buildDirectory } from './peers.js';
import {
  agentByUser,
  closeSubchat,
  createTask,
  getTask,
  getTaskScope,
  insertMessage,
  listMainThreadMessages,
  listSubchatsByTask,
  putTaskScope,
  setAgentStatus,
  setTaskStatus,
  userByAgent,
} from './repo.js';
import { deriveScope } from './scope.js';
import type { RuntimeHooks } from './tools.js';
import { buildOwnerPrompt } from './persona.js';

type Database = BetterSqlite3.Database;

export type InboxAck = (result: { ok: true; task?: Task; message?: Message } | { ok: false; error: string }) => void;

export interface AgentInboxHandlers {
  handleTaskCreate(socket: Socket, payload: unknown, ack?: InboxAck): Promise<void>;
  handleChatSend(socket: Socket, payload: unknown, ack?: InboxAck): Promise<void>;
}

interface CreateInboxHandlersOptions {
  io: Server;
  db: Database;
  memory: MemoryEngine;
  llm: LLMClient;
  timeoutMs?: number;
  rt: RuntimeHooks;
}

interface RecordValue {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorReason(error: unknown, timeoutMs: number): string {
  if (error instanceof LLMTimeoutError) {
    return `model request timed out after ${timeoutMs}ms`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('OPENAI_API_KEY is required')) {
    return 'LLM not configured';
  }
  return `model error: ${message}`;
}

function replyMessages(messages: Message[]): LLMMessage[] {
  return messages.map((message) => {
    if (message.senderType === 'human') {
      return { role: 'user', content: message.body };
    }
    if (message.senderType === 'system') {
      return { role: 'user', content: `[System note] ${message.body}` };
    }
    return { role: 'assistant', content: message.body };
  });
}

function persistAgentMessage(
  io: Server,
  db: Database,
  task: Task,
  agentId: ID,
  body: string,
): Message {
  const message = insertMessage(db, {
    taskId: task.id,
    senderType: 'agent',
    senderId: agentId,
    body,
  });
  emitMainMessage(io, task.userId, message);
  return message;
}

function reportStuck(
  io: Server,
  db: Database,
  task: Task,
  agentId: ID,
  summary: string,
): void {
  persistAgentMessage(io, db, task, agentId, summary);
  setTaskStatus(db, task.id, 'stuck');
  for (const subchat of listSubchatsByTask(db, task.id)) {
    if (subchat.status === 'open') {
      closeSubchat(db, subchat.id);
    }
  }
  setAgentStatus(db, agentId, 'stuck');
  emitAgentStatus(io, db, agentId, 'stuck', task.userId);
  emitTaskUpdated(io, task.userId, { id: task.id, status: 'stuck' });
}

export function createInboxHandlers({
  io,
  db,
  memory,
  llm,
  timeoutMs = MODEL_TIMEOUT_MS,
  rt,
}: CreateInboxHandlersOptions): AgentInboxHandlers {
  const timedLLM = withTimeout(llm, timeoutMs);

  async function handleTaskCreate(socket: Socket, payload: unknown, ack?: InboxAck): Promise<void> {
    const userId = socket.data.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      ack?.({ ok: false, error: 'authenticated user is required' });
      return;
    }
    const title = isRecord(payload) && typeof payload.title === 'string' ? payload.title.trim() : '';
    if (title.length < 1 || title.length > 200) {
      ack?.({ ok: false, error: 'title must be between 1 and 200 characters' });
      return;
    }
    const task = createTask(db, userId, title);
    io.to(`user:${userId}`).emit(EVENTS.TASK_CREATED, task);
    ack?.({ ok: true, task });
  }

  async function askClarifyingQuestion(task: Task, agentId: ID, clarificationsUsed: number): Promise<void> {
    const owner = userByAgent(db, agentId);
    if (!owner) {
      reportStuck(io, db, task, agentId, 'LLM not configured');
      return;
    }
    if (!rt.budgetFor(task.id).reserveModelCall()) {
      reportStuck(io, db, task, agentId, 'task model-call budget exhausted');
      return;
    }
    const systemPrompt = buildOwnerPrompt({
      agent: agentByUser(db, task.userId)!,
      ownerDisplayName: owner.displayName,
      task,
      scope: null,
      directory: buildDirectory(db, task.userId),
      clarificationsUsed,
    });
    try {
      const result = await timedLLM.chat([
        { role: 'system', content: systemPrompt },
        ...replyMessages(listMainThreadMessages(db, task.id)),
      ], []);
      if (typeof result.reply !== 'string' || result.reply.trim().length === 0) {
        reportStuck(io, db, task, agentId, 'model returned no clarifying question');
        return;
      }
      persistAgentMessage(io, db, task, agentId, result.reply);
    } catch (error) {
      reportStuck(io, db, task, agentId, errorReason(error, timeoutMs));
    }
  }

  async function handleChatSend(socket: Socket, payload: unknown, ack?: InboxAck): Promise<void> {
    const userId = socket.data.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      ack?.({ ok: false, error: 'authenticated user is required' });
      return;
    }
    if (
      !isRecord(payload)
      || typeof payload.taskId !== 'string'
      || typeof payload.body !== 'string'
      || payload.body.trim().length === 0
      || payload.body.length > 4000
    ) {
      ack?.({ ok: false, error: 'taskId and a non-empty body of at most 4000 characters are required' });
      return;
    }
    const task = getTask(db, payload.taskId);
    if (!task || task.userId !== userId) {
      ack?.({ ok: false, error: 'task not found or not owned by this user' });
      return;
    }
    const ownerAgent = agentByUser(db, userId);
    if (!ownerAgent) {
      ack?.({ ok: false, error: 'task owner agent is unavailable' });
      return;
    }

    const humanMessage = insertMessage(db, {
      taskId: task.id,
      senderType: 'human',
      senderId: userId,
      body: payload.body,
    });
    emitMainMessage(io, userId, humanMessage);
    ack?.({ ok: true, message: humanMessage });

    try {
      await memory.ingest(userId, payload.body, 'chat');
    } catch (error) {
      console.error('Memory ingest failed', error);
    }
    try {
      await memory.extractGoals(userId, task.id, payload.body);
    } catch (error) {
      console.error('Goal extraction failed', error);
    }

    if (!getTaskScope(db, task.id)) {
      setAgentStatus(db, ownerAgent.id, 'clarifying');
      emitAgentStatus(io, db, ownerAgent.id, 'clarifying', userId);
      let scope;
      try {
        if (!rt.budgetFor(task.id).reserveModelCall()) {
          reportStuck(io, db, task, ownerAgent.id, 'task model-call budget exhausted');
          return;
        }
        scope = await deriveScope(timedLLM, {
          title: task.title,
          mainThread: listMainThreadMessages(db, task.id),
        });
      } catch (error) {
        reportStuck(io, db, task, ownerAgent.id, errorReason(error, timeoutMs));
        return;
      }
      if (scope) {
        db.transaction(() => {
          const canonical = getTaskScope(db, task.id);
          if (!canonical) {
            putTaskScope(db, { taskId: task.id, purpose: scope.purpose, fields: scope.fields });
          }
        }).immediate();
        rt.wakeOwner(task.id, `Task trigger message ${humanMessage.id} established the canonical scope.`);
        return;
      }

      const clarificationsUsed = listMainThreadMessages(db, task.id)
        .filter(({ senderType }) => senderType === 'agent').length;
      if (clarificationsUsed < CLARIFY_CAP) {
        await askClarifyingQuestion(task, ownerAgent.id, clarificationsUsed);
      } else {
        reportStuck(io, db, task, ownerAgent.id, "couldn't determine what information this task needs");
      }
      return;
    }

    rt.wakeOwner(task.id, `Task trigger message ${humanMessage.id}.`);
  }

  return { handleTaskCreate, handleChatSend };
}

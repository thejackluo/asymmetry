import type { CommandResult, ErrorCode, ID, MemoryEngine, Message, Task } from '@asymmetry/shared';
import { userRoom } from '@asymmetry/shared';
import type { Server, Socket } from 'socket.io';
import type { Database } from '../db.js';
import { CLARIFY_CAP, MODEL_TIMEOUT_MS } from './budgets.js';
import { emitAgentStatus, emitMainMessage } from './emit.js';
import { logAgentError, safeFailureReason } from './errors.js';
import { EVENTS } from './events.js';
import { withTimeout, type LLMClient, type LLMMessage } from './llm.js';
import { buildDirectory } from './peers.js';
import {
  agentByUser,
  createTask,
  getTask,
  getTaskScope,
  insertMessage,
  listMainThreadMessages,
  putTaskScope,
  setAgentStatus,
  userByAgent,
} from './repo.js';
import { deriveScope } from './scope.js';
import type { RuntimeHooks } from './tools.js';
import { buildOwnerPrompt } from './persona.js';

export type InboxAck<T> = (result: CommandResult<T>) => void;

export interface AgentInboxHandlers {
  handleTaskCreate(socket: Socket, payload: unknown, ack?: InboxAck<Task>): Promise<void>;
  handleChatSend(socket: Socket, payload: unknown, ack?: InboxAck<Message>): Promise<void>;
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

function ackError<T>(code: ErrorCode, message: string): CommandResult<T> {
  return { ok: false, error: { code, message } };
}

const INTERNAL_ERROR_MESSAGE = 'Internal server error';

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

function reportStuck(rt: RuntimeHooks, task: Task, summary: string): Promise<void> {
  return rt.reportOwnerFailure(task.id, summary);
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

  async function handleTaskCreate(
    socket: Socket,
    payload: unknown,
    ack?: InboxAck<Task>,
  ): Promise<void> {
    const userId = socket.data.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      ack?.(ackError('UNAUTHORIZED', 'authenticated user is required'));
      return;
    }
    const title = isRecord(payload) && typeof payload.title === 'string' ? payload.title.trim() : '';
    if (title.length < 1 || title.length > 200) {
      ack?.(ackError('BAD_INPUT', 'title must be between 1 and 200 characters'));
      return;
    }
    try {
      const task = createTask(db, userId, title);
      io.to(userRoom(userId)).emit(EVENTS.TASK_CREATED, task);
      ack?.({ ok: true, data: task });
    } catch {
      ack?.(ackError('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE));
    }
  }

  async function askClarifyingQuestion(task: Task, agentId: ID, clarificationsUsed: number): Promise<void> {
    const owner = userByAgent(db, agentId);
    if (!owner) {
      await reportStuck(rt, task, 'LLM not configured');
      return;
    }
    if (!rt.budgetFor(task.id).reserveModelCall()) {
      await reportStuck(rt, task, 'task model-call budget exhausted');
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
        await reportStuck(rt, task, 'model returned no clarifying question');
        return;
      }
      persistAgentMessage(io, db, task, agentId, result.reply);
    } catch (error) {
      await reportStuck(rt, task, safeFailureReason(error));
    }
  }

  async function handleChatSend(
    socket: Socket,
    payload: unknown,
    ack?: InboxAck<Message>,
  ): Promise<void> {
    const userId = socket.data.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      ack?.(ackError('UNAUTHORIZED', 'authenticated user is required'));
      return;
    }
    if (
      !isRecord(payload)
      || typeof payload.taskId !== 'string'
      || payload.taskId.trim().length === 0
      || typeof payload.body !== 'string'
      || payload.body.trim().length === 0
      || payload.body.length > 4000
    ) {
      ack?.(ackError('BAD_INPUT', 'taskId and a non-empty body of at most 4000 characters are required'));
      return;
    }
    let task: Task | undefined;
    try {
      task = getTask(db, payload.taskId);
    } catch {
      ack?.(ackError('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE));
      return;
    }
    if (!task || task.userId !== userId) {
      ack?.(ackError('NOT_FOUND', 'task not found or not owned by this user'));
      return;
    }
    let ownerAgent;
    try {
      ownerAgent = agentByUser(db, userId);
    } catch {
      ack?.(ackError('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE));
      return;
    }
    if (!ownerAgent) {
      ack?.(ackError('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE));
      return;
    }

    let humanMessage: Message;
    try {
      humanMessage = insertMessage(db, {
        taskId: task.id,
        senderType: 'human',
        senderId: userId,
        body: payload.body,
      });
      emitMainMessage(io, userId, humanMessage);
      ack?.({ ok: true, data: humanMessage });
    } catch {
      ack?.(ackError('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE));
      return;
    }

    try {
      await memory.ingest(userId, payload.body, 'chat');
    } catch (error) {
      logAgentError('memory ingest', error);
    }
    try {
      await memory.extractGoals(userId, task.id, payload.body);
    } catch (error) {
      logAgentError('goal extraction', error);
    }

    if (!getTaskScope(db, task.id)) {
      setAgentStatus(db, ownerAgent.id, 'clarifying');
      emitAgentStatus(io, db, ownerAgent.id, 'clarifying', userId);
      let scope;
      try {
        if (!rt.budgetFor(task.id).reserveModelCall()) {
          await reportStuck(rt, task, 'task model-call budget exhausted');
          return;
        }
        scope = await deriveScope(timedLLM, {
          title: task.title,
          mainThread: listMainThreadMessages(db, task.id),
        });
      } catch (error) {
        await reportStuck(rt, task, safeFailureReason(error));
        return;
      }
      if (scope) {
        db.transaction(() => {
          const canonical = getTaskScope(db, task.id);
          if (!canonical) {
            putTaskScope(db, { taskId: task.id, purpose: scope.purpose, fields: scope.fields });
          }
        }).immediate();
        rt.wakeOwner(task.id);
        return;
      }

      const clarificationsUsed = listMainThreadMessages(db, task.id)
        .filter(({ senderType }) => senderType === 'agent').length;
      if (clarificationsUsed < CLARIFY_CAP) {
        await askClarifyingQuestion(task, ownerAgent.id, clarificationsUsed);
      } else {
        await reportStuck(rt, task, "couldn't determine what information this task needs");
      }
      return;
    }

    rt.wakeOwner(task.id);
  }

  return { handleTaskCreate, handleChatSend };
}

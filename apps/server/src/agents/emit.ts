import type BetterSqlite3 from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { AgentStatus, ID, Message, Task } from '@asymmetry/shared';
import { EVENTS } from './events.js';
import {
  getTask,
  listParticipants,
  subchatById,
  userByAgent,
} from './repo.js';
import { networkPayload } from './peers.js';

type Database = BetterSqlite3.Database;

export function emitTo(
  io: Server,
  rooms: string[],
  event: string,
  payload: unknown,
): void {
  for (const room of new Set(rooms)) {
    io.to(room).emit(event, payload);
  }
}

export function emitMainMessage(io: Server, userId: ID, message: Message): void {
  emitTo(io, [`user:${userId}`], EVENTS.CHAT_MESSAGE, message);
}

export function emitSubchatEvent(
  io: Server,
  db: Database,
  subchatId: ID,
  event: typeof EVENTS.SUBCHAT_STARTED | typeof EVENTS.SUBCHAT_MESSAGE | typeof EVENTS.SUBCHAT_CLOSED,
  payload: unknown,
): void {
  const subchat = subchatById(db, subchatId);
  const task = subchat ? getTask(db, subchat.taskId) : undefined;
  if (!subchat || !task) {
    return;
  }

  const rooms = [`user:${task.userId}`];
  for (const agentId of listParticipants(db, subchatId)) {
    const participant = userByAgent(db, agentId);
    if (participant) {
      rooms.push(`user:${participant.id}`);
    }
  }
  emitTo(io, rooms, event, payload);
}

export function emitNetworkUpdated(io: Server, db: Database, userId: ID): void {
  emitTo(io, [`user:${userId}`], EVENTS.NETWORK_UPDATED, networkPayload(db, userId));
}

export function emitTaskUpdated(io: Server, userId: ID, task: Pick<Task, 'id' | 'status'>): void {
  emitTo(io, [`user:${userId}`], EVENTS.TASK_UPDATED, task);
}

export function emitAgentStatus(
  io: Server,
  db: Database,
  agentId: ID,
  status: AgentStatus,
  taskOwnerUserId: ID,
): void {
  const agentOwner = userByAgent(db, agentId);
  const rooms = [`user:${taskOwnerUserId}`];
  if (agentOwner) {
    rooms.push(`user:${agentOwner.id}`);
  }
  emitTo(io, rooms, EVENTS.AGENT_STATUS, { agentId, status });
}

import type { Server } from 'socket.io';
import type { ID } from '@asymmetry/shared';
import type { Database } from '../db.js';
import { emitAgentStatus, emitSubchatEvent } from './emit.js';
import { EVENTS } from './events.js';
import {
  agentByUser,
  agentHasOpenSubchat,
  agentOwnsActiveTask,
  closeSubchat,
  getTask,
  listParticipants,
  setAgentStatus,
  subchatById,
} from './repo.js';

export function closeSubchatAndNotify(
  db: Database,
  io: Server,
  subchatId: ID,
  outcome: 'done' | 'stuck',
  summary: string,
): boolean {
  const subchat = subchatById(db, subchatId);
  const task = subchat ? getTask(db, subchat.taskId) : undefined;
  if (
    !subchat
    || !task
    || subchat.status !== 'open'
    || !closeSubchat(db, subchatId, outcome, summary)
  ) {
    return false;
  }

  emitSubchatEvent(io, db, subchatId, EVENTS.SUBCHAT_CLOSED, { subchatId, outcome, summary });

  const taskOwnerAgentId = agentByUser(db, task.userId)?.id;
  for (const agentId of listParticipants(db, subchatId)) {
    if (
      (agentId === taskOwnerAgentId && task.status === 'active')
      || agentHasOpenSubchat(db, agentId)
      || agentOwnsActiveTask(db, agentId)
    ) {
      continue;
    }
    setAgentStatus(db, agentId, 'idle');
    emitAgentStatus(io, db, agentId, 'idle', task.userId);
  }
  return true;
}

import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  SERVER_EVENTS,
  userRoom,
  type Disclosure,
  type DisclosureNotice,
  type ID,
  type InfoScope,
} from '@asymmetry/shared';
import type { Database } from '../db.js';

export const decide = (releasedCount: number, withheldCount: number): Disclosure['decision'] =>
  releasedCount === 0 ? 'denied' : withheldCount > 0 ? 'partial' : 'released';

export interface DisclosureInput {
  ownerUserId: ID;
  requesterAgentId: ID;
  scope: InfoScope;
  released: ID[];
  withheldCount: number;
}

export function persistDisclosure(db: Database, input: DisclosureInput): Disclosure {
  const disclosure: Disclosure = {
    id: randomUUID(),
    ownerUserId: input.ownerUserId,
    requesterAgentId: input.requesterAgentId,
    scope: {
      taskId: input.scope.taskId,
      purpose: input.scope.purpose,
      fields: [...input.scope.fields],
      ...(input.scope.subchatId ? { subchatId: input.scope.subchatId } : {}),
    },
    released: [...input.released],
    withheldCount: input.withheldCount,
    decision: decide(input.released.length, input.withheldCount),
    createdAt: Date.now(),
  };
  db.prepare(
    `INSERT INTO disclosures (id, owner_user_id, requester_agent_id, scope_json, released_json,
       withheld_count, decision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    disclosure.id,
    disclosure.ownerUserId,
    disclosure.requesterAgentId,
    JSON.stringify(disclosure.scope),
    JSON.stringify(disclosure.released),
    disclosure.withheldCount,
    disclosure.decision,
    disclosure.createdAt,
  );
  return disclosure;
}

export const toNotice = (disclosure: Disclosure, ownerAgentId: ID): DisclosureNotice => ({
  id: disclosure.id,
  taskId: disclosure.scope.taskId,
  subchatId: disclosure.scope.subchatId ?? null,
  ownerAgentId,
  releasedCount: disclosure.released.length,
  withheldCount: disclosure.withheldCount,
  decision: disclosure.decision,
});

export function emitNotice(
  io: Server | undefined,
  notice: DisclosureNotice,
  taskOwnerUserId: ID,
  dataOwnerUserId: ID,
): void {
  if (!io) return;
  const rooms = [...new Set([userRoom(taskOwnerUserId), userRoom(dataOwnerUserId)])];
  try {
    io.to(rooms).emit(SERVER_EVENTS.DISCLOSURE_LOGGED, notice);
  } catch {
    void 0;
  }
}

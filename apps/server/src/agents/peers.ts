import type { Agent, ID } from '@asymmetry/shared';
import type { Database } from '../db.js';
import { PEER_CAP } from './budgets.js';
import { outgoingTrustEdges } from './repo.js';

export type PeerHop = 1 | 2 | 'other';

export interface DirectoryPeer {
  agentId: ID;
  name: string;
  hop: PeerHop;
}

type DirectoryRow = {
  agent_id: ID;
  user_id: ID;
  display_name: string;
};

type AgentRow = {
  id: ID;
  user_id: ID;
  name: string;
  status: Agent['status'];
};

function directoryRows(db: Database, ownerUserId: ID): DirectoryRow[] {
  return db.prepare(
    `SELECT agents.id AS agent_id, users.id AS user_id, users.display_name
     FROM agents JOIN users ON users.id = agents.user_id
     WHERE users.id <> ?
     ORDER BY users.display_name, agents.id`,
  ).all(ownerUserId) as DirectoryRow[];
}

function agentIdByUser(db: Database, userIds: ID[]): Map<ID, ID> {
  if (userIds.length === 0) {
    return new Map();
  }
  const placeholders = userIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT id, user_id FROM agents WHERE user_id IN (${placeholders})`,
  ).all(...userIds) as Array<{ id: ID; user_id: ID }>;
  return new Map(rows.map(({ id, user_id }) => [user_id, id]));
}

export function buildDirectory(db: Database, ownerUserId: ID): DirectoryPeer[] {
  const rows = directoryRows(db, ownerUserId);
  const byUser = new Map(rows.map((row) => [row.user_id, row]));
  const hops = new Map<ID, 1 | 2>();
  const hopOneUsers: ID[] = [];

  for (const edge of outgoingTrustEdges(db, ownerUserId)) {
    if (edge.trustedUserId === ownerUserId || !byUser.has(edge.trustedUserId)) {
      continue;
    }
    if (!hops.has(edge.trustedUserId)) {
      hops.set(edge.trustedUserId, 1);
      hopOneUsers.push(edge.trustedUserId);
    }
  }

  for (const userId of hopOneUsers) {
    for (const edge of outgoingTrustEdges(db, userId)) {
      if (
        edge.trustedUserId !== ownerUserId
        && !hops.has(edge.trustedUserId)
        && byUser.has(edge.trustedUserId)
      ) {
        hops.set(edge.trustedUserId, 2);
      }
    }
  }

  const peers: DirectoryPeer[] = [];
  for (const hop of [1, 2] as const) {
    for (const row of rows) {
      if (hops.get(row.user_id) === hop) {
        peers.push({ agentId: row.agent_id, name: row.display_name, hop });
      }
    }
  }
  for (const row of rows) {
    if (!hops.has(row.user_id)) {
      peers.push({ agentId: row.agent_id, name: row.display_name, hop: 'other' });
    }
  }
  return peers.slice(0, PEER_CAP);
}

export interface NetworkPayload {
  agents: Agent[];
  trusted: ID[];
  discovered: ID[];
}

export function networkPayload(db: Database, userId: ID): NetworkPayload {
  const owner = db.prepare('SELECT agent_id FROM users WHERE id = ?').get(userId) as
    | { agent_id: ID }
    | undefined;
  const allAgents = (db.prepare(
    `SELECT agents.id, agents.user_id, agents.name, agents.status
     FROM agents
     ORDER BY agents.name, agents.id`,
  ).all() as AgentRow[]).map((agent) => ({
    id: agent.id,
    userId: agent.user_id,
    name: agent.name,
    status: agent.status,
  }));

  const userAgents = agentIdByUser(
    db,
    outgoingTrustEdges(db, userId).map(({ trustedUserId }) => trustedUserId),
  );
  const trusted = [...new Set(
    outgoingTrustEdges(db, userId)
      .map(({ trustedUserId }) => userAgents.get(trustedUserId))
      .filter((agentId): agentId is ID => agentId !== undefined && agentId !== owner?.agent_id),
  )];
  const trustedIds = new Set(trusted);

  const participants = db.prepare(
    `SELECT DISTINCT participants.agent_id
     FROM tasks
     JOIN subchats ON subchats.task_id = tasks.id
     JOIN subchat_participants AS participants ON participants.subchat_id = subchats.id
     WHERE tasks.user_id = ?
     ORDER BY participants.agent_id`,
  ).all(userId) as Array<{ agent_id: ID }>;
  const discovered = [...new Set(
    participants
      .map(({ agent_id }) => agent_id)
      .filter((agentId) => agentId !== owner?.agent_id && !trustedIds.has(agentId)),
  )];
  const agentById = new Map(allAgents.map((agent) => [agent.id, agent]));
  const agentIds = [...new Set([
    ...(owner?.agent_id ? [owner.agent_id] : []),
    ...trusted,
    ...discovered,
  ])];
  const agents = agentIds.flatMap((agentId) => {
    const agent = agentById.get(agentId);
    return agent ? [agent] : [];
  });

  return { agents, trusted, discovered };
}

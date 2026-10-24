import type BetterSqlite3 from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  Agent,
  AgentStatus,
  ID,
  InfoScope,
  Message,
  SenderType,
  Subchat,
  Task,
  TrustEdge,
  User,
} from '@asymmetry/shared';

type Database = BetterSqlite3.Database;

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  status: Task['status'];
  created_at: number;
};

type AgentRow = {
  id: string;
  user_id: string;
  name: string;
  status: AgentStatus;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  agent_id: string;
  created_at: number;
};

type MessageRow = {
  id: string;
  room_id: string;
  task_id: string | null;
  subchat_id: string | null;
  sender_type: SenderType;
  sender_id: string;
  body: string;
  created_at: number;
};

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
  };
}

function agentFromRow(row: AgentRow): Agent {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
  };
}

function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    agentId: row.agent_id,
    createdAt: row.created_at,
  };
}

function messageFromRow(row: MessageRow): Message {
  return {
    id: row.id,
    roomId: row.room_id,
    taskId: row.task_id,
    subchatId: row.subchat_id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function createTask(db: Database, userId: ID, title: string): Task {
  const task: Task = {
    id: uuidv4(),
    userId,
    title,
    status: 'active',
    createdAt: Date.now(),
  };
  db.prepare(
    'INSERT INTO tasks (id, user_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(task.id, task.userId, task.title, task.status, task.createdAt);
  return task;
}

export function getTask(db: Database, taskId: ID): Task | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
  return row ? taskFromRow(row) : undefined;
}

export function setTaskStatus(
  db: Database,
  taskId: ID,
  status: Task['status'],
): boolean {
  return db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, taskId).changes > 0;
}

export function getTaskScope(db: Database, taskId: ID): InfoScope | null {
  const row = db
    .prepare('SELECT purpose, fields_json FROM task_scopes WHERE task_id = ?')
    .get(taskId) as { purpose: string; fields_json: string } | undefined;
  if (!row) {
    return null;
  }
  return {
    taskId,
    purpose: row.purpose,
    fields: JSON.parse(row.fields_json) as string[],
  };
}

export function putTaskScope(
  db: Database,
  scope: Pick<InfoScope, 'taskId' | 'purpose' | 'fields'>,
): boolean {
  return db.prepare(
    'INSERT OR IGNORE INTO task_scopes (task_id, purpose, fields_json) VALUES (?, ?, ?)',
  ).run(scope.taskId, scope.purpose, JSON.stringify(scope.fields)).changes === 1;
}

export function createSubchat(
  db: Database,
  taskId: ID,
  participantAgentIds: ID[],
): Subchat {
  const participantIds = [...new Set(participantAgentIds)];
  if (participantIds.length < 2) {
    throw new Error('A subchat requires at least two distinct agent participants');
  }

  const subchat: Subchat = {
    id: uuidv4(),
    taskId,
    kind: participantIds.length === 2 ? 'pair' : 'group',
    participantAgentIds: participantIds,
    status: 'open',
    createdAt: Date.now(),
  };
  db.transaction(() => {
    db.prepare(
      'INSERT INTO subchats (id, task_id, kind, status, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(subchat.id, subchat.taskId, subchat.kind, subchat.status, subchat.createdAt);
    const insertParticipant = db.prepare(
      'INSERT INTO subchat_participants (subchat_id, agent_id) VALUES (?, ?)',
    );
    for (const agentId of participantIds) {
      insertParticipant.run(subchat.id, agentId);
    }
  }).immediate();
  return subchat;
}

export function listParticipants(db: Database, subchatId: ID): ID[] {
  return (
    db.prepare(
      'SELECT agent_id FROM subchat_participants WHERE subchat_id = ? ORDER BY agent_id',
    ).all(subchatId) as Array<{ agent_id: ID }>
  ).map(({ agent_id }) => agent_id);
}

export function closeSubchat(db: Database, subchatId: ID): boolean {
  return db.prepare('UPDATE subchats SET status = ? WHERE id = ?').run('closed', subchatId).changes > 0;
}

export interface InsertMessageInput {
  taskId?: ID | null;
  subchatId?: ID | null;
  userId?: ID;
  senderType: SenderType;
  senderId: ID;
  body: string;
}

export function insertMessage(db: Database, input: InsertMessageInput): Message {
  let taskId = input.taskId ?? null;
  const subchatId = input.subchatId ?? null;
  let roomId: string;

  if (subchatId) {
    const subchat = db
      .prepare('SELECT task_id FROM subchats WHERE id = ?')
      .get(subchatId) as { task_id: ID } | undefined;
    if (!subchat) {
      throw new Error(`Unknown subchat: ${subchatId}`);
    }
    if (taskId !== null && taskId !== subchat.task_id) {
      throw new Error('Message task does not match its subchat');
    }
    taskId = subchat.task_id;
    roomId = `subchat:${subchatId}`;
  } else {
    const task = taskId ? getTask(db, taskId) : undefined;
    const userId = task?.userId ?? input.userId;
    if (!userId) {
      throw new Error('A main-thread message requires a task or user id');
    }
    roomId = `user:${userId}`;
  }

  const message: Message = {
    id: uuidv4(),
    roomId,
    taskId,
    subchatId,
    senderType: input.senderType,
    senderId: input.senderId,
    body: input.body,
    createdAt: Date.now(),
  };
  db.prepare(
    `INSERT INTO messages
      (id, room_id, task_id, subchat_id, sender_type, sender_id, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    message.id,
    message.roomId,
    message.taskId,
    message.subchatId,
    message.senderType,
    message.senderId,
    message.body,
    message.createdAt,
  );
  return message;
}

export function listMainThreadMessages(db: Database, taskId: ID): Message[] {
  return (
    db.prepare(
      'SELECT * FROM messages WHERE task_id = ? AND subchat_id IS NULL ORDER BY created_at, id',
    ).all(taskId) as MessageRow[]
  ).map(messageFromRow);
}

export function listSubchatMessages(db: Database, subchatId: ID): Message[] {
  return (
    db.prepare(
      'SELECT * FROM messages WHERE subchat_id = ? ORDER BY created_at, id',
    ).all(subchatId) as MessageRow[]
  ).map(messageFromRow);
}

export function listSubchatsByTask(db: Database, taskId: ID): Subchat[] {
  const rows = db.prepare(
    'SELECT id, task_id, kind, status, created_at FROM subchats WHERE task_id = ? ORDER BY created_at, id',
  ).all(taskId) as Array<{
    id: ID;
    task_id: ID;
    kind: Subchat['kind'];
    status: Subchat['status'];
    created_at: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    participantAgentIds: listParticipants(db, row.id),
    status: row.status,
    createdAt: row.created_at,
  }));
}

export function setAgentStatus(db: Database, agentId: ID, status: AgentStatus): boolean {
  return db.prepare('UPDATE agents SET status = ? WHERE id = ?').run(status, agentId).changes > 0;
}

export function agentById(db: Database, agentId: ID): Agent | undefined {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as AgentRow | undefined;
  return row ? agentFromRow(row) : undefined;
}

export function agentByUser(db: Database, userId: ID): Agent | undefined {
  const row = db.prepare('SELECT * FROM agents WHERE user_id = ?').get(userId) as AgentRow | undefined;
  return row ? agentFromRow(row) : undefined;
}

export function userByAgent(db: Database, agentId: ID): User | undefined {
  const row = db.prepare(
    `SELECT users.id, users.username, users.display_name, users.agent_id, users.created_at
     FROM users JOIN agents ON agents.user_id = users.id
     WHERE agents.id = ?`,
  ).get(agentId) as UserRow | undefined;
  return row ? userFromRow(row) : undefined;
}

export function outgoingTrustEdges(db: Database, ownerUserId: ID): TrustEdge[] {
  return (
    db.prepare(
      'SELECT owner_user_id, trusted_user_id, created_at FROM trust_edges WHERE owner_user_id = ? ORDER BY created_at, trusted_user_id',
    ).all(ownerUserId) as Array<{
      owner_user_id: ID;
      trusted_user_id: ID;
      created_at: number;
    }>
  ).map((row) => ({
    ownerUserId: row.owner_user_id,
    trustedUserId: row.trusted_user_id,
    createdAt: row.created_at,
  }));
}

export function subchatById(db: Database, subchatId: ID): Subchat | undefined {
  const row = db
    .prepare('SELECT id, task_id, kind, status, created_at FROM subchats WHERE id = ?')
    .get(subchatId) as {
    id: ID;
    task_id: ID;
    kind: Subchat['kind'];
    status: Subchat['status'];
    created_at: number;
  } | undefined;
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    participantAgentIds: listParticipants(db, subchatId),
    status: row.status,
    createdAt: row.created_at,
  };
}

export function agentHasOtherActiveSubchat(
  db: Database,
  agentId: ID,
  excludedTaskId: ID,
): boolean {
  return Boolean(db.prepare(
    `SELECT 1
     FROM subchat_participants
     JOIN subchats ON subchats.id = subchat_participants.subchat_id
     JOIN tasks ON tasks.id = subchats.task_id
     WHERE subchat_participants.agent_id = ?
       AND tasks.id <> ?
       AND tasks.status = 'active'
       AND subchats.status = 'open'
     LIMIT 1`,
  ).get(agentId, excludedTaskId));
}

export type ID = string;

export interface User {
  id: ID;
  username: string;
  displayName: string;
  agentId: ID;
  createdAt: number;
}

export interface Agent {
  id: ID;
  userId: ID;
  name: string;
  status: AgentStatus;
}

export type AgentStatus = 'idle' | 'clarifying' | 'negotiating' | 'done' | 'stuck';

export interface TrustEdge {
  ownerUserId: ID;
  trustedUserId: ID;
  createdAt: number;
}

export interface Task {
  id: ID;
  userId: ID;
  title: string;
  status: 'active' | 'done' | 'stuck';
  createdAt: number;
}

export type SenderType = 'human' | 'agent' | 'system';

export interface Message {
  id: ID;
  roomId: string;
  taskId: ID | null;
  subchatId: ID | null;
  senderType: SenderType;
  senderId: ID;
  body: string;
  createdAt: number;
}

export interface Subchat {
  id: ID;
  taskId: ID;
  kind: 'pair' | 'group';
  participantAgentIds: ID[];
  status: 'open' | 'closed';
  outcome: 'done' | 'stuck' | null;
  summary: string | null;
  closedAt: number | null;
  createdAt: number;
}

export type Classification = 'public' | 'network' | 'private';

export interface MemoryItem {
  id: ID;
  userId: ID;
  content: string;
  classification: Classification;
  fieldTags: string[];
  source: 'chat' | 'seed';
  createdAt: number;
}

export interface Goal {
  id: ID;
  userId: ID;
  taskId: ID | null;
  description: string;
  status: 'open' | 'met' | 'abandoned';
  createdAt: number;
}

export interface InfoScope {
  taskId: ID;
  purpose: string;
  fields: string[];
  subchatId?: ID;
}

export interface Disclosure {
  id: ID;
  ownerUserId: ID;
  requesterAgentId: ID;
  scope: InfoScope;
  released: string[];
  withheldCount: number;
  decision: 'released' | 'partial' | 'denied';
  createdAt: number;
}

export interface DisclosureNotice {
  id: ID;
  taskId: ID;
  subchatId: ID | null;
  ownerAgentId: ID;
  releasedCount: number;
  withheldCount: number;
  decision: 'released' | 'partial' | 'denied';
}

export interface MemoryEngine {
  ingest(userId: ID, text: string, source: 'chat' | 'seed'): Promise<MemoryItem[]>;
  queryMemory(
    ownerUserId: ID,
    requesterUserId: ID,
    scope: InfoScope,
  ): Promise<{ items: MemoryItem[]; withheldCount: number; disclosure: Disclosure }>;
  extractGoals(userId: ID, taskId: ID, text: string): Promise<Goal[]>;
}

export const CLIENT_EVENTS = {
  TASK_CREATE: 'task:create',
  CHAT_SEND: 'chat:send',
} as const;

export const SERVER_EVENTS = {
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  CHAT_MESSAGE: 'chat:message',
  SUBCHAT_STARTED: 'subchat:started',
  SUBCHAT_MESSAGE: 'subchat:message',
  SUBCHAT_CLOSED: 'subchat:closed',
  AGENT_STATUS: 'agent:status',
  NETWORK_UPDATED: 'network:updated',
  DISCLOSURE_LOGGED: 'disclosure:logged',
} as const;

export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

export type ErrorCode =
  | 'BAD_INPUT'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

export interface ClientToServerEvents {
  'task:create': (
    payload: { title: string },
    ack?: (result: CommandResult<Task>) => void,
  ) => void;
  'chat:send': (
    payload: { taskId: ID; body: string },
    ack?: (result: CommandResult<Message>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'task:created': (task: Task) => void;
  'task:updated': (payload: { taskId: ID; status: Task['status'] }) => void;
  'chat:message': (message: Message) => void;
  'subchat:started': (subchat: Subchat) => void;
  'subchat:message': (message: Message) => void;
  'subchat:closed': (payload: {
    subchatId: ID;
    outcome: 'done' | 'stuck';
    summary: string;
  }) => void;
  'agent:status': (payload: { agentId: ID; status: AgentStatus }) => void;
  'network:updated': (payload: {
    agents: Agent[];
    trusted: ID[];
    discovered: ID[];
  }) => void;
  'disclosure:logged': (notice: DisclosureNotice) => void;
}

export const userRoom = (userId: ID): string => `user:${userId}`;
export const agentRoom = (agentId: ID): string => `agent:${agentId}`;
export const subchatRoom = (subchatId: ID): string => `subchat:${subchatId}`;

export { stubMemoryEngine } from './stubMemory.js';

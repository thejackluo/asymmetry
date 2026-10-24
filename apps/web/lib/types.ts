// CONTRACTS.md §1 domain model — copied verbatim.
// Swap for `@asymmetry/shared` imports once D1's packages/shared lands.

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

export interface NetworkPayload {
  agents: Agent[];
  trusted: ID[];
  discovered: ID[];
}

export interface TaskHistory {
  task: Task;
  messages: Message[];
  subchats: Subchat[];
}

// CONTRACTS.md §3 socket event names
export const EVT = {
  // client -> server
  TASK_CREATE: 'task:create',
  CHAT_SEND: 'chat:send',
  // server -> client
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

export type ServerEventName =
  | typeof EVT.TASK_CREATED
  | typeof EVT.TASK_UPDATED
  | typeof EVT.CHAT_MESSAGE
  | typeof EVT.SUBCHAT_STARTED
  | typeof EVT.SUBCHAT_MESSAGE
  | typeof EVT.SUBCHAT_CLOSED
  | typeof EVT.AGENT_STATUS
  | typeof EVT.NETWORK_UPDATED
  | typeof EVT.DISCLOSURE_LOGGED;

export interface TaskUpdatedPayload {
  taskId: ID;
  status: Task['status'];
}

export interface SubchatClosedPayload {
  subchatId: ID;
  outcome: 'done' | 'stuck';
  summary: string;
}

export interface AgentStatusPayload {
  agentId: ID;
  status: AgentStatus;
}

// Domain model + socket event names come from @asymmetry/shared (CONTRACTS.md
// §1/§3). This file re-exports them and adds the wire payload aliases the UI
// consumes, which shared does not name.

export {
  CLIENT_EVENTS,
  SERVER_EVENTS,
} from '@asymmetry/shared';

export type {
  ID,
  User,
  Agent,
  AgentStatus,
  TrustEdge,
  Task,
  SenderType,
  Message,
  Subchat,
  Classification,
  MemoryItem,
  Goal,
  InfoScope,
  Disclosure,
  DisclosureNotice,
  ClientEvent,
  ServerEvent,
} from '@asymmetry/shared';

import { CLIENT_EVENTS, SERVER_EVENTS } from '@asymmetry/shared';
import type { Agent, AgentStatus, ID, Message, Subchat, Task } from '@asymmetry/shared';

// CONTRACTS.md §3 socket event names — single map for convenience.
export const EVT = { ...CLIENT_EVENTS, ...SERVER_EVENTS } as const;

export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

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

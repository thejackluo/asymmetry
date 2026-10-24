'use client';

import type {
  Agent,
  DisclosureNotice,
  Message,
  NetworkPayload,
  Subchat,
  Task,
  TaskHistory,
  User,
} from './types';
import { EVT } from './types';
import type { SocketClient } from './socket';

// Mock mode: localStorage `asym_socket_mode=mock` beats env; env beats default.
export function isMockMode(): boolean {
  if (typeof window !== 'undefined') {
    const flag = window.localStorage.getItem('asym_socket_mode');
    if (flag) return flag === 'mock';
  }
  return process.env.NEXT_PUBLIC_SOCKET_MODE === 'mock';
}

// ── Seed fixtures mirroring CONTRACTS.md §7 (alice's view) ──────────────
const NOW = Date.now();

export const mockUser: User = {
  id: 'u-alice',
  username: 'alice',
  displayName: 'Alice',
  agentId: 'a-alice',
  createdAt: NOW - 86_400_000,
};

const agents: Agent[] = [
  { id: 'a-alice', userId: 'u-alice', name: "Alice's Agent", status: 'idle' },
  { id: 'a-bob', userId: 'u-bob', name: "Bob's Agent", status: 'idle' },
  { id: 'a-carol', userId: 'u-carol', name: "Carol's Agent", status: 'idle' },
  { id: 'a-erin', userId: 'u-erin', name: "Erin's Agent", status: 'idle' },
];

let tasks: Task[] = [
  {
    id: 't-welcome',
    userId: 'u-alice',
    title: 'Example: find a summer sublet near Georgia Tech',
    status: 'active',
    createdAt: NOW - 3_600_000,
  },
];

const subchatId = 'sc-1';

const seedMessages: Message[] = [
  {
    id: 'm-0',
    roomId: 'user:u-alice',
    taskId: 't-welcome',
    subchatId: null,
    senderType: 'human',
    senderId: 'u-alice',
    body: 'Find me a summer sublet near Georgia Tech, May–Aug, under $1200/mo.',
    createdAt: NOW - 3_500_000,
  },
  {
    id: 'm-1',
    roomId: 'user:u-alice',
    taskId: 't-welcome',
    subchatId: null,
    senderType: 'agent',
    senderId: 'a-alice',
    body: 'On it — asking around my trusted network for sublet leads.',
    createdAt: NOW - 3_400_000,
  },
];

const seedSubchats: Subchat[] = [
  {
    id: subchatId,
    taskId: 't-welcome',
    kind: 'pair',
    participantAgentIds: ['a-alice', 'a-bob'],
    status: 'open',
    createdAt: NOW - 3_300_000,
  },
];

const seedSubchatMessages: Message[] = [
  {
    id: 'sm-1',
    roomId: `subchat:${subchatId}`,
    taskId: 't-welcome',
    subchatId,
    senderType: 'agent',
    senderId: 'a-alice',
    body: "info_request {taskId:'t-welcome', scope:['location_area','price','dates']}",
    createdAt: NOW - 3_200_000,
  },
  {
    id: 'sm-2',
    roomId: `subchat:${subchatId}`,
    taskId: 't-welcome',
    subchatId,
    senderType: 'agent',
    senderId: 'a-bob',
    body: 'Room available 0.4mi from GT campus, $950/mo, May 15–Aug 10, furnished.',
    createdAt: NOW - 3_100_000,
  },
];

let network: NetworkPayload = {
  agents: agents.slice(0, 3),
  trusted: ['a-bob', 'a-carol'],
  discovered: [],
};

export const mockApi = {
  async login(username: string, _password: string) {
    return {
      token: 'mock-token',
      user: {
        ...mockUser,
        username,
        displayName: username[0]?.toUpperCase() + username.slice(1),
      },
    };
  },
  async getTasks() {
    return tasks;
  },
  async getTaskMessages(taskId: string): Promise<TaskHistory> {
    return {
      task: tasks.find((t) => t.id === taskId) ?? tasks[0],
      messages: [...seedMessages, ...seedSubchatMessages].filter(
        (m) => m.taskId === taskId,
      ),
      subchats: seedSubchats.filter((s) => s.taskId === taskId),
    };
  },
  async getNetwork() {
    return network;
  },
};

// ── MockSocketClient: replays the demo sequence over the socket API ─────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => void;

let counter = 0;
const uid = (p: string) => `${p}-${++counter}`;

export class MockSocketClient implements SocketClient {
  private handlers = new Map<string, Set<Handler>>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  connect(_token: string): void {
    // nothing to do — mock needs no network
  }

  on<T>(event: string, cb: (payload: T) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(cb as Handler);
    return () => set.delete(cb as Handler);
  }

  emit(event: string, payload: unknown): void {
    if (event === EVT.TASK_CREATE) {
      this.handleTaskCreate((payload as { title: string }).title);
    } else if (event === EVT.CHAT_SEND) {
      this.handleChatSend(payload as { taskId: string; body: string });
    }
  }

  disconnect(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private fire(event: string, payload: unknown): void {
    this.handlers.get(event)?.forEach((cb) => cb(payload));
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private handleTaskCreate(title: string): void {
    const task: Task = {
      id: uid('t'),
      userId: mockUser.id,
      title,
      status: 'active',
      createdAt: Date.now(),
    };
    tasks = [...tasks, task];
    this.after(150, () => this.fire(EVT.TASK_CREATED, task));
  }

  private handleChatSend(p: { taskId: string; body: string }): void {
    const human: Message = {
      id: uid('m'),
      roomId: `user:${mockUser.id}`,
      taskId: p.taskId,
      subchatId: null,
      senderType: 'human',
      senderId: mockUser.id,
      body: p.body,
      createdAt: Date.now(),
    };
    this.after(100, () => this.fire(EVT.CHAT_MESSAGE, human));

    const scId = uid('sc');
    const subchat: Subchat = {
      id: scId,
      taskId: p.taskId,
      kind: 'pair',
      participantAgentIds: ['a-alice', 'a-bob'],
      status: 'open',
      createdAt: Date.now(),
    };

    const at = (ms: number, event: string, payload: unknown) =>
      this.after(ms, () => this.fire(event, payload));

    at(600, EVT.AGENT_STATUS, { agentId: 'a-alice', status: 'clarifying' });
    at(1400, EVT.CHAT_MESSAGE, {
      id: uid('m'),
      roomId: `user:${mockUser.id}`,
      taskId: p.taskId,
      subchatId: null,
      senderType: 'agent',
      senderId: 'a-alice',
      body: 'Checking my trusted network — Bob may have a lead.',
      createdAt: Date.now(),
    } satisfies Message);
    at(2200, EVT.AGENT_STATUS, { agentId: 'a-alice', status: 'negotiating' });
    at(2400, EVT.SUBCHAT_STARTED, subchat);

    const subchatMsgs: [string, string][] = [
      ['a-alice', "info_request {scope:['location_area','price','dates']}"],
      ['a-bob', 'query_memory → releasing permitted facts'],
      ['a-bob', 'Room 0.4mi from GT campus · $950/mo · May 15–Aug 10 · furnished'],
      ['a-alice', 'Ack. Summarizing for Alice.'],
    ];
    subchatMsgs.forEach(([sender, body], i) => {
      at(3200 + i * 800, EVT.SUBCHAT_MESSAGE, {
        id: uid('sm'),
        roomId: `subchat:${scId}`,
        taskId: p.taskId,
        subchatId: scId,
        senderType: 'agent',
        senderId: sender,
        body,
        createdAt: Date.now(),
      } satisfies Message);
    });

    const notice: DisclosureNotice = {
      id: uid('d'),
      taskId: p.taskId,
      subchatId: scId,
      ownerAgentId: 'a-bob',
      releasedCount: 3,
      withheldCount: 2,
      decision: 'partial',
    };
    at(6600, EVT.DISCLOSURE_LOGGED, notice);
    at(7200, EVT.SUBCHAT_CLOSED, {
      subchatId: scId,
      outcome: 'done',
      summary: 'Bob has a room 0.4mi from GT, $950/mo, May 15–Aug 10.',
    });
    at(7800, EVT.AGENT_STATUS, { agentId: 'a-alice', status: 'done' });
    at(8000, EVT.CHAT_MESSAGE, {
      id: uid('m'),
      roomId: `user:${mockUser.id}`,
      taskId: p.taskId,
      subchatId: null,
      senderType: 'agent',
      senderId: 'a-alice',
      body: 'Bob has a room 0.4mi from GT, $950/mo, May 15–Aug 10. Want a warm intro?',
      createdAt: Date.now(),
    } satisfies Message);
    at(8200, EVT.TASK_UPDATED, { taskId: p.taskId, status: 'done' });
    at(8600, EVT.NETWORK_UPDATED, {
      agents,
      trusted: ['a-bob', 'a-carol'],
      discovered: ['a-erin'],
    } satisfies NetworkPayload);
  }
}

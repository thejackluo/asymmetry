import type { Server, Socket } from 'socket.io';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from './events.js';
import { registerAgents } from './index.js';
import { createAgentRuntime, type AgentRuntime } from './runtime.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';
import { createFakeMemory } from './test/fakeMemory.js';

vi.mock('./runtime.js', () => ({
  createAgentRuntime: vi.fn(),
}));

type Ack = (result: unknown) => void;
type SocketHandler = (payload: unknown, ack?: Ack) => void;

function registerWithRuntime(runtime: AgentRuntime) {
  vi.mocked(createAgentRuntime).mockReturnValue(runtime);
  const handlers = new Map<string, SocketHandler>();
  let connect: ((socket: Socket) => void) | undefined;
  const io = {
    on(_event: string, handler: (socket: Socket) => void) {
      connect = handler;
      return io;
    },
  } as unknown as Server;
  const db = createFixtureDb();
  registerAgents(io, db, createFakeMemory().memory);
  const socket = {
    data: { userId: FIXTURE_IDS.users.alice },
    on(event: string, handler: SocketHandler) {
      handlers.set(event, handler);
      return socket;
    },
  } as unknown as Socket;
  connect?.(socket);
  return { db, handlers };
}

afterEach(() => {
  vi.mocked(createAgentRuntime).mockReset();
});

describe('agent socket async boundaries', () => {
  it('acks a runtime rejection once and handles it without an unhandled rejection', async () => {
    const privateMessage = 'ASYNC-REJECTION-SENTINEL';
    const privateName = 'ASYNC-REJECTION-NAME';
    const failure = Object.assign(new Error(privateMessage), { name: privateName });
    const runtime = {
      handleTaskCreate: vi.fn().mockRejectedValue(failure),
      handleChatSend: vi.fn(),
    } as unknown as AgentRuntime;
    const { db, handlers } = registerWithRuntime(runtime);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const ack = vi.fn();
      handlers.get(EVENTS.TASK_CREATE)?.({ title: 'A task' }, ack);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
      expect(unhandled).toEqual([]);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(privateMessage);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(privateName);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      errorLog.mockRestore();
      db.close();
    }
  });

  it('does not send a second ack when the runtime rejects after success', async () => {
    const privateMessage = 'ASYNC-AFTER-ACK-SENTINEL';
    const privateName = 'ASYNC-AFTER-ACK-NAME';
    const failure = Object.assign(new Error(privateMessage), { name: privateName });
    const runtime = {
      handleTaskCreate: vi.fn(),
      handleChatSend: vi.fn(async (_socket: unknown, _payload: unknown, ack?: Ack) => {
        ack?.({ ok: true, data: { id: 'message-1' } });
        throw failure;
      }),
    } as unknown as AgentRuntime;
    const { db, handlers } = registerWithRuntime(runtime);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const ack = vi.fn();
      handlers.get(EVENTS.CHAT_SEND)?.({ taskId: 'task-1', body: 'hello' }, ack);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(ack).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledWith({ ok: true, data: { id: 'message-1' } });
      expect(unhandled).toEqual([]);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(privateMessage);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(privateName);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      errorLog.mockRestore();
      db.close();
    }
  });
});

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { EVENTS } from './events.js';
import { registerAgents } from './index.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';
import { createFakeMemory } from './test/fakeMemory.js';

function waitForEvent(
  socket: ClientSocket,
  event: string,
  matches: (payload: unknown) => boolean = () => true,
): Promise<unknown> {
  return new Promise((resolve) => {
    const listener = (payload: unknown) => {
      if (matches(payload)) {
        socket.off(event, listener);
        resolve(payload);
      }
    };
    socket.on(event, listener);
  });
}

async function connect(socket: ClientSocket): Promise<void> {
  await Promise.race([
    once(socket, 'connect').then(() => undefined),
    once(socket, 'connect_error').then(([error]) => Promise.reject(error)),
  ]);
}

describe('agent socket integration', () => {
  it('routes task and chat events only to the authenticated owner room', async () => {
    const db = createFixtureDb();
    const httpServer = createServer();
    const ioServer = new Server(httpServer);
    const { memory } = createFakeMemory();
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    let alice: ClientSocket | undefined;
    let dave: ClientSocket | undefined;
    try {
      ioServer.use((socket, next) => {
        socket.data.userId = socket.handshake.auth.userId;
        next();
      });
      registerAgents(ioServer, db, memory);
      await new Promise<void>((resolve) => httpServer.listen(0, resolve));
      const { port } = httpServer.address() as AddressInfo;
      const endpoint = `http://127.0.0.1:${port}`;
      alice = createClient(endpoint, { auth: { userId: FIXTURE_IDS.users.alice }, transports: ['websocket'] });
      dave = createClient(endpoint, { auth: { userId: FIXTURE_IDS.users.dave }, transports: ['websocket'] });
      await Promise.all([connect(alice), connect(dave)]);

      const daveEvents: string[] = [];
      for (const event of Object.values(EVENTS)) {
        dave.on(event, () => daveEvents.push(event));
      }
      const createdPromise = waitForEvent(alice, EVENTS.TASK_CREATED);
      alice.emit(EVENTS.TASK_CREATE, { title: '  Find a room  ' });
      const task = await createdPromise as { id: string; title: string };
      expect(task.title).toBe('Find a room');

      const humanMessagePromise = waitForEvent(
        alice,
        EVENTS.CHAT_MESSAGE,
        (payload) => (payload as { senderType?: string }).senderType === 'human',
      );
      const taskUpdatedPromise = waitForEvent(alice, EVENTS.TASK_UPDATED);
      const ackPromise = new Promise<{ ok: boolean }>((resolve) => {
        alice?.emit(EVENTS.CHAT_SEND, {
          taskId: task.id,
          body: 'Find a room near campus',
        }, resolve);
      });
      const [ack, humanMessage] = await Promise.all([ackPromise, humanMessagePromise]);
      expect(ack.ok).toBe(true);
      expect((humanMessage as { body: string }).body).toBe('Find a room near campus');
      await taskUpdatedPromise;
      expect(daveEvents).toEqual([]);
    } finally {
      alice?.disconnect();
      dave?.disconnect();
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
      db.close();
      if (savedKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = savedKey;
      }
    }
  });
});

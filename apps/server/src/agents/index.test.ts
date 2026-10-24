import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { userRoom } from '@asymmetry/shared';
import { EVENTS } from './events.js';
import { registerAgents } from './index.js';
import { createSubchat } from './repo.js';
import { closeSubchatAndNotify } from './subchats.js';
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
  await new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      socket.off('connect_error', onError);
      resolve();
    };
    const onError = (error: Error) => {
      socket.off('connect', onConnect);
      reject(error);
    };
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

describe('agent socket integration', () => {
  it('routes task and chat events only to the authenticated owner room', async () => {
    const db = createFixtureDb();
    const httpServer = createServer();
    const ioServer = new Server(httpServer);
    const { memory } = createFakeMemory();
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    let bayzhan: ClientSocket | undefined;
    let aziz: ClientSocket | undefined;
    try {
      registerAgents(ioServer, db, memory);
      ioServer.use((socket, next) => {
        socket.data.userId = socket.handshake.auth.userId;
        next();
      });
      ioServer.on('connection', (socket) => {
        const userId = socket.data.userId;
        if (typeof userId === 'string') {
          socket.join(userRoom(userId));
        }
      });
      await new Promise<void>((resolve) => httpServer.listen(0, resolve));
      const { port } = httpServer.address() as AddressInfo;
      const endpoint = `http://127.0.0.1:${port}`;
      bayzhan = createClient(endpoint, { auth: { userId: FIXTURE_IDS.users.bayzhan }, transports: ['websocket'] });
      aziz = createClient(endpoint, { auth: { userId: FIXTURE_IDS.users.aziz }, transports: ['websocket'] });
      await Promise.all([connect(bayzhan), connect(aziz)]);

      const azizEvents: string[] = [];
      for (const event of Object.values(EVENTS)) {
        aziz.on(event, () => azizEvents.push(event));
      }
      const createdPromise = waitForEvent(bayzhan, EVENTS.TASK_CREATED);
      bayzhan.emit(EVENTS.TASK_CREATE, { title: '  Find a room  ' });
      const task = await createdPromise as { id: string; title: string };
      expect(task.title).toBe('Find a room');

      const humanMessagePromise = waitForEvent(
        bayzhan,
        EVENTS.CHAT_MESSAGE,
        (payload) => (payload as { senderType?: string }).senderType === 'human',
      );
      const taskUpdatedPromise = waitForEvent(bayzhan, EVENTS.TASK_UPDATED);
      const ackPromise = new Promise<{ ok: boolean }>((resolve) => {
        bayzhan?.emit(EVENTS.CHAT_SEND, {
          taskId: task.id,
          body: 'Find a room near campus',
        }, resolve);
      });
      const [ack, humanMessage] = await Promise.all([ackPromise, humanMessagePromise]);
      expect(ack.ok).toBe(true);
      expect((humanMessage as { body: string }).body).toBe('Find a room near campus');
      await taskUpdatedPromise;
      expect(azizEvents).toEqual([]);

      const subchat = createSubchat(db, task.id, [
        FIXTURE_IDS.agents.bayzhan,
        FIXTURE_IDS.agents.jack,
      ]);
      const closedEventPromise = waitForEvent(
        bayzhan,
        EVENTS.SUBCHAT_CLOSED,
        (payload) => (payload as { subchatId?: string }).subchatId === subchat.id,
      );
      expect(closeSubchatAndNotify(db, ioServer, subchat.id, 'done', 'demo completed')).toBe(true);
      const closedEvent = await closedEventPromise as {
        subchatId: string;
        outcome: string;
        summary: string;
      };
      const closedRows = db.prepare(
        'SELECT * FROM subchats WHERE task_id = ? ORDER BY created_at, id',
      ).all(task.id) as Array<{
        id: string;
        status: string;
        outcome: string | null;
        summary: string | null;
        closed_at: number | null;
      }>;
      const closedRow = closedRows.find(({ id }) => id === subchat.id);
      expect(closedRow).toBeDefined();
      expect(closedRow).toMatchObject({
        status: 'closed',
        outcome: 'done',
        summary: 'demo completed',
        closed_at: expect.any(Number),
      });
      expect(closedEvent).toEqual({
        subchatId: closedRow?.id,
        outcome: closedRow?.outcome,
        summary: closedRow?.summary,
      });
    } finally {
      bayzhan?.disconnect();
      aziz?.disconnect();
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

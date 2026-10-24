import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { userRoom } from '@asymmetry/shared';
import { createMemoryEngine } from './engine.js';
import { addFact, addTask, addUser, fakeOpenAI, freshDb, trust } from './testutil.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
});

describe('disclosure notices over real Socket.IO', () => {
  it('reach task owner and data owner only; unrelated Carol gets nothing', async () => {
    const db = freshDb();
    const alice = addUser(db, 'alice');
    const bob = addUser(db, 'bob');
    const carol = addUser(db, 'carol');
    trust(db, bob.userId, alice.userId);
    trust(db, bob.userId, carol.userId);
    addFact(db, bob.userId, '$950/mo', 'network', ['price']);
    addFact(db, bob.userId, 'Phone 404-555-0182', 'private', ['phone']);
    addTask(db, 't', alice.userId, ['price'], { id: 'sc', agents: [alice.agentId, bob.agentId] });

    const http = createServer();
    const io = new Server(http);
    io.on('connection', (s) => void s.join(userRoom(String(s.handshake.auth.userId))));
    await new Promise<void>((r) => http.listen(0, r));
    cleanup.push(() => {
      io.close();
      http.close();
    });
    const port = (http.address() as AddressInfo).port;

    const received: Record<string, unknown[]> = { alice: [], bob: [], carol: [] };
    const sockets: Socket[] = [];
    for (const [name, u] of [['alice', alice], ['bob', bob], ['carol', carol]] as const) {
      const s = connect(`http://localhost:${port}`, { auth: { userId: u.userId }, transports: ['websocket'] });
      s.on('disclosure:logged', (n) => received[name].push(n));
      sockets.push(s);
      await new Promise<void>((r) => s.on('connect', () => r()));
    }
    cleanup.push(() => sockets.forEach((s) => s.close()));

    const res = await createMemoryEngine(db, fakeOpenAI('{}').client, io).queryMemory(bob.userId, alice.userId, {
      taskId: 't',
      purpose: 'p',
      fields: ['price'],
      subchatId: 'sc',
    });
    await new Promise((r) => setTimeout(r, 150));

    const expected = {
      id: res.disclosure.id,
      taskId: 't',
      subchatId: 'sc',
      ownerAgentId: bob.agentId,
      releasedCount: 1,
      withheldCount: 1,
      decision: 'partial',
    };
    expect(received.alice).toEqual([expected]);
    expect(received.bob).toEqual([expected]);
    expect(received.carol).toEqual([]);
    expect(JSON.stringify(received)).not.toMatch(/404-555|950/);
  });
});

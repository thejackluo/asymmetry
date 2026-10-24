import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as ioc, type Socket } from 'socket.io-client';
import { stubMemoryEngine, userRoom } from '@asymmetry/shared';
import { all, get, run } from './db.js';
import { createServer, type AsymmetryServer } from './index.js';

let dir: string;
let server: AsymmetryServer;
let base: string;

const insertUser = (username: string): { userId: string; agentId: string } => {
  const userId = randomUUID();
  const agentId = randomUUID();
  run(
    server.db,
    'INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    userId, username, username, '$2a$10$fixturehashfixturehashfixturehashfi', agentId, 1000,
  );
  run(server.db, 'INSERT INTO agents (id, user_id, name) VALUES (?, ?, ?)', agentId, userId, `${username}'s Agent`);
  return { userId, agentId };
};

const connectSocket = (auth: Record<string, unknown>): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const s = ioc(base, { auth, transports: ['websocket'], reconnection: false, timeout: 5000 });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (err) => { s.close(); reject(err); });
  });

const login = async (username: string, password: string) =>
  request(base).post('/api/login').send({ username, password });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'asymmetry-test-'));
  server = createServer({ databasePath: join(dir, 'test.db') });
  const port = await server.listen(0);
  base = `http://localhost:${port}`;
});

afterAll(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('foundation smoke', () => {
  it('health is public', async () => {
    const res = await request(base).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('creates all 12 contract tables and reopens idempotently', async () => {
    const tables = all<{ name: string }>(
      server.db,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).map((t) => t.name);
    expect(tables).toEqual([
      'agents', 'disclosures', 'goals', 'memory_items', 'messages',
      'sessions', 'subchat_participants', 'subchats', 'task_scopes',
      'tasks', 'trust_edges', 'users',
    ]);
    const reopen = createServer({ databasePath: join(dir, 'test.db') });
    await reopen.close();
  });

  it('normalizes registration: one user+agent+session, no hash leaked', async () => {
    const res = await login('  Alice  ', 'demo');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.displayName).toBe('alice');
    expect(res.body.user.passHash).toBeUndefined();
    expect(res.body.user.pass_hash).toBeUndefined();
    const users = all<{ id: string }>(server.db, "SELECT id FROM users WHERE username = 'alice'");
    expect(users).toHaveLength(1);
    const agent = get<{ user_id: string; name: string }>(server.db, 'SELECT * FROM agents WHERE id = ?', res.body.user.agentId);
    expect(agent?.user_id).toBe(res.body.user.id);
    const session = get<{ user_id: string }>(server.db, 'SELECT * FROM sessions WHERE token = ?', res.body.token);
    expect(session?.user_id).toBe(res.body.user.id);
  });

  it('repeat login succeeds, wrong password returns 401', async () => {
    expect((await login('alice', 'demo')).status).toBe(200);
    const bad = await login('alice', 'wrong');
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('invalid credentials');
  });

  it('rejects invalid bodies with 400', async () => {
    expect((await login('ab', 'demo')).status).toBe(400);
    expect((await login('bad name!', 'demo')).status).toBe(400);
    expect((await login('validuser', 'x')).status).toBe(400);
    expect((await login('validuser', 'p'.repeat(129))).status).toBe(400);
    expect((await login('validuser', '☃'.repeat(30))).status).toBe(400);
    const missing = await request(base).post('/api/login').send({});
    expect(missing.status).toBe(400);
  });

  it('parallel duplicate registration yields one identity', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => login('racy', 'demo')));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const ids = new Set(results.map((r) => r.body.user.id));
    expect(ids.size).toBe(1);
    const rows = all<{ id: string }>(server.db, "SELECT id FROM users WHERE username = 'racy'");
    expect(rows).toHaveLength(1);
  });

  it('simultaneous wrong credential cannot issue a token', async () => {
    const [a, b] = await Promise.all([login('contested', 'right-pass'), login('contested', 'wrong-pass')]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);
    const rows = all<{ id: string }>(server.db, "SELECT id FROM users WHERE username = 'contested'");
    expect(rows).toHaveLength(1);
  });

  it('rejects missing/bad auth on all protected paths', async () => {
    for (const path of ['/api/tasks', '/api/tasks/x/messages', '/api/network', '/api/memory']) {
      expect((await request(base).get(path)).status).toBe(401);
      expect((await request(base).get(path).set('Authorization', 'Bearer not-a-token')).status).toBe(401);
    }
  });

  it('returns empty tasks for an authenticated user and stub memory list', async () => {
    const { body } = await login('alice', 'demo');
    const tasks = await request(base).get('/api/tasks').set('Authorization', `Bearer ${body.token}`);
    expect(tasks.status).toBe(200);
    expect(tasks.body).toEqual([]);
    const mem = await request(base).get('/api/memory').set('Authorization', `Bearer ${body.token}`);
    expect(mem.status).toBe(200);
    expect(mem.body).toEqual([]);
  });

  describe('history + network with fixtures', () => {
    let aliceId: string, aliceAgentId: string, aliceToken: string;
    let bobAgentId: string, erinAgentId: string;
    let eveToken: string;
    const taskId = randomUUID();
    const subchatId = randomUUID();

    beforeAll(async () => {
      const aliceLogin = await login('alice', 'demo');
      aliceToken = aliceLogin.body.token;
      aliceId = aliceLogin.body.user.id;
      aliceAgentId = aliceLogin.body.user.agentId;
      bobAgentId = insertUser('bob').agentId;
      erinAgentId = insertUser('erin').agentId;
      const bobId = get<{ user_id: string }>(server.db, 'SELECT user_id FROM agents WHERE id = ?', bobAgentId)?.user_id as string;
      run(server.db, 'INSERT INTO trust_edges (owner_user_id, trusted_user_id, created_at) VALUES (?, ?, ?)', aliceId, bobId, 1000);
      run(server.db, 'INSERT INTO tasks (id, user_id, title, created_at) VALUES (?, ?, ?, ?)', taskId, aliceId, 'sublet hunt', 2000);
      run(server.db, 'INSERT INTO subchats (id, task_id, kind, created_at) VALUES (?, ?, ?, ?)', subchatId, taskId, 'pair', 2001);
      for (const agentId of [aliceAgentId, bobAgentId, erinAgentId]) {
        run(server.db, 'INSERT INTO subchat_participants (subchat_id, agent_id) VALUES (?, ?)', subchatId, agentId);
      }
      run(
        server.db,
        'INSERT INTO messages (id, room_id, task_id, subchat_id, sender_type, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        randomUUID(), `user:${aliceId}`, taskId, null, 'human', aliceId, 'find me a sublet', 3000,
      );
      run(
        server.db,
        'INSERT INTO messages (id, room_id, task_id, subchat_id, sender_type, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        randomUUID(), `subchat:${subchatId}`, taskId, subchatId, 'agent', bobAgentId, 'i have a room', 3001,
      );
      const eve = await login('eve', 'demo');
      eveToken = eve.body.token;
    });

    it('owner replays full history with nulls and participants', async () => {
      const res = await request(base).get(`/api/tasks/${taskId}/messages`).set('Authorization', `Bearer ${aliceToken}`);
      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe('sublet hunt');
      expect(res.body.task.userId).toBe(aliceId);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[0].subchatId).toBeNull();
      expect(res.body.messages[1].subchatId).toBe(subchatId);
      expect(res.body.subchats).toHaveLength(1);
      expect(res.body.subchats[0].participantAgentIds.sort()).toEqual([aliceAgentId, bobAgentId, erinAgentId].sort());
    });

    it('cross-user and nonexistent history both return 404', async () => {
      expect((await request(base).get(`/api/tasks/${taskId}/messages`).set('Authorization', `Bearer ${eveToken}`)).status).toBe(404);
      expect((await request(base).get(`/api/tasks/${randomUUID()}/messages`).set('Authorization', `Bearer ${aliceToken}`)).status).toBe(404);
    });

    it('task list is isolated per user', async () => {
      const res = await request(base).get('/api/tasks').set('Authorization', `Bearer ${eveToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('network returns directed trust + discovered peers only', async () => {
      const res = await request(base).get('/api/network').set('Authorization', `Bearer ${aliceToken}`);
      expect(res.status).toBe(200);
      expect(res.body.trusted).toEqual([bobAgentId]);
      expect(res.body.discovered).toEqual([erinAgentId]);
      const agentIds = res.body.agents.map((a: { id: string }) => a.id);
      expect(agentIds).toContain(aliceAgentId);
      expect(agentIds).toContain(bobAgentId);
      expect(agentIds).toContain(erinAgentId);
      const eveAgent = get<{ agent_id: string }>(server.db, "SELECT agent_id FROM users WHERE username = 'eve'");
      expect(agentIds).not.toContain(eveAgent?.agent_id);
      const eveNet = await request(base).get('/api/network').set('Authorization', `Bearer ${eveToken}`);
      expect(eveNet.body.trusted).toEqual([]);
      expect(eveNet.body.discovered).toEqual([]);
    });
  });

  describe('sockets', () => {
    it('rejects missing and invalid tokens', async () => {
      await expect(connectSocket({})).rejects.toThrow();
      await expect(connectSocket({ token: 'bogus' })).rejects.toThrow();
      await expect(connectSocket({ token: 42 })).rejects.toThrow();
    });

    it('joins only the own user room and ignores spoofed identity', async () => {
      const { body } = await login('alice', 'demo');
      const eveId = get<{ id: string }>(server.db, "SELECT id FROM users WHERE username = 'eve'")?.id;
      const socket = await connectSocket({ token: body.token, userId: eveId, agentId: 'spoofed' });
      const serverSide = server.io.sockets.sockets.get(socket.id as string);
      expect(serverSide?.data.userId).toBe(body.user.id);
      expect(serverSide?.data.agentId).toBe(body.user.agentId);
      expect(serverSide?.rooms).toEqual(new Set([socket.id, userRoom(body.user.id)]));
      expect(await server.io.in(`agent:${body.user.agentId}`).fetchSockets()).toHaveLength(0);
      socket.close();
    });

    it('user-room emissions reach owner only; agent:info_request is a no-op', async () => {
      const alice = await login('alice', 'demo');
      const eve = await login('eve', 'demo');
      const aliceSock = await connectSocket({ token: alice.body.token });
      const eveSock = await connectSocket({ token: eve.body.token });
      const aliceMsgs: unknown[] = [];
      const eveMsgs: unknown[] = [];
      aliceSock.on('chat:message', (m) => aliceMsgs.push(m));
      eveSock.on('chat:message', (m) => eveMsgs.push(m));
      eveSock.emit('agent:info_request', { forged: true });
      server.io.to(userRoom(alice.body.user.id)).emit('chat:message', { body: 'hi alice' });
      await new Promise((r) => setTimeout(r, 300));
      expect(aliceMsgs).toHaveLength(1);
      expect(eveMsgs).toHaveLength(0);
      expect(eveSock.connected).toBe(true);
      aliceSock.close();
      eveSock.close();
    });
  });

  it('stub mode rejects demo/production', () => {
    const savedMode = process.env.APP_MODE;
    const savedEnv = process.env.NODE_ENV;
    try {
      process.env.APP_MODE = 'demo';
      expect(() => stubMemoryEngine()).toThrow();
      expect(() => createServer({ databasePath: join(dir, 'demo.db') })).toThrow();
      process.env.APP_MODE = '';
      process.env.NODE_ENV = 'production';
      expect(() => stubMemoryEngine()).toThrow();
    } finally {
      process.env.APP_MODE = savedMode;
      process.env.NODE_ENV = savedEnv;
    }
  });

  it('seed placeholder exits nonzero marked unimplemented', () => {
    let failed = true;
    try {
      execFileSync('npx', ['tsx', 'src/seed.ts'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        stdio: 'pipe',
      });
      failed = false;
    } catch (err) {
      const e = err as { status?: number; stderr?: Buffer };
      expect(e.status).toBe(1);
      expect(String(e.stderr)).toContain('not implemented');
    }
    expect(failed).toBe(true);
  });
});

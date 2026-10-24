import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import BetterSqlite3 from 'better-sqlite3';
import { io as ioc, type Socket } from 'socket.io-client';
import { stubMemoryEngine, userRoom } from '@asymmetry/shared';
import { all, get, resolveDatabasePath, run } from './db.js';
import { createServer, loadEnvironment, type AsymmetryServer } from './index.js';

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
    expect(res.body).toEqual({ ok: true, service: 'asymmetry-api' });
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
  });

  it('resolveDatabasePath falls back to repo root and respects explicit values', () => {
    expect(resolveDatabasePath('/tmp/explicit.db')).toBe('/tmp/explicit.db');
    expect(resolveDatabasePath('')).toMatch(/asymmetry\.db$/);
    expect(resolveDatabasePath()).toMatch(/asymmetry\.db$/);
    expect(resolveDatabasePath('')).not.toBe('');
  });

  it('loadEnvironment reads an explicit env file cwd-independently', () => {
    const envFile = join(dir, 'test.env');
    writeFileSync(envFile, 'ASYMMETRY_TEST_MARKER=loaded-value\n');
    loadEnvironment(envFile);
    expect(process.env.ASYMMETRY_TEST_MARKER).toBe('loaded-value');
    delete process.env.ASYMMETRY_TEST_MARKER;
  });

  it('retains sessions and data across close and reopen on a disposable path', async () => {
    const path = join(dir, 'reopen.db');
    const first = createServer({ databasePath: path });
    const port = await first.listen(0);
    const res = await request(`http://localhost:${port}`).post('/api/login').send({ username: 'persist', password: 'demo' });
    expect(res.status).toBe(200);
    const token = res.body.token;
    await first.close();
    await first.close();
    const second = createServer({ databasePath: path });
    const port2 = await second.listen(0);
    const tasks = await request(`http://localhost:${port2}`).get('/api/tasks').set('Authorization', `Bearer ${token}`);
    expect(tasks.status).toBe(200);
    const relogin = await request(`http://localhost:${port2}`).post('/api/login').send({ username: 'persist', password: 'demo' });
    expect(relogin.status).toBe(200);
    expect(relogin.body.user.id).toBe(res.body.user.id);
    await second.close();
  });

  it('occupied port rejects and rebind works after close', async () => {
    const a = createServer({ databasePath: join(dir, 'port-a.db') });
    const port = await a.listen(0);
    const b = createServer({ databasePath: join(dir, 'port-b.db') });
    await expect(b.listen(port)).rejects.toThrow();
    await b.close();
    await a.close();
    const c = createServer({ databasePath: join(dir, 'port-c.db') });
    await expect(c.listen(port)).resolves.toBe(port);
    await c.close();
  });

  it('normalizes registration: one user+agent+session, no hash leaked', async () => {
    const res = await login('  Alice  ', 'demo');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.displayName).toBe('alice');
    expect(Object.keys(res.body.user).sort()).toEqual(
      ['agentId', 'createdAt', 'displayName', 'id', 'username'].sort(),
    );
    const users = all<{ id: string }>(server.db, "SELECT id FROM users WHERE username = 'alice'");
    expect(users).toHaveLength(1);
    const agent = get<{ user_id: string; name: string }>(server.db, 'SELECT * FROM agents WHERE id = ?', res.body.user.agentId);
    expect(agent?.user_id).toBe(res.body.user.id);
    const session = get<{ user_id: string }>(server.db, 'SELECT * FROM sessions WHERE token = ?', res.body.token);
    expect(session?.user_id).toBe(res.body.user.id);
    const hash = get<{ pass_hash: string }>(server.db, 'SELECT pass_hash FROM users WHERE id = ?', res.body.user.id);
    expect(hash?.pass_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare('demo', hash?.pass_hash as string)).toBe(true);
  });

  it('repeat login succeeds, wrong password returns 401', async () => {
    expect((await login('alice', 'demo')).status).toBe(200);
    const bad = await login('alice', 'wrong');
    expect(bad.status).toBe(401);
    expect(bad.body.error).toEqual({ code: 'UNAUTHORIZED', message: 'invalid credentials' });
  });

  it('rejects invalid bodies with 400', async () => {
    expect((await login('ab', 'demo')).status).toBe(400);
    expect((await login('bad name!', 'demo')).status).toBe(400);
    expect((await login('validuser', 'x')).status).toBe(400);
    expect((await login('validuser', 'p'.repeat(129))).status).toBe(400);
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
    let bobId: string, bobAgentId: string, erinAgentId: string;
    let eveToken: string;
    const otherTaskId = randomUUID();
    const taskId = randomUUID();
    const subchatId = randomUUID();
    const openSubchatId = randomUUID();

    beforeAll(async () => {
      const aliceLogin = await login('alice', 'demo');
      aliceToken = aliceLogin.body.token;
      aliceId = aliceLogin.body.user.id;
      aliceAgentId = aliceLogin.body.user.agentId;
      bobAgentId = insertUser('bob').agentId;
      erinAgentId = insertUser('erin').agentId;
      bobId = get<{ user_id: string }>(server.db, 'SELECT user_id FROM agents WHERE id = ?', bobAgentId)?.user_id as string;
      run(server.db, 'INSERT INTO trust_edges (owner_user_id, trusted_user_id, created_at) VALUES (?, ?, ?)', aliceId, bobId, 1000);
      run(server.db, 'INSERT INTO tasks (id, user_id, title, created_at) VALUES (?, ?, ?, ?)', taskId, aliceId, 'sublet hunt', 2000);
      run(server.db, 'INSERT INTO tasks (id, user_id, title, created_at) VALUES (?, ?, ?, ?)', otherTaskId, aliceId, 'other task', 2000);
      run(server.db, 'INSERT INTO subchats (id, task_id, kind, status, outcome, summary, closed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', subchatId, taskId, 'group', 'closed', 'done', 'room found', 2500, 2001);
      run(server.db, 'INSERT INTO subchats (id, task_id, kind, status, created_at) VALUES (?, ?, ?, ?, ?)', openSubchatId, taskId, 'pair', 'open', 2002);
      run(server.db, 'INSERT INTO subchat_participants (subchat_id, agent_id) VALUES (?, ?)', openSubchatId, aliceAgentId);
      run(server.db, 'INSERT INTO subchat_participants (subchat_id, agent_id) VALUES (?, ?)', openSubchatId, bobAgentId);
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
      run(server.db, 'INSERT INTO trust_edges (owner_user_id, trusted_user_id, created_at) VALUES (?, ?, ?)', eve.body.user.id, aliceId, 1000);
      run(server.db, 'INSERT INTO trust_edges (owner_user_id, trusted_user_id, created_at) VALUES (?, ?, ?)', aliceId, aliceId, 1000);
      const disclosure = (scopeJson: string, releasedJson: string, withheld: number, decision: string) => {
        run(
          server.db,
          'INSERT INTO disclosures (id, owner_user_id, requester_agent_id, scope_json, released_json, withheld_count, decision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          randomUUID(), bobId, aliceAgentId, scopeJson, releasedJson, withheld, decision, 4000,
        );
      };
      disclosure(JSON.stringify({ taskId, purpose: 'sublet', fields: ['price'], subchatId }), '["released-fact-alpha","released-fact-beta"]', 1, 'partial');
      disclosure(JSON.stringify({ taskId, purpose: 'sublet', fields: [] }), '[]', 2, 'denied');
      disclosure(JSON.stringify({ taskId: otherTaskId, purpose: 'x', fields: [] }), '[]', 0, 'released');
      disclosure('not valid json{', '[]', 0, 'released');
      disclosure(JSON.stringify({ taskId, purpose: 'x', fields: [], subchatId: randomUUID() }), '[]', 0, 'released');
      disclosure(JSON.stringify({ taskId, purpose: 'x', fields: [] }), '{bad', 0, 'released');
      disclosure(JSON.stringify({ taskId, purpose: 'x', fields: [] }), '["f"]', -1, 'partial');
    });

    it('owner replays full history with nulls and participants', async () => {
      const res = await request(base).get(`/api/tasks/${taskId}/messages`).set('Authorization', `Bearer ${aliceToken}`);
      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe('sublet hunt');
      expect(res.body.task.userId).toBe(aliceId);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[0].subchatId).toBeNull();
      expect(res.body.messages[1].subchatId).toBe(subchatId);
      expect(res.body.subchats).toHaveLength(2);
      expect(res.body.subchats[0].kind).toBe('group');
      expect(res.body.subchats[0].status).toBe('closed');
      expect(res.body.subchats[0].outcome).toBe('done');
      expect(res.body.subchats[0].summary).toBe('room found');
      expect(res.body.subchats[0].closedAt).toBe(2500);
      expect(res.body.subchats[0].participantAgentIds.sort()).toEqual([aliceAgentId, bobAgentId, erinAgentId].sort());
      expect(res.body.subchats[1].status).toBe('open');
      expect(res.body.subchats[1].outcome).toBeNull();
      expect(res.body.subchats[1].summary).toBeNull();
      expect(res.body.subchats[1].closedAt).toBeNull();
    });

    it('replays only valid scoped browser disclosure notices', async () => {
      const res = await request(base).get(`/api/tasks/${taskId}/messages`).set('Authorization', `Bearer ${aliceToken}`);
      expect(res.status).toBe(200);
      expect(res.body.disclosures).toHaveLength(2);
      const withSubchat = res.body.disclosures.find((n: { subchatId: string | null }) => n.subchatId !== null);
      const withoutSubchat = res.body.disclosures.find((n: { subchatId: string | null }) => n.subchatId === null);
      for (const notice of res.body.disclosures) {
        expect(Object.keys(notice).sort()).toEqual(
          ['decision', 'id', 'ownerAgentId', 'releasedCount', 'subchatId', 'taskId', 'withheldCount'].sort(),
        );
        expect(notice.taskId).toBe(taskId);
        expect(notice.ownerAgentId).toBe(bobAgentId);
      }
      expect(withSubchat.subchatId).toBe(subchatId);
      expect(withSubchat.releasedCount).toBe(2);
      expect(withSubchat.withheldCount).toBe(1);
      expect(withSubchat.decision).toBe('partial');
      expect(withoutSubchat.subchatId).toBeNull();
      expect(withoutSubchat.releasedCount).toBe(0);
      expect(withoutSubchat.withheldCount).toBe(2);
      expect(withoutSubchat.decision).toBe('denied');
      const noticesJson = JSON.stringify(res.body.disclosures);
      expect(noticesJson).not.toContain('released-fact');
      expect(noticesJson).not.toContain('purpose');
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
      expect(eveNet.body.trusted).toEqual([aliceAgentId]);
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

    it('forged join attempts are no-ops (placeholder validation only; D2 handlers pending)', async () => {
      const alice = await login('alice', 'demo');
      const eve = await login('eve', 'demo');
      const eveSock = await connectSocket({ token: eve.body.token });
      const serverSide = server.io.sockets.sockets.get(eveSock.id as string);
      const roomsBefore = new Set(serverSide?.rooms);
      for (const evt of ['join', 'room:join', 'subchat:join', 'agent:info_request']) {
        eveSock.emit(evt, {
          room: userRoom(alice.body.user.id),
          subchatId: 'forged',
          agentId: alice.body.user.agentId,
          userId: alice.body.user.id,
        });
      }
      await new Promise((r) => setTimeout(r, 300));
      expect(serverSide?.rooms).toEqual(roomsBefore);
      expect(eveSock.connected).toBe(true);
      eveSock.close();
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

  it('failed insert rolls back identity atomically (TEMP trigger)', async () => {
    for (const table of ['agents', 'sessions']) {
      run(
        server.db,
        `CREATE TEMP TRIGGER fail_${table} BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'forced failure'); END`,
      );
      const res = await login('atomicfail', 'demo');
      expect(res.status).toBe(500);
      expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'internal error' });
      expect(all(server.db, 'SELECT * FROM agents a JOIN users u ON u.agent_id = a.id WHERE u.username = ?', 'atomicfail')).toHaveLength(0);
      expect(all(server.db, 'SELECT s.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username = ?', 'atomicfail')).toHaveLength(0);
      expect(all(server.db, 'SELECT * FROM users WHERE username = ?', 'atomicfail')).toHaveLength(0);
      run(server.db, `DROP TRIGGER fail_${table}`);
    }
  });

  it('stub mode rejects demo/production', () => {
    const savedMode = process.env.APP_MODE;
    const savedEnv = process.env.NODE_ENV;
    const restore = (key: string, value: string | undefined): void => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    try {
      process.env.APP_MODE = 'demo';
      expect(() => stubMemoryEngine()).toThrow();
      expect(() => createServer({ databasePath: join(dir, 'demo.db') })).toThrow();
      delete process.env.APP_MODE;
      process.env.NODE_ENV = 'production';
      expect(() => stubMemoryEngine()).toThrow();
      expect(() => createServer({ databasePath: join(dir, 'prod.db') })).toThrow();
    } finally {
      restore('APP_MODE', savedMode);
      restore('NODE_ENV', savedEnv);
    }
  });

  it('migrates a legacy subchats table without losing rows', async () => {
    const path = join(dir, 'legacy.db');
    const legacy = new BetterSqlite3(path);
    legacy.exec(
      readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8')
        .replace(/,\s*outcome TEXT, summary TEXT, closed_at INTEGER/, ''),
    );
    legacy.prepare('INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('u1', 'legacy', 'legacy', 'h', 'a1', 1);
    legacy.prepare('INSERT INTO agents (id, user_id, name) VALUES (?, ?, ?)').run('a1', 'u1', "L's Agent");
    legacy.prepare('INSERT INTO tasks (id, user_id, title, created_at) VALUES (?, ?, ?, ?)').run('t1', 'u1', 'legacy task', 2);
    legacy.prepare('INSERT INTO subchats (id, task_id, kind, status, created_at) VALUES (?, ?, ?, ?, ?)').run('sc1', 't1', 'pair', 'open', 3);
    legacy.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run('tok-legacy', 'u1', 4);
    legacy.close();

    const first = createServer({ databasePath: path });
    await first.close();
    const second = createServer({ databasePath: path });
    const cols = all<{ name: string }>(second.db, 'PRAGMA table_info(subchats)').map((c) => c.name);
    for (const c of ['outcome', 'summary', 'closed_at']) {
      expect(cols.filter((n) => n === c)).toHaveLength(1);
    }
    const row = get<{ status: string; outcome: unknown; summary: unknown; closed_at: unknown }>(second.db, 'SELECT * FROM subchats WHERE id = ?', 'sc1');
    expect(row?.status).toBe('open');
    expect(row?.outcome).toBeNull();
    expect(row?.summary).toBeNull();
    expect(row?.closed_at).toBeNull();
    const port = await second.listen(0);
    const tasks = await request(`http://localhost:${port}`).get('/api/tasks').set('Authorization', 'Bearer tok-legacy');
    expect(tasks.status).toBe(200);
    expect(tasks.body[0].title).toBe('legacy task');
    await second.close();
  });

  it('long passwords use versioned prehash and never truncate', async () => {
    const ascii128 = `p${'a'.repeat(127)}`;
    const res = await login('longpw', ascii128);
    expect(res.status).toBe(200);
    expect((await login('longpw', ascii128)).status).toBe(200);
    const stored = get<{ pass_hash: string }>(server.db, "SELECT pass_hash FROM users WHERE username = 'longpw'")?.pass_hash as string;
    expect(stored.startsWith('bcrypt-sha256:')).toBe(true);
    expect(stored).not.toContain(ascii128);
    expect(stored.slice('bcrypt-sha256:'.length)).toMatch(/^\$2[aby]\$10\$/);
    const tampered = `${ascii128.slice(0, 100)}Z${ascii128.slice(101)}`;
    expect(tampered).toHaveLength(128);
    expect((await login('longpw', tampered)).status).toBe(401);

    const snowman = '☃'.repeat(30);
    expect((await login('snowman', snowman)).status).toBe(200);
    expect((await login('snowman', snowman)).status).toBe(200);
    expect((await login('snowman', `${snowman}☃`)).status).toBe(401);

    const raw72 = 'x'.repeat(72);
    expect((await login('raw72', raw72)).status).toBe(200);
    const rawStored = get<{ pass_hash: string }>(server.db, "SELECT pass_hash FROM users WHERE username = 'raw72'")?.pass_hash as string;
    expect(rawStored.startsWith('bcrypt-sha256:')).toBe(false);
    expect((await login('raw72', `${raw72}y`)).status).toBe(401);
  });

  it('contract error shapes and CORS on parser failures', async () => {
    const malformed = await request(base)
      .post('/api/login')
      .set('Content-Type', 'application/json')
      .send('{broken');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: { code: 'BAD_INPUT', message: 'invalid request' } });
    expect(malformed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const unauth = await request(base).get('/api/tasks');
    expect(unauth.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'unauthorized' } });
    const notFound = await request(base).get('/api/nope');
    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe('NOT_FOUND');
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

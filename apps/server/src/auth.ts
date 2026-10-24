import { randomUUID } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import { get, run, type Database } from './db.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    agentId?: string;
  }
}

const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;
const BCRYPT_MAX_BYTES = 72;
const INVALID_CREDENTIALS = 'invalid credentials';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  pass_hash: string;
  agent_id: string;
  created_at: number;
}

const publicUser = (row: UserRow) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  agentId: row.agent_id,
  createdAt: row.created_at,
});

const createSession = (db: Database, userId: string): string => {
  const token = randomUUID();
  run(db, 'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', token, userId, Date.now());
  return token;
};

const findUserByUsername = (db: Database, username: string): UserRow | undefined =>
  get<UserRow>(db, 'SELECT * FROM users WHERE username = ?', username);

export function registerAuth(app: Express, db: Database): void {
  app.post('/api/login', async (req: Request, res: Response) => {
    const body = req.body as { username?: unknown; password?: unknown } | undefined;
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!USERNAME_RE.test(username) || password.length < 4 || password.length > 128) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }

    const existing = findUserByUsername(db, username);
    if (existing) {
      if (!bcrypt.compareSync(password, existing.pass_hash)) {
        res.status(401).json({ error: INVALID_CREDENTIALS });
        return;
      }
      res.json({ token: createSession(db, existing.id), user: publicUser(existing) });
      return;
    }

    const passHash = await bcrypt.hash(password, 10);
    const now = Date.now();
    const registered = db.transaction((): UserRow => {
      const raced = findUserByUsername(db, username);
      if (raced) return raced;
      const userId = randomUUID();
      const agentId = randomUUID();
      run(
        db,
        'INSERT INTO users (id, username, display_name, pass_hash, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        userId, username, username, passHash, agentId, now,
      );
      run(db, 'INSERT INTO agents (id, user_id, name) VALUES (?, ?, ?)', agentId, userId, `${username}'s Agent`);
      return findUserByUsername(db, username) as UserRow;
    })();

    if (registered.pass_hash !== passHash && !bcrypt.compareSync(password, registered.pass_hash)) {
      res.status(401).json({ error: INVALID_CREDENTIALS });
      return;
    }
    res.json({ token: createSession(db, registered.id), user: publicUser(registered) });
  });
}

const sessionUser = (db: Database, token: string): { userId: string; agentId: string } | undefined =>
  get<{ userId: string; agentId: string }>(
    db,
    'SELECT s.user_id AS userId, u.agent_id AS agentId FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
    token,
  );

export function authMiddleware(db: Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const session = sessionUser(db, token);
    if (!session) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.userId = session.userId;
    req.agentId = session.agentId;
    next();
  };
}

export function socketAuth(db: Database) {
  return (socket: Socket, next: (err?: Error) => void): void => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('unauthorized'));
      return;
    }
    const session = sessionUser(db, token);
    if (!session) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.userId = session.userId;
    socket.data.agentId = session.agentId;
    next();
  };
}


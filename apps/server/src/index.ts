import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express, { type Express } from 'express';
import { Server } from 'socket.io';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import {
  userRoom,
  type Agent,
  type Message,
  type Subchat,
  type Task,
} from '@asymmetry/shared';
import { all, get, openDatabase, type Database } from './db.js';
import { authMiddleware, registerAuth, socketAuth } from './auth.js';
import { createMemoryEngine, registerMemory } from './memory/index.js';
import { registerAgents } from './agents/index.js';

export interface ServerOptions {
  databasePath?: string;
  openai?: OpenAI;
  frontendOrigin?: string;
}

export interface AsymmetryServer {
  app: Express;
  httpServer: HttpServer;
  io: Server;
  db: Database;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  status: Task['status'];
  created_at: number;
}

interface MessageRow {
  id: string;
  room_id: string;
  task_id: string | null;
  subchat_id: string | null;
  sender_type: Message['senderType'];
  sender_id: string;
  body: string;
  created_at: number;
}

interface SubchatRow {
  id: string;
  task_id: string;
  kind: Subchat['kind'];
  status: Subchat['status'];
  created_at: number;
}

interface AgentRow {
  id: string;
  user_id: string;
  name: string;
  status: Agent['status'];
}

const toTask = (r: TaskRow): Task => ({
  id: r.id, userId: r.user_id, title: r.title, status: r.status, createdAt: r.created_at,
});

const toMessage = (r: MessageRow): Message => ({
  id: r.id, roomId: r.room_id, taskId: r.task_id, subchatId: r.subchat_id,
  senderType: r.sender_type, senderId: r.sender_id, body: r.body, createdAt: r.created_at,
});

const toAgent = (r: AgentRow): Agent => ({
  id: r.id, userId: r.user_id, name: r.name, status: r.status,
});

const stubModeAllowed = (): boolean =>
  (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
  process.env.APP_MODE !== 'demo';

const createOpenAI = (): OpenAI => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (!stubModeAllowed()) {
      throw new Error('OPENAI_API_KEY is required outside development/test stub mode');
    }
    return new OpenAI({ apiKey: 'stub-key' });
  }
  return new OpenAI({ apiKey });
};

export function createServer(options: ServerOptions = {}): AsymmetryServer {
  const frontendOrigin = options.frontendOrigin ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
  const db = openDatabase(options.databasePath);
  try {
    const app = express();
    const httpServer = createHttpServer(app);
    const io = new Server(httpServer, {
      cors: { origin: frontendOrigin, credentials: true },
    });
    const openai = options.openai ?? createOpenAI();
    const memory = createMemoryEngine(db, openai, io);

    app.use(express.json());
    app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err instanceof SyntaxError) {
        res.status(400).json({ error: 'invalid request' });
        return;
      }
      next(err);
    });
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', frontendOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    });

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    registerAuth(app, db);

    const authed = authMiddleware(db);

    app.get('/api/tasks', authed, (req, res) => {
      const rows = all<TaskRow>(db, 'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at, id', req.userId);
      res.json(rows.map(toTask));
    });

    app.get('/api/tasks/:id/messages', authed, (req, res) => {
      const task = get<TaskRow>(db, 'SELECT * FROM tasks WHERE id = ? AND user_id = ?', req.params.id, req.userId);
      if (!task) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const messages = all<MessageRow>(
        db,
        'SELECT * FROM messages WHERE task_id = ? ORDER BY created_at, id',
        task.id,
      ).map(toMessage);
      const subchatRows = all<SubchatRow>(db, 'SELECT * FROM subchats WHERE task_id = ? ORDER BY created_at, id', task.id);
      const participantStmt = db.prepare('SELECT agent_id FROM subchat_participants WHERE subchat_id = ?');
      const subchats: Subchat[] = subchatRows.map((r) => ({
        id: r.id,
        taskId: r.task_id,
        kind: r.kind,
        status: r.status,
        createdAt: r.created_at,
        participantAgentIds: (participantStmt.all(r.id) as { agent_id: string }[]).map((p) => p.agent_id),
      }));
      res.json({ task: toTask(task), messages, subchats });
    });

    app.get('/api/network', authed, (req, res) => {
      const userId = req.userId as string;
      const selfAgent = get<AgentRow>(db, 'SELECT * FROM agents WHERE user_id = ?', userId);
      const trustedAgentRows = all<AgentRow>(
        db,
        `SELECT a.* FROM agents a
         JOIN trust_edges t ON t.trusted_user_id = a.user_id
         WHERE t.owner_user_id = ?`,
        userId,
      );
      const trustedIds = new Set(trustedAgentRows.map((a) => a.id));
      const discoveredRows = all<AgentRow>(
        db,
        `SELECT DISTINCT a.* FROM agents a
         JOIN subchat_participants sp ON sp.agent_id = a.id
         JOIN subchats s ON s.id = sp.subchat_id
         JOIN tasks t ON t.id = s.task_id
         WHERE t.user_id = ? AND a.id != ?`,
        userId,
        selfAgent?.id ?? '',
      ).filter((a) => !trustedIds.has(a.id));
      const agents = [selfAgent, ...trustedAgentRows, ...discoveredRows]
        .filter((a): a is AgentRow => a !== undefined)
        .map(toAgent);
      res.json({
        agents,
        trusted: trustedAgentRows.map((a) => a.id),
        discovered: discoveredRows.map((a) => a.id),
      });
    });

    app.use('/api/memory', authed);
    registerMemory(app, db);
    registerAgents(io, db, memory);

    app.use((_req, res) => {
      res.status(404).json({ error: 'not found' });
    });
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: 'internal error' });
    });

    io.use(socketAuth(db));
    io.on('connection', (socket) => {
      socket.join(userRoom(socket.data.userId as string));
    });

    const listen = (port: number = Number(process.env.PORT) || 3001): Promise<number> =>
      new Promise((resolveListen, rejectListen) => {
        httpServer.once('error', rejectListen);
        httpServer.listen(port, () => {
          const address = httpServer.address();
          resolveListen(typeof address === 'object' && address !== null ? address.port : port);
        });
      });

    const close = async (): Promise<void> => {
      await new Promise<void>((resolveClose) => io.close(() => resolveClose()));
      try {
        db.close();
      } catch {
        void 0;
      }
    };

    return { app, httpServer, io, db, listen, close };
  } catch (err) {
    try {
      db.close();
    } catch {
      void 0;
    }
    throw err;
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
  const server = createServer();
  server
    .listen()
    .then((port) => {
      console.log(`listening :${port}`);
      const shutdown = () => {
        server.close().finally(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error('server failed to start:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

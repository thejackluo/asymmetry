import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express, { type Express } from 'express';
import { Server } from 'socket.io';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import {
  userRoom,
  type Agent,
  type DisclosureNotice,
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
  outcome: Subchat['outcome'];
  summary: string | null;
  closed_at: number | null;
  created_at: number;
}

interface DisclosureRow {
  id: string;
  owner_user_id: string;
  scope_json: string;
  released_json: string;
  withheld_count: number;
  decision: DisclosureNotice['decision'];
  owner_agent_id: string;
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

const toSubchat = (r: SubchatRow, participantAgentIds: string[]): Subchat => ({
  id: r.id, taskId: r.task_id, kind: r.kind, status: r.status,
  outcome: r.outcome, summary: r.summary, closedAt: r.closed_at,
  participantAgentIds, createdAt: r.created_at,
});

const DECISIONS = new Set(['released', 'partial', 'denied']);

const toDisclosureNotice = (
  row: DisclosureRow,
  taskId: string,
  validSubchatIds: Set<string>,
): DisclosureNotice | null => {
  let scope: { taskId?: unknown; subchatId?: unknown };
  let releasedIds: unknown;
  try {
    scope = JSON.parse(row.scope_json) as { taskId?: unknown; subchatId?: unknown };
    releasedIds = JSON.parse(row.released_json);
  } catch {
    return null;
  }
  if (scope.taskId !== taskId) return null;
  let subchatId: string | null = null;
  if (scope.subchatId !== undefined && scope.subchatId !== null) {
    if (typeof scope.subchatId !== 'string' || !validSubchatIds.has(scope.subchatId)) return null;
    subchatId = scope.subchatId;
  }
  if (
    !Array.isArray(releasedIds) ||
    !releasedIds.every((id) => typeof id === 'string') ||
    !Number.isInteger(row.withheld_count) ||
    row.withheld_count < 0 ||
    !DECISIONS.has(row.decision)
  ) {
    return null;
  }
  return {
    id: row.id,
    taskId,
    subchatId,
    ownerAgentId: row.owner_agent_id,
    releasedCount: releasedIds.length,
    withheldCount: row.withheld_count,
    decision: row.decision,
  };
};

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
    app.use(express.json({ limit: '256kb' }));
    app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status: number }).status : 0;
      if (err instanceof SyntaxError || status === 400 || status === 413) {
        res.status(400).json({ error: { code: 'BAD_INPUT', message: 'invalid request' } });
        return;
      }
      next(err);
    });

    app.get('/health', (_req, res) => {
      res.json({ ok: true, service: 'asymmetry-api' });
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
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'not found' } });
        return;
      }
      const messages = all<MessageRow>(
        db,
        'SELECT * FROM messages WHERE task_id = ? ORDER BY created_at, id',
        task.id,
      ).map(toMessage);
      const subchatRows = all<SubchatRow>(db, 'SELECT * FROM subchats WHERE task_id = ? ORDER BY created_at, id', task.id);
      const participantStmt = db.prepare('SELECT agent_id FROM subchat_participants WHERE subchat_id = ?');
      const subchats: Subchat[] = subchatRows.map((r) =>
        toSubchat(r, (participantStmt.all(r.id) as { agent_id: string }[]).map((p) => p.agent_id)),
      );
      const disclosureRows = all<DisclosureRow>(
        db,
        `SELECT d.*, a.id AS owner_agent_id FROM disclosures d
         JOIN agents a ON a.user_id = d.owner_user_id
         WHERE CASE WHEN json_valid(d.scope_json)
               THEN json_extract(d.scope_json, '$.taskId') END = ?
         ORDER BY d.created_at, d.id`,
        task.id,
      );
      const validSubchatIds = new Set(subchatRows.map((r) => r.id));
      const disclosures = disclosureRows
        .map((r) => toDisclosureNotice(r, task.id, validSubchatIds))
        .filter((n): n is DisclosureNotice => n !== null);
      res.json({ task: toTask(task), messages, subchats, disclosures });
    });

    app.get('/api/network', authed, (req, res) => {
      const userId = req.userId as string;
      const selfAgent = get<AgentRow>(db, 'SELECT * FROM agents WHERE user_id = ?', userId);
      const trustedAgentRows = all<AgentRow>(
        db,
        `SELECT a.* FROM agents a
         JOIN trust_edges t ON t.trusted_user_id = a.user_id
         WHERE t.owner_user_id = ? AND a.user_id != ?`,
        userId,
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
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'not found' } });
    });
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'internal error' } });
    });

    io.use(socketAuth(db));
    io.on('connection', (socket) => {
      socket.join(userRoom(socket.data.userId as string));
    });

    const listen = (port: number = Number(process.env.PORT) || 3001): Promise<number> =>
      new Promise((resolveListen, rejectListen) => {
        const onError = (err: unknown): void => {
          httpServer.off('error', onError);
          rejectListen(err);
        };
        httpServer.once('error', onError);
        httpServer.listen(port, () => {
          httpServer.off('error', onError);
          const address = httpServer.address();
          resolveListen(typeof address === 'object' && address !== null ? address.port : port);
        });
      });

    let closed = false;
    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolveClose) => io.close(() => resolveClose()));
      db.close();
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

export function loadEnvironment(
  envFile: string = process.env.ASYMMETRY_ENV_FILE ||
    fileURLToPath(new URL('../../../.env', import.meta.url)),
): void {
  dotenv.config({ path: envFile });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  loadEnvironment();
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
    .catch(async (err) => {
      console.error('server failed to start:', err instanceof Error ? err.message : err);
      await server.close().catch(() => {});
      process.exit(1);
    });
}

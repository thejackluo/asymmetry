import type { Express } from 'express';
import type { Server } from 'socket.io';
import type OpenAI from 'openai';
import { stubMemoryEngine, type MemoryEngine } from '@asymmetry/shared';
import type { Database } from '../db.js';

const assertStubMode = (): void => {
  const env = process.env.NODE_ENV;
  const stubAllowed =
    (env === 'development' || env === 'test') && process.env.APP_MODE !== 'demo';
  if (!stubAllowed) {
    throw new Error(
      'stub memory engine is only available in development/test mode; ' +
        'APP_MODE=demo and production require the real memory engine',
    );
  }
};

export function createMemoryEngine(
  _db: Database,
  _openai: OpenAI,
  _io?: Server,
): MemoryEngine {
  assertStubMode();
  return stubMemoryEngine();
}

export function registerMemory(app: Express, _db: Database): void {
  assertStubMode();
  app.get('/api/memory', (_req, res) => {
    res.json([]);
  });
}

import type { Express, Request, Response } from 'express';
import type { Database } from '../db.js';
import { listMemory } from './engine.js';

export { createMemoryEngine, MemoryAccessError } from './engine.js';

export function registerMemory(app: Express, db: Database): void {
  app.get('/api/memory', (req: Request, res: Response) => {
    const userId = req.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json(listMemory(db, userId));
  });
}

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authMiddleware } from '../auth.js';
import { registerMemory } from './index.js';
import { addFact, addUser, freshDb } from './testutil.js';

describe('GET /api/memory', () => {
  it('returns only the authenticated user items and rejects anonymous calls', async () => {
    const db = freshDb();
    const a = addUser(db, 'alice');
    const b = addUser(db, 'bob');
    addFact(db, a.userId, 'alice secret', 'private', ['ssn']);
    addFact(db, b.userId, 'bob secret', 'private', ['phone']);
    db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES ('tok-a', ?, 1)").run(a.userId);

    const app = express();
    app.use('/api/memory', authMiddleware(db));
    registerMemory(app, db);

    await request(app).get('/api/memory').expect(401);
    const res = await request(app).get('/api/memory').set('Authorization', 'Bearer tok-a').expect(200);
    expect(res.body.map((i: { content: string }) => i.content)).toEqual(['alice secret']);
    expect(res.body[0]).toMatchObject({ userId: a.userId, classification: 'private', fieldTags: ['ssn'] });
  });

  it('rejects requests if mounted without auth', async () => {
    const app = express();
    registerMemory(app, freshDb());
    await request(app).get('/api/memory').expect(401);
  });
});

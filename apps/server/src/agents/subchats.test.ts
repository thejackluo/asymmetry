import type { Server } from 'socket.io';
import { describe, expect, it } from 'vitest';
import { EVENTS } from './events.js';
import { createSubchat, createTask, subchatById } from './repo.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';
import { closeSubchatAndNotify } from './subchats.js';

describe('subchat closure', () => {
  it('persists all closure metadata before emitting subchat:closed', () => {
    const db = createFixtureDb();
    const task = createTask(db, FIXTURE_IDS.users.bayzhan, 'Find a room');
    const subchat = createSubchat(db, task.id, [
      FIXTURE_IDS.agents.bayzhan,
      FIXTURE_IDS.agents.jack,
    ]);
    const observations: Array<{
      inTransaction: boolean;
      row: { status: string; outcome: string | null; summary: string | null; closed_at: number | null };
    }> = [];
    const io = {
      to() {
        return {
          emit(event: string) {
            if (event === EVENTS.SUBCHAT_CLOSED) {
              observations.push({
                inTransaction: db.inTransaction,
                row: db.prepare(
                  'SELECT status, outcome, summary, closed_at FROM subchats WHERE id = ?',
                ).get(subchat.id) as {
                  status: string;
                  outcome: string | null;
                  summary: string | null;
                  closed_at: number | null;
                },
              });
            }
          },
        };
      },
    } as unknown as Server;

    try {
      expect(closeSubchatAndNotify(db, io, subchat.id, 'stuck', 'peer timed out')).toBe(true);

      const closed = subchatById(db, subchat.id);
      expect(closed).toMatchObject({
        status: 'closed',
        outcome: 'stuck',
        summary: 'peer timed out',
        closedAt: expect.any(Number),
      });
      expect(observations).toHaveLength(2);
      expect(observations.every(({ inTransaction, row }) => (
        !inTransaction
        && row.status === 'closed'
        && row.outcome === 'stuck'
        && row.summary === 'peer timed out'
        && typeof row.closed_at === 'number'
      ))).toBe(true);
    } finally {
      db.close();
    }
  });
});

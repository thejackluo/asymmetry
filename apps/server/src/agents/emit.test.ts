import { describe, expect, it } from 'vitest';
import { userRoom } from '@asymmetry/shared';
import { createTask, createSubchat } from './repo.js';
import {
  emitAgentStatus,
  emitMainMessage,
  emitNetworkUpdated,
  emitSubchatEvent,
  emitTaskUpdated,
  emitTo,
} from './emit.js';
import { EVENTS } from './events.js';
import { createFixtureDb, FIXTURE_IDS } from './test/fixtures.js';
import { createFakeIO } from './test/fakeIO.js';

describe('room-targeted event delivery', () => {
  it('deduplicates rooms and never requires a global emit', () => {
    const { io, emissions } = createFakeIO();
    emitTo(io, [userRoom('alice'), userRoom('alice'), userRoom('bob')], 'example:event', { value: 1 });
    expect(emissions).toEqual([
      { room: userRoom('alice'), event: 'example:event', payload: { value: 1 } },
      { room: userRoom('bob'), event: 'example:event', payload: { value: 1 } },
    ]);
  });

  it('routes main-thread, subchat, task, network, and status events to authorized rooms', () => {
    const db = createFixtureDb();
    const { io, emissions } = createFakeIO();
    try {
      const task = createTask(db, FIXTURE_IDS.users.alice, 'Find a room');
      const subchat = createSubchat(db, task.id, [
        FIXTURE_IDS.agents.alice,
        FIXTURE_IDS.agents.bob,
      ]);

      emitMainMessage(io, FIXTURE_IDS.users.alice, {
        id: 'message-1',
        roomId: userRoom(FIXTURE_IDS.users.alice),
        taskId: task.id,
        subchatId: null,
        senderType: 'human',
        senderId: FIXTURE_IDS.users.alice,
        body: 'Need a room',
        createdAt: 1,
      });
      emitSubchatEvent(io, db, subchat.id, EVENTS.SUBCHAT_STARTED, subchat);
      emitNetworkUpdated(io, db, FIXTURE_IDS.users.alice);
      emitTaskUpdated(io, FIXTURE_IDS.users.alice, { id: task.id, status: 'done' });
      emitAgentStatus(io, db, FIXTURE_IDS.agents.bob, 'negotiating', FIXTURE_IDS.users.alice);

      expect(emissions.map(({ room, event }) => [room, event])).toEqual([
        [userRoom(FIXTURE_IDS.users.alice), EVENTS.CHAT_MESSAGE],
        [userRoom(FIXTURE_IDS.users.alice), EVENTS.SUBCHAT_STARTED],
        [userRoom(FIXTURE_IDS.users.bob), EVENTS.SUBCHAT_STARTED],
        [userRoom(FIXTURE_IDS.users.alice), EVENTS.NETWORK_UPDATED],
        [userRoom(FIXTURE_IDS.users.alice), EVENTS.TASK_UPDATED],
        [userRoom(FIXTURE_IDS.users.alice), EVENTS.AGENT_STATUS],
        [userRoom(FIXTURE_IDS.users.bob), EVENTS.AGENT_STATUS],
      ]);
      expect(emissions.find(({ event }) => event === EVENTS.TASK_UPDATED)?.payload)
        .toEqual({ taskId: task.id, status: 'done' });
      expect(emissions.some(({ room }) => room === userRoom(FIXTURE_IDS.users.dave))).toBe(false);
    } finally {
      db.close();
    }
  });
});

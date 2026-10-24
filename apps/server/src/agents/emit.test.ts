import { describe, expect, it } from 'vitest';
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
    emitTo(io, ['user:alice', 'user:alice', 'user:bob'], 'example:event', { value: 1 });
    expect(emissions).toEqual([
      { room: 'user:alice', event: 'example:event', payload: { value: 1 } },
      { room: 'user:bob', event: 'example:event', payload: { value: 1 } },
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
        roomId: `user:${FIXTURE_IDS.users.alice}`,
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
        [`user:${FIXTURE_IDS.users.alice}`, EVENTS.CHAT_MESSAGE],
        [`user:${FIXTURE_IDS.users.alice}`, EVENTS.SUBCHAT_STARTED],
        [`user:${FIXTURE_IDS.users.bob}`, EVENTS.SUBCHAT_STARTED],
        [`user:${FIXTURE_IDS.users.alice}`, EVENTS.NETWORK_UPDATED],
        [`user:${FIXTURE_IDS.users.alice}`, EVENTS.TASK_UPDATED],
        [`user:${FIXTURE_IDS.users.alice}`, EVENTS.AGENT_STATUS],
        [`user:${FIXTURE_IDS.users.bob}`, EVENTS.AGENT_STATUS],
      ]);
      expect(emissions.some(({ room }) => room === `user:${FIXTURE_IDS.users.dave}`)).toBe(false);
    } finally {
      db.close();
    }
  });
});

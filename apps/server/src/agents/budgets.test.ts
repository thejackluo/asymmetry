import { describe, expect, it } from 'vitest';
import {
  Budget,
  CLARIFY_CAP,
  MODEL_TIMEOUT_MS,
  PEER_CAP,
  SUBCHAT_MSG_CAP,
  TASK_MODEL_CALL_CAP,
  TOOL_ITER_CAP,
} from './budgets.js';

describe('Budget', () => {
  it('reserves at most twelve turns synchronously under concurrent requests', async () => {
    const budget = new Budget('task-turn-cap');
    const reservations = await Promise.all(
      Array.from({ length: 20 }, async () => budget.reserveSubchatTurn('subchat-one')),
    );

    expect(reservations.filter(Boolean)).toHaveLength(SUBCHAT_MSG_CAP);
  });

  it('caps model calls per task', () => {
    const budget = new Budget('task-model-cap');
    expect(Array.from({ length: TASK_MODEL_CALL_CAP }, () => budget.reserveModelCall()).every(Boolean)).toBe(true);
    expect(budget.reserveModelCall()).toBe(false);
  });

  it('limits distinct peers while allowing an already-counted peer', () => {
    const budget = new Budget('task-peer-cap');
    expect(Array.from({ length: PEER_CAP }, (_, index) => budget.addPeer(`agent-${index}`)).every(Boolean)).toBe(true);
    expect(budget.addPeer('agent-0')).toBe(true);
    expect(budget.addPeer('agent-4')).toBe(false);
    expect(budget.peers).toHaveLength(PEER_CAP);
  });

  it('exports the settled task limits', () => {
    expect([TOOL_ITER_CAP, MODEL_TIMEOUT_MS, CLARIFY_CAP]).toEqual([8, 30_000, 2]);
  });
});

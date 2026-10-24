import { describe, expect, it } from 'vitest';
import type { DisclosureNotice, Message } from './types';
import { mergeMessages, partitionMessages, routeDisclosures } from './utils';

const msg = (id: string, subchatId: string | null): Message => ({
  id,
  roomId: 'r',
  taskId: 't',
  subchatId,
  senderType: 'agent',
  senderId: 'a-1',
  body: `body-${id}`,
  createdAt: Number(id.replace(/\D/g, '')) || 0,
});

describe('partitionMessages', () => {
  it('splits main-thread and subchat messages; never mixes them', () => {
    const { main, bySubchat } = partitionMessages([
      msg('1', null),
      msg('2', 'sc-1'),
      msg('3', null),
      msg('4', 'sc-1'),
      msg('5', 'sc-2'),
    ]);
    expect(main.map((m) => m.id)).toEqual(['1', '3']);
    expect(bySubchat.get('sc-1')?.map((m) => m.id)).toEqual(['2', '4']);
    expect(bySubchat.get('sc-2')?.map((m) => m.id)).toEqual(['5']);
  });

  it('returns empty groups for empty input', () => {
    const { main, bySubchat } = partitionMessages([]);
    expect(main).toEqual([]);
    expect(bySubchat.size).toBe(0);
  });
});

const notice = (
  id: string,
  taskId: string,
  subchatId: string | null,
): DisclosureNotice => ({
  id,
  taskId,
  subchatId,
  ownerAgentId: 'a-bob',
  releasedCount: 3,
  withheldCount: 2,
  decision: 'partial',
});

describe('routeDisclosures', () => {
  it('routes by explicit taskId + subchatId, never the active pane', () => {
    const { bySubchat } = routeDisclosures(
      [notice('d1', 't1', 'sc-b'), notice('d2', 't1', 'sc-a')],
      't1',
    );
    // out-of-order arrival still lands in the right pane
    expect(bySubchat.get('sc-a')?.map((n) => n.id)).toEqual(['d2']);
    expect(bySubchat.get('sc-b')?.map((n) => n.id)).toEqual(['d1']);
  });

  it('null-subchatId notices become main-thread system lines', () => {
    const { main, bySubchat } = routeDisclosures(
      [notice('d1', 't1', null), notice('d2', 't1', 'sc-a')],
      't1',
    );
    expect(main.map((n) => n.id)).toEqual(['d1']);
    expect(bySubchat.get('sc-a')?.map((n) => n.id)).toEqual(['d2']);
  });

  it('dedupes notice ids and ignores notices for other tasks', () => {
    const { main, bySubchat } = routeDisclosures(
      [
        notice('d1', 't1', 'sc-a'),
        notice('d1', 't1', 'sc-a'), // replay duplicate
        notice('d2', 't2', 'sc-a'), // different task
      ],
      't1',
    );
    expect(main).toEqual([]);
    expect(bySubchat.get('sc-a')?.map((n) => n.id)).toEqual(['d1']);
  });
});

describe('mergeMessages', () => {
  it('dedupes by id and keeps chronological order', () => {
    const merged = mergeMessages(
      [msg('2', null), msg('4', null)],
      [msg('4', null), msg('1', null), msg('3', null)],
    );
    expect(merged.map((m) => m.id)).toEqual(['1', '2', '3', '4']);
  });
});

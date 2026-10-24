import { describe, expect, it } from 'vitest';
import type { Message } from './types';
import { mergeMessages, partitionMessages } from './utils';

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

describe('mergeMessages', () => {
  it('dedupes by id and keeps chronological order', () => {
    const merged = mergeMessages(
      [msg('2', null), msg('4', null)],
      [msg('4', null), msg('1', null), msg('3', null)],
    );
    expect(merged.map((m) => m.id)).toEqual(['1', '2', '3', '4']);
  });
});

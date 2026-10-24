import { describe, expect, it } from 'vitest';
import type { DisclosureNotice, Message, Subchat } from './types';
import {
  applySubchatClosed,
  mergeMessages,
  mergeSubchats,
  partitionMessages,
  routeDisclosures,
} from './utils';

const subchat = (id: string, createdAt: number, closed = false): Subchat => ({
  id,
  taskId: 't',
  kind: 'pair',
  participantAgentIds: ['a-1', 'a-2'],
  status: closed ? 'closed' : 'open',
  outcome: closed ? 'done' : null,
  summary: closed ? 'closed summary' : null,
  closedAt: closed ? createdAt + 100 : null,
  createdAt,
});

describe('mergeSubchats', () => {
  it('replay replaces known subchats and appends unknown ones, sorted', () => {
    const live = [subchat('sc-1', 10), subchat('sc-live', 30)];
    const replay = [subchat('sc-2', 20), subchat('sc-1', 10, true)];
    const merged = mergeSubchats(live, replay);
    expect(merged.map((s) => s.id)).toEqual(['sc-1', 'sc-2', 'sc-live']);
    // replayed sc-1 is closed-with-summary — entity state wins
    expect(merged[0].status).toBe('closed');
    expect(merged[0].summary).toBe('closed summary');
  });

  it('keeps live subchats absent from replay (arrived mid-fetch)', () => {
    const merged = mergeSubchats([subchat('sc-live', 5)], [subchat('sc-1', 1)]);
    expect(merged.map((s) => s.id)).toEqual(['sc-1', 'sc-live']);
  });

  it('never downgrades a live closed subchat to a stale open replay', () => {
    const live = [subchat('sc-1', 10, true)];
    const replay = [subchat('sc-1', 10)]; // older snapshot still says open
    const [s] = mergeSubchats(live, replay);
    expect(s.status).toBe('closed');
    expect(s.outcome).toBe('done');
  });
});

describe('applySubchatClosed', () => {
  it('writes outcome + summary onto the entity the pane renders', () => {
    const [s] = applySubchatClosed([subchat('sc-1', 1)], {
      subchatId: 'sc-1',
      outcome: 'stuck',
      summary: 'turn cap reached',
    });
    expect(s.status).toBe('closed');
    expect(s.outcome).toBe('stuck');
    expect(s.summary).toBe('turn cap reached');
    expect(s.closedAt).not.toBeNull();
  });

  it('ignores closures for unknown or other subchats', () => {
    const out = applySubchatClosed([subchat('sc-1', 1)], {
      subchatId: 'sc-9',
      outcome: 'done',
      summary: 'n/a',
    });
    expect(out[0].status).toBe('open');
    expect(out[0].outcome).toBeNull();
  });
});

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
  ownerAgentId: 'a-jack',
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

  it('dedupes duplicates inside the incoming batch itself', () => {
    const merged = mergeMessages(
      [],
      [msg('1', null), msg('1', null), msg('2', null)],
    );
    expect(merged.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('tie-breaks equal timestamps by id to match REST replay order', () => {
    const a = { ...msg('b', null), createdAt: 5 };
    const b = { ...msg('a', null), createdAt: 5 };
    const merged = mergeMessages([], [a, b]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

import type { DisclosureNotice, Message, Subchat } from './types';

export interface PartitionedMessages {
  main: Message[];
  bySubchat: Map<string, Message[]>;
}

// Main thread = subchatId null; A2A traffic grouped per subchat. The two
// never mix in one thread (CONTRACTS §3 / UI-03/04).
export function partitionMessages(messages: Message[]): PartitionedMessages {
  const main: Message[] = [];
  const bySubchat = new Map<string, Message[]>();
  for (const m of messages) {
    if (m.subchatId === null) {
      main.push(m);
    } else {
      const list = bySubchat.get(m.subchatId) ?? [];
      list.push(m);
      bySubchat.set(m.subchatId, list);
    }
  }
  return { main, bySubchat };
}

// Dedupe by id — live socket echoes can overlap a REST history reload,
// and a replay batch can repeat itself. Equal timestamps tie-break by id
// so order matches REST replay exactly.
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const seen = new Set(existing.map((m) => m.id));
  const merged = [...existing];
  for (const m of incoming) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    merged.push(m);
  }
  return merged.sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

export interface RoutedDisclosures {
  /** null-subchatId notices → owner system line on the main thread */
  main: DisclosureNotice[];
  /** notices addressed to a specific subchat pane */
  bySubchat: Map<string, DisclosureNotice[]>;
}

// Each notice lands in its explicit conversation (taskId + subchatId),
// never whichever pane happens to be active (UI-06). Notices for other
// tasks are ignored; IDs dedupe live delivery against history replay.
export function routeDisclosures(
  notices: DisclosureNotice[],
  taskId: string,
): RoutedDisclosures {
  const seen = new Set<string>();
  const main: DisclosureNotice[] = [];
  const bySubchat = new Map<string, DisclosureNotice[]>();
  for (const n of notices) {
    if (n.taskId !== taskId || seen.has(n.id)) continue;
    seen.add(n.id);
    if (n.subchatId === null) {
      main.push(n);
    } else {
      const list = bySubchat.get(n.subchatId) ?? [];
      list.push(n);
      bySubchat.set(n.subchatId, list);
    }
  }
  return { main, bySubchat };
}

// Merge a history-replay subchat list into live state: replayed entries
// replace known ones (they're authoritative) and unknown ones append.
export function mergeSubchats(existing: Subchat[], incoming: Subchat[]): Subchat[] {
  const liveById = new Map(existing.map((s) => [s.id, s]));
  // A stale replay must never downgrade a live 'closed' back to 'open' —
  // live lifecycle state wins over an older snapshot.
  const merged = incoming.map((s) => {
    const live = liveById.get(s.id);
    return live?.status === 'closed' && s.status !== 'closed' ? live : s;
  });
  const seen = new Set(incoming.map((s) => s.id));
  const kept = existing.filter((s) => !seen.has(s.id));
  return [...kept, ...merged].sort((a, b) => a.createdAt - b.createdAt);
}

// subchat:closed writes the closure back onto the entity — the pane reads
// outcome/summary from the Subchat itself, not a side channel (UI-05).
export function applySubchatClosed(
  subchats: Subchat[],
  closure: { subchatId: string; outcome: 'done' | 'stuck'; summary: string },
): Subchat[] {
  return subchats.map((s) =>
    s.id === closure.subchatId
      ? {
          ...s,
          status: 'closed',
          outcome: closure.outcome,
          summary: closure.summary,
          closedAt: s.closedAt ?? Date.now(),
        }
      : s,
  );
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

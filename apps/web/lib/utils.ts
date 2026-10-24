import type { DisclosureNotice, Message } from './types';

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

// Dedupe by id — live socket echoes can overlap a REST history reload.
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const seen = new Set(existing.map((m) => m.id));
  const merged = [...existing];
  for (const m of incoming) {
    if (!seen.has(m.id)) merged.push(m);
  }
  return merged.sort((a, b) => a.createdAt - b.createdAt);
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

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

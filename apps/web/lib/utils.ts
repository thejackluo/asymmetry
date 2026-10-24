import type { Message } from './types';

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

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

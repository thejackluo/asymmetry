import type {
  Disclosure,
  Goal,
  ID,
  InfoScope,
  MemoryEngine,
  MemoryItem,
} from '@asymmetry/shared';

export interface FakeMemoryOptions {
  items?: MemoryItem[];
  itemsByOwner?: Record<ID, MemoryItem[]>;
  withheldCount?: number;
  withheldCountByOwner?: Record<ID, number>;
  ingestError?: Error;
  extractGoalsError?: Error;
  queryMemoryError?: Error;
}

export interface FakeMemoryCalls {
  ingest: Array<{ userId: ID; text: string; source: 'chat' | 'seed' }>;
  extractGoals: Array<{ userId: ID; taskId: ID; text: string }>;
  queryMemory: Array<{ ownerUserId: ID; requesterUserId: ID; scope: InfoScope }>;
}

export function createFakeMemory(options: FakeMemoryOptions = {}): {
  memory: MemoryEngine;
  calls: FakeMemoryCalls;
} {
  const calls: FakeMemoryCalls = { ingest: [], extractGoals: [], queryMemory: [] };
  const memory: MemoryEngine = {
    async ingest(userId, text, source) {
      calls.ingest.push({ userId, text, source });
      if (options.ingestError) {
        throw options.ingestError;
      }
      return [];
    },
    async extractGoals(userId, taskId, text) {
      calls.extractGoals.push({ userId, taskId, text });
      if (options.extractGoalsError) {
        throw options.extractGoalsError;
      }
      return [];
    },
    async queryMemory(ownerUserId, requesterUserId, scope) {
      calls.queryMemory.push({ ownerUserId, requesterUserId, scope });
      if (options.queryMemoryError) {
        throw options.queryMemoryError;
      }
      const items = options.itemsByOwner?.[ownerUserId] ?? options.items ?? [];
      const withheldCount = options.withheldCountByOwner?.[ownerUserId] ?? options.withheldCount ?? 0;
      const disclosure: Disclosure = {
        id: 'fixture-disclosure',
        ownerUserId,
        requesterAgentId: 'fixture-requester',
        scope,
        released: items.map(({ content }) => content),
        withheldCount,
        decision: 'released',
        createdAt: 1,
      };
      return {
        items,
        withheldCount,
        disclosure,
      };
    },
  };
  return { memory, calls };
}

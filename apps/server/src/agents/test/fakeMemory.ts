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
  withheldCount?: number;
  ingestError?: Error;
  extractGoalsError?: Error;
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
      const disclosure: Disclosure = {
        id: 'fixture-disclosure',
        ownerUserId,
        requesterAgentId: 'fixture-requester',
        scope,
        released: options.items?.map(({ content }) => content) ?? [],
        withheldCount: options.withheldCount ?? 0,
        decision: 'released',
        createdAt: 1,
      };
      return {
        items: options.items ?? [],
        withheldCount: options.withheldCount ?? 0,
        disclosure,
      };
    },
  };
  return { memory, calls };
}

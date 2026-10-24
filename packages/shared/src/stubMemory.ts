import type {
  Disclosure,
  Goal,
  ID,
  InfoScope,
  MemoryEngine,
  MemoryItem,
} from './index.js';

const STUB_OWNER_FACTS: Omit<MemoryItem, 'userId'>[] = [
  {
    id: 'stub-fact-price',
    content: 'Room available for $950/mo',
    classification: 'public',
    fieldTags: ['price'],
    source: 'seed',
    createdAt: 0,
  },
  {
    id: 'stub-fact-private',
    content: 'Private fact withheld from peers',
    classification: 'private',
    fieldTags: ['address'],
    source: 'seed',
    createdAt: 0,
  },
];

const stubId = (parts: string[]): string => {
  let hash = 0;
  const input = parts.join('|');
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return `stub-${hash.toString(16)}`;
};

const assertStubEnv = (): void => {
  const env = process.env.NODE_ENV;
  if (env !== 'development' && env !== 'test') {
    throw new Error('stubMemoryEngine is only available in development/test mode');
  }
};

export function stubMemoryEngine(): MemoryEngine {
  assertStubEnv();
  return {
    async ingest(userId: ID, text: string, source: 'chat' | 'seed'): Promise<MemoryItem[]> {
      assertStubEnv();
      return [
        {
          id: stubId(['ingest', userId, source, text]),
          userId,
          content: text,
          classification: 'private',
          fieldTags: [],
          source,
          createdAt: 0,
        },
      ];
    },
    async queryMemory(
      ownerUserId: ID,
      requesterUserId: ID,
      scope: InfoScope,
    ): Promise<{ items: MemoryItem[]; withheldCount: number; disclosure: Disclosure }> {
      assertStubEnv();
      const facts = STUB_OWNER_FACTS.map((f) => ({ ...f, userId: ownerUserId }));
      const items = scope.fields.includes('price')
        ? facts.filter((f) => f.id === 'stub-fact-price')
        : [];
      const withheldCount = facts.length - items.length;
      const disclosure: Disclosure = {
        id: stubId(['disclosure', ownerUserId, requesterUserId, scope.taskId, scope.fields.join(',')]),
        ownerUserId,
        requesterAgentId: requesterUserId,
        scope,
        released: items.map((i) => i.id),
        withheldCount,
        decision: items.length === 0 ? 'denied' : withheldCount > 0 ? 'partial' : 'released',
        createdAt: 0,
      };
      return { items, withheldCount, disclosure };
    },
    async extractGoals(userId: ID, taskId: ID, text: string): Promise<Goal[]> {
      assertStubEnv();
      return [
        {
          id: stubId(['goal', userId, taskId, text]),
          userId,
          taskId,
          description: text,
          status: 'open',
          createdAt: 0,
        },
      ];
    },
  };
}

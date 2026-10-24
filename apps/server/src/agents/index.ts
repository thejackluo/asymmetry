import type BetterSqlite3 from 'better-sqlite3';
import type { MemoryEngine } from '@asymmetry/shared';
import type { Server } from 'socket.io';
import { EVENTS } from './events.js';
import type { LLMClient } from './llm.js';
import { openAILLM } from './llm.js';
import { createAgentRuntime } from './runtime.js';

type Database = BetterSqlite3.Database;

export { createAgentRuntime } from './runtime.js';

export function registerAgents(io: Server, db: Database, memory: MemoryEngine): void {
  let client: LLMClient | undefined;
  const lazyLLM: LLMClient = {
    chat(messages, tools, opts) {
      client ??= openAILLM();
      return client.chat(messages, tools, opts);
    },
  };
  const runtime = createAgentRuntime({ io, db, memory, llm: lazyLLM });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      return;
    }
    socket.join(`user:${userId}`);
    socket.on(EVENTS.TASK_CREATE, (payload, ack) => {
      void runtime.handleTaskCreate(socket, payload, ack);
    });
    socket.on(EVENTS.CHAT_SEND, (payload, ack) => {
      void runtime.handleChatSend(socket, payload, ack);
    });
  });
}

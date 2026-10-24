import type { MemoryEngine } from '@asymmetry/shared';
import type { Server } from 'socket.io';
import type { Database } from '../db.js';
import { EVENTS } from './events.js';
import { logAgentError } from './errors.js';
import type { LLMClient } from './llm.js';
import { openAILLM } from './llm.js';
import { createAgentRuntime } from './runtime.js';

export { createAgentRuntime } from './runtime.js';

function withAckBoundary<T>(
  run: (ack?: (result: T) => void) => Promise<void>,
  ack: ((result: T) => void) | undefined,
  context: string,
): void {
  let ackSent = false;
  const onceAck = ack ? (result: T) => {
    if (ackSent) {
      return;
    }
    ackSent = true;
    ack(result);
  } : undefined;
  const failed = (error: unknown) => {
    logAgentError(context, error);
    if (!ackSent) {
      onceAck?.({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      } as T);
    }
  };
  try {
    void run(onceAck).catch(failed);
  } catch (error) {
    failed(error);
  }
}

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
    socket.on(EVENTS.TASK_CREATE, (payload, ack) => {
      withAckBoundary((safeAck) => runtime.handleTaskCreate(socket, payload, safeAck), ack, 'task:create');
    });
    socket.on(EVENTS.CHAT_SEND, (payload, ack) => {
      withAckBoundary((safeAck) => runtime.handleChatSend(socket, payload, safeAck), ack, 'chat:send');
    });
  });
}

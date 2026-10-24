'use client';

import { io, type Socket } from 'socket.io-client';
import { isMockMode, MockSocketClient } from './mock';
import { API_URL } from './api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler = (payload: any) => void;

// Thin wrapper so every page works against the backend or the mock with zero
// code changes — the demo can run end-to-end before D1/D2 land.
export interface SocketClient {
  connect(token: string): void;
  on<T>(event: string, cb: (payload: T) => void): () => void;
  emit(event: string, payload: unknown): void;
  disconnect(): void;
}

export class RealSocketClient implements SocketClient {
  private socket: Socket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();

  connect(token: string): void {
    if (this.socket) return;
    this.socket = io(API_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    for (const [event, cbs] of this.handlers) {
      for (const cb of cbs) this.socket.on(event, cb);
    }
  }

  on<T>(event: string, cb: (payload: T) => void): () => void {
    const handler = cb as EventHandler;
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    this.socket?.on(event, handler);
    return () => {
      set.delete(handler);
      this.socket?.off(event, handler);
    };
  }

  emit(event: string, payload: unknown): void {
    this.socket?.emit(event, payload);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}

let client: SocketClient | null = null;

export function getSocket(): SocketClient {
  if (!client) {
    client = isMockMode() ? new MockSocketClient() : new RealSocketClient();
  }
  return client;
}

export function resetSocket(): void {
  client?.disconnect();
  client = null;
}

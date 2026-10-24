'use client';

import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { isMockMode, MockSocketClient } from './mock';
import { API_URL } from './api';
import type { CommandResult } from '@asymmetry/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler = (payload: any) => void;

// CONTRACTS §3: client events take an optional ack receiving CommandResult.
export type Ack = (result: CommandResult<unknown>) => void;

// Thin wrapper so every page works against the backend or the mock with zero
// code changes — the demo can run end-to-end before D1/D2 land.
export interface SocketClient {
  connect(token: string): void;
  on<T>(event: string, cb: (payload: T) => void): () => void;
  emit(event: string, payload: unknown, ack?: Ack): void;
  connected(): boolean;
  disconnect(): void;
}

export class RealSocketClient implements SocketClient {
  private socket: Socket | null = null;
  private token: string | null = null;
  private handlers = new Map<string, Set<EventHandler>>();

  connect(token: string): void {
    if (this.socket && this.token === token) return;
    // Identity changed — drop the old connection wholesale so no stale
    // listeners, events, or buffered commands survive the switch.
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.token = token;
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

  emit(event: string, payload: unknown, ack?: Ack): void {
    // Never enqueue while disconnected — socket.io would buffer and replay
    // on reconnect, duplicating commands. Refuse immediately with a safe
    // failure ack so callers can surface the rejection.
    if (!this.socket?.connected) {
      ack?.({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Not connected' },
      });
      return;
    }
    if (ack) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.socket.emit(event, payload, ack as any);
    } else {
      this.socket.emit(event, payload);
    }
  }

  connected(): boolean {
    return this.socket?.connected ?? false;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.token = null;
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

// Live connection snapshot: replays the current socket state on subscribe
// (a connected singleton never re-emits 'connect', so event-only tracking
// leaves routed-in pages stuck on 'reconnecting').
export function useSocketConnected(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const socket = getSocket();
      const offConnect = socket.on('connect', cb);
      const offDisconnect = socket.on('disconnect', cb);
      return () => {
        offConnect();
        offDisconnect();
      };
    },
    () => getSocket().connected(),
    () => false,
  );
}

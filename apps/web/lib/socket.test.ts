import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake socket.io-client so RealSocketClient is exercised without a server.
const sockets: FakeSocket[] = [];
class FakeSocket {
  connected = false;
  emitted: string[] = [];
  handlers = new Map<string, Set<(p: unknown) => void>>();
  disconnect = vi.fn(() => {
    this.connected = false;
  });
  on(event: string, cb: (p: unknown) => void) {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(cb);
  }
  off(event: string, cb: (p: unknown) => void) {
    this.handlers.get(event)?.delete(cb);
  }
  emit(event: string, _payload: unknown, ack?: (r: unknown) => void) {
    this.emitted.push(event);
    ack?.({ ok: true, data: null });
  }
}

vi.mock('socket.io-client', () => ({
  io: () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  },
}));

import { RealSocketClient } from './socket';

beforeEach(() => {
  sockets.length = 0;
});

describe('RealSocketClient offline refusal', () => {
  it('refuses emits while disconnected — no enqueue, safe failure ack', () => {
    const c = new RealSocketClient();
    c.connect('tok-a');
    const ack = vi.fn();
    c.emit('chat:send', { body: 'hi' }, ack);
    expect(sockets[0].emitted).toEqual([]);
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
  });
});

describe('RealSocketClient identity lifecycle', () => {
  it('drops the old connection when the token (identity) changes', () => {
    const c = new RealSocketClient();
    c.connect('tok-a');
    const first = sockets[0];
    first.connected = true;
    c.connect('tok-b');
    expect(first.disconnect).toHaveBeenCalled();
    expect(sockets).toHaveLength(2);
  });

  it('reuses the connection when the token is unchanged', () => {
    const c = new RealSocketClient();
    c.connect('tok-a');
    c.connect('tok-a');
    expect(sockets).toHaveLength(1);
  });
});

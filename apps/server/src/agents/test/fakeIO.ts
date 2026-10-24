import type { Server } from 'socket.io';

export interface CapturedEmit {
  room: string;
  event: string;
  payload: unknown;
}

export function createFakeIO(
  onEmit?: (emission: CapturedEmit) => void,
): { io: Server; emissions: CapturedEmit[] } {
  const emissions: CapturedEmit[] = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          const emission = { room, event, payload };
          emissions.push(emission);
          onEmit?.(emission);
        },
      };
    },
  } as unknown as Server;
  return { io, emissions };
}

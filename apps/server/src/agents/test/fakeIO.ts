import type { Server } from 'socket.io';

export interface CapturedEmit {
  room: string;
  event: string;
  payload: unknown;
}

export function createFakeIO(): { io: Server; emissions: CapturedEmit[] } {
  const emissions: CapturedEmit[] = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emissions.push({ room, event, payload });
        },
      };
    },
  } as unknown as Server;
  return { io, emissions };
}

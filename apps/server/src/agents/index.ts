import type { Server } from 'socket.io';
import type { MemoryEngine } from '@asymmetry/shared';
import type { Database } from '../db.js';

export function registerAgents(_io: Server, _db: Database, _memory: MemoryEngine): void {}

export const SUBCHAT_MSG_CAP = 12;
export const TOOL_ITER_CAP = 8;
export const MODEL_TIMEOUT_MS = 30_000;
export const TASK_MODEL_CALL_CAP = 30;
export const PEER_CAP = 4;
export const CLARIFY_CAP = 2;

export class Budget {
  private modelCalls = 0;
  private readonly subchatTurns = new Map<string, number>();
  readonly peers = new Set<string>();

  constructor(readonly taskId: string) {}

  reserveModelCall(): boolean {
    if (this.modelCalls >= TASK_MODEL_CALL_CAP) {
      return false;
    }
    this.modelCalls += 1;
    return true;
  }

  reserveSubchatTurn(subchatId: string): boolean {
    const current = this.subchatTurns.get(subchatId) ?? 0;
    if (current >= SUBCHAT_MSG_CAP) {
      return false;
    }
    this.subchatTurns.set(subchatId, current + 1);
    return true;
  }

  addPeer(id: string): boolean {
    if (this.peers.has(id)) {
      return true;
    }
    if (this.peers.size >= PEER_CAP) {
      return false;
    }
    this.peers.add(id);
    return true;
  }
}

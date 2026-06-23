/**
 * SSE (Server-Sent Events) connection manager.
 *
 * Stores one send-function per active client connection, keyed by userId.
 * A single user can have multiple concurrent connections (e.g. multiple tabs).
 *
 * Stored on globalThis so the singleton survives Next.js hot-module-reload
 * without losing live connections.
 *
 * All methods are synchronous and never throw — SSE delivery is best-effort.
 */

type SendFn = (data: string) => void;

class SSEManager {
  private readonly conns = new Map<string, Set<SendFn>>();

  addConnection(userId: string, send: SendFn): void {
    let s = this.conns.get(userId);
    if (!s) { s = new Set(); this.conns.set(userId, s); }
    s.add(send);
  }

  removeConnection(userId: string, send: SendFn): void {
    const s = this.conns.get(userId);
    if (!s) return;
    s.delete(send);
    if (s.size === 0) this.conns.delete(userId);
  }

  broadcastToUser(userId: string, event: object): void {
    const s = this.conns.get(userId);
    if (!s || s.size === 0) return;
    const msg = `data: ${JSON.stringify(event)}\n\n`;
    for (const send of s) {
      try { send(msg); } catch { /* dead connection — will be cleaned up on next write */ }
    }
  }

  broadcastToAll(event: object): void {
    const msg = `data: ${JSON.stringify(event)}\n\n`;
    for (const s of this.conns.values()) {
      for (const send of s) {
        try { send(msg); } catch { /* ignore */ }
      }
    }
  }

  get activeConnections(): number {
    let n = 0;
    for (const s of this.conns.values()) n += s.size;
    return n;
  }
}

const g = globalThis as unknown as { __hermesSSEManager?: SSEManager };
g.__hermesSSEManager ??= new SSEManager();

export function getSseManager(): SSEManager {
  return g.__hermesSSEManager!;
}

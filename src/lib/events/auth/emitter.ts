import { EventEmitter } from "events";
import type { AuthEvent, AuthEventType } from "./types";

class AuthEventEmitter extends EventEmitter {
  dispatch<T extends AuthEvent>(event: T): boolean {
    return super.emit(event.type, event);
  }

  on<T extends AuthEvent>(eventType: T["type"], listener: (event: T) => void): this {
    return super.on(eventType, listener as (arg: unknown) => void);
  }

  off<T extends AuthEvent>(eventType: T["type"], listener: (event: T) => void): this {
    return super.off(eventType, listener as (arg: unknown) => void);
  }
}

// Stored on globalThis so the singleton survives Next.js hot-module-replacement
// without accumulating duplicate emitters.
const g = globalThis as unknown as { __hermesAuthEmitter?: AuthEventEmitter };
if (!g.__hermesAuthEmitter) {
  const emitter = new AuthEventEmitter();
  emitter.setMaxListeners(20);
  g.__hermesAuthEmitter = emitter;
}

export const authEmitter: AuthEventEmitter = g.__hermesAuthEmitter;

// Re-export for convenience
export type { AuthEvent, AuthEventType };

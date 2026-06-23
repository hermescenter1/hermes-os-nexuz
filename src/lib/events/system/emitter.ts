import { EventEmitter } from "events";
import type { SystemEvent, SystemEventType } from "./types";

class SystemEventEmitter extends EventEmitter {
  dispatch<T extends SystemEvent>(event: T): boolean {
    return super.emit(event.type, event);
  }

  on<T extends SystemEvent>(eventType: T["type"], listener: (event: T) => void): this {
    return super.on(eventType, listener as (arg: unknown) => void);
  }

  off<T extends SystemEvent>(eventType: T["type"], listener: (event: T) => void): this {
    return super.off(eventType, listener as (arg: unknown) => void);
  }
}

// Stored on globalThis to survive Next.js hot-module-replacement
const g = globalThis as unknown as { __hermesSystemEmitter?: SystemEventEmitter };
if (!g.__hermesSystemEmitter) {
  const emitter = new SystemEventEmitter();
  emitter.setMaxListeners(20);
  g.__hermesSystemEmitter = emitter;
}

export const systemEmitter: SystemEventEmitter = g.__hermesSystemEmitter;

export type { SystemEvent, SystemEventType };

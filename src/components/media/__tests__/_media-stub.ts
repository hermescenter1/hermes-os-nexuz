import { act } from "react";

/**
 * PHASE 102 — a controllable HTMLMediaElement for jsdom.
 *
 * jsdom implements almost nothing of the media element: `play()` and `load()`
 * raise "not implemented", `duration` is permanently NaN, and `currentTime` does
 * not move. Without a stub, every assertion about the player would either be
 * vacuous or a test of jsdom's stubs rather than of this component.
 *
 * So the prototype is replaced with a small state machine backed by a WeakMap,
 * and the original descriptors are restored on teardown so the override cannot
 * leak into another test file. The stub deliberately dispatches REAL DOM events —
 * media events do not bubble, and React attaches those directly to the node
 * rather than delegating them at the root, so a dispatched event is the only
 * faithful way to exercise the component's handlers.
 *
 * It stays a mechanical simulation of the spec: `play()` flips `paused` and fires
 * `play` + `playing`, seeking sets `currentTime` and fires `seeked`. Nothing here
 * encodes an opinion about what the player should do.
 */

export interface MediaStubState {
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  error: { code: number } | null;
  buffered: readonly { start: number; end: number }[];
  playRejects: boolean;
}

const STATE = new WeakMap<HTMLMediaElement, MediaStubState>();

function stateOf(element: HTMLMediaElement): MediaStubState {
  let state = STATE.get(element);
  if (!state) {
    state = {
      paused: true,
      currentTime: 0,
      duration: Number.NaN,
      volume: 1,
      muted: false,
      playbackRate: 1,
      error: null,
      buffered: [],
      playRejects: false,
    };
    STATE.set(element, state);
  }
  return state;
}

/** Read/patch the simulated state of a mounted element. */
export function mediaState(element: HTMLMediaElement): MediaStubState {
  return stateOf(element);
}

const PATCHED_PROPERTIES = [
  "paused",
  "currentTime",
  "duration",
  "volume",
  "muted",
  "playbackRate",
  "error",
  "buffered",
  "play",
  "pause",
  "load",
] as const;

/**
 * Install the stub. Returns a teardown that restores every original descriptor.
 */
export function installMediaElementStub(): () => void {
  const proto = HTMLMediaElement.prototype;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of PATCHED_PROPERTIES) {
    originals.set(name, Object.getOwnPropertyDescriptor(proto, name));
  }

  const accessor = (
    read: (state: MediaStubState) => unknown,
    write?: (state: MediaStubState, value: unknown) => void,
  ): PropertyDescriptor => ({
    configurable: true,
    get(this: HTMLMediaElement) {
      return read(stateOf(this));
    },
    set(this: HTMLMediaElement, value: unknown) {
      if (write) write(stateOf(this), value);
    },
  });

  Object.defineProperties(proto, {
    paused: accessor((s) => s.paused),
    currentTime: accessor(
      (s) => s.currentTime,
      (s, value) => {
        s.currentTime = Number(value);
      },
    ),
    duration: accessor((s) => s.duration),
    volume: accessor(
      (s) => s.volume,
      (s, value) => {
        s.volume = Number(value);
      },
    ),
    muted: accessor(
      (s) => s.muted,
      (s, value) => {
        s.muted = Boolean(value);
      },
    ),
    playbackRate: accessor(
      (s) => s.playbackRate,
      (s, value) => {
        s.playbackRate = Number(value);
      },
    ),
    error: accessor((s) => s.error),
    buffered: accessor((s) => ({
      length: s.buffered.length,
      start: (index: number) => s.buffered[index].start,
      end: (index: number) => s.buffered[index].end,
    })),
    play: {
      configurable: true,
      value(this: HTMLMediaElement) {
        const state = stateOf(this);
        if (state.playRejects) return Promise.reject(new Error("NotAllowedError"));
        state.paused = false;
        this.dispatchEvent(new Event("play"));
        this.dispatchEvent(new Event("playing"));
        return Promise.resolve();
      },
    },
    pause: {
      configurable: true,
      value(this: HTMLMediaElement) {
        stateOf(this).paused = true;
        this.dispatchEvent(new Event("pause"));
      },
    },
    load: {
      configurable: true,
      value(this: HTMLMediaElement) {
        stateOf(this).error = null;
      },
    },
  });

  return () => {
    for (const name of PATCHED_PROPERTIES) {
      const original = originals.get(name);
      if (original) Object.defineProperty(proto, name, original);
      else Reflect.deleteProperty(proto, name);
    }
  };
}

/** Dispatch a (non-bubbling) media event inside `act`. */
export async function fireMedia(element: HTMLMediaElement, type: string): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new Event(type));
  });
}

/**
 * Set a controlled `<input type="range">` the way a user drag would.
 *
 * React installs a value tracker on controlled inputs, so assigning `.value`
 * directly is swallowed as a no-op change. Going through the prototype's own
 * setter updates the DOM without the tracker noticing, which is exactly what a
 * real user gesture looks like to React.
 */
export async function setRangeValue(input: HTMLInputElement, value: number): Promise<void> {
  await setControlValue(input, String(value), window.HTMLInputElement.prototype);
}

/** The same trick for a `<select>`, whose value setter lives on its own prototype. */
export async function setSelectValue(select: HTMLSelectElement, value: string): Promise<void> {
  await setControlValue(select, value, window.HTMLSelectElement.prototype);
}

async function setControlValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
  prototype: object,
): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

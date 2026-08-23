// @vitest-environment jsdom
/**
 * PHASE 107 STAGE 6-A — regression cover for the resource state machine.
 *
 * The Stage 5 evidence recorded 26 STUCK_LOADING cells: a spinner that never
 * resolved because the only thing that cleared it was a `.finally` the failing
 * path never reached. These tests assert the two properties that make that
 * impossible — loading always terminates, and a stale response can never win.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { mount, click } from "@/components/ds/__tests__/_render";
import { useResource } from "../use-resource";
import { ResourceRequestError, type ResourceFailureCode } from "../resource-request";

afterEach(() => { vi.restoreAllMocks(); });

/** A promise whose settlement this test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Let queued microtasks and the resulting React work run. */
const settle = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

function Probe<T>({ load, enabled = true, isEmpty }: {
  load: (signal: AbortSignal) => Promise<T>;
  enabled?: boolean;
  isEmpty?: (v: T) => boolean;
}) {
  const state = useResource<T>(load, [], { enabled, isEmpty });
  return (
    <div>
      <span data-probe="status">{state.status}</span>
      <span data-probe="failure">{state.failure ?? "-"}</span>
      <span data-probe="data">{JSON.stringify(state.data)}</span>
      <button data-probe="retry" onClick={state.retry}>retry</button>
    </div>
  );
}

const read = (c: HTMLElement, key: string) =>
  c.querySelector(`[data-probe="${key}"]`)?.textContent ?? "";

describe("useResource — reaching a terminal state", () => {
  it("starts LOADING and becomes SUCCESS with data", async () => {
    const d = deferred<string[]>();
    const { container, unmount } = await mount(<Probe load={() => d.promise} />);
    expect(read(container, "status")).toBe("LOADING");

    d.resolve(["row"]);
    await settle();
    expect(read(container, "status")).toBe("SUCCESS");
    expect(read(container, "data")).toBe(JSON.stringify(["row"]));
    await unmount();
  });

  it("treats a genuinely empty payload as EMPTY, never as an error", async () => {
    const d = deferred<string[]>();
    const { container, unmount } = await mount(<Probe load={() => d.promise} />);
    d.resolve([]);
    await settle();
    expect(read(container, "status")).toBe("EMPTY");
    expect(read(container, "failure")).toBe("-");
    await unmount();
  });

  it.each(["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "INVALID", "UNAVAILABLE", "FAILED"] as const)(
    "surfaces %s as ERROR with the code intact, never as EMPTY",
    async (code: ResourceFailureCode) => {
      const d = deferred<string[]>();
      const { container, unmount } = await mount(<Probe load={() => d.promise} />);
      d.reject(new ResourceRequestError(code, 500));
      await settle();
      // The defect being fixed: all six of these used to render as an empty list.
      expect(read(container, "status")).toBe("ERROR");
      expect(read(container, "failure")).toBe(code);
      expect(read(container, "data")).toBe("null");
      await unmount();
    },
  );

  it("LOADING always terminates, even for an error nobody classified", async () => {
    const d = deferred<string[]>();
    const { container, unmount } = await mount(<Probe load={() => d.promise} />);
    d.reject(new Error("something nobody anticipated"));
    await settle();
    expect(read(container, "status")).toBe("ERROR");
    expect(read(container, "failure")).toBe("FAILED");
    await unmount();
  });

  it("stays IDLE — not LOADING — when the request is not enabled", async () => {
    const load = vi.fn(async () => ["row"]);
    const { container, unmount } = await mount(<Probe load={load} enabled={false} />);
    await settle();
    expect(read(container, "status")).toBe("IDLE");
    expect(load).not.toHaveBeenCalled();
    await unmount();
  });

  it("honours a caller's own definition of empty", async () => {
    const d = deferred<{ items: string[] }>();
    const { container, unmount } = await mount(
      <Probe load={() => d.promise} isEmpty={(v) => v.items.length === 0} />,
    );
    d.resolve({ items: [] });
    await settle();
    expect(read(container, "status")).toBe("EMPTY");
    await unmount();
  });
});

describe("useResource — retry", () => {
  it("re-runs the request and can recover from a transient failure", async () => {
    const attempts: Array<ReturnType<typeof deferred<string[]>>> = [];
    const load = vi.fn(() => { const d = deferred<string[]>(); attempts.push(d); return d.promise; });

    const { container, unmount } = await mount(<Probe load={load} />);
    attempts[0].reject(new ResourceRequestError("UNAVAILABLE", 503));
    await settle();
    expect(read(container, "status")).toBe("ERROR");

    await click(container.querySelector("[data-probe='retry']"));
    expect(load).toHaveBeenCalledTimes(2);
    expect(read(container, "status")).toBe("LOADING");
    // The previous failure must be cleared while the retry is in flight.
    expect(read(container, "failure")).toBe("-");

    attempts[1].resolve(["row"]);
    await settle();
    expect(read(container, "status")).toBe("SUCCESS");
    await unmount();
  });
});

describe("useResource — stale and abandoned responses", () => {
  function IdProbe({ id, load }: { id: string; load: (id: string, signal: AbortSignal) => Promise<string> }) {
    const state = useResource((signal) => load(id, signal), [id]);
    return <span data-probe="data">{state.data ?? "-"}</span>;
  }

  it("a slow response for an old dependency cannot overwrite a newer one", async () => {
    const pending = new Map<string, ReturnType<typeof deferred<string>>>();
    const signals = new Map<string, AbortSignal>();
    const load = (id: string, signal: AbortSignal) => {
      const d = deferred<string>();
      pending.set(id, d); signals.set(id, signal);
      return d.promise;
    };

    const { container, rerender, unmount } = await mount(<IdProbe id="a" load={load} />);
    await rerender(<IdProbe id="b" load={load} />);

    // The request for "a" is abandoned the moment the id changes.
    expect(signals.get("a")!.aborted).toBe(true);
    expect(signals.get("b")!.aborted).toBe(false);

    pending.get("b")!.resolve("record-b");
    await settle();
    expect(read(container, "data")).toBe("record-b");

    // "a" now answers late. It must be discarded, not painted over "b".
    pending.get("a")!.resolve("record-a");
    await settle();
    expect(read(container, "data")).toBe("record-b");
    await unmount();
  });

  it("aborts on unmount and settles silently afterwards", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deferred<string[]>();
    let captured: AbortSignal | undefined;
    const { unmount } = await mount(
      <Probe load={(signal) => { captured = signal; return d.promise; }} />,
    );

    await unmount();
    expect(captured?.aborted).toBe(true);

    // A response arriving after the screen is gone must not attempt to render.
    d.resolve(["row"]);
    await settle();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("ignores an abort rejection instead of reporting it as a failure", async () => {
    const d = deferred<string[]>();
    const { container, unmount } = await mount(<Probe load={() => d.promise} />);
    d.reject(new DOMException("aborted", "AbortError"));
    await settle();
    // The user cancelled by navigating; that is not an error to show them.
    expect(read(container, "failure")).toBe("-");
    await unmount();
  });
});

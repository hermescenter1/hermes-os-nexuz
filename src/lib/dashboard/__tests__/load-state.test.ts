/**
 * PHASE 104-I.D — GATE B.1 F01.
 *
 * These tests exist to demonstrate the ORIGINAL defect by execution, not by
 * argument, and then to pin the contract that replaced it.
 *
 * The claim being demonstrated: `fetch(url).then(r => r.json())` does NOT reject
 * merely because the HTTP status is 401 or 403. If the error body is valid JSON —
 * and this API's error bodies are — `.json()` resolves, `.catch()` never runs,
 * and the error envelope is stored as though it were the payload. The first
 * render that reads a nested field off it throws, which is how five routes
 * collapsed into the global error boundary.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadJson, type LoadState } from "../load-state";

/** The shape one of the real routes consumes. */
interface KPIResponse {
  benchmarkId: string;
  computedAt: string;
  stale: boolean;
  periodLabel: string;
  normalizationNote: string;
  sites: { id: string; dataStatus: string }[];
}

function isKPIResponse(v: unknown): v is KPIResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.benchmarkId === "string"
    && typeof o.computedAt === "string"
    && typeof o.stale === "boolean"
    && typeof o.periodLabel === "string"
    && typeof o.normalizationNote === "string"
    && Array.isArray(o.sites);
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const validPayload: KPIResponse = {
  benchmarkId: "b-1",
  computedAt: "2026-01-01T00:00:00.000Z",
  stale: false,
  periodLabel: "Q1",
  normalizationNote: "per 1000 h",
  sites: [{ id: "s-1", dataStatus: "ok" }],
};

afterEach(() => { vi.restoreAllMocks(); });

describe("the original defect, demonstrated by execution", () => {
  it("a 401 with a valid JSON body does NOT reject, so .catch() never runs", async () => {
    const errorEnvelope = { error: "Authentication required" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, errorEnvelope)));

    // This is the OLD code path, reproduced exactly.
    let catchExecuted = false;
    let captured: unknown = "untouched";
    await fetch("/api/multi-site/kpis")
      .then((r) => {
        if (r.status === 404) return null;
        return r.json();
      })
      .then((d) => { captured = d; })
      .catch(() => { catchExecuted = true; });

    expect(catchExecuted).toBe(false);          // OLD_PATH_CATCH_EXECUTED=NO
    expect(captured).toEqual(errorEnvelope);    // PAYLOAD_SHAPE=ERROR_ENVELOPE
  });

  it("the captured error envelope then throws where the render dereferences it", () => {
    const data = { error: "Authentication required" } as unknown as KPIResponse | null;
    // Verbatim from the old render: the optional chain guards `data` but NOT
    // `sites`, which is why the guard that was already there did not help.
    expect(() => data?.sites.filter((s) => s.dataStatus !== "insufficientData"))
      .toThrowError(TypeError);                 // OLD_RENDER_CRASH=YES
  });

  it("the same is true for a nested object read, as on the knowledge graph", () => {
    const data = { error: "Authentication required" } as unknown as { staleness: { stale: boolean } } | null;
    expect(() => data?.staleness.stale).toThrowError(TypeError);
  });
});

describe("the replacement contract", () => {
  it("2xx + valid populated shape -> READY", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, validPayload)));
    const s = await loadJson("/x", isKPIResponse);
    expect(s.kind).toBe("success");
    if (s.kind === "success") expect(s.data.sites).toHaveLength(1);
  });

  it("2xx + valid EMPTY collection is still a successful read, not a failure", async () => {
    // The helper reports success; the ROUTE decides that an empty collection
    // means EMPTY, because emptiness is a payload-contract question.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { ...validPayload, sites: [] })));
    const s = await loadJson("/x", isKPIResponse);
    expect(s.kind).toBe("success");
    if (s.kind === "success") expect(s.data.sites).toHaveLength(0);
  });

  it("401 -> unauthorized, never empty and never ready", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Authentication required" })));
    const s: LoadState<KPIResponse> = await loadJson("/x", isKPIResponse);
    expect(s.kind).toBe("unauthorized");
    expect(s.kind).not.toBe("empty");
    expect(s.kind).not.toBe("success");
  });

  it("403 -> forbidden", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { error: "Forbidden" })));
    expect((await loadJson("/x", isKPIResponse)).kind).toBe("forbidden");
  });

  it("404 -> notFound", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { error: "Not found" })));
    expect((await loadJson("/x", isKPIResponse)).kind).toBe("notFound");
  });

  it("500 -> requestError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: "boom" })));
    expect((await loadJson("/x", isKPIResponse)).kind).toBe("requestError");
  });

  it("a network failure -> requestError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect((await loadJson("/x", isKPIResponse)).kind).toBe("requestError");
  });

  it("invalid JSON -> invalidResponse, never ready", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<html>gateway timeout</html>", { status: 200 })));
    const s = await loadJson("/x", isKPIResponse);
    expect(s.kind).toBe("invalidResponse");
    expect(s.kind).not.toBe("success");
  });

  it("a 200 whose shape is wrong -> invalidResponse, never empty", async () => {
    // The exact envelope that used to be rendered as data.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { error: "Authentication required" })));
    const s = await loadJson("/x", isKPIResponse);
    expect(s.kind).toBe("invalidResponse");
    expect(s.kind).not.toBe("empty");
  });

  it("a payload missing a required nested collection is invalid, not empty", async () => {
    const withoutSites: Record<string, unknown> = { ...validPayload };
    delete withoutSites.sites;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, withoutSites)));
    expect((await loadJson("/x", isKPIResponse)).kind).toBe("invalidResponse");
  });

  it("a bodyless 204 is classified, not left to an accidental parse failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const s = await loadJson("/x", isKPIResponse);
    // 204 is 2xx with no body: it cannot satisfy the shape, so it is reported as
    // an invalid response rather than being mistaken for data.
    expect(s.kind).toBe("invalidResponse");
    expect(s.kind).not.toBe("success");
  });

  it("an abort propagates so a newer request owns the state", async () => {
    const err = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
    await expect(loadJson("/x", isKPIResponse)).rejects.toThrowError(/aborted/);
  });

  it("status is inspected BEFORE the body is given meaning", async () => {
    // A 401 carrying a perfectly VALID payload shape must still be unauthorized:
    // the shape guard must not be able to rescue a failed status.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, validPayload)));
    expect((await loadJson("/x", isKPIResponse)).kind).toBe("unauthorized");
  });

  describe("the destination is fixed by this module, not by the caller", () => {
    // These two tests turn on the DESTINATION, not the payload, so the guard
    // accepts any JSON object rather than asserting a shape.
    const acceptsAnyObject = (value: unknown): value is Record<string, unknown> =>
      typeof value === "object" && value !== null;

    it("never leaves the origin: off-origin URLs are refused BEFORE fetch is called", async () => {
      const spy = vi.fn();
      vi.stubGlobal("fetch", spy);
      // `//host` and `/\host` LOOK relative but resolve to another host.
      for (const hostile of ["//evil.example/api", "/\\evil.example/api", "https://evil.example/api", "http://evil.example", "api/relative", ""]) {
        const state = await loadJson(hostile, acceptsAnyObject);
        expect(state).toEqual({ kind: "requestError" });
      }
      expect(spy).not.toHaveBeenCalled();
    });

    it("still performs a genuine same-origin path read", async () => {
      const spy = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
      vi.stubGlobal("fetch", spy);
      const state = await loadJson("/api/multi-site/kpis", acceptsAnyObject);
      expect(state).toEqual({ kind: "success", data: { ok: true } });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe("/api/multi-site/kpis");
    });
  });
});

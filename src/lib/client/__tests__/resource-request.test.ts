/**
 * PHASE 107 STAGE 6-A — regression cover for the shared request primitive.
 *
 * Each case here corresponds to a way the previous idiom
 * (`fetch().then(r => r.json()).catch(() => {})`) misled the user. The point of
 * the suite is that an error can never again be delivered to a screen as data
 * or as emptiness.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  requestJson, classifyFailure, isRetryable, ResourceRequestError,
} from "../resource-request";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

/** A Response stand-in with only what the primitive touches. */
const respond = (status: number, body: string, ok?: boolean) => ({
  ok: ok ?? (status >= 200 && status < 300),
  status,
  text: async () => body,
}) as unknown as Response;

const stub = (r: Response | Error) => {
  globalThis.fetch = vi.fn(async () => { if (r instanceof Error) throw r; return r; }) as typeof fetch;
};

const pick = (b: unknown) => (b as { rows?: string[] })?.rows;

describe("status classification", () => {
  it("keeps unauthorized, forbidden and not-found distinct", () => {
    expect(classifyFailure(401)).toBe("UNAUTHENTICATED");
    expect(classifyFailure(403)).toBe("FORBIDDEN");
    expect(classifyFailure(404)).toBe("NOT_FOUND");
    // The three must never collapse into one another.
    expect(new Set([classifyFailure(401), classifyFailure(403), classifyFailure(404)]).size).toBe(3);
  });

  it("maps validation, rate limiting, outage and the rest", () => {
    expect(classifyFailure(400)).toBe("INVALID");
    expect(classifyFailure(422)).toBe("INVALID");
    expect(classifyFailure(429)).toBe("RATE_LIMITED");
    expect(classifyFailure(503)).toBe("UNAVAILABLE");
    expect(classifyFailure(500)).toBe("FAILED");
  });

  it("lets the server's own code override the status", () => {
    // A route may answer 401 while meaning FORBIDDEN; branching on the status
    // alone would tell an authorised user their session had expired.
    expect(classifyFailure(401, "FORBIDDEN")).toBe("FORBIDDEN");
    expect(classifyFailure(200, "NOT_FOUND")).toBe("NOT_FOUND");
  });

  it("marks only plausibly transient failures retryable", () => {
    expect(isRetryable("OFFLINE")).toBe(true);
    expect(isRetryable("UNAVAILABLE")).toBe(true);
    expect(isRetryable("RATE_LIMITED")).toBe(true);
    expect(isRetryable("UNAUTHENTICATED")).toBe(false);
    expect(isRetryable("FORBIDDEN")).toBe(false);
    expect(isRetryable("NOT_FOUND")).toBe(false);
  });
});

describe("requestJson", () => {
  it("returns the selected payload on success", async () => {
    stub(respond(200, JSON.stringify({ rows: ["a", "b"] })));
    await expect(requestJson("/api/x", pick)).resolves.toEqual(["a", "b"]);
  });

  it("returns a legitimately empty collection as data, not as a failure", async () => {
    stub(respond(200, JSON.stringify({ rows: [] })));
    await expect(requestJson("/api/x", pick)).resolves.toEqual([]);
  });

  it.each([
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [422, "INVALID"],
    [500, "FAILED"],
    [503, "UNAVAILABLE"],
  ] as const)("throws a typed failure for HTTP %i", async (status, code) => {
    stub(respond(status, JSON.stringify({ error: "nope" })));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code, status });
  });

  it("NEVER delivers an error body as data — the original defect", async () => {
    // The old code did `r.json()` then `d.rows ?? []`, so this 401 rendered as
    // "you have no records".
    stub(respond(401, JSON.stringify({ error: "Authentication required" })));
    await expect(requestJson("/api/x", pick)).rejects.toBeInstanceOf(ResourceRequestError);
  });

  it("treats an empty body as a failure, not as empty data", async () => {
    stub(respond(200, ""));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code: "FAILED" });
  });

  it("treats malformed JSON as a failure rather than throwing a SyntaxError", async () => {
    stub(respond(200, "<!doctype html><html>gateway error</html>"));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code: "FAILED" });
  });

  it("reports a network rejection as OFFLINE", async () => {
    stub(new TypeError("Failed to fetch"));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code: "OFFLINE", status: 0 });
  });

  it("lets an abort propagate untouched so the caller can ignore it", async () => {
    stub(new DOMException("aborted", "AbortError"));
    await expect(requestJson("/api/x", pick)).rejects.toBeInstanceOf(DOMException);
  });

  it("fails when the envelope lacks the field the screen needs", async () => {
    // A 200 whose shape changed is a broken contract, not an empty screen.
    stub(respond(200, JSON.stringify({ unexpected: true })));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code: "FAILED" });
  });

  it("never surfaces a server-supplied message to the caller", async () => {
    stub(respond(500, JSON.stringify({ message: "Postgres connection string is postgres://u:p@h/db" })));
    await expect(requestJson("/api/x", pick)).rejects.toSatisfy(
      (e: unknown) => !String((e as Error).message).includes("postgres://"),
    );
  });
  /*
   * PHASE 107 STAGE 6-A.2 — the two refusal body shapes.
   *
   * Most routes answer `{ error, code }`. The Media upload family answers
   * `{ ok: false, error: "<CODE>" }`, because its `deny(status, code)` helper
   * has always put the machine-readable code in `error`. Reading only `code`
   * left those 409s with nothing recognised, and a bare 409 is deliberately not
   * assumed to be a context refusal — so the reader got a generic failure
   * instead of "no organization selected".
   */
  it("reads the code from `code` when the route supplies one", async () => {
    stub(respond(409, JSON.stringify({ error: "Organization context required", code: "ORGANIZATION_CONTEXT_REQUIRED" })));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code: "ORGANIZATION_CONTEXT_REQUIRED" });
  });

  it("accepts a machine code carried in `error` by the upload family", async () => {
    stub(respond(409, JSON.stringify({ ok: false, error: "ORGANIZATION_CONTEXT_REQUIRED" })));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code: "ORGANIZATION_CONTEXT_REQUIRED" });
  });

  it("does NOT promote a human sentence in `error` to a machine code", async () => {
    // The words are almost the code; the space is what keeps them prose.
    stub(respond(409, JSON.stringify({ error: "Organization context required" })));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code: "FAILED" });
  });

  it("does not let prose in `error` invent an authentication failure either", async () => {
    stub(respond(409, JSON.stringify({ error: "Authentication required" })));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code: "FAILED" });
  });

  it("prefers `code` over `error` when the two disagree", async () => {
    stub(respond(409, JSON.stringify({ code: "SITE_CONTEXT_REQUIRED", error: "ORGANIZATION_CONTEXT_REQUIRED" })));
    await expect(requestJson("/api/x", pick)).rejects.toMatchObject({ code: "SITE_CONTEXT_REQUIRED" });
  });

  it("leaks no raw server text into the error, whichever shape carried it", async () => {
    stub(respond(409, JSON.stringify({ ok: false, error: "ORGANIZATION_CONTEXT_REQUIRED", detail: "org_id=7f3a tenant=acme-prod" })));
    await expect(requestJson("/api/x", pick)).rejects.toSatisfy(
      (e: unknown) => !/7f3a|acme-prod/.test(String((e as Error).message)),
    );
  });
});

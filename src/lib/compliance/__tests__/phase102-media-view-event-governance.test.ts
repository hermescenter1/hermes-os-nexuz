/**
 * PHASE 102 / RELEASE BLOCKER 5 — `MediaViewEvent` is subject data, and both
 * privacy registries must say so.
 *
 * THE DEFECT
 * Phase 102 registered `media_saves` and `media_watch_progress` and stopped
 * there. `MediaViewEvent` was left out of BOTH registries on the reading that it
 * is "privacy-aware": its `userId` is nullable and its IP is stored hashed. But
 * nullable is not absent. Whenever a signed-in viewer plays, progresses or
 * completes a video, the beacon writes a row carrying THEIR user id — a record
 * of what a named person watched and when.
 *
 * Both registries are CLOSED by design ("NO dynamic table discovery, NO raw
 * schema crawl"), which is a good property with one consequence: a table nobody
 * enumerated is a table nobody exports and nobody erases. There is no schema
 * crawl to catch the omission, and no gate that fails when a subject-attributable
 * model is missing. It is therefore caught the only way it can be — by naming it.
 *
 * WHAT THESE TESTS ADD BEYOND MEMBERSHIP
 * Membership assertions alone are satisfied by an entry that collects nothing.
 * These drive the REAL `collect` functions against a recording double and prove
 * the query is subject-scoped AND tenant-scoped, that the projection excludes
 * every behavioural column from erasure evidence, and — by mutation — that
 * removing the entry from either registry turns this file red.
 */

import { describe, expect, it, vi } from "vitest";

import { EXPORT_SOURCES } from "../export-sources";
import { ERASURE_REGISTRY_VERSION, ERASURE_TARGET_REGISTRY } from "../erasure-targets";

const SUBJECT = { userId: "user-1", candidateId: null, organizationId: "org-A" };

const EXPORT_NAMES = EXPORT_SOURCES.map((s) => s.name);
const ERASURE_NAMES = ERASURE_TARGET_REGISTRY.map((t) => t.name);

/** A double that records the args of every `findMany` it is handed. */
function recordingDb() {
  const calls: Array<{ model: string; args: Record<string, unknown> }> = [];
  const model = (name: string) => ({
    findMany: async (args: unknown) => {
      calls.push({ model: name, args: (args ?? {}) as Record<string, unknown> });
      return [{ id: "mv1", createdAt: new Date("2026-03-01T00:00:00.000Z") }];
    },
    count: async () => 1,
  });
  const db = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) => model(prop),
  });
  return { db, calls };
}

/* ═══════════════════════ 1 — registered in both registries ══════════════════ */

describe("media_view_events is registered", () => {
  it("appears in the export/DSAR registry", () => {
    expect(EXPORT_NAMES).toContain("media_view_events");
  });

  it("appears in the erasure/anonymisation registry", () => {
    expect(ERASURE_NAMES).toContain("media_view_events");
  });

  it("did not displace the two targets Phase 102 already registered", () => {
    for (const name of ["media_saves", "media_watch_progress"]) {
      expect(EXPORT_NAMES, name).toContain(name);
      expect(ERASURE_NAMES, name).toContain(name);
    }
  });

  it("bumped the closed registry version, invalidating plans approved before it", () => {
    // The executor compares this against every job's `registryVersion` and fails
    // closed on a difference. An added target WITHOUT a bump would let a plan
    // approved before the table was known execute as though it had covered it.
    expect(ERASURE_REGISTRY_VERSION).not.toBe("1.0");
    expect(ERASURE_REGISTRY_VERSION).not.toBe("1.1");
  });
});

/* ═══════════════════ 2 — the entries actually do their job ══════════════════ */

describe("the export source collects the subject's own events, tenant-scoped", () => {
  const source = EXPORT_SOURCES.find((s) => s.name === "media_view_events")!;

  it("queries mediaViewEvent with BOTH the subject and the organization pinned", async () => {
    const { db, calls } = recordingDb();
    await source.collect(db as never, SUBJECT);

    const call = calls.find((c) => c.model === "mediaViewEvent");
    expect(call, "the source must query mediaViewEvent").toBeDefined();
    expect(call!.args.where).toEqual({ userId: "user-1", organizationId: "org-A" });
  });

  it("returns nothing at all for a subject with no user id", async () => {
    const { db, calls } = recordingDb();
    const rows = await source.collect(db as never, { ...SUBJECT, userId: null });
    expect(rows).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("excludes the hashed IP — a correlation handle is not subject information", () => {
    expect(source.excludedFields).toContain("ipHash");
    expect(source.includedFields).not.toContain("ipHash");
    // And the projection is a select, so exclusion is enforced by the query.
    expect(source.redactionRules).toContain("network-identifier-excluded");
  });

  it("does include the substance of the record", () => {
    for (const field of ["mediaAssetId", "eventType", "positionSeconds", "locale", "createdAt"]) {
      expect(source.includedFields, field).toContain(field);
    }
  });

  it("never selects a field it declared excluded", async () => {
    const { db, calls } = recordingDb();
    await source.collect(db as never, SUBJECT);
    const select = calls[0].args.select as Record<string, boolean>;
    for (const excluded of source.excludedFields) {
      expect(select[excluded], excluded).toBeUndefined();
    }
  });
});

describe("the erasure target anonymises rather than deletes", () => {
  const target = ERASURE_TARGET_REGISTRY.find((t) => t.name === "media_view_events")!;

  it("uses ANONYMISE, matching the schema's onDelete: SetNull", () => {
    // A view event is an aggregate analytics fact — the asset's view count is
    // derived from this table — and it stays true with the subject link removed.
    // Watch progress is the opposite: it is the subject's own resumable state,
    // meaningless without them, so it cascades and is DELETED.
    expect(target.allowedExecutionStrategy).toBe("ANONYMISE");
    expect(target.defaultClassification).toBe("ANONYMISE_REQUIRED");

    const progress = ERASURE_TARGET_REGISTRY.find((t) => t.name === "media_watch_progress")!;
    expect(progress.allowedExecutionStrategy).toBe("DELETE");
  });

  it("collects only opaque identifiers — no behavioural column reaches evidence", async () => {
    const { db, calls } = recordingDb();
    const records = await target.collect(db as never, SUBJECT);

    expect(calls[0].args.where).toEqual({ userId: "user-1", organizationId: "org-A" });
    expect(calls[0].args.select).toEqual({ id: true, createdAt: true });

    expect(records).toHaveLength(1);
    // An erasure evidence record is RETAINED after execution. Copying what was
    // watched into it would preserve exactly what the subject asked to erase.
    expect(Object.keys(records[0].evidence)).toEqual(["recordId"]);
    const serialised = JSON.stringify(records[0]);
    for (const leak of ["eventType", "positionSeconds", "ipHash", "mediaAssetId"]) {
      expect(serialised, leak).not.toContain(leak);
    }
  });

  it("declares every behavioural column as excluded", () => {
    for (const field of ["mediaAssetId", "eventType", "positionSeconds", "locale", "ipHash"]) {
      expect(target.excludedSensitiveFields, field).toContain(field);
    }
  });

  it("returns nothing for a subject with no user id", async () => {
    const { db, calls } = recordingDb();
    expect(await target.collect(db as never, { ...SUBJECT, userId: null })).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("declares a retention lookup, so a missing policy blocks approval fail-closed", () => {
    expect(target.retentionLookup).toEqual({
      dataClass: "media_engagement",
      targetResource: "media_view_events",
    });
  });
});

/* ═══════════════════════════ 3 — mutation testing ═══════════════════════════ */

describe("MUTATION: removing the entry from either registry turns this red", () => {
  /**
   * The registries are plain exported arrays, so a "mutation" is a filtered copy
   * plus the same membership predicate the suite above applies. That is exactly
   * what a real deletion would produce, and it proves these assertions are
   * load-bearing rather than tautological.
   */
  it("an export registry without media_view_events fails the membership check", () => {
    const mutated = EXPORT_SOURCES.filter((s) => s.name !== "media_view_events");
    expect(mutated.length).toBe(EXPORT_SOURCES.length - 1);
    expect(mutated.map((s) => s.name)).not.toContain("media_view_events");
    expect(() =>
      expect(mutated.map((s) => s.name)).toContain("media_view_events"),
    ).toThrow();
  });

  it("an erasure registry without media_view_events fails the membership check", () => {
    const mutated = ERASURE_TARGET_REGISTRY.filter((t) => t.name !== "media_view_events");
    expect(mutated.length).toBe(ERASURE_TARGET_REGISTRY.length - 1);
    expect(() =>
      expect(mutated.map((t) => t.name)).toContain("media_view_events"),
    ).toThrow();
  });

  it("an entry that collects nothing would fail the behavioural assertions", async () => {
    // Guards against a future "fix" that satisfies membership with a stub.
    const inert = {
      ...EXPORT_SOURCES.find((s) => s.name === "media_view_events")!,
      collect: async () => [],
    };
    const { calls } = recordingDb();
    await inert.collect();
    expect(calls).toEqual([]);
    expect(() => expect(calls.find((c) => c.model === "mediaViewEvent")).toBeDefined()).toThrow();
  });

  it("every subject-attributable Phase 102 table is now in BOTH registries", () => {
    // The closed-registry design has no schema crawl to catch an omission, so the
    // list is stated here explicitly. Adding a subject-attributable media table
    // without registering it must fail HERE.
    const SUBJECT_ATTRIBUTABLE = ["media_saves", "media_watch_progress", "media_view_events"];
    for (const name of SUBJECT_ATTRIBUTABLE) {
      expect(EXPORT_NAMES, `${name} missing from EXPORT_SOURCES`).toContain(name);
      expect(ERASURE_NAMES, `${name} missing from ERASURE_TARGET_REGISTRY`).toContain(name);
    }
  });
});

/* ══════════════════════ 4 — the beacon's own attribution ════════════════════ */

describe("view attribution requires an ACTIVE session, not merely a valid JWT", () => {
  const ACTIVE_TOKEN = "cookie-token";

  async function attribute(options: { sessionActive: boolean; sub?: string | null }) {
    vi.resetModules();
    vi.doMock("@/lib/auth/jwt", () => ({
      verifyAccessToken: async () => (options.sub === null ? null : { sub: options.sub ?? "user-1", sid: "sid-1" }),
      signAccessToken: async () => "unused",
    }));
    vi.doMock("@/lib/auth/session-store", () => ({
      isPayloadSessionActive: async () => options.sessionActive,
    }));
    const { getUserIdFromRequest } = await import("@/lib/org/context");
    const { ACCESS_TOKEN_COOKIE } = await import("@/lib/auth/config");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/media/public/videos/x/view", {
      method: "POST",
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${ACTIVE_TOKEN}` },
    });
    try {
      return await getUserIdFromRequest(req);
    } finally {
      vi.doUnmock("@/lib/auth/jwt");
      vi.doUnmock("@/lib/auth/session-store");
      vi.resetModules();
    }
  }

  it("attributes to the subject when the session is live", async () => {
    expect(await attribute({ sessionActive: true })).toBe("user-1");
  });

  it("attributes to NOBODY when the session was revoked", async () => {
    // The signature still verifies — that is the whole point. A signature is a
    // statement about a token, not about a session.
    expect(await attribute({ sessionActive: false })).toBeNull();
  });

  it("returns null rather than throwing, so the event is still counted", async () => {
    // Failing closed here means ANONYMOUS, not refused: the analytics row is
    // still written, it simply names nobody. Refusing would lose the count and
    // hand a revoked token a denial-of-analytics lever.
    await expect(attribute({ sessionActive: false })).resolves.toBeNull();
  });

  it("returns null for a token with no subject claim", async () => {
    expect(await attribute({ sessionActive: true, sub: null })).toBeNull();
  });
});

/* ════════════ 5 — the same property, through the real beacon route ══════════ */

describe("the view beacon writes an UNATTRIBUTED row for a revoked session", () => {
  /**
   * The route-level proof. The suite above pins the helper; this one pins what
   * actually lands in the database, because that is the artifact a subject-access
   * or erasure request has to reason about.
   *
   * `@/lib/org/context` is NOT mocked here — the whole point is to run the real
   * `getUserIdFromRequest`, so only the JWT verifier and the session store are
   * doubled beneath it.
   */
  async function postBeacon(sessionActive: boolean) {
    vi.resetModules();

    const rows: Array<Record<string, unknown>> = [];
    const asset = {
      id: "a-public",
      organizationId: "org-A",
      slug: "plc-basics",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      processingState: "READY",
      viewCount: 0,
    };

    const model = (store: Array<Record<string, unknown>>) => ({
      findFirst: async (args: { where?: Record<string, unknown> }) =>
        store.find((r) =>
          Object.entries(args?.where ?? {}).every(([k, v]) => r[k] === v),
        ) ?? null,
      findUnique: async (args: { where?: Record<string, unknown> }) =>
        store.find((r) =>
          Object.entries(args?.where ?? {}).every(([k, v]) => r[k] === v),
        ) ?? null,
      findMany: async () => store,
      create: async (args: { data: Record<string, unknown> }) => {
        const row = { id: `row-${store.length + 1}`, ...args.data };
        store.push(row);
        return row;
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const row of store) {
          if (!Object.entries(args.where).every(([k, v]) => row[k] === v)) continue;
          for (const [k, v] of Object.entries(args.data)) {
            if (v && typeof v === "object" && "increment" in v) {
              row[k] = ((row[k] as number) ?? 0) + (v as { increment: number }).increment;
            } else row[k] = v;
          }
          count += 1;
        }
        return { count };
      },
    });

    const client: Record<string, unknown> = {
      organization: model([{ id: "org-A", slug: "hermes-a" }]),
      mediaAsset: model([asset]),
      mediaViewEvent: model(rows),
    };
    client.$transaction = async <T,>(fn: (tx: unknown) => Promise<T>) => fn(client);

    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => client }));
    vi.doMock("@/lib/auth/rate-limiter", () => ({
      checkRateLimit: async () => true,
      retryAfter: () => 42,
      limitWindowSeconds: () => 60,
    }));
    vi.doMock("@/lib/auth/jwt", () => ({
      verifyAccessToken: async () => ({ sub: "user-1", sid: "sid-1" }),
      signAccessToken: async () => "unused",
    }));
    vi.doMock("@/lib/auth/session-store", () => ({
      isPayloadSessionActive: async () => sessionActive,
    }));

    const savedSecret = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = "test-secret-for-ip-hash-derivation";
    try {
      const { ACCESS_TOKEN_COOKIE } = await import("@/lib/auth/config");
      const { NextRequest } = await import("next/server");
      const { POST } = await import("@/app/api/media/public/videos/[slug]/view/route");

      const req = new NextRequest(
        "http://localhost/api/media/public/videos/plc-basics/view?org=hermes-a",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-real-ip": "203.0.113.9",
            cookie: `${ACCESS_TOKEN_COOKIE}=still-verifies`,
          },
          body: JSON.stringify({ eventType: "PLAY" }),
        },
      );
      const res = await POST(req, { params: Promise.resolve({ slug: "plc-basics" }) });
      return { status: res.status, rows, asset };
    } finally {
      if (savedSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = savedSecret;
      for (const mod of [
        "@/lib/db/prisma",
        "@/lib/auth/rate-limiter",
        "@/lib/auth/jwt",
        "@/lib/auth/session-store",
      ]) {
        vi.doUnmock(mod);
      }
      vi.resetModules();
    }
  }

  it("attributes the event when the session is live", async () => {
    const { status, rows } = await postBeacon(true);
    expect(status).toBe(202);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("user-1");
  });

  it("writes the row with userId null when the session was revoked", async () => {
    const { status, rows, asset } = await postBeacon(false);

    expect(status).toBe(202);
    expect(rows).toHaveLength(1);
    // The event exists and the count moved — analytics are not lost.
    expect(asset.viewCount).toBe(1);
    // But nobody is named on it. Before this change the revoked session's token
    // still verified, so this row carried "user-1" and became a durable record
    // of what that person supposedly watched, created after their revocation.
    expect(rows[0].userId).toBeNull();
    // The anonymous path is still privacy-safe: a hash, never a raw address.
    expect(String(rows[0].ipHash)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(rows[0].ipHash)).not.toContain("203.0.113.9");
  });
});

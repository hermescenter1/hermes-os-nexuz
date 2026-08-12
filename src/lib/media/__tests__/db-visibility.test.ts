/**
 * PHASE 102 — repository-layer guarantees, proven against an in-memory Prisma double.
 *
 * What this file proves:
 *   (b) the DEFAULT loader cannot return an unpublished, non-public, unvalidated or
 *       cross-tenant row, and the editorial opt-out is both explicit and permissioned;
 *   (c) saves and watch progress are isolated per user AT THE QUERY LEVEL — the
 *       assertions inspect the `where` clause the repository actually sent, so a
 *       future refactor that fetched broadly and filtered in JavaScript would fail
 *       here even though the returned values looked right;
 *   (d) the compare-and-swap lifecycle write reports a CONFLICT when another replica
 *       moved the row first, and writes no audit event when it does.
 *
 * No live database is involved. The double implements only the Prisma surface this
 * module actually calls, so an accidental new query shape fails loudly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => {
  interface Call {
    model: string;
    op: string;
    args: Record<string, unknown>;
  }

  const state = {
    available: true,
    seq: 0,
    tables: {
      mediaAsset: [] as Row[],
      mediaSave: [] as Row[],
      mediaWatchProgress: [] as Row[],
      mediaViewEvent: [] as Row[],
      mediaEditorialEvent: [] as Row[],
    } as Record<string, Row[]>,
    calls: [] as Call[],
    /** Simulates another replica winning the race, once. */
    raceHook: null as null | (() => void),
  };

  function matches(row: Row, where: Record<string, unknown> | undefined, model: string): boolean {
    if (!where) return true;
    for (const [k, expected] of Object.entries(where)) {
      // Relation filter, e.g. `mediaAsset: { status: "PUBLISHED", ... }`.
      if (k === "mediaAsset") {
        const asset = state.tables.mediaAsset.find((a) => a.id === row.mediaAssetId);
        if (!asset) return false;
        if (!matches(asset, expected as Record<string, unknown>, "mediaAsset")) return false;
        continue;
      }
      const actual = row[k];
      if (expected === null) {
        if (actual !== null && actual !== undefined) return false;
        continue;
      }
      if (expected !== null && typeof expected === "object" && !(expected instanceof Date)) {
        const e = expected as Record<string, unknown>;
        if (Array.isArray(e.in)) {
          if (!(e.in as unknown[]).includes(actual)) return false;
          continue;
        }
        if (typeof e.gt === "number") {
          if (typeof actual !== "number" || actual <= e.gt) return false;
          continue;
        }
        throw new Error(`unsupported ${model} where operator: ${JSON.stringify(expected)}`);
      }
      if (actual !== expected) return false;
    }
    return true;
  }

  function applyData(row: Row, data: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        const o = v as Record<string, unknown>;
        if (typeof o.increment === "number") {
          row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) + o.increment;
          continue;
        }
        if (typeof o.decrement === "number") {
          row[k] = (typeof row[k] === "number" ? (row[k] as number) : 0) - o.decrement;
          continue;
        }
      }
      row[k] = v;
    }
  }

  function model(name: string) {
    const rows = () => state.tables[name];
    const record = (op: string, args: Record<string, unknown>) => {
      state.calls.push({ model: name, op, args });
    };
    const withInclude = (row: Row, args: Record<string, unknown>): Row => {
      const include = args.include as Record<string, unknown> | undefined;
      if (include?.mediaAsset) {
        return {
          ...row,
          mediaAsset: state.tables.mediaAsset.find((a) => a.id === row.mediaAssetId) ?? null,
        };
      }
      return row;
    };
    return {
      findFirst: async (args: Record<string, unknown> = {}) => {
        record("findFirst", args);
        const found = rows().find((r) =>
          matches(r, args.where as Record<string, unknown>, name),
        );
        return found ? withInclude(found, args) : null;
      },
      findMany: async (args: Record<string, unknown> = {}) => {
        record("findMany", args);
        const all = rows().filter((r) =>
          matches(r, args.where as Record<string, unknown>, name),
        );
        const skip = typeof args.skip === "number" ? args.skip : 0;
        const take = typeof args.take === "number" ? args.take : all.length;
        return all.slice(skip, skip + take).map((r) => withInclude(r, args));
      },
      count: async (args: Record<string, unknown> = {}) => {
        record("count", args);
        return rows().filter((r) => matches(r, args.where as Record<string, unknown>, name))
          .length;
      },
      create: async (args: Record<string, unknown> = {}) => {
        record("create", args);
        const data = { ...(args.data as Record<string, unknown>) };
        if (!data.id) data.id = `${name}-${++state.seq}`;
        rows().push(data);
        return data;
      },
      updateMany: async (args: Record<string, unknown> = {}) => {
        record("updateMany", args);
        if (state.raceHook) {
          const hook = state.raceHook;
          state.raceHook = null;
          hook();
        }
        const hit = rows().filter((r) =>
          matches(r, args.where as Record<string, unknown>, name),
        );
        for (const r of hit) applyData(r, args.data as Record<string, unknown>);
        return { count: hit.length };
      },
      deleteMany: async (args: Record<string, unknown> = {}) => {
        record("deleteMany", args);
        const keep: Row[] = [];
        let count = 0;
        for (const r of rows()) {
          if (matches(r, args.where as Record<string, unknown>, name)) count += 1;
          else keep.push(r);
        }
        state.tables[name] = keep;
        return { count };
      },
    };
  }

  const client: Record<string, unknown> = {
    mediaAsset: model("mediaAsset"),
    mediaSave: model("mediaSave"),
    mediaWatchProgress: model("mediaWatchProgress"),
    mediaViewEvent: model("mediaViewEvent"),
    mediaEditorialEvent: model("mediaEditorialEvent"),
  };
  // A real interactive transaction: the repository's atomic paths are exercised
  // through the same branch production takes.
  client.$transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client);

  return { state, client };
});

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => (h.state.available ? h.client : null),
}));

import {
  MEDIA_PAGE_SIZE_MAX,
  PUBLIC_AUDIENCE,
  getMediaAssetById,
  getMediaAssetBySlug,
  getWatchProgressForUser,
  listContinueWatchingForUser,
  listEditorialEventsForAsset,
  listMediaAssets,
  listSavedMediaForUser,
  mediaVisibilityWhere,
  recordMediaViewEvent,
  recordWatchProgressForUser,
  saveMediaForUser,
  transitionMediaAssetStatus,
  transitionMediaProcessingState,
  unsaveMediaForUser,
  type MediaAudience,
} from "../db";

const ORG = "org-owner";
const OTHER_ORG = "org-attacker";
const EDITOR: MediaAudience = {
  scope: "EDITORIAL",
  includeUnpublished: true,
  permissions: ["view_media", "manage_media", "review_media"],
};

function asset(overrides: Row): Row {
  return {
    id: "asset-x",
    organizationId: ORG,
    siteId: null,
    categoryId: null,
    instructorId: null,
    slug: "slug-x",
    primaryLocale: "en",
    status: "PUBLISHED",
    visibility: "PUBLIC",
    processingState: "READY",
    skillLevel: null,
    storageKey: "media/x.mp4",
    storageProvider: "local",
    contentType: "video/mp4",
    byteSize: 1024,
    durationSeconds: 60,
    posterStorageKey: null,
    viewCount: 0,
    saveCount: 0,
    completionCount: 0,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function seedLibrary(): void {
  h.state.tables.mediaAsset = [
    asset({ id: "a-public", slug: "public-ready" }),
    asset({ id: "a-draft", slug: "draft", status: "DRAFT" }),
    asset({ id: "a-submitted", slug: "submitted", status: "SUBMITTED" }),
    asset({ id: "a-archived", slug: "archived", status: "ARCHIVED" }),
    asset({ id: "a-org-only", slug: "org-only", visibility: "ORGANIZATION" }),
    asset({ id: "a-private", slug: "private", visibility: "PRIVATE" }),
    asset({ id: "a-quarantined", slug: "quarantined", processingState: "QUARANTINED" }),
    asset({ id: "a-uploaded", slug: "uploaded", processingState: "UPLOADED" }),
    // Another tenant's fully published asset — must never be visible here.
    asset({ id: "a-foreign", slug: "public-ready", organizationId: OTHER_ORG }),
  ];
}

beforeEach(() => {
  h.state.available = true;
  h.state.seq = 0;
  h.state.calls = [];
  h.state.raceHook = null;
  h.state.tables = {
    mediaAsset: [],
    mediaSave: [],
    mediaWatchProgress: [],
    mediaViewEvent: [],
    mediaEditorialEvent: [],
  };
});

// ── (b) the default loader cannot return unpublished rows ────────────────────

describe("PHASE 102 published-only visibility is enforced by the repository", () => {
  it("puts all three conditions in the database predicate, not in the caller", () => {
    const gate = mediaVisibilityWhere(PUBLIC_AUDIENCE);
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.value).toEqual({
        status: "PUBLISHED",
        visibility: "PUBLIC",
        processingState: "READY",
      });
    }
  });

  it("returns NOT_FOUND for every non-public row when no audience is given", async () => {
    seedLibrary();
    const hidden = ["draft", "submitted", "archived", "org-only", "private", "quarantined", "uploaded"];
    for (const slug of hidden) {
      const res = await getMediaAssetBySlug({ organizationId: ORG, slug });
      expect(res).toEqual({ ok: false, reason: "NOT_FOUND" });
    }
    const visible = await getMediaAssetBySlug({ organizationId: ORG, slug: "public-ready" });
    expect(visible.ok).toBe(true);
    if (visible.ok) expect(visible.value.id).toBe("a-public");
  });

  it("lists only the fully published, public, READY row by default", async () => {
    seedLibrary();
    const res = await listMediaAssets({ organizationId: ORG });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.items.map((a) => a.id)).toEqual(["a-public"]);
      expect(res.value.total).toBe(1);
    }
    // And the query it sent carried the gate — not a broad read narrowed later.
    const call = h.state.calls.find((c) => c.model === "mediaAsset" && c.op === "findMany");
    expect(call?.args.where).toMatchObject({
      organizationId: ORG,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      processingState: "READY",
    });
  });

  it("never crosses the tenant boundary, even for an identical slug", async () => {
    seedLibrary();
    const res = await getMediaAssetBySlug({ organizationId: ORG, slug: "public-ready" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.organizationId).toBe(ORG);
    const foreign = await getMediaAssetById({
      organizationId: ORG,
      id: "a-foreign",
      audience: EDITOR,
    });
    expect(foreign).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("widens to ORGANIZATION only for the organization audience", async () => {
    seedLibrary();
    const res = await listMediaAssets({
      organizationId: ORG,
      audience: { scope: "ORGANIZATION" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.items.map((a) => a.id).sort()).toEqual(["a-org-only", "a-public"]);
  });

  it("lifts the lifecycle filter ONLY for a permissioned editorial audience", async () => {
    seedLibrary();
    const editorial = await listMediaAssets({ organizationId: ORG, audience: EDITOR });
    expect(editorial.ok).toBe(true);
    if (editorial.ok) expect(editorial.value.items).toHaveLength(8); // every in-org row

    const unprivileged = await listMediaAssets({
      organizationId: ORG,
      audience: { scope: "EDITORIAL", includeUnpublished: true, permissions: ["manage_media"] },
    });
    expect(unprivileged).toEqual({ ok: false, reason: "FORBIDDEN" });
  });

  it("cannot express an editorial audience without the explicit opt-out (compile-time)", () => {
    // @ts-expect-error — `includeUnpublished` and `permissions` are mandatory, so an
    // unpublished read can never be requested by accident.
    const missingOptOut: MediaAudience = { scope: "EDITORIAL" };
    const falseOptOut: MediaAudience = {
      scope: "EDITORIAL",
      // @ts-expect-error — the opt-out is the literal `true`; `false` is not a variant.
      includeUnpublished: false,
      permissions: [],
    };
    void missingOptOut;
    void falseOptOut;
    expect(true).toBe(true);
  });

  it("clamps page size and page number so no list is unbounded", async () => {
    h.state.tables.mediaAsset = Array.from({ length: 120 }, (_, i) =>
      asset({ id: `a-${i}`, slug: `s-${i}` }),
    );
    const res = await listMediaAssets({ organizationId: ORG, pageSize: 100000, page: -5 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.pageSize).toBe(MEDIA_PAGE_SIZE_MAX);
      expect(res.value.page).toBe(1);
      expect(res.value.items).toHaveLength(MEDIA_PAGE_SIZE_MAX);
      expect(res.value.hasMore).toBe(true);
    }
    const call = h.state.calls.find((c) => c.model === "mediaAsset" && c.op === "findMany");
    expect(call?.args.take).toBe(MEDIA_PAGE_SIZE_MAX);
  });

  it("degrades to STORAGE_UNAVAILABLE rather than throwing when there is no database", async () => {
    h.state.available = false;
    expect(await listMediaAssets({ organizationId: ORG })).toEqual({
      ok: false,
      reason: "STORAGE_UNAVAILABLE",
    });
  });
});

// ── (c) per-user isolation of saves and progress ─────────────────────────────

describe("PHASE 102 per-subject reads are isolated at the query level", () => {
  beforeEach(() => {
    seedLibrary();
    h.state.tables.mediaSave = [
      { id: "s-1", organizationId: ORG, userId: "user-a", mediaAssetId: "a-public", createdAt: new Date() },
      { id: "s-2", organizationId: ORG, userId: "user-b", mediaAssetId: "a-public", createdAt: new Date() },
      { id: "s-3", organizationId: ORG, userId: "user-b", mediaAssetId: "a-org-only", createdAt: new Date() },
    ];
    h.state.tables.mediaWatchProgress = [
      {
        id: "p-1", organizationId: ORG, userId: "user-a", mediaAssetId: "a-public",
        positionSeconds: 10, progressPct: 20, completedAt: null, lastWatchedAt: new Date(),
      },
      {
        id: "p-2", organizationId: ORG, userId: "user-b", mediaAssetId: "a-public",
        positionSeconds: 55, progressPct: 90, completedAt: null, lastWatchedAt: new Date(),
      },
    ];
  });

  it("returns only the caller's saves, and filters by userId in the where clause", async () => {
    const res = await listSavedMediaForUser({ organizationId: ORG, userId: "user-a" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.items.map((s) => s.id)).toEqual(["s-1"]);
    const call = h.state.calls.find((c) => c.model === "mediaSave" && c.op === "findMany");
    expect(call?.args.where).toMatchObject({ organizationId: ORG, userId: "user-a" });
  });

  it("hides another user's save of an asset the caller cannot see", async () => {
    const res = await listSavedMediaForUser({ organizationId: ORG, userId: "user-b" });
    expect(res.ok).toBe(true);
    // s-3 points at an ORGANIZATION-visibility asset, so the public audience drops it.
    if (res.ok) expect(res.value.items.map((s) => s.id)).toEqual(["s-2"]);
  });

  it("never returns another user's watch position", async () => {
    const mine = await getWatchProgressForUser({
      organizationId: ORG, userId: "user-a", mediaAssetId: "a-public",
    });
    expect(mine.ok).toBe(true);
    if (mine.ok) expect(mine.value?.id).toBe("p-1");

    const stranger = await getWatchProgressForUser({
      organizationId: ORG, userId: "user-c", mediaAssetId: "a-public",
    });
    expect(stranger).toEqual({ ok: true, value: null });

    const call = h.state.calls.find(
      (c) => c.model === "mediaWatchProgress" && c.op === "findFirst",
    );
    expect(call?.args.where).toMatchObject({ userId: "user-a", organizationId: ORG });
  });

  it("scopes continue-watching to the caller and to visible assets", async () => {
    const res = await listContinueWatchingForUser({ organizationId: ORG, userId: "user-b" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.items.map((p) => p.id)).toEqual(["p-2"]);
    const call = h.state.calls.find(
      (c) => c.model === "mediaWatchProgress" && c.op === "findMany",
    );
    expect(call?.args.where).toMatchObject({ userId: "user-b", completedAt: null });
  });

  it("refuses to save an asset the caller cannot see, without confirming it exists", async () => {
    expect(
      await saveMediaForUser({ organizationId: ORG, userId: "user-a", mediaAssetId: "a-draft" }),
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(
      await saveMediaForUser({
        organizationId: OTHER_ORG, userId: "user-a", mediaAssetId: "a-public",
      }),
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(h.state.tables.mediaSave).toHaveLength(3);
  });

  it("saves idempotently and moves saveCount exactly once", async () => {
    const first = await saveMediaForUser({
      organizationId: ORG, userId: "user-z", mediaAssetId: "a-public",
    });
    expect(first).toEqual({ ok: true, value: { created: true } });
    const again = await saveMediaForUser({
      organizationId: ORG, userId: "user-z", mediaAssetId: "a-public",
    });
    expect(again).toEqual({ ok: true, value: { created: false } });
    const row = h.state.tables.mediaAsset.find((a) => a.id === "a-public");
    expect(row?.saveCount).toBe(1);
  });

  it("unsaves only the caller's row and never drives the counter negative", async () => {
    const target = h.state.tables.mediaAsset.find((a) => a.id === "a-public");
    if (target) target.saveCount = 2;
    const removed = await unsaveMediaForUser({
      organizationId: ORG, userId: "user-a", mediaAssetId: "a-public",
    });
    expect(removed).toEqual({ ok: true, value: { removed: true } });
    expect(h.state.tables.mediaSave.map((s) => s.id).sort()).toEqual(["s-2", "s-3"]);
    expect(target?.saveCount).toBe(1);

    const repeat = await unsaveMediaForUser({
      organizationId: ORG, userId: "user-a", mediaAssetId: "a-public",
    });
    expect(repeat).toEqual({ ok: true, value: { removed: false } });
    expect(target?.saveCount).toBe(1);
  });

  it("counts a completion once per subject, not once per progress report", async () => {
    const target = h.state.tables.mediaAsset.find((a) => a.id === "a-public");
    const first = await recordWatchProgressForUser({
      organizationId: ORG, userId: "user-a", mediaAssetId: "a-public",
      positionSeconds: 59, progressPct: 99,
    });
    expect(first).toEqual({ ok: true, value: { completed: true, firstCompletion: true } });
    expect(target?.completionCount).toBe(1);

    const second = await recordWatchProgressForUser({
      organizationId: ORG, userId: "user-a", mediaAssetId: "a-public",
      positionSeconds: 60, progressPct: 100,
    });
    expect(second).toEqual({ ok: true, value: { completed: true, firstCompletion: false } });
    expect(target?.completionCount).toBe(1);
  });

  it("rejects out-of-range progress before touching the database", async () => {
    expect(
      await recordWatchProgressForUser({
        organizationId: ORG, userId: "user-a", mediaAssetId: "a-public",
        positionSeconds: -1, progressPct: 10,
      }),
    ).toEqual({ ok: false, reason: "INVALID_INPUT" });
    expect(
      await recordWatchProgressForUser({
        organizationId: ORG, userId: "user-a", mediaAssetId: "a-public",
        positionSeconds: 10, progressPct: 101,
      }),
    ).toEqual({ ok: false, reason: "INVALID_INPUT" });
    expect(h.state.calls.some((c) => c.op === "create")).toBe(false);
  });
});

// ── (d) compare-and-swap lifecycle writes ────────────────────────────────────

describe("PHASE 102 lifecycle writes are compare-and-swap with an atomic audit row", () => {
  beforeEach(() => {
    h.state.tables.mediaAsset = [
      asset({ id: "a-1", slug: "one", status: "DRAFT", processingState: "READY" }),
    ];
  });

  it("performs a legal transition and appends the editorial event in the same call", async () => {
    const res = await transitionMediaAssetStatus({
      id: "a-1", organizationId: ORG, actorUserId: "editor-1",
      to: "SUBMITTED", permissions: ["manage_media"],
    });
    expect(res).toEqual({
      ok: true,
      value: { id: "a-1", from: "DRAFT", to: "SUBMITTED", action: "SUBMIT" },
    });
    expect(h.state.tables.mediaAsset[0].status).toBe("SUBMITTED");
    expect(h.state.tables.mediaEditorialEvent).toHaveLength(1);
    expect(h.state.tables.mediaEditorialEvent[0]).toMatchObject({
      organizationId: ORG, mediaAssetId: "a-1",
      fromStatus: "DRAFT", toStatus: "SUBMITTED", action: "SUBMIT", actorUserId: "editor-1",
    });
    // The write carried the expected current state as a predicate.
    const cas = h.state.calls.find((c) => c.model === "mediaAsset" && c.op === "updateMany");
    expect(cas?.args.where).toMatchObject({ id: "a-1", organizationId: ORG, status: "DRAFT" });
  });

  it("reports CONFLICT and writes no audit row when another replica moved first", async () => {
    // Between the in-transaction read and the compare-and-swap, a concurrent actor
    // submits the asset. The predicate no longer matches, so nothing is written.
    h.state.raceHook = () => {
      h.state.tables.mediaAsset[0].status = "SUBMITTED";
    };
    const res = await transitionMediaAssetStatus({
      id: "a-1", organizationId: ORG, actorUserId: "editor-1",
      to: "SUBMITTED", permissions: ["manage_media"],
    });
    expect(res).toEqual({ ok: false, reason: "CONFLICT" });
    expect(h.state.tables.mediaEditorialEvent).toHaveLength(0);
  });

  it("refuses an illegal move and a move the actor may not make", async () => {
    expect(
      await transitionMediaAssetStatus({
        id: "a-1", organizationId: ORG, actorUserId: "editor-1",
        to: "PUBLISHED", permissions: ["manage_media", "review_media"],
      }),
    ).toEqual({ ok: false, reason: "ILLEGAL_TRANSITION" });
    expect(
      await transitionMediaAssetStatus({
        id: "a-1", organizationId: ORG, actorUserId: "editor-1",
        to: "SUBMITTED", permissions: ["review_media"],
      }),
    ).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(h.state.tables.mediaEditorialEvent).toHaveLength(0);
  });

  it("cannot publish an asset whose bytes are not READY, even with review_media", async () => {
    h.state.tables.mediaAsset = [
      asset({ id: "a-2", slug: "two", status: "SUBMITTED", processingState: "QUARANTINED" }),
    ];
    expect(
      await transitionMediaAssetStatus({
        id: "a-2", organizationId: ORG, actorUserId: "reviewer-1",
        to: "PUBLISHED", permissions: ["review_media"],
      }),
    ).toEqual({ ok: false, reason: "PROCESSING_NOT_READY" });
    expect(h.state.tables.mediaAsset[0].status).toBe("SUBMITTED");
  });

  it("loses the publish race to a concurrent quarantine", async () => {
    h.state.tables.mediaAsset = [
      asset({ id: "a-3", slug: "three", status: "SUBMITTED", processingState: "READY" }),
    ];
    h.state.raceHook = () => {
      h.state.tables.mediaAsset[0].processingState = "QUARANTINED";
    };
    const res = await transitionMediaAssetStatus({
      id: "a-3", organizationId: ORG, actorUserId: "reviewer-1",
      to: "PUBLISHED", permissions: ["review_media"],
    });
    expect(res).toEqual({ ok: false, reason: "CONFLICT" });
    expect(h.state.tables.mediaAsset[0].status).toBe("SUBMITTED");
    expect(h.state.tables.mediaEditorialEvent).toHaveLength(0);
  });

  it("stamps publishedAt once and keeps it across archive, restore and re-publish", async () => {
    h.state.tables.mediaAsset = [
      asset({ id: "a-4", slug: "four", status: "SUBMITTED", processingState: "READY" }),
    ];
    const firstPublish = new Date("2026-03-01T10:00:00Z");
    await transitionMediaAssetStatus({
      id: "a-4", organizationId: ORG, actorUserId: "reviewer-1",
      to: "PUBLISHED", permissions: ["review_media"], now: firstPublish,
    });
    expect(h.state.tables.mediaAsset[0].publishedAt).toEqual(firstPublish);

    await transitionMediaAssetStatus({
      id: "a-4", organizationId: ORG, actorUserId: "editor-1",
      to: "ARCHIVED", permissions: ["manage_media"],
    });
    await transitionMediaAssetStatus({
      id: "a-4", organizationId: ORG, actorUserId: "editor-1",
      to: "DRAFT", permissions: ["manage_media"],
    });
    await transitionMediaAssetStatus({
      id: "a-4", organizationId: ORG, actorUserId: "editor-1",
      to: "SUBMITTED", permissions: ["manage_media"],
    });
    await transitionMediaAssetStatus({
      id: "a-4", organizationId: ORG, actorUserId: "reviewer-1",
      to: "PUBLISHED", permissions: ["review_media"], now: new Date("2026-06-01T10:00:00Z"),
    });
    expect(h.state.tables.mediaAsset[0].publishedAt).toEqual(firstPublish);
    expect(h.state.tables.mediaEditorialEvent).toHaveLength(5);
  });

  it("treats another tenant's asset as absent", async () => {
    expect(
      await transitionMediaAssetStatus({
        id: "a-1", organizationId: OTHER_ORG, actorUserId: "attacker",
        to: "SUBMITTED", permissions: ["manage_media", "review_media"],
      }),
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(h.state.tables.mediaAsset[0].status).toBe("DRAFT");
  });

  it("advances the processing machine by compare-and-swap and refuses a stale from-state", async () => {
    h.state.tables.mediaAsset = [
      asset({ id: "a-5", slug: "five", status: "DRAFT", processingState: "PENDING_UPLOAD" }),
    ];
    const good = await transitionMediaProcessingState({
      id: "a-5", organizationId: ORG, actorUserId: "editor-1",
      from: "PENDING_UPLOAD", to: "UPLOADED", driver: "REQUEST", permissions: ["manage_media"],
    });
    expect(good.ok).toBe(true);
    expect(h.state.tables.mediaAsset[0].processingState).toBe("UPLOADED");

    // Replaying the same transition now finds a stale predicate.
    const stale = await transitionMediaProcessingState({
      id: "a-5", organizationId: ORG, actorUserId: "editor-1",
      from: "PENDING_UPLOAD", to: "UPLOADED", driver: "REQUEST", permissions: ["manage_media"],
    });
    expect(stale).toEqual({ ok: false, reason: "CONFLICT" });
  });

  it("will not let an HTTP request drive an operator-only processing edge", async () => {
    h.state.tables.mediaAsset = [
      asset({ id: "a-6", slug: "six", processingState: "VALIDATING" }),
    ];
    expect(
      await transitionMediaProcessingState({
        id: "a-6", organizationId: ORG, actorUserId: "editor-1",
        from: "VALIDATING", to: "READY", driver: "REQUEST", permissions: ["manage_media"],
      }),
    ).toEqual({ ok: false, reason: "OPERATOR_ONLY" });
    expect(h.state.tables.mediaAsset[0].processingState).toBe("VALIDATING");
  });
});

// ── Analytics privacy (§8) ───────────────────────────────────────────────────

describe("PHASE 102 view events are privacy-aware", () => {
  beforeEach(seedLibrary);

  it("refuses anything that is not a SHA-256 digest in the ipHash field", async () => {
    for (const bad of ["203.0.113.7", "2001:db8::1", "not-a-hash", "ABCDEF".repeat(10)]) {
      const res = await recordMediaViewEvent({
        organizationId: ORG, mediaAssetId: "a-public", eventType: "PLAY", ipHash: bad,
      });
      expect(res).toEqual({ ok: false, reason: "INVALID_INPUT" });
    }
    expect(h.state.tables.mediaViewEvent).toHaveLength(0);
  });

  it("records an anonymous play with a hash and moves viewCount", async () => {
    const res = await recordMediaViewEvent({
      organizationId: ORG, mediaAssetId: "a-public", eventType: "PLAY",
      ipHash: "a".repeat(64), locale: "fa",
    });
    expect(res).toEqual({ ok: true, value: { recorded: true } });
    expect(h.state.tables.mediaViewEvent[0]).toMatchObject({
      organizationId: ORG, mediaAssetId: "a-public", userId: null,
      ipHash: "a".repeat(64), eventType: "PLAY", locale: "fa",
    });
    expect(h.state.tables.mediaAsset.find((a) => a.id === "a-public")?.viewCount).toBe(1);
  });

  it("does not double-count completions that watch progress already counted", async () => {
    await recordMediaViewEvent({
      organizationId: ORG, mediaAssetId: "a-public", eventType: "COMPLETE", userId: "user-a",
    });
    expect(h.state.tables.mediaAsset.find((a) => a.id === "a-public")?.completionCount).toBe(0);
  });

  it("will not record an event against an asset the audience cannot see", async () => {
    expect(
      await recordMediaViewEvent({
        organizationId: ORG, mediaAssetId: "a-draft", eventType: "PLAY",
      }),
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(
      await recordMediaViewEvent({
        organizationId: OTHER_ORG, mediaAssetId: "a-public", eventType: "PLAY",
      }),
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(h.state.tables.mediaViewEvent).toHaveLength(0);
  });
});

describe("PHASE 102 editorial history is permissioned and bounded", () => {
  it("requires view_media and pages the result", async () => {
    h.state.tables.mediaEditorialEvent = Array.from({ length: 5 }, (_, i) => ({
      id: `e-${i}`, organizationId: ORG, mediaAssetId: "a-1", toStatus: "SUBMITTED",
    }));
    expect(
      await listEditorialEventsForAsset({
        organizationId: ORG, mediaAssetId: "a-1", permissions: ["manage_media"],
      }),
    ).toEqual({ ok: false, reason: "FORBIDDEN" });

    const res = await listEditorialEventsForAsset({
      organizationId: ORG, mediaAssetId: "a-1", permissions: ["view_media"], pageSize: 2,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.items).toHaveLength(2);
      expect(res.value.total).toBe(5);
      expect(res.value.hasMore).toBe(true);
    }
  });
});

/**
 * PHASE 102 — `/api/media/assets/[id]` (detail + editorial update) route tests.
 *
 * Invariants asserted here:
 *   CROSS_TENANT_MEDIA_READ = 0            (404, never 403 — existence is not disclosed)
 *   PUBLISHED_ASSET_IDENTITY_MUTATED = 0
 *   CLIENT_SUPPLIED_LIFECYCLE_ON_PATCH = 0
 *   SLUG_SEGMENT_USED_AS_ID = 0            (the `[id]` segment is genuinely an id)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  freshState,
  getRequest,
  installMocks,
  jsonRequest,
  seedAsset,
  seedMember,
  seedTranslation,
  uninstallMocks,
  type HarnessState,
} from "./harness";

let state: HarnessState;

beforeEach(() => {
  vi.resetModules();
  state = freshState();
  installMocks(state);
});

afterEach(() => {
  uninstallMocks();
  vi.restoreAllMocks();
});

function actAs(role: string, userId = "user-1", organizationId = "org-A") {
  state.payload = { sub: userId, role: "engineer", sid: "sid-1" };
  seedMember(state, { userId, organizationId, role });
}

async function detailGET(id: string) {
  const { GET } = await import("../[id]/route");
  const res = await GET(getRequest(`/${id}`), { params: Promise.resolve({ id }) });
  return { res, json: (await res.json()) as Record<string, never> };
}

async function patch(id: string, body: unknown, contentType = "application/json") {
  const { PATCH } = await import("../[id]/route");
  const res = await PATCH(jsonRequest("PATCH", body, `/${id}`, contentType), {
    params: Promise.resolve({ id }),
  });
  return { res, json: (await res.json()) as Record<string, never> };
}

describe("GET /api/media/assets/[id] — tenant isolation", () => {
  it("answers 404 (not 403) for another organization's asset", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "asset-b", organizationId: "org-B", status: "PUBLISHED", visibility: "PUBLIC", processingState: "READY" });

    const { res, json } = await detailGET("asset-b");
    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
  });

  it("answers 404 for an id that does not exist", async () => {
    actAs("ENGINEER");
    expect((await detailGET("nope")).res.status).toBe(404);
  });

  it("answers 404 for a malformed id without touching the database", async () => {
    actAs("ENGINEER");
    const { res } = await detailGET("../../etc/passwd");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/media/assets/[id] — the segment is an ID, not a slug", () => {
  it("does not resolve an asset by its slug", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "real-id", organizationId: "org-A", slug: "friendly-slug", status: "DRAFT" });

    expect((await detailGET("friendly-slug")).res.status).toBe(404);
    expect((await detailGET("real-id")).res.status).toBe(200);
  });
});

describe("GET /api/media/assets/[id] — audience", () => {
  it("a VIEWER cannot read an unpublished asset", async () => {
    actAs("VIEWER");
    seedAsset(state, { id: "draft-1", organizationId: "org-A", status: "DRAFT" });
    expect((await detailGET("draft-1")).res.status).toBe(404);
  });

  it("an ENGINEER reads the draft, its copy, its next moves and its history", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "draft-1", organizationId: "org-A", status: "DRAFT" });
    seedTranslation(state, { mediaAssetId: "draft-1", organizationId: "org-A", locale: "en", title: "Draft title" });
    state.tables.mediaEditorialEvent.push({
      id: "ev-1",
      organizationId: "org-A",
      mediaAssetId: "draft-1",
      fromStatus: null,
      toStatus: "DRAFT",
      action: "RESTORE",
      actorUserId: "user-1",
      reason: null,
      createdAt: new Date(2026, 0, 2),
    });

    const { res, json } = await detailGET("draft-1");
    expect(res.status).toBe(200);
    expect((json.translations as unknown as Array<{ title: string }>)[0].title).toBe("Draft title");
    // An ENGINEER holds manage_media only, so SUBMIT and ARCHIVE are offered and
    // the review-only decisions are not.
    const moves = (json.allowedTransitions as unknown as Array<{ to: string }>).map((t) => t.to).sort();
    expect(moves).toEqual(["ARCHIVED", "SUBMITTED"]);
    expect((json.editorialEvents as unknown as unknown[]).length).toBe(1);
  });

  it("never exposes the server-generated storage key", async () => {
    actAs("ENGINEER");
    const row = seedAsset(state, { id: "draft-1", organizationId: "org-A", status: "DRAFT" });
    row.storageKey = "media/2026/secret-object-key.mp4";
    row.posterStorageKey = "media/2026/secret-poster.png";

    const { json } = await detailGET("draft-1");
    const body = JSON.stringify(json);
    expect(body).not.toContain("secret-object-key");
    expect(body).not.toContain("secret-poster");
    expect((json.asset as unknown as Record<string, boolean>).hasBytes).toBe(true);
    expect((json.asset as unknown as Record<string, boolean>).hasPoster).toBe(true);
  });

  it("does not offer editorial history to a non-authoring reader", async () => {
    actAs("VIEWER");
    seedAsset(state, { id: "pub-1", organizationId: "org-A", status: "PUBLISHED", visibility: "ORGANIZATION", processingState: "READY" });
    state.tables.mediaEditorialEvent.push({
      id: "ev-1", organizationId: "org-A", mediaAssetId: "pub-1", fromStatus: "IN_REVIEW",
      toStatus: "PUBLISHED", action: "PUBLISH", actorUserId: "reviewer", reason: "looks good",
      createdAt: new Date(2026, 0, 3),
    });

    const { res, json } = await detailGET("pub-1");
    expect(res.status).toBe(200);
    expect(json.editorialEvents).toEqual([]);
    expect(JSON.stringify(json)).not.toContain("looks good");
  });
});

describe("PATCH /api/media/assets/[id] — permission", () => {
  it("a VIEWER cannot edit", async () => {
    actAs("VIEWER");
    seedAsset(state, { id: "draft-1", organizationId: "org-A", status: "DRAFT" });
    const { res } = await patch("draft-1", { visibility: "PUBLIC" });
    expect(res.status).toBe(403);
  });

  it("another organization's asset is 404, never 403", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "asset-b", organizationId: "org-B", status: "DRAFT" });
    const { res, json } = await patch("asset-b", { visibility: "PUBLIC" });
    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    expect(state.tables.mediaAsset[0].visibility).toBe("ORGANIZATION");
  });
});

describe("PATCH /api/media/assets/[id] — editable states only", () => {
  beforeEach(() => actAs("ENGINEER"));

  it("edits a DRAFT", async () => {
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    seedTranslation(state, { mediaAssetId: "d", organizationId: "org-A", locale: "en", title: "Old" });

    const { res, json } = await patch("d", { title: "New", visibility: "PUBLIC", skillLevel: "ADVANCED" });
    expect(res.status).toBe(200);
    expect((json.asset as unknown as Record<string, string>).visibility).toBe("PUBLIC");
    expect((json.asset as unknown as Record<string, string>).skillLevel).toBe("ADVANCED");
    expect(state.tables.mediaAssetTranslation[0].title).toBe("New");
    expect(state.tables.mediaAsset[0].updatedBy).toBe("user-1");
  });

  it("edits a REJECTED asset", async () => {
    seedAsset(state, { id: "r", organizationId: "org-A", status: "REJECTED" });
    expect((await patch("r", { visibility: "PRIVATE" })).res.status).toBe(200);
  });

  it("refuses to edit a PUBLISHED asset — a published identity is immutable", async () => {
    seedAsset(state, { id: "p", organizationId: "org-A", status: "PUBLISHED", visibility: "PUBLIC", processingState: "READY" });
    const { res, json } = await patch("p", { visibility: "PRIVATE" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("NOT_EDITABLE");
    expect(state.tables.mediaAsset[0].visibility).toBe("PUBLIC");
  });

  it("refuses to edit an asset under review", async () => {
    seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED" });
    expect((await patch("s", { visibility: "PRIVATE" })).res.status).toBe(409);
    seedAsset(state, { id: "i", organizationId: "org-A", status: "IN_REVIEW" });
    expect((await patch("i", { visibility: "PRIVATE" })).res.status).toBe(409);
  });

  it("refuses to edit an ARCHIVED asset", async () => {
    seedAsset(state, { id: "a", organizationId: "org-A", status: "ARCHIVED" });
    expect((await patch("a", { visibility: "PRIVATE" })).res.status).toBe(409);
  });
});

describe("PATCH /api/media/assets/[id] — compare-and-swap, not read-then-write", () => {
  it("409s when a concurrent SUBMIT lands between the load and the write", async () => {
    actAs("ENGINEER");
    const row = seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    seedTranslation(state, { mediaAssetId: "d", organizationId: "org-A", locale: "en", title: "Old" });

    // The asset leaves the editable set the instant before the update. The
    // predicate pins DRAFT|REJECTED, so nothing is written and the edit is
    // refused rather than silently mutating an asset now under review.
    state.raceHooks["mediaAsset.updateMany"] = () => {
      row.status = "SUBMITTED";
    };

    const { res, json } = await patch("d", { title: "New", visibility: "PUBLIC" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(state.tables.mediaAsset[0].visibility).toBe("ORGANIZATION");
    expect(state.tables.mediaAssetTranslation[0].title).toBe("Old");
  });
});

describe("PATCH /api/media/assets/[id] — mass assignment", () => {
  beforeEach(() => {
    actAs("ENGINEER");
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
  });

  it("rejects lifecycle, tenancy, identity and counter fields", async () => {
    for (const bad of [
      { status: "PUBLISHED" },
      { processingState: "READY" },
      { organizationId: "org-B" },
      { slug: "new-slug" },
      { publishedAt: "2026-01-01T00:00:00.000Z" },
      { viewCount: 1000 },
      { storageKey: "anything" },
      { createdBy: "someone" },
      { rejectionReason: "cleared" },
    ]) {
      const { res, json } = await patch("d", bad);
      expect(res.status).toBe(400);
      expect(json.code).toBe("INVALID_INPUT");
    }
    expect(state.tables.mediaAsset[0].status).toBe("DRAFT");
  });

  it("rejects an empty update", async () => {
    expect((await patch("d", {})).res.status).toBe(400);
  });

  it("rejects a value outside a closed vocabulary", async () => {
    expect((await patch("d", { visibility: "EVERYONE" })).res.status).toBe(400);
    expect((await patch("d", { skillLevel: "GURU" })).res.status).toBe(400);
    expect((await patch("d", { locale: "fr", title: "x" })).res.status).toBe(400);
  });

  it("415s on a non-JSON body and 413s on an oversized one", async () => {
    expect((await patch("d", { visibility: "PUBLIC" }, "text/plain")).res.status).toBe(415);
    const oversized = JSON.stringify({ description: "x".repeat(40 * 1024) });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(jsonRequest("PATCH", oversized, "/d"), { params: Promise.resolve({ id: "d" }) });
    expect(res.status).toBe(413);
  });
});

describe("PATCH /api/media/assets/[id] — references and locales", () => {
  beforeEach(() => {
    actAs("ENGINEER");
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
  });

  it("refuses to link another organization's instructor", async () => {
    state.tables.mediaInstructor.push({ id: "ins-b", organizationId: "org-B" });
    const { res, json } = await patch("d", { instructorId: "ins-b" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REFERENCE");
    expect(state.tables.mediaAsset[0].instructorId).toBe(null);
  });

  it("allows clearing a link with null", async () => {
    state.tables.mediaAsset[0].instructorId = "ins-a";
    const { res } = await patch("d", { instructorId: null });
    expect(res.status).toBe(200);
    expect(state.tables.mediaAsset[0].instructorId).toBe(null);
  });

  it("creates a new locale row when a title is supplied", async () => {
    const { res } = await patch("d", { locale: "de", title: "Deutscher Titel" });
    expect(res.status).toBe(200);
    expect(state.tables.mediaAssetTranslation.length).toBe(1);
    expect(state.tables.mediaAssetTranslation[0].locale).toBe("de");
  });

  it("refuses to invent a title when a new locale is given only a summary", async () => {
    const { res, json } = await patch("d", { locale: "de", summary: "nur Zusammenfassung" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("TITLE_REQUIRED");
    expect(state.tables.mediaAssetTranslation.length).toBe(0);
  });
});

describe("PATCH /api/media/assets/[id] — audit", () => {
  it("records field names but never the authored copy", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    seedTranslation(state, { mediaAssetId: "d", organizationId: "org-A", locale: "en", title: "Old" });

    await patch("d", { title: "A very confidential product name", visibility: "PRIVATE" });
    const event = state.auditEvents.find((e) => e.action === "media.asset.updated");
    expect(event).toBeDefined();
    expect(event?.organizationId).toBe("org-A");
    expect((event?.metadata as Record<string, unknown>).fields).toEqual(["title", "visibility"]);
    expect(JSON.stringify(event)).not.toContain("confidential");
  });

  it("records nothing when the update is refused", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "p", organizationId: "org-A", status: "PUBLISHED", visibility: "PUBLIC", processingState: "READY" });
    await patch("p", { visibility: "PRIVATE" });
    expect(state.auditEvents.filter((e) => e.action === "media.asset.updated").length).toBe(0);
  });
});

describe("PATCH /api/media/assets/[id] — rate limiting", () => {
  it("429s with Retry-After and writes nothing", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    state.rateLimitAllowed = false;

    const { res } = await patch("d", { visibility: "PUBLIC" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(state.tables.mediaAsset[0].visibility).toBe("ORGANIZATION");
  });
});

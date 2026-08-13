/**
 * PHASE 102 — `/api/media/assets/[id]/transitions` editorial workflow tests.
 *
 * The pure transition table (`src/lib/media/lifecycle.ts`) and the
 * compare-and-swap repository call (`src/lib/media/db.ts`) both run for real;
 * only the database, the audit sink, the limiter and token verification are
 * doubled. What is asserted is therefore the composed behaviour, not a mock's.
 *
 * Invariants asserted here:
 *   AUTHOR_SELF_PUBLISH = 0            (manage_media cannot publish)
 *   PUBLISH_OF_UNVALIDATED_BYTES = 0   (processingState must be READY)
 *   SILENT_OVERWRITE_ON_STALE_STATE = 0
 *   TRANSITION_WITHOUT_EDITORIAL_EVENT_OR_AUDIT = 0
 *   CROSS_TENANT_TRANSITION = 0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  freshState,
  installMocks,
  jsonRequest,
  seedAsset,
  seedMember,
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

async function transition(id: string, body: unknown, contentType = "application/json") {
  const { POST } = await import("../[id]/transitions/route");
  const res = await POST(jsonRequest("POST", body, `/${id}/transitions`, contentType), {
    params: Promise.resolve({ id }),
  });
  return { res, json: (await res.json()) as Record<string, never> };
}

function statusOf(id: string): unknown {
  return state.tables.mediaAsset.find((r) => r.id === id)?.status;
}

describe("POST …/transitions — authentication, tenancy and input", () => {
  it("401 without a session", async () => {
    state.payload = null;
    expect((await transition("a", { to: "SUBMITTED" })).res.status).toBe(401);
  });

  it("404 for another organization's asset — never 403, never a mutation", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "asset-b", organizationId: "org-B", status: "DRAFT" });
    const { res, json } = await transition("asset-b", { to: "SUBMITTED" });
    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    expect(statusOf("asset-b")).toBe("DRAFT");
    expect(state.tables.mediaEditorialEvent.length).toBe(0);
  });

  it("400 on an unknown target state or an extra body field", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    expect((await transition("d", { to: "DELETED" })).res.status).toBe(400);
    expect((await transition("d", { to: "SUBMITTED", action: "PUBLISH" })).res.status).toBe(400);
    expect((await transition("d", { to: "SUBMITTED", organizationId: "org-B" })).res.status).toBe(400);
    expect((await transition("d", { to: "SUBMITTED", actorUserId: "someone" })).res.status).toBe(400);
    expect((await transition("d", {})).res.status).toBe(400);
    expect(statusOf("d")).toBe("DRAFT");
  });

  it("415 on a non-JSON content type", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    expect((await transition("d", { to: "SUBMITTED" }, "text/plain")).res.status).toBe(415);
  });

  it("429 with Retry-After when the limiter refuses", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    state.rateLimitAllowed = false;
    const { res } = await transition("d", { to: "SUBMITTED" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(statusOf("d")).toBe("DRAFT");
  });
});

describe("POST …/transitions — the closed table", () => {
  beforeEach(() => actAs("MANAGER"));

  it("409s on an edge that does not exist, before any permission is considered", async () => {
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT", processingState: "READY" });
    const { res, json } = await transition("d", { to: "PUBLISHED" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("ILLEGAL_TRANSITION");
    expect(statusOf("d")).toBe("DRAFT");
  });

  it("409s on a self-transition rather than treating it as a no-op success", async () => {
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    const { res, json } = await transition("d", { to: "DRAFT" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("ILLEGAL_TRANSITION");
  });

  it("409s when a QUARANTINED asset is published from review", async () => {
    seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED", processingState: "QUARANTINED" });
    const { res, json } = await transition("s", { to: "PUBLISHED" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("PROCESSING_NOT_READY");
    expect(statusOf("s")).toBe("SUBMITTED");
  });

  it("409s when bytes were never uploaded", async () => {
    seedAsset(state, { id: "s", organizationId: "org-A", status: "IN_REVIEW", processingState: "PENDING_UPLOAD" });
    const { res, json } = await transition("s", { to: "PUBLISHED" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("PROCESSING_NOT_READY");
  });
});

describe("POST …/transitions — a permission per edge", () => {
  it("an ENGINEER may SUBMIT (manage_media)", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    const { res, json } = await transition("d", { to: "SUBMITTED" });
    expect(res.status).toBe(200);
    expect((json.transition as unknown as Record<string, string>).action).toBe("SUBMIT");
    expect(statusOf("d")).toBe("SUBMITTED");
  });

  it("an ENGINEER may NOT publish their own submission", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED", processingState: "READY" });
    const { res, json } = await transition("s", { to: "PUBLISHED" });
    expect(res.status).toBe(403);
    expect(json.code).toBe("INSUFFICIENT_PERMISSION");
    expect(statusOf("s")).toBe("SUBMITTED");
    expect(state.tables.mediaEditorialEvent.length).toBe(0);
  });

  it("an ENGINEER may NOT reject or start a review", async () => {
    actAs("ENGINEER");
    seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED", processingState: "READY" });
    expect((await transition("s", { to: "REJECTED" })).res.status).toBe(403);
    expect((await transition("s", { to: "IN_REVIEW" })).res.status).toBe(403);
  });

  it("a VIEWER may not move anything at all", async () => {
    actAs("VIEWER");
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    const { res } = await transition("d", { to: "SUBMITTED" });
    expect(res.status).toBe(403);
  });

  it("a MANAGER (review_media) may take a submission through to PUBLISHED", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED", processingState: "READY" });

    expect((await transition("s", { to: "IN_REVIEW" })).res.status).toBe(200);
    expect(statusOf("s")).toBe("IN_REVIEW");
    const published = await transition("s", { to: "PUBLISHED" });
    expect(published.res.status).toBe(200);
    expect(statusOf("s")).toBe("PUBLISHED");
    expect(state.tables.mediaAsset[0].publishedAt).toBeInstanceOf(Date);
  });
});

describe("POST …/transitions — optimistic concurrency", () => {
  beforeEach(() => actAs("MANAGER"));

  it("409s on a stale expectedStatus instead of overwriting", async () => {
    seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED", processingState: "READY" });
    const { res, json } = await transition("s", { to: "PUBLISHED", expectedStatus: "IN_REVIEW" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("STALE_STATE");
    expect(statusOf("s")).toBe("SUBMITTED");
    expect(state.tables.mediaEditorialEvent.length).toBe(0);
  });

  it("proceeds when expectedStatus matches", async () => {
    seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED", processingState: "READY" });
    const { res } = await transition("s", { to: "PUBLISHED", expectedStatus: "SUBMITTED" });
    expect(res.status).toBe(200);
    expect(statusOf("s")).toBe("PUBLISHED");
  });

  it("409s CONFLICT when another replica moves the row between the read and the write", async () => {
    const row = seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED", processingState: "READY" });

    // A concurrent writer lands the instant before the compare-and-swap. The
    // repository pinned the status it read, so the predicate now matches nothing
    // and `affected !== 1` must surface as a conflict — never as a write that
    // clobbers whatever the other replica just decided.
    state.raceHooks["mediaAsset.updateMany"] = () => {
      row.status = "ARCHIVED";
    };

    const { res, json } = await transition("s", { to: "PUBLISHED" });
    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(statusOf("s")).toBe("ARCHIVED");
    expect(state.tables.mediaEditorialEvent.length).toBe(0);
  });
});

describe("POST …/transitions — the accountable record", () => {
  beforeEach(() => actAs("MANAGER"));

  it("writes a MediaEditorialEvent AND an AuditLog entry in the same act", async () => {
    seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED", processingState: "READY" });
    const { res } = await transition("s", { to: "PUBLISHED", reason: "Reviewed by the safety lead" });
    expect(res.status).toBe(200);

    expect(state.tables.mediaEditorialEvent.length).toBe(1);
    const event = state.tables.mediaEditorialEvent[0];
    expect(event).toMatchObject({
      organizationId: "org-A",
      mediaAssetId: "s",
      fromStatus: "SUBMITTED",
      toStatus: "PUBLISHED",
      action: "PUBLISH",
      actorUserId: "user-1",
      reason: "Reviewed by the safety lead",
    });

    const audit = state.auditEvents.find((e) => e.action === "media.asset.transitioned");
    expect(audit).toBeDefined();
    expect(audit?.organizationId).toBe("org-A");
    expect(audit?.entityId).toBe("s");
    expect((audit?.metadata as Record<string, unknown>).requiredPermission).toBe("review_media");
  });

  it("keeps operator free text out of the audit metadata", async () => {
    seedAsset(state, { id: "s", organizationId: "org-A", status: "SUBMITTED", processingState: "READY" });
    await transition("s", { to: "REJECTED", reason: "Contains an unredacted customer name" });

    const audit = state.auditEvents.find((e) => e.action === "media.asset.transitioned");
    expect(JSON.stringify(audit)).not.toContain("unredacted customer name");
    expect((audit?.metadata as Record<string, unknown>).hasReason).toBe(true);
    // The reason itself is preserved where it belongs: the editorial record.
    expect(state.tables.mediaEditorialEvent[0].reason).toBe("Contains an unredacted customer name");
  });

  it("records nothing when the transition is refused", async () => {
    seedAsset(state, { id: "d", organizationId: "org-A", status: "DRAFT" });
    await transition("d", { to: "PUBLISHED" });
    expect(state.auditEvents.filter((e) => e.action === "media.asset.transitioned").length).toBe(0);
    expect(state.tables.mediaEditorialEvent.length).toBe(0);
  });
});

describe("POST …/transitions — the full editorial round trip", () => {
  it("DRAFT → SUBMITTED → IN_REVIEW → REJECTED → DRAFT → SUBMITTED → PUBLISHED → ARCHIVED → DRAFT", async () => {
    // One actor holding every media permission, so the walk exercises the table
    // rather than the role split (which the tests above cover).
    actAs("OWNER");
    seedAsset(state, { id: "w", organizationId: "org-A", status: "DRAFT", processingState: "READY" });

    const walk: Array<[string, string]> = [
      ["SUBMITTED", "SUBMIT"],
      ["IN_REVIEW", "START_REVIEW"],
      ["REJECTED", "REJECT"],
      ["DRAFT", "RESTORE"],
      ["SUBMITTED", "SUBMIT"],
      ["PUBLISHED", "PUBLISH"],
      ["ARCHIVED", "ARCHIVE"],
      ["DRAFT", "RESTORE"],
    ];

    for (const [to, action] of walk) {
      const { res, json } = await transition("w", { to });
      expect(res.status, `${to} should be reachable`).toBe(200);
      expect((json.transition as unknown as Record<string, string>).action).toBe(action);
      expect(statusOf("w")).toBe(to);
    }

    expect(state.tables.mediaEditorialEvent.length).toBe(walk.length);
    // publishedAt is stamped once and survives the archive/restore round trip.
    expect(state.tables.mediaAsset[0].publishedAt).toBeInstanceOf(Date);
  });
});

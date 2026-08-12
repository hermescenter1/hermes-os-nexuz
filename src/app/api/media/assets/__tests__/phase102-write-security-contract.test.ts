/**
 * PHASE 102 / RELEASE BLOCKERS 3 and 7 — the cross-site and commercial gates on
 * the media authoring writes.
 *
 * BLOCKER 3 — CSRF
 * `POST /api/media/assets`, `PATCH /api/media/assets/[id]` and
 * `POST …/transitions` are cookie-authenticated state changes that carried no
 * origin check at all. The sibling `me/progress` and `me/favourites` routes
 * already had one, which is what made the omission a gap rather than a policy.
 * A cross-site page could therefore make an authenticated editor create, edit,
 * submit, publish or archive material, because the browser attaches the session
 * cookie on its own.
 *
 * The policy is keyed on HOW the caller authenticated: cookie/JWT callers must
 * present an allowed `Origin`; API-key callers are exempt, because a key must be
 * set deliberately on every request and no browser will attach one — requiring
 * an `Origin` from server-to-server clients would break real integrations and
 * buy nothing.
 *
 * BLOCKER 7 — ENTITLEMENT
 * The collection POST and both byte uploads gated on `video_hub`. PATCH and the
 * editorial transitions did not, so a tenant with no entitlement could still
 * edit metadata and — worse — PUBLISH. The gate now covers both, with one
 * deliberately narrow exception: `ARCHIVE` and `REJECT` stay available without
 * entitlement, because a commercial gate that traps a customer's published
 * material in public view with no way to withdraw it is a hostage, not a gate.
 *
 * WHAT IS NOT MOCKED: the RBAC table, the transition table, the repository and
 * the real `isAllowedOrigin`. Only the database, token verification, the audit
 * sink, the limiter and the entitlement resolver are doubled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALLOWED_ORIGIN,
  FOREIGN_ORIGIN,
  LOOKALIKE_ORIGIN,
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

async function createAsset(origin: string | null) {
  const { POST } = await import("../route");
  const body = { title: `CSRF probe ${Math.random().toString(36).slice(2, 8)}`, primaryLocale: "en" };
  return POST(jsonRequest("POST", body, "", "application/json", origin));
}

async function patchAsset(id: string, origin: string | null) {
  const { PATCH } = await import("../[id]/route");
  return PATCH(jsonRequest("PATCH", { title: "Edited" }, `/${id}`, "application/json", origin), {
    params: Promise.resolve({ id }),
  });
}

async function transition(id: string, to: string, origin: string | null) {
  const { POST } = await import("../[id]/transitions/route");
  return POST(jsonRequest("POST", { to }, `/${id}/transitions`, "application/json", origin), {
    params: Promise.resolve({ id }),
  });
}

/* ═══════════════════════ BLOCKER 3 — the origin gate ════════════════════════ */

describe("cookie-authenticated media writes require an allowed Origin", () => {
  /** Every origin a cookie write must refuse, and why each one matters. */
  const REFUSED: ReadonlyArray<readonly [string, string | null]> = [
    ["absent — a classic cross-site form post sends none", null],
    ["cross-site", FOREIGN_ORIGIN],
    ["a suffix look-alike of the canonical host", LOOKALIKE_ORIGIN],
    ["the canonical host over plain http", ALLOWED_ORIGIN.replace(/^https:/, "http:")],
    ["a same-site-but-not-allowed host", "https://internal.hermesnovin.com.evil.example"],
    ["not a URL at all", "null"],
  ];

  for (const [label, origin] of REFUSED) {
    it(`POST /api/media/assets refuses an Origin that is ${label}`, async () => {
      actAs("MANAGER");
      const res = await createAsset(origin);
      expect(res.status).toBe(403);
      // Refused BEFORE anything was written.
      expect(state.tables.mediaAsset.length).toBe(0);
      expect(state.auditEvents.length).toBe(0);
    });

    it(`PATCH /api/media/assets/[id] refuses an Origin that is ${label}`, async () => {
      actAs("MANAGER");
      seedAsset(state, { id: "asset-1", organizationId: "org-A", status: "DRAFT" });
      const res = await patchAsset("asset-1", origin);
      expect(res.status).toBe(403);
      expect(state.tables.mediaAsset[0].updatedBy ?? null).toBeNull();
    });

    it(`POST …/transitions refuses an Origin that is ${label}`, async () => {
      actAs("MANAGER");
      seedAsset(state, { id: "asset-1", organizationId: "org-A", status: "DRAFT" });
      const res = await transition("asset-1", "SUBMITTED", origin);
      expect(res.status).toBe(403);
      expect(state.tables.mediaAsset[0].status).toBe("DRAFT");
      expect(state.tables.mediaEditorialEvent.length).toBe(0);
    });
  }

  it("accepts the allowed same-origin value — the gate is not simply always closed", async () => {
    actAs("MANAGER");
    expect((await createAsset(ALLOWED_ORIGIN)).status).toBe(201);
  });

  it("accepts the www counterpart of the canonical host", async () => {
    actAs("MANAGER");
    const host = new URL(ALLOWED_ORIGIN).hostname;
    const counterpart = host.startsWith("www.")
      ? ALLOWED_ORIGIN.replace("www.", "")
      : ALLOWED_ORIGIN.replace("://", "://www.");
    expect((await createAsset(counterpart)).status).toBe(201);
  });

  it("refuses a cross-site Origin without disclosing whether the asset exists", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "asset-real", organizationId: "org-A", status: "DRAFT" });

    const existing = await patchAsset("asset-real", FOREIGN_ORIGIN);
    const missing = await patchAsset("asset-does-not-exist", FOREIGN_ORIGIN);
    const otherTenant = await (async () => {
      seedAsset(state, { id: "asset-b", organizationId: "org-B", status: "DRAFT" });
      return patchAsset("asset-b", FOREIGN_ORIGIN);
    })();

    const bodies = await Promise.all([existing.json(), missing.json(), otherTenant.json()]);

    expect([existing.status, missing.status, otherTenant.status]).toEqual([403, 403, 403]);
    // Byte-identical bodies: the status alone would already be uniform, so the
    // payload is what a determined prober would read next.
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });
});

/* ═════════════════ BLOCKER 7 — the video_hub entitlement gate ═══════════════ */

describe("PATCH is gated on the video_hub entitlement", () => {
  it("refuses an edit for a tenant without the entitlement, and writes nothing", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "asset-1", organizationId: "org-A", status: "DRAFT" });
    state.entitlementAllowed = false;

    const res = await patchAsset("asset-1", ALLOWED_ORIGIN);

    expect(res.status).toBe(402);
    expect(state.tables.mediaAsset[0].updatedBy ?? null).toBeNull();
    expect(state.entitlementCalls.length).toBe(1);
    expect(state.entitlementCalls[0]).toMatchObject({
      entitlementKey: "video_hub",
      organisationId: "org-A",
    });
  });

  it("asks for AVAILABILITY, not another metered unit — an edit is not a new asset", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "asset-1", organizationId: "org-A", status: "DRAFT" });
    await patchAsset("asset-1", ALLOWED_ORIGIN);
    expect(state.entitlementCalls[0].requestedUnits).toBe(0);
  });

  it("runs AFTER the RBAC decision — an unauthorized caller is refused on RBAC", async () => {
    actAs("VIEWER");
    seedAsset(state, { id: "asset-1", organizationId: "org-A", status: "DRAFT" });
    state.entitlementAllowed = false;

    const res = await patchAsset("asset-1", ALLOWED_ORIGIN);

    expect(res.status).toBe(403);
    // The commercial resolver was never consulted for a caller RBAC refused.
    expect(state.entitlementCalls.length).toBe(0);
  });

  it("allows the edit when the tenant IS entitled", async () => {
    actAs("MANAGER");
    seedAsset(state, { id: "asset-1", organizationId: "org-A", status: "DRAFT" });
    expect((await patchAsset("asset-1", ALLOWED_ORIGIN)).status).toBe(200);
  });
});

describe("editorial transitions are gated, except the exposure-reducing ones", () => {
  /** Forward moves. Each either publishes or resumes authoring, so each is gated. */
  const GATED: ReadonlyArray<readonly [string, string]> = [
    ["DRAFT", "SUBMITTED"],
    ["SUBMITTED", "IN_REVIEW"],
    ["IN_REVIEW", "PUBLISHED"],
    ["ARCHIVED", "DRAFT"],
  ];

  for (const [from, to] of GATED) {
    it(`refuses ${from} → ${to} without the entitlement, leaving the status unchanged`, async () => {
      actAs("OWNER");
      seedAsset(state, { id: "asset-1", organizationId: "org-A", status: from, processingState: "READY" });
      state.entitlementAllowed = false;

      const res = await transition("asset-1", to, ALLOWED_ORIGIN);

      expect(res.status).toBe(402);
      expect(state.tables.mediaAsset[0].status).toBe(from);
      expect(state.tables.mediaEditorialEvent.length).toBe(0);
    });
  }

  /**
   * The exception, stated as the two actions that cannot increase exposure.
   * ARCHIVE is how live material is withdrawn; REJECT is the ONLY exit from
   * SUBMITTED / IN_REVIEW that does not publish.
   */
  const EXEMPT: ReadonlyArray<readonly [string, string, string]> = [
    ["PUBLISHED", "ARCHIVED", "withdrawing live material must never need a licence"],
    ["DRAFT", "ARCHIVED", "cleanup of a draft"],
    ["REJECTED", "ARCHIVED", "cleanup of rejected material"],
    ["SUBMITTED", "REJECTED", "the only non-publishing exit from SUBMITTED"],
    ["IN_REVIEW", "REJECTED", "the only non-publishing exit from IN_REVIEW"],
  ];

  for (const [from, to, why] of EXEMPT) {
    it(`allows ${from} → ${to} without the entitlement — ${why}`, async () => {
      actAs("OWNER");
      seedAsset(state, { id: "asset-1", organizationId: "org-A", status: from, processingState: "READY" });
      state.entitlementAllowed = false;

      const res = await transition("asset-1", to, ALLOWED_ORIGIN);

      expect(res.status).toBe(200);
      expect(state.tables.mediaAsset[0].status).toBe(to);
      // The exemption skips the gate entirely rather than calling it and
      // ignoring the answer — otherwise a metered call would still be recorded.
      expect(state.entitlementCalls.length).toBe(0);
    });
  }

  it("still enforces RBAC on an exempt transition — the exception is commercial only", async () => {
    actAs("VIEWER");
    seedAsset(state, { id: "asset-1", organizationId: "org-A", status: "PUBLISHED", processingState: "READY" });
    state.entitlementAllowed = false;

    const res = await transition("asset-1", "ARCHIVED", ALLOWED_ORIGIN);

    expect(res.status).toBe(403);
    expect(state.tables.mediaAsset[0].status).toBe("PUBLISHED");
  });

  it("still enforces tenancy on an exempt transition", async () => {
    actAs("OWNER");
    seedAsset(state, { id: "asset-b", organizationId: "org-B", status: "PUBLISHED", processingState: "READY" });
    state.entitlementAllowed = false;

    const res = await transition("asset-b", "ARCHIVED", ALLOWED_ORIGIN);

    expect(res.status).toBe(404);
    expect(state.tables.mediaAsset[0].status).toBe("PUBLISHED");
  });

  it("asks for availability rather than metering a unit on a gated transition", async () => {
    actAs("OWNER");
    seedAsset(state, { id: "asset-1", organizationId: "org-A", status: "DRAFT", processingState: "READY" });
    await transition("asset-1", "SUBMITTED", ALLOWED_ORIGIN);
    expect(state.entitlementCalls.length).toBe(1);
    expect(state.entitlementCalls[0]).toMatchObject({
      entitlementKey: "video_hub",
      requestedUnits: 0,
    });
  });
});

/* ══════════ The classification itself, proven exhaustive over the table ═════ */

describe("every editorial action is classified — nothing defaults to exempt", () => {
  it("classifies each action in the real transition table", async () => {
    const {
      MEDIA_EDITORIAL_TRANSITIONS,
      MEDIA_EXPOSURE_REDUCING_ACTIONS,
      editorialActionRequiresEntitlement,
    } = await import("@/lib/media/lifecycle");

    const actions = new Set<string>();
    for (const edges of Object.values(MEDIA_EDITORIAL_TRANSITIONS)) {
      for (const edge of edges) actions.add(edge.action);
    }

    // Guards the guard: an empty vocabulary would make the loop vacuous.
    expect(actions.size).toBe(6);
    expect([...actions].sort()).toEqual([
      "ARCHIVE",
      "PUBLISH",
      "REJECT",
      "RESTORE",
      "START_REVIEW",
      "SUBMIT",
    ]);

    for (const action of actions) {
      const exempt = (MEDIA_EXPOSURE_REDUCING_ACTIONS as readonly string[]).includes(action);
      expect(editorialActionRequiresEntitlement(action as never)).toBe(!exempt);
    }

    expect([...MEDIA_EXPOSURE_REDUCING_ACTIONS].sort()).toEqual(["ARCHIVE", "REJECT"]);
  });

  it("fails closed for an action nobody classified", async () => {
    const { editorialActionRequiresEntitlement } = await import("@/lib/media/lifecycle");
    // A future action added to the vocabulary but not to the exempt list must be
    // GATED, never silently free.
    expect(editorialActionRequiresEntitlement("SOME_NEW_ACTION" as never)).toBe(true);
  });

  it("keeps PUBLISH gated — the exception must never widen to publication", async () => {
    const { editorialActionRequiresEntitlement } = await import("@/lib/media/lifecycle");
    expect(editorialActionRequiresEntitlement("PUBLISH")).toBe(true);
    expect(editorialActionRequiresEntitlement("SUBMIT")).toBe(true);
    expect(editorialActionRequiresEntitlement("START_REVIEW")).toBe(true);
    expect(editorialActionRequiresEntitlement("RESTORE")).toBe(true);
  });
});

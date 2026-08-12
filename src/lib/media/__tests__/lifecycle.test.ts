/**
 * PHASE 102 — the editorial and processing state machines, proven in isolation.
 *
 * The legal edge sets below are written out BY HAND rather than derived from the
 * table under test. Deriving them would make the test tautological: it would pass
 * for any table, including one that quietly grew an `ARCHIVED → PUBLISHED` edge.
 * Here, adding or removing an edge in `lifecycle.ts` fails this file until someone
 * states the change in the specification too.
 */

import { describe, it, expect } from "vitest";
import type { OrgPermission } from "@/lib/org/rbac";
import {
  MEDIA_EDITORIAL_TRANSITIONS,
  MEDIA_PROCESSING_TRANSITIONS,
  TERMINAL_MEDIA_PROCESSING_STATES,
  allowedTransitionsFrom,
  canTransition,
  canTransitionProcessing,
  evaluateProcessingTransition,
  evaluateTransition,
  findEditorialTransition,
  listEditorialTransitions,
  listProcessingTransitions,
} from "../lifecycle";
import {
  MEDIA_LIFECYCLE_STATUSES,
  MEDIA_PROCESSING_STATES,
  type MediaLifecycleStatus,
  type MediaProcessingState,
} from "../types";

// ── The specification, restated independently of the implementation ──────────

interface Spec {
  from: MediaLifecycleStatus;
  to: MediaLifecycleStatus;
  action: string;
  permission: OrgPermission;
}

const LEGAL_EDITORIAL: Spec[] = [
  { from: "DRAFT", to: "SUBMITTED", action: "SUBMIT", permission: "manage_media" },
  { from: "DRAFT", to: "ARCHIVED", action: "ARCHIVE", permission: "manage_media" },
  { from: "SUBMITTED", to: "IN_REVIEW", action: "START_REVIEW", permission: "review_media" },
  { from: "SUBMITTED", to: "PUBLISHED", action: "PUBLISH", permission: "review_media" },
  { from: "SUBMITTED", to: "REJECTED", action: "REJECT", permission: "review_media" },
  { from: "IN_REVIEW", to: "PUBLISHED", action: "PUBLISH", permission: "review_media" },
  { from: "IN_REVIEW", to: "REJECTED", action: "REJECT", permission: "review_media" },
  { from: "PUBLISHED", to: "ARCHIVED", action: "ARCHIVE", permission: "manage_media" },
  { from: "REJECTED", to: "DRAFT", action: "RESTORE", permission: "manage_media" },
  { from: "REJECTED", to: "ARCHIVED", action: "ARCHIVE", permission: "manage_media" },
  { from: "ARCHIVED", to: "DRAFT", action: "RESTORE", permission: "manage_media" },
];

const key = (from: string, to: string) => `${from}->${to}`;
const LEGAL_KEYS = new Set(LEGAL_EDITORIAL.map((e) => key(e.from, e.to)));

const ALL_PERMS: OrgPermission[] = ["view_media", "manage_media", "review_media"];

describe("PHASE 102 editorial transition table — closed and exhaustive", () => {
  it("declares exactly the specified edges, no more and no fewer", () => {
    const actual = listEditorialTransitions()
      .map((t) => `${t.from}->${t.to}:${t.action}:${t.permission}`)
      .sort();
    const expected = LEGAL_EDITORIAL.map(
      (t) => `${t.from}->${t.to}:${t.action}:${t.permission}`,
    ).sort();
    expect(actual).toEqual(expected);
  });

  it("accepts every legal move and rejects every one of the other 25 pairs", () => {
    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const from of MEDIA_LIFECYCLE_STATUSES) {
      for (const to of MEDIA_LIFECYCLE_STATUSES) {
        (canTransition(from, to, ALL_PERMS) ? accepted : rejected).push(key(from, to));
      }
    }
    expect(accepted.sort()).toEqual([...LEGAL_KEYS].sort());
    // 6 x 6 = 36 ordered pairs; 11 are legal, so 25 must be refused.
    expect(rejected).toHaveLength(36 - LEGAL_EDITORIAL.length);
  });

  it("never treats a self-transition as legal", () => {
    for (const s of MEDIA_LIFECYCLE_STATUSES) {
      expect(canTransition(s, s, ALL_PERMS)).toBe(false);
      expect(evaluateTransition({ from: s, to: s, permissions: ALL_PERMS })).toEqual({
        ok: false,
        reason: "ILLEGAL_TRANSITION",
      });
    }
  });

  it("makes every state reachable — including IN_REVIEW and ARCHIVED", () => {
    const targets = new Set(LEGAL_EDITORIAL.map((e) => e.to));
    for (const s of MEDIA_LIFECYCLE_STATUSES) expect(targets.has(s)).toBe(true);
    // The two states the Article machine declares but never writes.
    expect(targets.has("IN_REVIEW")).toBe(true);
    expect(targets.has("ARCHIVED")).toBe(true);
  });

  it("gives every state at least one exit, so nothing is a dead end", () => {
    for (const s of MEDIA_LIFECYCLE_STATUSES) {
      expect(MEDIA_EDITORIAL_TRANSITIONS[s].length).toBeGreaterThan(0);
    }
  });

  it("attaches the specified permission to each edge", () => {
    for (const e of LEGAL_EDITORIAL) {
      const edge = findEditorialTransition(e.from, e.to);
      expect(edge).not.toBeNull();
      expect(edge?.permission).toBe(e.permission);
      expect(edge?.action).toBe(e.action);
    }
  });
});

describe("PHASE 102 editorial transitions — permission enforcement", () => {
  it("refuses every review decision to an actor holding only manage_media", () => {
    for (const e of LEGAL_EDITORIAL.filter((x) => x.permission === "review_media")) {
      expect(canTransition(e.from, e.to, ["manage_media"])).toBe(false);
      expect(
        evaluateTransition({
          from: e.from,
          to: e.to,
          permissions: ["manage_media"],
          processingState: "READY",
        }),
      ).toEqual({ ok: false, reason: "FORBIDDEN" });
    }
  });

  it("refuses every author move to an actor holding only review_media", () => {
    for (const e of LEGAL_EDITORIAL.filter((x) => x.permission === "manage_media")) {
      expect(canTransition(e.from, e.to, ["review_media"])).toBe(false);
    }
  });

  it("never lets view_media alone authorise anything", () => {
    for (const from of MEDIA_LIFECYCLE_STATUSES) {
      for (const to of MEDIA_LIFECYCLE_STATUSES) {
        expect(canTransition(from, to, ["view_media"])).toBe(false);
      }
    }
  });

  it("distinguishes an illegal move from a forbidden one", () => {
    // Legal edge, wrong permission → 403-shaped.
    expect(
      evaluateTransition({
        from: "DRAFT",
        to: "SUBMITTED",
        permissions: ["review_media"],
      }),
    ).toEqual({ ok: false, reason: "FORBIDDEN" });
    // Illegal edge, every permission → 409/422-shaped.
    expect(
      evaluateTransition({ from: "DRAFT", to: "PUBLISHED", permissions: ALL_PERMS }),
    ).toEqual({ ok: false, reason: "ILLEGAL_TRANSITION" });
  });

  it("reports only the moves the actor can actually make", () => {
    expect(allowedTransitionsFrom("SUBMITTED", ["manage_media"])).toEqual([]);
    expect(
      allowedTransitionsFrom("SUBMITTED", ["review_media"]).map((t) => t.to).sort(),
    ).toEqual(["IN_REVIEW", "PUBLISHED", "REJECTED"]);
    expect(allowedTransitionsFrom("ARCHIVED", ["manage_media"]).map((t) => t.to)).toEqual([
      "DRAFT",
    ]);
  });
});

describe("PHASE 102 publish guard — the two machines intersect exactly once", () => {
  it("refuses to publish unless the bytes are READY", () => {
    const notReady: MediaProcessingState[] = [
      "PENDING_UPLOAD",
      "UPLOADED",
      "VALIDATING",
      "FAILED",
      "QUARANTINED",
    ];
    for (const processingState of notReady) {
      expect(
        evaluateTransition({
          from: "SUBMITTED",
          to: "PUBLISHED",
          permissions: ALL_PERMS,
          processingState,
        }),
      ).toEqual({ ok: false, reason: "PROCESSING_NOT_READY" });
    }
    expect(
      evaluateTransition({
        from: "SUBMITTED",
        to: "PUBLISHED",
        permissions: ALL_PERMS,
        processingState: "READY",
      }).ok,
    ).toBe(true);
  });

  it("fails closed when the processing state is not supplied at all", () => {
    expect(
      evaluateTransition({ from: "IN_REVIEW", to: "PUBLISHED", permissions: ALL_PERMS }),
    ).toEqual({ ok: false, reason: "PROCESSING_NOT_READY" });
  });

  it("does not apply the byte guard to non-publishing edges", () => {
    expect(
      evaluateTransition({
        from: "DRAFT",
        to: "SUBMITTED",
        permissions: ALL_PERMS,
        processingState: "PENDING_UPLOAD",
      }).ok,
    ).toBe(true);
  });
});

// ── Processing machine ───────────────────────────────────────────────────────

interface ProcSpec {
  from: MediaProcessingState;
  to: MediaProcessingState;
  driver: "REQUEST" | "OPERATOR";
}

const LEGAL_PROCESSING: ProcSpec[] = [
  { from: "PENDING_UPLOAD", to: "UPLOADED", driver: "REQUEST" },
  { from: "PENDING_UPLOAD", to: "FAILED", driver: "REQUEST" },
  { from: "UPLOADED", to: "VALIDATING", driver: "OPERATOR" },
  { from: "UPLOADED", to: "FAILED", driver: "OPERATOR" },
  { from: "UPLOADED", to: "QUARANTINED", driver: "OPERATOR" },
  { from: "VALIDATING", to: "READY", driver: "OPERATOR" },
  { from: "VALIDATING", to: "FAILED", driver: "OPERATOR" },
  { from: "VALIDATING", to: "QUARANTINED", driver: "OPERATOR" },
  { from: "READY", to: "QUARANTINED", driver: "OPERATOR" },
  { from: "FAILED", to: "PENDING_UPLOAD", driver: "REQUEST" },
];

describe("PHASE 102 processing transition table (ADR §5)", () => {
  it("declares exactly the specified edges", () => {
    const actual = listProcessingTransitions()
      .map((t) => `${t.from}->${t.to}:${t.driver}`)
      .sort();
    const expected = LEGAL_PROCESSING.map((t) => `${t.from}->${t.to}:${t.driver}`).sort();
    expect(actual).toEqual(expected);
  });

  it("rejects every pair that is not a declared edge", () => {
    const legal = new Set(LEGAL_PROCESSING.map((e) => key(e.from, e.to)));
    for (const from of MEDIA_PROCESSING_STATES) {
      for (const to of MEDIA_PROCESSING_STATES) {
        expect(canTransitionProcessing(from, to)).toBe(legal.has(key(from, to)));
      }
    }
  });

  it("keeps QUARANTINED terminal — there is no scanner that could clear it", () => {
    expect(MEDIA_PROCESSING_TRANSITIONS.QUARANTINED).toEqual([]);
    expect(TERMINAL_MEDIA_PROCESSING_STATES).toEqual(["QUARANTINED"]);
    for (const to of MEDIA_PROCESSING_STATES) {
      expect(canTransitionProcessing("QUARANTINED", to)).toBe(false);
      expect(
        evaluateProcessingTransition({
          from: "QUARANTINED",
          to,
          driver: "OPERATOR",
        }),
      ).toEqual({ ok: false, reason: "ILLEGAL_TRANSITION" });
    }
  });

  it("makes every processing state reachable and leaves only QUARANTINED without an exit", () => {
    const targets = new Set(LEGAL_PROCESSING.map((e) => e.to));
    for (const s of MEDIA_PROCESSING_STATES) {
      if (s === "PENDING_UPLOAD") continue; // the initial state, also re-reachable
      expect(targets.has(s)).toBe(true);
    }
    expect(targets.has("PENDING_UPLOAD")).toBe(true); // via the FAILED retry path
    for (const s of MEDIA_PROCESSING_STATES) {
      const exits = MEDIA_PROCESSING_TRANSITIONS[s].length;
      expect(exits > 0).toBe(s !== "QUARANTINED");
    }
  });

  it("refuses an operator-only edge to an HTTP request, whatever it holds", () => {
    for (const e of LEGAL_PROCESSING.filter((x) => x.driver === "OPERATOR")) {
      expect(
        evaluateProcessingTransition({
          from: e.from,
          to: e.to,
          driver: "REQUEST",
          permissions: ALL_PERMS,
        }),
      ).toEqual({ ok: false, reason: "OPERATOR_ONLY" });
      // The same edge is available to the operator CLI.
      expect(
        evaluateProcessingTransition({ from: e.from, to: e.to, driver: "OPERATOR" }).ok,
      ).toBe(true);
    }
  });

  it("requires manage_media on the request-driven edges", () => {
    for (const e of LEGAL_PROCESSING.filter((x) => x.driver === "REQUEST")) {
      expect(
        evaluateProcessingTransition({
          from: e.from,
          to: e.to,
          driver: "REQUEST",
          permissions: ["view_media", "review_media"],
        }),
      ).toEqual({ ok: false, reason: "FORBIDDEN" });
      expect(
        evaluateProcessingTransition({
          from: e.from,
          to: e.to,
          driver: "REQUEST",
          permissions: ["manage_media"],
        }).ok,
      ).toBe(true);
      // No permissions supplied at all is a refusal, not a default-allow.
      expect(
        evaluateProcessingTransition({ from: e.from, to: e.to, driver: "REQUEST" }),
      ).toEqual({ ok: false, reason: "FORBIDDEN" });
    }
  });
});

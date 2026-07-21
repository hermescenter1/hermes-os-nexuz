import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINDING_STATES,
  TERMINAL_STATES,
  evaluateTransition,
  isFindingState,
  buildReviewPatch,
  TRANSITION_STATUS,
  TRANSITION_AUDIT,
  MAX_REVIEW_NOTE,
  MUTABLE_REVIEW_FIELDS,
  IMMUTABLE_FINDING_FIELDS,
  type FindingState,
} from "../finding-workflow";

/**
 * PHASE 94B2 — finding governance.
 *
 * The matrix is enumerated EXHAUSTIVELY: every ordered pair of states is
 * asserted, so an edge that is not in the specification cannot be added without
 * a test failing. That is the property a scattered set of conditionals cannot
 * give you.
 */

/** The specification, restated independently of the implementation. */
const SPEC: Record<FindingState, FindingState[]> = {
  OPEN: ["ACKNOWLEDGED", "ACCEPTED", "REJECTED", "SUPERSEDED"],
  ACKNOWLEDGED: ["ACCEPTED", "REJECTED", "RESOLVED", "SUPERSEDED"],
  ACCEPTED: ["RESOLVED", "SUPERSEDED"],
  REJECTED: [],
  RESOLVED: [],
  SUPERSEDED: [],
};

describe("94B2 — the transition matrix is exhaustive and closed", () => {
  it("every ordered pair of states matches the specification exactly", () => {
    for (const from of FINDING_STATES) {
      for (const to of FINDING_STATES) {
        const v = evaluateTransition(from, to);
        if (from === to) {
          expect(v.ok, `${from}→${to} (self) must be idempotent`).toBe(true);
          if (v.ok) expect(v.kind).toBe("NOOP");
          continue;
        }
        const allowed = SPEC[from].includes(to);
        expect(v.ok, `${from}→${to} should be ${allowed ? "allowed" : "refused"}`).toBe(allowed);
        if (v.ok) expect(v.kind).toBe("APPLY");
      }
    }
  });

  it("covers all 36 ordered pairs — nothing in the matrix is untested", () => {
    expect(FINDING_STATES.length).toBe(6);
    let checked = 0;
    for (const from of FINDING_STATES) for (const to of FINDING_STATES) { evaluateTransition(from, to); checked++; }
    expect(checked).toBe(36);
  });

  it.each([
    ["OPEN", "ACKNOWLEDGED"], ["OPEN", "ACCEPTED"], ["OPEN", "REJECTED"], ["OPEN", "SUPERSEDED"],
    ["ACKNOWLEDGED", "ACCEPTED"], ["ACKNOWLEDGED", "REJECTED"], ["ACKNOWLEDGED", "RESOLVED"],
    ["ACKNOWLEDGED", "SUPERSEDED"], ["ACCEPTED", "RESOLVED"], ["ACCEPTED", "SUPERSEDED"],
  ])("the documented edge %s → %s is permitted", (from, to) => {
    const v = evaluateTransition(from, to);
    expect(v.ok).toBe(true);
  });

  it.each([
    ["REJECTED", "OPEN"], ["RESOLVED", "OPEN"], ["SUPERSEDED", "OPEN"],
    ["RESOLVED", "ACCEPTED"], ["REJECTED", "ACCEPTED"], ["SUPERSEDED", "RESOLVED"],
    ["ACCEPTED", "OPEN"], ["ACCEPTED", "ACKNOWLEDGED"], ["ACCEPTED", "REJECTED"],
    ["ACKNOWLEDGED", "OPEN"],
  ])("the undocumented edge %s → %s is refused", (from, to) => {
    const v = evaluateTransition(from, to);
    expect(v.ok).toBe(false);
  });

  it("a terminal state cannot be left, and reports a conflict", () => {
    expect([...TERMINAL_STATES].sort()).toEqual(["REJECTED", "RESOLVED", "SUPERSEDED"]);
    for (const from of TERMINAL_STATES) {
      const v = evaluateTransition(from, "ACKNOWLEDGED");
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.reason).toBe("TERMINAL");
        expect(TRANSITION_STATUS[v.reason]).toBe(409);
      }
    }
  });

  it("nothing may transition INTO open — findings are born OPEN", () => {
    for (const from of FINDING_STATES) {
      if (from === "OPEN") continue;
      expect(evaluateTransition(from, "OPEN").ok).toBe(false);
    }
    expect(TRANSITION_AUDIT.OPEN).toBeNull();
  });

  it("an unknown state is unprocessable, not a conflict", () => {
    for (const bad of ["", "open", "DONE", "__proto__", "constructor"]) {
      const v = evaluateTransition(bad, "ACCEPTED");
      expect(v.ok, bad).toBe(false);
      if (!v.ok) {
        expect(v.reason).toBe("UNKNOWN_STATE");
        expect(TRANSITION_STATUS[v.reason]).toBe(422);
      }
      expect(evaluateTransition("OPEN", bad).ok).toBe(false);
    }
    expect(isFindingState("OPEN")).toBe(true);
    expect(isFindingState("open")).toBe(false);
  });

  it("a repeated identical transition is idempotent, never a duplicate audit", () => {
    for (const state of FINDING_STATES) {
      const v = evaluateTransition(state, state);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.kind, "must not re-APPLY").toBe("NOOP");
    }
  });

  it("every reachable state maps to an audit action", () => {
    for (const to of FINDING_STATES) {
      if (to === "OPEN") continue;
      expect(TRANSITION_AUDIT[to], `no audit action for ${to}`).toBeTruthy();
      expect(TRANSITION_AUDIT[to]).toMatch(/^ENGINEERING_FINDING_/);
    }
  });
});

describe("94B2 — a review may not rewrite deterministic evidence", () => {
  it("the patch contains ONLY review metadata", () => {
    const patch = buildReviewPatch({
      to: "ACCEPTED",
      reviewedById: "u-1",
      reviewedAt: new Date("2026-07-21T00:00:00.000Z"),
      reviewNote: "Reviewed with the site electrician.",
    });
    expect(Object.keys(patch).sort()).toEqual([...MUTABLE_REVIEW_FIELDS].sort());
    for (const forbidden of IMMUTABLE_FINDING_FIELDS) {
      expect(Object.keys(patch), `${forbidden} must not be writable`).not.toContain(forbidden);
    }
  });

  it("humanApprovalRequired is not a writable field", () => {
    // A safety finding must keep its approval flag no matter what a reviewer sends.
    expect([...MUTABLE_REVIEW_FIELDS]).not.toContain("humanApprovalRequired");
    expect([...IMMUTABLE_FINDING_FIELDS]).toContain("humanApprovalRequired");
  });

  it("bounds the review note and normalises an empty one to null", () => {
    const long = buildReviewPatch({
      to: "REJECTED", reviewedById: "u-1", reviewedAt: new Date(0),
      reviewNote: "x".repeat(MAX_REVIEW_NOTE + 500),
    });
    expect(long.reviewNote).toHaveLength(MAX_REVIEW_NOTE);

    for (const empty of ["", "   ", undefined, null]) {
      const p = buildReviewPatch({ to: "REJECTED", reviewedById: "u-1", reviewedAt: new Date(0), reviewNote: empty });
      expect(p.reviewNote).toBeNull();
    }
  });

  it("records who reviewed and when", () => {
    const at = new Date("2026-07-21T10:00:00.000Z");
    const p = buildReviewPatch({ to: "RESOLVED", reviewedById: "u-9", reviewedAt: at });
    expect(p.reviewedById).toBe("u-9");
    expect(p.reviewedAt).toBe(at);
    expect(p.state).toBe("RESOLVED");
  });
});

describe("94B2 — the workflow stays advisory", () => {
  const code = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/finding-workflow.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");

  it("emits no device, control or remediation instruction", () => {
    for (const forbidden of [/\bwrite(Tag|Value|Register)/i, /\bactuate/i, /\bsetpoint/i, /acknowledgeAlarm/i, /\bremediat/i, /\bplcWrite/i]) {
      expect(code, `${forbidden} must not appear`).not.toMatch(forbidden);
    }
  });

  it("is pure — no database, network or clock of its own", () => {
    expect(code).not.toMatch(/prisma|fetch\(|Date\.now\(\)|new Date\(\)/);
  });

  it("declares the matrix once, as frozen data", () => {
    expect(code).toMatch(/Object\.freeze\(/);
    // The allowed edges must not be re-expressed as scattered comparisons.
    const comparisons = code.match(/from === "[A-Z_]+"\s*&&\s*to === "[A-Z_]+"/g) ?? [];
    expect(comparisons, "edges must live in the matrix, not in conditionals").toHaveLength(0);
  });
});

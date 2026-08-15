/**
 * The demo/sales lead transition table, asserted as a complete matrix.
 *
 * Every (from, to) pair in the closed vocabulary is enumerated and checked
 * against an expectation written out here independently of the implementation,
 * so a future edit to SALES_LEAD_TRANSITIONS cannot quietly widen the machine —
 * adding a route out of REJECTED or CLOSED, or re-opening a self-transition,
 * fails this test rather than shipping.
 */
import { describe, it, expect } from "vitest";
import {
  ACCESS_REQUEST_SOURCE,
  SALES_LEAD_STATUSES,
  SALES_LEAD_TRANSITIONS,
  allowedTransitions,
  canTransition,
  isSalesLeadStatus,
  type SalesLeadStatus,
} from "../lead-status";

/** The accepted lifecycle, restated independently of the module under test. */
const EXPECTED: Record<SalesLeadStatus, SalesLeadStatus[]> = {
  NEW:       ["REVIEWED", "REJECTED"],
  REVIEWED:  ["CONTACTED", "REJECTED"],
  CONTACTED: ["APPROVED", "REJECTED"],
  APPROVED:  ["CLOSED"],
  REJECTED:  [],
  CLOSED:    [],
};

describe("sales lead status vocabulary", () => {
  it("is exactly the six statuses the admin leads page renders", () => {
    expect([...SALES_LEAD_STATUSES]).toEqual([
      "NEW", "REVIEWED", "CONTACTED", "APPROVED", "REJECTED", "CLOSED",
    ]);
  });

  it("recognises only members of the closed vocabulary", () => {
    for (const s of SALES_LEAD_STATUSES) expect(isSalesLeadStatus(s)).toBe(true);
    for (const s of ["", "new", "PENDING", "ACCEPTED", "QUALIFIED", "DELETED"]) {
      expect(isSalesLeadStatus(s), s).toBe(false);
    }
    for (const s of [null, undefined, 0, {}, ["NEW"]]) {
      expect(isSalesLeadStatus(s)).toBe(false);
    }
  });

  it("keeps the access-request source tag the auth flow actually writes", () => {
    // Drifting from the literal written by /api/auth/access-request would
    // silently unhook the guard that separates the two state machines.
    expect(ACCESS_REQUEST_SOURCE).toBe("AUTH_ACCESS_REQUEST");
  });
});

describe("transition matrix — every (from, to) pair", () => {
  const pairs = SALES_LEAD_STATUSES.flatMap((from) =>
    SALES_LEAD_STATUSES.map((to) => [from, to] as const),
  );

  it.each(pairs)("%s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(EXPECTED[from].includes(to));
  });

  it("covers all 36 ordered pairs", () => {
    expect(pairs.length).toBe(36);
  });
});

describe("lifecycle properties", () => {
  it("advances NEW -> REVIEWED -> CONTACTED -> APPROVED -> CLOSED", () => {
    expect(canTransition("NEW", "REVIEWED")).toBe(true);
    expect(canTransition("REVIEWED", "CONTACTED")).toBe(true);
    expect(canTransition("CONTACTED", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "CLOSED")).toBe(true);
  });

  it("allows rejection from every pre-decision state", () => {
    for (const from of ["NEW", "REVIEWED", "CONTACTED"] as const) {
      expect(canTransition(from, "REJECTED"), from).toBe(true);
    }
  });

  it("treats REJECTED and CLOSED as terminal — a decided lead is never resurrected", () => {
    for (const terminal of ["REJECTED", "CLOSED"] as const) {
      expect(allowedTransitions(terminal)).toEqual([]);
      for (const to of SALES_LEAD_STATUSES) {
        expect(canTransition(terminal, to), `${terminal} -> ${to}`).toBe(false);
      }
    }
  });

  it("has no self-transitions, so re-clicking a control is never a state change", () => {
    for (const s of SALES_LEAD_STATUSES) expect(canTransition(s, s), s).toBe(false);
  });

  it("never routes backwards to NEW", () => {
    for (const from of SALES_LEAD_STATUSES) {
      expect(canTransition(from, "NEW"), from).toBe(false);
    }
  });

  it("skips no stage — NEW cannot jump straight to APPROVED or CLOSED", () => {
    expect(canTransition("NEW", "APPROVED")).toBe(false);
    expect(canTransition("NEW", "CONTACTED")).toBe(false);
    expect(canTransition("NEW", "CLOSED")).toBe(false);
    expect(canTransition("REVIEWED", "APPROVED")).toBe(false);
  });

  it("names only known statuses as targets", () => {
    for (const targets of Object.values(SALES_LEAD_TRANSITIONS)) {
      for (const t of targets) expect(isSalesLeadStatus(t)).toBe(true);
    }
  });
});

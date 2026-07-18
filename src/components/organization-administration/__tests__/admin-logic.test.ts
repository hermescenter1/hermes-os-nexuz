import { describe, it, expect } from "vitest";
import {
  deriveAdminAttention, buildLimitRows, membersByStatus, invitationsByStatus,
  isExpiredInvitation, isLiveInvitation,
} from "../logic";
import type { MemberRecord, InvitationRecord } from "@/lib/org/types";
import type { SubscriptionRecord } from "@/lib/billing/types";

/**
 * PHASE 87K — the administration attention layer derives DETERMINISTICALLY
 * from real record fields. No invented severity, no claimed financial risk,
 * no security score, and a metric with no usage record is NEVER read as zero.
 */

const NOW = Date.parse("2026-07-18T00:00:00.000Z");

function member(over: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id: "m1", organizationId: "org1", userId: "u1", role: "MEMBER", status: "ACTIVE",
    departmentId: null, invitedById: null, joinedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}
function invitation(over: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: "i1", organizationId: "org1", email: "a@b.com", role: "MEMBER", status: "PENDING",
    invitedById: null, expiresAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}
function subscription(over: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: "s1", organizationId: "org1", planId: "p1", plan: null, status: "ACTIVE",
    billingCycle: "MONTHLY", startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z", autoRenew: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("invitation expiry — stored status and elapsed window both count", () => {
  it("treats a PENDING invitation past its expiresAt as expired", () => {
    expect(isExpiredInvitation(invitation({ expiresAt: "2026-07-01T00:00:00.000Z" }), NOW)).toBe(true);
    expect(isLiveInvitation(invitation({ expiresAt: "2026-07-01T00:00:00.000Z" }), NOW)).toBe(false);
  });
  it("treats a stored EXPIRED invitation as expired regardless of the date", () => {
    expect(isExpiredInvitation(invitation({ status: "EXPIRED", expiresAt: "2027-01-01T00:00:00.000Z" }), NOW)).toBe(true);
  });
  it("keeps a PENDING invitation inside its window live, and never counts accepted/rejected", () => {
    expect(isLiveInvitation(invitation(), NOW)).toBe(true);
    for (const status of ["ACCEPTED", "REJECTED"] as const) {
      expect(isExpiredInvitation(invitation({ status }), NOW)).toBe(false);
      expect(isLiveInvitation(invitation({ status }), NOW)).toBe(false);
    }
  });
});

describe("buildLimitRows — unlimited and unmeasured are distinct from zero", () => {
  const limits = { members: 10, projects: -1, storage_gb: 5, api_access: true };

  it("renders -1 as unlimited and never marks it reached", () => {
    const rows = buildLimitRows(limits, { projects: 999 }, ["projects"]);
    expect(rows).toEqual([{ metric: "projects", used: 999, limit: -1, unlimited: true, reached: false }]);
  });

  it("reports a metric with no usage record as used:null — NOT zero — and never reached", () => {
    const rows = buildLimitRows(limits, {}, ["members"]);
    expect(rows[0].used).toBeNull();
    expect(rows[0].reached).toBe(false);
  });

  it("marks reached only when a real used value meets a real finite limit", () => {
    expect(buildLimitRows(limits, { members: 10 }, ["members"])[0].reached).toBe(true);
    expect(buildLimitRows(limits, { members: 9 }, ["members"])[0].reached).toBe(false);
  });

  it("ignores boolean feature flags — they are not usage limits", () => {
    expect(buildLimitRows(limits, { api_access: 1 }, ["api_access"])).toEqual([]);
  });

  it("returns nothing when the organization has no plan limits", () => {
    expect(buildLimitRows(null, { members: 3 }, ["members"])).toEqual([]);
  });
});

describe("deriveAdminAttention — deterministic thresholds, stable priority", () => {
  it("orders billing/security impact first, review items after", () => {
    const items = deriveAdminAttention({
      members: [member({ id: "a", status: "SUSPENDED" }), member({ id: "b", status: "INVITED" })],
      invitations: [
        invitation({ id: "x", expiresAt: "2026-07-01T00:00:00.000Z" }), // expired
        invitation({ id: "y" }),                                        // live
      ],
      subscription: subscription({ status: "PAST_DUE" }),
      limitRows: buildLimitRows({ members: 1 }, { members: 5 }, ["members"]),
      now: NOW,
    });
    expect(items.map((i) => i.kind)).toEqual([
      "pastDue", "expiredInvitations", "suspendedMembers", "limitReached",
      "pendingInvitations", "invitedMembers",
    ]);
    expect(items.map((i) => i.severity)).toEqual([
      "action", "action", "action", "action", "review", "review",
    ]);
  });

  it("routes each item to a real administration destination", () => {
    const items = deriveAdminAttention({
      members: [member({ status: "SUSPENDED" })],
      invitations: [invitation()],
      subscription: subscription({ status: "PAST_DUE" }),
      limitRows: [], now: NOW,
    });
    expect(items.find((i) => i.kind === "pastDue")?.href).toBe("/dashboard/billing");
    expect(items.find((i) => i.kind === "suspendedMembers")?.href).toBe("/dashboard/organization/members");
    expect(items.find((i) => i.kind === "pendingInvitations")?.href).toBe("/dashboard/organization/invitations");
  });

  it("flags an ended subscription, and a missing subscription as review — never as a payment failure", () => {
    const ended = deriveAdminAttention({ members: [], invitations: [], subscription: subscription({ status: "CANCELED" }), limitRows: [], now: NOW });
    expect(ended.map((i) => i.kind)).toEqual(["subscriptionEnded"]);
    const none = deriveAdminAttention({ members: [], invitations: [], subscription: null, limitRows: [], now: NOW });
    expect(none).toEqual([{ id: "no-sub", kind: "noSubscription", severity: "review", count: 1, href: "/dashboard/billing" }]);
    // no rule ever asserts a payment failure or a security incident
    expect([...ended, ...none].some((i) => /payment|security|breach/i.test(i.kind))).toBe(false);
  });

  it("is empty for a healthy organization on an active subscription", () => {
    expect(deriveAdminAttention({
      members: [member()], invitations: [invitation({ status: "ACCEPTED" })],
      subscription: subscription(), limitRows: buildLimitRows({ members: 10 }, { members: 1 }, ["members"]),
      now: NOW,
    })).toEqual([]);
  });
});

describe("status distributions — stable order, zero rows dropped", () => {
  it("members: ACTIVE → INVITED → SUSPENDED", () => {
    expect(membersByStatus([
      member({ id: "1", status: "SUSPENDED" }), member({ id: "2", status: "ACTIVE" }),
      member({ id: "3", status: "ACTIVE" }),
    ])).toEqual([{ status: "ACTIVE", count: 2 }, { status: "SUSPENDED", count: 1 }]);
  });

  it("invitations: PENDING → EXPIRED → ACCEPTED → REJECTED", () => {
    expect(invitationsByStatus([
      invitation({ id: "1", status: "ACCEPTED" }), invitation({ id: "2", status: "PENDING" }),
      invitation({ id: "3", status: "EXPIRED" }),
    ])).toEqual([
      { status: "PENDING", count: 1 }, { status: "EXPIRED", count: 1 }, { status: "ACCEPTED", count: 1 },
    ]);
  });
});

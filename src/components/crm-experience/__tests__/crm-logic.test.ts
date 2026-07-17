import { describe, it, expect } from "vitest";
import { deriveCrmAttention, formatMoney } from "../logic";
import type { CrmLead, CrmDashboardStats } from "@/lib/crm/types";

/**
 * PHASE 87G — the sales attention layer is derived DETERMINISTICALLY from
 * existing record states (status/ownerId/deletedAt/atRiskAccounts). No
 * inferred urgency, no fabricated values.
 */

function lead(over: Partial<CrmLead>): CrmLead {
  return {
    id: "l1", organizationId: null, firstName: "Sara", lastName: "Karimi",
    email: "s@x.com", phone: null, company: "Acme", jobTitle: null,
    status: "NEW", source: "WEBSITE", score: 10, ownerId: null, notes: null,
    convertedAt: null, convertedToId: null, deletedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

const stats = (atRisk: number): CrmDashboardStats => ({
  totalLeads: 5, newLeadsThisMonth: 2, pipelineValue: 100, activeOpportunities: 3,
  conversionRate: 10, forecastRevenue: 50, renewalsThisQuarter: 1,
  healthyAccounts: 4, atRiskAccounts: atRisk, churnRisk: 5,
});

describe("deriveCrmAttention — deterministic record states only", () => {
  it("unassigned QUALIFIED leads outrank NEW leads; newest first inside a band", () => {
    const items = deriveCrmAttention(
      [
        lead({ id: "a", status: "NEW", createdAt: "2026-07-02T00:00:00.000Z" }),
        lead({ id: "b", status: "QUALIFIED", ownerId: null }),
        lead({ id: "c", status: "NEW", createdAt: "2026-07-03T00:00:00.000Z" }),
        lead({ id: "d", status: "QUALIFIED", ownerId: "u1" }), // owned → not attention
        lead({ id: "e", status: "CONTACTED" }),                // not attention
      ],
      stats(0),
    );
    expect(items.map((i) => i.kind)).toEqual(["unassignedLead", "newLead", "newLead"]);
    expect(items[1].id).toBe("new-c"); // newest NEW first
    expect(items.every((i) => i.href === "/crm/leads")).toBe(true);
  });

  it("soft-deleted leads never surface", () => {
    const items = deriveCrmAttention([lead({ status: "NEW", deletedAt: "2026-07-01T00:00:00.000Z" })], stats(0));
    expect(items).toEqual([]);
  });

  it("at-risk accounts appear as ONE aggregate item with the real count and the CS destination", () => {
    const items = deriveCrmAttention([], stats(3));
    expect(items).toEqual([
      { id: "cs-at-risk", kind: "atRiskAccounts", object: "", count: 3, href: "/crm/customer-success" },
    ]);
  });

  it("empty inputs give an empty list (drives the calm empty state, never fake items)", () => {
    expect(deriveCrmAttention([], stats(0))).toEqual([]);
    expect(deriveCrmAttention([], null)).toEqual([]);
  });

  it("caps the list while always keeping the at-risk aggregate visible", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      lead({ id: `n${i}`, status: "NEW", createdAt: `2026-07-0${(i % 9) + 1}T00:00:00.000Z` }),
    );
    const items = deriveCrmAttention(many, stats(2), 6);
    expect(items.length).toBe(6);
    expect(items[5].kind).toBe("atRiskAccounts");
  });
});

describe("formatMoney — the CRM's existing compact convention", () => {
  it("formats M/K/unit deterministically", () => {
    expect(formatMoney(2_400_000)).toBe("$2.4M");
    expect(formatMoney(340_000)).toBe("$340K");
    expect(formatMoney(900)).toBe("$900");
  });
});

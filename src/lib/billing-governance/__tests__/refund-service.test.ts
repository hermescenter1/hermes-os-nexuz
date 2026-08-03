import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  payments: new Map<string, Record<string, unknown>>(),
  audits: [] as string[],
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    payment: {
      findUnique: async ({ where }: { where: { id: string } }) => h.payments.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const p = h.payments.get(where.id)!;
        Object.assign(p, data);
        return p;
      },
    },
  }),
}));
vi.mock("@/lib/audit/audit-service", () => ({
  recordAuditEvent: async (e: { action: string }) => {
    h.audits.push(e.action);
  },
}));

import { recordManualRefund } from "../runtime/refund-service";

function payment(id: string, org: string, amount: string, refunded = "0") {
  h.payments.set(id, {
    id,
    amount: { toString: () => amount },
    refundedAmount: { toString: () => refunded },
    currency: "GBP",
    invoice: { organizationId: org },
  });
}

beforeEach(() => {
  h.payments = new Map();
  h.audits = [];
});

describe("manual refund — bounded, cross-tenant safe, audited", () => {
  it("records a partial refund and audits it", async () => {
    payment("pay_1", "org-1", "100.00");
    const out = await recordManualRefund({ organizationId: "org-1", paymentId: "pay_1", amount: "40.00", reason: "goodwill", refundedById: "admin-1" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.refundedTotal).toBe("40.0000");
    expect(h.audits).toContain("billing.refund_recorded");
  });

  it("marks REFUNDED when fully refunded", async () => {
    payment("pay_2", "org-1", "50.00", "20.00");
    const out = await recordManualRefund({ organizationId: "org-1", paymentId: "pay_2", amount: "30.00", reason: "full", refundedById: "a" });
    expect(out.ok).toBe(true);
    expect(h.payments.get("pay_2")!.status).toBe("REFUNDED");
  });

  it("rejects a refund over the refundable amount", async () => {
    payment("pay_3", "org-1", "100.00", "80.00");
    const out = await recordManualRefund({ organizationId: "org-1", paymentId: "pay_3", amount: "30.00", reason: "too much", refundedById: "a" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("OUT_OF_BOUNDS");
  });

  it("cannot refund another org's payment (NOT_FOUND, no leak)", async () => {
    payment("pay_4", "org-OWNER", "100.00");
    const out = await recordManualRefund({ organizationId: "org-ATTACKER", paymentId: "pay_4", amount: "10.00", reason: "attack", refundedById: "x" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("NOT_FOUND");
  });

  it("requires a reason", async () => {
    payment("pay_5", "org-1", "100.00");
    const out = await recordManualRefund({ organizationId: "org-1", paymentId: "pay_5", amount: "10.00", reason: "", refundedById: "a" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("VALIDATION");
  });
});

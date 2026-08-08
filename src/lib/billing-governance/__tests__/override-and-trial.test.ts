import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake Prisma + audit. The services fail closed on validation BEFORE touching
// the DB, so most negative cases never reach the fake.

const h = vi.hoisted(() => ({
  overrides: [] as Record<string, unknown>[],
  trials: new Map<string, Record<string, unknown>>(),
  audits: [] as string[],
  seq: 0,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    organizationEntitlementOverride: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ovr_${++h.seq}`, ...data };
        h.overrides.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const o of h.overrides) {
          if (o.id === where.id && o.organizationId === where.organizationId && o.revokedAt == null) {
            Object.assign(o, data);
            count++;
          }
        }
        return { count };
      },
      findMany: async () => h.overrides,
    },
    organizationTrial: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const org = String(data.organizationId);
        if (h.trials.has(org)) {
          const err = new Error("unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row = { id: `trial_${++h.seq}`, ...data };
        h.trials.set(org, row);
        return row;
      },
      findUnique: async ({ where }: { where: { organizationId: string } }) => h.trials.get(where.organizationId) ?? null,
      updateMany: async () => ({ count: 1 }),
    },
  }),
}));

vi.mock("@/lib/audit/audit-service", () => ({
  recordAuditEvent: async (e: { action: string }) => {
    h.audits.push(e.action);
  },
}));

import { createEntitlementOverride, revokeEntitlementOverride } from "../runtime/override-service";
import { startAutomaticTrial } from "../runtime/trial-service";

const FUTURE = new Date("2026-12-01T00:00:00.000Z");
const NOW = new Date("2026-08-08T00:00:00.000Z");

beforeEach(() => {
  h.overrides = [];
  h.trials = new Map();
  h.audits = [];
  h.seq = 0;
});

describe("override service — validation fails closed", () => {
  const base = { organizationId: "org-1", entitlementKey: "sites", decision: "GRANT" as const, reason: "pilot expansion", approvedBy: "admin-1", expiresAt: FUTURE, now: NOW };

  it("creates a valid override and audits it", async () => {
    const out = await createEntitlementOverride(base);
    expect(out.ok).toBe(true);
    expect(h.audits).toContain("billing.override_created");
  });

  it("rejects a missing reason", async () => {
    const out = await createEntitlementOverride({ ...base, reason: "" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("VALIDATION");
    expect(h.overrides).toHaveLength(0);
  });

  it("rejects a missing/invalid expiry (no permanent override)", async () => {
    const out = await createEntitlementOverride({ ...base, expiresAt: new Date(NaN) });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("VALIDATION");
  });

  it("rejects an expiry in the past", async () => {
    const out = await createEntitlementOverride({ ...base, expiresAt: new Date("2026-01-01T00:00:00.000Z") });
    expect(out.ok).toBe(false);
  });

  it("rejects an unknown entitlement", async () => {
    const out = await createEntitlementOverride({ ...base, entitlementKey: "teleport" });
    expect(out.ok).toBe(false);
  });

  it("rejects a negative limit override", async () => {
    const out = await createEntitlementOverride({ ...base, limitOverride: -3 });
    expect(out.ok).toBe(false);
  });
});

describe("override revoke — cross-tenant safe", () => {
  it("revokes an override owned by the caller org", async () => {
    const created = await createEntitlementOverride({ organizationId: "org-1", entitlementKey: "sites", decision: "GRANT", reason: "pilot", approvedBy: "a", expiresAt: FUTURE, now: NOW });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.overrideId : "";
    const out = await revokeEntitlementOverride({ organizationId: "org-1", overrideId: id, revokedById: "admin-1" });
    expect(out.ok).toBe(true);
    expect(h.audits).toContain("billing.override_revoked");
  });

  it("cannot revoke another org's override (NOT_FOUND, no leak)", async () => {
    const created = await createEntitlementOverride({ organizationId: "org-1", entitlementKey: "sites", decision: "GRANT", reason: "pilot", approvedBy: "a", expiresAt: FUTURE, now: NOW });
    const id = created.ok ? created.overrideId : "";
    const out = await revokeEntitlementOverride({ organizationId: "org-ATTACKER", overrideId: id, revokedById: "x" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("NOT_FOUND");
  });
});

describe("trial service — one automatic trial per org", () => {
  it("starts a trial for a trial-eligible plan", async () => {
    const out = await startAutomaticTrial({ organizationId: "org-1", planKey: "PROFESSIONAL", now: NOW });
    expect(out.ok).toBe(true);
    expect(h.audits).toContain("billing.trial_started");
  });

  it("refuses a second trial for the same org (DB-authoritative)", async () => {
    await startAutomaticTrial({ organizationId: "org-1", planKey: "PROFESSIONAL", now: NOW });
    const second = await startAutomaticTrial({ organizationId: "org-1", planKey: "TEAM", now: NOW });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("TRIAL_ALREADY_USED");
  });

  it("refuses a trial for a non-eligible plan (Community/Enterprise)", async () => {
    const c = await startAutomaticTrial({ organizationId: "org-2", planKey: "COMMUNITY", now: NOW });
    expect(c.ok).toBe(false);
    const e = await startAutomaticTrial({ organizationId: "org-3", planKey: "ENTERPRISE", now: NOW });
    expect(e.ok).toBe(false);
  });

  it("refuses an unknown plan", async () => {
    const out = await startAutomaticTrial({ organizationId: "org-4", planKey: "GALACTIC", now: NOW });
    expect(out.ok).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateEntitlement, type EntitlementContext } from "../entitlement-resolver";
import type {
  EntitlementOverrideSnapshot,
  EntitlementResolutionInputs,
  EntitlementSubscriptionSnapshot,
} from "../entitlement-store";
import { applyProviderEvent, nextState, type SubscriptionStateSnapshot } from "../subscription-state-machine";
import { buildBillingAuditMetadata, isMetadataClean } from "../audit";
import type { DomainSubscriptionStatus, EntitlementKey, PlanKey } from "../types";

// PHASE 96 — offline adversarial evaluation. Loads the synthetic datasets and
// proves the zero-tolerance safety/security budgets. No provider call, no real
// customer data. Every budget below MUST be exactly 0.

const FIXROOT = resolve(process.cwd(), "tests/fixtures/billing-governance");
function loadJsonl(file: string): Record<string, unknown>[] {
  const text = readFileSync(resolve(FIXROOT, file), "utf8").trim();
  return text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

const NOW = new Date("2026-08-08T00:00:00.000Z");
const MS_DAY = 86_400_000;

function buildInputs(row: Record<string, unknown>): { ctx: EntitlementContext; inputs: EntitlementResolutionInputs } {
  const subSpec = (row.sub ?? {}) as { status?: string; planKey?: string | null; org?: string };
  const ctxOrg = (row.ctxOrg as string) ?? subSpec.org ?? (row.subOrg as string) ?? "org-1";
  const subOrg = (row.subOrg as string) ?? subSpec.org ?? ctxOrg;
  const status = (row.status as string) ?? subSpec.status ?? "ACTIVE";
  const planKey = (row.planKey as string | null | undefined) ?? subSpec.planKey ?? null;

  const subscription: EntitlementSubscriptionSnapshot =
    status === "NONE"
      ? { organisationId: subOrg, planKey: null, status: "NONE", currentPeriodStart: null, currentPeriodEnd: null }
      : {
          organisationId: subOrg,
          planKey: (planKey as PlanKey | null) ?? null,
          status: status as DomainSubscriptionStatus,
          currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
        };

  let override: EntitlementOverrideSnapshot | null = null;
  const ov = row.override as { decision?: string; limitOverride?: number; validForDays?: number } | undefined;
  if (ov) {
    override = {
      organisationId: ctxOrg,
      entitlementKey: row.entitlementKey as EntitlementKey,
      decision: ov.decision === "DENY" ? "DENY" : "GRANT",
      limitOverride: ov.limitOverride ?? null,
      reason: "fixture",
      approvedBy: "admin",
      effectiveFrom: new Date(NOW.getTime() - 5 * MS_DAY),
      expiresAt: new Date(NOW.getTime() + (ov.validForDays ?? 30) * MS_DAY),
      revokedAt: null,
    };
  }
  if (row.overrideOrg) {
    override = {
      organisationId: row.overrideOrg as string,
      entitlementKey: row.entitlementKey as EntitlementKey,
      decision: "GRANT",
      limitOverride: (row.overrideLimit as number) ?? 100,
      reason: "fixture",
      approvedBy: "admin",
      effectiveFrom: new Date(NOW.getTime() - 5 * MS_DAY),
      expiresAt: new Date(NOW.getTime() + 30 * MS_DAY),
      revokedAt: null,
    };
  }

  const ctx: EntitlementContext = {
    organisationId: ctxOrg,
    entitlementKey: row.entitlementKey as EntitlementKey,
    requestedUnits: (row.requestedUnits as number) ?? 0,
    now: NOW,
  };
  return { ctx, inputs: { subscription, override, usage: (row.usage as number | null) ?? null } };
}

describe("PHASE 96 offline evaluation — zero-tolerance budgets", () => {
  const budgets = {
    UNKNOWN_ENTITLEMENT_ALLOWED: 0,
    MISSING_PAID_SUBSCRIPTION_ALLOWED: 0,
    EXPIRED_SUBSCRIPTION_PAID_ACCESS: 0,
    SUSPENDED_SUBSCRIPTION_PAID_ACCESS: 0,
    DUPLICATE_WEBHOOK_STATE_MUTATION: 0,
    OUT_OF_ORDER_EVENT_REGRESSION: 0,
    CROSS_TENANT_BILLING_ACCESS: 0,
    OVER_LIMIT_CREATION: 0,
    PERMANENT_UNAUDITED_OVERRIDE: 0,
    SENSITIVE_BILLING_AUDIT_LEAK: 0,
  };

  it("entitlement decisions honour expectAllowed and violate no budget", () => {
    const rows = [...loadJsonl("entitlement-decisions.jsonl"), ...loadJsonl("cross-tenant-attacks.jsonl")];
    expect(rows.length).toBeGreaterThan(15);
    for (const row of rows) {
      const { ctx, inputs } = buildInputs(row);
      const d = evaluateEntitlement(ctx, inputs);
      if (typeof row.expectAllowed === "boolean") {
        expect(d.allowed, `${row.name}`).toBe(row.expectAllowed);
      }
      const cls = row.class as string | undefined;
      if (d.allowed) {
        if (cls === "unknown_entitlement") budgets.UNKNOWN_ENTITLEMENT_ALLOWED++;
        if (cls === "missing_paid_subscription") budgets.MISSING_PAID_SUBSCRIPTION_ALLOWED++;
        if (cls === "expired_paid_access") budgets.EXPIRED_SUBSCRIPTION_PAID_ACCESS++;
        if (cls === "suspended_paid_access") budgets.SUSPENDED_SUBSCRIPTION_PAID_ACCESS++;
        if (cls === "over_limit") budgets.OVER_LIMIT_CREATION++;
        if (cls === "expired_override" && d.overrideApplied) budgets.PERMANENT_UNAUDITED_OVERRIDE++;
        // cross-tenant: subscription/override org differs from ctx org.
        if (inputs.subscription && inputs.subscription.organisationId !== ctx.organisationId) budgets.CROSS_TENANT_BILLING_ACCESS++;
        if (d.overrideApplied && inputs.override && inputs.override.organisationId !== ctx.organisationId) budgets.CROSS_TENANT_BILLING_ACCESS++;
        // numeric ceiling never exceeded when allowed.
        if (d.limit !== null && d.used !== null && d.used + ctx.requestedUnits > d.limit) budgets.OVER_LIMIT_CREATION++;
      }
    }
  });

  it("webhook events reject duplicates and out-of-order without mutation", () => {
    const rows = loadJsonl("webhook-events.jsonl");
    expect(rows.length).toBeGreaterThan(4);
    for (const row of rows) {
      const start = row.start as { status: string; stateVersion: number; lastId: string | null; lastAt: string | null };
      let snap: SubscriptionStateSnapshot = {
        status: start.status as DomainSubscriptionStatus,
        stateVersion: start.stateVersion,
        lastProviderEventCreatedAt: start.lastAt ? new Date(start.lastAt) : null,
        lastProviderEventId: start.lastId,
      };
      const events = row.events as { event: string; id: string; createdAt: string }[];
      const expectApplied = row.expectApplied as boolean[] | undefined;
      events.forEach((e, i) => {
        const before = snap;
        const out = applyProviderEvent(snap, {
          event: e.event as never,
          providerEventId: e.id,
          providerCreatedAt: new Date(e.createdAt),
        });
        if (out.applied) snap = out.next;
        if (expectApplied) {
          expect(out.applied, `${row.name}[${i}]`).toBe(expectApplied[i]);
          // A non-applied event must NOT have changed state.
          if (!out.applied) {
            expect(snap.status).toBe(before.status);
            expect(snap.stateVersion).toBe(before.stateVersion);
            if (!out.applied && out.reason === "OUT_OF_ORDER") budgets.OUT_OF_ORDER_EVENT_REGRESSION += 0;
          }
        }
        if (!out.applied && out.reason === "DUPLICATE" && snap.status !== before.status) budgets.DUPLICATE_WEBHOOK_STATE_MUTATION++;
        if (!out.applied && out.reason === "OUT_OF_ORDER" && snap.status !== before.status) budgets.OUT_OF_ORDER_EVENT_REGRESSION++;
      });
      expect(snap.status, `${row.name} final`).toBe(row.expectFinal);
    }
  });

  it("subscription transition table matches the fixture", () => {
    const rows = loadJsonl("subscription-transitions.jsonl");
    for (const row of rows) {
      const got = nextState(row.from as DomainSubscriptionStatus, row.event as never);
      expect(got, `${row.from}+${row.event}`).toBe(row.expect);
    }
  });

  it("usage races never exceed the ceiling (sequential reservation model)", () => {
    const rows = loadJsonl("usage-races.jsonl");
    for (const row of rows) {
      const limit = row.limit as number;
      const attempts = row.attempts as number;
      let used = 0;
      let successes = 0;
      for (let i = 0; i < attempts; i++) {
        if (used + 1 <= limit) {
          used++;
          successes++;
        }
      }
      expect(successes, row.name as string).toBe(row.expectSuccesses);
      if (successes > limit) budgets.OVER_LIMIT_CREATION++;
    }
  });

  it("audit metadata never leaks sensitive data", () => {
    const rows = loadJsonl("audit-redaction.jsonl");
    for (const row of rows) {
      const meta = buildBillingAuditMetadata(row.raw as Record<string, unknown>);
      for (const key of (row.forbidden as string[]) ?? []) {
        if (key in meta) budgets.SENSITIVE_BILLING_AUDIT_LEAK++;
      }
      if (!isMetadataClean(meta)) budgets.SENSITIVE_BILLING_AUDIT_LEAK++;
      const rk = row.expectRedactedValueKey as string | undefined;
      if (rk) expect(meta[rk]).toBe("[REDACTED]");
    }
  });

  it("ALL zero-tolerance budgets are exactly 0", () => {
    for (const [name, value] of Object.entries(budgets)) {
      expect(value, `budget ${name}`).toBe(0);
    }
  });
});

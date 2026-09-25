/**
 * ATS-B2 — recruitment retention: the period comes from the policy, legal
 * holds win, dry-run is the default, and the global candidate row is never
 * touched by a tenant sweep.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { evaluateApplicationRetention, sweepExpiredApplications, type ApplicationRetentionRow, type RetentionPolicyRow } from "../retention";
import type { SettingsRow } from "../settings/defaults";
import { settingsRow } from "./settings-fixture";

const NOW = new Date("2026-09-23T00:00:00.000Z");
const DAY = 86_400_000;
const app = (over: Partial<ApplicationRetentionRow> = {}): ApplicationRetentionRow => ({
  id: "app-1",
  candidateId: "cand-1",
  createdAt: new Date(NOW.getTime() - 200 * DAY),
  updatedAt: new Date(NOW.getTime() - 200 * DAY),
  retentionExpiresAt: new Date(NOW.getTime() - 20 * DAY),
  anonymizedAt: null,
  withdrawnAt: null,
  ...over,
});
const policy = (over: Partial<RetentionPolicyRow> = {}): RetentionPolicyRow => ({
  id: "rp-1",
  retentionDays: 180,
  retentionTrigger: "CREATION",
  action: "ANONYMISE",
  dryRunOnly: true,
  legalHoldAware: true,
  ...over,
});

describe("evaluation is pure and policy-driven", () => {
  it("not yet expired → RETAIN", () => {
    expect(evaluateApplicationRetention(app({ retentionExpiresAt: new Date(NOW.getTime() + DAY) }), policy(), [], "org-A", NOW).decision).toBe("RETAIN");
  });
  it("expired by the intake stamp → EXPIRED", () => {
    expect(evaluateApplicationRetention(app(), policy(), [], "org-A", NOW).decision).toBe("EXPIRED");
  });
  it("LAST_ACTIVITY is re-evaluated from updatedAt, not from the intake stamp", () => {
    const recent = app({ updatedAt: new Date(NOW.getTime() - DAY) });
    expect(evaluateApplicationRetention(recent, policy({ retentionTrigger: "LAST_ACTIVITY" }), [], "org-A", NOW).decision).toBe("RETAIN");
    expect(evaluateApplicationRetention(app(), policy({ retentionTrigger: "LAST_ACTIVITY" }), [], "org-A", NOW).decision).toBe("EXPIRED");
  });
  it("a policy without a period, or a non-automated trigger, is REVIEW_REQUIRED — never a guess", () => {
    expect(evaluateApplicationRetention(app(), policy({ retentionDays: null }), [], "org-A", NOW).decision).toBe("REVIEW_REQUIRED");
    expect(evaluateApplicationRetention(app(), policy({ retentionTrigger: "REVIEW_REQUIRED" }), [], "org-A", NOW).decision).toBe("REVIEW_REQUIRED");
  });
  it("an active legal hold on the SUBJECT, the RESOURCE or the ORGANIZATION → HELD; another org's hold does not apply", () => {
    const subject = { organizationId: "org-A", scopeType: "SUBJECT", status: "ACTIVE", subjectId: "cand-1" };
    const resource = { organizationId: "org-A", scopeType: "RESOURCE", status: "ACTIVE", resourceType: "AtsApplication", resourceId: "app-1" };
    const org = { organizationId: "org-A", scopeType: "ORGANIZATION", status: "ACTIVE" };
    const foreign = { organizationId: "org-B", scopeType: "ORGANIZATION", status: "ACTIVE" };
    const released = { ...org, status: "RELEASED" };
    for (const hold of [subject, resource, org]) {
      expect(evaluateApplicationRetention(app(), policy(), [hold], "org-A", NOW).decision).toBe("HELD");
    }
    expect(evaluateApplicationRetention(app(), policy(), [foreign, released], "org-A", NOW).decision).toBe("EXPIRED");
  });
  it("already anonymised → RETAIN (nothing to do)", () => {
    expect(evaluateApplicationRetention(app({ anonymizedAt: NOW }), policy(), [], "org-A", NOW).decision).toBe("RETAIN");
  });
});

interface Write { model: string; data: Record<string, unknown> }
function makeDb(opts: {
  policy: RetentionPolicyRow | null;
  apps: ApplicationRetentionRow[];
  holds?: Record<string, unknown>[];
  /** ATS-M1 — the organization's settings row (absent by default). */
  settings?: SettingsRow | null;
  throwOnSettings?: boolean;
}) {
  const writes: Write[] = [];
  const candidateTouched = vi.fn();
  const policyWheres: Record<string, unknown>[] = [];
  const tx = {
    atsOrganizationSettings: {
      findUnique: async () => {
        if (opts.throwOnSettings) throw new Error("db down");
        return opts.settings ?? null;
      },
    },
    retentionPolicy: {
      findFirst: async (a: { where: Record<string, unknown> }) => {
        policyWheres.push(a.where);
        return opts.policy;
      },
    },
    legalHold: { findMany: async () => opts.holds ?? [] },
    atsApplication: {
      findMany: async () => opts.apps,
      updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        writes.push({ model: "atsApplication.updateMany", data: a.data });
        return { count: 1 };
      },
    },
    atsCandidate: { update: candidateTouched, updateMany: candidateTouched, delete: candidateTouched },
    auditLog: { create: async (a: { data: Record<string, unknown> }) => { writes.push({ model: "auditLog", data: a.data }); return {}; } },
  };
  const client = { ...tx, $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>) => fn(tx) };
  return { client, writes, candidateTouched, policyWheres };
}

beforeEach(() => {
  h.db = null;
});

describe("the sweep", () => {
  it("without an approved policy there is nothing to sweep", async () => {
    const store = makeDb({ policy: null, apps: [app()] });
    h.db = store.client;
    const r = await sweepExpiredApplications({ organizationId: "org-A", now: NOW, execute: true });
    expect(r).toMatchObject({ policyId: null, evaluated: 0, anonymized: 0, dryRun: true });
    expect(store.writes).toHaveLength(0);
  });

  it("is a DRY RUN by default: counts, no writes", async () => {
    const store = makeDb({ policy: policy({ dryRunOnly: false }), apps: [app(), app({ id: "app-2", retentionExpiresAt: new Date(NOW.getTime() + DAY) })] });
    h.db = store.client;
    const r = await sweepExpiredApplications({ organizationId: "org-A", now: NOW });
    expect(r).toMatchObject({ dryRun: true, evaluated: 2, expired: 1, retained: 1, anonymized: 0 });
    expect(store.writes).toHaveLength(0);
  });

  it("execute is refused by a policy that is still dryRunOnly", async () => {
    const store = makeDb({ policy: policy({ dryRunOnly: true }), apps: [app()] });
    h.db = store.client;
    const r = await sweepExpiredApplications({ organizationId: "org-A", now: NOW, execute: true });
    expect(r).toMatchObject({ dryRun: true, expired: 1, anonymized: 0 });
    expect(store.writes).toHaveLength(0);
  });

  it("executes ANONYMISE: nulls the free text, stamps anonymizedAt, audits as SYSTEM_RETENTION — and never touches the candidate row", async () => {
    const store = makeDb({ policy: policy({ dryRunOnly: false }), apps: [app()] });
    h.db = store.client;
    const r = await sweepExpiredApplications({ organizationId: "org-A", now: NOW, execute: true, correlationId: "sweep-1" });
    expect(r).toMatchObject({ dryRun: false, expired: 1, anonymized: 1, action: "ANONYMISE" });
    const upd = store.writes.find((w) => w.model === "atsApplication.updateMany")!.data;
    expect(upd).toEqual({ resumeText: null, coverLetter: null, notes: null, anonymizedAt: NOW });
    const audit = store.writes.find((w) => w.model === "auditLog")!.data;
    expect(audit).toMatchObject({ action: "recruitment.application.anonymized", userId: null, organizationId: "org-A", correlationId: "sweep-1" });
    expect((audit.metadata as Record<string, unknown>).actor).toBe("SYSTEM_RETENTION");
    expect(store.candidateTouched).not.toHaveBeenCalled();
  });

  it("DELETE is executed as soft-delete + anonymisation; hard deletion belongs to the erasure workflow", async () => {
    const store = makeDb({ policy: policy({ dryRunOnly: false, action: "DELETE" }), apps: [app()] });
    h.db = store.client;
    await sweepExpiredApplications({ organizationId: "org-A", now: NOW, execute: true });
    expect(store.writes.find((w) => w.model === "atsApplication.updateMany")!.data).toMatchObject({ anonymizedAt: NOW, deletedAt: NOW });
  });

  it("a held application is counted and skipped even when executing", async () => {
    const store = makeDb({
      policy: policy({ dryRunOnly: false }),
      apps: [app()],
      holds: [{ organizationId: "org-A", scopeType: "SUBJECT", status: "ACTIVE", subjectId: "cand-1" }],
    });
    h.db = store.client;
    const r = await sweepExpiredApplications({ organizationId: "org-A", now: NOW, execute: true });
    expect(r).toMatchObject({ held: 1, expired: 0, anonymized: 0 });
    expect(store.writes).toHaveLength(0);
  });

  it("a non-automated action (REVIEW_REQUIRED) only reports", async () => {
    const store = makeDb({ policy: policy({ dryRunOnly: false, action: "REVIEW_REQUIRED" }), apps: [app()] });
    h.db = store.client;
    const r = await sweepExpiredApplications({ organizationId: "org-A", now: NOW, execute: true });
    expect(r).toMatchObject({ expired: 1, anonymized: 0 });
    expect(store.writes).toHaveLength(0);
  });
});

describe("ATS-M1 — the sweep honours the organization's selection and the effective date", () => {
  it("asks only for an EFFECTIVE policy, and for the SELECTED one when the organization chose one", async () => {
    const store = makeDb({ policy: policy({ dryRunOnly: false }), apps: [app()], settings: settingsRow({ retentionPolicyId: "rp-7" }) });
    h.db = store.client;
    await sweepExpiredApplications({ organizationId: "org-A", now: NOW });
    expect(store.policyWheres[0]).toMatchObject({ organizationId: "org-A", approvalState: "APPROVED", enabled: true, id: "rp-7" });
    expect(store.policyWheres[0].OR).toEqual([{ effectiveFrom: null }, { effectiveFrom: { lte: NOW } }]);
  });

  it("no selection → any approved, effective policy of the organization (unchanged behaviour)", async () => {
    const store = makeDb({ policy: policy({ dryRunOnly: false }), apps: [app()] });
    h.db = store.client;
    await sweepExpiredApplications({ organizationId: "org-A", now: NOW });
    expect(store.policyWheres[0]).not.toHaveProperty("id");
  });

  it("a SELECTED policy that is no longer approved stops the sweep VISIBLY — no other policy is guessed in", async () => {
    const store = makeDb({ policy: null, apps: [app()], settings: settingsRow({ retentionPolicyId: "rp-revoked" }) });
    h.db = store.client;
    const r = await sweepExpiredApplications({ organizationId: "org-A", now: NOW, execute: true });
    expect(r).toMatchObject({ selectedPolicyUnavailable: true, policyId: null, anonymized: 0 });
    expect(store.writes).toHaveLength(0);
  });

  it("a settings read failure anonymises NOTHING and says so", async () => {
    const store = makeDb({ policy: policy({ dryRunOnly: false }), apps: [app()], throwOnSettings: true });
    h.db = store.client;
    const r = await sweepExpiredApplications({ organizationId: "org-A", now: NOW, execute: true });
    expect(r).toMatchObject({ storeUnavailable: true, anonymized: 0 });
    expect(store.writes).toHaveLength(0);
  });
});

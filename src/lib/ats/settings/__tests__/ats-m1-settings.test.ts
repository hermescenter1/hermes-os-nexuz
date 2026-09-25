/**
 * ATS-M1 — organization ATS settings: permissions per section, mandatory
 * reasons, fail-closed defaults, no secret ever returned, ANONYMISE-only
 * retention, and an audit row for every change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeStore } from "@/lib/ats/positions/__tests__/fake-store";
import { ENV } from "@/lib/ats/policy";
import { APPLICATION_ACCEPTANCE_AUTHORIZED } from "@/lib/ats/acceptance-flag";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { effectiveExternalAi, getSettingsView, redactForAudit, updateRetention, updateSettings } from "../service";
import { ATS_SETTINGS_DEFAULTS, settingsFromRow } from "../defaults";
import type { MutationContext } from "@/lib/ats/positions/mutation";

const MEMBERS = [
  { id: "m-admin", organizationId: "org-A", userId: "u-admin", role: "ADMIN", status: "ACTIVE" },
  { id: "m-hr", organizationId: "org-A", userId: "u-hr", role: "HR_MANAGER", status: "ACTIVE" },
  { id: "m-rec", organizationId: "org-A", userId: "u-rec", role: "RECRUITER", status: "ACTIVE" },
  { id: "m-b", organizationId: "org-B", userId: "u-b", role: "OWNER", status: "ACTIVE" },
];

const SECRET_VALUES = {
  [ENV.IDEMPOTENCY_SECRET]: "idem-secret-value-THAT-MUST-NEVER-LEAK-0123456789",
  [ENV.REVIEW_WORKER_TOKEN]: "worker-token-value-THAT-MUST-NEVER-LEAK-9876543210",
};

let store: ReturnType<typeof makeStore>;
let seq = 0;
const saved: Record<string, string | undefined> = {};
const ENV_KEYS = [ENV.IDEMPOTENCY_SECRET, ENV.REVIEW_WORKER_TOKEN, ENV.AI_REVIEW_PROVIDER, ENV.AI_EXTERNAL_PROCESSING_ALLOWED];

beforeEach(() => {
  store = makeStore({ members: MEMBERS });
  h.db = store.client;
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const ctx = (userId: string, role: string, org = "org-A"): MutationContext => ({
  organizationId: org,
  actor: { userId, role },
  correlationId: `corr-${userId}`,
  idempotencyKey: `settings-key-${++seq}`,
});
const HR = () => ctx("u-hr", "HR_MANAGER");
const ADMIN = () => ctx("u-admin", "ADMIN");
const REC = () => ctx("u-rec", "RECRUITER");

describe("fail-closed defaults", () => {
  it("an organization without a row: external AI off, deterministic, intake closed, nothing selected", () => {
    const d = settingsFromRow(null);
    expect(d).toMatchObject({
      aiProviderMode: "deterministic",
      externalAiProcessingEnabled: false,
      applicationIntakeEnabled: false,
      retentionPolicyId: null,
      exists: false,
    });
    expect(ATS_SETTINGS_DEFAULTS.externalAiProcessingEnabled).toBe(false);
  });

  it("an unknown provider string reads as deterministic — a typo cannot enable a model", () => {
    const row = { ...settingsFromRow(null), aiProviderMode: "Router ", updatedAt: new Date() } as never;
    expect(settingsFromRow(row).aiProviderMode).toBe("deterministic");
  });

  it("external AI is effective only when BOTH deployment flags AND both organization settings say so", () => {
    const on = { aiProviderMode: "router" as const, externalAiProcessingEnabled: true };
    expect(effectiveExternalAi(on)).toBe(false); // deployment has not allowed it
    process.env[ENV.AI_REVIEW_PROVIDER] = "router";
    expect(effectiveExternalAi(on)).toBe(false);
    process.env[ENV.AI_EXTERNAL_PROCESSING_ALLOWED] = "true";
    expect(effectiveExternalAi(on)).toBe(true);
    expect(effectiveExternalAi({ ...on, externalAiProcessingEnabled: false })).toBe(false);
    expect(effectiveExternalAi({ ...on, aiProviderMode: "deterministic" })).toBe(false);
  });

  it("the global acceptance gate is still closed", () => {
    expect(APPLICATION_ACCEPTANCE_AUTHORIZED).toBe(false);
  });
});

describe("permissions per section", () => {
  it("ATS_MANAGE may change workflow defaults and notifications", async () => {
    expect((await updateSettings({ section: "workflow", changes: { defaultDecisionSlaDays: 5 }, expectedVersion: 0 }, REC())).ok).toBe(true);
    expect((await updateSettings({ section: "notifications", changes: { reviewAlertsEnabled: true }, expectedVersion: 1 }, REC())).ok).toBe(true);
  });

  it.each(["ai", "publicCareers", "humanApproval"] as const)("ATS_MANAGE may NOT change the %s section", async (section) => {
    const changes =
      section === "ai" ? { externalAiProcessingEnabled: true } : section === "publicCareers" ? { applicationIntakeEnabled: true } : { defaultApprovalOwnerRole: "RECRUITER" };
    const r = await updateSettings({ section, changes, expectedVersion: 0, reason: "a documented reason" }, REC());
    expect(r).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(store.state.settings).toHaveLength(0);
  });

  it("ATS_MANAGE may NOT change retention", async () => {
    const r = await updateRetention(
      { policyId: null, retentionDays: 180, retentionTrigger: "CREATION", approvalState: "APPROVED", enabled: true, effectiveFrom: null, expectedVersion: 0, reason: "policy decision" },
      REC(),
    );
    expect(r).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(store.state.retention).toHaveLength(0);
  });

  it("AI, public intake and human-approval changes require a written reason, even for ATS_ADMIN", async () => {
    for (const [section, changes] of [
      ["ai", { externalAiProcessingEnabled: true }],
      ["publicCareers", { applicationIntakeEnabled: true }],
      ["humanApproval", { defaultApprovalOwnerRole: "HR_MANAGER" }],
    ] as const) {
      expect(await updateSettings({ section, changes, expectedVersion: 0 }, HR())).toEqual({ ok: false, code: "REASON_REQUIRED" });
    }
    const noReason = await updateRetention(
      { policyId: null, retentionDays: 180, retentionTrigger: "CREATION", approvalState: "APPROVED", enabled: true, effectiveFrom: null, expectedVersion: 0 },
      HR(),
    );
    expect(noReason).toEqual({ ok: false, code: "REASON_REQUIRED" });
    expect(store.state.settings).toHaveLength(0);
  });

  it("there is no switch that disables human approval or the evidence requirement, and no secret field", async () => {
    for (const changes of [{ humanApprovalRequired: false }, { evidenceRequired: false }, { workerToken: "x" }, { idempotencySecret: "x" }]) {
      for (const section of ["workflow", "humanApproval", "ai", "notifications", "publicCareers"] as const) {
        const r = await updateSettings({ section, changes, expectedVersion: 0, reason: "attempt to weaken" }, HR());
        expect(r.ok, `${section} ${JSON.stringify(changes)}`).toBe(false);
      }
    }
    expect(store.state.settings).toHaveLength(0);
  });
});

describe("writes: versioned, tenant-scoped, audited", () => {
  it("an ATS admin enables intake with a reason; the audit row records section, reason, before and after", async () => {
    const r = await updateSettings({ section: "publicCareers", changes: { applicationIntakeEnabled: true }, expectedVersion: 0, reason: "Hiring round Q4 opens" }, HR());
    expect(r.ok).toBe(true);
    expect(store.state.settings[0]).toMatchObject({ organizationId: "org-A", applicationIntakeEnabled: true, version: 1, updatedById: "u-hr" });
    expect(store.state.audit).toHaveLength(1);
    const a = store.state.audit[0];
    expect(a).toMatchObject({ action: "recruitment.settings.updated", entityType: "AtsOrganizationSettings", entityId: "org-A", userId: "u-hr", correlationId: "corr-u-hr" });
    const meta = a.metadata as { reason: string; before: Record<string, unknown>; after: Record<string, unknown> };
    expect(meta.reason).toBe("Hiring round Q4 opens");
    expect(meta.before).toMatchObject({ section: "publicCareers", applicationIntakeEnabled: false, version: 0 });
    expect(meta.after).toMatchObject({ section: "publicCareers", applicationIntakeEnabled: true, version: 1 });
  });

  it("a stale version is refused", async () => {
    await updateSettings({ section: "notifications", changes: { reviewAlertsEnabled: true }, expectedVersion: 0 }, REC());
    expect(await updateSettings({ section: "notifications", changes: { slaBreachAlertsEnabled: true }, expectedVersion: 0 }, REC())).toEqual({ ok: false, code: "STALE" });
  });

  it("settings of one organization are invisible to and unwritable by another", async () => {
    await updateSettings({ section: "publicCareers", changes: { publicListingEnabled: false }, expectedVersion: 0, reason: "Paused hiring" }, HR());
    const viewB = await getSettingsView("org-B", "OWNER");
    expect(viewB!.settings.exists).toBe(false);
    expect(viewB!.settings.publicListingEnabled).toBe(true);
    // An org-B owner writing claims org-B only; org-A's row is untouched.
    await updateSettings({ section: "publicCareers", changes: { publicListingEnabled: true }, expectedVersion: 0, reason: "Open listing" }, ctx("u-b", "OWNER", "org-B"));
    expect(store.state.settings.find((s) => s.organizationId === "org-A")!.publicListingEnabled).toBe(false);
  });

  it("sensitive-looking keys are REDACTED in an audit payload", () => {
    expect(redactForAudit({ minimumConfidence: 60, workerToken: "abc", idempotencySecret: "def" })).toEqual({
      minimumConfidence: 60,
      workerToken: "REDACTED",
      idempotencySecret: "REDACTED",
    });
  });
});

describe("the security section never returns a secret value", () => {
  it("shows CONFIGURED / MISSING for ATS administrators only; no value appears anywhere in the view", async () => {
    Object.assign(process.env, SECRET_VALUES);
    const admin = await getSettingsView("org-A", "HR_MANAGER");
    expect(admin!.security!.items).toEqual([
      { name: ENV.IDEMPOTENCY_SECRET, state: "CONFIGURED" },
      { name: ENV.REVIEW_WORKER_TOKEN, state: "CONFIGURED" },
      { name: ENV.AI_EXTERNAL_PROCESSING_ALLOWED, state: "DISABLED" },
    ]);
    const json = JSON.stringify(admin);
    for (const v of Object.values(SECRET_VALUES)) expect(json).not.toContain(v);
    expect(json).not.toMatch(/NEVER-LEAK/);

    const recruiter = await getSettingsView("org-A", "RECRUITER");
    expect(recruiter!.security).toBeNull();
    expect(recruiter!.viewer).toEqual({ canManage: true, canAdmin: false, canApproveRetention: false });
  });

  it("reports MISSING — fail closed — when a secret is absent", async () => {
    const admin = await getSettingsView("org-A", "ADMIN");
    expect(admin!.security!.items.filter((i) => i.state === "MISSING").map((i) => i.name)).toEqual([ENV.IDEMPOTENCY_SECRET, ENV.REVIEW_WORKER_TOKEN]);
    expect(admin!.security!.applicationAcceptanceAuthorized).toBe(false);
  });

  it("the locked invariants are reported as locked", async () => {
    const v = await getSettingsView("org-A", "HR_MANAGER");
    expect(v!.locked).toMatchObject({ humanApprovalRequired: true, evidenceRequired: true, retentionAction: "ANONYMISE" });
    expect(v!.locked.pipeline.slice(0, 3)).toEqual(["APPLIED", "AI_REVIEW_PENDING", "PENDING_HUMAN_APPROVAL"]);
  });
});

describe("retention: ANONYMISE only, organization-scoped, selected and audited", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    policyId: null,
    retentionDays: 365,
    retentionTrigger: "CREATION",
    approvalState: "APPROVED",
    enabled: true,
    effectiveFrom: null,
    expectedVersion: 0,
    reason: "Legal counsel approved 12 months",
    ...over,
  });

  it("an owner/admin (manage_retention) creates an ANONYMISE, dry-run, legal-hold-aware RECRUITMENT_CANDIDATE policy and selects it", async () => {
    const r = await updateRetention(body(), ADMIN());
    expect(r.ok).toBe(true);
    expect(store.state.retention[0]).toMatchObject({
      organizationId: "org-A",
      dataClass: "RECRUITMENT_CANDIDATE",
      action: "ANONYMISE",
      dryRunOnly: true,
      legalHoldAware: true,
      retentionDays: 365,
      approvalState: "APPROVED",
    });
    expect(store.state.settings[0]).toMatchObject({ retentionPolicyId: store.state.retention[0].id, version: 1 });
    expect(store.state.audit[0]).toMatchObject({ action: "recruitment.retention_policy.updated", entityType: "RetentionPolicy", userId: "u-admin" });
    expect(r.ok && r.result.selected).toBe(true);
  });

  it("an action other than ANONYMISE cannot even be expressed", async () => {
    expect((await updateRetention(body({ action: "DELETE" }), HR())).ok).toBe(false);
    expect(store.state.retention).toHaveLength(0);
  });

  it("an owner/admin editing a compliance DELETE policy rewrites it to ANONYMISE and back to DRY-RUN, audited with the previous values", async () => {
    store.state.retention.push({ id: "rp-old", organizationId: "org-A", dataClass: "RECRUITMENT_CANDIDATE", action: "DELETE", retentionDays: 30, retentionTrigger: "CREATION", approvalState: "PENDING_REVIEW", enabled: false, dryRunOnly: false, legalHoldAware: true, effectiveFrom: null, name: "old", updatedAt: new Date() });
    const r = await updateRetention(body({ policyId: "rp-old" }), ADMIN());
    expect(r.ok).toBe(true);
    expect(store.state.retention[0]).toMatchObject({ action: "ANONYMISE", dryRunOnly: true });
    const meta = store.state.audit[0].metadata as { before: { action: string; dryRunOnly: boolean }; after: { action: string; dryRunOnly: boolean } };
    expect(meta.before).toMatchObject({ action: "DELETE", dryRunOnly: false });
    expect(meta.after).toMatchObject({ action: "ANONYMISE", dryRunOnly: true });
  });

  it("another organization's policy cannot be selected or edited (NOT_FOUND)", async () => {
    store.state.retention.push({ id: "rp-B", organizationId: "org-B", dataClass: "RECRUITMENT_CANDIDATE", action: "ANONYMISE", retentionDays: 30, retentionTrigger: "CREATION", approvalState: "APPROVED", enabled: true, dryRunOnly: true, legalHoldAware: true, effectiveFrom: null, name: "B", updatedAt: new Date() });
    expect(await updateRetention(body({ policyId: "rp-B" }), ADMIN())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(store.state.retention[0].retentionDays).toBe(30);
    expect(store.state.settings).toHaveLength(0);
  });

  it("retention days are bounded", async () => {
    expect((await updateRetention(body({ retentionDays: 5 }), ADMIN())).ok).toBe(false);
    expect((await updateRetention(body({ retentionDays: 99999 }), ADMIN())).ok).toBe(false);
  });
});

describe("retention approval is a COMPLIANCE act (manage_retention), not an ATS_ADMIN one", () => {
  const proposal = (over: Record<string, unknown> = {}) => ({
    policyId: null,
    retentionDays: 180,
    retentionTrigger: "CREATION",
    approvalState: "PENDING_REVIEW",
    enabled: false,
    effectiveFrom: null,
    expectedVersion: 0,
    reason: "Proposal for counsel review",
    ...over,
  });
  const seed = (over: Record<string, unknown>) =>
    store.state.retention.push({ organizationId: "org-A", dataClass: "RECRUITMENT_CANDIDATE", action: "ANONYMISE", retentionDays: 90, retentionTrigger: "CREATION", approvalState: "APPROVED", enabled: true, dryRunOnly: true, legalHoldAware: true, effectiveFrom: null, name: "p", updatedAt: new Date(), ...over });

  it("HR_MANAGER (ATS_ADMIN without manage_retention) cannot approve or enable — refused before any write", async () => {
    for (const over of [{ approvalState: "APPROVED" }, { enabled: true }, { approvalState: "REJECTED" }]) {
      expect(await updateRetention(proposal(over), HR()), JSON.stringify(over)).toEqual({ ok: false, code: "FORBIDDEN" });
    }
    expect(store.state.retention).toHaveLength(0);
    expect(store.state.settings).toHaveLength(0);
  });

  it("HR_MANAGER may save a PROPOSAL; it is not selected, so intake and the sweep keep their current policy", async () => {
    seed({ id: "rp-live" });
    store.state.settings.push({ organizationId: "org-A", retentionPolicyId: "rp-live", version: 3, updatedAt: new Date() });
    const r = await updateRetention(proposal({ expectedVersion: 3 }), HR());
    expect(r.ok && r.result.selected).toBe(false);
    expect(store.state.retention).toHaveLength(2);
    expect(store.state.settings[0].retentionPolicyId).toBe("rp-live");
  });

  it("HR_MANAGER cannot edit an APPROVED policy, nor convert a compliance policy with another action", async () => {
    seed({ id: "rp-approved" });
    seed({ id: "rp-review", action: "REVIEW_REQUIRED", approvalState: "PENDING_REVIEW", enabled: false });
    expect(await updateRetention(proposal({ policyId: "rp-approved" }), HR())).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await updateRetention(proposal({ policyId: "rp-review" }), HR())).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(store.state.retention.find((x) => x.id === "rp-review")!.action).toBe("REVIEW_REQUIRED");
  });

  it("an approved policy that is not yet EFFECTIVE is saved but not selected; the current selection stays in force", async () => {
    seed({ id: "rp-live" });
    store.state.settings.push({ organizationId: "org-A", retentionPolicyId: "rp-live", version: 1, updatedAt: new Date() });
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const r = await updateRetention(proposal({ approvalState: "APPROVED", enabled: true, effectiveFrom: future, expectedVersion: 1 }), ADMIN());
    expect(r.ok && r.result.selected).toBe(false);
    expect(store.state.settings[0].retentionPolicyId).toBe("rp-live");
  });

  it("the settings view tells the UI who may approve", async () => {
    expect((await getSettingsView("org-A", "HR_MANAGER"))!.viewer.canApproveRetention).toBe(false);
    expect((await getSettingsView("org-A", "ADMIN"))!.viewer.canApproveRetention).toBe(true);
    expect((await getSettingsView("org-A", "RECRUITER"))!.viewer.canApproveRetention).toBe(false);
  });
});

describe("second review — retention edits cannot silently stop retention or revert an approval", () => {
  const seed = (over: Record<string, unknown>) =>
    store.state.retention.push({ organizationId: "org-A", dataClass: "RECRUITMENT_CANDIDATE", action: "ANONYMISE", retentionDays: 90, retentionTrigger: "CREATION", approvalState: "APPROVED", enabled: true, dryRunOnly: true, legalHoldAware: true, effectiveFrom: null, name: "p", updatedAt: new Date("2026-09-01"), ...over });

  it("the SELECTED policy cannot be edited out of force (disabled / pending / future) from the ATS form", async () => {
    seed({ id: "rp-live" });
    store.state.settings.push({ organizationId: "org-A", retentionPolicyId: "rp-live", version: 1, updatedAt: new Date() });
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    for (const over of [{ enabled: false }, { approvalState: "PENDING_REVIEW", enabled: false }, { effectiveFrom: future }]) {
      const r = await updateRetention(
        { policyId: "rp-live", retentionDays: 120, retentionTrigger: "CREATION", approvalState: "APPROVED", enabled: true, effectiveFrom: null, expectedVersion: 1, reason: "Tighten the period", ...over },
        ADMIN(),
      );
      expect(r, JSON.stringify(over)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    }
    expect(store.state.retention[0]).toMatchObject({ retentionDays: 90, enabled: true, approvalState: "APPROVED" });
  });

  it("an edit is conditional on the policy as READ: a concurrent approval makes it STALE, never silently reverted", async () => {
    seed({ id: "rp-draft", approvalState: "PENDING_REVIEW", enabled: false });
    const policies = store.client.retentionPolicy;
    const realFindFirst = policies.findFirst;
    // Simulate an approver committing between this request's read and its write.
    policies.findFirst = async (a) => {
      const row = await realFindFirst(a);
      const live = store.state.retention.find((x) => x.id === "rp-draft")!;
      Object.assign(live, { approvalState: "APPROVED", updatedAt: new Date() });
      return row ? { ...row, approvalState: "PENDING_REVIEW" } : row;
    };
    const r = await updateRetention(
      { policyId: "rp-draft", retentionDays: 200, retentionTrigger: "CREATION", approvalState: "PENDING_REVIEW", enabled: false, effectiveFrom: null, expectedVersion: 0, reason: "Proposal tweak" },
      HR(),
    );
    policies.findFirst = realFindFirst;
    expect(r).toEqual({ ok: false, code: "STALE" });
    // The proposal's 200 days were NOT written over the concurrently approved row.
    // (The simulated approval ran inside this request's transaction, so the fake's
    // rollback also undoes it; what matters is that the stale save did not land.)
    expect(store.state.retention[0].retentionDays).toBe(90);
  });
});

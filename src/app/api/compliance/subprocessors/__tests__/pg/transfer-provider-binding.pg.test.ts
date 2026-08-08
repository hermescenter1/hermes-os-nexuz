import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { providerScopeHash } from "@/lib/compliance/transfer-governance";
import { approveSubprocessorForOrg, approveDataTransferForOrg } from "@/lib/compliance/transfer-db";

/**
 * Phase 97 Part I — REAL-PostgreSQL provider-policy binding + approval linearization.
 *
 * These tests exercise the ACTUAL persistence functions across genuinely concurrent
 * transactions on independent pooled connections, proving:
 *   - the additive migration + the provider-binding CHECK exist and are enforced;
 *   - subprocessor approval reads + LOCKS the CURRENT AiProviderPolicy (FOR SHARE)
 *     INSIDE the approval transaction and persists the EXACT version + canonical
 *     SHA-256 scope hash (APPROVED_PROVIDER_POLICY_VERSION_MISSING=0);
 *   - a missing / foreign-tenant policy fails CLOSED (no fail-open);
 *   - a deterministic barrier (transaction A holds the policy row FOR UPDATE) proves
 *     the approval BLOCKS on the shared lock before writing, then fails closed once A
 *     commits the policy DISABLED (APPROVAL_WITH_STALE_PROVIDER_POLICY=0,
 *     APPROVAL_AFTER_COMMITTED_POLICY_DISABLE=0);
 *   - a DataTransfer re-validates the linked subprocessor's bound policy against the
 *     CURRENT policy (version replacement / denial / expiry / deletion all block —
 *     TRANSFER_APPROVED_WITH_POLICY_VERSION_MISMATCH=0, TRANSFER_APPROVED_AFTER_POLICY_DENIAL=0);
 *   - a deterministic barrier (transaction A holds the linked Subprocessor row FOR
 *     UPDATE, then commits it SUSPENDED) proves the transfer approval blocks on the
 *     real row lock and is denied once the suspension linearizes
 *     (TRANSFER_APPROVED_AFTER_COMMITTED_SUBPROCESSOR_SUSPENSION=0).
 * Nothing here contacts any provider.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgbind97i";
const ORG_A = `${TAG}-orgA`, ORG_B = `${TAG}-orgB`;
const REG = "anthropic:claude-sonnet-4-20250514"; // real external Phase 95 registry entry
const WF = "brain.analysis";
const SP = `${TAG}-sp`, TF = `${TAG}-tf`;
const SCOPE_HASH = providerScopeHash(["tenant_operational"], [WF]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Tx = {
  $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T>;
};
type Pg = Tx & { $transaction: <T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number; maxWait?: number }) => Promise<T> };
async function db(): Promise<Pg> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Pg; }

async function cleanup() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "DataTransfer" WHERE id LIKE '${TAG}%' OR "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Subprocessor" WHERE id LIKE '${TAG}%' OR "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "AiProviderPolicy" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}
async function reset() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "DataTransfer" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Subprocessor" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "AiProviderPolicy" WHERE "organizationId" LIKE '${TAG}%'`);
}

/** Provider-linked (or plain) Subprocessor with all provider/evidence columns explicit. */
async function insSub(id: string, opts: {
  org?: string; lifecycle?: string; reviewed?: boolean; provider?: boolean;
  dataClasses?: string[]; workflows?: string[]; evidence?: boolean; version?: string; scopeHash?: string;
} = {}) {
  const p = await db();
  const org = opts.org ?? ORG_A;
  const lifecycle = opts.lifecycle ?? "UNDER_REVIEW";
  const rev = (opts.reviewed ?? true) ? "APPROVED" : "REVIEW_REQUIRED";
  const provider = opts.provider ?? true;
  const evidence = opts.evidence ?? false;
  // Approval attribution is required for any APPROVED/ACTIVE row by the pre-existing
  // Subprocessor_approval_check — independent of the provider-binding evidence.
  const attributed = lifecycle === "APPROVED" || lifecycle === "ACTIVE";
  await p.$executeRawUnsafe(
    `INSERT INTO "Subprocessor"
      (id,"organizationId",name,lifecycle,"contractReviewStatus","privacyReviewStatus","securityReviewStatus",
       "providerRegistryId","providerDataClasses","providerWorkflows",
       "approvedBy","approvedAt","approvedProviderPolicyVersion","approvedProviderScopeHash","providerPolicyEvaluatedAt","updatedAt")
     VALUES ($1,$2,'V',$3,$4,$4,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,now())`,
    id, org, lifecycle, rev,
    provider ? REG : null,
    provider ? JSON.stringify(opts.dataClasses ?? ["tenant_operational"]) : "[]",
    provider ? JSON.stringify(opts.workflows ?? [WF]) : "[]",
    attributed ? "a" : null,
    attributed ? new Date() : null,
    evidence ? (opts.version ?? "1.0") : null,
    evidence ? (opts.scopeHash ?? SCOPE_HASH) : null,
    evidence ? new Date() : null,
  );
}
async function insTransfer(id: string, opts: { org?: string; sub?: string; lifecycle?: string } = {}) {
  const p = await db();
  await p.$executeRawUnsafe(
    `INSERT INTO "DataTransfer"
      (id,"organizationId","subprocessorId","transferMechanismStatus","legalReviewStatus","riskReviewStatus",lifecycle,"updatedAt")
     VALUES ($1,$2,$3,'CONFIGURED','APPROVED','APPROVED',$4,now())`,
    id, opts.org ?? ORG_A, opts.sub ?? SP, opts.lifecycle ?? "UNDER_REVIEW");
}
async function insPolicy(opts: { org?: string; enabled?: boolean; version?: string; expiresAt?: string | null; classes?: string[]; workflows?: string[] } = {}) {
  const p = await db();
  const org = opts.org ?? ORG_A;
  await p.$executeRawUnsafe(
    `INSERT INTO "AiProviderPolicy"
      (id,"organizationId","providerRegistryId",enabled,"allowedDataClasses","allowedWorkflows","approvedBy","policyVersion","expiresAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5::text[],$6::text[],'a',$7,$8,now())`,
    `${TAG}-pol-${org}`, org, REG, opts.enabled ?? true,
    opts.classes ?? ["public", "tenant_operational"], opts.workflows ?? [WF],
    opts.version ?? "1.0", opts.expiresAt ?? null);
}
async function subLifecycle(id = SP): Promise<string> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ lifecycle: string }[]>(`SELECT lifecycle FROM "Subprocessor" WHERE id=$1`, id);
  return r[0]?.lifecycle ?? "MISSING";
}
async function tfLifecycle(id = TF): Promise<string> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ lifecycle: string }[]>(`SELECT lifecycle FROM "DataTransfer" WHERE id=$1`, id);
  return r[0]?.lifecycle ?? "MISSING";
}
const reasons = (r: { blockers?: Array<{ reason: string }> }) => (r.blockers ?? []).map((b) => b.reason);

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 Part I — provider-policy binding (real PG)", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    for (const org of [ORG_A, ORG_B]) {
      await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ($1,'O',$2,'{}'::jsonb,now(),now())`, org, `${org}-slug`);
    }
  });
  afterAll(cleanup);
  beforeEach(reset);

  it("the additive migration + provider-binding CHECK exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%provider_scope_binding%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const chk = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname='Subprocessor_provider_binding_check'`);
    expect(chk.length).toBe(1);
  });

  it("the CHECK requires complete binding evidence for a provider-linked APPROVED row", async () => {
    // Provider-linked APPROVED WITHOUT binding evidence → rejected.
    await expect(insSub(`${TAG}-noev`, { lifecycle: "APPROVED", evidence: false })).rejects.toBeTruthy();
    // Malformed scope hash → rejected.
    await expect(insSub(`${TAG}-badhash`, { lifecycle: "APPROVED", evidence: true, scopeHash: "not-a-sha" })).rejects.toBeTruthy();
    // Empty declared scope with an APPROVED provider row → rejected.
    await expect(insSub(`${TAG}-noscope`, { lifecycle: "APPROVED", evidence: true, dataClasses: [] })).rejects.toBeTruthy();
    // Fully-evidenced provider-linked APPROVED row → accepted.
    await insSub(`${TAG}-ok`, { lifecycle: "APPROVED", evidence: true });
    // A NON-provider APPROVED row needs no provider evidence.
    await insSub(`${TAG}-plain`, { lifecycle: "APPROVED", provider: false, evidence: false });
  });

  it("subprocessor approval binds to the CURRENT policy + persists the EXACT version and canonical scope hash", async () => {
    await insSub(SP, { lifecycle: "UNDER_REVIEW" });
    await insPolicy({ version: "1.0" });
    const r = await approveSubprocessorForOrg({ id: SP, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(r.ok).toBe(true);
    const p = await db();
    const row = (await p.$queryRawUnsafe<{ lifecycle: string; v: string; h: string; at: Date | null }[]>(
      `SELECT lifecycle, "approvedProviderPolicyVersion" v, "approvedProviderScopeHash" h, "providerPolicyEvaluatedAt" at FROM "Subprocessor" WHERE id=$1`, SP))[0];
    expect(row.lifecycle).toBe("APPROVED");
    expect(row.v).toBe("1.0");
    expect(row.h).toBe(SCOPE_HASH);
    expect(row.at).not.toBeNull();
  });

  it("a missing policy fails CLOSED (no fail-open) and leaves the row UNDER_REVIEW", async () => {
    await insSub(SP, { lifecycle: "UNDER_REVIEW" }); // no policy inserted
    const r = await approveSubprocessorForOrg({ id: SP, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(r.ok).toBe(false);
    expect(reasons(r as never)).toContain("PROVIDER_POLICY_CONFIGURATION_REQUIRED");
    expect(await subLifecycle()).toBe("UNDER_REVIEW");
  });

  it("a FOREIGN-tenant policy can never authorise the approval (fails closed)", async () => {
    await insSub(SP, { lifecycle: "UNDER_REVIEW", org: ORG_A });
    await insPolicy({ org: ORG_B, version: "9.9" }); // policy exists only under org B
    const r = await approveSubprocessorForOrg({ id: SP, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(r.ok).toBe(false);
    expect(reasons(r as never)).toContain("PROVIDER_POLICY_CONFIGURATION_REQUIRED");
    expect(await subLifecycle()).toBe("UNDER_REVIEW");
  });

  it("a declared scope the policy does not permit is denied (PARTIAL_PROVIDER_SCOPE_APPROVAL=0)", async () => {
    await insSub(SP, { lifecycle: "UNDER_REVIEW", dataClasses: ["tenant_operational", "personal_data"] });
    await insPolicy({ classes: ["public", "tenant_operational"] }); // personal_data NOT allowed
    const r = await approveSubprocessorForOrg({ id: SP, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(r.ok).toBe(false);
    expect(reasons(r as never).some((x) => x.startsWith("PROVIDER_POLICY_DENIED"))).toBe(true);
    expect(await subLifecycle()).toBe("UNDER_REVIEW");
  });

  it("DETERMINISTIC BARRIER — approval blocks on a held policy lock, then fails closed after DISABLED commits", async () => {
    await insSub(SP, { lifecycle: "UNDER_REVIEW" });
    await insPolicy({ enabled: true, version: "1.0" });
    const p = await db();
    let approvalResult: Awaited<ReturnType<typeof approveSubprocessorForOrg>> | null = null;
    let approvalP: Promise<void> | null = null;

    await p.$transaction(async (txA) => {
      // A explicitly holds the AiProviderPolicy row FOR UPDATE (conflicts with the FOR SHARE the approval takes).
      await txA.$queryRawUnsafe(`SELECT "id" FROM "AiProviderPolicy" WHERE "organizationId"=$1 AND "providerRegistryId"=$2 FOR UPDATE`, ORG_A, REG);
      approvalP = approveSubprocessorForOrg({ id: SP, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() })
        .then((r) => { approvalResult = r; });
      await sleep(700);
      // Blocked: not yet resolved, row still UNDER_REVIEW.
      expect(approvalResult).toBeNull();
      expect(await subLifecycle()).toBe("UNDER_REVIEW");
      // Commit the policy DISABLED inside A.
      await txA.$executeRawUnsafe(`UPDATE "AiProviderPolicy" SET enabled=false, "updatedAt"=now() WHERE "organizationId"=$1 AND "providerRegistryId"=$2`, ORG_A, REG);
    }, { timeout: 20000, maxWait: 20000 });

    await approvalP;
    expect(approvalResult).not.toBeNull();
    expect(approvalResult!.ok).toBe(false);
    expect(reasons(approvalResult as never)).toContain("PROVIDER_POLICY_DENIED:POLICY_DISABLED");
    expect(await subLifecycle()).toBe("UNDER_REVIEW"); // APPROVAL_AFTER_COMMITTED_POLICY_DISABLE=0
  });

  // ── DataTransfer re-validation against the CURRENT policy ────────────────────
  async function seedApprovedLink(over: { version?: string } = {}) {
    await insSub(SP, { lifecycle: "APPROVED", evidence: true, version: over.version ?? "1.0" });
    await insTransfer(TF, { sub: SP });
  }

  it("transfer approval succeeds when the linked subprocessor's bound policy version still matches", async () => {
    await seedApprovedLink();
    await insPolicy({ version: "1.0" });
    const r = await approveDataTransferForOrg({ id: TF, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(r.ok).toBe(true);
    expect(await tfLifecycle()).toBe("APPROVED");
  });

  it("transfer blocks when the org Policy version was replaced after subprocessor approval", async () => {
    await seedApprovedLink({ version: "1.0" });
    await insPolicy({ version: "2.0" }); // current policy no longer matches the bound evidence
    const r = await approveDataTransferForOrg({ id: TF, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(r.ok).toBe(false);
    expect(reasons(r as never)).toContain("PROVIDER_POLICY_VERSION_MISMATCH");
    expect(await tfLifecycle()).toBe("UNDER_REVIEW"); // TRANSFER_APPROVED_WITH_POLICY_VERSION_MISMATCH=0
  });

  it("transfer blocks after a current-policy denial / expiry / deletion", async () => {
    await seedApprovedLink();
    await insPolicy({ enabled: false });
    let r = await approveDataTransferForOrg({ id: TF, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(reasons(r as never)).toContain("PROVIDER_POLICY_DENIED:POLICY_DISABLED");

    await (await db()).$executeRawUnsafe(`DELETE FROM "AiProviderPolicy" WHERE "organizationId"=$1`, ORG_A);
    await insPolicy({ enabled: true, expiresAt: "2000-01-01T00:00:00.000Z" });
    r = await approveDataTransferForOrg({ id: TF, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(reasons(r as never)).toContain("PROVIDER_POLICY_DENIED:POLICY_EXPIRED");

    await (await db()).$executeRawUnsafe(`DELETE FROM "AiProviderPolicy" WHERE "organizationId"=$1`, ORG_A);
    r = await approveDataTransferForOrg({ id: TF, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(reasons(r as never)).toContain("PROVIDER_POLICY_CONFIGURATION_REQUIRED");
    expect(await tfLifecycle()).toBe("UNDER_REVIEW"); // TRANSFER_APPROVED_AFTER_POLICY_DENIAL=0
  });

  it("DETERMINISTIC BARRIER — transfer approval blocks on the linked-subprocessor row lock, then is denied after SUSPENDED commits", async () => {
    await seedApprovedLink();
    await insPolicy({ version: "1.0" });
    const p = await db();
    let transferResult: Awaited<ReturnType<typeof approveDataTransferForOrg>> | null = null;
    let transferP: Promise<void> | null = null;

    await p.$transaction(async (txA) => {
      // A holds the linked Subprocessor row FOR UPDATE.
      await txA.$queryRawUnsafe(`SELECT "id" FROM "Subprocessor" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`, SP, ORG_A);
      transferP = approveDataTransferForOrg({ id: TF, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() })
        .then((r) => { transferResult = r; });
      await sleep(700);
      expect(transferResult).toBeNull();
      expect(await tfLifecycle()).toBe("UNDER_REVIEW");
      // Commit the linked subprocessor SUSPENDED inside A.
      await txA.$executeRawUnsafe(`UPDATE "Subprocessor" SET lifecycle='SUSPENDED', "updatedAt"=now() WHERE id=$1`, SP);
    }, { timeout: 20000, maxWait: 20000 });

    await transferP;
    expect(transferResult).not.toBeNull();
    const tres = transferResult!;
    expect(tres.ok).toBe(false);
    const blockers = tres.ok ? [] : (tres.blockers ?? []);
    expect(blockers.some((b) => b.field === "subprocessorId")).toBe(true);
    expect(await tfLifecycle()).toBe("UNDER_REVIEW"); // TRANSFER_APPROVED_AFTER_COMMITTED_SUBPROCESSOR_SUSPENSION=0
  });

  it("repeated race — subprocessor suspension vs transfer approval never both commit", async () => {
    for (let i = 0; i < 12; i++) {
      await reset();
      await seedApprovedLink();
      await insPolicy({ version: "1.0" });
      const p = await db();
      const [tr] = await Promise.all([
        approveDataTransferForOrg({ id: TF, organizationId: ORG_A, actorId: "owner-A", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() }),
        p.$executeRawUnsafe(`UPDATE "Subprocessor" SET lifecycle='SUSPENDED', "updatedAt"=now() WHERE id=$1`, SP),
      ]);
      // Never a committed APPROVED transfer whose linked subprocessor is committed SUSPENDED.
      if (tr.ok && (await tfLifecycle()) === "APPROVED") {
        expect(await subLifecycle()).not.toBe("SUSPENDED");
      }
    }
  });
});

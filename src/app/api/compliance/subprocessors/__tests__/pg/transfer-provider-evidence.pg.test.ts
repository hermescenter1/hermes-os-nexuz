import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { providerScopeHash } from "@/lib/compliance/transfer-governance";
import {
  approveSubprocessorForOrg, approveDataTransferForOrg,
  transitionGovernanceRecordForOrg, updateGovernanceRecordForOrg,
} from "@/lib/compliance/transfer-db";

/**
 * Phase 97 Part I — REAL-PostgreSQL provider-policy evidence & expiry integrity.
 *
 * Proves against the actual DB + the ACTUAL persistence functions:
 *   - the migration-13 string-element CHECK + helper function exist and are enforced;
 *   - a policy that expires WHILE the approval waits on the policy-row lock is seen as
 *     expired — the evaluation time is captured AFTER the locks (clock_timestamp), not
 *     from a route-captured Date (APPROVAL_AFTER_POLICY_EXPIRY_DURING_LOCK_WAIT=0,
 *     TRANSFER_APPROVAL_AFTER_POLICY_EXPIRY_DURING_LOCK_WAIT=0);
 *   - stale provider evidence is cleared on supersession, SUSPENDED→UNDER_REVIEW,
 *     provider unlink and scope change, and a non-provider approval persists null
 *     evidence (STALE_PROVIDER_EVIDENCE_*=0, NON_PROVIDER_APPROVAL_WITH_PROVIDER_EVIDENCE=0);
 *   - a malformed stored scope can never reach APPROVED (DB CHECK + strict parser).
 * Nothing here contacts any provider.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgev97i";
const ORG = `${TAG}-org`;
const REG = "anthropic:claude-sonnet-4-20250514";
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

/** Insert a Subprocessor with explicit provider link, scope (raw JSONB) and evidence. */
async function insSub(id: string, opts: {
  lifecycle?: string; provider?: boolean; dataClassesJson?: string; workflowsJson?: string;
  evidence?: boolean; version?: string; scopeHash?: string;
} = {}) {
  const p = await db();
  const lifecycle = opts.lifecycle ?? "UNDER_REVIEW";
  const provider = opts.provider ?? true;
  const evidence = opts.evidence ?? false;
  const attributed = lifecycle === "APPROVED" || lifecycle === "ACTIVE";
  await p.$executeRawUnsafe(
    `INSERT INTO "Subprocessor"
      (id,"organizationId",name,lifecycle,"contractReviewStatus","privacyReviewStatus","securityReviewStatus",
       "providerRegistryId","providerDataClasses","providerWorkflows",
       "approvedBy","approvedAt","approvedProviderPolicyVersion","approvedProviderScopeHash","providerPolicyEvaluatedAt","updatedAt")
     VALUES ($1,$2,'V',$3,'APPROVED','APPROVED','APPROVED',$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,now())`,
    id, ORG, lifecycle,
    provider ? REG : null,
    provider ? (opts.dataClassesJson ?? JSON.stringify(["tenant_operational"])) : "[]",
    provider ? (opts.workflowsJson ?? JSON.stringify([WF])) : "[]",
    attributed ? "a" : null,
    attributed ? new Date() : null,
    evidence ? (opts.version ?? "1.0") : null,
    evidence ? (opts.scopeHash ?? SCOPE_HASH) : null,
    evidence ? new Date() : null,
  );
}
async function insTransfer(id: string, sub: string) {
  const p = await db();
  await p.$executeRawUnsafe(
    `INSERT INTO "DataTransfer" (id,"organizationId","subprocessorId","transferMechanismStatus","legalReviewStatus","riskReviewStatus",lifecycle,"updatedAt")
     VALUES ($1,$2,$3,'CONFIGURED','APPROVED','APPROVED','UNDER_REVIEW',now())`, id, ORG, sub);
}
async function insPolicy(opts: { enabled?: boolean; version?: string; expiresAt?: Date | null } = {}) {
  const p = await db();
  await p.$executeRawUnsafe(
    `INSERT INTO "AiProviderPolicy" (id,"organizationId","providerRegistryId",enabled,"allowedDataClasses","allowedWorkflows","approvedBy","policyVersion","expiresAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5::text[],$6::text[],'a',$7,$8,now())`,
    `${TAG}-pol`, ORG, REG, opts.enabled ?? true, ["public", "tenant_operational"], [WF], opts.version ?? "1.0", opts.expiresAt ?? null);
}
async function dbClock(): Promise<Date> {
  const p = await db();
  return (await p.$queryRawUnsafe<{ now: Date }[]>(`SELECT clock_timestamp() AS "now"`))[0].now;
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
async function evidence(id = SP): Promise<{ v: string | null; h: string | null; at: Date | null }> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ v: string | null; h: string | null; at: Date | null }[]>(
    `SELECT "approvedProviderPolicyVersion" v, "approvedProviderScopeHash" h, "providerPolicyEvaluatedAt" at FROM "Subprocessor" WHERE id=$1`, id);
  return r[0];
}
const reasons = (r: { blockers?: Array<{ reason: string }> }) => (r.blockers ?? []).map((b) => b.reason);

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 Part I — provider evidence & expiry (real PG)", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ($1,'O',$2,'{}'::jsonb,now(),now())`, ORG, `${ORG}-slug`);
  });
  afterAll(cleanup);
  beforeEach(reset);

  // ── migration-13 string-element CHECK + helper function ─────────────────────
  it("the migration-13 string-element CHECK + helper function exist and classify correctly", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%provider_scope_string_elements%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const chk = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname='Subprocessor_provider_scope_string_elements_check'`);
    expect(chk.length).toBe(1);
    const f = await p.$queryRawUnsafe<{ r: boolean }[]>(`SELECT
      compliance_jsonb_is_string_array('["a","b"]'::jsonb) AND compliance_jsonb_is_string_array('[]'::jsonb)
      AND NOT compliance_jsonb_is_string_array('[1]'::jsonb) AND NOT compliance_jsonb_is_string_array('[null]'::jsonb)
      AND NOT compliance_jsonb_is_string_array('"x"'::jsonb) AND NOT compliance_jsonb_is_string_array('{}'::jsonb) AS r`);
    expect(f[0].r).toBe(true);
  });

  it("the DB CHECK rejects a non-string scope member on an APPROVED provider row (insert + update)", async () => {
    const p = await db();
    // APPROVED provider row with a numeric scope member → rejected.
    await expect(insSub(`${TAG}-badins`, { lifecycle: "APPROVED", evidence: true, dataClassesJson: JSON.stringify([1]) })).rejects.toBeTruthy();
    // A valid APPROVED provider row is accepted; mutating its scope to a non-string is rejected.
    await insSub(`${TAG}-good`, { lifecycle: "APPROVED", evidence: true });
    await expect(p.$executeRawUnsafe(`UPDATE "Subprocessor" SET "providerDataClasses"='[1]'::jsonb WHERE id=$1`, `${TAG}-good`)).rejects.toBeTruthy();
    // A DRAFT/UNDER_REVIEW provider row MAY hold an in-progress (even malformed) scope.
    await insSub(`${TAG}-draftbad`, { lifecycle: "UNDER_REVIEW", dataClassesJson: JSON.stringify([1]) });
  });

  // ── expiry crossing during the policy-lock wait ─────────────────────────────
  it("DETERMINISTIC BARRIER — subprocessor approval DENIED when the policy expires during the lock wait", async () => {
    await insSub(SP, { lifecycle: "UNDER_REVIEW" });
    const t0 = await dbClock();
    const expiresAt = new Date(t0.getTime() + 500);   // expires 500ms after route entry
    await insPolicy({ enabled: true, version: "1.0", expiresAt });
    const p = await db();
    let res: Awaited<ReturnType<typeof approveSubprocessorForOrg>> | null = null;
    let pr: Promise<void> | null = null;

    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "AiProviderPolicy" WHERE "organizationId"=$1 AND "providerRegistryId"=$2 FOR UPDATE`, ORG, REG);
      // Route-captured 'now' is BEFORE the expiry — the OLD code would have approved.
      pr = approveSubprocessorForOrg({ id: SP, organizationId: ORG, actorId: "o", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: t0 })
        .then((r) => { res = r; });
      await sleep(1200);                               // hold the lock PAST the expiry
      expect(res).toBeNull();                          // still blocked on FOR SHARE
      expect(await subLifecycle()).toBe("UNDER_REVIEW");
    }, { timeout: 20000, maxWait: 20000 });

    await pr;
    const r = res as Awaited<ReturnType<typeof approveSubprocessorForOrg>> | null;
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    expect(reasons(r as never)).toContain("PROVIDER_POLICY_DENIED:POLICY_EXPIRED");
    expect(await subLifecycle()).toBe("UNDER_REVIEW");
    expect((await evidence()).v).toBeNull();           // no evidence persisted
  });

  it("DETERMINISTIC BARRIER — transfer approval DENIED when the policy expires during the lock wait", async () => {
    await insSub(SP, { lifecycle: "APPROVED", evidence: true });
    await insTransfer(TF, SP);
    const t0 = await dbClock();
    const expiresAt = new Date(t0.getTime() + 500);
    await insPolicy({ enabled: true, version: "1.0", expiresAt });
    const p = await db();
    let res: Awaited<ReturnType<typeof approveDataTransferForOrg>> | null = null;
    let pr: Promise<void> | null = null;

    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "AiProviderPolicy" WHERE "organizationId"=$1 AND "providerRegistryId"=$2 FOR UPDATE`, ORG, REG);
      pr = approveDataTransferForOrg({ id: TF, organizationId: ORG, actorId: "o", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: t0 })
        .then((r) => { res = r; });
      await sleep(1200);
      expect(res).toBeNull();
      expect(await tfLifecycle()).toBe("UNDER_REVIEW");
    }, { timeout: 20000, maxWait: 20000 });

    await pr;
    const r = res as Awaited<ReturnType<typeof approveDataTransferForOrg>> | null;
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    expect(reasons(r as never)).toContain("PROVIDER_POLICY_DENIED:POLICY_EXPIRED");
    expect(await tfLifecycle()).toBe("UNDER_REVIEW");
  });

  // ── stale-evidence clearing (real persistence functions) ────────────────────
  it("supersession APPROVED→UNDER_REVIEW clears approval + provider evidence", async () => {
    await insSub(SP, { lifecycle: "APPROVED", evidence: true });
    const { affected } = await transitionGovernanceRecordForOrg({ register: "subprocessor", id: SP, organizationId: ORG, actorId: "o", from: "APPROVED", to: "UNDER_REVIEW", now: new Date() });
    expect(affected).toBe(1);
    expect(await subLifecycle()).toBe("UNDER_REVIEW");
    expect(await evidence()).toMatchObject({ v: null, h: null, at: null });
  });
  it("SUSPENDED retains evidence; SUSPENDED→UNDER_REVIEW clears it", async () => {
    await insSub(SP, { lifecycle: "APPROVED", evidence: true });
    await transitionGovernanceRecordForOrg({ register: "subprocessor", id: SP, organizationId: ORG, actorId: "o", from: "APPROVED", to: "SUSPENDED", now: new Date() });
    expect((await evidence()).h).toBe(SCOPE_HASH);       // retained under suspension
    await transitionGovernanceRecordForOrg({ register: "subprocessor", id: SP, organizationId: ORG, actorId: "o", from: "SUSPENDED", to: "UNDER_REVIEW", now: new Date() });
    expect(await evidence()).toMatchObject({ v: null, h: null, at: null });
  });
  it("provider unlink on an editable row clears stored provider evidence", async () => {
    await insSub(SP, { lifecycle: "UNDER_REVIEW", evidence: true });
    const res = await updateGovernanceRecordForOrg({ register: "subprocessor", id: SP, organizationId: ORG, actorId: "o", data: { providerRegistryId: null }, reviewTouched: false, now: new Date() });
    expect(res.ok).toBe(true);
    expect(await evidence()).toMatchObject({ v: null, h: null, at: null });
  });
  it("scope change on an editable row clears stored provider evidence", async () => {
    await insSub(SP, { lifecycle: "UNDER_REVIEW", evidence: true });
    const res = await updateGovernanceRecordForOrg({ register: "subprocessor", id: SP, organizationId: ORG, actorId: "o", data: { providerDataClasses: ["public"] }, reviewTouched: false, now: new Date() });
    expect(res.ok).toBe(true);
    expect(await evidence()).toMatchObject({ v: null, h: null, at: null });
  });
  it("a non-provider approval persists NULL provider evidence (no historical leak)", async () => {
    // A non-provider UNDER_REVIEW row carrying stale evidence from a former link.
    await insSub(SP, { lifecycle: "UNDER_REVIEW", provider: false });
    await (await db()).$executeRawUnsafe(
      `UPDATE "Subprocessor" SET "approvedProviderPolicyVersion"='9.9', "approvedProviderScopeHash"=$2, "providerPolicyEvaluatedAt"=now() WHERE id=$1`, SP, "f".repeat(64));
    const r = await approveSubprocessorForOrg({ id: SP, organizationId: ORG, actorId: "o", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(r.ok).toBe(true);
    expect(await subLifecycle()).toBe("APPROVED");
    expect(await evidence()).toMatchObject({ v: null, h: null, at: null });
  });
  it("a malformed stored scope is denied on approval by the strict parser (never reaches the DB CHECK)", async () => {
    await insSub(SP, { lifecycle: "UNDER_REVIEW", dataClassesJson: JSON.stringify([1]) });
    await insPolicy({ enabled: true, version: "1.0" });
    const r = await approveSubprocessorForOrg({ id: SP, organizationId: ORG, actorId: "o", from: "UNDER_REVIEW", to: "APPROVED", externalAiEnabled: true, now: new Date() });
    expect(r.ok).toBe(false);
    expect(reasons(r as never)).toContain("PROVIDER_SCOPE_INVALID");
    expect(await subLifecycle()).toBe("UNDER_REVIEW");
  });
});

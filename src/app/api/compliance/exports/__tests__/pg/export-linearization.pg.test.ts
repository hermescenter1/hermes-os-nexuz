import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";
import {
  issueDownloadTokenForReadyJob,
  revokeExportJobAndTokensForOrg,
  consumeDownloadTokenLinearized,
} from "@/lib/compliance/export-db";

/**
 * Phase 97 Part G — REAL-PostgreSQL token-lifecycle linearization.
 *
 * These tests exercise the ACTUAL persistence functions (not mocks, not raw token
 * UPDATEs) across genuinely concurrent transactions on independent pooled
 * connections, proving the `SELECT ... FOR UPDATE` job-row lock serializes issuance,
 * revocation and redemption:
 *   - issuance racing revocation never ends with job=REVOKED AND a live token;
 *   - revocation-first denies issuance; issuance-first is later swept by revocation;
 *   - redemption racing revocation resolves to exactly one linearized outcome;
 *   - a deterministic barrier (transaction A holds the job row FOR UPDATE) proves the
 *     application operation BLOCKS on the lock before writing a token, then fails
 *     closed once A commits REVOKED.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pglin97g";
const ORG = `${TAG}-org`, USER = `${TAG}-user`, PR = `${TAG}-pr`, JOB = `${TAG}-job`;
const hex = () => createHash("sha256").update(randomBytes(32)).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Tx = {
  $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T>;
};
type Pg = Tx & {
  $transaction: <T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number; maxWait?: number }) => Promise<T>;
};
async function db(): Promise<Pg> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Pg; }

async function cleanup() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "ExportDownloadToken" WHERE "exportRequestId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "DataExportRequest" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "PrivacyRequest" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}
async function resetJobReady() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "ExportDownloadToken" WHERE "exportRequestId"=$1`, JOB);
  await p.$executeRawUnsafe(`UPDATE "DataExportRequest" SET lifecycle='READY', "revokedAt"=NULL, "revokedBy"=NULL, "updatedAt"=now() WHERE id=$1`, JOB);
}
async function liveTokenCount(): Promise<number> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ExportDownloadToken" WHERE "exportRequestId"=$1 AND "usedAt" IS NULL AND "revokedAt" IS NULL`, JOB);
  return r[0].c;
}
async function usedTokenCount(h: string): Promise<number> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ExportDownloadToken" WHERE "tokenHash"=$1 AND "usedAt" IS NOT NULL`, h);
  return r[0].c;
}
async function jobLifecycle(): Promise<string> {
  const p = await db();
  const r = await p.$queryRawUnsafe<{ lifecycle: string }[]>(`SELECT lifecycle FROM "DataExportRequest" WHERE id=$1`, JOB);
  return r[0].lifecycle;
}

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 Part G — token-lifecycle linearization (real PG)", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ($1,'O',$2,'{}'::jsonb,now(),now())`, ORG, `${TAG}-slug`);
    await p.$executeRawUnsafe(`INSERT INTO "User" (id,name,email,"passwordHash","updatedAt") VALUES ($1,'U',$2,'x',now())`, USER, `${TAG}@x.com`);
    await p.$executeRawUnsafe(`INSERT INTO "PrivacyRequest" (id,"requestType",status,email,locale,"userId","organizationId","identityVerifiedAt",metadata,"createdAt","updatedAt")
      VALUES ($1,'DATA_EXPORT','APPROVED',$2,'en',$3,$4,now(),'{}'::jsonb,now(),now())`, PR, `${TAG}@x.com`, USER, ORG);
    // A fully-evidenced governed READY job (satisfies every migration-8 CHECK).
    await p.$executeRawUnsafe(
      `INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","approvedBy","approvedAt","packageKey","contentHash","packageHash","schemaVersion","expiresAt","completedAt","createdAt","updatedAt")
       VALUES ($1,$2,'PENDING','READY',$3,$4,$5,'USER',$3,'a',now(),'exports/'||$1||'/package.json',$6,$7,'1.0',now()+interval '2 hours',now(),now(),now())`,
      JOB, `${TAG}@x.com`, PR, ORG, USER, hex(), hex());
  });
  afterAll(cleanup);
  beforeEach(resetJobReady);

  it("revocation committed first → issuance is denied and inserts no token", async () => {
    const rev = await revokeExportJobAndTokensForOrg({ id: JOB, organizationId: ORG, actorId: "a", now: new Date() });
    expect(rev.ok).toBe(true);
    const iss = await issueDownloadTokenForReadyJob({ id: JOB, organizationId: ORG, tokenHash: hex(), now: new Date() });
    expect(iss.ok).toBe(false);
    expect(await liveTokenCount()).toBe(0); // TOKEN_ISSUED_AFTER_COMMITTED_REVOCATION=0
  });

  it("issuance committed first → subsequent revocation leaves zero live tokens", async () => {
    const iss = await issueDownloadTokenForReadyJob({ id: JOB, organizationId: ORG, tokenHash: hex(), now: new Date() });
    expect(iss.ok).toBe(true);
    expect(await liveTokenCount()).toBe(1);
    const rev = await revokeExportJobAndTokensForOrg({ id: JOB, organizationId: ORG, actorId: "a", now: new Date() });
    expect(rev.ok).toBe(true);
    expect(await liveTokenCount()).toBe(0); // REVOKED_EXPORT_WITH_LIVE_TOKEN=0
  });

  it("issuance racing revocation (repeated) never ends REVOKED with a live token", async () => {
    for (let i = 0; i < 15; i++) {
      await resetJobReady();
      const [iss, rev] = await Promise.all([
        issueDownloadTokenForReadyJob({ id: JOB, organizationId: ORG, tokenHash: hex(), now: new Date() }),
        revokeExportJobAndTokensForOrg({ id: JOB, organizationId: ORG, actorId: "a", now: new Date() }),
      ]);
      expect(rev.ok).toBe(true);
      expect(await jobLifecycle()).toBe("REVOKED");
      expect(await liveTokenCount()).toBe(0);
      // If issuance won the lock first, its token exists but must have been revoked.
      void iss;
    }
  });

  it("redemption racing revocation (repeated) resolves to one linearized outcome, no live token", async () => {
    for (let i = 0; i < 15; i++) {
      await resetJobReady();
      const h = hex();
      const iss = await issueDownloadTokenForReadyJob({ id: JOB, organizationId: ORG, tokenHash: h, now: new Date() });
      expect(iss.ok).toBe(true);
      const [consume, rev] = await Promise.all([
        consumeDownloadTokenLinearized({ exportRequestId: JOB, tokenHash: h, subjectUserId: USER, organizationId: ORG, now: new Date() }),
        revokeExportJobAndTokensForOrg({ id: JOB, organizationId: ORG, actorId: "a", now: new Date() }),
      ]);
      expect(rev.ok).toBe(true);
      expect(await jobLifecycle()).toBe("REVOKED");
      expect(await liveTokenCount()).toBe(0);
      // A successful consume implies it committed BEFORE the revocation linearized;
      // otherwise the revocation won and the consume was denied. Never both live.
      if (consume.consumed) expect(await usedTokenCount(h)).toBe(1);
    }
  });

  it("DETERMINISTIC BARRIER — issuance blocks on a held job-row lock, then fails closed after REVOKED commits", async () => {
    await resetJobReady();
    const p = await db();
    const h = hex();
    let issuanceResult: Awaited<ReturnType<typeof issueDownloadTokenForReadyJob>> | null = null;
    let issuanceP: Promise<void> | null = null;

    await p.$transaction(async (txA) => {
      // A explicitly holds the export job row FOR UPDATE.
      await txA.$queryRawUnsafe(`SELECT "id" FROM "DataExportRequest" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`, JOB, ORG);
      // Start the application issuance on another connection; do not await it yet.
      issuanceP = issueDownloadTokenForReadyJob({ id: JOB, organizationId: ORG, tokenHash: h, now: new Date() }).then((r) => { issuanceResult = r; });
      // Give issuance time to reach and BLOCK on the FOR UPDATE.
      await sleep(700);
      // Prove it is blocked: no token inserted and the call has not resolved.
      expect(await liveTokenCount()).toBe(0);
      expect(issuanceResult).toBeNull();
      // Transition the job to REVOKED and commit transaction A.
      await txA.$executeRawUnsafe(`UPDATE "DataExportRequest" SET lifecycle='REVOKED', "revokedAt"=now(), "revokedBy"='barrier', "updatedAt"=now() WHERE id=$1`, JOB);
    }, { timeout: 20000, maxWait: 20000 });

    // A committed → issuance unblocks, re-reads REVOKED and fails closed.
    await issuanceP;
    expect(issuanceResult).not.toBeNull();
    expect(issuanceResult!.ok).toBe(false);
    expect(await liveTokenCount()).toBe(0); // no token inserted after committed revocation
    expect(await jobLifecycle()).toBe("REVOKED");
  });

  it("DETERMINISTIC BARRIER — redemption blocks on a held job-row lock, then is denied after REVOKED commits", async () => {
    await resetJobReady();
    const p = await db();
    const h = hex();
    const iss = await issueDownloadTokenForReadyJob({ id: JOB, organizationId: ORG, tokenHash: h, now: new Date() });
    expect(iss.ok).toBe(true);

    let consumeResult: { consumed: boolean } | null = null;
    let consumeP: Promise<void> | null = null;

    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "DataExportRequest" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`, JOB, ORG);
      consumeP = consumeDownloadTokenLinearized({ exportRequestId: JOB, tokenHash: h, subjectUserId: USER, organizationId: ORG, now: new Date() }).then((r) => { consumeResult = r; });
      await sleep(700);
      // Blocked: token not consumed and the call has not resolved.
      expect(await usedTokenCount(h)).toBe(0);
      expect(consumeResult).toBeNull();
      // Commit a real revocation (job REVOKED + token revoked) inside A.
      await txA.$executeRawUnsafe(`UPDATE "DataExportRequest" SET lifecycle='REVOKED', "revokedAt"=now(), "revokedBy"='barrier', "updatedAt"=now() WHERE id=$1`, JOB);
      await txA.$executeRawUnsafe(`UPDATE "ExportDownloadToken" SET "revokedAt"=now() WHERE "exportRequestId"=$1 AND "usedAt" IS NULL AND "revokedAt" IS NULL`, JOB);
    }, { timeout: 20000, maxWait: 20000 });

    await consumeP;
    expect(consumeResult).not.toBeNull();
    expect(consumeResult!.consumed).toBe(false); // DOWNLOAD_AFTER_COMMITTED_REVOCATION=0
    expect(await usedTokenCount(h)).toBe(0);
    expect(await jobLifecycle()).toBe("REVOKED");
  });
});

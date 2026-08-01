/**
 * PHASE 91 — legacy-upgrade migration rehearsal (CI only, real PostgreSQL).
 *
 * Proves that a database created at the Phase 90 baseline, populated with
 * representative pre-Phase-91 rows, survives the Phase 91 migrations with the
 * correct additive defaults and NO row mutation.
 *
 * Procedure:
 *   1. Temporarily hold back the two Phase 91 migration dirs.
 *   2. `prisma migrate deploy` → base schema (no tokenVersion/userTokenVersion/lastUsedAt).
 *   3. Raw-insert one user + active/revoked/expired refresh tokens (base columns only).
 *   4. Restore the Phase 91 migration dirs.
 *   5. `prisma migrate deploy` → Phase 91 ALTERs + composite index.
 *   6. Verify defaults, row retention, index, and that the current Prisma client
 *      reads the upgraded data.
 *
 * Never prints tokens, hashes, cookies, passwords, or DATABASE_URL. Non-zero exit
 * on any failed assertion. Does NOT execute destructive rollback (documented only).
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(REPO, "prisma", "migrations");
const HOLD = join(REPO, ".phase91-held-migrations");
const PHASE91_DIRS = ["20260815000000_phase91_iam_hardening", "20260815000001_phase91_session_indexes"];

const LEGACY_URL = process.env.DATABASE_URL;      // the (fresh) legacy database
const MAINT = process.env.MAINT_DATABASE_URL;     // an existing database used only to CREATE the legacy one
if (!LEGACY_URL || !MAINT) { console.error("RESULT legacy_upgrade=FAIL (need DATABASE_URL + MAINT_DATABASE_URL)"); process.exit(2); }

// Create the isolated legacy database (idempotent) via a maintenance connection.
{
  const legacyDb = new URL(LEGACY_URL).pathname.replace(/^\//, "");
  const admin = new pg.Client({ connectionString: MAINT });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${legacyDb}"`);
  } catch (e) {
    if (!String(e?.message ?? "").includes("already exists")) throw e;
  } finally {
    await admin.end();
  }
}

function deploy() {
  execSync("npx --no-install prisma migrate deploy", { cwd: REPO, stdio: "inherit", env: process.env });
}
function holdPhase91() {
  if (!existsSync(HOLD)) mkdirSync(HOLD);
  for (const d of PHASE91_DIRS) {
    const from = join(MIGRATIONS, d);
    if (existsSync(from)) renameSync(from, join(HOLD, d));
  }
}
function restorePhase91() {
  for (const d of PHASE91_DIRS) {
    const from = join(HOLD, d);
    if (existsSync(from)) renameSync(from, join(MIGRATIONS, d));
  }
  if (existsSync(HOLD)) rmSync(HOLD, { recursive: true, force: true });
}

let failed = false;
const check = (label, cond) => { console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`); if (!cond) failed = true; };

const adapter = new PrismaPg({ connectionString: LEGACY_URL });
const prisma = new PrismaClient({ adapter });

try {
  // 1-2: base schema only.
  holdPhase91();
  deploy();

  // Guard: the base schema must NOT yet have the Phase 91 columns.
  const before = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE (table_name='User' AND column_name='tokenVersion') OR (table_name='RefreshToken' AND column_name IN ('userTokenVersion','lastUsedAt'))`,
  );
  check("base_has_no_phase91_columns", Number(before[0].n) === 0);

  // 3: representative pre-Phase-91 rows (base columns only).
  const now = new Date();
  const future = new Date(Date.now() + 7 * 24 * 3600_000);
  const past = new Date(Date.now() - 3600_000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User"("id","name","email","passwordHash","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6)`,
    "legacy-u", "Legacy User", "legacy@phase91.test", "x:notarealhash", now, now,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "RefreshToken"("id","userId","tokenHash","expiresAt","revokedAt","createdAt") VALUES
      ('legacy-active','legacy-u','legacy-hash-active',$1,NULL,$2),
      ('legacy-revoked','legacy-u','legacy-hash-revoked',$1,$3,$2),
      ('legacy-expired','legacy-u','legacy-hash-expired',$4,NULL,$2)`,
    future, now, now, past,
  );

  // 4-5: apply Phase 91.
  restorePhase91();
  deploy();

  // 6: verify additive defaults + retention.
  const u = await prisma.$queryRawUnsafe(`SELECT "tokenVersion" FROM "User" WHERE "id"='legacy-u'`);
  check("user_tokenVersion_default_0", Number(u[0]?.tokenVersion) === 0);

  const rts = await prisma.$queryRawUnsafe(
    `SELECT "id","userTokenVersion","lastUsedAt" FROM "RefreshToken" WHERE "userId"='legacy-u' ORDER BY "id"`,
  );
  check("all_three_legacy_rows_retained", rts.length === 3);
  check("refresh_userTokenVersion_default_0", rts.every((r) => Number(r.userTokenVersion) === 0));
  check("refresh_lastUsedAt_null", rts.every((r) => r.lastUsedAt === null));

  const idx = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE tablename='RefreshToken' AND indexname='RefreshToken_userId_revokedAt_idx'`,
  );
  check("composite_index_present", idx.length === 1);

  // Current Prisma client reads the upgraded data through the typed API.
  const typedUser = await prisma.user.findUnique({ where: { id: "legacy-u" }, select: { tokenVersion: true } });
  check("prisma_client_reads_tokenVersion", typedUser?.tokenVersion === 0);
  const typedRts = await prisma.refreshToken.findMany({ where: { userId: "legacy-u" }, select: { id: true, userTokenVersion: true } });
  check("prisma_client_reads_refresh_rows", typedRts.length === 3 && typedRts.every((r) => r.userTokenVersion === 0));

  // Rollback SQL is REVIEWED ONLY (never executed here):
  //   ALTER TABLE "RefreshToken" DROP COLUMN "userTokenVersion";
  //   ALTER TABLE "RefreshToken" DROP COLUMN "lastUsedAt";
  //   ALTER TABLE "User" DROP COLUMN "tokenVersion";
  //   DROP INDEX "RefreshToken_userId_revokedAt_idx";
  console.log("RESULT rollback_sql=REVIEWED_ONLY");
} catch (err) {
  console.error("RESULT legacy_upgrade=FAIL (" + (err?.message ?? "error") + ")");
  failed = true;
} finally {
  restorePhase91();
  await prisma.$disconnect().catch(() => {});
}

console.log(`RESULT legacy_upgrade=${failed ? "FAIL" : "PASS"}`);
process.exit(failed ? 1 : 0);

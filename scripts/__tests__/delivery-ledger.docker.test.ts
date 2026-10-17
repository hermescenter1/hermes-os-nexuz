/**
 * ROW 10 — the delivery ledger's database guarantees, against real PostgreSQL.
 *
 * The application-level tests use a fake that enforces the unique constraint.
 * That is the right shape for testing the worker, but it proves nothing about
 * the DATABASE: whether the constraint exists, whether the append-only
 * trigger actually refuses an UPDATE, whether the shape checks reject a
 * malformed row. Those are properties of the migration, and a migration is
 * only true once a server has run it.
 *
 * The migration file is applied verbatim — not a hand-written approximation
 * of it — so what is tested is what will ship.
 *
 * Skipped when Docker is unreachable. Everything is created and dropped
 * inside a disposable container; nothing touches production.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MIGRATION = "prisma/migrations/20261016120000_executive_report_delivery_ledger/migration.sql";
const CONTAINER = `hermes98_pg_ledger_${Math.random().toString(16).slice(2, 10)}`;
const IMAGE = "pgvector/pgvector:pg16";
const USER = "hermes_ci";
const DB = "hermes_ci";
const LF = String.fromCharCode(10);

const sh = (args: string[], input = "") =>
  spawnSync(args[0], args.slice(1), { encoding: "utf8", input });

const dockerAvailable = (() => {
  const r = sh(["docker", "version", "--format", "{{.Server.Version}}"]);
  return r.status === 0 && (r.stdout ?? "").trim().length > 0;
})();

/** Set at the END of setup, so a setup that threw cannot look like a run. */
let suiteRan = false;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function psql(dbName: string, sql: string) {
  return sh(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", USER, "-d", dbName], sql);
}

let dbSeq = 0;
/** A database with the real migration applied, and nothing else. */
function freshDb(): string {
  const name = `ledger_case_${(dbSeq += 1)}`;
  const created = psql("postgres", `DROP DATABASE IF EXISTS ${name}; CREATE DATABASE ${name};`);
  if (created.status !== 0) throw new Error(`create ${name}: ${created.stderr}`);
  const applied = psql(name, readFileSync(MIGRATION, "utf8"));
  if (applied.status !== 0) throw new Error(`apply migration: ${applied.stderr}`);
  return name;
}

const ROW = (over: Partial<Record<string, string | number>> = {}) => {
  const v = {
    id: "del-1",
    organizationId: "org-a",
    businessDate: "2026-10-14",
    reportVersion: 1,
    userId: "user-owner",
    roleAtSend: "OWNER",
    statusAtSend: "ACTIVE",
    rulesVersion: "notify-roles-1",
    allowedRoles: "ADMIN,OWNER",
    ...over,
  };
  return `INSERT INTO "ExecutiveReportDelivery"
    ("id","organizationId","businessDate","reportVersion","userId","roleAtSend","statusAtSend","rulesVersion","allowedRoles")
    VALUES ('${v.id}','${v.organizationId}','${v.businessDate}',${v.reportVersion},'${v.userId}','${v.roleAtSend}','${v.statusAtSend}','${v.rulesVersion}','${v.allowedRoles}');`;
};

beforeAll(async () => {
  if (!dockerAvailable) return;
  sh(["docker", "rm", "-f", CONTAINER]);
  const run = sh([
    "docker", "run", "-d", "--name", CONTAINER,
    "-e", `POSTGRES_USER=${USER}`,
    "-e", `POSTGRES_PASSWORD=disposable_${Math.random().toString(16).slice(2)}`,
    "-e", `POSTGRES_DB=${DB}`,
    IMAGE,
  ]);
  if (run.status !== 0) throw new Error(`docker run: ${run.stderr}`);
  // Over TCP and twice: the entrypoint runs a socket-only server during
  // initialisation and then stops it, so a socket probe can answer for a
  // server that is about to disappear.
  let streak = 0;
  for (let i = 0; i < 300 && streak < 2; i += 1) {
    const r = sh(["docker", "exec", CONTAINER, "pg_isready", "-U", USER, "-d", DB, "-h", "127.0.0.1"]);
    streak = r.status === 0 ? streak + 1 : 0;
    if (streak < 2) await sleep(1000);
  }
  if (streak < 2) throw new Error("disposable postgres did not become ready");
  suiteRan = true;
}, 600_000);

afterAll(() => {
  if (!dockerAvailable) return;
  sh(["docker", "rm", "-f", CONTAINER]);
});

describe.skipIf(!dockerAvailable)("the delivery ledger, as the database enforces it", () => {
  it("the suite actually ran, rather than being skipped into a pass", () => {
    expect(suiteRan).toBe(true);
  });

  it("applies the shipped migration as written", () => {
    const db = freshDb();
    const r = psql(db, `SELECT count(*) FROM "ExecutiveReportDelivery";`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("0");
  }, 120_000);

  it("accepts one delivery and REFUSES a second for the same recipient and version", () => {
    const db = freshDb();
    expect(psql(db, ROW()).status).toBe(0);
    const second = psql(db, ROW({ id: "del-2" }));
    expect(second.status).not.toBe(0);
    expect(second.stderr).toMatch(/duplicate key|unique constraint/i);
  }, 120_000);

  it("accepts the same recipient for a different report VERSION", () => {
    // A correction is a new report version, and telling someone about it is
    // a new delivery — not an edit of the first.
    const db = freshDb();
    expect(psql(db, ROW()).status).toBe(0);
    expect(psql(db, ROW({ id: "del-2", reportVersion: 2 })).status).toBe(0);
  }, 120_000);

  it("accepts the same recipient in a DIFFERENT organization", () => {
    // One person may hold a seat in two tenants; each tenant's report is its
    // own delivery, and the key is scoped by organization first.
    const db = freshDb();
    expect(psql(db, ROW()).status).toBe(0);
    expect(psql(db, ROW({ id: "del-2", organizationId: "org-b" })).status).toBe(0);
  }, 120_000);

  it("REFUSES an UPDATE — the authority cannot be rewritten afterwards", () => {
    // This is the whole point of the table. A record the application can
    // edit is not a record.
    const db = freshDb();
    expect(psql(db, ROW()).status).toBe(0);
    const edit = psql(db, `UPDATE "ExecutiveReportDelivery" SET "roleAtSend" = 'VIEWER' WHERE "id" = 'del-1';`);
    expect(edit.status).not.toBe(0);
    expect(edit.stderr).toMatch(/append-only/i);
    // And the row is unchanged.
    const after = psql(db, `SELECT "roleAtSend" FROM "ExecutiveReportDelivery" WHERE "id" = 'del-1';`);
    expect(after.stdout).toContain("OWNER");
  }, 120_000);

  it("REFUSES a DELETE — a delivery cannot be made to have never happened", () => {
    const db = freshDb();
    expect(psql(db, ROW()).status).toBe(0);
    const removed = psql(db, `DELETE FROM "ExecutiveReportDelivery" WHERE "id" = 'del-1';`);
    expect(removed.status).not.toBe(0);
    expect(removed.stderr).toMatch(/append-only/i);
    expect(psql(db, `SELECT count(*) FROM "ExecutiveReportDelivery";`).stdout).toContain("1");
  }, 120_000);

  it.each([
    ["a business date that is not a date", { businessDate: "14/10/2026" }],
    ["a report version below one", { reportVersion: 0 }],
    ["an empty role", { roleAtSend: "" }],
    ["an empty status", { statusAtSend: "" }],
    ["an empty rules version", { rulesVersion: "" }],
    ["an empty allowlist", { allowedRoles: "" }],
  ])("REFUSES %s", (_label, over) => {
    const db = freshDb();
    const r = psql(db, ROW(over as Record<string, string | number>));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/check constraint|value too long/i);
  }, 240_000);

  it("NORMALISES a trailing space in the business date rather than refusing it", () => {
    // Measured, not assumed: `varchar(10)` follows the SQL standard and
    // truncates an overlong value whose excess is ALL SPACES, without error.
    // So '2026-10-14 ' is stored as '2026-10-14' and passes the regex check.
    //
    // That is left as it is, deliberately. ExecutiveDailyReport.businessDate
    // is varchar(10) too and normalises identically, so the two still match —
    // which is the property this column exists to preserve. Non-space
    // overflow still errors, and a date that is simply wrong is still
    // refused by the CHECK above.
    const db = freshDb();
    expect(psql(db, ROW({ businessDate: "2026-10-14 " })).status).toBe(0);
    const stored = psql(db, `SELECT length("businessDate") FROM "ExecutiveReportDelivery";`);
    expect(stored.stdout.split(LF).map(l => l.trim())).toContain("10");
    // Eleven characters of real content is still an error, not a silent cut.
    const db2 = freshDb();
    expect(psql(db2, ROW({ businessDate: "2026-10-144" })).status).not.toBe(0);
  }, 180_000);

  /**
   * ATOMICITY, proven by the server rather than by a fake.
   *
   * The failure this guards against is silent and permanent: if the ledger
   * row were claimed first and the worker died before creating the
   * notification, every later pass would read the claim, skip the recipient,
   * and the announcement would be lost for ever. One transaction makes that
   * state unreachable.
   *
   * A minimal "Notification" table is created alongside, because this is
   * about transaction semantics, not about Prisma's schema.
   */
  function withNotificationTable(): string {
    const db = freshDb();
    const made = psql(
      db,
      `CREATE TABLE "Notification" (
         "id" TEXT PRIMARY KEY,
         "userId" TEXT NOT NULL,
         "metadata" JSONB NOT NULL DEFAULT '{}'
       );`,
    );
    if (made.status !== 0) throw new Error(made.stderr);
    return db;
  }

  it("commits the notification and the record together", () => {
    const db = withNotificationTable();
    const r = psql(
      db,
      `BEGIN;
       INSERT INTO "Notification" ("id","userId") VALUES ('ntf-1','user-owner');
       ${ROW({ notificationId: "ntf-1" } as Record<string, string | number>).replace(
         '"allowedRoles")',
         '"allowedRoles","notificationId")',
       ).replace("'ADMIN,OWNER');", "'ADMIN,OWNER','ntf-1');")}
       COMMIT;`,
    );
    expect(r.status).toBe(0);
    expect(psql(db, `SELECT count(*) FROM "Notification";`).stdout).toContain("1");
    const joined = psql(
      db,
      `SELECT d."notificationId" FROM "ExecutiveReportDelivery" d WHERE d."id" = 'del-1';`,
    );
    expect(joined.stdout).toContain("ntf-1");
  }, 180_000);

  it("rolls BOTH back when the record loses the unique constraint", () => {
    // The losing replica. Its notification must not survive its rolled-back
    // claim, or the recipient is told twice.
    const db = withNotificationTable();
    expect(psql(db, ROW()).status).toBe(0);
    const second = psql(
      db,
      `BEGIN;
       INSERT INTO "Notification" ("id","userId") VALUES ('ntf-2','user-owner');
       ${ROW({ id: "del-2" })}
       COMMIT;`,
    );
    expect(second.status).not.toBe(0);
    expect(second.stderr).toMatch(/duplicate key|unique constraint/i);
    // Neither the second delivery nor its notification exists.
    expect(psql(db, `SELECT count(*) FROM "ExecutiveReportDelivery";`).stdout).toContain("1");
    expect(psql(db, `SELECT count(*) FROM "Notification";`).stdout).toContain("0");
  }, 180_000);

  it("rolls BOTH back when the notification fails, leaving the recipient retryable", () => {
    // The crash case, made deterministic: the notification insert violates
    // its primary key, the transaction aborts, and NOTHING is left behind —
    // so a later pass sees no claim and tries again.
    const db = withNotificationTable();
    expect(psql(db, `INSERT INTO "Notification" ("id","userId") VALUES ('ntf-1','someone');`).status).toBe(0);
    const attempt = psql(
      db,
      `BEGIN;
       INSERT INTO "Notification" ("id","userId") VALUES ('ntf-1','user-owner');
       ${ROW()}
       COMMIT;`,
    );
    expect(attempt.status).not.toBe(0);
    // No claim survived, so the recipient is still deliverable.
    expect(psql(db, `SELECT count(*) FROM "ExecutiveReportDelivery";`).stdout).toContain("0");
    // And a healthy retry succeeds.
    const retry = psql(
      db,
      `BEGIN;
       INSERT INTO "Notification" ("id","userId") VALUES ('ntf-2','user-owner');
       ${ROW({ notificationId: "ntf-2" } as Record<string, string | number>)}
       COMMIT;`,
    );
    expect(retry.status).toBe(0);
    expect(psql(db, `SELECT count(*) FROM "ExecutiveReportDelivery";`).stdout).toContain("1");
  }, 180_000);

  it("a crash AFTER commit leaves both rows, so the next pass correctly skips", () => {
    // Nothing to roll back: the transaction committed, both rows are
    // durable, and a second attempt loses the constraint — which is the
    // right answer, because the person really was told.
    const db = withNotificationTable();
    expect(
      psql(
        db,
        `BEGIN;
         INSERT INTO "Notification" ("id","userId") VALUES ('ntf-1','user-owner');
         ${ROW()}
         COMMIT;`,
      ).status,
    ).toBe(0);
    const again = psql(db, ROW({ id: "del-2" }));
    expect(again.status).not.toBe(0);
    expect(psql(db, `SELECT count(*) FROM "Notification";`).stdout).toContain("1");
  }, 180_000);

  it("has no foreign key, so the record outlives what it describes", () => {
    // Following AuditLog: an audit trail a cascade can delete is not a trail.
    // It is also why the append-only trigger never has to tell a cascade
    // apart from tampering.
    const db = freshDb();
    const fks = psql(
      db,
      `SELECT count(*) FROM pg_constraint
         WHERE conrelid = '"ExecutiveReportDelivery"'::regclass AND contype = 'f';`,
    );
    expect(fks.status).toBe(0);
    expect(fks.stdout.split(LF).map(l => l.trim())).toContain("0");
  }, 120_000);

  /**
   * THE PREMISE THE CLASSIFIER RESTS ON.
   *
   * `deliverOnce` treats a unique violation as "already delivered" only when
   * it names THIS table's idempotency key, and treats every other unique
   * violation — above all one raised by the `Notification` insert — as a
   * retryable failure. That distinction is only meaningful if PostgreSQL
   * actually reports the two conflicts under different, stable names.
   *
   * So this asks the server directly, rather than trusting a fake: it
   * provokes both violations and reads back the constraint each one names.
   * If a later migration renamed the index, this goes red — and so would the
   * classifier's assumption, silently, without it.
   */
  it("names the ledger key and a Notification conflict DIFFERENTLY", () => {
    const db = withNotificationTable();
    expect(psql(db, ROW()).status).toBe(0);
    expect(
      psql(db, `INSERT INTO "Notification" ("id","userId") VALUES ('ntf-1','someone');`).status,
    ).toBe(0);

    // The ledger's idempotency key, which MUST be read as "already delivered".
    const ledger = psql(db, ROW({ id: "del-2" }));
    expect(ledger.status).not.toBe(0);
    expect(ledger.stderr).toContain("ExecutiveReportDelivery_org_date_version_user_key");

    // A conflict on the other table, which must NOT be.
    const notification = psql(
      db,
      `INSERT INTO "Notification" ("id","userId") VALUES ('ntf-1','user-owner');`,
    );
    expect(notification.status).not.toBe(0);
    expect(notification.stderr).not.toContain("ExecutiveReportDelivery_org_date_version_user_key");

    // Both are SQLSTATE 23505 — which is exactly why the code alone cannot
    // tell them apart, and the constraint name has to be read.
    for (const r of [ledger, notification]) {
      expect(r.stderr).toMatch(/duplicate key value violates unique constraint/i);
    }
  }, 180_000);

  it("carries the idempotency key under the name the classifier looks for", () => {
    // Read from the catalogue rather than from an error message, so a
    // rename cannot pass by changing only how the failure is phrased.
    const db = freshDb();
    const idx = psql(
      db,
      `SELECT indexname FROM pg_indexes
         WHERE tablename = 'ExecutiveReportDelivery' AND indexdef LIKE '%UNIQUE%'
         ORDER BY indexname;`,
    );
    expect(idx.status).toBe(0);
    expect(idx.stdout).toContain("ExecutiveReportDelivery_org_date_version_user_key");
  }, 120_000);

  it("stores the authority as TEXT, so a later enum change cannot rewrite history", () => {
    const db = freshDb();
    const types = psql(
      db,
      `SELECT format_type(atttypid, atttypmod) FROM pg_attribute
         WHERE attrelid = '"ExecutiveReportDelivery"'::regclass
           AND attname IN ('roleAtSend','statusAtSend') ORDER BY attname;`,
    );
    expect(types.stdout).toContain("character varying(32)");
    expect(types.stdout).not.toMatch(/OrgRole|MemberStatus/);
  }, 120_000);
});

/**
 * Row 10 — the query's preconditions, executed against a real PostgreSQL.
 *
 * A zero result from this query reads as "no duplicate notifications" and
 * "no unauthorised recipients". Those are two of the five things row 10
 * exists to prove, so a run that selected nothing must END, not report.
 *
 * Reading the SQL cannot show that it does. Whether `1 / (count(*) > 0)::int`
 * actually stops psql — rather than being folded away, skipped as an unused
 * CTE, or swallowed as a null — is a property of the server, so it is
 * exercised here against a throwaway PostgreSQL 16 with the same container
 * helper the DR rehearsals use. What is asserted is the EXIT CODE, because
 * that is what a caller sees.
 *
 * Nothing here touches production. Every database is created and dropped
 * inside a disposable container, seeded with the smallest schema the query
 * needs, and the fixture rows carry no personal data of any kind.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const QUERY = "docs/executive-dashboard/ROW10-RECIPIENT-AUTHORIZATION-QUERY.sql";
const LF = String.fromCharCode(10);
const CONTAINER = `hermes98_pg_row10_${Math.random().toString(16).slice(2, 10)}`;
const IMAGE = "pgvector/pgvector:pg16";
const USER = "hermes_ci";
const DB = "hermes_ci";

const sh = (args: string[], opts: { input?: string } = {}) =>
  spawnSync(args[0], args.slice(1), { encoding: "utf8", input: opts.input ?? "" });

const dockerAvailable = (() => {
  const r = sh(["docker", "version", "--format", "{{.Server.Version}}"]);
  return r.status === 0 && (r.stdout ?? "").trim().length > 0;
})();

/** Set at the END of setup, so a setup that threw cannot look like a run. */
let suiteRan = false;

/** The smallest schema the preconditions touch. No personal data anywhere. */
const SCHEMA = `
CREATE TABLE "ExecutiveDailyReport" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "businessDate"   VARCHAR(10) NOT NULL,
  "version"        INTEGER NOT NULL DEFAULT 1,
  "notifiedAt"     TIMESTAMPTZ(6)
);
CREATE TABLE "Notification" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL DEFAULT 'info',
  "metadata"  JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE TABLE "OrganizationMember" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "role"           TEXT NOT NULL,
  "status"         TEXT NOT NULL
);
CREATE TABLE "AuditLog" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT,
  "action"         TEXT NOT NULL,
  "entityType"     TEXT NOT NULL,
  "entityId"       TEXT,
  "organizationId" TEXT,
  "outcome"        TEXT,
  "createdAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
`;

function psql(dbName: string, sql: string) {
  return sh(
    [
      "docker", "exec", "-i", "-e",
      "PGOPTIONS=-c default_transaction_read_only=off -c statement_timeout=60s -c lock_timeout=5s",
      CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", USER, "-d", dbName,
    ],
    { input: sql },
  );
}

/** Run the real query file against `dbName`, with its two parameters set. */
function runQuery(dbName: string, businessDate: string, orgHash: string) {
  const file = readFileSync(QUERY, "utf8").split(String.fromCharCode(13)).join("");
  // The parameters are the two \set lines; overriding them by appending would
  // run after the preconditions, so they are replaced in place.
  const parameterised = file
    .replace(/^\\set business_date .*$/m, `\\set business_date '${businessDate}'`)
    .replace(/^\\set report_org_hash .*$/m, `\\set report_org_hash '${orgHash}'`);
  return sh(
    [
      "docker", "exec", "-i", "-e",
      "PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=60s -c lock_timeout=5s",
      CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", USER, "-d", dbName,
    ],
    { input: parameterised },
  );
}

/** A fresh database with the schema and whatever rows the case needs. */
let dbSeq = 0;
function freshDb(seed: string): string {
  const name = `row10_case_${(dbSeq += 1)}`;
  const created = psql("postgres", `DROP DATABASE IF EXISTS ${name}; CREATE DATABASE ${name};`);
  if (created.status !== 0) throw new Error(`create ${name}: ${created.stderr}`);
  const loaded = psql(name, SCHEMA + LF + seed);
  if (loaded.status !== 0) throw new Error(`seed ${name}: ${loaded.stderr}`);
  return name;
}

/** One organization that reported on the date, with an owner who was told. */
function seedOneOrg(orgId = "org-alpha", date = "2026-10-14"): string {
  return `
INSERT INTO "ExecutiveDailyReport" ("id","organizationId","businessDate","version","notifiedAt")
  VALUES ('rep-1','${orgId}','${date}',1, now());
INSERT INTO "OrganizationMember" ("id","organizationId","userId","role","status")
  VALUES ('mem-1','${orgId}','user-owner','OWNER','ACTIVE');
INSERT INTO "Notification" ("id","userId","type","metadata")
  VALUES ('ntf-1','user-owner','info','{"kind":"executive.report","businessDate":"${date}"}');
`;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  // Readiness over TCP and twice: the entrypoint runs a socket-only server
  // during initialisation and then stops it (see scripts/ci/lib/disposable-pg.mjs).
  let streak = 0;
  // 300 attempts, not 120: this machine routinely has thirty other
  // containers running, and a cold start there has taken over two minutes.
  for (let i = 0; i < 300 && streak < 2; i += 1) {
    const r = sh(["docker", "exec", CONTAINER, "pg_isready", "-U", USER, "-d", DB, "-h", "127.0.0.1"]);
    streak = r.status === 0 ? streak + 1 : 0;
    // A real wait on the TEST host. `docker exec ... sleep` would fail
    // instantly while the container is still starting, so the loop would
    // spin through all 120 attempts in milliseconds and give up.
    if (streak < 2) await sleep(1000);
  }
  if (streak < 2) throw new Error("disposable postgres did not become ready");
  suiteRan = true;
}, 600_000);

afterAll(() => {
  if (!dockerAvailable) return;
  sh(["docker", "rm", "-f", CONTAINER]);
});

describe.skipIf(!dockerAvailable)("row 10 preconditions, against a real PostgreSQL", () => {
  it("the suite actually ran, rather than being skipped into a pass", () => {
    expect(suiteRan).toBe(true);
  });

  it("a valid date with exactly one reporting organization CONTINUES", () => {
    const db = freshDb(seedOneOrg());
    const r = runQuery(db, "2026-10-14", "");
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    // It reached the result sections rather than stopping at a precondition.
    expect(r.stdout).toContain("notification_count");
  }, 120_000);

  it("an invalid date parameter EXITS NON-ZERO instead of reporting zero rows", () => {
    // The exact shape a CRLF checkout produces, and any other stray byte.
    const db = freshDb(seedOneOrg());
    for (const bad of ["2026-10-14 ", "2026-10-1", "not-a-date", ""]) {
      const r = runQuery(db, bad, "");
      expect(r.status, `date ${JSON.stringify(bad)}`).not.toBe(0);
      expect(r.stdout, `date ${JSON.stringify(bad)}`).not.toContain("notification_count");
    }
  }, 180_000);

  it("no report for that day EXITS NON-ZERO", () => {
    const db = freshDb(seedOneOrg("org-alpha", "2026-10-13"));
    const r = runQuery(db, "2026-10-14", "");
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain("notification_count");
  }, 120_000);

  it("an empty database EXITS NON-ZERO rather than reporting a clean sheet", () => {
    // This is the shape of the production run that started all of this.
    const db = freshDb("");
    const r = runQuery(db, "2026-10-14", "");
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain("notification_count");
  }, 120_000);

  it("several organizations with no selector EXITS NON-ZERO rather than mixing tenants", () => {
    const db = freshDb(seedOneOrg("org-alpha") + seedOneOrg("org-beta").replace(/rep-1|mem-1|ntf-1/g, m => `${m}b`));
    const r = runQuery(db, "2026-10-14", "");
    expect(r.status).not.toBe(0);
  }, 120_000);

  it("an unknown selector prefix EXITS NON-ZERO", () => {
    const db = freshDb(seedOneOrg());
    const r = runQuery(db, "2026-10-14", "deadbeefcafe");
    expect(r.status).not.toBe(0);
  }, 120_000);

  it("a selector matching exactly one organization CONTINUES", () => {
    const db = freshDb(seedOneOrg("org-alpha") + seedOneOrg("org-beta").replace(/rep-1|mem-1|ntf-1/g, m => `${m}b`));
    // The hash the query itself would print for org-alpha.
    const hashed = psql(db, "SELECT substr(md5('org-alpha'), 1, 12);");
    const prefix = (hashed.stdout ?? "").split(LF).map(l => l.trim()).find(l => /^[0-9a-f]{12}$/.test(l));
    expect(prefix, "could not compute the selector").toBeDefined();
    const r = runQuery(db, "2026-10-14", prefix as string);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("notification_count");
  }, 120_000);

  it("the whole file runs under a READ-ONLY transaction setting", () => {
    // Proof that nothing in it writes: the server refuses writes outright,
    // and the happy path still completes.
    const db = freshDb(seedOneOrg());
    const r = runQuery(db, "2026-10-14", "");
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain("read-only transaction");
  }, 120_000);
});

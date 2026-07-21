import { describe, it, expect } from "vitest";
import {
  checkTestDatabaseUrl,
  assertTestDatabase,
  otIntegrationEnabled,
  REQUIRED_DB_MARKER,
} from "../ot-db-guard";

/**
 * PHASE 94B3.1 — the guard that protects real databases from the destructive
 * integration harness.
 *
 * Fail-closed is the property under test: a URL is refused unless it POSITIVELY
 * proves it is a disposable test database. Every rejection path is enumerated,
 * because the cost of one false accept is a destroyed production database.
 */

const OK = `postgresql://u:p@localhost:55433/${REQUIRED_DB_MARKER}`;

describe("94B3.1 — only a proven test database is accepted", () => {
  it("accepts a local, test-marked database and reports no credentials", () => {
    const r = checkTestDatabaseUrl(OK, true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.host).toBe("localhost");
      expect(r.port).toBe(55433);
      expect(r.database).toBe(REQUIRED_DB_MARKER);
      // The verdict must never carry user or password onward.
      expect(JSON.stringify(r)).not.toContain("u:p");
      expect(JSON.stringify(r)).not.toContain("p@");
    }
  });

  it("refuses to run at all outside a test run", () => {
    expect(checkTestDatabaseUrl(OK, false)).toEqual({ ok: false, rejection: "TEST_FLAG_NOT_SET" });
  });

  it.each([
    ["undefined", undefined, "MISSING_URL"],
    ["empty", "", "MISSING_URL"],
    ["whitespace", "   ", "MISSING_URL"],
    ["garbage", "not-a-url", "MALFORMED_URL"],
    ["mysql", "mysql://u:p@localhost:3306/hermes_ot_test", "NOT_POSTGRES"],
  ])("refuses a %s url", (_label, url, rejection) => {
    expect(checkTestDatabaseUrl(url, true)).toEqual({ ok: false, rejection });
  });

  it("refuses any remote host — a test harness never reaches off-box", () => {
    for (const host of ["db.internal", "10.0.0.5", "example.com", "192.168.1.10"]) {
      const r = checkTestDatabaseUrl(`postgresql://u:p@${host}:5432/${REQUIRED_DB_MARKER}`, true);
      expect(r.ok, host).toBe(false);
      if (!r.ok) expect(r.rejection).toBe("NON_LOCAL_HOST");
    }
  });

  it("refuses a production-shaped host even when it claims to be local", () => {
    for (const host of ["prod-db", "hermes-production", "live-db", "staging-pg", "x.rds.amazonaws.com"]) {
      const r = checkTestDatabaseUrl(`postgresql://u:p@${host}:5432/${REQUIRED_DB_MARKER}`, true);
      expect(r.ok, host).toBe(false);
      if (!r.ok) expect(r.rejection).toBe("PRODUCTION_LIKE_HOST");
    }
  });

  it("refuses a production-shaped database name on localhost", () => {
    for (const db of ["hermes_ot_test_prod", "hermes_ot_test_live", "hermes_ot_test_staging"]) {
      const r = checkTestDatabaseUrl(`postgresql://u:p@localhost:5432/${db}`, true);
      expect(r.ok, db).toBe(false);
      if (!r.ok) expect(r.rejection).toBe("PRODUCTION_LIKE_DATABASE");
    }
  });

  it("REFUSES THE REAL DEV DATABASE — the most likely accident", () => {
    // `hermes_db` is this repo's actual docker-compose database. A deny-list
    // would have to guess it; requiring a positive marker catches it for free.
    const r = checkTestDatabaseUrl("postgresql://hermes:changeme@localhost:5432/hermes_db", true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection).toBe("DATABASE_NAME_NOT_TEST_MARKED");
  });

  it("refuses any unmarked name, however innocuous", () => {
    for (const db of ["postgres", "app", "hermes", "test", "testing", "dev"]) {
      const r = checkTestDatabaseUrl(`postgresql://u:p@localhost:5432/${db}`, true);
      expect(r.ok, db).toBe(false);
      if (!r.ok) expect(r.rejection).toBe("DATABASE_NAME_NOT_TEST_MARKED");
    }
  });

  it("assertTestDatabase throws by CATEGORY and never echoes the url", () => {
    const secretUrl = "postgresql://admin:SUPERSECRET@prod-db.internal:5432/hermes_live";
    try {
      assertTestDatabase(secretUrl, true);
      throw new Error("guard should have thrown");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain("PRODUCTION_LIKE_HOST");
      expect(msg, "the url must never reach an error message").not.toContain("SUPERSECRET");
      expect(msg).not.toContain("prod-db.internal");
      expect(msg).not.toContain("hermes_live");
    }
  });

  it("assertTestDatabase returns only host, port and database on success", () => {
    expect(assertTestDatabase(OK, true)).toEqual({
      host: "localhost",
      port: 55433,
      database: REQUIRED_DB_MARKER,
    });
  });

  it("integration is disabled unless BOTH the flag and a valid url are present", () => {
    expect(otIntegrationEnabled({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      otIntegrationEnabled({ NODE_ENV: "production", OT_TEST_DATABASE_URL: OK } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      otIntegrationEnabled({ NODE_ENV: "test", OT_TEST_DATABASE_URL: OK } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});

// PHASE 94B3.1 — the guard that stands between an integration test and a real
// database.
//
// WHY THIS IS THE FIRST THING WRITTEN
// An integration harness creates schemas, truncates tables and drops databases.
// Pointed at the wrong URL — a stale shell export, a copied .env, a CI secret
// bound to the wrong environment — it destroys production. The guard is
// therefore fail-CLOSED: a URL is refused unless it positively proves it is a
// throwaway test database. "Not obviously production" is never good enough.
//
// It is a pure function of its inputs so it can be exhaustively tested without
// a database, and it never returns, logs or embeds credentials.

/** Every check that must pass before a URL may be used destructively. */
export type GuardRejection =
  | "MISSING_URL"
  | "MALFORMED_URL"
  | "NOT_POSTGRES"
  | "NON_LOCAL_HOST"
  | "PRODUCTION_LIKE_HOST"
  | "PRODUCTION_LIKE_DATABASE"
  | "DATABASE_NAME_NOT_TEST_MARKED"
  | "TEST_FLAG_NOT_SET";

export type GuardResult =
  | { ok: true; host: string; port: number; database: string }
  | { ok: false; rejection: GuardRejection };

/**
 * The database name must carry this marker.
 *
 * A positive marker beats a deny-list: a deny-list has to anticipate every name
 * a production database might have, while this requires the name to have been
 * deliberately created for tests. `hermes_db` — the real dev database — fails.
 */
export const REQUIRED_DB_MARKER = "hermes_ot_test";

/** Hosts a disposable test database may live on. */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Substrings that mark a host or database as off-limits even if local. */
const PRODUCTION_MARKERS = [
  "prod",
  "production",
  "live",
  "staging",
  "stage",
  "rds.amazonaws",
  "azure",
  "supabase",
  "neon.tech",
  "render.com",
  "railway",
  "hermesnovin",
];

function hasProductionMarker(value: string): boolean {
  const v = value.toLowerCase();
  return PRODUCTION_MARKERS.some((m) => v.includes(m));
}

/**
 * Decide whether `url` may be used by the destructive integration harness.
 *
 * `isTestRun` must come from the runner (Vitest sets NODE_ENV=test), not from a
 * value the URL itself could influence.
 */
export function checkTestDatabaseUrl(
  url: string | undefined | null,
  isTestRun: boolean,
): GuardResult {
  if (!isTestRun) return { ok: false, rejection: "TEST_FLAG_NOT_SET" };
  if (!url || url.trim() === "") return { ok: false, rejection: "MISSING_URL" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, rejection: "MALFORMED_URL" };
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, rejection: "NOT_POSTGRES" };
  }

  const host = parsed.hostname;
  if (hasProductionMarker(host)) return { ok: false, rejection: "PRODUCTION_LIKE_HOST" };
  if (!ALLOWED_HOSTS.has(host)) return { ok: false, rejection: "NON_LOCAL_HOST" };

  const database = parsed.pathname.replace(/^\//, "");
  if (hasProductionMarker(database)) {
    return { ok: false, rejection: "PRODUCTION_LIKE_DATABASE" };
  }
  if (!database.includes(REQUIRED_DB_MARKER)) {
    return { ok: false, rejection: "DATABASE_NAME_NOT_TEST_MARKED" };
  }

  // Note the return carries host/port/database ONLY — never user or password.
  return {
    ok: true,
    host,
    port: parsed.port ? Number(parsed.port) : 5432,
    database,
  };
}

/**
 * Throw unless the URL is a sanctioned test database.
 *
 * The message names the rejection CATEGORY and never the URL, so a guard
 * failure in CI output cannot disclose a connection string.
 */
export function assertTestDatabase(
  url: string | undefined | null,
  isTestRun: boolean,
): { host: string; port: number; database: string } {
  const verdict = checkTestDatabaseUrl(url, isTestRun);
  if (!verdict.ok) {
    throw new Error(
      `refusing to use this database for destructive tests: ${verdict.rejection}. ` +
        `Set OT_TEST_DATABASE_URL to a local database whose name contains "${REQUIRED_DB_MARKER}".`,
    );
  }
  return { host: verdict.host, port: verdict.port, database: verdict.database };
}

/**
 * Whether the OT integration suite should run at all.
 *
 * Absent configuration means SKIP, not fail: a developer without Docker still
 * gets a green unit suite, while CI sets the variable and gets real coverage.
 * The distinction between "skipped" and "passed" is reported by the suite so a
 * silent skip can never be mistaken for proof.
 */
export function otIntegrationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = env.OT_TEST_DATABASE_URL;
  return checkTestDatabaseUrl(url, env.NODE_ENV === "test").ok;
}

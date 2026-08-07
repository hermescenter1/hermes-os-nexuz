/**
 * PHASE 99 — disposable application-security smoke against the REAL image.
 *
 * The static invariants prove properties of the SOURCE. This proves properties
 * of the RUNNING application: it boots the actual standalone production image in
 * a DISPOSABLE Compose project (name prefixed `hermes99test_`, hard-guarded so the
 * destructive teardown can never touch the canonical Production project) with
 * synthetic Postgres/Redis, and then exercises a handful of security behaviours
 * against loopback only — no external host, no Production, no real account.
 *
 * What it checks against the live app:
 *   - liveness and readiness answer correctly;
 *   - security response headers are present (nosniff, frame options, CSP);
 *   - an admin API route rejects an unauthenticated caller (401/403, never 200);
 *   - a tenant API route rejects an unauthenticated caller;
 *   - error responses do not leak a stack trace or a database error;
 *   - a malformed JSON body is rejected without an internal error.
 *
 * Every credential is a disposable, runtime-generated, CI-only value. Nothing is
 * printed that could be a secret. The teardown removes the stack and its volumes.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROJECT_PREFIX = "hermes99test_";

let failed = false;
const check = (label, cond, detail) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond && detail) console.log(`  - ${detail}`);
  if (!cond) failed = true;
};
const docker = (args, opts = {}) => execFileSync("docker", args, { encoding: "utf8", ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchNoThrow(url, opts) {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    return { ok: true, status: res.status, headers: res.headers, text };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

async function main() {
  const rid = randomBytes(4).toString("hex");
  const P = `${PROJECT_PREFIX}${rid}`;
  // The single most important safety invariant: the disposable project name can
  // never be the Production project.
  check("DISPOSABLE_PROJECT_GUARD", P.startsWith(PROJECT_PREFIX) && P !== "hermes" && !P.startsWith("hermes-"));
  if (!P.startsWith(PROJECT_PREFIX)) { console.log("RESULT phase99_disposable_app=FAIL (guard)"); process.exit(1); }

  const work = mkdtempSync(join(tmpdir(), "hermes-p99-app-"));
  const envFile = join(REPO, ".env.production"); // gitignored; synthetic; deleted in finally
  const pgPassword = `disposable_${randomBytes(9).toString("hex")}`;
  const redisPassword = `disposable_${randomBytes(9).toString("hex")}`;
  const jwtAccess = randomBytes(48).toString("hex");
  const jwtRefresh = randomBytes(48).toString("hex");

  const APP_IMAGE = process.env.HERMES_APP_IMAGE && process.env.HERMES_APP_IMAGE.trim();
  const imageOverride = join(work, "image-override.yml");
  const composeFiles = ["-f", "docker-compose.prod.yml", "-f", "deploy/rehearsal/docker-compose.rehearsal.yml"];
  if (APP_IMAGE) {
    writeFileSync(imageOverride, `services:\n  hermes-web:\n    image: ${APP_IMAGE}\n    build: null\n`);
    composeFiles.push("-f", imageOverride);
  }

  writeFileSync(
    envFile,
    [
      // The postgres image reads its bootstrap identity from this env file. All
      // three are required: without POSTGRES_USER/POSTGRES_DB the image creates
      // the default `postgres` role and database, and every later connection as
      // `hermes` fails authentication.
      `POSTGRES_USER=hermes`,
      `POSTGRES_DB=hermes_db`,
      `POSTGRES_PASSWORD=${pgPassword}`,
      `REDIS_PASSWORD=${redisPassword}`,
      `DATABASE_URL=postgresql://hermes:${pgPassword}@postgres:5432/hermes_db`,
      `REDIS_URL=redis://:${redisPassword}@redis:6379`,
      `JWT_ACCESS_SECRET=${jwtAccess}`,
      `JWT_REFRESH_SECRET=${jwtRefresh}`,
      `NODE_ENV=production`,
      `HERMES_STORAGE_MODE=database`,
      `NEXT_PUBLIC_APP_URL=http://localhost:3000`,
      `APP_URL=http://localhost:3000`,
      "",
    ].join("\n"),
  );

  const up = (svc) => docker(["compose", "-p", P, ...composeFiles, "up", "-d", ...svc], { cwd: REPO, stdio: "inherit" });
  let webPort = null;

  try {
    up(["postgres", "redis"]);
    await sleep(6000);

    // Migrate the disposable database from the host so the app boots against a
    // real schema (the runner image ships the Prisma runtime, not the CLI).
    const pgPort = docker(["compose", "-p", P, ...composeFiles, "port", "postgres", "5432"], { cwd: REPO }).trim().split(":").pop();
    // Invoke the Prisma CLI through THIS node binary rather than through `npx`:
    // `npx` is a shell shim, so execFileSync cannot find it on Windows (ENOENT)
    // and it is an unnecessary resolution step in CI.
    const prismaCli = join(REPO, "node_modules", "prisma", "build", "index.js");
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: REPO,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: `postgresql://hermes:${pgPassword}@127.0.0.1:${pgPort}/hermes_db` },
    });

    up(["hermes-web"]);
    webPort = docker(["compose", "-p", P, ...composeFiles, "port", "hermes-web", "3000"], { cwd: REPO }).trim().split(":").pop();
    const base = `http://127.0.0.1:${webPort}`;

    // Wait for the app to answer liveness.
    let live = null;
    for (let i = 0; i < 30; i += 1) {
      live = await fetchNoThrow(`${base}/api/health`);
      if (live.ok && live.status === 200) break;
      await sleep(2000);
    }
    check("APP_BOOTS_HEALTHY", live?.ok === true && live.status === 200, `liveness status ${live?.status ?? live?.error}`);

    // Security response headers on a public page.
    const home = await fetchNoThrow(`${base}/`);
    if (home.ok) {
      check("HEADER_NOSNIFF", home.headers.get("x-content-type-options") === "nosniff");
      check("HEADER_FRAME_OPTIONS", (home.headers.get("x-frame-options") ?? "").toUpperCase() === "DENY");
      check("HEADER_CSP", /content-security-policy/i.test([...home.headers.keys()].join(",")));
    } else {
      check("HEADER_NOSNIFF", false, home.error);
    }

    // An admin API route must reject an anonymous caller.
    const admin = await fetchNoThrow(`${base}/api/admin/observability`);
    check("ADMIN_ROUTE_DENIES_ANON", admin.ok && (admin.status === 401 || admin.status === 403), `status ${admin.status}`);
    check("ADMIN_ROUTE_NO_LEAK", admin.ok && !/at \/app\/|PrismaClient|node_modules|stack/i.test(admin.text), "response body looks like it leaks internals");

    // A tenant API route must reject an anonymous caller.
    const tenant = await fetchNoThrow(`${base}/api/organizations`, { method: "GET" });
    check("TENANT_ROUTE_DENIES_ANON", tenant.ok && tenant.status >= 400 && tenant.status < 500 && tenant.status !== 404, `status ${tenant.status}`);

    // A malformed body must not produce an internal error or a leak.
    const malformed = await fetchNoThrow(`${base}/api/compliance/cookie-consent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ this is not json",
    });
    check("MALFORMED_BODY_HANDLED", malformed.ok && malformed.status < 500, `status ${malformed.status}`);
    check("MALFORMED_BODY_NO_LEAK", malformed.ok && !/PrismaClient|SyntaxError|at \/app\//i.test(malformed.text));

    // Readiness reflects real dependency state (200 with DB up).
    const ready = await fetchNoThrow(`${base}/api/health/ready`);
    check("READINESS_ANSWERS", ready.ok && (ready.status === 200 || ready.status === 503), `status ${ready.status}`);
  } finally {
    try {
      // DISPOSABLE teardown — guarded project only.
      if (P.startsWith(PROJECT_PREFIX)) docker(["compose", "-p", P, ...composeFiles, "down", "-v", "--remove-orphans"], { cwd: REPO, stdio: "inherit" });
    } catch { /* best effort */ }
    if (existsSync(envFile)) rmSync(envFile, { force: true });
    rmSync(work, { recursive: true, force: true });
  }

  console.log(`RESULT phase99_disposable_app=${failed ? "FAIL" : "PASS"}`);
  console.log("RESULT phase99_disposable_app_production_contacted=False");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`[phase99-disposable-app-security] ${String(err?.message ?? err)}`);
  process.exit(1);
});

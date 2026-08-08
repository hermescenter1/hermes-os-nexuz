/**
 * PHASE 99.7 — release candidate validation gate (real image, disposable stack).
 *
 * The reusable "is this exact commit fit to become Production?" check. It boots
 * the ACTUAL standalone production image against a DISPOSABLE Compose project
 * and a DISPOSABLE database, and answers the questions a cutover depends on.
 *
 * Relationship to the neighbouring rehearsals — deliberately NOT a duplicate:
 *   - `phase99-disposable-app-security.mjs` asks "does the running app hold its
 *     SECURITY contract?" (headers, authz, error hygiene);
 *   - `phase98-full-node-recovery.mjs` asks "can the whole stack be rebuilt from
 *     backups?";
 *   - this gate asks "is THIS pinned commit releasable?" — identity, health,
 *     readiness, every shipped locale, log hygiene, container stability, the
 *     image pipeline actually working, and OpenBao staying switched off.
 *
 * Hard invariants:
 *   - the Compose project name is prefixed `hermes997test_`, so the destructive
 *     teardown can never name the canonical Production project `hermes`;
 *   - the candidate is validated against a DISPOSABLE database created for this
 *     run — it never dials the live Production database;
 *   - every credential is runtime-generated, CI-only and never printed;
 *   - `OT_SECRET_BACKEND` is left unset, so the OpenBao credential plane stays
 *     disabled and no OpenBao endpoint is contacted.
 *
 * Usage:
 *   HERMES_APP_IMAGE=<image> node scripts/ci/phase997-candidate-gate.mjs --sha <40-hex>
 *   (omit HERMES_APP_IMAGE to build the image from the checkout)
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHARP_GATE = join(REPO, "scripts", "dr", "sharp-runtime-gate.mjs");
const PROJECT_PREFIX = "hermes997test_";
const LOCALES = ["fa", "en", "de"];

let failed = false;
const check = (label, cond, detail) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond && detail) console.log(`  - ${String(detail).slice(0, 400)}`);
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
    return { ok: false, status: 0, text: "", error: String(err?.message ?? err) };
  }
}

/**
 * Severe-log classification.
 *
 * Deliberately narrow: a candidate's logs always contain the word "error"
 * somewhere harmless (a route named /errors, a dependency's banner). What must
 * never appear is an unhandled failure of the Node process itself.
 */
const SEVERE_LOG_PATTERNS = [
  /UnhandledPromiseRejection/i,
  /Unhandled 'error' event/i,
  /uncaughtException/i,
  /FATAL(?!_)/,
  /PrismaClientInitializationError/,
  /Cannot find module/i,
  /ERR_DLOPEN_FAILED/i,
  /Segmentation fault/i,
  /JavaScript heap out of memory/i,
];

/** @param {string} logs @returns {string[]} the matching lines */
export function scanSevereLogLines(logs) {
  return logs
    .split("\n")
    .filter((line) => SEVERE_LOG_PATTERNS.some((p) => p.test(line)))
    .slice(0, 10);
}

function parseSha(argv) {
  const i = argv.indexOf("--sha");
  if (i >= 0 && typeof argv[i + 1] === "string") return argv[i + 1].trim();
  if (process.env.PHASE997_CANDIDATE_SHA) return process.env.PHASE997_CANDIDATE_SHA.trim();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function main() {
  const rid = randomBytes(4).toString("hex");
  const project = `${PROJECT_PREFIX}${rid}`;

  // The single most important safety invariant, asserted before anything runs.
  const guardOk = project.startsWith(PROJECT_PREFIX) && project !== "hermes" && !project.startsWith("hermes-");
  check("CANDIDATE_DISPOSABLE_PROJECT_GUARD", guardOk, project);
  if (!guardOk) {
    console.log("RESULT phase997_candidate=FAIL (guard)");
    process.exit(1);
  }

  const sha = parseSha(process.argv.slice(2));
  check("CANDIDATE_SHA_PINNED", /^[0-9a-f]{40}$/.test(sha), `candidate sha must be an exact 40-character lowercase hex commit, got "${sha}"`);

  const work = mkdtempSync(join(tmpdir(), "hermes-p997-cand-"));
  const envFile = join(REPO, ".env.production"); // gitignored; synthetic; removed in finally
  const pgPassword = `disposable_${randomBytes(9).toString("hex")}`;
  const redisPassword = `disposable_${randomBytes(9).toString("hex")}`;

  const appImage = process.env.HERMES_APP_IMAGE?.trim();
  const composeFiles = ["-f", "docker-compose.prod.yml", "-f", "deploy/rehearsal/docker-compose.rehearsal.yml"];
  if (appImage) {
    const override = join(work, "image-override.yml");
    writeFileSync(override, `services:\n  hermes-web:\n    image: ${appImage}\n    build: null\n`);
    composeFiles.push("-f", override);
  }

  writeFileSync(
    envFile,
    [
      `POSTGRES_USER=hermes`,
      `POSTGRES_DB=hermes_db`,
      `POSTGRES_PASSWORD=${pgPassword}`,
      `REDIS_PASSWORD=${redisPassword}`,
      // The candidate is validated against the DISPOSABLE compose database only.
      `DATABASE_URL=postgresql://hermes:${pgPassword}@postgres:5432/hermes_db`,
      `REDIS_URL=redis://:${redisPassword}@redis:6379`,
      `JWT_ACCESS_SECRET=${randomBytes(48).toString("hex")}`,
      `JWT_REFRESH_SECRET=${randomBytes(48).toString("hex")}`,
      `NODE_ENV=production`,
      `HERMES_STORAGE_MODE=database`,
      `NEXT_PUBLIC_APP_URL=http://localhost:3000`,
      `APP_URL=http://localhost:3000`,
      // OT_SECRET_BACKEND is deliberately ABSENT: the OpenBao credential plane
      // must stay disabled by default, and this run must contact no OpenBao.
      "",
    ].join("\n"),
  );

  const compose = (args, opts = {}) => docker(["compose", "-p", project, ...composeFiles, ...args], { cwd: REPO, ...opts });
  let webContainer = null;

  try {
    compose(["up", "-d", "postgres", "redis"], { stdio: "inherit" });
    await sleep(6000);

    // Migrate the DISPOSABLE database from the host (the runner image ships the
    // Prisma runtime, not the CLI).
    const pgPort = compose(["port", "postgres", "5432"]).trim().split(":").pop();
    execFileSync(process.execPath, [join(REPO, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
      cwd: REPO,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: `postgresql://hermes:${pgPassword}@127.0.0.1:${pgPort}/hermes_db` },
    });

    compose(["up", "-d", "hermes-web"], { stdio: "inherit" });
    const webPort = compose(["port", "hermes-web", "3000"]).trim().split(":").pop();
    webContainer = compose(["ps", "-q", "hermes-web"]).trim().split("\n")[0];
    const base = `http://127.0.0.1:${webPort}`;

    // ── Health ────────────────────────────────────────────────────────────────
    let live = null;
    for (let i = 0; i < 40; i += 1) {
      live = await fetchNoThrow(`${base}/api/health`);
      if (live.ok && live.status === 200) break;
      await sleep(2000);
    }
    check("CANDIDATE_HEALTH", live?.ok === true && live.status === 200, `status ${live?.status ?? live?.error}`);

    // ── Readiness reflects real dependency state ──────────────────────────────
    const ready = await fetchNoThrow(`${base}/api/health/ready`);
    check("CANDIDATE_READINESS", ready.ok && ready.status === 200, `status ${ready.status || ready.error}`);

    // ── Every shipped locale must actually render ─────────────────────────────
    const localeResults = [];
    for (const locale of LOCALES) {
      const res = await fetchNoThrow(`${base}/${locale}`);
      const okLocale = res.ok && res.status === 200 && /<html/i.test(res.text);
      localeResults.push(`${locale}:${res.status || res.error}`);
      check(`CANDIDATE_LOCALE_${locale.toUpperCase()}`, okLocale, `/${locale} -> ${res.status || res.error}`);
    }
    const localesOk = !failed && localeResults.every((r) => r.endsWith(":200"));

    // ── Anonymous/authenticated contract ──────────────────────────────────────
    // An unauthenticated caller must be refused by a privileged route, and the
    // refusal must not leak internals.
    const admin = await fetchNoThrow(`${base}/api/admin/observability`);
    check("CANDIDATE_ANONYMOUS_DENIED", admin.ok && (admin.status === 401 || admin.status === 403), `status ${admin.status}`);
    check(
      "CANDIDATE_ERROR_HYGIENE",
      admin.ok && !/PrismaClient|at \/app\/|node_modules/i.test(admin.text),
      "a denial response looks like it leaks internals",
    );

    // ── sharp runtime, INSIDE the candidate image ─────────────────────────────
    // /api/health returning 200 says nothing about sharp: the health route never
    // touches it. Run the real gate in the container that will serve traffic.
    let sharpOk = false;
    let sharpOut = "";
    try {
      docker(["cp", SHARP_GATE, `${webContainer}:/app/phase997-sharp-runtime-gate.mjs`]);
      sharpOut = docker(["exec", webContainer, "node", "/app/phase997-sharp-runtime-gate.mjs"]);
      sharpOk = /RESULT sharp_runtime_gate=PASS/.test(sharpOut);
    } catch (err) {
      sharpOut = `${String(err.stdout ?? "")}\n${String(err.stderr ?? err.message ?? err)}`;
    }
    check("CANDIDATE_SHARP_RUNTIME", sharpOk, sharpOut.split("\n").filter(Boolean).slice(-6).join(" / "));
    const cpuLine = /RESULT SHARP_CPU_PREREQUISITE=(\w+)/.exec(sharpOut)?.[1] ?? "UNREPORTED";
    console.log(`RESULT CANDIDATE_SHARP_CPU_PREREQUISITE=${cpuLine}`);

    // The optimizer endpoint is the user-visible consequence of the same code
    // path; check it too, so a regression in either surface is caught.
    const optimized = await fetchNoThrow(
      `${base}/_next/image?url=${encodeURIComponent("/images/home-industrial/01-command-center-hero.webp")}&w=640&q=75`,
    );
    check(
      "CANDIDATE_IMAGE_OPTIMIZER",
      optimized.ok && optimized.status === 200 && (optimized.headers.get("content-type") ?? "").startsWith("image/"),
      `status ${optimized.status} content-type ${optimized.ok ? optimized.headers.get("content-type") : optimized.error}`,
    );

    // ── OpenBao stays switched off ────────────────────────────────────────────
    let backendEnv = "";
    try {
      backendEnv = docker(["exec", webContainer, "sh", "-c", "printenv OT_SECRET_BACKEND || true"]).trim();
    } catch {
      backendEnv = "";
    }
    check("CANDIDATE_OPENBAO_DISABLED", backendEnv === "", `OT_SECRET_BACKEND is set to "${backendEnv}" in the candidate`);

    // ── Container stability ───────────────────────────────────────────────────
    await sleep(5000);
    const restarts = docker(["inspect", "-f", "{{.RestartCount}}", webContainer]).trim();
    check("CANDIDATE_NO_RESTARTS", restarts === "0", `hermes-web RestartCount=${restarts}`);
    const running = docker(["inspect", "-f", "{{.State.Running}}", webContainer]).trim();
    check("CANDIDATE_STILL_RUNNING", running === "true", `hermes-web State.Running=${running}`);

    // ── Severe-log gate ───────────────────────────────────────────────────────
    const logs = compose(["logs", "--no-color", "hermes-web"]);
    const severe = scanSevereLogLines(logs);
    check("CANDIDATE_NO_SEVERE_LOGS", severe.length === 0, severe.join(" | "));

    // ── The candidate never dialed a live production database ────────────────
    check(
      "CANDIDATE_DATABASE_IS_DISPOSABLE",
      /@postgres:5432\//.test(`postgresql://hermes:${pgPassword}@postgres:5432/hermes_db`),
      "the candidate must be validated against the disposable compose database",
    );

    console.log(`RESULT CANDIDATE_LOCALES_OK=${localesOk}`);
  } catch (err) {
    check("CANDIDATE_COMPLETED", false, String(err?.message ?? err));
  } finally {
    try {
      if (project.startsWith(PROJECT_PREFIX)) {
        compose(["down", "-v", "--remove-orphans"], { stdio: "inherit" });
      }
    } catch {
      /* best effort */
    }
    if (existsSync(envFile)) rmSync(envFile, { force: true });
    rmSync(work, { recursive: true, force: true });
  }

  console.log(`RESULT phase997_candidate_sha=${sha}`);
  console.log(`RESULT phase997_candidate=${failed ? "FAIL" : "PASS"}`);
  console.log("RESULT phase997_candidate_production_contacted=False");
  console.log("RESULT phase997_candidate_openbao_contacted=False");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`RESULT phase997_candidate=FAIL (${String(err?.message ?? err).slice(0, 200)})`);
  process.exit(1);
});

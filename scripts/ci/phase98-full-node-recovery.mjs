/**
 * PHASE 98 — full-node recovery rehearsal (real disposable Compose stack).
 *
 * Simulates loss of the entire application node and rebuilds it from encrypted
 * backups. Runs against a DISPOSABLE Compose project whose name begins with
 * `hermes98test_` — a hard guard ensures the destructive `down -v` can NEVER touch
 * the canonical Production project `hermes`. Builds the real app image, brings up
 * postgres+redis+hermes-web, seeds DB + BOTH upload surfaces, verifies app health,
 * takes encrypted backups, DESTROYS the stack + volumes, recreates, restores,
 * restarts, and proves database + uploads + application + redis are recovered.
 * Measures a rehearsal RTO. Never prints secrets or row payloads. Synthetic
 * disposable secrets + key only.
 */

import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROJECT_PREFIX = "hermes98test_";
const HBK = join(REPO, "scripts", "dr", "hbk.mjs");
const BACKUP_UP = join(REPO, "scripts", "dr", "backup-uploads.mjs");
const RESTORE_UP = join(REPO, "scripts", "dr", "restore-uploads.mjs");

let failed = false;
const check = (label, cond) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond) failed = true;
};
const docker = (args, opts = {}) => execFileSync("docker", args, { encoding: "utf8", ...opts });
const node = (args) => execFileSync("node", args, { encoding: "utf8" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rid = randomBytes(4).toString("hex");
  const P = `${PROJECT_PREFIX}${rid}`;
  // DISPOSABLE_PROJECT_GUARD — the single most important safety invariant here.
  check("DISPOSABLE_PROJECT_GUARD", P.startsWith(PROJECT_PREFIX) && P !== "hermes" && !P.startsWith("hermes-"));
  if (!P.startsWith(PROJECT_PREFIX)) {
    console.log("RESULT phase98_full_node=FAIL (guard)");
    process.exit(1);
  }

  const work = mkdtempSync(join(tmpdir(), "hermes-p98-node-"));
  const keyFile = join(work, "key.hex");
  const envFile = join(REPO, ".env.production"); // gitignored; synthetic; deleted in finally
  const pgPassword = `disposable_${randomBytes(9).toString("hex")}`;
  const redisPassword = `disposable_${randomBytes(9).toString("hex")}`;
  const jwt = randomBytes(48).toString("hex");

  // Identify a pre-built app image if provided (CI builds it once, with cache +
  // retries, then reuses it here — faster and far less network-fragile than
  // rebuilding inside every rehearsal). Falls back to building from scratch.
  const APP_IMAGE = process.env.HERMES_APP_IMAGE && process.env.HERMES_APP_IMAGE.trim();
  const imageOverride = join(work, "image-override.yml");

  const composeFiles = ["-f", "docker-compose.prod.yml", "-f", "deploy/rehearsal/docker-compose.rehearsal.yml"];
  const compose = (args, opts = {}) =>
    docker(["compose", "-p", P, ...composeFiles, "--env-file", ".env.production", ...args], { cwd: REPO, ...opts });
  const upWeb = () => compose(["up", "-d", ...(APP_IMAGE ? ["--no-build"] : []), "hermes-web"], { stdio: "inherit" });

  const volPub = `${P}_uploads_data`;
  const volDoc = `${P}_documents_data`;
  const cSeedPub = `${P}_seedpub`;
  const cSeedDoc = `${P}_seeddoc`;
  const art = join(work, "pg.hbk");
  const upArt = join(work, "uploads.hbk");

  const volDigests = (vol) =>
    docker(["run", "--rm", "-v", `${vol}:/data`, "alpine", "sh", "-c", "cd /data && find . -type f -exec sha256sum {} + | sort"]);

  const pgDigest = (db) =>
    compose(
      ["exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "hermes_ci", "-d", db, "-tAc",
        `SELECT coalesce(md5(string_agg(h,'' ORDER BY h)),'EMPTY') FROM (SELECT md5(row_to_json(x)::text) h FROM "AuditLog" x) s`],
      { stdio: "pipe" },
    ).trim();

  const waitHealth = async (label) => {
    const portLine = compose(["port", "hermes-web", "3000"], { stdio: "pipe" }).trim().split("\n")[0];
    const port = portLine.split(":").pop().trim();
    for (let i = 0; i < 60; i += 1) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) return true;
      } catch {
        /* not up yet */
      }
      await sleep(2000);
    }
    check(label, false);
    return false;
  };

  const migrate = (pgPort) =>
    execSync("npx --no-install prisma migrate deploy", {
      cwd: REPO,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: `postgresql://hermes_ci:${pgPassword}@127.0.0.1:${pgPort}/hermes_db` },
    });
  const migrateStatusOk = (pgPort) => {
    try {
      execSync("npx --no-install prisma migrate status", {
        cwd: REPO,
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: `postgresql://hermes_ci:${pgPassword}@127.0.0.1:${pgPort}/hermes_db` },
      });
      return true;
    } catch {
      return false;
    }
  };
  const pgPort = () => compose(["port", "postgres", "5432"], { stdio: "pipe" }).trim().split("\n")[0].split(":").pop().trim();
  const seedPg = () =>
    compose(
      ["exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "hermes_ci", "-d", "hermes_db", "-c",
        `INSERT INTO "AuditLog" (id, action, "entityType", metadata, "createdAt") VALUES ('fnr_a','case.updated','case','{}'::jsonb, now()), ('fnr_b','login.failure','user','{}'::jsonb, now())`],
      { stdio: "pipe" },
    );

  let t0 = 0;
  try {
    // Synthetic env (gitignored) + disposable key.
    writeFileSync(
      envFile,
      [
        "NODE_ENV=production",
        "HERMES_STORAGE_MODE=database",
        `POSTGRES_USER=hermes_ci`,
        `POSTGRES_PASSWORD=${pgPassword}`,
        `POSTGRES_DB=hermes_db`,
        `DATABASE_URL=postgresql://hermes_ci:${pgPassword}@postgres:5432/hermes_db`,
        `REDIS_PASSWORD=${redisPassword}`,
        `REDIS_URL=redis://:${redisPassword}@redis:6379`,
        `JWT_SECRET=${jwt}`,
        "APP_URL=http://localhost:3000",
        "NEXT_PUBLIC_APP_URL=http://localhost:3000",
        "EMAIL_PROVIDER=console",
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
    node([HBK, "genkey", "--out", keyFile]);

    // Build the real app image, or identify a pre-built one (HERMES_APP_IMAGE).
    if (APP_IMAGE) {
      writeFileSync(imageOverride, `services:\n  hermes-web:\n    image: ${APP_IMAGE}\n`);
      composeFiles.push("-f", imageOverride);
      console.log(`[full-node] using pre-built app image: ${APP_IMAGE}`);
    } else {
      console.log("[full-node] building app image (this can take several minutes)...");
      compose(["build", "hermes-web"], { stdio: "inherit" });
    }

    // Pre-create volumes so we can seed uploads before the app starts.
    docker(["volume", "create", volPub]);
    docker(["volume", "create", volDoc]);
    docker(["run", "--rm", "-v", `${volPub}:/data`, "alpine", "sh", "-c", "set -e; mkdir -p /data/authors; head -c 24 /dev/urandom > /data/authors/avatar.png; : > /data/zero.bin"]);
    docker(["run", "--rm", "-v", `${volDoc}:/data`, "alpine", "sh", "-c", "set -e; mkdir -p /data/documents/d1 \"/data/exports/پرونده\"; head -c 40 /dev/urandom > /data/documents/d1/original.pdf; printf '{\"k\":\"v\"}' > \"/data/exports/پرونده/package.json\""]);

    // Bring up DB + cache, migrate, seed DB, then start the app.
    compose(["up", "-d", "postgres", "redis"], { stdio: "inherit" });
    for (let i = 0; i < 60; i += 1) {
      try {
        compose(["exec", "-T", "postgres", "pg_isready", "-U", "hermes_ci", "-d", "hermes_db"], { stdio: "pipe" });
        break;
      } catch {
        await sleep(1000);
      }
    }
    migrate(pgPort());
    seedPg();
    upWeb();
    check("phase98_fnr_app_ready_preflight", await waitHealth("phase98_fnr_app_ready_preflight"));

    // Record pre-disaster integrity.
    const pgBefore = pgDigest("hermes_db");
    const pubBefore = volDigests(volPub);
    const docBefore = volDigests(volDoc);

    // Encrypted backups (PG + uploads).
    const dumpBuf = compose(["exec", "-T", "postgres", "pg_dump", "-U", "hermes_ci", "--no-password", "--format=custom", "--no-acl", "--no-owner", "hermes_db"], { stdio: "pipe", maxBuffer: 1024 * 1024 * 512, encoding: "buffer" });
    const plain = join(work, "pg.plain");
    writeFileSync(plain, dumpBuf, { mode: 0o600 });
    node([HBK, "encrypt", "--in", plain, "--out", art, "--key-file", keyFile, "--key-id", "fnr", "--type", "postgres", "--created", "2026-08-07T00:00:00.000Z"]);
    rmSync(plain, { force: true });

    const stagePub = join(work, "stage-pub");
    const stageDoc = join(work, "stage-doc");
    // Stage volume contents to the host via docker cp (portable; no bind mounts).
    const tmpc1 = `${P}_cpp`; const tmpc2 = `${P}_cpd`;
    docker(["run", "-d", "--name", tmpc1, "-v", `${volPub}:/data`, "alpine", "sleep", "120"]);
    docker(["run", "-d", "--name", tmpc2, "-v", `${volDoc}:/data`, "alpine", "sleep", "120"]);
    docker(["cp", `${tmpc1}:/data/.`, stagePub]);
    docker(["cp", `${tmpc2}:/data/.`, stageDoc]);
    docker(["rm", "-f", tmpc1, tmpc2], { stdio: "pipe" });
    node([BACKUP_UP, "--roots", `public-uploads:${stagePub},data-documents:${stageDoc}`, "--out", upArt, "--key-file", keyFile, "--key-id", "fnr-up", "--created", "2026-08-07T00:00:00.000Z"]);

    // ── DISASTER — destroy the disposable stack + volumes (guarded) ────────────
    if (!P.startsWith(PROJECT_PREFIX)) throw new Error("guard");
    t0 = Date.now();
    compose(["down", "-v"], { stdio: "inherit" });

    // ── Recreate infrastructure + restore ──────────────────────────────────────
    docker(["volume", "create", volPub]);
    docker(["volume", "create", volDoc]);
    compose(["up", "-d", "postgres", "redis"], { stdio: "inherit" });
    for (let i = 0; i < 60; i += 1) {
      try {
        compose(["exec", "-T", "postgres", "pg_isready", "-U", "hermes_ci", "-d", "hermes_db"], { stdio: "pipe" });
        break;
      } catch {
        await sleep(1000);
      }
    }
    // Restore PG from the encrypted backup (decrypt → pg_restore). Pipe the dump
    // as stdin via the input buffer (cross-platform; no shell redirection).
    const dec = join(work, "pg.dec");
    node([HBK, "decrypt", "--in", art, "--out", dec, "--key-file", keyFile, "--type", "postgres"]);
    compose(["exec", "-T", "postgres", "pg_restore", "--no-acl", "--no-owner", "-U", "hermes_ci", "-d", "hermes_db"], {
      stdio: ["pipe", "inherit", "inherit"],
      input: readFileSync(dec),
      maxBuffer: 1024 * 1024 * 512,
    });
    rmSync(dec, { force: true });

    // Restore uploads → host → into recreated volumes.
    const rPub = join(work, "restore-pub");
    const rDoc = join(work, "restore-doc");
    node([RESTORE_UP, "--in", upArt, "--dest", `public-uploads:${rPub},data-documents:${rDoc}`, "--key-file", keyFile, "--empty-check"]);
    const rc1 = `${P}_rpp`; const rc2 = `${P}_rpd`;
    docker(["run", "-d", "--name", rc1, "-v", `${volPub}:/data`, "alpine", "sleep", "120"]);
    docker(["run", "-d", "--name", rc2, "-v", `${volDoc}:/data`, "alpine", "sleep", "120"]);
    docker(["cp", `${rPub}/.`, `${rc1}:/data`]);
    docker(["cp", `${rDoc}/.`, `${rc2}:/data`]);
    docker(["rm", "-f", rc1, rc2], { stdio: "pipe" });

    // Restart the app on recovered infrastructure.
    upWeb();
    const appOk = await waitHealth("APPLICATION_AFTER_FULL_RECOVERY");
    const rtoMs = Date.now() - t0;
    console.log(`RESULT phase98_fnr_rto_ms=${rtoMs}`);

    // ── Verify recovery ────────────────────────────────────────────────────────
    check("APPLICATION_AFTER_FULL_RECOVERY", appOk);
    check("DATABASE_AFTER_FULL_RECOVERY", pgDigest("hermes_db") === pgBefore);
    check("UPLOADS_AFTER_FULL_RECOVERY", volDigests(volPub) === pubBefore && volDigests(volDoc) === docBefore);
    check("phase98_fnr_no_pending_migrations", migrateStatusOk(pgPort()));
    let redisOk = false;
    try {
      redisOk = /PONG/.test(compose(["exec", "-T", "redis", "redis-cli", "-a", redisPassword, "ping"], { stdio: "pipe" }));
    } catch {
      redisOk = false;
    }
    check("REDIS_AFTER_FULL_RECOVERY", redisOk && appOk); // fresh redis + app healthy = fail-safe rebuild
  } finally {
    try {
      if (P.startsWith(PROJECT_PREFIX)) compose(["down", "-v"], { stdio: "pipe" });
    } catch {
      /* best effort */
    }
    for (const c of [cSeedPub, cSeedDoc, `${P}_cpp`, `${P}_cpd`, `${P}_rpp`, `${P}_rpd`]) {
      try {
        docker(["rm", "-f", c], { stdio: "pipe" });
      } catch {
        /* ignore */
      }
    }
    try {
      if (existsSync(envFile)) rmSync(envFile, { force: true });
    } catch {
      /* ignore */
    }
    rmSync(work, { recursive: true, force: true });
  }

  check("FULL_NODE_RECOVERY_REHEARSAL", !failed);
  console.log(`RESULT phase98_full_node=${failed ? "FAIL" : "PASS"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`RESULT phase98_full_node=FAIL (${err?.name}: ${String(err?.message ?? err).slice(0, 200)})`);
  process.exit(1);
});

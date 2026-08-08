/**
 * PHASE 98 — release rollback rehearsal (real blue/green mechanism, Docker+Nginx).
 *
 * Proves the blue/green rollout + rollback MECHANISM against real disposable
 * containers (two `hashicorp/http-echo` "app" colors behind a real Nginx edge that
 * is reloaded to cut over). Uses the ACTUAL orchestrator (scripts/dr/blue-green.mjs)
 * and state machine:
 *   - an UNHEALTHY candidate is NEVER cut over to (previous-good stays active);
 *   - a HEALTHY candidate is atomically cut over to, previous-good retained;
 *   - rollback atomically switches back to the previous-good color;
 *   - a release with an unknown previous-good SHA is blocked;
 *   - a DB-restore-required / blocked rollback never auto-switches (incident).
 *
 * All container/network names begin with the disposable prefix `hermes98test_`.
 * Never prints secrets. This is a MECHANISM proof; production applies the same
 * orchestrator to hermes-web via Compose (see the release runbook).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { runBlueGreenRelease, rollbackToPrevious } from "../dr/blue-green.mjs";

const PREFIX = "hermes98test_";
const SHA = "a".repeat(40);

let failed = false;
const check = (label, cond) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond) failed = true;
};
const docker = (args, opts = {}) => execFileSync("docker", args, { encoding: "utf8", ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rid = randomBytes(4).toString("hex");
  const NET = `${PREFIX}net_${rid}`;
  const EDGE = `${PREFIX}edge_${rid}`;
  const appName = (color) => `${PREFIX}app_${color}_${rid}`;
  const work = mkdtempSync(join(tmpdir(), "hermes-p98-relroll-"));
  let activeColor = "blue";

  const curlNet = (url) => {
    try {
      docker(["run", "--rm", "--network", NET, "curlimages/curl:8.10.1", "-sf", "--max-time", "3", url], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  };
  const edgeBody = () => {
    try {
      return docker(["run", "--rm", "--network", NET, "curlimages/curl:8.10.1", "-s", "--max-time", "3", `http://${EDGE}:80`], { stdio: "pipe" }).trim();
    } catch {
      return "";
    }
  };
  const writeEdgeConf = (color) => {
    const conf = `server { listen 80; location / { proxy_pass http://${appName(color)}:5678; } }\n`;
    const f = join(work, "default.conf");
    writeFileSync(f, conf);
    docker(["cp", f, `${EDGE}:/etc/nginx/conf.d/default.conf`]);
    docker(["exec", EDGE, "nginx", "-s", "reload"], { stdio: "pipe" });
  };

  // Real Docker/Nginx adapter for the orchestrator.
  const adapter = {
    activeColor: () => activeColor,
    startCandidate: async (color, ref) => {
      try {
        docker(["rm", "-f", appName(color)], { stdio: "pipe" });
      } catch {
        /* ignore */
      }
      // ref === "healthy" → http-echo; ref === "unhealthy" → a container with no HTTP.
      if (ref === "unhealthy") {
        docker(["run", "-d", "--name", appName(color), "--network", NET, "alpine", "sleep", "300"]);
      } else {
        docker(["run", "-d", "--name", appName(color), "--network", NET, "hashicorp/http-echo:1.0.0", "-text", color, "-listen", ":5678"]);
      }
      await sleep(1500);
      return true;
    },
    healthCheck: async (color) => {
      for (let i = 0; i < 8; i += 1) {
        if (curlNet(`http://${appName(color)}:5678`)) return true;
        await sleep(1000);
      }
      return false;
    },
    cutover: async (color) => {
      writeEdgeConf(color);
      await sleep(800);
      activeColor = color;
      return edgeBody() === color;
    },
    retire: async () => {
      /* rehearsal: retention proven — keep the previous color running so rollback works */
    },
  };

  const containers = [EDGE, appName("blue"), appName("green")];
  try {
    docker(["network", "create", NET]);
    // Initial active = blue app + edge pointing at blue.
    docker(["run", "-d", "--name", appName("blue"), "--network", NET, "hashicorp/http-echo:1.0.0", "-text", "blue", "-listen", ":5678"]);
    docker(["run", "-d", "--name", EDGE, "--network", NET, "nginx:alpine"]);
    await sleep(1500);
    writeEdgeConf("blue");
    check("phase98_relroll_initial_active_blue", edgeBody() === "blue");

    // ── Scenario A — UNHEALTHY candidate: no cutover, previous stays active ──────
    let r = await runBlueGreenRelease({
      adapter,
      targetRef: "unhealthy",
      previousGoodGitSha: SHA,
      migrationClassification: "NO_MIGRATION",
      appRollbackProven: true,
    });
    check("CANDIDATE_HEALTH_BEFORE_CUTOVER", r.result === "UNHEALTHY_CANDIDATE_NO_CUTOVER");
    check("UNHEALTHY_CANDIDATE_CUTOVER_ZERO", r.cutover === false);
    check("FAILED_RELEASE_LEFT_ACTIVE_ZERO", activeColor === "blue" && edgeBody() === "blue");

    // ── Scenario B — HEALTHY candidate: cutover + previous retained ──────────────
    r = await runBlueGreenRelease({
      adapter,
      targetRef: "healthy",
      previousGoodGitSha: SHA,
      migrationClassification: "NO_MIGRATION",
      appRollbackProven: true,
    });
    check("phase98_relroll_released", r.result === "RELEASED" && r.cutover === true);
    check("phase98_relroll_cutover_to_green", activeColor === "green" && edgeBody() === "green");
    // Previous-good (blue) container is retained (still present) → rollback possible.
    const blueExists = docker(["ps", "-a", "--filter", `name=${appName("blue")}`, "--format", "{{.Names}}"]).trim() !== "";
    check("PREVIOUS_GOOD_RELEASE_RETAINED", blueExists);

    // ── Scenario C — rollback to previous-good (atomic switch back) ──────────────
    const rb = await rollbackToPrevious(adapter, "APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA");
    check("phase98_relroll_rolled_back", rb.rolledBack === true && activeColor === "blue" && edgeBody() === "blue");

    // ── Scenario D — unknown previous-good blocks the release ────────────────────
    let blocked = false;
    try {
      await runBlueGreenRelease({ adapter, targetRef: "healthy", previousGoodGitSha: "short", migrationClassification: "NO_MIGRATION", appRollbackProven: true });
    } catch {
      blocked = true;
    }
    check("UNKNOWN_PREVIOUS_GOOD_RELEASE_BLOCKED", blocked);

    // ── Scenario E — DB-restore-required / blocked rollback never auto-switches ──
    const restoreReq = await rollbackToPrevious(adapter, "APP_ROLLBACK_REQUIRES_DB_RESTORE");
    const blockedRb = await rollbackToPrevious(adapter, "RELEASE_ROLLBACK_BLOCKED");
    check("NO_AUTO_DB_RESTORE_ROLLBACK", restoreReq.rolledBack === false && blockedRb.rolledBack === false);
  } finally {
    for (const c of containers) {
      try {
        docker(["rm", "-f", c], { stdio: "pipe" });
      } catch {
        /* ignore */
      }
    }
    try {
      docker(["network", "rm", NET], { stdio: "pipe" });
    } catch {
      /* ignore */
    }
    rmSync(work, { recursive: true, force: true });
  }

  check("RELEASE_ROLLBACK_GATE", !failed);
  console.log(`RESULT phase98_release_rollback=${failed ? "FAIL" : "PASS"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`RESULT phase98_release_rollback=FAIL (${err?.name}: ${String(err?.message ?? err).slice(0, 200)})`);
  process.exit(1);
});

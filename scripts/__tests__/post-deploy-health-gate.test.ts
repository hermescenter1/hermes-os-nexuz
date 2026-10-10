/**
 * POST-DEPLOY health gate — "the container started" is not "the release is healthy".
 *
 * THE GAP THIS LOCKS
 * ------------------
 * `up -d --no-deps hermes-web` returns as soon as the new container is STARTED.
 * The deploy used to print one `ps` snapshot — in practice "(health: starting)" —
 * and finish green, so a release that crash-looped, never turned healthy, or
 * could not reach PostgreSQL still read as a successful production deploy.
 *
 * HOW THIS FILE TESTS IT
 * ----------------------
 * The gate is extracted from `.github/workflows/deploy.yml` between its
 * `>>> post-deploy-health-gate` / `<<< post-deploy-health-gate` markers and
 * EXECUTED with bash — the shipped text, not a copy of it. Three layers:
 *
 *   1. static    — position in the remote script, read-only by construction,
 *                  pinned Compose shape, never logs or echoes a response body,
 *                  every child process detached from the script's stdin;
 *   2. behaviour — against a `docker` shim that serves scripted container states
 *                  and readiness answers and records every call: healthy passes;
 *                  unhealthy, restart loop, exited, no healthcheck, timeout,
 *                  unreadable state and every wrong readiness answer FAIL; bad
 *                  tunables are refused before any call; nothing mutating is
 *                  ever invoked and nothing sensitive is ever printed;
 *   3. the whole remote script still parses, and Gate 0D-A still passes.
 */
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const deploy = readFileSync(join(REPO, ".github", "workflows", "deploy.yml"), "utf8").replace(/\r\n/g, "\n");

function extractGate(): string {
  const start = deploy.indexOf("# >>> post-deploy-health-gate");
  const end = deploy.indexOf("# <<< post-deploy-health-gate");
  expect(start, "gate start marker").toBeGreaterThan(-1);
  expect(end, "gate end marker").toBeGreaterThan(start);
  return deploy.slice(start, end);
}
const GATE = extractGate();
/** The gate without its comments — assertions about CODE must not match prose. */
const GATE_CODE = GATE.split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");
/**
 * The gate's logic without its operator-facing messages: a word inside an
 * `echo`/refusal text ("nothing was rolled back") is prose, not a command.
 */
const LOGIC = GATE_CODE.split("\n")
  .filter((l) => !/\b(echo|hg_refuse|hg_fail)\b|HG_PROBE_CLASS=/.test(l))
  .join("\n");

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/* ── 1 · static ────────────────────────────────────────────────────────────── */

describe("static — where the gate sits and what it is allowed to do", () => {
  it("runs inside the same remote script, after the cutover and its ps snapshot", () => {
    const migrationsVerifiedAt = deploy.indexOf('echo "Migrations verified:');
    const upAt = deploy.indexOf("up -d --no-deps hermes-web\n");
    const psAt = deploy.indexOf("--env-file .env.production ps hermes-web\n");
    const gateAt = deploy.indexOf("# >>> post-deploy-health-gate");
    const terminatorAt = deploy.indexOf("\n          REMOTE\n");
    for (const [name, at] of Object.entries({ migrationsVerifiedAt, upAt, psAt, gateAt, terminatorAt })) {
      expect(at, name).toBeGreaterThan(-1);
    }
    expect(migrationsVerifiedAt).toBeLessThan(upAt);
    expect(upAt).toBeLessThan(psAt);
    expect(psAt).toBeLessThan(gateAt);
    // Inside the heredoc: a refusal exits the remote script non-zero, so the
    // ssh step — and therefore the job — fails.
    expect(gateAt).toBeLessThan(terminatorAt);
    expect(deploy.indexOf("set -euo pipefail")).toBeLessThan(gateAt);
  });

  it("changes nothing: only inspect, exec and one read-only compose ps — no mutating docker verb", () => {
    expect(LOGIC).not.toMatch(/\bdocker\s+(?!inspect\b|exec\b|compose\b)[a-z]/);
    const composeCalls = LOGIC.match(/docker compose[^\n]*/g) ?? [];
    expect(composeCalls).toHaveLength(1);
    expect(composeCalls[0]).toContain("ps -q hermes-web");
    expect(LOGIC).not.toMatch(/\b(rm|mv|cp|chmod|chown|tee|sudo|kill|systemctl|service|git)\b/);
    // No image is tagged, no container is restarted/stopped, nothing is rolled back.
    expect(LOGIC).not.toMatch(/\b(restart|stop|start|tag|rollback|previous-good|migrate|prisma|psql)\b/);
  });

  it("pins its one Compose call to the canonical production project and env file", () => {
    const [call] = GATE_CODE.match(/docker compose[^\n]*/g) ?? [""];
    expect(call).toContain("-p hermes");
    expect(call).toContain("-f docker-compose.prod.yml");
    expect(call).toContain("--env-file .env.production");
  });

  it("inspects and probes only the container id the pinned compose call resolved", () => {
    const targets = [...GATE_CODE.matchAll(/docker (?:inspect|exec)[^\n]*/g)].map((m) => m[0]);
    expect(targets.length).toBe(2);
    for (const t of targets) expect(t).toContain('"${HG_CID}"');
    expect(GATE_CODE).toContain("http://127.0.0.1:3000/api/health/ready");
  });

  it("detaches every child process from the script's stdin (it arrives over `bash -s`)", () => {
    const children = GATE_CODE.split("\n").filter((l) => /docker (inspect|exec|compose)\b|^\s*sleep "/.test(l));
    expect(children).toHaveLength(5);
    for (const l of children) expect(l, l.trim()).toContain("</dev/null");
  });

  it("never reads container logs and never prints a response body", () => {
    expect(LOGIC).not.toMatch(/\blogs\b/);
    expect(LOGIC).not.toMatch(/\b(printenv|cat)\b|(^|\s)env\s/);
    for (const l of GATE_CODE.split("\n").filter((x) => x.includes("HG_BODY"))) {
      expect(l, l.trim()).toMatch(/HG_BODY="\$\(|-z "\$\{HG_BODY\}"|"\$\{HG_BODY\}" =~ /);
      expect(l, l.trim()).not.toMatch(/\b(echo|printf)\b/);
    }
  });

  it("is bounded: every tunable is validated with an upper limit, and the wait loop terminates", () => {
    for (const name of ["DEPLOY_HEALTH_WAIT_SECONDS", "DEPLOY_HEALTH_POLL_SECONDS", "DEPLOY_READY_ATTEMPTS", "DEPLOY_READY_PAUSE_SECONDS"]) {
      expect(GATE_CODE).toMatch(new RegExp(`hg_uint ${name} "\\$\\{HG_[A-Z_]+\\}" \\d+`));
    }
    expect(GATE_CODE).toContain('[ "${hg_waited}" -ge "${HG_WAIT}" ]');
    expect(GATE_CODE).toContain('[ "${hg_try}" -lt "${HG_READY_TRIES}" ]');
  });

  it("does not enable shell tracing", () => {
    expect(GATE_CODE).not.toMatch(/\bset\s+-[a-wyz]*x/);
  });
});

/* ── 2 · behaviour, with a docker shim ─────────────────────────────────────── */

const BASH_AVAILABLE = spawnSync("bash", ["-c", "command -v sed wc head >/dev/null"], { encoding: "utf8" }).status === 0;

const HEALTHY = "running false 0 healthy 0 0 false";
const STARTING = "running false 0 starting 0 0 false";
const UNHEALTHY = "running false 0 unhealthy 3 0 false";
const RESTARTING = "restarting true 2 starting 0 1 false";
const RESTARTED_ONCE = "running false 1 healthy 0 0 false";
const EXITED_OOM = "exited false 0 unhealthy 3 137 true";
const NO_HEALTHCHECK = "running false 0 none 0 0 false";
const READY = '0|{"status":"ready","database":true}';
const CID = "0123456789abcdef";

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  docker: string[];
  sleeps: string[];
}

function runGate(opts: { states: string[]; probes?: string[]; env?: Record<string, string>; noCid?: boolean }): Run {
  const root = mkdtempSync(join(tmpdir(), "post-deploy-health-"));
  roots.push(root);
  const shim = join(root, "shim");
  mkdirSync(shim);
  writeFileSync(join(root, "states.txt"), opts.states.join("\n") + "\n");
  writeFileSync(join(root, "probes.txt"), (opts.probes ?? [READY]).join("\n") + "\n");
  for (const f of ["docker.log", "sleep.log"]) writeFileSync(join(root, f), "");
  writeFileSync(join(root, "state.cursor"), "0");
  writeFileSync(join(root, "probe.cursor"), "0");

  // Serves the n-th scripted line (the last one repeats) and records every call.
  const pop = (list: string, cursor: string) =>
    [
      `n=$(cat "$${cursor}" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$${cursor}"`,
      `total=$(wc -l < "$${list}"); if [ "$n" -gt "$total" ]; then n="$total"; fi`,
      `line=$(sed -n "\${n}p" "$${list}")`,
    ].join("\n");
  writeFileSync(
    join(shim, "docker"),
    [
      "#!/usr/bin/env bash",
      'printf "%s\\n" "$*" >> "$DOCKER_LOG"',
      'case "$1" in',
      "  compose)",
      '    if [ "${DOCKER_NO_CID:-}" = "1" ]; then exit 0; fi',
      '    case " $* " in *" ps -q hermes-web "*) printf "%s\\n" "$DOCKER_CID"; exit 0 ;; esac',
      '    echo "shim: unexpected compose call" >&2; exit 99 ;;',
      "  inspect)",
      pop("STATES", "STATE_CURSOR"),
      '    if [ "$line" = "FAIL" ]; then exit 1; fi',
      '    printf "%s\\n" "$line"; exit 0 ;;',
      "  exec)",
      pop("PROBES", "PROBE_CURSOR"),
      '    rc="${line%%|*}"; body="${line#*|}"',
      '    printf "%b" "$body"; exit "$rc" ;;',
      '  *) echo "shim: unexpected docker verb $1" >&2; exit 99 ;;',
      "esac",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  writeFileSync(join(shim, "sleep"), ['#!/usr/bin/env bash', 'printf "%s\\n" "$1" >> "$SLEEP_LOG"', "exit 0", ""].join("\n"), { mode: 0o755 });

  const script = [
    "set -euo pipefail",
    'to_posix() { if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else printf "%s" "$1"; fi; }',
    'export PATH="$(to_posix "$SHIM_DIR"):/usr/bin:/bin:$PATH"',
    'export DOCKER_LOG="$(to_posix "$ROOT_NATIVE/docker.log")" SLEEP_LOG="$(to_posix "$ROOT_NATIVE/sleep.log")"',
    'export STATES="$(to_posix "$ROOT_NATIVE/states.txt")" PROBES="$(to_posix "$ROOT_NATIVE/probes.txt")"',
    'export STATE_CURSOR="$(to_posix "$ROOT_NATIVE/state.cursor")" PROBE_CURSOR="$(to_posix "$ROOT_NATIVE/probe.cursor")"',
    GATE,
  ].join("\n");
  const r = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      SHIM_DIR: shim,
      ROOT_NATIVE: root,
      DOCKER_CID: CID,
      ...(opts.noCid ? { DOCKER_NO_CID: "1" } : {}),
      ...opts.env,
    },
  });
  const lines = (f: string) => readFileSync(join(root, f), "utf8").split("\n").filter(Boolean);
  const run: Run = { code: r.status, stdout: r.stdout, stderr: r.stderr, docker: lines("docker.log"), sleeps: lines("sleep.log") };

  // Invariants that hold in EVERY scenario, pass or fail.
  for (const call of run.docker) {
    const verb = call.split(" ")[0];
    expect(["compose", "inspect", "exec"], `unexpected docker call: ${call}`).toContain(verb);
    if (verb === "compose") {
      expect(call).toBe("compose -p hermes -f docker-compose.prod.yml --env-file .env.production ps -q hermes-web");
    } else {
      expect(call, call).toContain(CID);
    }
  }
  return run;
}

const verbs = (r: Run) => r.docker.map((c) => c.split(" ")[0]);
const count = (r: Run, verb: string) => verbs(r).filter((v) => v === verb).length;

describe.skipIf(!BASH_AVAILABLE)("behaviour — the shipped gate, executed", { timeout: 30_000 }, () => {
  it("PASSES when the container is healthy at once and /api/health/ready is ready with database true", () => {
    const r = runGate({ states: [HEALTHY, HEALTHY] });
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Post-deploy health gate passed: hermes-web healthy after 0s, restart_count=0");
    expect(verbs(r)).toEqual(["compose", "inspect", "exec", "inspect"]);
    expect(r.sleeps).toEqual([]);
  });

  it("waits through `starting` and PASSES once the container turns healthy", () => {
    const r = runGate({ states: [STARTING, STARTING, HEALTHY, HEALTHY] });
    expect(r.code, r.stderr).toBe(0);
    expect(r.sleeps).toEqual(["5", "5"]);
    expect(r.stdout).toContain("healthy after 10s");
  });

  it("FAILS when the container reports unhealthy, and never probes readiness", () => {
    const r = runGate({ states: [STARTING, UNHEALTHY] });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/reported unhealthy/);
    expect(r.stderr).toContain("health=unhealthy failing_streak=3");
    expect(r.stderr).toContain("hermes-web:previous-good is preserved");
    expect(count(r, "exec")).toBe(0);
    expect(r.stdout).not.toContain("passed");
  });

  it("FAILS on timeout, after a bounded number of polls", () => {
    const r = runGate({ states: [STARTING], env: { DEPLOY_HEALTH_WAIT_SECONDS: "10", DEPLOY_HEALTH_POLL_SECONDS: "5" } });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/did not become healthy within 10s/);
    expect(count(r, "inspect")).toBe(3);
    expect(r.sleeps).toEqual(["5", "5"]);
    expect(count(r, "exec")).toBe(0);
  });

  it.each([
    ["a container that is restarting", RESTARTING],
    ["a running container that has already restarted once", RESTARTED_ONCE],
  ])("FAILS as a restart loop for %s", (_name, state) => {
    const r = runGate({ states: [state] });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/restart loop/);
    expect(count(r, "exec")).toBe(0);
  });

  it("FAILS for an exited container and reports its exit code and OOM flag", () => {
    const r = runGate({ states: [EXITED_OOM] });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/not running/);
    expect(r.stderr).toContain("exit_code=137 oom_killed=true");
  });

  it("FAILS closed when the container exposes no healthcheck status", () => {
    const r = runGate({ states: [NO_HEALTHCHECK] });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/no usable healthcheck status/);
  });

  it("REFUSES when no hermes-web container exists after the cutover", () => {
    const r = runGate({ states: [HEALTHY], noCid: true });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/no hermes-web container exists/);
    expect(verbs(r)).toEqual(["compose"]);
  });

  describe("an unreadable or hostile container state is refused and never echoed", () => {
    it("docker inspect itself fails", () => {
      const r = runGate({ states: ["FAIL"] });
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/could not read the hermes-web container state/);
    });
    it.each([
      ["an extra token", "sk-live-SECRETVALUE running false 0 healthy 0 0 false extra"],
      ["a shell metacharacter", "running;SECRETVALUE false 0 healthy 0 0 false"],
      ["too few fields", "running false 0"],
      ["an over-long token", `running false 0 ${"SECRETVALUE".repeat(5)} 0 0 false`],
    ])("%s", (_name, line) => {
      const r = runGate({ states: [line] });
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/could not read the hermes-web container state/);
      expect(r.stdout + r.stderr).not.toContain("SECRETVALUE");
    });
  });

  describe("the readiness answer must be exactly status=ready with database=true", () => {
    it("retries a failed probe within the bound, then PASSES", () => {
      const r = runGate({ states: [HEALTHY, HEALTHY], probes: ["8|", READY] });
      expect(r.code, r.stderr).toBe(0);
      expect(count(r, "exec")).toBe(2);
      expect(r.sleeps).toEqual(["5"]);
    });

    it("FAILS after the bounded number of attempts when the probe never succeeds", () => {
      const r = runGate({ states: [HEALTHY], probes: ["8|"], env: { DEPLOY_READY_ATTEMPTS: "3" } });
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/did not report ready after 3 attempt\(s\): the readiness request failed \(exit code 8\)/);
      expect(count(r, "exec")).toBe(3);
      expect(r.sleeps).toEqual(["5", "5"]);
    });

    it.each([
      ["not_ready with database false", '0|{"status":"not_ready","database":false}'],
      ["status ready but database false", '0|{"status":"ready","database":false}'],
      ["database true but status not ready", '0|{"status":"degraded","database":true}'],
      ["an extra field", '0|{"status":"ready","database":true,"debug":"x"}'],
      ["trailing garbage after the JSON", '0|{"status":"ready","database":true}garbage'],
      ["a second line after the JSON", '0|{"status":"ready","database":true}\\nEVIL'],
      ["a string where the boolean belongs", '0|{"status":"ready","database":"true"}'],
      ["a non-JSON body", "0|OK"],
    ])("FAILS for %s", (_name, probe) => {
      const r = runGate({ states: [HEALTHY], probes: [probe], env: { DEPLOY_READY_ATTEMPTS: "2" } });
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/did not report ready after 2 attempt\(s\): the readiness response was not status=ready with database=true/);
    });

    it("FAILS for an empty answer", () => {
      const r = runGate({ states: [HEALTHY], probes: ["0|"], env: { DEPLOY_READY_ATTEMPTS: "1" } });
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/the readiness response was empty/);
    });

    it("never prints the response body, even when it is an HTML error page", () => {
      const r = runGate({
        states: [HEALTHY],
        probes: ["0|<html>SECRET-STACK-TRACE password=hunter2 at /app/server.js:1</html>"],
        env: { DEPLOY_READY_ATTEMPTS: "2" },
      });
      expect(r.code).toBe(1);
      expect(r.stdout + r.stderr).not.toMatch(/SECRET-STACK-TRACE|hunter2|server\.js/);
    });

    it.each([
      ["the compact form", '0|{"status":"ready","database":true}'],
      ["the reverse key order", '0|{"database":true,"status":"ready"}'],
      ["whitespace between tokens", '0|{ "status" : "ready" , "database" : true }'],
      ["a trailing newline", '0|{"status":"ready","database":true}\\n'],
    ])("PASSES for %s", (_name, probe) => {
      const r = runGate({ states: [HEALTHY], probes: [probe] });
      expect(r.code, r.stderr).toBe(0);
    });
  });

  it("FAILS when the container restarts AFTER the readiness answer", () => {
    const r = runGate({ states: [HEALTHY, RESTARTED_ONCE] });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/restart loop|not stable after the readiness check/);
    expect(r.stdout).not.toContain("passed");
  });

  describe("bad tunables are refused before any docker call", () => {
    const bad = ["abc", "0", "08", "-5", "1.5", "99999", "901"];
    it.each(bad)("DEPLOY_HEALTH_WAIT_SECONDS=%s", (value) => {
      const r = runGate({ states: [HEALTHY], env: { DEPLOY_HEALTH_WAIT_SECONDS: value } });
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/DEPLOY_HEALTH_WAIT_SECONDS must/);
      expect(r.docker).toEqual([]);
    });
    it.each(["DEPLOY_HEALTH_POLL_SECONDS", "DEPLOY_READY_ATTEMPTS", "DEPLOY_READY_PAUSE_SECONDS"])("%s=0", (name) => {
      const r = runGate({ states: [HEALTHY], env: { [name]: "0" } });
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(`${name} must`);
      expect(r.docker).toEqual([]);
    });
    it("accepts the documented upper limit", () => {
      const r = runGate({ states: [HEALTHY], env: { DEPLOY_HEALTH_WAIT_SECONDS: "900" } });
      expect(r.code, r.stderr).toBe(0);
    });
  });
});

/* ── 3 · the workflow around it ────────────────────────────────────────────── */

describe("the workflow around the gate", () => {
  it.skipIf(!BASH_AVAILABLE)("the whole remote script, with the gate embedded, still parses as bash", () => {
    const open = "<<'REMOTE'\n";
    const start = deploy.indexOf(open) + open.length;
    const end = deploy.indexOf("\n          REMOTE\n", start);
    expect(start).toBeGreaterThan(open.length - 1);
    expect(end).toBeGreaterThan(start);
    const body = deploy
      .slice(start, end)
      .split("\n")
      .map((l) => (l.startsWith("          ") ? l.slice(10) : l))
      .join("\n");
    const r = spawnSync("bash", ["-n"], { input: body, encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("Gate 0D-A (the static Compose contract) still passes with the gate in place", () => {
    const r = spawnSync(process.execPath, [join(REPO, "scripts", "production-compose-project-static-check.mjs")], { encoding: "utf8", cwd: REPO });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("[production-compose-static] PASS");
  });

  it("the gate is documented in the workflow header", () => {
    expect(deploy).toContain("POST-DEPLOY HEALTH GATE");
    expect(deploy).toContain("/api/health/ready");
  });
});

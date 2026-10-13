#!/usr/bin/env node
/**
 * Smoke test for the BUILT executive report worker image.
 *
 *   node scripts/ci/executive-worker-image-smoke.mjs <image>
 *
 * The registration test proves the Dockerfile TEXT and runs the script with the
 * test runner's own node. Neither proves the IMAGE works: the right file copied,
 * a non-root user, a node in the base image that can run it, a container that
 * reaches an HTTP endpoint and stops cleanly. This drives the image itself.
 *
 * Checks, each one fatal:
 *   1. contents   — runs as uid 1001, holds exactly the one runner file;
 *   2. credential — no token: exit 2 at startup, and NO request is made;
 *   3. sweep      — with a token: authenticated POSTs, the cursor chained until
 *                   it runs out, exit 0, and the token never printed;
 *   4. refusal    — a token the endpoint rejects: exit 1 (fatal), one request;
 *   5. shutdown   — the polling loop stops on `docker stop` with exit 0 well
 *                   inside the stop timeout, logging that it stopped.
 *
 * The stub endpoint listens on the host and the container joins the host
 * network (Linux CI runner). The bearer token is generated per run and never
 * written to output. Nothing here needs a database, a secret or the network.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const image = process.argv[2];
if (!image) {
  console.error("usage: executive-worker-image-smoke.mjs <image>");
  process.exit(2);
}

const RUNNER = "scripts/executive/daily-report-worker.mjs";
const TOKEN = `ci-${randomBytes(18).toString("base64url")}`;
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures.push(label);
};

function docker(args, { timeoutMs = 120_000 } = {}) {
  const r = spawnSync("docker", args, { encoding: "utf8", timeout: timeoutMs });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A stub of POST /api/executive/reports/run that records what it was sent. */
async function withStub(respond, fn) {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization ?? "" });
    const { status, body } = respond(req, seen.length);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`, seen);
  } finally {
    await new Promise(r => server.close(() => r()));
  }
}

const pass = over => ({
  leaseHeld: true,
  considered: 1,
  created: 1,
  alreadyReported: 0,
  skippedNotFinished: 0,
  failed: 0,
  notified: 1,
  failures: [],
  undelivered: [],
  afterOrganizationId: null,
  nextAfterOrganizationId: null,
  leaseLost: false,
  ...over,
});

/** docker run, async, so the stub in this same process can answer it. */
function runContainer(args, timeoutMs = 60_000) {
  return new Promise(resolve => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => (stdout += String(d)));
    child.stderr.on("data", d => (stderr += String(d)));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("exit", code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

const envArgs = env => Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);

// 1. contents ────────────────────────────────────────────────────────────────
{
  const r = docker(["run", "--rm", "--entrypoint", "sh", image, "-c", "id -u; find /app -type f | sort"]);
  const lines = r.stdout.trim().split("\n");
  check(r.code === 0, "image starts a shell for inspection");
  check(lines[0] === "1001", `runs as the unprivileged worker user (uid ${lines[0]})`);
  check(JSON.stringify(lines.slice(1)) === JSON.stringify([`/app/${RUNNER}`]), "holds exactly the one runner file");
}

// 2. credential ──────────────────────────────────────────────────────────────
await withStub(
  () => ({ status: 200, body: pass({}) }),
  async (base, seen) => {
    const r = await runContainer(["run", "--rm", "--network", "host", ...envArgs({ HERMES_WORKER_BASE_URL: base }), image]);
    check(r.code === 2, `no token: exits 2 at startup (got ${r.code})`);
    check(seen.length === 0, "no token: makes no request");
    check(r.stderr.includes("EXECUTIVE_REPORT_WORKER_TOKEN is not set"), "no token: says why");
  },
);

// 3. sweep ───────────────────────────────────────────────────────────────────
await withStub(
  (req, n) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return { status: 401, body: { error: "AUTHENTICATION_REQUIRED" } };
    return { status: 200, body: n === 1 ? pass({ nextAfterOrganizationId: "org-1" }) : pass({ afterOrganizationId: "org-1" }) };
  },
  async (base, seen) => {
    const r = await runContainer([
      "run", "--rm", "--network", "host",
      ...envArgs({ HERMES_WORKER_BASE_URL: base, EXECUTIVE_REPORT_WORKER_TOKEN: TOKEN, EXECUTIVE_REPORT_BATCH: "1" }),
      image, "node", RUNNER, "--once",
    ]);
    check(r.code === 0, `sweep: exits 0 (got ${r.code})`);
    check(
      JSON.stringify(seen.map(s => `${s.method} ${s.url}`)) ===
        JSON.stringify(["POST /api/executive/reports/run?max=1", "POST /api/executive/reports/run?max=1&after=org-1"]),
      "sweep: two authenticated POSTs, the second carrying the server's cursor",
    );
    check(seen.every(s => s.auth === `Bearer ${TOKEN}`), "sweep: every request carries the bearer token");
    check(!(r.stdout + r.stderr).includes(TOKEN), "sweep: the token never appears in output");
    check(/"msg":"pass complete"/.test(r.stdout), "sweep: logs a structured pass line");
  },
);

// 4. refusal ─────────────────────────────────────────────────────────────────
await withStub(
  () => ({ status: 401, body: { error: "AUTHENTICATION_REQUIRED" } }),
  async (base, seen) => {
    const r = await runContainer([
      "run", "--rm", "--network", "host",
      ...envArgs({ HERMES_WORKER_BASE_URL: base, EXECUTIVE_REPORT_WORKER_TOKEN: "not-the-right-token" }),
      image, "node", RUNNER, "--once",
    ]);
    check(r.code === 1, `refused credential: exits 1 (got ${r.code})`);
    check(seen.length === 1, "refused credential: does not retry against a closed door");
  },
);

// 5. shutdown ────────────────────────────────────────────────────────────────
await withStub(
  () => ({ status: 200, body: pass({}) }),
  async (base, seen) => {
    const name = `exec-worker-smoke-${randomBytes(4).toString("hex")}`;
    const started = docker([
      "run", "-d", "--name", name, "--network", "host",
      ...envArgs({ HERMES_WORKER_BASE_URL: base, EXECUTIVE_REPORT_WORKER_TOKEN: TOKEN, EXECUTIVE_REPORT_INTERVAL_MS: "900000" }),
      image,
    ]);
    check(started.code === 0, "loop: container starts detached");
    const deadline = Date.now() + 30_000;
    while (seen.length === 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 250));
    check(seen.length >= 1, "loop: reaches the endpoint, then idles until the next interval");

    const t0 = Date.now();
    docker(["stop", "-t", "20", name], { timeoutMs: 60_000 });
    const tookMs = Date.now() - t0;
    const state = docker(["inspect", "-f", "{{.State.ExitCode}}", name]).stdout.trim();
    const logs = docker(["logs", name]);
    docker(["rm", "-f", name]);
    check(state === "0", `loop: exits 0 on docker stop (got ${state})`);
    check(tookMs < 10_000, `loop: stops in ${tookMs} ms, well inside the 20 s stop timeout (no SIGKILL)`);
    check(/"msg":"stopped"/.test(logs.stdout), "loop: logs that it stopped");
    check(!(logs.stdout + logs.stderr).includes(TOKEN), "loop: the token never appears in output");
  },
);

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nall checks passed");
}

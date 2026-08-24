/**
 * Phase 107 FINAL R4 — start a real production server and run the live refusal
 * probe against it.
 *
 * PROVENANCE, stated because it matters for how much this file should be
 * trusted. The launcher used in earlier rounds lived outside the repository and
 * was destroyed during this session by an overwrite. This is NOT a
 * reconstruction of that file. It is written against the contract the source
 * states directly:
 *
 *   src/lib/auth/config.ts — "Auth is 'configured' when a seed admin is
 *   provided via env: ADMIN_EMAIL, ADMIN_PASSWORD", with JWT_SECRET signing
 *   access tokens.
 *
 *   refusal-contract-probe.mjs — "credentials come from HERMES_AUDIT_EMAIL /
 *   HERMES_AUDIT_PASSWORD" and it drives a real Chrome through the real login
 *   form at {BASE}/en/auth/login.
 *
 * It is checked in DELIBERATELY. Keeping the launcher outside the repository is
 * what allowed it to be destroyed without anything noticing, and it is what
 * made the phase's most important runtime gate depend on a file no reviewer
 * could inspect. It mints its identity at runtime and never persists it, so
 * there is nothing secret in these bytes.
 *
 * WHAT MAKES THE RESULT TRUSTWORTHY IS NOT THIS FILE. The probe DERIVES
 * `PROBE_MODE` from the responses it actually collected, including the
 * requirement that the signed-in caller produce a response shape the anonymous
 * caller never produced. A launcher that faked its way through would produce
 * PROBE_MODE=INCONCLUSIVE and fail the gate. See `probe-mode-control.mjs`,
 * which proves a stub cannot close the phase.
 *
 * THE IDENTITY is ephemeral and confined to the child process environment:
 * never written to disk, never logged, never placed on a command line.
 *
 * Usage:
 *   node docs/design/stage6a/live-probe-launcher.mjs --port 3391 --out <file>
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const PORT = Number(arg("--port", "3391"));
const OUT = arg("--out");
if (!OUT) {
  console.error("usage: live-probe-launcher.mjs --port <n> --out <file>");
  process.exit(2);
}
const BASE = `http://localhost:${PORT}`;

/* ── 1. an ephemeral identity, held only in memory ────────────────────────── */
const EMAIL = `audit-${crypto.randomBytes(8).toString("hex")}@local.invalid`;
const PASSWORD = crypto.randomBytes(32).toString("base64url");
const JWT = crypto.randomBytes(32).toString("base64url");

console.log("ephemeral audit identity created in memory");
console.log(`  email    : present, ${EMAIL.length} chars, domain @local.invalid`);
console.log(`  password : present, ${PASSWORD.length} chars from 32 random bytes`);
console.log(`  jwt      : present, ${JWT.length} chars from 32 random bytes`);
console.log("  written to disk: no    logged: no    on any command line: no");

/*
 * PHASE 107 FINAL R4 - PREFLIGHT, added after this launcher produced a false
 * measurement in exactly the way it was designed not to.
 *
 * On Windows `spawn(..., { shell: true })` puts cmd.exe between this process
 * and `next start`. Killing the child killed cmd.exe and LEAKED the server. A
 * later run then found port 3391 already answering HTTP 200, concluded "the
 * server is ready", and pointed the probe at a stale server started with a
 * DIFFERENT ephemeral identity. The login could never succeed, and the probe
 * hung until undici timed out.
 *
 * A readiness check that cannot tell ITS server from SOMEBODY ELSE’S is not a
 * readiness check. So: refuse to start if the port is already occupied, and
 * tear down the whole process tree rather than its first ancestor.
 */
const portInUse = await (async () => {
  try {
    await fetch(`${BASE}/en`, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return true;
  } catch { return false; }
})();
if (portInUse) {
  console.error(`REFUSING: something is already serving ${BASE}.`);
  console.error("This launcher must measure a server it started itself, with the identity it minted.");
  process.exit(6);
}

/* ── 2. the production server ─────────────────────────────────────────────── */
const childEnv = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  HERMES_STORAGE_MODE: "session",
  ADMIN_EMAIL: EMAIL,
  ADMIN_PASSWORD: PASSWORD,
  ADMIN_NAME: "Phase107 Audit",
  JWT_SECRET: JWT,
  AUTH_SECRET: JWT,
};

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: childEnv, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d.toString(); });
server.stderr.on("data", (d) => { serverLog += d.toString(); });

/* Kill the TREE. `server.kill()` alone reaches cmd.exe and leaves next running. */
const stop = () => {
  try {
    if (process.platform === "win32" && server.pid) {
      execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      server.kill("SIGTERM");
    }
  } catch { /* already gone */ }
};
process.on("exit", stop);

/* ── 3. wait for it to actually serve ─────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ready = false;
let lastStatus = "no response";
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  if (server.exitCode !== null) {
    console.error(`server exited early with code ${server.exitCode}`);
    console.error(serverLog.split(/\r?\n/).slice(-25).join("\n"));
    process.exit(4);
  }
  try {
    const res = await fetch(`${BASE}/en`, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    lastStatus = String(res.status);
    if (res.status >= 200 && res.status < 400) { ready = true; break; }
  } catch { /* not up yet */ }
}
if (!ready) {
  console.error(`server never became ready on ${BASE} (last status: ${lastStatus})`);
  console.error(serverLog.split(/\r?\n/).slice(-25).join("\n"));
  stop();
  process.exit(4);
}
console.log("");
console.log(`production server ready on ${BASE}/en (HTTP ${lastStatus})`);

/* ── 4. the real probe, with the identity passed only through the env ─────── */
let probeExit = 0;
try {
  const out = execFileSync("node",
    [path.join(HERE, "refusal-contract-probe.mjs"), "--base", BASE, "--out", OUT],
    {
      encoding: "utf8",
      env: { ...process.env, HERMES_AUDIT_EMAIL: EMAIL, HERMES_AUDIT_PASSWORD: PASSWORD },
      shell: process.platform === "win32",
      maxBuffer: 32 * 1024 * 1024,
    });
  process.stdout.write(out);
} catch (e) {
  if (e.stdout) process.stdout.write(e.stdout);
  if (e.stderr) process.stderr.write(e.stderr);
  probeExit = e.status ?? 1;
}

stop();

/* The launcher must never be the reason a probe looks like it passed. */
if (!fs.existsSync(OUT)) {
  console.error("the probe produced no artefact");
  process.exit(5);
}
process.exit(probeExit);

/**
 * Phase 107 FINAL R4 — prove a STUB probe result cannot close the phase.
 *
 * WHY THIS EXISTS, stated plainly because it was a real mistake in this phase.
 *
 * The live refusal probe needs a production server and an ephemeral identity.
 * When that was inconvenient, a "launcher stub" was written that emitted a
 * plausible result and exited 0. That is the most dangerous shape a proof can
 * take: every downstream number stayed green — REFUSAL_CONTRACT_VIOLATIONS=0
 * included — while nothing had been measured. A gate that a placeholder can
 * satisfy is not a gate.
 *
 * The fix is in two halves, and this file is the second one:
 *
 *   1. `refusal-contract-probe.mjs` DERIVES `PROBE_MODE` from the responses it
 *      actually collected. It cannot be asserted by a caller.
 *   2. this control substitutes a STUB result for the live one and requires the
 *      final report generator to REFUSE it.
 *
 * The substitution happens in a COPY of the log directory. The real logs are
 * never written to.
 *
 * Usage: node docs/design/stage6a/probe-mode-control.mjs <snapshot.json> <logDir> <evidenceCsv>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [SNAP, LOGS, EVIDENCE] = process.argv.slice(2);
if (!SNAP || !LOGS || !EVIDENCE) {
  console.error("usage: probe-mode-control.mjs <snapshot.json> <logDir> <evidenceCsv>");
  process.exit(2);
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "phase107-probemode-"));

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
};

const generate = (logDir, out) => {
  try {
    execFileSync("node", [path.join(HERE, "generate-final-report.mjs"), SNAP, logDir, EVIDENCE, out],
      { encoding: "utf8", stdio: "pipe", shell: process.platform === "win32" });
    return 0;
  } catch (e) { return e.status ?? 1; }
};

/* ── baseline: the untouched logs must produce a report ───────────────────── */
const baseDir = path.join(ROOT, "baseline");
copyDir(LOGS, baseDir);
const baseline = generate(baseDir, path.join(ROOT, "baseline.md"));
console.log(`baseline generator exit: ${baseline}`);
if (baseline !== 0) {
  console.error("the generator does not succeed on the real logs — this control proves nothing until it does");
  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log("");
  console.log("STUB_CANNOT_SATISFY_LIVE_PROBE=INCONCLUSIVE");
  process.exit(1);
}

/* ── the substitution ─────────────────────────────────────────────────────── */
const dir = path.join(ROOT, "stubbed");
copyDir(LOGS, dir);
const probeLog = path.join(dir, "13-probe.log");

if (!fs.existsSync(probeLog)) {
  console.error("no 13-probe.log to substitute — cannot run this control");
  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log("");
  console.log("STUB_CANNOT_SATISFY_LIVE_PROBE=INCONCLUSIVE");
  process.exit(1);
}

const before = fs.readFileSync(probeLog, "utf8");
if (!/^PROBE_MODE=LIVE$/m.test(before)) {
  console.error("the real probe log does not carry PROBE_MODE=LIVE — nothing to downgrade");
  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log("");
  console.log("STUB_CANNOT_SATISFY_LIVE_PROBE=INCONCLUSIVE");
  process.exit(1);
}

/*
 * The stub keeps everything a placeholder would plausibly keep: zero
 * violations, the full endpoint list, the epoch header. Only the one thing it
 * cannot honestly claim is downgraded.
 */
const after = before.replace(/^PROBE_MODE=LIVE$/m, "PROBE_MODE=STUB");
fs.writeFileSync(probeLog, after);

/* assertApplied — the defect must physically exist in the bytes the generator reads. */
const staged = fs.readFileSync(probeLog, "utf8");
const applied = /^PROBE_MODE=STUB$/m.test(staged) && /^REFUSAL_CONTRACT_VIOLATIONS=0$/m.test(staged);
if (!applied) {
  console.error("MISAPPLIED: the stubbed probe log is not in the state this control requires");
  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log("");
  console.log("STUB_CANNOT_SATISFY_LIVE_PROBE=FAIL");
  process.exit(1);
}
console.log("  applied: PROBE_MODE=STUB, REFUSAL_CONTRACT_VIOLATIONS=0 retained");

const code = generate(dir, path.join(ROOT, "stubbed.md"));
const rejected = code !== 0;
console.log(`  generator exit on stubbed probe: ${code}`);
console.log(`  ${rejected ? "REJECTED" : "ACCEPTED"} — a stub ${rejected ? "cannot" : "CAN"} close the phase`);

fs.rmSync(ROOT, { recursive: true, force: true });

console.log("");
console.log(`STUB_PROBE_REPORT_EXIT=${code}`);
console.log(`STUB_CANNOT_SATISFY_LIVE_PROBE=${rejected ? "PASS" : "FAIL"}`);
process.exit(rejected ? 0 : 1);

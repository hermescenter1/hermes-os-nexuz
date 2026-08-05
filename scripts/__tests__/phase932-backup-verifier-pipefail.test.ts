import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * PHASE 93.2 — pipefail false-negative regression test (real shell level).
 *
 * Runs the REAL scripts/verify-backup.sh (with `set -euo pipefail`) against a
 * temporary fake `docker` whose `pg_restore --list` emits a LARGE TOC
 * (>> the 64 KiB pipe buffer) with the essential tables near the TOP. The old
 * `echo "${TOC}" | grep -q …` check made the `echo` producer receive SIGPIPE
 * (exit 141) once `grep -q` matched early; under pipefail the pipeline went
 * non-zero and the table was falsely reported missing. The here-string fix has
 * no producer process, so a large TOC must now verify cleanly.
 *
 * No database and no production are contacted — the fake docker fabricates the
 * TOC. POSIX only (bash); the Linux CI Validate job runs it, skipped on win32.
 */

const POSIX = process.platform !== "win32";
const REPO = process.cwd();

// Fake `docker`: on `pg_restore --list` it drains stdin and prints a >64 KiB TOC
// with the four essential TABLE DATA entries near the TOP (so the OLD pipeline
// would SIGPIPE). FAKE_FAIL=1 → exit non-zero (corrupt). FAKE_OMIT=<Table> drops
// one essential table (missing-table negative case).
const FAKE_DOCKER = `#!/usr/bin/env bash
set -u
cmd=""
for a in "$@"; do case "$a" in pg_restore) cmd="pg_restore" ;; esac; done
if [[ "$cmd" != "pg_restore" ]]; then exit 0; fi
cat > /dev/null   # drain the streamed dump on stdin
if [[ "\${FAKE_FAIL:-0}" == "1" ]]; then
  echo 'pg_restore: error: could not read from input file: end of file' >&2
  exit 1
fi
omit="\${FAKE_OMIT:-}"
[[ "$omit" != "Organization"   ]] && echo "4200; 0 16456 TABLE DATA public Organization hermes"
[[ "$omit" != "User"           ]] && echo "4201; 0 16460 TABLE DATA public User hermes"
[[ "$omit" != "IndustrialSite" ]] && echo "4202; 0 16470 TABLE DATA public IndustrialSite hermes"
[[ "$omit" != "IndustrialAsset" ]] && echo "4203; 0 16480 TABLE DATA public IndustrialAsset hermes"
# >64 KiB of filler AFTER the essential rows so grep -q would match early and the
# producer would still have data pending → SIGPIPE under the old pipeline.
for i in $(seq 1 4000); do
  printf '9%03d; 0 1 TABLE DATA public Filler_%04d some_owner_padding_padding_padding\\n' "$i" "$i"
done
exit 0
`;

interface Res { status: number; stdout: string; stderr: string; json: { status?: string; reason?: string } | null; }

function runVerify(env: Record<string, string> = {}): Res {
  const work = mkdtempSync(join(tmpdir(), "p932-"));
  const bin = join(work, "bin");
  const backups = join(work, "backups");
  mkdirSync(bin, { recursive: true });
  mkdirSync(backups, { recursive: true });
  const docker = join(bin, "docker");
  writeFileSync(docker, FAKE_DOCKER);
  chmodSync(docker, 0o755);
  const dump = join(backups, "hermes_test.dump");
  writeFileSync(dump, "PGDMP-fake-dump-bytes");

  let status = 0, stdout = "", stderr = "";
  try {
    stdout = execFileSync("bash", [join(REPO, "scripts", "verify-backup.sh"), dump, "fake-container"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    status = err.status ?? 1;
    stdout = err.stdout?.toString() ?? "";
    stderr = err.stderr?.toString() ?? "";
  }
  let json: Res["json"] = null;
  try { json = JSON.parse(readFileSync(join(backups, ".last-verification.json"), "utf8")); } catch { /* absent */ }
  return { status, stdout, stderr, json };
}

describe.skipIf(!POSIX)("PHASE 93.2 — verify-backup.sh survives a large TOC (no pipefail false-negative)", () => {
  it("LARGE_TOC: a >64KiB TOC with all four tables verifies cleanly (exit 0, verified)", () => {
    const r = runVerify();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Verification PASSED");
    expect(r.stdout).not.toMatch(/not found in dump TOC/);
    expect(r.json?.status).toBe("verified");
  });

  it("NEGATIVE corrupt: pg_restore non-zero → verifier exits non-zero, state failed", () => {
    const r = runVerify({ FAKE_FAIL: "1" });
    expect(r.status).not.toBe(0);
    expect(r.json?.status).toBe("failed");
    expect(r.json?.reason).toMatch(/pg_restore --list failed/);
  });

  it("NEGATIVE missing table: one essential table absent → non-zero with correct reason", () => {
    const r = runVerify({ FAKE_OMIT: "Organization" });
    expect(r.status).not.toBe(0);
    expect(r.json?.status).toBe("failed");
    expect(r.json?.reason).toBe("missing table: Organization");
  });
});

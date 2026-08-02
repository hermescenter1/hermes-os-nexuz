import { describe, it, expect, beforeAll } from "vitest";
import {
  mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync,
  statSync, existsSync, readdirSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * PHASE 93.1 — backup-verification hotfix regression test (real shell level).
 *
 * Runs the REAL scripts/backup-postgres.sh (which invokes the REAL, 0644
 * non-executable scripts/verify-backup.sh) against a temporary FAKE `docker`
 * executable on PATH. It contacts no database and no production — the fake docker
 * fabricates pg_dump output and a representative pg_restore --list TOC.
 *
 * It proves the two defects are fixed and cannot silently return:
 *   - the verifier is detected by existence and invoked through `bash`, so a
 *     0644 (non-executable) verify-backup.sh is NOT skipped, and
 *   - pg_restore is fed the dump on STDIN with NO trailing "-" filename.
 * Plus: essential-table checks, .last-verification.json, backup file/dir modes,
 * and fail-closed on a corrupt dump.
 *
 * POSIX only: exercises bash + chmod/stat file-modes. Skipped on win32 (the
 * Linux CI Validate job runs it in full).
 */

const POSIX = process.platform !== "win32";
const REPO = process.cwd();

// A fake `docker` shim. `docker exec [-i] <container> pg_dump …`  emits a fake
// dump to stdout; `docker exec -i <container> pg_restore --list` consumes stdin
// and emits a representative TOC. It FAILS if pg_restore is ever handed a bare
// "-" argument (the exact defect), logs its invocation for assertions, and can
// simulate a corrupt dump via HERMES_FAKE_PGRESTORE_FAIL=1.
const FAKE_DOCKER = `#!/usr/bin/env bash
set -u
cmd=""
has_dash=0
for a in "$@"; do
  case "$a" in
    pg_dump)    cmd="pg_dump" ;;
    pg_restore) cmd="pg_restore" ;;
    -)          has_dash=1 ;;
  esac
done

if [[ "$cmd" == "pg_dump" ]]; then
  printf 'PGDMP-fake-custom-format-dump\\n'
  exit 0
fi

if [[ "$cmd" == "pg_restore" ]]; then
  bytes=$(cat | wc -c | tr -d ' ')
  {
    echo "ARGS=$*"
    echo "STDIN_BYTES=$bytes"
    echo "HAS_DASH=$has_dash"
  } >> "\${FAKE_DOCKER_LOG:-/dev/null}"
  if [[ "$has_dash" == "1" ]]; then
    echo 'pg_restore: error: could not open input file "-": No such file or directory' >&2
    exit 1
  fi
  if [[ "\${HERMES_FAKE_PGRESTORE_FAIL:-0}" == "1" ]]; then
    echo 'pg_restore: error: could not read from input file: end of file' >&2
    exit 1
  fi
  cat <<'TOC'
;
; Archive created by pg_dump (fake)
;
215; 1259 16456 TABLE public Organization hermes
4200; 0 16456 TABLE DATA public Organization hermes
216; 1259 16460 TABLE public User hermes
4201; 0 16460 TABLE DATA public User hermes
217; 1259 16470 TABLE public IndustrialSite hermes
4202; 0 16470 TABLE DATA public IndustrialSite hermes
218; 1259 16480 TABLE public IndustrialAsset hermes
4203; 0 16480 TABLE DATA public IndustrialAsset hermes
TOC
  exit 0
fi
exit 0
`;

interface RunResult { status: number; stdout: string; stderr: string; }

function runBackup(work: string, extraEnv: Record<string, string> = {}): RunResult {
  const bin = join(work, "bin");
  const backups = join(work, "backups");
  const log = join(work, "docker.log");
  try {
    const stdout = execFileSync("bash", [join(REPO, "scripts", "backup-postgres.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        BACKUP_DIR: backups,
        POSTGRES_CONTAINER: "fake-container",
        POSTGRES_USER: "hermes",
        POSTGRES_DB: "hermes_db",
        FAKE_DOCKER_LOG: log,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
    };
  }
}

function newWork(): string {
  const work = mkdtempSync(join(tmpdir(), "p931-"));
  const bin = join(work, "bin");
  mkdirSync(bin, { recursive: true });
  const docker = join(bin, "docker");
  writeFileSync(docker, FAKE_DOCKER);
  chmodSync(docker, 0o755);
  return work;
}

const mode = (p: string) => statSync(p).mode & 0o777;

describe.skipIf(!POSIX)("PHASE 93.1 — backup verifier stdin hotfix (real shell)", () => {
  let work: string;
  let res: RunResult;
  let dumpFile: string;
  let dockerLog: string;

  beforeAll(() => {
    work = newWork();
    res = runBackup(work);
    const backups = join(work, "backups");
    const dumps = existsSync(backups) ? readdirSync(backups).filter((f) => f.endsWith(".dump")) : [];
    dumpFile = dumps.length ? join(backups, dumps[0]) : "";
    dockerLog = join(work, "docker.log");
  });

  it("verify-backup.sh ships non-executable (0644) — the shipped mode is 0644", () => {
    // git stores it 100644; the working tree must not require +x.
    const m = mode(join(REPO, "scripts", "verify-backup.sh"));
    // 0644 (or at least NOT owner-executable) — the fix must not depend on +x.
    expect(m & 0o100).toBe(0); // owner-execute bit is NOT set
  });

  it("backup succeeds and RUNS verification (does not skip it)", () => {
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Running backup verification...");
    expect(res.stdout).not.toContain("skipping verification");
    expect(res.stdout).toContain("Verification PASSED");
  });

  it("invokes the 0644 verifier through bash (it ran despite no +x)", () => {
    // The verifier only produces a pg_restore invocation if it actually ran;
    // running a 0644 file is only possible via `bash <file>`.
    expect(existsSync(dockerLog)).toBe(true);
    expect(readFileSync(dockerLog, "utf8")).toContain("STDIN_BYTES=");
  });

  it("streams the dump on STDIN and passes NO trailing '-' to pg_restore", () => {
    const logTxt = readFileSync(dockerLog, "utf8");
    expect(logTxt).toContain("HAS_DASH=0");        // no bare "-" filename
    expect(logTxt).not.toContain("HAS_DASH=1");
    expect(logTxt).toMatch(/STDIN_BYTES=[1-9]/);   // real bytes streamed in
    expect(logTxt).toMatch(/ARGS=.*pg_restore --list/);
    expect(logTxt).not.toMatch(/pg_restore --list.* -( |$)/); // never a trailing -
  });

  it("passes all four essential-table checks", () => {
    // Verification PASSED (asserted above) only when every essential table's
    // TABLE DATA entry is found in the TOC.
    expect(res.stdout).toMatch(/all 4 essential tables present/);
  });

  it("writes .last-verification.json with status verified", () => {
    const j = JSON.parse(readFileSync(join(work, "backups", ".last-verification.json"), "utf8"));
    expect(j.status).toBe("verified");
    expect(typeof j.timestamp).toBe("string");
  });

  it("backup file mode is 600", () => {
    expect(dumpFile).not.toBe("");
    expect(mode(dumpFile)).toBe(0o600);
  });

  it("backup directory mode is 700", () => {
    expect(mode(join(work, "backups"))).toBe(0o700);
  });

  it("a corrupt/failing pg_restore makes the backup exit non-zero (fail-closed)", () => {
    const w2 = newWork();
    const r2 = runBackup(w2, { HERMES_FAKE_PGRESTORE_FAIL: "1" });
    expect(r2.status).not.toBe(0);
    const j = JSON.parse(readFileSync(join(w2, "backups", ".last-verification.json"), "utf8"));
    expect(j.status).toBe("failed");
  });

  it("a regressed trailing '-' would fail the verifier (guard proves the bug stays fixed)", () => {
    // Directly exercise the fake docker the way the OLD command did, proving the
    // harness catches a reintroduced trailing "-".
    const w3 = newWork();
    const docker = join(w3, "bin", "docker");
    let failed = false;
    try {
      execFileSync("bash", ["-c", `echo dump | "${docker}" exec -i c pg_restore --list -`], {
        env: { ...process.env, FAKE_DOCKER_LOG: join(w3, "d.log") },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true); // trailing "-" → non-zero, as in production
  });
});

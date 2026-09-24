/**
 * PHASE 99.7 — the pre-migration backup evidence gate reads root-owned
 * artifacts through `sudo -n`, and still fails closed.
 *
 * THE INCIDENT THIS LOCKS
 * -----------------------
 * A production deploy refused a genuinely verified backup:
 *
 *   grep: /backups/postgres/<name>.hbk.meta.json: Permission denied
 *   Refusing: newest backup is not marked verified.
 *
 * `scripts/backup-postgres.sh` writes with `umask 077`, `chmod 700` on the
 * directory and `chmod 600` on every file, so the artifact and its record are
 * root-owned; the gate runs as the non-root deploy user and read them without
 * privilege. The failure was closed — but it could never pass.
 *
 * HOW THIS FILE TESTS IT
 * ----------------------
 * The gate is extracted from `.github/workflows/deploy.yml` between its
 * `>>> backup-evidence-gate` / `<<< backup-evidence-gate` markers and EXECUTED
 * with bash — the shipped text, not a copy of it. Three layers:
 *
 *   1. static    — every read of the backup directory goes through `sudo -n`;
 *                  nothing changes a permission, copies, or needs `jq`;
 *   2. behaviour — against fixtures, with a `sudo` shim that logs each call and
 *                  can deny: the valid case passes, every broken case refuses,
 *                  and a denied sudo can never read as success;
 *   3. real permissions (Linux with passwordless `sudo -n`, i.e. CI) — a truly
 *                  root-owned 0700 directory with 0600 files. An unprivileged
 *                  read is proven to fail, the gate passes through real sudo,
 *                  and a hash mismatch still refuses.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const deploy = readFileSync(join(REPO, ".github", "workflows", "deploy.yml"), "utf8").replace(/\r\n/g, "\n");

function extractGate(): string {
  const start = deploy.indexOf("# >>> backup-evidence-gate");
  const end = deploy.indexOf("# <<< backup-evidence-gate");
  expect(start, "gate start marker").toBeGreaterThan(-1);
  expect(end, "gate end marker").toBeGreaterThan(start);
  return deploy.slice(start, end);
}
const GATE = extractGate();
/** The gate without its comments — assertions about CODE must not match prose. */
const GATE_CODE = GATE.split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/* ── 1 · static ────────────────────────────────────────────────────────────── */

describe("static — every read of the backup directory is privileged, and only reads are", () => {
  it("defines the privileged reader as non-interactive sudo, nothing else", () => {
    expect(GATE_CODE).toContain('backup_priv() { sudo -n -- "$@"; }');
    // No other sudo INVOCATION exists in the gate. Quoted strings are removed
    // first: the refusal messages name "sudo -n" for the operator, and a
    // word in a message is not a command.
    const unquoted = GATE_CODE.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'[^']*'/g, "''");
    expect(unquoted.match(/\bsudo\b/g)).toHaveLength(1);
  });

  it("routes the listing, both record reads and the hash through backup_priv", () => {
    expect(GATE_CODE).toMatch(/backup_priv find "\$\{BACKUP_DIR\}" -maxdepth 1 -type f -name '\*\.hbk'/);
    expect(GATE_CODE).toMatch(/backup_priv find "\$\{BACKUP_DIR\}" -maxdepth 1 -name "\$\{NEWEST_NAME\}\.partial"/);
    expect(GATE_CODE).toContain('backup_priv cat -- "${META}"');
    expect(GATE_CODE).toContain('backup_priv cat -- "${ADOPTION_EVIDENCE}"');
    expect(GATE_CODE).toContain('backup_priv sha256sum -- "${NEWEST_BACKUP}"');
  });

  it("no UNPRIVILEGED read of any backup path survives", () => {
    // the pre-fix shapes, each of which fails on a 0600 root-owned file
    expect(GATE_CODE).not.toMatch(/\bls\b[^\n]*BACKUP_DIR/);
    expect(GATE_CODE).not.toMatch(/grep[^\n]*"\$\{(META|ADOPTION_EVIDENCE)\}"/);
    expect(GATE_CODE).not.toMatch(/sed[^\n]*"\$\{META\}"/);
    expect(GATE_CODE).not.toMatch(/(^|[^_])sha256sum "\$\{NEWEST_BACKUP\}"/m);
    expect(GATE_CODE).not.toMatch(/\[ -[ef] "\$\{(NEWEST_BACKUP|META|ADOPTION_EVIDENCE)/);
  });

  it("changes nothing: no chmod, chown, cp, mv, rm, tee, or a root shell", () => {
    expect(GATE_CODE).not.toMatch(/\b(chmod|chown|cp|mv|rm|tee|install)\b/);
    expect(GATE_CODE).not.toMatch(/sudo[^\n]*\b(su|bash|sh|-s|-i|-S)\b/);
  });

  it("does not depend on jq, and never pipes into grep -q (SIGPIPE under pipefail)", () => {
    expect(GATE_CODE).not.toMatch(/\bjq\b/);
    expect(GATE_CODE).not.toMatch(/\|\s*grep -q/);
  });

  it("keeps every verification rule, and adds the file-identity check", () => {
    for (const claim of ['"verified":true', '"partial":false', '"encrypted":true', "transportSha256", '"integrityVerified": *true']) {
      expect(GATE_CODE).toContain(claim);
    }
    expect(GATE_CODE).toContain('grep -qF "\\"file\\":\\"${NEWEST_NAME}\\""');
  });
});

/* ── 2 · behaviour, with a sudo shim ───────────────────────────────────────── */

const BASH_AVAILABLE = spawnSync("bash", ["-c", "command -v find sha256sum sort cut basename >/dev/null"], { encoding: "utf8" }).status === 0;

interface Fixture {
  dir: string;
  shim: string;
  log: string;
}

function sha(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function metaFor(name: string, body: Buffer, over: Partial<Record<string, unknown>> = {}): string {
  const rec: Record<string, unknown> = {
    artifactType: "postgres",
    verified: true,
    partial: false,
    encrypted: true,
    keyId: "test-key",
    transportSha256: sha(body),
    createdAtMs: 1,
    file: name,
    ...over,
  };
  // single-line JSON with no spaces, exactly like scripts/backup-postgres.sh
  return JSON.stringify(rec);
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "p997-bkp-"));
  roots.push(root);
  const dir = join(root, "postgres");
  const shim = join(root, "shim");
  mkdirSync(dir);
  mkdirSync(shim);
  const log = join(root, "sudo.log");
  writeFileSync(log, "");
  // A sudo that insists on `-n --`, logs the command, and can be told to deny.
  writeFileSync(
    join(shim, "sudo"),
    [
      "#!/usr/bin/env bash",
      'if [ "$1" != "-n" ] || [ "$2" != "--" ]; then echo "shim: sudo must be called as sudo -n --" >&2; exit 97; fi',
      "shift 2",
      'printf "%s\\n" "$*" >> "$SUDO_LOG"',
      'if [ "${SUDO_DENY:-}" = "1" ]; then echo "sudo: a password is required" >&2; exit 1; fi',
      'exec "$@"',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return { dir, shim, log };
}

function addBackup(f: Fixture, name: string, opts: { meta?: string | null; body?: Buffer; mtime?: number } = {}): Buffer {
  const body = opts.body ?? randomBytes(4096);
  const hbk = join(f.dir, name);
  writeFileSync(hbk, body);
  if (opts.meta !== null) writeFileSync(`${hbk}.meta.json`, opts.meta ?? metaFor(name, body));
  if (opts.mtime !== undefined) {
    utimesSync(hbk, opts.mtime, opts.mtime);
  }
  return body;
}

function addAdoption(f: Fixture, verified = true) {
  writeFileSync(join(f.dir, "documents-adoption.json"), JSON.stringify({ integrityVerified: verified, tables: 3 }, null, 2));
}

function runGate(f: Fixture, env: Record<string, string> = {}) {
  const script = [
    "set -euo pipefail",
    // Tool order: the shim first, then the POSIX toolset. On Windows (Git Bash)
    // /usr/bin is Git's GNU coreutils, which must win over C:\\Windows\\System32.
    'to_posix() { if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else printf "%s" "$1"; fi; }',
    'export PATH="$(to_posix "$SHIM_DIR"):/usr/bin:/bin:$PATH"',
    'export BACKUP_DIR="$(to_posix "$BACKUP_DIR_NATIVE")"',
    'export SUDO_LOG="$(to_posix "$SUDO_LOG_NATIVE")"',
    GATE,
  ].join("\n");
  const r = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      BACKUP_REQUIRED: "true",
      SHIM_DIR: f.shim,
      BACKUP_DIR_NATIVE: f.dir,
      SUDO_LOG_NATIVE: f.log,
      ...env,
    },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, sudoCalls: readFileSync(f.log, "utf8").split("\n").filter(Boolean) };
}

describe.skipIf(!BASH_AVAILABLE)("behaviour — the shipped gate, executed", () => {
  it("a complete, verified, hash-intact newest backup PASSES, and every read went through sudo -n", () => {
    const f = fixture();
    addBackup(f, "hermes_postgres_20260924_135841.hbk");
    addAdoption(f);
    const r = runGate(f);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Pre-migration evidence verified: hermes_postgres_20260924_135841.hbk complete, verified and hash-intact.");
    const verbs = r.sudoCalls.map((c) => c.split(" ")[0]);
    expect(verbs).toEqual(["find", "find", "find", "cat", "sha256sum", "find", "cat"]);
    expect(r.sudoCalls.some((c) => c.startsWith("cat -- ") && c.endsWith(".hbk.meta.json"))).toBe(true);
    expect(r.sudoCalls.some((c) => c.startsWith("sha256sum -- ") && c.endsWith(".hbk"))).toBe(true);
  });

  const refusals: [string, (f: Fixture) => void, RegExp][] = [
    ["transportSha256 does not match the artifact", (f) => {
      const body = randomBytes(64);
      addBackup(f, "b.hbk", { body, meta: metaFor("b.hbk", body, { transportSha256: "0".repeat(64) }) });
      addAdoption(f);
    }, /backup integrity check failed/],
    ["the record is not marked verified", (f) => {
      const body = randomBytes(64);
      addBackup(f, "b.hbk", { body, meta: metaFor("b.hbk", body, { verified: false }) });
      addAdoption(f);
    }, /not marked verified/],
    ["the record is not marked encrypted", (f) => {
      const body = randomBytes(64);
      addBackup(f, "b.hbk", { body, meta: metaFor("b.hbk", body, { encrypted: false }) });
      addAdoption(f);
    }, /not marked encrypted/],
    ["the record is marked partial", (f) => {
      const body = randomBytes(64);
      addBackup(f, "b.hbk", { body, meta: metaFor("b.hbk", body, { partial: true }) });
      addAdoption(f);
    }, /not marked complete/],
    ["the record carries no transport SHA-256", (f) => {
      const body = randomBytes(64);
      addBackup(f, "b.hbk", { body, meta: metaFor("b.hbk", body, { transportSha256: "not-a-hash" }) });
      addAdoption(f);
    }, /carries no transport SHA-256/],
    ["a .partial sibling exists", (f) => {
      addBackup(f, "b.hbk");
      writeFileSync(join(f.dir, "b.hbk.partial"), "x");
      addAdoption(f);
    }, /has a \.partial sibling/],
    ["the verification record is missing", (f) => {
      addBackup(f, "b.hbk", { meta: null });
      addAdoption(f);
    }, /no verification record beside/],
    ["the record names a different artifact", (f) => {
      const body = randomBytes(64);
      addBackup(f, "b.hbk", { body, meta: metaFor("other.hbk", body) });
      addAdoption(f);
    }, /does not name b\.hbk/],
    ["there is no .hbk at all", (f) => {
      addAdoption(f);
    }, /no encrypted backup \(\.hbk\) found/],
    ["the adoption evidence is missing", (f) => {
      addBackup(f, "b.hbk");
    }, /no documents_data adoption evidence/],
    ["the adoption evidence does not prove integrity", (f) => {
      addBackup(f, "b.hbk");
      addAdoption(f, false);
    }, /does not prove integrity/],
  ];

  for (const [name, setup, message] of refusals) {
    it(`REFUSES when ${name}`, () => {
      const f = fixture();
      setup(f);
      const r = runGate(f);
      expect(r.code, r.stderr).toBe(1);
      expect(r.stderr).toMatch(message);
      expect(r.stdout).not.toContain("Pre-migration evidence verified");
    });
  }

  it("checks the NEWEST backup: an older valid one cannot rescue a newer broken one", () => {
    const f = fixture();
    const now = Math.floor(Date.now() / 1000);
    addBackup(f, "old.hbk", { mtime: now - 3600 }); // valid, older
    const body = randomBytes(64);
    addBackup(f, "new.hbk", { body, meta: metaFor("new.hbk", body, { verified: false }), mtime: now }); // broken, newer
    addAdoption(f);
    const r = runGate(f);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/not marked verified/);
    expect(r.sudoCalls.some((c) => c.includes("old.hbk"))).toBe(false);
  });

  it("and the newest valid one is the one hashed when it is the newest", () => {
    const f = fixture();
    const now = Math.floor(Date.now() / 1000);
    const oldBody = randomBytes(64);
    addBackup(f, "old.hbk", { body: oldBody, meta: metaFor("old.hbk", oldBody, { verified: false }), mtime: now - 3600 });
    addBackup(f, "new.hbk", { mtime: now });
    addAdoption(f);
    const r = runGate(f);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("new.hbk");
    expect(r.sudoCalls.filter((c) => c.startsWith("sha256sum")).every((c) => c.endsWith("new.hbk"))).toBe(true);
  });

  it("a DENIED sudo refuses at the first read and can never report success", () => {
    const f = fixture();
    addBackup(f, "b.hbk");
    addAdoption(f);
    const r = runGate(f, { SUDO_DENY: "1" });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/cannot list .* through 'sudo -n'/);
    expect(r.stdout).not.toContain("verified");
    expect(r.sudoCalls).toHaveLength(1);
  });

  it.skipIf(process.platform === "win32")("a symlinked record is not accepted as the record", () => {
    const f = fixture();
    const body = randomBytes(64);
    addBackup(f, "b.hbk", { body, meta: null });
    const real = join(f.dir, "..", "elsewhere.meta.json");
    writeFileSync(real, metaFor("b.hbk", body));
    symlinkSync(real, join(f.dir, "b.hbk.meta.json"));
    addAdoption(f);
    const r = runGate(f);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/no verification record beside/);
  });

  it("with BACKUP_REQUIRED=false the gate is skipped entirely — no privileged call is made", () => {
    const f = fixture();
    const r = runGate(f, { BACKUP_REQUIRED: "false" });
    expect(r.code).toBe(0);
    expect(r.sudoCalls).toHaveLength(0);
  });
});

/* ── 3 · real permissions: root-owned 0700 directory, 0600 files ───────────── */

const REAL_SUDO =
  process.platform === "linux" &&
  typeof process.getuid === "function" &&
  process.getuid() !== 0 &&
  spawnSync("sudo", ["-n", "true"]).status === 0;

describe.skipIf(!REAL_SUDO)("real permissions — the incident, reproduced and closed (Linux + passwordless sudo)", () => {
  const privRoots: string[] = [];
  afterAll(() => {
    for (const r of privRoots) spawnSync("sudo", ["-n", "rm", "-rf", "--", r]);
  });

  function rootOwnedFixture(tamper = false) {
    const root = mkdtempSync(join(tmpdir(), "p997-root-"));
    privRoots.push(root);
    const dir = join(root, "postgres");
    mkdirSync(dir);
    const name = "hermes_postgres_20260924_135841.hbk";
    const body = randomBytes(8192);
    writeFileSync(join(dir, name), body);
    writeFileSync(join(dir, `${name}.meta.json`), metaFor(name, body, tamper ? { transportSha256: "f".repeat(64) } : {}));
    writeFileSync(join(dir, "documents-adoption.json"), JSON.stringify({ integrityVerified: true }));
    // exactly what scripts/backup-postgres.sh produces when run as root
    execFileSync("sudo", ["-n", "chown", "-R", "root:root", dir]);
    execFileSync("sudo", ["-n", "chmod", "600", join(dir, name), join(dir, `${name}.meta.json`), join(dir, "documents-adoption.json")]);
    execFileSync("sudo", ["-n", "chmod", "700", dir]);
    return { dir, name };
  }

  function runRealGate(dir: string) {
    const script = ["set -euo pipefail", GATE].join("\n");
    return spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, BACKUP_REQUIRED: "true", BACKUP_DIR: dir } });
  }

  it("the fixture reproduces the incident: an unprivileged read is denied", () => {
    const { dir, name } = rootOwnedFixture();
    expect(() => readFileSync(join(dir, `${name}.meta.json`))).toThrow(/EACCES/);
    // the pre-fix gate's exact read
    const old = spawnSync("bash", ["-c", `grep -q '"verified":true' "${join(dir, `${name}.meta.json`)}"`], { encoding: "utf8" });
    expect(old.status).not.toBe(0);
    expect(old.stderr).toMatch(/Permission denied/);
  });

  it("the gate PASSES on a root-owned 0600 verified backup, through real sudo -n", () => {
    const { dir, name } = rootOwnedFixture();
    const r = runRealGate(dir);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Pre-migration evidence verified: ${name} complete, verified and hash-intact.`);
  });

  it("a hash mismatch on the same root-owned layout still REFUSES", () => {
    const { dir } = rootOwnedFixture(true);
    const r = runRealGate(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/backup integrity check failed/);
    expect(r.stdout).not.toContain("Pre-migration evidence verified");
  });
});

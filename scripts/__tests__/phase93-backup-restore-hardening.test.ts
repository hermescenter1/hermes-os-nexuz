import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PHASE 93 — DR script hardening contract.
 *
 * Locks in two acceptance guarantees the owner requires:
 *   BACKUP_PERMISSIONS      = ENFORCED   (dumps are owner-only, never world/group readable)
 *   RESTORE_ENVIRONMENT_GUARD = FAIL_CLOSED (destructive restore refuses by default)
 *
 * Static assertions over the shell scripts so a future edit that reopens either
 * hole fails CI with a clear message.
 */

const root = process.cwd();
const backup = readFileSync(join(root, "scripts", "backup-postgres.sh"), "utf8");
const restore = readFileSync(join(root, "scripts", "restore-postgres.sh"), "utf8");
const verify = readFileSync(join(root, "scripts", "verify-backup.sh"), "utf8");

describe("BACKUP_PERMISSIONS = ENFORCED (backup-postgres.sh)", () => {
  it("sets a restrictive umask so created artifacts are owner-only", () => {
    expect(backup).toMatch(/^\s*umask\s+077\s*$/m);
  });
  it("hardens the backup directory to 0700", () => {
    expect(backup).toMatch(/chmod\s+700\s+"\$\{BACKUP_DIR\}"/);
  });
  it("hardens the dump file to 0600", () => {
    expect(backup).toMatch(/chmod\s+600\s+"\$\{BACKUP_FILE\}"/);
  });
});

describe("RESTORE_ENVIRONMENT_GUARD = FAIL_CLOSED (restore-postgres.sh)", () => {
  it("requires an explicit, target-specific confirmation phrase", () => {
    expect(restore).toContain('REQUIRED_CONFIRM="restore ${DB_NAME}"');
  });
  it("supports a non-interactive RESTORE_CONFIRM that must match exactly", () => {
    expect(restore).toMatch(/RESTORE_CONFIRM/);
    expect(restore).toMatch(/!=\s*"\$\{REQUIRED_CONFIRM\}"/);
  });
  it("refuses (non-zero exit) when unconfirmed and non-interactive — fail-closed", () => {
    expect(restore).toMatch(/exit 3/);
    expect(restore.toLowerCase()).toContain("fail-closed");
  });
  it("no longer relies on the fail-OPEN passive countdown", () => {
    // The old behaviour proceeded unless a human hit Ctrl+C in 10s.
    expect(restore).not.toMatch(/Press Ctrl\+C within 10 seconds/);
    expect(restore).not.toMatch(/^\s*sleep 10\s*$/m);
  });
});

describe("PHASE 93.1 — backup verification is actually invoked & correct", () => {
  it("detects the verifier by EXISTENCE, not the executable bit", () => {
    // The 0644 verify-backup.sh was silently skipped by an `-x` test.
    expect(backup).toMatch(/\[\[\s*-f\s+"\$\{SCRIPT_DIR\}\/verify-backup\.sh"\s*\]\]/);
    expect(backup).not.toMatch(/\[\[\s*-x\s+"\$\{SCRIPT_DIR\}\/verify-backup\.sh"\s*\]\]/);
  });

  it("invokes the verifier explicitly through bash (independent of +x mode)", () => {
    expect(backup).toMatch(/bash\s+"\$\{SCRIPT_DIR\}\/verify-backup\.sh"/);
  });

  it("verify-backup.sh lists the dump from STDIN (no trailing '-' filename)", () => {
    // The bug: `pg_restore --list -U "${DB_USER}" -` — the trailing "-" is read
    // as an input filename ("could not open input file \"-\"").
    expect(verify).toMatch(/pg_restore --list\s*<\s*"\$\{BACKUP_FILE\}"/);
    expect(verify).not.toMatch(/pg_restore --list[^\n]*\s-\s*<\s*"\$\{BACKUP_FILE\}"/);
    expect(verify).not.toMatch(/pg_restore --list\s+-U\b/); // listing needs no DB user
  });

  it("verify-backup.sh preserves essential-table checks and .last-verification.json", () => {
    for (const t of ["Organization", "User", "IndustrialSite", "IndustrialAsset"]) {
      expect(verify).toContain(t);
    }
    expect(verify).toMatch(/TABLE DATA/);
    expect(verify).toContain(".last-verification.json");
    expect(verify).toMatch(/write_result "verified"/);
    expect(verify).toMatch(/write_result "failed"/);
  });
});

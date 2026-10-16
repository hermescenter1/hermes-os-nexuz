/**
 * DA-1 — the release gate checks the backup's AGE, and the schedule exists.
 *
 * WHAT HAPPENED. On 2026-10-14 a release was allowed against an encrypted
 * backup 89.8 hours old, against a documented 24 h RPO. The gate's four
 * checks — verified, complete, encrypted, hash-intact — are every one about
 * INTEGRITY. None looks at time, so an intact artefact from last month would
 * have passed in exactly the same way.
 *
 * AND WHY IT WAS STALE, corrected on 2026-10-15 against real evidence: the
 * backups were running. The local backup and `hermes-dr-backup.service` were
 * both current and both PASS. What was not running was the mechanism that
 * produces the artefact the RELEASE CONTRACT accepts — `.hbk` in
 * /backups/postgres, written only by `scripts/backup-postgres.sh`. The DR
 * runbook has always said that cadence is "owner-activated host cron", and
 * the repository shipped nothing to activate.
 *
 * Both halves are checked here, because either one alone leaves the hole:
 * a gate that checks age cannot help if nothing produces a fresh artefact,
 * and a schedule cannot help if the gate accepts a stale one anyway.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/**
 * The workflow is stored CRLF. Line endings are stripped rather than matched,
 * so a checkout-normalisation change cannot silently turn these assertions
 * into assertions about nothing.
 */
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const BLANK_LINE = LF + LF;
const deploy = readFileSync(".github/workflows/deploy.yml", "utf8").split(CR).join("");
/**
 * The gate is delimited in the workflow by its own markers. Slicing to some
 * other step's name is how a first cut of this test ended up with an EMPTY
 * string and seven assertions failing against nothing.
 */
const GATE_START = "# >>> backup-evidence-gate";
const GATE_END = "# <<< backup-evidence-gate";
const gate = (() => {
  const from = deploy.indexOf(GATE_START);
  const to = deploy.indexOf(GATE_END);
  if (from === -1 || to === -1 || to <= from) throw new Error("the backup-evidence-gate markers are missing");
  return deploy.slice(from, to);
})();

describe("DA-1 — the gate refuses a stale backup", () => {
  it("delegates the judgement to the script its own test drives", () => {
    // One implementation. The behaviour — the boundary, a future mtime, a
    // mismatched record, every bad limit — is proven against real files in
    // check-backup-freshness.test.ts, which a source-level test cannot do.
    expect(gate).toContain("bash scripts/deploy/check-backup-freshness.sh");
  });

  it("hands the script the artifact, its mtime, the computed hash and the record", () => {
    expect(gate).toContain("NEWEST_MTIME");
    expect(gate).toMatch(/"\$\{NEWEST_NAME\}" "\$\{NEWEST_MTIME\}" "\$\{ACTUAL_SHA\}" -/);
  });

  it("pipes the record in rather than writing a copy it would have to delete", () => {
    // phase997-backup-evidence-sudo forbids this gate from creating, copying
    // or removing anything — it is a READER. A mktemp plus a delete would have
    // traded that invariant for one pipe, so the record the workflow already
    // read goes in on stdin and the script takes `-`.
    expect(gate).toMatch(/printf '%s' "\$\{META_JSON\}"\s*\\?\s*\n?\s*\| bash scripts\/deploy\/check-backup-freshness\.sh/);
    expect(gate).not.toMatch(/\bmktemp\b/);
    expect(gate).not.toMatch(/\brm\b/);
  });

  it("keeps the limit at the documented default", () => {
    // 30 h = the 24 h RPO plus one backup interval, so ONE missed run stops
    // the next release instead of silently widening the restore window.
    expect(gate).toContain("BACKUP_MAX_AGE_HOURS:-30");
  });

  it("refuses the release when the check fails, rather than warning", () => {
    const call = gate.slice(gate.indexOf("check-backup-freshness.sh"));
    const blankLine = call.indexOf(BLANK_LINE);
    expect(blankLine).toBeGreaterThan(0);
    expect(call.slice(0, blankLine)).toContain("backup_refuse");
  });

  it("keeps the integrity checks it already had", () => {
    // The freshness check is additive. Losing any of these would trade one
    // hole for another.
    for (const needle of ['"verified":true', '"partial":false', '"encrypted":true', "transportSha256"]) {
      expect(gate, needle).toContain(needle);
    }
  });

  it("does the privileged reads itself and passes values down", () => {
    // The script must never need sudo: the artifact and its record are
    // root-owned, and widening the deploy user's rules to let a script read
    // them would be a bigger change than the finding.
    // Comments are stripped first: the script's header EXPLAINS the caller's
    // sudo rules, which is the opposite of using them.
    const script = readFileSync("scripts/deploy/check-backup-freshness.sh", "utf8");
    const effective = script
      .split(LF)
      .filter(line => !line.trimStart().startsWith("#"))
      .join(LF);
    expect(effective).not.toContain("sudo");
    expect(gate).toContain("backup_priv cat");
  });
});

describe("DA-1 — backup evidence is required by EVERY production release", () => {
  /** The whole deploy job, so step order can be read off it. */
  const job = deploy;

  it("carries a concept of its own, separate from the migration delta", () => {
    // BACKUP_REQUIRED answers "does this release carry a migration" and must
    // keep answering only that. Overloading it would have made the migration
    // classification lie.
    expect(job).toContain('RELEASE_BACKUP_EVIDENCE_REQUIRED: "true"');
    expect(job).toContain("BACKUP_REQUIRED: ${{ steps.migration.outputs.pre_migration_backup_required }}");
  });

  it("sets it as a literal, not from a classification output or a dispatch input", () => {
    // An expression could evaluate to false. A literal cannot.
    const line = job.split(LF).find(l => l.includes("RELEASE_BACKUP_EVIDENCE_REQUIRED:")) ?? "";
    expect(line).not.toContain("${{");
    expect(line).not.toContain("inputs.");
    expect(line).not.toContain("steps.");
  });

  it("refuses rather than skips when the flag is not exactly true", () => {
    // The behaviour is proven against the executed gate in
    // phase997-backup-evidence-sudo; what is pinned here is the SHAPE: a
    // refusal, not a condition that silently does nothing.
    expect(gate).toMatch(/case "\$\{RELEASE_BACKUP_EVIDENCE_REQUIRED:-\}" in/);
    expect(gate).toContain("mandatory for every production release");
    // The refusal is the FIRST thing in the gate, and what follows it is
    // unconditional. `BACKUP_REQUIRED` still appears further down — it guards
    // the adoption evidence — so what matters is that it no longer gates the
    // artifact checks.
    const head = gate.slice(0, gate.indexOf("BACKUP_DIR="));
    expect(head).toContain("RELEASE_BACKUP_EVIDENCE_REQUIRED");
    expect(head).toContain("if true; then");
    expect(head).not.toContain("BACKUP_REQUIRED");
  });

  it("keeps documents_data adoption tied to the migration delta", () => {
    // Adoption evidence is about a cutover. Demanding it from a release that
    // cuts nothing over would invent a requirement rather than enforce one.
    const adoption = gate.slice(gate.indexOf("ADOPTION_FOUND"));
    expect(gate.slice(0, gate.indexOf("ADOPTION_FOUND"))).toContain('if [ "${BACKUP_REQUIRED}" = "true" ]; then');
    expect(adoption).toContain("integrityVerified");
  });

  it("evaluates the evidence BEFORE anything on the host is changed", () => {
    // The artifact lives on the production host, so the gate necessarily runs
    // inside the deploy step's remote script — it cannot precede the SSH key
    // that lets it read the host at all. What it CAN precede, and does, is
    // every mutating command: the first of them is the previous-good tag.
    // Scoped to the remote script: `up -d` also appears in a comment near the
    // top of the file, and an index search over the whole workflow would be
    // comparing against that instead.
    const remote = job.slice(job.indexOf("<<'REMOTE'"));
    const gateEnd = remote.indexOf("# <<< backup-evidence-gate");
    expect(gateEnd).toBeGreaterThan(0);
    for (const mutation of [
      "docker image tag",
      "Preserve the previous-good image",
      "up -d",
      "--profile migrate run",
    ]) {
      const at = remote.indexOf(mutation);
      expect(at, `${mutation} must appear in the remote script`).toBeGreaterThan(-1);
      expect(at, `${mutation} must come after the evidence gate`).toBeGreaterThan(gateEnd);
    }
  });

  it("still refuses a migration-bearing release whose prerequisites are unset", () => {
    // The pre-existing contract is untouched: this check runs on the runner,
    // before the host is contacted at all.
    const step = job.slice(job.indexOf("Require migration prerequisites"));
    expect(step).toContain('if [ "$BACKUP_REQUIRED" != "true" ]; then');
    expect(step).toContain("Refusing: this release carries migrations.");
    expect(step).toContain("migration-prerequisites-verified");
    expect(job.indexOf("Require migration prerequisites")).toBeLessThan(job.indexOf("Install SSH key"));
  });
});

describe("DA-1 — a schedule exists to activate", () => {
  const unit = "ops/backup/hermes-pg-backup.service";
  const timer = "ops/backup/hermes-pg-backup.timer";
  const readme = "ops/backup/README.md";

  it("ships the service and timer the repository previously did not", () => {
    for (const f of [unit, timer, readme]) expect(existsSync(f), f).toBe(true);
  });

  it("runs the one script that produces the artifact the gate accepts", () => {
    const src = readFileSync(unit, "utf8");
    expect(src).toContain("scripts/backup-postgres.sh");
  });

  it("does not bake the key material into the repository", () => {
    // The unit names the two REQUIRED variables and refuses to default them;
    // their values belong in an owner-created drop-in, and the key itself is
    // only ever read from a file.
    const src = readFileSync(unit, "utf8");
    expect(src).toContain("HERMES_BACKUP_KEY_FILE");
    expect(src).toContain("HERMES_BACKUP_KEY_ID");
    // Comments are stripped first: the unit SHOWS the drop-in an operator must
    // write, which is not the same as setting the values itself.
    const effective = src
      .split("\n")
      .filter(line => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(effective).not.toMatch(/Environment=HERMES_BACKUP_KEY_(FILE|ID)=\S/);
  });

  it("runs at a cadence the gate's limit can actually be met by", () => {
    const src = readFileSync(timer, "utf8");
    expect(src).toMatch(/OnCalendar=\*-\*-\* \d{2}:\d{2}:\d{2}/);
    // A missed day must be caught up, not skipped: a skipped day is exactly
    // the state that let a five-day-old artifact become the newest one.
    expect(src).toContain("Persistent=true");
  });

  it("says plainly that the DR service is not a substitute", () => {
    // The correction that mattered: DR snapshots were healthy the whole time.
    // Healthy DR says nothing about the artefact the release contract reads,
    // and swapping the gate's source would need its own equivalence evidence.
    const src = readFileSync(readme, "utf8");
    expect(src).toContain("hermes-dr-backup.service");
    expect(src).toContain("not** a substitute");
    expect(src).toContain("coverage, encryption, integrity");
  });

  it("forbids the two shortcuts that would fake a passing gate", () => {
    const src = readFileSync(readme, "utf8");
    expect(src).toContain("Do not rename a plaintext dump");
    expect(src).toContain("Do not hand-write a `.meta.json`");
  });
});

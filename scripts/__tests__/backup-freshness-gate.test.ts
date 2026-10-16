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

  /**
   * ORDERING. The remote script is the only place that touches the host, so
   * the whole question is what sits on each side of the gate's closing marker.
   *
   * An earlier version of this test said the gate precedes "anything on the
   * host being changed". That was WRONG, and a full inventory of the remote
   * script is what showed it: `git fetch --prune origin` runs BEFORE the gate.
   * It is a persistent write — new objects, moved remote-tracking refs — even
   * though it changes no service, no image and no data. The claim is narrowed
   * to what is true, and the exception is pinned by name below rather than
   * left for the next reader to discover.
   */
  const remote = job.slice(job.indexOf("<<'REMOTE'"));
  const gateEnd = remote.indexOf("# <<< backup-evidence-gate");
  const gateStart = remote.indexOf("# >>> backup-evidence-gate");

  it("has a gate with both markers in the remote script", () => {
    expect(gateStart).toBeGreaterThan(0);
    expect(gateEnd).toBeGreaterThan(gateStart);
  });

  it.each([
    ["the working tree is moved", "git checkout --detach"],
    ["the previous-good image is tagged", "docker image tag"],
    ["the previous-good image is preserved", "Preserve the previous-good image"],
    ["the web image is built", "build hermes-web"],
    ["the migrator image is built", "--profile migrate build"],
    ["migrations are applied", "--profile migrate run"],
    ["the service is replaced", "up -d"],
  ])("%s only AFTER the gate has passed", (_label, needle) => {
    const at = remote.indexOf(needle);
    expect(at, `${needle} must appear in the remote script`).toBeGreaterThan(-1);
    expect(at, `${needle} must come after the evidence gate`).toBeGreaterThan(gateEnd);
  });

  it("performs no history rewrite on the host at all", () => {
    // `git reset` and `git switch` are not used anywhere in the remote script,
    // so there is no third ordering case hiding behind a synonym.
    expect(remote).not.toMatch(/\bgit reset\b/);
    expect(remote).not.toMatch(/\bgit switch\b/);
    expect(remote).not.toMatch(/\bgit clean\b/);
    expect(remote).not.toMatch(/\bgit pull\b/);
  });

  it("writes no file on the host outside the gate", () => {
    // No cp, mv, tee, install, chmod, chown, rm, ln, mkdir, touch or in-place
    // sed anywhere in the remote script — so "mutation" really is only the
    // git, docker and migrator operations enumerated above.
    const lines = remote.split(LF).filter(l => !l.trimStart().startsWith("#"));
    for (const verb of ["cp ", "mv ", "tee ", "install ", "chmod ", "chown ", "rm ", "ln ", "mkdir ", "touch ", "sed -i"]) {
      const hit = lines.find(l => new RegExp(`(^|[;&|]\\s*|\\s)${verb.trim()}\\s`).test(l));
      expect(hit, `unexpected host write via \`${verb.trim()}\`: ${hit}`).toBeUndefined();
    }
  });

  it("names the ONE persistent operation that precedes the gate, rather than hiding it", () => {
    // `git fetch --prune origin` runs first so the target SHA can be proven to
    // exist on origin/main before anything else is attempted. It writes to the
    // host's object store and moves remote-tracking refs: persistent, but it
    // changes no service, no image, no container and no data, and the working
    // tree it leaves behind is the one already deployed.
    //
    // This test exists so that fact stays stated. If the fetch is ever moved
    // after the gate, DELETE this test — do not weaken it.
    const fetchAt = remote.indexOf("git fetch --prune origin");
    expect(fetchAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeLessThan(gateStart);
    expect(deploy).toContain("the ONE persistent host operation that precedes");
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

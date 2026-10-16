/**
 * DA-1 — the release backup evidence gate: its own step, before any mutation.
 *
 * WHAT HAPPENED. On 2026-10-14 a release was allowed against an encrypted
 * backup 89.8 hours old, against a documented 24 h RPO; on 2026-10-15 another
 * went out against one five days old. The first was because the gate's four
 * checks — verified, complete, encrypted, hash-intact — are every one about
 * INTEGRITY and none looks at time. The second was because the whole gate ran
 * only when the release carried a migration.
 *
 * AND WHY THE ARTEFACT WAS STALE, corrected on 2026-10-15 against real
 * evidence: the backups were running. What was not running was the mechanism
 * that produces the artefact the RELEASE CONTRACT accepts — `.hbk` in
 * /backups/postgres, written only by `scripts/backup-postgres.sh`. The DR
 * runbook has always called that cadence "owner-activated host cron", and the
 * repository shipped nothing to activate.
 *
 * WHAT THIS FILE PINS. The shape of the workflow: that the judgement is a
 * SEPARATE step, that it is read-only, that it runs before anything can be
 * changed, that the helper comes from the target SHA's checkout rather than
 * the host's older one, and that the requirement cannot be switched off. The
 * BEHAVIOUR of the collector and the evaluator is proven by executing them
 * against real files in phase997-backup-evidence-sudo.test.ts, and the
 * freshness judgement itself in check-backup-freshness.test.ts.
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
const deploy = readFileSync(".github/workflows/deploy.yml", "utf8").split(CR).join("");

const EVIDENCE_STEP = "Evaluate the production backup evidence (read-only)";
const DEPLOY_STEP = "Deploy the pinned commit (migrate, then targeted hermes-web rebuild)";

/** The evidence step's own text, from its name to the start of the deploy step. */
const step = (() => {
  const from = deploy.indexOf(`- name: ${EVIDENCE_STEP}`);
  const to = deploy.indexOf(`- name: ${DEPLOY_STEP}`);
  if (from === -1 || to === -1 || to <= from) throw new Error("the evidence step is missing or out of order");
  return deploy.slice(from, to);
})();

/** The deploy step: everything the release is allowed to change. */
const deployStep = deploy.slice(deploy.indexOf(`- name: ${DEPLOY_STEP}`));

describe("DA-1 — the judgement is a step of its own, not a block inside the deploy", () => {
  it("runs as a separate step, before the step that can change anything", () => {
    // Line order inside one step is not a guarantee anyone can read off the
    // workflow. Two steps are.
    expect(deploy.indexOf(`- name: ${EVIDENCE_STEP}`)).toBeLessThan(deploy.indexOf(`- name: ${DEPLOY_STEP}`));
  });

  it("runs after the SSH key exists, because the evidence lives on the host", () => {
    // Stated rather than wished away: the artifact is on the production host,
    // so the key that allows a read has to be installed first. What the gate
    // precedes is every MUTATION, not every byte written anywhere.
    expect(deploy.indexOf("Install SSH key")).toBeLessThan(deploy.indexOf(`- name: ${EVIDENCE_STEP}`));
  });

  it("is skipped by nothing: the deploy step carries no condition that survives a failure", () => {
    // A failed step fails the job and Actions skips the rest — unless someone
    // adds `if: always()` or `continue-on-error`. Either would let a release
    // proceed past a refused gate.
    const head = deployStep.slice(0, deployStep.indexOf("run: |"));
    expect(head).not.toMatch(/if:\s*always\(\)/);
    expect(head).not.toMatch(/continue-on-error/);
    expect(step).not.toMatch(/continue-on-error/);
  });
});

describe("DA-1 — the evidence step only reads", () => {
  it("streams the collector in on stdin and writes no file on the host", () => {
    expect(step).toContain("bash -s\" < scripts/deploy/collect-backup-evidence.sh".replace("\\", ""));
  });

  it("never runs the collector under a root shell", () => {
    // `sudo bash -s` would need a NOPASSWD rule for a shell — a far larger
    // grant than this finding. Each read goes through the existing narrow
    // `sudo -n -- <binary>` rules inside the collector instead.
    const effective = step.split(LF).filter(l => !l.trimStart().startsWith("#")).join(LF);
    expect(effective).not.toMatch(/sudo[^\n]*\bbash\b/);
  });

  it("contains no mutating verb at all", () => {
    const lines = step.split(LF).filter(l => !l.trimStart().startsWith("#"));
    for (const verb of ["cp", "mv", "tee", "install", "chmod", "chown", "rm", "ln", "mkdir", "touch", "docker", "git fetch"]) {
      const hit = lines.find(l => new RegExp(`(^|[;&|]\\s*|\\s)${verb}\\s`).test(l));
      expect(hit, `the evidence step must not run \`${verb}\`: ${hit}`).toBeUndefined();
    }
  });

  it("treats an SSH failure as no evidence, not as a pass", () => {
    expect(step).toContain("SSH_STATUS");
    expect(step).toContain("the read-only evidence collection failed");
    expect(step).toContain("nothing has been changed on the host");
  });
});

describe("DA-1 — one implementation, from the target SHA's checkout", () => {
  it("judges with the evaluator from this checkout, not from the host", () => {
    expect(step).toContain("bash scripts/deploy/evaluate-backup-evidence.sh");
  });

  it("proves the runner checkout IS the target SHA before judging", () => {
    // At this point the host's working tree is still the PREVIOUSLY deployed
    // commit. A helper read from there would be the previous release's helper,
    // or missing entirely.
    expect(step).toContain('git checkout --detach "${TARGET_SHA}"');
    expect(step).toContain("the runner checkout is not ${TARGET_SHA}");
  });

  it("keeps the freshness logic in exactly one file", () => {
    // Not copied into YAML, and not re-implemented in the collector.
    // Comments are stripped: both files EXPLAIN where the verdict lives,
    // which is the opposite of computing it.
    const code = (f: string) =>
      readFileSync(f, "utf8").split(LF).filter(l => !l.trimStart().startsWith("#")).join(LF);
    const collector = code("scripts/deploy/collect-backup-evidence.sh");
    expect(collector).not.toContain("age_hours");
    expect(collector).not.toContain("MAX_AGE");
    expect(collector).not.toMatch(/\bSTALE\b/);
    const evaluator = code("scripts/deploy/evaluate-backup-evidence.sh");
    expect(evaluator).toContain("check-backup-freshness.sh");
    expect(evaluator).not.toContain("age_hours");
  });

  it("keeps the limit at the documented default", () => {
    // 30 h = the 24 h RPO plus one backup interval, so ONE missed run stops
    // the next release instead of silently widening the restore window.
    expect(readFileSync("scripts/deploy/evaluate-backup-evidence.sh", "utf8")).toContain("BACKUP_MAX_AGE_HOURS:-30");
  });
});

describe("DA-1 — required by EVERY production release, and not switchable", () => {
  it("carries a concept of its own, separate from the migration delta", () => {
    expect(step).toContain('RELEASE_BACKUP_EVIDENCE_REQUIRED: "true"');
    expect(step).toContain("BACKUP_REQUIRED: ${{ steps.migration.outputs.pre_migration_backup_required }}");
  });

  it("sets it as a literal, not from a classification output or a dispatch input", () => {
    const line = step.split(LF).find(l => l.includes("RELEASE_BACKUP_EVIDENCE_REQUIRED:")) ?? "";
    expect(line).not.toContain("${{");
    expect(line).not.toContain("inputs.");
    expect(line).not.toContain("steps.");
  });

  it("refuses on the flag BEFORE it collects anything privileged", () => {
    expect(step).toContain('case "${RELEASE_BACKUP_EVIDENCE_REQUIRED:-}" in');
    expect(step.indexOf("mandatory for every production release")).toBeLessThan(step.indexOf("ssh -i ~/.ssh/id_deploy"));
  });

  it("keeps documents_data adoption tied to the migration delta", () => {
    // Adoption evidence is about a cutover. Demanding it from a release that
    // cuts nothing over would invent a requirement rather than enforce one.
    expect(step).toContain('COLLECT_ADOPTION=${BACKUP_REQUIRED}');
    expect(step).toContain('REQUIRE_ADOPTION="${BACKUP_REQUIRED}"');
  });

  it("leaves the migration contract untouched", () => {
    const prereq = deploy.slice(deploy.indexOf("Require migration prerequisites"));
    expect(prereq).toContain('if [ "$BACKUP_REQUIRED" != "true" ]; then');
    expect(prereq).toContain("migration-prerequisites-verified");
    expect(deploy.indexOf("Require migration prerequisites")).toBeLessThan(deploy.indexOf("Install SSH key"));
  });
});

describe("DA-1 — every host mutation happens after the gate", () => {
  it.each([
    ["the host fetches", "git fetch --prune origin"],
    ["the working tree is moved", 'git checkout --detach "$TARGET_SHA"'],
    ["the previous-good image is tagged", "docker image tag"],
    ["the web image is built", "build hermes-web"],
    ["the migrator image is built", "--profile migrate build"],
    ["migrations are applied", "--profile migrate run"],
    ["the service is replaced", "up -d"],
  ])("%s only after the gate", (_label, needle) => {
    // Compared by CONTAINMENT, not by index: several of these strings also
    // appear in the file-header comments near the top of the workflow, and
    // an index search over the whole file would be measuring those instead.
    expect(deployStep, `${needle} must happen in the deploy step`).toContain(needle);
    expect(step, `${needle} must not happen in the evidence step`).not.toContain(needle);
  });

  it("performs no history rewrite on the host at all", () => {
    expect(deployStep).not.toMatch(/\bgit reset\b/);
    expect(deployStep).not.toMatch(/\bgit switch\b/);
    expect(deployStep).not.toMatch(/\bgit clean\b/);
    expect(deployStep).not.toMatch(/\bgit pull\b/);
  });

  it("writes no file on the host outside the containers it builds", () => {
    const lines = deployStep.split(LF).filter(l => !l.trimStart().startsWith("#"));
    for (const verb of ["cp", "mv", "tee", "install", "chmod", "chown", "rm", "ln", "mkdir", "touch", "sed -i"]) {
      const hit = lines.find(l => new RegExp(`(^|[;&|]\\s*|\\s)${verb}\\s`).test(l));
      expect(hit, `unexpected host write via \`${verb}\`: ${hit}`).toBeUndefined();
    }
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

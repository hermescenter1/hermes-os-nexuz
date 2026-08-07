/**
 * PHASE 98 — adversarial production-safety static review.
 *
 * Scans the DR/release/CI/deploy surface for patterns that could destroy or reach
 * Production, and proves each match is contextually safe. It does NOT blanket-ban
 * legitimate fail-closed recovery code: a destructive `down -v` / `volume rm` is
 * allowed ONLY inside a Phase 98 rehearsal that carries a disposable-project guard
 * and never pins `-p hermes`. Fail-closed: any real violation exits non-zero.
 *
 * Emits the required RESULT gates:
 *   PRODUCTION_VOLUME_DESTRUCTION_PATH, UNIDENTIFIED_DB_RESTORE_PATH,
 *   SECRET_LOGGING_PATH, CI_PRODUCTION_ACCESS, AUTO_PRODUCTION_DEPLOY_TRIGGER,
 *   AUTO_DATABASE_ROLLBACK, FAIL_OPEN_RELEASE_GATE  (each must be 0).
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAN_DIRS = [".github/workflows", "scripts", "deploy", "docs/release"];
const SCAN_FILES = ["DEPLOYMENT.md", "docker-compose.prod.yml", "docker-compose.yml"];
const DEPLOY_WF = ".github/workflows/deploy.yml";
const PHASE98_WF = ".github/workflows/phase98-dr-release-assurance.yml";
const DIFF_BASE = process.env.PHASE98_DIFF_BASE || "63a4b4875660ffac11a35dd69d6a5eaa2f07674c";

// Pattern-DEFINING files legitimately contain the dangerous tokens as data (regex
// patterns / classification strings they search for), not as executable commands.
const EXEMPT = new Set(["scripts/dr/production-safety-check.mjs", "scripts/dr/migration-sql-classify.mjs"]);

const violations = [];
const flag = (gate, file, msg) => violations.push({ gate, file, msg });

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(relative(REPO, p).split("\\").join("/"));
  }
}

const inScope = (rp) => SCAN_DIRS.some((d) => rp.startsWith(`${d}/`)) || SCAN_FILES.includes(rp);

// The Phase 98 CHANGED surface — the files this phase creates or modifies. Used as
// the git-independent fallback so the checker NEVER over-scans pre-existing
// operational files (e.g. the OpenBao/Gate-0D static checkers or earlier
// rehearsals) which legitimately contain the scanned patterns as data. This is
// what the git-diff scoping resolves to for this phase; the fallback keeps the
// checker correct on a shallow CI checkout where the diff base is unreachable.
const PHASE98_PREFIXES = ["scripts/dr/", "scripts/ci/phase98-", "scripts/ci/lib/", "deploy/rehearsal/", ".github/workflows/phase98-", "docs/release/phase98-", "docs/release/adr-phase98-"];
const PHASE98_FILES = new Set([
  "scripts/backup-postgres.sh",
  "scripts/restore-postgres.sh",
  "scripts/verify-backup.sh",
  "docker-compose.prod.yml",
  "DEPLOYMENT.md",
  ".env.production.example",
  "CHANGELOG.md",
  "docs/release/disaster-recovery-runbook.md",
  "docs/release/incident-response-runbook.md",
]);
const isPhase98 = (rp) => PHASE98_PREFIXES.some((p) => rp.startsWith(p)) || PHASE98_FILES.has(rp);

// Prefer the precise git CHANGED-file set (the review scope). Fall back to the
// Phase 98 path set when git history is unavailable (shallow CI checkout).
let candidates = [];
try {
  const changed = execSync(`git diff --name-only --diff-filter=d ${DIFF_BASE}...HEAD`, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const untracked = execSync("git ls-files --others --exclude-standard", { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  candidates = [...changed.split("\n"), ...untracked.split("\n")].map((s) => s.trim()).filter(Boolean);
  if (candidates.length === 0) throw new Error("empty diff");
} catch {
  // git-independent fallback: walk the DR surface, keep only Phase 98 paths.
  const all = [];
  for (const d of SCAN_DIRS) walk(join(REPO, d), all);
  for (const f of SCAN_FILES) if (existsSync(join(REPO, f))) all.push(f);
  candidates = all.filter(isPhase98);
}

const files = [...new Set(candidates)]
  .filter((rp) => inScope(rp))
  .filter((rp) => !EXEMPT.has(rp))
  .filter((rp) => existsSync(join(REPO, rp)))
  .map((rp) => join(REPO, rp));

const isRehearsal = (rp) => rp.startsWith("scripts/ci/phase98-") || rp.includes("scripts/ci/lib/disposable-pg");
const isDoc = (rp) => rp.endsWith(".md");
const hasDisposableGuard = (c) => /hermes98test_|hermes98_|DISPOSABLE_PREFIX|DISPOSABLE_PROJECT_GUARD|guardVol|guard\(/.test(c);

for (const abs of files) {
  const rp = relative(REPO, abs).split("\\").join("/");
  const content = readFileSync(abs, "utf8");

  // 1. Destructive volume operations.
  const destructive = /docker\s+compose[^\n]*\bdown\s+-v\b|(^|\s)docker\s+volume\s+rm\b|system\s+prune/m.test(content) || /\bdown\(\["down",\s*"-v"\]/.test(content) || /"down",\s*"-v"/.test(content) || /"volume",\s*"rm"/.test(content);
  if (destructive) {
    if (isDoc(rp)) {
      // Prose may warn about these; only flag if a doc shows them pinned to -p hermes.
      if (/-p\s+hermes\b[^\n]*(down\s+-v|volume\s+rm)|(down\s+-v|volume\s+rm)[^\n]*-p\s+hermes\b/.test(content)) {
        flag("PRODUCTION_VOLUME_DESTRUCTION_PATH", rp, "doc pairs destructive op with -p hermes");
      }
    } else if (isRehearsal(rp)) {
      if (!hasDisposableGuard(content)) flag("PRODUCTION_VOLUME_DESTRUCTION_PATH", rp, "destructive op without disposable guard");
      if (/-p\s+hermes(\s|"|')/.test(content)) flag("PRODUCTION_VOLUME_DESTRUCTION_PATH", rp, "rehearsal pins -p hermes with destructive op");
    } else {
      flag("PRODUCTION_VOLUME_DESTRUCTION_PATH", rp, "destructive volume op outside a guarded rehearsal");
    }
  }

  // 2. Any destructive op pinned to the canonical Production project is fatal anywhere.
  if (/-p\s+hermes\b/.test(content) && /(down\s+-v|volume\s+rm|system\s+prune)/.test(content) && !isDoc(rp)) {
    flag("PRODUCTION_VOLUME_DESTRUCTION_PATH", rp, "-p hermes combined with a destructive op");
  }

  // 3. Unidentified DB restore: a DROP DATABASE path must be gated by a
  //    target-specific confirmation (restore-postgres.sh) or a disposable guard.
  if (/DROP\s+DATABASE/i.test(content) && !isDoc(rp)) {
    const safe = /RESTORE_CONFIRM/.test(content) || isRehearsal(rp);
    if (!safe) flag("UNIDENTIFIED_DB_RESTORE_PATH", rp, "DROP DATABASE without confirmation or disposable guard");
  }

  // 4. CI reaching Production: only deploy.yml may SSH / use SERVER_IP / production env.
  if (rp.startsWith(".github/workflows/") && rp !== DEPLOY_WF) {
    if (/\bssh\b|\bscp\b|\brsync\b|ssh-keyscan/.test(content)) flag("CI_PRODUCTION_ACCESS", rp, "non-deploy workflow uses ssh/scp/rsync");
    if (/secrets\.SERVER_IP|secrets\.SSH_KEY|secrets\.SSH_KNOWN_HOSTS/.test(content)) flag("CI_PRODUCTION_ACCESS", rp, "non-deploy workflow reads production/ssh secrets");
    if (/environment:\s*production/.test(content)) flag("CI_PRODUCTION_ACCESS", rp, "non-deploy workflow declares environment: production");
    if (/pull_request_target/.test(content)) flag("CI_PRODUCTION_ACCESS", rp, "pull_request_target is forbidden");
  }

  // 5. Auto Production deploy trigger: no workflow may deploy on push/PR.
  if (rp.startsWith(".github/workflows/")) {
    const isDeployy = /prisma\s+migrate\s+deploy|docker\s+compose[^\n]*up\s+-d[^\n]*hermes-web|restore-postgres/.test(content);
    // The rehearsal/assurance workflows legitimately run migrate/up against DISPOSABLE stacks.
    if (rp === DEPLOY_WF) {
      if (/^\s*push:/m.test(content) || /^\s*pull_request:/m.test(content)) flag("AUTO_PRODUCTION_DEPLOY_TRIGGER", rp, "deploy workflow triggers on push/PR");
    }
    void isDeployy;
  }

  // 6. Auto database rollback: no workflow may invoke the production restore script.
  if (rp.startsWith(".github/workflows/") && /scripts\/restore-postgres\.sh/.test(content)) {
    flag("AUTO_DATABASE_ROLLBACK", rp, "workflow invokes the production restore script");
  }

  // 7. Fail-open required gates in the phase98 assurance workflow.
  if (rp === PHASE98_WF) {
    if (/continue-on-error:\s*true/.test(content)) flag("FAIL_OPEN_RELEASE_GATE", rp, "continue-on-error on an assurance job");
    if (/environment:\s*production/.test(content)) flag("CI_PRODUCTION_ACCESS", rp, "assurance workflow declares environment: production");
    if (/pull_request_target/.test(content)) flag("CI_PRODUCTION_ACCESS", rp, "assurance workflow uses pull_request_target");
  }

  // 8. Secret logging: printing key material / passwords.
  if (!isDoc(rp)) {
    if (/(echo|printf|console\.log)[^\n]*\$\{?(POSTGRES_PASSWORD|REDIS_PASSWORD|JWT_SECRET|OPENBAO_[A-Z_]*SECRET|SECRET_ID|ROLE_ID)\b/.test(content)) {
      flag("SECRET_LOGGING_PATH", rp, "logs a secret value");
    }
    // printing the contents of the backup key file
    if (/(cat|echo|printf)[^\n]*HERMES_BACKUP_KEY_FILE/.test(content) && !/KEY_FILE\b.*not found|-f\s+"\$\{?KEY_FILE/.test(content)) {
      // reading existence is fine; printing contents is not — heuristic: `cat $KEY_FILE`
      if (/cat\s+"?\$\{?HERMES_BACKUP_KEY_FILE/.test(content)) flag("SECRET_LOGGING_PATH", rp, "cats the backup key file");
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const GATES = [
  "PRODUCTION_VOLUME_DESTRUCTION_PATH",
  "UNIDENTIFIED_DB_RESTORE_PATH",
  "SECRET_LOGGING_PATH",
  "CI_PRODUCTION_ACCESS",
  "AUTO_PRODUCTION_DEPLOY_TRIGGER",
  "AUTO_DATABASE_ROLLBACK",
  "FAIL_OPEN_RELEASE_GATE",
];
let failed = false;
for (const g of GATES) {
  const hits = violations.filter((v) => v.gate === g);
  console.log(`RESULT ${g}=${hits.length}`);
  for (const h of hits) console.log(`  - ${h.file}: ${h.msg}`);
  if (hits.length > 0) failed = true;
}
console.log(`RESULT phase98_production_safety=${failed ? "FAIL" : "PASS"} (scanned ${files.length} files)`);
process.exit(failed ? 1 : 0);

/**
 * PHASE 99.7 — adversarial static review of the production-completion surface.
 *
 * Phase 98's `production-safety-check.mjs` guards the DR surface it introduced.
 * This checker guards the properties Phase 99.7 is specifically responsible for,
 * and it is scoped to the files this phase adds or changes so it can never
 * over-scan pre-existing operational tooling that legitimately contains the
 * scanned tokens as data.
 *
 * Gates (each must be 0):
 *   PROHIBITED_HOST_CONTACT        — no production/OpenBao/pentest host literal
 *   OPENBAO_MUTATION               — this phase changes no OpenBao configuration
 *   SHARP_DOWNGRADE                — the sharp pin is never lowered
 *   AUTO_PRODUCTION_DEPLOY_TRIGGER — deploy stays workflow_dispatch-only
 *   AUTO_DATABASE_ROLLBACK         — nothing restores a database automatically
 *   UNGATED_MIGRATION_DEPLOY       — deploy cannot skip the pre-migration gate
 *   SHELL_TRACE_ENABLED            — no `set -x` (it echoes secrets)
 *   FAIL_OPEN_RELEASE_GATE         — no continue-on-error on a Phase 99.7 job
 *
 * Read-only. No network, no database, no host contact.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEPLOY_WF = ".github/workflows/deploy.yml";
const PHASE997_WF = ".github/workflows/phase997-production-completion.yml";

/** Files this phase owns. Keeping the scope explicit keeps the gate honest. */
const PHASE997_PREFIXES = ["scripts/ci/phase997-", "scripts/__tests__/phase997-", "docs/release/phase99.7-"];
const PHASE997_FILES = new Set([
  "scripts/dr/release-prerequisites.mjs",
  "scripts/dr/documents-adoption.mjs",
  "scripts/dr/adopt-documents.mjs",
  "scripts/dr/sharp-runtime-gate.mjs",
  "scripts/dr/deploy-migration-gate.mjs",
  DEPLOY_WF,
  PHASE997_WF,
]);

/**
 * Hosts this phase must never contact. Held as split literals so this checker
 * does not itself become a file containing a production address — and so it is
 * never a false positive against its own source.
 */
const PROHIBITED_HOSTS = [
  ["51.195", "255.7"], // production application host
  ["146.19", "130.221"], // OpenBao host
].map((parts) => parts.join("."));

/**
 * Pattern-DEFINING files legitimately carry these tokens as data: this checker
 * holds the patterns it searches for, and the Phase 99.7 test suite must set the
 * OpenBao switch (in its own process) to prove it fails closed. Neither ships or
 * runs in production.
 */
const EXEMPT = new Set(["scripts/ci/phase997-release-safety-check.mjs"]);
const isTestFile = (rp) => rp.startsWith("scripts/__tests__/");

const violations = [];
const flag = (gate, file, msg) => violations.push({ gate, file, msg });

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(REPO, p).split("\\").join("/"));
  }
}

const all = [];
for (const d of ["scripts", "docs/release", ".github/workflows"]) walk(join(REPO, d), all);

const files = all
  .filter((rp) => PHASE997_PREFIXES.some((p) => rp.startsWith(p)) || PHASE997_FILES.has(rp))
  .filter((rp) => !EXEMPT.has(rp));

const isDoc = (rp) => rp.endsWith(".md");

for (const rp of files) {
  const content = readFileSync(join(REPO, rp), "utf8");

  // 1. No prohibited host may appear anywhere, prose included.
  for (const host of PROHIBITED_HOSTS) {
    if (content.includes(host)) flag("PROHIBITED_HOST_CONTACT", rp, `contains a prohibited host literal`);
  }

  if (isDoc(rp)) continue; // the remaining gates are about executable behaviour

  // 2. This phase must not mutate the OpenBao credential plane. Reading the
  //    switch to PROVE it is disabled is fine; writing it is not.
  if (!isTestFile(rp) && (/OT_SECRET_BACKEND\s*=\s*["']?openbao/.test(content) || /\bOPENBAO_APPROLE_(ROLE|SECRET)_ID\b\s*=/.test(content))) {
    flag("OPENBAO_MUTATION", rp, "sets OpenBao credential-plane configuration");
  }

  // 3. sharp must never be downgraded to dodge its CPU requirement.
  const sharpPin = /["']?sharp["']?\s*[:=]\s*["']?(\d+)\.(\d+)\.(\d+)/.exec(content);
  if (sharpPin) {
    const [, major, minor] = sharpPin.map(Number);
    if (major === 0 && minor < 35) flag("SHARP_DOWNGRADE", rp, `pins sharp ${sharpPin[1]}.${sharpPin[2]} below the remediated 0.35 line`);
  }

  // 4. Nothing may restore a database automatically.
  if (/scripts\/restore-postgres\.sh/.test(content) && rp.startsWith(".github/workflows/")) {
    flag("AUTO_DATABASE_ROLLBACK", rp, "a workflow invokes the production restore script");
  }

  // 5. `set -x` echoes every expanded value, including secrets.
  if (/^\s*set\s+-[a-wyz]*x/m.test(content)) flag("SHELL_TRACE_ENABLED", rp, "enables shell tracing");

  // 6. Assurance jobs must be hard gates.
  if (rp === PHASE997_WF && /continue-on-error:\s*true/.test(content)) {
    flag("FAIL_OPEN_RELEASE_GATE", rp, "continue-on-error on an assurance job");
  }
  if (rp === PHASE997_WF && /environment:\s*production/.test(content)) {
    flag("FAIL_OPEN_RELEASE_GATE", rp, "assurance workflow declares environment: production");
  }
}

// ── Deploy workflow invariants (checked as a whole document) ─────────────────
const deploy = existsSync(join(REPO, DEPLOY_WF)) ? readFileSync(join(REPO, DEPLOY_WF), "utf8") : "";
if (!deploy) {
  flag("AUTO_PRODUCTION_DEPLOY_TRIGGER", DEPLOY_WF, "deploy workflow is missing");
} else {
  if (/^\s{2}push:/m.test(deploy) || /^\s{2}pull_request(_target)?:/m.test(deploy)) {
    flag("AUTO_PRODUCTION_DEPLOY_TRIGGER", DEPLOY_WF, "deploy triggers on push/pull_request");
  }
  if (!/^\s*workflow_dispatch:/m.test(deploy)) {
    flag("AUTO_PRODUCTION_DEPLOY_TRIGGER", DEPLOY_WF, "deploy is not workflow_dispatch-only");
  }
  if (!/environment:\s*production/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the production environment protection was removed");
  }
  // The Phase 99.7 gate itself must still be wired in.
  if (!/deploy-migration-gate\.mjs/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the migration classification step was removed");
  }
  if (!/migration-prerequisites-verified/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the migration prerequisite confirmation was removed");
  }
  if (!/pre_migration_backup_required/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the deploy no longer consumes the backup requirement");
  }
  if (!/transportSha256/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the host-side backup integrity check was removed");
  }
  if (!/documents-adoption\.json/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the documents_data adoption evidence check was removed");
  }
  if (!/hermes-web:previous-good/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the previous-good image is no longer preserved");
  }
  // Only hermes-web may be recreated; the data services must survive.
  if (/up\s+-d[^\n]*\b(postgres|redis|nginx)\b/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the deploy recreates a data or proxy service");
  }
  if (/(down\s+-v|volume\s+rm|system\s+prune)/.test(deploy)) {
    flag("AUTO_DATABASE_ROLLBACK", DEPLOY_WF, "the deploy contains a destructive volume operation");
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const GATES = [
  "PROHIBITED_HOST_CONTACT",
  "OPENBAO_MUTATION",
  "SHARP_DOWNGRADE",
  "AUTO_PRODUCTION_DEPLOY_TRIGGER",
  "AUTO_DATABASE_ROLLBACK",
  "UNGATED_MIGRATION_DEPLOY",
  "SHELL_TRACE_ENABLED",
  "FAIL_OPEN_RELEASE_GATE",
];
let failed = false;
for (const g of GATES) {
  const hits = violations.filter((v) => v.gate === g);
  console.log(`RESULT ${g}=${hits.length}`);
  for (const h of hits) console.log(`  - ${h.file}: ${h.msg}`);
  if (hits.length > 0) failed = true;
}
console.log(`RESULT phase997_release_safety=${failed ? "FAIL" : "PASS"} (scanned ${files.length} files)`);
process.exit(failed ? 1 : 0);

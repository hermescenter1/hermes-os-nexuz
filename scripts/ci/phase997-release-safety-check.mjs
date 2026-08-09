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
  // Blocker 4: previous-good must be a HARD gate with the tag verified against
  // the exact pre-cutover image ID — never a warning.
  if (/WARNING: no running hermes-web/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "a missing previous-good image degraded back into a warning");
  }
  if (!/no previous-good rollback target exists/.test(deploy) || !/docker image inspect -f '\{\{\.Id\}\}'/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the previous-good hard failure / exact-ID verification was removed");
  }
  // Blocker 3: dirty-worktree refusal must precede checkout, and the build
  // context must be proven to be TARGET_SHA before any build.
  {
    const dirtyAt = deploy.indexOf("is dirty");
    const checkoutAt = deploy.indexOf('git checkout --detach "$TARGET_SHA"');
    if (dirtyAt < 0 || checkoutAt < 0 || dirtyAt > checkoutAt) {
      flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the pre-checkout dirty-worktree refusal was removed or reordered");
    }
    if (!/post-checkout HEAD does not equal TARGET_SHA/.test(deploy)) {
      flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the post-checkout build-context proof was removed");
    }
  }
  // Blocker 1: migrations must be applied by the pinned migrator BEFORE
  // hermes-web is replaced, and the outcome must be verified.
  {
    const buildWebAt = deploy.indexOf("build hermes-web");
    const migrateAt = deploy.indexOf("--profile migrate run --rm -T hermes-migrate");
    const upAt = deploy.indexOf("up -d --no-deps hermes-web");
    if (migrateAt < 0 || upAt < 0 || buildWebAt < 0 || !(buildWebAt < migrateAt && migrateAt < upAt)) {
      flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the explicit migrator step is missing or no longer precedes the hermes-web replacement");
    }
    if (!/migrate status/.test(deploy) || !/_prisma_migrations/.test(deploy) || !/TARGET_MIGRATION_COUNT/.test(deploy)) {
      flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the migration outcome verification (status + applied count) was removed");
    }
    if (/npx\s+prisma/.test(deploy)) {
      flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the deploy invokes a network-resolved prisma CLI instead of the pinned migrator");
    }
  }
  // Blocker 5: every compose invocation must carry the canonical env file, or
  // the NEXT_PUBLIC_* build args silently interpolate to empty defaults.
  for (const line of deploy.split("\n").filter((l) => /docker compose/.test(l))) {
    if (!line.includes("--env-file .env.production")) {
      flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, `compose invocation without --env-file .env.production: ${line.trim().slice(0, 100)}`);
    }
    if (!line.includes("-p hermes")) {
      flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, `compose invocation without the canonical -p hermes project: ${line.trim().slice(0, 100)}`);
    }
  }
  // Only hermes-web may be recreated; the data services must survive.
  if (/up\s+-d[^\n]*\b(postgres|redis|nginx|hermes-migrate)\b/.test(deploy)) {
    flag("UNGATED_MIGRATION_DEPLOY", DEPLOY_WF, "the deploy recreates a data/proxy service or auto-starts the migrator");
  }
  if (/(down\s+-v|volume\s+rm|system\s+prune)/.test(deploy)) {
    flag("AUTO_DATABASE_ROLLBACK", DEPLOY_WF, "the deploy contains a destructive volume operation");
  }
}

// ── Pinned build tooling (Phase 99.7) ───────────────────────────────────────
// The release image must never be produced by a CLI resolved from the network
// at build time. An observed build logged npm silently installing prisma@7.9.1
// while this repository pins 7.8.0, then failing — the same unpinned-tooling
// risk the migration contract forbids.
{
  const dockerfilePath = join(REPO, "Dockerfile");
  if (existsSync(dockerfilePath)) {
    const dockerfile = readFileSync(dockerfilePath, "utf8");
    for (const line of dockerfile.split("\n")) {
      if (/^\s*RUN\b/.test(line) && /\bnpx\b/.test(line)) {
        flag("UNPINNED_BUILD_TOOLING", "Dockerfile", `RUN uses npx (network-resolvable): ${line.trim().slice(0, 100)}`);
      }
    }
    // The migrator stage is what applies production migrations; it must exist
    // and must invoke the local CLI.
    if (!/AS migrator\b/.test(dockerfile)) {
      flag("UNPINNED_BUILD_TOOLING", "Dockerfile", "the pinned `migrator` stage is missing");
    }
    if (!/node_modules\/prisma\/build\/index\.js/.test(dockerfile)) {
      flag("UNPINNED_BUILD_TOOLING", "Dockerfile", "the pinned local Prisma CLI invocation is missing");
    }
    // `runner` must stay the final stage: a bare `docker build .` targets it.
    const stages = [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gim)].map((m) => m[1]);
    if (stages.length > 0 && stages[stages.length - 1] !== "runner") {
      flag("UNPINNED_BUILD_TOOLING", "Dockerfile", `the final stage must be "runner", found "${stages[stages.length - 1]}"`);
    }
  } else {
    flag("UNPINNED_BUILD_TOOLING", "Dockerfile", "Dockerfile is missing");
  }
}

// ── Candidate-gate isolation invariant (owner-review blocker 2) ──────────────
// The candidate gate must never derive an env-file path from the repository.
{
  const candidatePath = join(REPO, "scripts", "ci", "phase997-candidate-gate.mjs");
  if (existsSync(candidatePath)) {
    const candidate = readFileSync(candidatePath, "utf8");
    if (/join\(\s*REPO\s*,\s*["']\.env\.production["']\s*\)/.test(candidate)) {
      flag("REPO_ENV_FILE_MUTATION", "scripts/ci/phase997-candidate-gate.mjs", "derives an env-file path from the repository");
    }
    // Isolation is enforced by an `env_file: !override` pointing at the
    // temporary workspace. `!override` REPLACES the value, so no service can
    // still resolve the repository's own `.env.production`.
    if (!/env_file: !override/.test(candidate)) {
      flag("REPO_ENV_FILE_MUTATION", "scripts/ci/phase997-candidate-gate.mjs", "the env_file !override isolation was removed");
    }
    if (!/--env-file/.test(candidate)) {
      flag("REPO_ENV_FILE_MUTATION", "scripts/ci/phase997-candidate-gate.mjs", "the isolated --env-file was removed");
    }
  } else {
    flag("REPO_ENV_FILE_MUTATION", "scripts/ci/phase997-candidate-gate.mjs", "candidate gate is missing");
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
  "UNPINNED_BUILD_TOOLING",
  "REPO_ENV_FILE_MUTATION",
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

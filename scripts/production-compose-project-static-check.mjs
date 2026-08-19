#!/usr/bin/env node
// Gate 0D-A: static, network-free guard for the Production Compose project.
//
// Root cause guarded against: an unpinned `docker compose` invocation from
// /opt/hermes-os-nexuz derived the project name from the checkout directory
// and created a second, empty "hermes-os-nexuz" stack (new network + empty
// named volumes) beside the canonical "hermes" stack.
//
// Scope of enforcement (fail-closed, no network, no dependencies, deterministic):
//
//   Tier 1 — the deploy pipeline. `docker-compose.prod.yml` and
//     `.github/workflows/deploy.yml` are held to the strict production contract
//     (top-level name, exact up/ps commands, Gate 0A protections).
//
//   Tier 2 — the operator surface. Every runbook, checklist and shell script
//     under docs/, deploy/ and scripts/ (plus root DEPLOYMENT.md) is scanned for
//     executable / copy-paste PRODUCTION Compose commands (those referencing
//     `docker-compose.prod.yml`). Each must be pinned with `-p hermes`, use the
//     v2 `docker compose` form, and must not carry a derived project name.
//     Obsolete `git pull origin master` and destructive `down -v` /
//     `docker volume rm` / `docker system prune` are forbidden as executable
//     commands. Explicit prohibition/warning lines (❌, "Never", "Do not") are
//     recognized as prose and skipped, so a runbook can still tell operators
//     what NOT to run. The separate OpenBao staging stack (its own Compose
//     project) is excluded by the `openbao` deny-list.
//
// The root cause guarded against: an unpinned invocation deriving the project
// name from the checkout directory — in a workflow, a runbook, or a script.

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function gate(condition, code, detail) {
  if (!condition) {
    failures += 1;
    console.error(
      `[production-compose-static] FAILED ${code}${detail ? ` — ${detail}` : ""}`,
    );
  }
}

// CRLF-normalized so the checks behave identically on Windows checkouts
// (core.autocrlf) and on the LF checkout used by CI.
const readNormalized = (path) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

const composeFile = readNormalized("docker-compose.prod.yml");
const deployWorkflow = readNormalized(".github/workflows/deploy.yml");

// ── Logical lines ────────────────────────────────────────────────────────────
// A shell joins backslash-newline continuations before parsing, so all
// line-oriented checks MUST operate on joined logical lines — otherwise a
// command split as `docker compose … \` + `down` evades a per-physical-line
// scan. Each logical line keeps the physical line number where it started.
function toLogicalLines(text) {
  const physical = text.split("\n");
  const logical = [];
  let buffer = null;
  let startLine = 0;
  for (let i = 0; i < physical.length; i += 1) {
    const raw = physical[i];
    const continues = /\\\s*$/.test(raw);
    const cleaned = raw.replace(/\\\s*$/, "");
    if (buffer === null) {
      buffer = cleaned;
      startLine = i + 1;
    } else {
      buffer += " " + cleaned.replace(/^\s+/, "");
    }
    if (!continues) {
      logical.push({ line: buffer, lineNumber: startLine });
      buffer = null;
    }
  }
  if (buffer !== null) logical.push({ line: buffer, lineNumber: startLine });
  return logical;
}

const deployLogical = toLogicalLines(deployWorkflow);
// Executable lines: non-empty, not a full-line comment.
const executableLines = deployLogical.filter(
  ({ line }) => line.trim() !== "" && !/^\s*#/.test(line),
);

// ── 1. docker-compose.prod.yml must declare top-level `name: hermes` ─────────
const composeLines = composeFile.split("\n");
const topLevelNameLines = composeLines.filter((line) => /^name:/.test(line));
gate(
  topLevelNameLines.length === 1 && /^name:\s*hermes\s*$/.test(topLevelNameLines[0]),
  "COMPOSE_TOP_LEVEL_NAME",
  "docker-compose.prod.yml must declare exactly one top-level `name: hermes`",
);
const nameIndex = composeLines.findIndex((line) => /^name:\s*hermes\s*$/.test(line));
const servicesIndex = composeLines.findIndex((line) => /^services:\s*$/.test(line));
gate(
  nameIndex !== -1 && servicesIndex !== -1 && nameIndex < servicesIndex,
  "COMPOSE_NAME_BEFORE_SERVICES",
  "`name: hermes` must appear before the top-level `services:` key",
);

// ── Compose invocation model ─────────────────────────────────────────────────
// Matches `docker compose` (one or more spaces) OR the legacy `docker-compose`
// binary as a command word (not the `-f docker-compose.prod.yml` file arg).
//
// PHASE 99.7: the boundary is `[^\w.]`, not `\s`. With a whitespace-only
// boundary a command substitution — `X="$(docker compose … )"` — was NOT
// recognised as an invocation, because the character before `docker` is `(`.
// Every Tier 1 check (project pin, env file, subcommand allow-list, forbidden
// patterns) silently skipped such a line, so an UNPINNED compose command
// wrapped in `$( )` would have passed this gate. Tier 2 already used the wider
// boundary; Tier 1 now matches it. The trailing `(\s|$)` still prevents the
// filename token `docker-compose.prod.yml` from being read as an invocation.
const COMPOSE_INVOCATION = /(^|[^\w.])docker(?:\s+|-)compose(\s|$)/;
const LEGACY_BINARY = /(^|[^\w.])docker-compose(\s|$)/;

// Extract the compose subcommand (first bare token after `docker compose` and
// its value-bearing global flags). Used to allow-list up/ps only.
const VALUE_FLAGS = new Set([
  "-p",
  "-f",
  "--env-file",
  "--project-name",
  "--project-directory",
  "--profile",
  "-c",
  "--context",
]);
function composeSubcommand(line) {
  const m = line.match(/docker(?:\s+|-)compose\b(.*)$/);
  if (!m) return null;
  const tokens = m[1].trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (VALUE_FLAGS.has(t)) {
      i += 1; // skip the flag's value
      continue;
    }
    if (t.startsWith("-")) continue; // other boolean/`--flag=value` token
    return t;
  }
  return null;
}

const composeInvocations = executableLines.filter(({ line }) =>
  COMPOSE_INVOCATION.test(line),
);

// ── 2. Every executable Compose invocation must be pinned & well-formed ──────
gate(
  composeInvocations.length >= 2,
  "DEPLOY_COMPOSE_PRESENT",
  "expected at least the targeted `up` and the `ps` Compose commands",
);
// PHASE 99.7 — the deploy contract grew, so this allow-list grew WITH it, not
// around it.
//
// The original contract was "up/ps only", written when the workflow rebuilt
// hermes-web and nothing else. That premise is now known to be unsafe: the
// runner image's CMD is `node server.js` and it ships only the Prisma runtime,
// so NOTHING applied migrations — a migration-bearing release booted new code
// against the old schema. The release must therefore build the image, run the
// pinned migrator, and verify the outcome before replacing hermes-web.
//
// Each newly-permitted subcommand is constrained below to exactly the shape the
// contract needs, so the guarantee is unchanged in substance: the deploy still
// cannot stop, restart, remove or recreate postgres/redis/nginx, cannot destroy
// a volume, and cannot write to the database.
const ALLOWED_SUBCOMMANDS = new Set(["up", "ps", "build", "run", "exec"]);
// Services this workflow may build. hermes-migrate is the pinned migrator stage.
const BUILDABLE_SERVICES = new Set(["hermes-web", "hermes-migrate"]);
for (const { line, lineNumber } of composeInvocations) {
  const at = `deploy.yml line ${lineNumber}`;
  gate(!LEGACY_BINARY.test(line), "DEPLOY_COMPOSE_V2", `${at}: use \`docker compose\` (v2), not \`docker-compose\``);
  gate(/\s-p\s+hermes(?=\s|$)/.test(line), "DEPLOY_PROJECT_PIN", `${at}: every Compose command must pass \`-p hermes\``);
  gate(/\s-f\s+docker-compose\.prod\.yml(?=\s|$)/.test(line), "DEPLOY_COMPOSE_FILE", `${at}: every Compose command must pass \`-f docker-compose.prod.yml\``);
  // Exactly one project flag, in the short `-p <name>` form. A second flag
  // (`--project-name x`, another `-p y`) would silently override `-p hermes`
  // at runtime because Compose honours the LAST project flag on the line.
  const projectFlagCount = (line.match(/(^|\s)-p\s/g) || []).length;
  gate(projectFlagCount === 1, "DEPLOY_SINGLE_PROJECT_FLAG", `${at}: expected exactly one \`-p <name>\` flag, found ${projectFlagCount}`);
  gate(!/--project-name/.test(line), "DEPLOY_LONG_PROJECT_FLAG", `${at}: use \`-p hermes\`, never \`--project-name\` (can override the pin)`);
  gate(!/(^|\s)-p=/.test(line), "DEPLOY_PROJECT_EQUALS", `${at}: use \`-p hermes\` (space form), not \`-p=…\``);
  // Every Compose command must carry the canonical env file: without it the
  // NEXT_PUBLIC_* build args interpolate to empty strings and the release
  // silently ships an image with no analytics/SEO configuration.
  gate(/\s--env-file\s+\.env\.production(?=\s|$)/.test(line), "DEPLOY_ENV_FILE", `${at}: every Compose command must pass \`--env-file .env.production\``);

  // Subcommand allow-list. Still blocks down, stop, restart, rm, kill, cp, pull.
  const sub = composeSubcommand(line);
  gate(sub !== null && ALLOWED_SUBCOMMANDS.has(sub), "DEPLOY_SUBCOMMAND_ALLOWLIST", `${at}: Compose subcommand \`${sub}\` not allowed (only ${[...ALLOWED_SUBCOMMANDS].join("/")})`);
  // Any `up` must stay targeted: never recreate postgres/redis/nginx.
  if (sub === "up") {
    gate(/--no-deps/.test(line), "DEPLOY_UP_NO_DEPS", `${at}: \`up\` must pass \`--no-deps\` (never recreate postgres/redis/nginx)`);
    gate(/\bhermes-web\b/.test(line), "DEPLOY_UP_TARGET", `${at}: \`up\` must target the \`hermes-web\` service only`);
    gate(!/\bhermes-migrate\b/.test(line), "DEPLOY_UP_NEVER_MIGRATOR", `${at}: \`up\` must never start the migrator (it is profile-gated and runs via \`run --rm\`)`);
  }
  // `build` may only produce the release image or the pinned migrator.
  if (sub === "build") {
    const targets = line.trim().split(/\s+/).filter((t) => BUILDABLE_SERVICES.has(t));
    gate(targets.length >= 1, "DEPLOY_BUILD_TARGET", `${at}: \`build\` must name \`hermes-web\` or \`hermes-migrate\``);
    gate(!/\b(postgres|redis|nginx)\b/.test(line), "DEPLOY_BUILD_NEVER_DATA_SERVICE", `${at}: \`build\` must never target a data or proxy service`);
  }
  // `run` exists solely for the profile-gated, pinned migrator, and must be
  // ephemeral (`--rm`) so it can never linger as a stack member.
  if (sub === "run") {
    gate(/\bhermes-migrate\b/.test(line), "DEPLOY_RUN_MIGRATOR_ONLY", `${at}: \`run\` is permitted only for the \`hermes-migrate\` service`);
    gate(/--rm(?=\s|$)/.test(line), "DEPLOY_RUN_EPHEMERAL", `${at}: \`run\` must pass \`--rm\``);
    gate(/--profile\s+migrate(?=\s|$)/.test(line), "DEPLOY_RUN_PROFILE_GATED", `${at}: the migrator must be invoked through \`--profile migrate\``);
  }
  // `exec` exists solely to READ the migration outcome out of postgres. Any
  // mutating statement, or any target other than postgres, is refused.
  if (sub === "exec") {
    gate(/\bpostgres\b/.test(line), "DEPLOY_EXEC_TARGET", `${at}: \`exec\` is permitted only against the \`postgres\` service`);
    gate(/(^|\s)-T(?=\s)/.test(line), "DEPLOY_EXEC_NON_INTERACTIVE", `${at}: \`exec\` must pass \`-T\` (non-interactive)`);
    gate(
      !/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY)\b/i.test(line),
      "DEPLOY_EXEC_READ_ONLY",
      `${at}: \`exec\` must be read-only — mutating SQL is forbidden in the deploy path`,
    );
    gate(/\bSELECT\b/i.test(line), "DEPLOY_EXEC_IS_QUERY", `${at}: \`exec\` must be a verification SELECT`);
  }
}

// ── 3. Targeted deploy + status commands must keep their exact shape ─────────
const PINNED = "docker compose -p hermes -f docker-compose\\.prod\\.yml --env-file \\.env\\.production";
gate(
  composeInvocations.some(({ line }) => new RegExp(`^${PINNED} up -d --no-deps hermes-web$`).test(line.trim())),
  "DEPLOY_TARGETED_UP",
  "missing `docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d --no-deps hermes-web`",
);
gate(
  composeInvocations.some(({ line }) => new RegExp(`^${PINNED} ps hermes-web$`).test(line.trim())),
  "DEPLOY_STATUS_PS",
  "missing `docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production ps hermes-web`",
);

// ── 3b. PHASE 99.7 — the migration contract must be present AND ordered ──────
// These are POSITIVE requirements: the checker no longer merely tolerates the
// migrator, it fails closed if the release stops applying migrations, stops
// verifying them, or starts serving new code before they are applied.
const buildWebAt = composeInvocations.findIndex(({ line }) => new RegExp(`^${PINNED} build hermes-web$`).test(line.trim()));
const migrateRunAt = composeInvocations.findIndex(({ line }) => composeSubcommand(line) === "run" && /\bhermes-migrate\b/.test(line));
const migrateStatusAt = composeInvocations.findIndex(({ line }) => /\bmigrate status\b/.test(line));
const verifyCountAt = composeInvocations.findIndex(({ line }) => /_prisma_migrations/.test(line));
const upWebAt = composeInvocations.findIndex(({ line }) => composeSubcommand(line) === "up");

gate(buildWebAt !== -1, "DEPLOY_BUILD_WEB_PRESENT", "missing the explicit `build hermes-web` step");
gate(migrateRunAt !== -1, "DEPLOY_MIGRATOR_PRESENT", "missing the pinned `--profile migrate run --rm hermes-migrate` step — nothing would apply migrations");
gate(migrateStatusAt !== -1, "DEPLOY_MIGRATION_STATUS_VERIFIED", "missing the post-migration `migrate status` verification");
gate(verifyCountAt !== -1, "DEPLOY_MIGRATION_COUNT_VERIFIED", "missing the applied-migration count verification against _prisma_migrations");
gate(
  migrateRunAt !== -1 && upWebAt !== -1 && migrateRunAt < upWebAt,
  "DEPLOY_MIGRATE_BEFORE_CUTOVER",
  "migrations must be applied BEFORE hermes-web is replaced",
);
gate(
  migrateStatusAt !== -1 && upWebAt !== -1 && migrateStatusAt < upWebAt,
  "DEPLOY_VERIFY_BEFORE_CUTOVER",
  "the migration outcome must be verified BEFORE hermes-web is replaced",
);

// ── 4. Forbidden executable patterns must never (re)appear ───────────────────
const forbiddenPatterns = [
  [/docker(?:\s+|-)compose\b.*\bdown\b/, "FORBIDDEN_COMPOSE_DOWN"],
  [/docker\s+system\s+prune/, "FORBIDDEN_SYSTEM_PRUNE"],
  [/docker\s+volume\s+rm/, "FORBIDDEN_VOLUME_RM"],
  [/--remove-orphans/, "FORBIDDEN_REMOVE_ORPHANS"],
  [/\bgit\s+pull\b/, "FORBIDDEN_GIT_PULL"],
  [/\bssh-keyscan\b/, "FORBIDDEN_SSH_KEYSCAN"],
  [/-p\s+hermes-os-nexuz\b/, "FORBIDDEN_DERIVED_PROJECT"],
  // PHASE 99.7: `prisma migrate deploy`/`status` via the PINNED migrator is now
  // required (see 3b). What stays forbidden is every destructive or
  // history-rewriting migration subcommand, and any network-resolved CLI —
  // `npx` silently substitutes whatever version the registry serves.
  [/\bprisma\s+migrate\s+(dev|reset|resolve|diff)\b/, "FORBIDDEN_DESTRUCTIVE_MIGRATION"],
  [/\bnpx\b/, "FORBIDDEN_UNPINNED_CLI"],
  [/\bdb\s+push\b/, "FORBIDDEN_DB_PUSH"],
  [/StrictHostKeyChecking[= ](no|accept-new|ask)\b/, "FORBIDDEN_WEAK_HOST_KEY"],
  [/\bCOMPOSE_PROJECT_NAME\b/, "FORBIDDEN_COMPOSE_PROJECT_ENV"],
];
for (const { line, lineNumber } of executableLines) {
  for (const [pattern, code] of forbiddenPatterns) {
    gate(!pattern.test(line), code, `deploy.yml line ${lineNumber}: \`${line.trim()}\``);
  }
}

// ── 5. Production Deploy must stay workflow_dispatch-only (no push) ──────────
// Scan the RAW physical lines of the on: block. Full-line comments do NOT
// terminate a YAML block mapping, so they must be skipped, not treated as the
// next top-level key (otherwise a comment can hide a `push:` trigger below it).
const rawLines = deployWorkflow.split("\n");
const onIndex = rawLines.findIndex((line) => /^on:\s*$/.test(line));
gate(onIndex !== -1, "DEPLOY_ON_BLOCK", "top-level `on:` block not found");
const triggerKeys = [];
if (onIndex !== -1) {
  for (let i = onIndex + 1; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (line.trim() === "" || /^\s*#/.test(line)) continue; // blank/comment: keep scanning
    if (/^\S/.test(line)) break; // genuine next top-level key ends the block
    const match = line.match(/^ {2}([A-Za-z_]+):/);
    if (match) triggerKeys.push(match[1]);
  }
}
gate(
  triggerKeys.length === 1 && triggerKeys[0] === "workflow_dispatch",
  "DEPLOY_DISPATCH_ONLY",
  `triggers must be exactly [workflow_dispatch], found [${triggerKeys.join(", ")}]`,
);

// ── 6. Least-privilege token: read-only, top-level only, no write scopes ─────
// Parse the top-level `permissions:` block the same way as `on:` and assert it
// is exactly `contents: read`. Also forbid ANY job-level permissions override
// (which would replace the workflow grant for the job holding SSH secrets) and
// any `write`/`write-all` scope anywhere executable.
const permIndex = rawLines.findIndex((line) => /^permissions:\s*$/.test(line));
gate(permIndex !== -1, "GATE0A_PERMISSIONS_BLOCK", "top-level `permissions:` block not found");
const permEntries = [];
if (permIndex !== -1) {
  for (let i = permIndex + 1; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    if (/^\S/.test(line)) break;
    const match = line.match(/^ {2}([A-Za-z-]+):\s*(\S+)\s*$/);
    if (match) permEntries.push([match[1], match[2]]);
  }
}
gate(
  permEntries.length === 1 && permEntries[0][0] === "contents" && permEntries[0][1] === "read",
  "GATE0A_READ_ONLY_PERMISSIONS",
  `top-level permissions must be exactly \`contents: read\`, found [${permEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}]`,
);
gate(
  // `[ \t]+`, not `\s+`: `\s` includes newlines, which would let a column-0
  // top-level `permissions:` match through the blank line above it.
  !/^[ \t]+permissions:/m.test(deployWorkflow),
  "GATE0A_NO_JOB_PERMISSIONS",
  "job-level `permissions:` blocks are forbidden (they override the read-only workflow grant)",
);
for (const { line, lineNumber } of executableLines) {
  gate(
    !/:\s*(write|write-all)\b/.test(line) && !/^\s*(write|write-all)\s*$/.test(line),
    "GATE0A_NO_WRITE_SCOPE",
    `deploy.yml line ${lineNumber}: write permission scope is forbidden — \`${line.trim()}\``,
  );
}

// ── Gate 0A contract spot checks ─────────────────────────────────────────────
gate(/^\s*environment:\s*production\s*$/m.test(deployWorkflow), "GATE0A_ENVIRONMENT", "deploy job must declare `environment: production`");
gate(/^\s*cancel-in-progress:\s*false\s*$/m.test(deployWorkflow), "GATE0A_NO_CANCEL", "concurrency must keep `cancel-in-progress: false`");
// StrictHostKeyChecking must be present as =yes on an executable line (weak
// values are already blocked by FORBIDDEN_WEAK_HOST_KEY above).
gate(
  executableLines.some(({ line }) => /StrictHostKeyChecking=yes\b/.test(line)),
  "GATE0A_STRICT_HOST_KEY",
  "ssh must keep `-o StrictHostKeyChecking=yes` on an executable line",
);

// ── TIER 1b: PHASE 106A — the Journal content import workflow ────────────────
//
// Content import deliberately did NOT go into deploy.yml. Tier 1 permits `run`
// there only for hermes-migrate and `exec` only for read-only SELECTs, which is
// exactly what makes a deploy safe to approve: it provably cannot write to the
// database beyond applying migrations. Appending an import step would have
// erased that property.
//
// The cost of a second production workflow is that it lands OUTSIDE both tiers:
// Tier 1 reads only deploy.yml, and Tier 2 scans docs/, deploy/ and scripts/.
// An unpinned Compose command here would have been caught by nothing. So the
// same contract is applied to it, plus the rules its own job needs.
const IMPORT_WORKFLOW = ".github/workflows/journal-import.yml";
let importWorkflow = null;
try {
  importWorkflow = readNormalized(IMPORT_WORKFLOW);
} catch {
  importWorkflow = null;
}
gate(importWorkflow !== null, "IMPORT_WORKFLOW_PRESENT", `${IMPORT_WORKFLOW} not found`);

if (importWorkflow !== null) {
  const importLogical = toLogicalLines(importWorkflow);
  const importExecutable = importLogical.filter(
    ({ line }) => line.trim() !== "" && !/^\s*#/.test(line),
  );
  const importInvocations = importExecutable.filter(({ line }) => COMPOSE_INVOCATION.test(line));

  // Same pin contract as the deploy path.
  const IMPORT_ALLOWED_SUBCOMMANDS = new Set(["build", "run", "exec"]);
  for (const { line, lineNumber } of importInvocations) {
    const at = `journal-import.yml line ${lineNumber}`;
    gate(!LEGACY_BINARY.test(line), "IMPORT_COMPOSE_V2", `${at}: use \`docker compose\` (v2)`);
    gate(/\s-p\s+hermes(?=\s|$)/.test(line), "IMPORT_PROJECT_PIN", `${at}: must pass \`-p hermes\``);
    gate(/\s-f\s+docker-compose\.prod\.yml(?=\s|$)/.test(line), "IMPORT_COMPOSE_FILE", `${at}: must pass \`-f docker-compose.prod.yml\``);
    const projectFlagCount = (line.match(/(^|\s)-p\s/g) || []).length;
    gate(projectFlagCount === 1, "IMPORT_SINGLE_PROJECT_FLAG", `${at}: expected exactly one \`-p <name>\` flag, found ${projectFlagCount}`);
    gate(!/--project-name/.test(line), "IMPORT_LONG_PROJECT_FLAG", `${at}: use \`-p hermes\`, never \`--project-name\``);
    gate(/\s--env-file\s+\.env\.production(?=\s|$)/.test(line), "IMPORT_ENV_FILE", `${at}: must pass \`--env-file .env.production\``);

    const sub = composeSubcommand(line);
    gate(sub !== null && IMPORT_ALLOWED_SUBCOMMANDS.has(sub), "IMPORT_SUBCOMMAND_ALLOWLIST", `${at}: subcommand \`${sub}\` not allowed (only ${[...IMPORT_ALLOWED_SUBCOMMANDS].join("/")})`);
    // This workflow must never start, recreate or replace a running service.
    // `up` is absent from the allow-list precisely so it cannot cut anything over.
    if (sub === "build" || sub === "run") {
      gate(/\bhermes-journal-import\b/.test(line), "IMPORT_SERVICE_ONLY", `${at}: may only target \`hermes-journal-import\``);
      gate(/--profile\s+journal-import(?=\s|$)/.test(line), "IMPORT_PROFILE_GATED", `${at}: must be invoked through \`--profile journal-import\``);
    }
    if (sub === "run") {
      gate(/--rm(?=\s|$)/.test(line), "IMPORT_RUN_EPHEMERAL", `${at}: \`run\` must pass \`--rm\``);
    }
    // `exec` exists only to READ the outcome back out of postgres.
    if (sub === "exec") {
      gate(/\bpostgres\b/.test(line), "IMPORT_EXEC_TARGET", `${at}: \`exec\` is permitted only against \`postgres\``);
      gate(/(^|\s)-T(?=\s)/.test(line), "IMPORT_EXEC_NON_INTERACTIVE", `${at}: \`exec\` must pass \`-T\``);
      gate(
        !/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i.test(line),
        "IMPORT_EXEC_READ_ONLY",
        `${at}: verification must be read-only — mutating SQL is forbidden`,
      );
    }
  }

  // Forbidden executable patterns apply here identically.
  for (const { line, lineNumber } of importExecutable) {
    for (const [pattern, code] of forbiddenPatterns) {
      gate(!pattern.test(line), `IMPORT_${code}`, `journal-import.yml line ${lineNumber}: \`${line.trim()}\``);
    }
  }

  // Trigger, environment and permission posture — identical to Gate 0A.
  const importRaw = importWorkflow.split("\n");
  const importOnIndex = importRaw.findIndex((line) => /^on:\s*$/.test(line));
  const importTriggers = [];
  if (importOnIndex !== -1) {
    for (let i = importOnIndex + 1; i < importRaw.length; i += 1) {
      const line = importRaw[i];
      if (line.trim() === "" || /^\s*#/.test(line)) continue;
      if (/^\S/.test(line)) break;
      const match = line.match(/^ {2}([A-Za-z_]+):/);
      if (match) importTriggers.push(match[1]);
    }
  }
  gate(
    importTriggers.length === 1 && importTriggers[0] === "workflow_dispatch",
    "IMPORT_DISPATCH_ONLY",
    `triggers must be exactly [workflow_dispatch], found [${importTriggers.join(", ")}]`,
  );
  gate(/^\s*environment:\s*production\s*$/m.test(importWorkflow), "IMPORT_ENVIRONMENT", "the import job must declare `environment: production`");
  gate(/^\s*cancel-in-progress:\s*false\s*$/m.test(importWorkflow), "IMPORT_NO_CANCEL", "concurrency must keep `cancel-in-progress: false`");
  gate(
    importExecutable.some(({ line }) => /StrictHostKeyChecking=yes\b/.test(line)),
    "IMPORT_STRICT_HOST_KEY",
    "ssh must keep `-o StrictHostKeyChecking=yes`",
  );
  gate(!/^[ \t]+permissions:/m.test(importWorkflow), "IMPORT_NO_JOB_PERMISSIONS", "job-level `permissions:` blocks are forbidden");
  const importPermIndex = importRaw.findIndex((line) => /^permissions:\s*$/.test(line));
  const importPerms = [];
  if (importPermIndex !== -1) {
    for (let i = importPermIndex + 1; i < importRaw.length; i += 1) {
      const line = importRaw[i];
      if (line.trim() === "" || /^\s*#/.test(line)) continue;
      if (/^\S/.test(line)) break;
      const match = line.match(/^ {2}([A-Za-z-]+):\s*(\S+)\s*$/);
      if (match) importPerms.push([match[1], match[2]]);
    }
  }
  gate(
    importPerms.length === 1 && importPerms[0][0] === "contents" && importPerms[0][1] === "read",
    "IMPORT_READ_ONLY_PERMISSIONS",
    `top-level permissions must be exactly \`contents: read\`, found [${importPerms.map(([k, v]) => `${k}: ${v}`).join(", ")}]`,
  );

  // ── The import-specific safety contract ────────────────────────────────────
  // A typed confirmation phrase, compared with `=` against the exact literal.
  gate(
    /journal_import_confirmation/.test(importWorkflow),
    "IMPORT_CONFIRMATION_INPUT",
    "the workflow must expose a `journal_import_confirmation` input",
  );
  gate(
    /"\$CONFIRMATION"\s*=\s*"import-phase106-journal"/.test(importWorkflow),
    "IMPORT_CONFIRMATION_EXACT",
    "the real import must be gated on an exact string comparison with `import-phase106-journal`",
  );
  // The write step must be conditional on that classification, never default.
  gate(
    /if:\s*steps\.mode\.outputs\.real_import\s*==\s*'true'/.test(importWorkflow),
    "IMPORT_WRITE_IS_CONDITIONAL",
    "the real-import step must be guarded by the confirmation classification",
  );
  // `--commit` is the importer's only write switch. It must appear exactly once
  // among the EXECUTABLE lines — a second occurrence would mean an unguarded
  // write. Comments are excluded on purpose: the header documents the switch,
  // and documenting a dangerous flag must never be what trips the gate.
  const commitOccurrences = importExecutable.reduce(
    (n, { line }) => n + (line.match(/--commit(?=\s|$)/g) || []).length,
    0,
  );
  gate(
    commitOccurrences === 1,
    "IMPORT_SINGLE_COMMIT_SWITCH",
    `\`--commit\` must appear exactly once, found ${commitOccurrences}`,
  );
  // The dry run must be unconditional: no `if:` may gate it, or a failure path
  // could skip straight to the write.
  const dryRunAt = importInvocations.findIndex(
    ({ line }) => composeSubcommand(line) === "run" && !/--commit/.test(line),
  );
  const realImportAt = importInvocations.findIndex(({ line }) => /--commit(?=\s|$)/.test(line));
  gate(dryRunAt !== -1, "IMPORT_DRY_RUN_PRESENT", "the mandatory dry run is missing");
  gate(
    dryRunAt !== -1 && realImportAt !== -1 && dryRunAt < realImportAt,
    "IMPORT_DRY_RUN_BEFORE_WRITE",
    "the dry run must execute BEFORE the real import",
  );
  // The importer has no --force and no destructive switch; none may be invented
  // here either. Scanned over EXECUTABLE lines only, for the same reason Tier 2
  // recognises prohibition prose: the workflow header states these bans in
  // words, and a rule that punishes its own documentation teaches operators to
  // delete the documentation.
  for (const { line, lineNumber } of importExecutable) {
    gate(
      !/--force\b/.test(line),
      "IMPORT_NO_FORCE",
      `journal-import.yml line ${lineNumber}: \`--force\` is forbidden — the importer has no such switch`,
    );
    gate(
      !/\b(TRUNCATE|DROP\s+TABLE|DELETE\s+FROM)\b/i.test(line),
      "IMPORT_NO_DESTRUCTIVE_SQL",
      `journal-import.yml line ${lineNumber}: destructive SQL is forbidden in the import path`,
    );
  }
}

// ── TIER 2: operator surface (runbooks, checklists, shell scripts) ───────────
// Discover operational files under fixed roots so newly added runbooks are
// covered automatically. Only .md and .sh are scanned; the `openbao` deny-list
// excludes the separate OpenBao staging Compose project; the checker file and
// the `.github/workflows/deploy.yml` (Tier 1) are not re-scanned here.
const OPERATIONAL_ROOTS = ["docs", "deploy", "scripts"];
const OPERATIONAL_EXTRA = ["DEPLOYMENT.md"];
const OPERATIONAL_DENY = ["openbao"];

function collectOperationalFiles(dir, acc) {
  let entries;
  try {
    entries = readdirSync(resolve(root, dir), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (OPERATIONAL_DENY.some((d) => rel.includes(d))) continue;
    if (entry.isDirectory()) {
      collectOperationalFiles(rel, acc);
    } else if (/\.(md|sh)$/.test(entry.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

const operationalFiles = [];
for (const dir of OPERATIONAL_ROOTS) collectOperationalFiles(dir, operationalFiles);
for (const f of OPERATIONAL_EXTRA) operationalFiles.push(f);

// A production Compose command is an actual invocation (`docker compose` v2 or
// legacy `docker-compose` as a command word) that references the production
// file. The leading `[^\w.]` boundary accepts a preceding space, backtick,
// quote or paren (markdown inline code / fenced blocks) but rejects a preceding
// `.` or word char; the trailing `(\s|$)` after `compose` means the filename
// token `docker-compose.prod.yml` in prose is NOT mistaken for an invocation.
const OPS_INVOCATION = /(^|[^\w.])docker(?:\s+compose|-compose)(\s|$)/;
const OPS_LEGACY = /(^|[^\w.])docker-compose(\s|$)/;
const OPS_PROD_FILE = /docker-compose\.prod\.yml/;
// Prohibition/warning prose: a runbook (or this file's own rule docs) may name a
// dangerous command precisely to forbid it. These words mark such lines as prose.
const OPS_PROHIBITION = /❌|\bnever\b|\bdo not\b|\bdon['’]?t\b|\bmust not\b|\bforbidden\b/i;
const OPS_DESTRUCTIVE = [
  [/\bdown\b[^\n]*(?:\s-v\b|--volumes\b)/, "OPS_DOWN_VOLUMES"],
  [/docker\s+volume\s+rm\b/, "OPS_VOLUME_RM"],
  [/docker\s+system\s+prune\b/, "OPS_SYSTEM_PRUNE"],
];

for (const file of operationalFiles) {
  let content;
  try {
    content = readNormalized(file);
  } catch {
    continue;
  }
  for (const { line, lineNumber } of toLogicalLines(content)) {
    const at = `${file}:${lineNumber}`;
    // Strip markdown emphasis/code marks so "Do **not**" reads as "do not".
    const prohibition = OPS_PROHIBITION.test(line.replace(/[*`_~]/g, ""));

    // Obsolete: production must never deploy from master or via an unbounded pull.
    gate(
      prohibition || !/\bgit\s+pull\b[^\n]*\borigin\s+master\b/.test(line),
      "OPS_OBSOLETE_MASTER_PULL",
      `${at}: obsolete \`git pull origin master\` — deploy a validated SHA reachable from origin/main via detached checkout, or use the Production Deploy workflow`,
    );

    // Destructive commands are forbidden as executable operator instructions.
    if (!prohibition) {
      for (const [pattern, code] of OPS_DESTRUCTIVE) {
        gate(!pattern.test(line), code, `${at}: \`${line.trim()}\``);
      }
    }

    // Production Compose commands must be pinned.
    if (!OPS_INVOCATION.test(line) || !OPS_PROD_FILE.test(line) || prohibition) continue;
    gate(!OPS_LEGACY.test(line), "OPS_COMPOSE_V2", `${at}: use \`docker compose\` (v2), not \`docker-compose\``);
    gate(/\s-p\s+hermes(?=\s|$)/.test(line), "OPS_PROJECT_PIN", `${at}: production Compose command must pass \`-p hermes\` — \`${line.trim()}\``);
    gate(!/-p\s+hermes-os-nexuz\b/.test(line), "OPS_DERIVED_PROJECT", `${at}: forbidden derived project name \`hermes-os-nexuz\``);
  }
}

if (failures > 0) {
  console.error(`[production-compose-static] ${failures} failure(s)`);
  process.exit(1);
}
console.log(
  `[production-compose-static] PASS (Tier 1: deploy.yml + compose file; Tier 2: ${operationalFiles.length} operator files)`,
);

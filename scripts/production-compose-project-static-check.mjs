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
const COMPOSE_INVOCATION = /(^|\s)docker(?:\s+|-)compose(\s|$)/;
const LEGACY_BINARY = /(^|\s)docker-compose(\s|$)/;

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
const ALLOWED_SUBCOMMANDS = new Set(["up", "ps"]);
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
  // Only up / ps are permitted in the deploy workflow. This inherently blocks
  // down, stop, restart, exec, run, rm, kill and any migration-via-exec.
  const sub = composeSubcommand(line);
  gate(sub !== null && ALLOWED_SUBCOMMANDS.has(sub), "DEPLOY_SUBCOMMAND_ALLOWLIST", `${at}: Compose subcommand \`${sub}\` not allowed (only up/ps)`);
  // Any `up` must stay targeted: never recreate postgres/redis/nginx.
  if (sub === "up") {
    gate(/--no-deps/.test(line), "DEPLOY_UP_NO_DEPS", `${at}: \`up\` must pass \`--no-deps\` (never recreate postgres/redis/nginx)`);
    gate(/\bhermes-web\b/.test(line), "DEPLOY_UP_TARGET", `${at}: \`up\` must target the \`hermes-web\` service only`);
  }
}

// ── 3. Targeted deploy + status commands must keep their exact shape ─────────
gate(
  composeInvocations.some(({ line }) =>
    /^docker compose -p hermes -f docker-compose\.prod\.yml up -d --build --no-deps hermes-web$/.test(line.trim()),
  ),
  "DEPLOY_TARGETED_UP",
  "missing `docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web`",
);
gate(
  composeInvocations.some(({ line }) =>
    /^docker compose -p hermes -f docker-compose\.prod\.yml ps hermes-web$/.test(line.trim()),
  ),
  "DEPLOY_STATUS_PS",
  "missing `docker compose -p hermes -f docker-compose.prod.yml ps hermes-web`",
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
  [/prisma\s+migrate/, "FORBIDDEN_MIGRATION"],
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

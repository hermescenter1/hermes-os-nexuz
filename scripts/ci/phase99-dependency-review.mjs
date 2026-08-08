#!/usr/bin/env node
/**
 * PHASE 99 — dependency review.
 *
 * Runs the ecosystem's own audit mechanism twice — the full tree and the
 * production-only tree — and writes a SANITIZED artifact for the public
 * repository: package name, normalized severity, whether the package is a direct
 * dependency, whether it is reachable in production, whether a fix exists
 * without a major bump, and the public advisory URLs. Nothing else.
 *
 * It deliberately does NOT change anything. `npm audit fix --force` is never
 * invoked, and no upgrade is applied automatically: a framework major is a
 * product decision with a regression surface far wider than this phase's scope.
 * The artifact is the input to the finding register and to the owner's decision.
 *
 * Network access is required (the advisory database is remote), so this runs as
 * its own CI step rather than inside the offline readiness evaluator, which only
 * validates the artifact it produces.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeNpmAudit, summarizeDependencyRows } from "../security/phase99/normalization.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(REPO, "docs", "security", "phase99-dependency-review.json");

function audit(extraArgs) {
  const res = spawnSync("npm", ["audit", "--json", ...extraArgs], {
    cwd: REPO,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  // `npm audit` exits non-zero when it FINDS vulnerabilities, which is a normal
  // outcome here — only an unparseable payload is an error.
  if (!res.stdout) {
    console.error(`[phase99-dependency-review] npm audit produced no output: ${res.error?.message ?? res.stderr ?? "unknown"}`);
    process.exit(2);
  }
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error("[phase99-dependency-review] npm audit output was not JSON");
    process.exit(2);
  }
}

const full = audit([]);
const prod = audit(["--omit=dev"]);

const prodPackages = new Set(Object.keys(prod.vulnerabilities ?? {}));
const rows = normalizeNpmAudit(full).map((r) => ({
  ...r,
  productionReachable: prodPackages.has(r.package),
  // `fixAvailable: true` means an in-range update clears it; an object means the
  // fix requires moving a different package, often across a major.
  fixWithoutMajor: full.vulnerabilities?.[r.package]?.fixAvailable === true,
}));

const summary = summarizeDependencyRows(rows);
const prodSummary = summarizeDependencyRows(normalizeNpmAudit(prod));

const artifact = {
  schemaVersion: 1,
  phase: "99",
  tool: "npm audit",
  note: "Sanitized dependency review for a PUBLIC repository. Advisory titles and URLs are already public; no exploit detail, no local paths, no credentials.",
  generatedFrom: "package-lock.json",
  totals: { all: summary, productionOnly: prodSummary },
  packages: rows,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");

console.log("[phase99-dependency-review] wrote docs/security/phase99-dependency-review.json");
console.log(`RESULT phase99_dependency_critical=${summary.CRITICAL}`);
console.log(`RESULT phase99_dependency_high=${summary.HIGH}`);
console.log(`RESULT phase99_dependency_high_production=${prodSummary.HIGH}`);
console.log(`RESULT phase99_dependency_unknown_severity=${summary.UNKNOWN}`);

// A CRITICAL advisory must be fixed for Phase 99 closure, so it fails here.
// HIGH advisories are recorded as findings and resolved by an owner decision
// (fix or formal risk acceptance) — this script reports, it does not adjudicate.
if (summary.CRITICAL > 0) {
  console.error("[phase99-dependency-review] CRITICAL dependency advisory present — Phase 99 cannot close");
  process.exit(1);
}
if (summary.UNKNOWN > 0) {
  console.error("[phase99-dependency-review] an advisory severity could not be mapped — fail closed");
  process.exit(1);
}
process.exit(0);

#!/usr/bin/env node
/**
 * PHASE 100 — publication hygiene for the GA closure summary.
 *
 * `phase100-ga-closure.json` is uploaded as a CI artifact and quoted in release
 * documents, so it must carry a VERDICT and nothing else: gate states, reasons
 * and a blocker matrix. Never an evidence body, a credential, a reviewer's
 * identity or a customer's name.
 *
 * The scan reuses the Phase 99 sensitive-evidence guard rather than inventing a
 * second list of forbidden patterns, and adds the one thing a verdict summary
 * must additionally never contain: a raw evidence document.
 *
 * Offline; reads one file; writes nothing.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { assertNoSensitiveEvidence } from "../security/phase99/external-evidence.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const target = join(REPO, "phase100-ga-closure.json");

if (!existsSync(target)) {
  console.error("[phase100-hygiene] phase100-ga-closure.json is absent — run the closure evaluator first");
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(target, "utf8"));
} catch (err) {
  console.error(`[phase100-hygiene] phase100-ga-closure.json is not parseable JSON: ${String(err?.message ?? err)}`);
  process.exit(1);
}

const errors = [];
assertNoSensitiveEvidence(summary, errors);

/** Keys that would mean an evidence body leaked into the published verdict. */
const FORBIDDEN_KEYS = [
  "reportReference",
  "reportSha256",
  "rawReportReference",
  "rawReportSha256",
  "reviewerOrganizationAlias",
  "pilotId",
  "evidenceReference",
  "custodyEvidenceReference",
  "authorizationEvidenceReference",
  "approvedDocuments",
  "reviews",
];
const walk = (value, path) => {
  if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(k)) errors.push(`${path}.${k}: an evidence field must not appear in the published verdict`);
      walk(v, `${path}.${k}`);
    }
  }
};
walk(summary, "summary");

// A verdict summary states outcomes; the only sha-256-shaped value it may carry
// is none at all. The expected release commit is a 40-char git sha, not a digest.
const digests = [];
const findDigests = (value, path) => {
  if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) digests.push(path);
  else if (Array.isArray(value)) value.forEach((v, i) => findDigests(v, `${path}[${i}]`));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) findDigests(v, `${path}.${k}`);
};
findDigests(summary, "summary");
for (const d of digests) errors.push(`${d}: a sha-256 digest must not appear in the published verdict`);

if (errors.length > 0) {
  console.error("[phase100-hygiene] FAIL — the published summary is not safe to publish:");
  for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("RESULT phase100_summary_hygiene=PASS");
console.log(`RESULT phase100_summary_gates=${Object.keys(summary.gates ?? {}).length}`);
process.exit(0);

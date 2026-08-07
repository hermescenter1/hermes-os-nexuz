/**
 * PHASE 99 — adversarial public-repository data-hygiene scanner.
 *
 * `hermes-os-nexuz` is public. Everything Phase 99 produces — findings, review
 * packages, pilot documents, evidence records — is therefore readable by anyone,
 * including whoever might attack the platform. This scanner is the mechanical
 * guard on that boundary: it reads the Phase 99 artefact set and fails on
 * anything that would hand an attacker a working exploit, a credential, a real
 * customer identity, or internal network topology.
 *
 * It is deliberately adversarial about its OWN corpus: the scanner's pattern
 * list lives here, but the patterns are applied to files, not to itself, and the
 * self-exclusion is by exact path so a future file cannot silently opt out.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Files that legitimately contain the patterns because they DEFINE them.
 *
 * Every entry here is itself a secret DETECTOR: the "match" is a regex literal
 * describing what a leaked credential looks like, not a credential. The list is
 * by exact path so a new file can never opt itself out silently.
 */
const SELF_EXCLUDED = new Set([
  "scripts/security/phase99/data-hygiene.mjs",
  "scripts/security/phase99/external-evidence.mjs",
  // Earlier phases' secret-leak scanners, which carry the same pattern set.
  "scripts/ci/phase96-billing-governance-eval.mjs",
  "scripts/ci/phase97-compliance-governance-eval.mjs",
  "scripts/dr/secret-scan.mjs",
  "scripts/security/check-env-example.mjs",
]);

/**
 * Categories of content that must never be committed to the public repository.
 * Each rule carries the reason so a failure message is actionable rather than
 * just a regex dump.
 */
export const HYGIENE_RULES = [
  { id: "PRIVATE_KEY", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: "private key material" },
  { id: "PROVIDER_KEY", re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/, why: "payment/provider API key" },
  { id: "WEBHOOK_SECRET", re: /\bwhsec_[A-Za-z0-9]{10,}/, why: "webhook signing secret" },
  { id: "AWS_KEY", re: /\bAKIA[0-9A-Z]{16}\b/, why: "cloud access key id" },
  { id: "BEARER_TOKEN", re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/, why: "bearer token" },
  { id: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, why: "signed token" },
  { id: "PRODUCTION_IP", re: /\b185\.80\.196\.163\b/, why: "production host IP address" },
  { id: "EXPLOIT_SQLI", re: /(?:'|%27)\s*(?:OR|AND)\s+(?:'?1'?\s*=\s*'?1|1\s*=\s*1)/i, why: "working SQL-injection payload" },
  { id: "EXPLOIT_XSS", re: /<\s*script[^>]*>\s*(?:alert|fetch|document\.cookie)/i, why: "working XSS payload" },
  { id: "EXPLOIT_TRAVERSAL", re: /(?:\.\.\/){3,}(?:etc\/passwd|windows\/win\.ini)/i, why: "working path-traversal payload" },
  { id: "METADATA_ENDPOINT", re: /169\.254\.169\.254/, why: "live cloud metadata endpoint address" },
];

/** Recursively list files under a root, skipping build output and vendor trees. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Textual file extensions worth scanning (binary evidence is rejected elsewhere). */
const TEXT_EXT = /\.(md|json|mjs|js|ts|tsx|yml|yaml|txt|sh|env|example)$/i;

/**
 * Scan the Phase 99 artefact roots. Returns `{ ok, violations, filesScanned }`.
 * A violation records file, line, rule id and reason — never the matched text,
 * because echoing the secret into CI logs would defeat the purpose.
 */
export function scanPhase99Artifacts(repoRoot, roots = DEFAULT_ROOTS) {
  const violations = [];
  let filesScanned = 0;

  for (const root of roots) {
    const abs = join(repoRoot, ...root.split("/"));
    const files = statSync_safe(abs) ? (isDir(abs) ? walk(abs) : [abs]) : [];
    for (const file of files) {
      const rel = relative(repoRoot, file).split(sep).join("/");
      if (SELF_EXCLUDED.has(rel)) continue;
      if (!TEXT_EXT.test(file)) continue;
      filesScanned += 1;
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const rule of HYGIENE_RULES) {
          if (rule.re.test(line)) violations.push({ file: rel, line: i + 1, rule: rule.id, why: rule.why });
        }
      });
    }
  }

  return { ok: violations.length === 0, violations, filesScanned };
}

function statSync_safe(p) { try { return statSync(p); } catch { return null; } }
function isDir(p) { const s = statSync_safe(p); return s ? s.isDirectory() : false; }

/** Artefact roots Phase 99 owns. Adding a root here widens the guarantee. */
export const DEFAULT_ROOTS = [
  "docs/security",
  "docs/pilot",
  "scripts/security/phase99",
  "scripts/ci",
  ".github/workflows",
  "SECURITY.md",
];

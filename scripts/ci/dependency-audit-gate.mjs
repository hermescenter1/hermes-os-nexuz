#!/usr/bin/env node
/**
 * GOVERNED DEPENDENCY AUDIT GATE.
 *
 *   npm run gate:dependency-audit
 *
 * ── WHAT THIS IS, PRECISELY ─────────────────────────────────────────────────
 * This gate is NOT equivalent to raw zero-HIGH enforcement. It is stricter than
 * the `npm audit --audit-level=high` step it replaced in several specific
 * directions, and it is deliberately more permissive in exactly one: it allows a
 * fixed, enumerated, dated list of dev-only HIGH findings to pass while they have
 * no published fix. Both halves of that sentence matter, and the governance
 * document spells out the trade rather than calling the gate "stricter" flatly.
 *
 * Stricter than the raw command for:
 *   · production HIGH or CRITICAL — no exception mechanism exists for these;
 *   · any CRITICAL anywhere — never exceptionable;
 *   · any new or unapproved HIGH;
 *   · dependency-path drift, propagation-chain drift and production reachability;
 *   · an exception that has expired, gone stale, or become fixable in range;
 *   · malformed, truncated, empty or unknown-shaped audit output, which BLOCKS.
 *
 * More permissive for, and only for: the enumerated dev-only HIGH findings in
 * `docs/security/dependency-audit-exceptions.json`, until their expiry date.
 * Those are UNRESOLVED RISKS, labelled `ACCEPTED_TEMPORARY_DEV_ONLY_RISK`. They
 * are never reported as fixed.
 *
 * ── WHY AN EXCEPTION LIST EXISTS AT ALL ─────────────────────────────────────
 * On 2026-10-03 a HIGH advisory landed in `braces`, whose latest published
 * version IS inside the advisory range, reachable only through `tailwindcss@3`
 * and `eslint-config-next@15`. A raw gate then offers two bad options — lower the
 * bar for everything, or take an unreviewed design-system major — and a gate with
 * no third option is exactly how `--audit-level=critical` ends up committed.
 *
 * ── ONE-TO-ONE, FAIL-CLOSED ─────────────────────────────────────────────────
 * Every manifest entry must match EXACTLY ONE current residual HIGH finding, and
 * every accepted finding must be claimed by EXACTLY ONE entry. An entry that
 * matches nothing FAILS (`STALE_OR_ORPHANED_EXCEPTION`) rather than warning: a
 * dormant authorization is how a vulnerable version gets silently re-admitted
 * later. When an upstream fix removes a finding, CI fails until the obsolete
 * entry is deleted — and once deleted, a reintroduced vulnerable version is an
 * ordinary `UNAPPROVED_HIGH`.
 *
 * ── INDEPENDENT CORROBORATION ───────────────────────────────────────────────
 * Two claims are never taken from npm's prose alone:
 *   · dependency paths must exist in the installed `package-lock.json` graph;
 *   · `devOnly` must be proven twice — absence from the production audit AND
 *     `dev: true` on every one of the finding's lockfile nodes.
 *
 * ── OUTPUT SAFETY ───────────────────────────────────────────────────────────
 * Only package names, normalized severities, public advisory identifiers,
 * `node_modules/...` paths and status tokens are printed. No registry token, no
 * environment value, no credential, no lockfile integrity hash. Only stdout from
 * `npm audit --json` is parsed, so nothing written to stderr can influence the
 * verdict.
 *
 * ── EXIT CODES ──────────────────────────────────────────────────────────────
 *   0  PASS     — production clean, no critical, every HIGH exactly approved.
 *   1  FAIL     — an invariant does not hold.
 *   2  BLOCKED  — the audit or lockfile could not be read, or a date (the
 *                 evaluation date, or a manifest `created`/`expires`) is not a
 *                 real calendar date. Never a PASS.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ACCEPTED_LABEL = "ACCEPTED_TEMPORARY_DEV_ONLY_RISK";
export const MANIFEST_RELATIVE_PATH = "docs/security/dependency-audit-exceptions.json";
export const MANIFEST_SCHEMA_VERSION = 1;

/** How long `npm audit` may take before the gate blocks rather than hanging CI. */
export const AUDIT_TIMEOUT_MS = 180_000;

/** Severity words npm emits, mapped onto the closed set this gate decides on. */
const SEVERITY_ALIASES = new Map([
  ["critical", "CRITICAL"],
  ["high", "HIGH"],
  ["moderate", "MODERATE"],
  ["low", "LOW"],
  ["info", "INFO"],
]);

/**
 * Map one npm severity word. An UNRECOGNISED word returns null and the caller
 * must treat it as unknown-schema, which BLOCKS — a severity this gate cannot
 * rank must never be silently ignored.
 */
export function normalizeAuditSeverity(raw) {
  if (typeof raw !== "string") return null;
  return SEVERITY_ALIASES.get(raw.trim().toLowerCase()) ?? null;
}

/** The public advisory identifier, taken from the advisory URL (e.g. GHSA-…). */
function advisoryIdFromUrl(url) {
  if (typeof url !== "string") return null;
  const tail = url.split("/").filter(Boolean).pop();
  return tail && /^GHSA-[a-z0-9-]+$/i.test(tail) ? tail : null;
}

/**
 * A `node_modules/...` path this gate is willing to reason about.
 *
 * Normalization tricks are REJECTED rather than normalized away: `..`, a
 * backslash, a doubled slash, a leading `./`, a trailing slash and an absolute
 * path would all let two spellings of the same path disagree about whether they
 * match a manifest entry. One spelling is allowed, and it is the one npm and the
 * lockfile both use.
 */
export function isAcceptableDependencyPath(p) {
  if (typeof p !== "string" || p.trim() !== p || p === "") return false;
  if (!p.startsWith("node_modules/")) return false;
  if (p.includes("\\") || p.includes("//") || p.endsWith("/")) return false;
  if (p.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return false;
  if (/[*?]/.test(p)) return false;
  return true;
}

/**
 * Convert an `npm audit --json` payload into the rows this gate decides on.
 *
 * Returns `{ ok, rows, errors }`. `ok: false` means the payload did not have the
 * shape this gate understands, which BLOCKS rather than passing.
 */
export function extractAuditRows(auditJson) {
  const errors = [];
  if (!auditJson || typeof auditJson !== "object" || Array.isArray(auditJson)) {
    return { ok: false, rows: [], errors: ["audit payload is not an object"] };
  }
  const vulns = auditJson.vulnerabilities;
  if (vulns === undefined) {
    return { ok: false, rows: [], errors: ["audit payload has no `vulnerabilities` key"] };
  }
  if (vulns === null || typeof vulns !== "object" || Array.isArray(vulns)) {
    return { ok: false, rows: [], errors: ["audit payload `vulnerabilities` is not a map"] };
  }
  const meta = auditJson.metadata?.vulnerabilities;
  if (meta !== undefined && (meta === null || typeof meta !== "object")) {
    return { ok: false, rows: [], errors: ["audit payload `metadata.vulnerabilities` is not an object"] };
  }

  /**
   * The advisory identifiers a finding ultimately rests on.
   *
   * Most residual findings in this repository are INHERITED: npm reports
   * `tailwindcss` as HIGH with `via: ["chokidar", "fast-glob", "micromatch"]`
   * and no advisory object of its own, because the vulnerability is in `braces`
   * far below it. Accepting such a finding by package name alone would accept
   * whatever future advisory happens to propagate through the same chain, so the
   * gate walks `via` down to the real advisories and the manifest must name
   * those exactly.
   *
   * An unknown `via` string is an ERROR, not an empty set: silently ignoring a
   * reference the payload does not define is exactly how a new root advisory
   * would be lost.
   */
  function rootAdvisoryIds(name, seen = new Set()) {
    if (seen.has(name)) return []; // cycle guard: a chain may not revisit a node
    seen.add(name);
    const v = vulns[name];
    if (!v) {
      errors.push(`via references '${name}', which the audit payload does not define`);
      return [];
    }
    const out = new Set();
    for (const entry of Array.isArray(v.via) ? v.via : []) {
      if (entry && typeof entry === "object") {
        const id = advisoryIdFromUrl(entry.url);
        if (id) out.add(id);
        else errors.push(`advisory for ${name} has no recognisable identifier`);
      } else if (typeof entry === "string") {
        for (const id of rootAdvisoryIds(entry, seen)) out.add(id);
      } else {
        errors.push(`via entry for ${name} is neither an advisory object nor a package name`);
      }
    }
    return [...out].sort();
  }

  const rows = [];
  for (const [name, v] of Object.entries(vulns)) {
    const severity = normalizeAuditSeverity(v?.severity);
    if (!severity) {
      errors.push(`unknown severity '${String(v?.severity)}' for ${name}`);
      continue;
    }
    const via = Array.isArray(v?.via) ? v.via : [];
    const roots = rootAdvisoryIds(name);
    if (roots.length === 0 && (severity === "HIGH" || severity === "CRITICAL")) {
      // A high finding that resolves to no advisory at all is a shape this gate
      // does not understand; refuse rather than treat it as approvable.
      errors.push(`${name} is ${severity} but resolves to no advisory identifier`);
    }
    const paths = [...new Set((Array.isArray(v?.nodes) ? v.nodes : []).map(String))].sort();
    if ((severity === "HIGH" || severity === "CRITICAL") && paths.some((p) => !isAcceptableDependencyPath(p))) {
      errors.push(`${name} reports a dependency path this gate will not interpret`);
    }
    rows.push({
      package: name,
      severity,
      // `fixAvailable === true` is npm's signal that an IN-RANGE update clears
      // the finding. An object means the fix requires moving some other package,
      // usually across a major. Only the former counts as "a safe compatible
      // release exists", and it is what makes an exception obsolete.
      fixAvailableInRange: v?.fixAvailable === true,
      paths,
      advisoryIds: roots,
      // The propagation chain, verbatim. An exception is pinned to it, so a new
      // parent appearing in the chain stops matching and fails.
      inheritedFrom: [...new Set(via.filter((x) => typeof x === "string").map(String))].sort(),
    });
  }
  rows.sort((a, b) => a.package.localeCompare(b.package));
  // Errors collected above are schema problems, not findings: refuse to decide.
  return { ok: errors.length === 0, rows, errors };
}

/**
 * Index the installed lockfile graph so claimed paths can be corroborated
 * independently of npm's audit prose.
 */
export function indexLockfile(lockJson) {
  if (!lockJson || typeof lockJson !== "object" || Array.isArray(lockJson)) {
    return { ok: false, nodes: new Map(), errors: ["lockfile is not an object"] };
  }
  if (lockJson.lockfileVersion !== 3) {
    return { ok: false, nodes: new Map(), errors: [`unsupported lockfileVersion ${String(lockJson.lockfileVersion)}`] };
  }
  const packages = lockJson.packages;
  if (!packages || typeof packages !== "object" || Array.isArray(packages)) {
    return { ok: false, nodes: new Map(), errors: ["lockfile has no `packages` map"] };
  }
  const nodes = new Map();
  for (const [path, node] of Object.entries(packages)) {
    if (path === "") continue; // the root project
    nodes.set(path, {
      // `dev: true` marks a node reachable only through devDependencies.
      dev: node?.dev === true,
      // The last `node_modules/` segment is the installed package name.
      name: path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length),
      version: typeof node?.version === "string" ? node.version : null,
    });
  }
  return { ok: nodes.size > 0, nodes, errors: nodes.size > 0 ? [] : ["lockfile `packages` map is empty"] };
}

const REQUIRED_ENTRY_FIELDS = [
  "advisoryIds",
  "package",
  "paths",
  "inheritedFrom",
  "devOnly",
  "owner",
  "reason",
  "created",
  "expires",
  "futureRemediation",
];

const WILDCARD = /[*?]/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real Gregorian calendar date in strict `yyyy-mm-dd` form.
 *
 * The shape alone is not enough: `2026-00-00` and `2026-02-30` match the pattern
 * and compare as strings, so an evaluation date that is not on the calendar
 * would slip past every expiry, and an impossible expiry such as `2026-99-99`
 * would keep an acceptance alive long after any real date. The value must
 * round-trip through a UTC date unchanged. `setUTCFullYear` is used rather than
 * `Date.UTC`, which silently maps years 0–99 onto 1900–1999.
 */
function isCalendarDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Validate the exception manifest structurally, before any finding is compared
 * against it. Every failure here is a FAIL, not a warning: a manifest this gate
 * cannot trust is worse than no manifest, because it would silence real
 * findings.
 *
 * `uninterpretable` is the subset the gate cannot even evaluate: a `created` or
 * `expires` that is missing or not on the calendar. Expiry cannot be decided
 * against such a value, so the caller BLOCKS on it rather than failing.
 */
export function validateManifest(manifest) {
  const errors = [];
  const uninterpretable = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { ok: false, errors: ["manifest is not an object"], uninterpretable, entries: [] };
  }
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    errors.push(`manifest schemaVersion must be ${MANIFEST_SCHEMA_VERSION}`);
  }
  const raw = manifest.exceptions;
  if (!Array.isArray(raw)) {
    return { ok: false, errors: [...errors, "manifest `exceptions` is not an array"], uninterpretable, entries: [] };
  }

  const seenKey = new Map();
  const seenPath = new Map();
  const entries = [];
  raw.forEach((entry, i) => {
    const at = `exceptions[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${at} is not an object`);
      return;
    }
    for (const field of REQUIRED_ENTRY_FIELDS) {
      if (entry[field] === undefined || entry[field] === null || entry[field] === "") {
        errors.push(`${at} is missing required field '${field}'`);
      }
    }
    if (typeof entry.package !== "string" || entry.package.trim() === "") {
      errors.push(`${at}.package must be a non-empty string`);
    } else if (WILDCARD.test(entry.package)) {
      errors.push(`${at}.package must not contain a wildcard`);
    } else if (entry.package.trim() !== entry.package) {
      errors.push(`${at}.package must not be padded with whitespace`);
    }
    if (!Array.isArray(entry.advisoryIds) || entry.advisoryIds.length === 0) {
      errors.push(`${at}.advisoryIds must be a non-empty array`);
    } else {
      for (const id of entry.advisoryIds) {
        if (typeof id !== "string" || !/^GHSA-[a-z0-9-]+$/i.test(id)) {
          errors.push(`${at}.advisoryIds contains an invalid identifier`);
        } else if (WILDCARD.test(id)) {
          errors.push(`${at}.advisoryIds must not contain a wildcard`);
        }
      }
      const lowered = entry.advisoryIds.map((x) => String(x).toLowerCase());
      if (new Set(lowered).size !== lowered.length) {
        errors.push(`${at}.advisoryIds repeats an identifier`);
      }
    }
    if (!Array.isArray(entry.paths) || entry.paths.length === 0) {
      errors.push(`${at}.paths must be a non-empty array`);
    } else {
      for (const p of entry.paths) {
        if (!isAcceptableDependencyPath(p)) {
          errors.push(`${at}.paths contains a path this gate will not interpret: ${JSON.stringify(p)}`);
        }
      }
      if (new Set(entry.paths.map(String)).size !== entry.paths.length) {
        errors.push(`${at}.paths repeats a path`);
      }
      // Two entries may not claim the same installed path, in either case
      // spelling: that is how one finding would end up doubly authorized.
      for (const p of entry.paths) {
        const key = String(p).toLowerCase();
        if (seenPath.has(key)) errors.push(`${at}.paths claims ${JSON.stringify(p)} already claimed by ${seenPath.get(key)}`);
        else seenPath.set(key, at);
      }
    }
    // `inheritedFrom` MAY be empty (the finding carries its own advisory), but it
    // must be an array and must never be a wildcard.
    if (!Array.isArray(entry.inheritedFrom)) {
      errors.push(`${at}.inheritedFrom must be an array`);
    } else {
      for (const p of entry.inheritedFrom) {
        if (typeof p !== "string" || p.trim() === "") errors.push(`${at}.inheritedFrom contains an empty package name`);
        else if (WILDCARD.test(p)) errors.push(`${at}.inheritedFrom must not contain a wildcard`);
      }
    }
    // A production exception is not expressible: requirement, not preference.
    if (entry.devOnly !== true) errors.push(`${at}.devOnly must be exactly true`);
    if (typeof entry.owner !== "string" || entry.owner.trim() === "") errors.push(`${at}.owner must be a non-empty string`);
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 20) {
      errors.push(`${at}.reason must be a substantive string`);
    }
    for (const field of ["created", "expires"]) {
      if (!isCalendarDate(entry[field])) {
        const message = `${at}.${field} must be an ISO yyyy-mm-dd date`;
        errors.push(message);
        uninterpretable.push(message);
      }
    }
    if (isCalendarDate(entry.created) && isCalendarDate(entry.expires) && entry.expires <= entry.created) {
      errors.push(`${at}.expires must be after .created`);
    }

    // Case-insensitive duplicate detection: `BRACES` and `braces` are the same
    // npm package, and a second spelling must not become a second authorization.
    const key = `${String(entry.package).toLowerCase()}::${[...(entry.advisoryIds ?? [])]
      .map((x) => String(x).toLowerCase())
      .sort()
      .join(",")}`;
    if (seenKey.has(key)) errors.push(`${at} duplicates ${seenKey.get(key)} for the same package and advisory set`);
    else seenKey.set(key, at);

    entries.push({
      ...entry,
      advisoryIds: [...new Set((entry.advisoryIds ?? []).map(String))].sort(),
      paths: [...new Set((entry.paths ?? []).map(String))].sort(),
      inheritedFrom: [...new Set((Array.isArray(entry.inheritedFrom) ? entry.inheritedFrom : []).map(String))].sort(),
      _at: at,
    });
  });

  return { ok: errors.length === 0, errors, uninterpretable, entries };
}

const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Decide the gate.
 *
 * `full` / `prod` are the parse results of `npm audit --json` and
 * `npm audit --omit=dev --json`. `lockfile` is the result of `indexLockfile`.
 * `now` is an ISO yyyy-mm-dd string so expiry is deterministic and testable
 * rather than dependent on the clock's time of day.
 *
 * EXPIRY SEMANTICS, stated once: `expires` is INCLUSIVE. An exception is valid
 * through the whole of its expiry date and fails from the first instant of the
 * following day, i.e. the gate fails when `now > expires` as ISO strings. That
 * string comparison is only meaningful between real calendar dates, so an
 * evaluation date that is not one BLOCKS (`INVALID_EVALUATION_DATE`), and so
 * does a manifest `created`/`expires` that is not one (`MANIFEST_INVALID`).
 */
export function evaluateAuditGate({ full, prod, manifest, lockfile, now }) {
  const failures = [];
  const blocks = [];
  const accepted = [];
  const warnings = [];

  if (!full || full.ok !== true) blocks.push({ code: "FULL_AUDIT_UNREADABLE", detail: (full?.errors ?? ["missing full audit"]).join("; ") });
  if (!prod || prod.ok !== true) blocks.push({ code: "PRODUCTION_AUDIT_UNREADABLE", detail: (prod?.errors ?? ["missing production audit"]).join("; ") });
  if (!lockfile || lockfile.ok !== true) blocks.push({ code: "LOCKFILE_UNREADABLE", detail: (lockfile?.errors ?? ["missing lockfile index"]).join("; ") });
  if (!isCalendarDate(now)) blocks.push({ code: "INVALID_EVALUATION_DATE", detail: String(now) });
  const m = validateManifest(manifest);
  for (const e of m.uninterpretable) blocks.push({ code: "MANIFEST_INVALID", detail: e });
  if (blocks.length > 0) {
    return { verdict: "BLOCKED", failures, blocks, accepted, warnings, summary: null, advisory: [] };
  }

  for (const e of m.errors) failures.push({ code: "MANIFEST_INVALID", detail: e });

  const prodPackages = new Set(prod.rows.map((r) => r.package));
  const prodBySeverity = (s) => prod.rows.filter((r) => r.severity === s);

  // The production graph has no exception mechanism at all.
  for (const r of [...prodBySeverity("CRITICAL"), ...prodBySeverity("HIGH")]) {
    failures.push({ code: "PRODUCTION_HIGH_OR_CRITICAL", package: r.package, severity: r.severity, paths: r.paths, advisoryIds: r.advisoryIds });
  }

  // A CRITICAL anywhere is never exceptionable — checked before any matching, so
  // no manifest entry can reach it.
  for (const r of full.rows.filter((r) => r.severity === "CRITICAL")) {
    failures.push({ code: "FULL_TREE_CRITICAL", package: r.package, paths: r.paths, advisoryIds: r.advisoryIds });
  }

  // Every HIGH must be absent or EXACTLY approved, one entry to one finding.
  const highs = full.rows.filter((r) => r.severity === "HIGH");
  const claimsByEntry = new Map(m.entries.map((e) => [e._at, []]));

  for (const r of highs) {
    const candidates = m.entries.filter((e) => String(e.package).toLowerCase() === r.package.toLowerCase());
    if (candidates.length === 0) {
      failures.push({ code: "UNAPPROVED_HIGH", package: r.package, paths: r.paths, advisoryIds: r.advisoryIds });
      continue;
    }
    // EXACT equality, not containment: an entry approves one advisory set, so a
    // new advisory entering the chain stops matching instead of riding along.
    const matching = candidates.filter((e) => sameSet(e.advisoryIds, r.advisoryIds));
    if (matching.length === 0) {
      failures.push({ code: "UNAPPROVED_ADVISORY_ID", package: r.package, observed: r.advisoryIds, approved: candidates.flatMap((c) => c.advisoryIds) });
      continue;
    }
    if (matching.length > 1) {
      // A finding may be accepted by exactly one entry.
      failures.push({ code: "DUPLICATE_EXCEPTION_CLAIM", package: r.package, entries: matching.map((e) => e._at) });
      for (const e of matching) claimsByEntry.get(e._at).push(r.package);
      continue;
    }
    const entry = matching[0];
    claimsByEntry.get(entry._at).push(r.package);

    if (!sameSet(entry.paths, r.paths)) {
      failures.push({ code: "DEPENDENCY_PATH_CHANGED", package: r.package, observed: r.paths, approved: entry.paths });
      continue;
    }
    if (!sameSet(entry.inheritedFrom, r.inheritedFrom)) {
      failures.push({ code: "PROPAGATION_CHAIN_CHANGED", package: r.package, observed: r.inheritedFrom, approved: entry.inheritedFrom });
      continue;
    }
    // Corroborate the paths against the installed graph rather than trusting the
    // audit's own prose, and prove the package name at each path.
    const unknownPaths = r.paths.filter((p) => !lockfile.nodes.has(p));
    if (unknownPaths.length > 0) {
      failures.push({ code: "PATH_NOT_IN_LOCKFILE", package: r.package, paths: unknownPaths });
      continue;
    }
    const misnamed = r.paths.filter((p) => lockfile.nodes.get(p).name !== r.package);
    if (misnamed.length > 0) {
      failures.push({ code: "PATH_PACKAGE_MISMATCH", package: r.package, paths: misnamed });
      continue;
    }
    // `devOnly` is proven twice, independently: absence from the production
    // audit, and `dev: true` on every lockfile node the finding occupies.
    if (prodPackages.has(r.package)) {
      failures.push({ code: "APPROVED_ADVISORY_REACHABLE_FROM_PRODUCTION", package: r.package, paths: r.paths });
      continue;
    }
    const notDev = r.paths.filter((p) => lockfile.nodes.get(p).dev !== true);
    if (notDev.length > 0) {
      failures.push({ code: "DEV_ONLY_NOT_PROVEN_BY_LOCKFILE", package: r.package, paths: notDev });
      continue;
    }
    if (r.fixAvailableInRange) {
      failures.push({ code: "SAFE_COMPATIBLE_VERSION_NOW_EXISTS", package: r.package, advisoryIds: r.advisoryIds });
      continue;
    }
    if (String(now) > String(entry.expires)) {
      failures.push({ code: "EXCEPTION_EXPIRED", package: r.package, expires: entry.expires, evaluatedAt: now });
      continue;
    }
    accepted.push({
      status: ACCEPTED_LABEL,
      package: r.package,
      advisoryIds: r.advisoryIds,
      paths: r.paths,
      inheritedFrom: r.inheritedFrom,
      expires: entry.expires,
      futureRemediation: entry.futureRemediation,
    });
  }

  // An entry that matches nothing FAILS. A dormant authorization is how a
  // vulnerable version gets silently re-admitted after an upstream fix, so the
  // obsolete entry must be deleted rather than left behind.
  for (const e of m.entries) {
    const claims = claimsByEntry.get(e._at) ?? [];
    if (claims.length === 0) {
      failures.push({ code: "STALE_OR_ORPHANED_EXCEPTION", at: e._at, package: e.package, advisoryIds: e.advisoryIds });
    } else if (claims.length > 1) {
      failures.push({ code: "AMBIGUOUS_EXCEPTION_MATCH", at: e._at, package: e.package, claimed: claims });
    }
  }

  // Everything below HIGH stays visible, and is never a failure here.
  const advisory = full.rows
    .filter((r) => r.severity === "MODERATE" || r.severity === "LOW" || r.severity === "INFO")
    .map((r) => ({ package: r.package, severity: r.severity, productionReachable: prodPackages.has(r.package), advisoryIds: r.advisoryIds }));

  const count = (rows, s) => rows.filter((r) => r.severity === s).length;
  const has = (code) => failures.filter((f) => f.code === code).length;
  const summary = {
    full: {
      critical: count(full.rows, "CRITICAL"),
      high: count(full.rows, "HIGH"),
      moderate: count(full.rows, "MODERATE"),
      low: count(full.rows, "LOW"),
      info: count(full.rows, "INFO"),
    },
    production: {
      critical: count(prod.rows, "CRITICAL"),
      high: count(prod.rows, "HIGH"),
      moderate: count(prod.rows, "MODERATE"),
      low: count(prod.rows, "LOW"),
      info: count(prod.rows, "INFO"),
    },
    acceptedDevOnlyHigh: accepted.length,
    unapprovedHigh: has("UNAPPROVED_HIGH") + has("UNAPPROVED_ADVISORY_ID"),
    staleExceptions: has("STALE_OR_ORPHANED_EXCEPTION"),
    expiredExceptions: has("EXCEPTION_EXPIRED"),
    productionExceptions: has("APPROVED_ADVISORY_REACHABLE_FROM_PRODUCTION"),
  };

  return {
    verdict: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    blocks,
    accepted,
    warnings,
    summary,
    advisory,
  };
}

/* ───────────────────────────── CLI ───────────────────────────── */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The subset of a `spawnSync` result this gate reads. Declared so a test can
 * inject a double without having to fabricate a whole `SpawnSyncReturns`.
 *
 * @typedef {{ status?: number | null, signal?: string | null, error?: (Error & { code?: string }) | null, stdout?: unknown, stderr?: unknown }} AuditSpawnResult
 * @typedef {(command: string, args: string[], options: Record<string, unknown>) => AuditSpawnResult | undefined} AuditSpawn
 */

/**
 * Run one audit and return a parse result.
 *
 * `npm audit` exits 1 simply because it FOUND something, which is the normal case
 * here, so the exit code alone cannot distinguish "findings" from "failure".
 * Everything that is genuinely a failure to OBSERVE — a spawn error, a signal, an
 * exit status above 1, a timeout, empty stdout, truncated JSON — returns
 * `ok: false` and blocks. Only stdout is parsed: nothing on stderr can influence
 * the verdict.
 *
 * @param {string[]} extraArgs
 * @param {{ spawn?: AuditSpawn, cwd?: string, timeout?: number }} [options]
 */
export function runAudit(extraArgs, { spawn = /** @type {AuditSpawn} */ (spawnSync), cwd = REPO, timeout = AUDIT_TIMEOUT_MS } = {}) {
  const res = spawn("npm", ["audit", "--json", ...extraArgs], {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
  const fail = (reason) => ({ ok: false, rows: [], errors: [reason] });

  if (!res || typeof res !== "object") return fail("npm audit produced no result object");
  if (res.error) return fail(`npm audit could not run (${res.error.code ?? "spawn error"})`);
  if (res.signal) return fail(`npm audit was terminated by signal ${res.signal}`);
  if (typeof res.status === "number" && res.status > 1) return fail(`npm audit exited with status ${res.status}`);
  if (res.status === null && !res.signal) return fail("npm audit did not report an exit status");
  if (typeof res.stdout !== "string" || res.stdout.trim() === "") return fail("npm audit produced no output on stdout");

  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    return fail("npm audit output was not parseable JSON");
  }
  return extractAuditRows(parsed);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const manifestPath = join(REPO, ...MANIFEST_RELATIVE_PATH.split("/"));
  if (!existsSync(manifestPath)) {
    console.error(`[dependency-audit-gate] BLOCKED: exception manifest missing at ${MANIFEST_RELATIVE_PATH}`);
    process.exit(2);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    console.error("[dependency-audit-gate] BLOCKED: exception manifest is not valid JSON");
    process.exit(2);
  }

  let lockfile = { ok: false, nodes: new Map(), errors: ["package-lock.json missing"] };
  const lockPath = join(REPO, "package-lock.json");
  if (existsSync(lockPath)) {
    try {
      lockfile = indexLockfile(JSON.parse(readFileSync(lockPath, "utf8")));
    } catch {
      lockfile = { ok: false, nodes: new Map(), errors: ["package-lock.json is not valid JSON"] };
    }
  }

  const result = evaluateAuditGate({
    full: runAudit([]),
    prod: runAudit(["--omit=dev"]),
    manifest,
    lockfile,
    now: today(),
  });

  console.log("[dependency-audit-gate] governed dependency audit");
  if (result.summary) {
    const f = result.summary.full;
    const p = result.summary.production;
    console.log(`RESULT FULL_TREE          critical=${f.critical} high=${f.high} moderate=${f.moderate} low=${f.low}`);
    console.log(`RESULT PRODUCTION_TREE    critical=${p.critical} high=${p.high} moderate=${p.moderate} low=${p.low}`);
    console.log(`RESULT ACCEPTED_DEV_HIGH  ${result.summary.acceptedDevOnlyHigh}`);
    console.log(`RESULT STALE_EXCEPTIONS   ${result.summary.staleExceptions}`);
  }
  for (const a of result.accepted) {
    console.log(`${ACCEPTED_LABEL} ${a.package} advisories=${a.advisoryIds.join(",")} paths=${a.paths.join(",")} expires=${a.expires} next=${a.futureRemediation}`);
  }
  for (const a of result.advisory) {
    console.log(`ADVISORY_ONLY ${a.severity} ${a.package} production=${a.productionReachable} advisories=${a.advisoryIds.join(",")}`);
  }
  for (const w of result.warnings) {
    console.log(`WARNING ${w.code} ${w.at ?? ""} ${w.package ?? ""}`);
  }
  for (const b of result.blocks) {
    console.error(`BLOCK ${b.code}: ${b.detail}`);
  }
  for (const f of result.failures) {
    const bits = Object.entries(f)
      .filter(([k]) => k !== "code")
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`)
      .join(" ");
    console.error(`FAIL ${f.code} ${bits}`);
  }

  // The BLOCKED line is deliberately free of the word that marks success, so no
  // log scraper can mistake a BLOCKED run for a passing one.
  if (result.verdict === "BLOCKED") {
    console.error("[dependency-audit-gate] BLOCKED — an input could not be read or interpreted; no verdict was reached.");
    process.exit(2);
  }
  if (result.verdict === "FAIL") {
    console.error(`[dependency-audit-gate] FAIL — ${result.failures.length} invariant(s) violated.`);
    process.exit(1);
  }
  console.log("[dependency-audit-gate] PASS — production clean, no critical, every HIGH exactly approved and unexpired.");
  console.log("[dependency-audit-gate] NOTE: accepted findings are NOT fixed. They are time-bounded dev-only risk acceptances.");
}

// Run only when invoked directly, so the pure functions above stay importable.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

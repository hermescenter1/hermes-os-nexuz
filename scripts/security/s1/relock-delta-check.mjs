#!/usr/bin/env node
/**
 * S1 current-main delta relock — provenance checker and renderer.
 *
 * Dependency-free (`node:` built-ins only). It reads from `risk-register-check.mjs`
 * (its vocabularies, its secret scan and its pinned snapshot) and changes nothing
 * there.
 *
 *   node scripts/security/s1/relock-delta-check.mjs generate   # recompute derived sections and blocks in place
 *   node scripts/security/s1/relock-delta-check.mjs check      # every gate; the first failing class sets the exit code
 *   node scripts/security/s1/relock-delta-check.mjs summary    # the computed counters as JSON
 *
 * Options (every path defaults to the repository layout under --root). One strict parser serves every mode: an
 * option is exactly --name=value, once; --layer is exactly 1 or 2 (no --layer means the first layer, by design);
 * anything else is a usage error (exit 2) raised before any file is read or written. See `parseArgs`.
 *   --layer=1|2 --root=DIR --data=FILE --report=FILE --register=FILE --inventory=FILE
 *   --adjudications=FILE --residual=FILE --record=FILE
 *
 * WHAT THE DOCUMENT IS. The canonical risk register (docs/security/s1-risk-register.json)
 * is the only place a severity, a production state, a score or a priority is written.
 * The delta document (docs/security/s1-relock-delta.json) holds provenance: the commit
 * range, the call-site linkage and the evidence behind each delta finding. It shows
 * severity only as a read-only PROJECTION of the register, which this tool recomputes
 * and compares byte for byte.
 *
 * WHAT IT PROVES. The provenance agrees with git, with the S0 inventory and with the
 * register; every derived figure is recomputed; every evidence anchor is a literal
 * string that still exists (or, for an absence, still does not); the report's
 * generated blocks equal what the renderer produces. It does NOT prove that a finding
 * is exploitable or that anything is mitigated.
 *
 * EXIT CODES. The failing gate of lowest order sets the code; a crash is never one of
 * the validation codes.
 *    0 OK                 2 USAGE              3 MISSING_FILE      4 MALFORMED_JSON
 *    5 SCHEMA             6 SOURCES            7 DERIVED_DRIFT     8 FINDINGS
 *    9 REPORT            10 CONTENT           11 PATH_OUTSIDE_DELTA 12 NOT_CANONICAL
 *   13 RECORD            70 INTERNAL_ERROR
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DELTA_DISPOSITIONS,
  DISPOSITION_STATUS,
  DELTA_FINDING_PREFIX,
  DELTA_FAMILY,
  secretShapeHits,
  staleProcessTextHits,
  policyViolations,
} from "./risk-register-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..", "..");

export const SCHEMA_VERSION = 2;
export const RELOCK_METHOD_VERSION = "s1-relock-2";

export const EXIT = Object.freeze({
  OK: 0,
  USAGE: 2,
  MISSING_FILE: 3,
  MALFORMED_JSON: 4,
  SCHEMA: 5,
  SOURCES: 6,
  DERIVED_DRIFT: 7,
  FINDINGS: 8,
  REPORT: 9,
  CONTENT: 10,
  PATH_OUTSIDE_DELTA: 11,
  NOT_CANONICAL: 12,
  RECORD: 13,
  INTERNAL_ERROR: 70,
});

/** The gate order: a lower index reports first. */
const CLASS_ORDER = Object.freeze(["MISSING_FILE", "MALFORMED_JSON", "SCHEMA", "SOURCES", "DERIVED_DRIFT", "FINDINGS", "PATH_OUTSIDE_DELTA", "REPORT", "RECORD", "CONTENT", "NOT_CANONICAL"]);

/**
 * The two relock layers keep their own provenance document, report and mutation record. The FIRST layer is
 * the relock of the frozen source onto the first target; the SECOND layer is the supplementary relock of the
 * delta between the first target and the current main. A layer is never overwritten by the next one.
 */
export const LAYERS = Object.freeze({
  FIRST: Object.freeze({ data: "s1-relock-delta.json", report: "S1-CURRENT-MAIN-DELTA-RELOCK.md", record: "s1-relock-mutation-record.json" }),
  SECOND: Object.freeze({ data: "s1-second-relock-delta.json", report: "S1-SECOND-DELTA-RELOCK.md", record: "s1-relock-mutation-record.json" }),
});

export const defaultPaths = (root = REPO_ROOT, layer = "FIRST") => ({
  root,
  data: join(root, "docs", "security", LAYERS[layer].data),
  report: join(root, "docs", "security", LAYERS[layer].report),
  register: join(root, "docs", "security", "s1-risk-register.json"),
  inventory: join(root, "docs", "security", "s0-getprisma-callsite-inventory.json"),
  adjudications: join(root, "scripts", "security", "s0", "getprisma-manual-adjudications.json"),
  residual: join(root, "scripts", "security", "s0", "getprisma-residual-reachability.json"),
  record: join(root, "docs", "security", LAYERS[layer].record),
});

export const S0_INVENTORY_REL = "docs/security/s0-getprisma-callsite-inventory.json";

/** Historical files and what the relock is allowed to do to them. */
export const HISTORICAL_FILES = Object.freeze([
  { path: "docs/security/s1-risk-register.json", role: "S1_ARTIFACT" },
  { path: "docs/security/THREAT-MODEL-AND-RISK-REGISTER.md", role: "S1_ARTIFACT" },
  { path: "scripts/security/s1/risk-register-check.mjs", role: "S1_ARTIFACT" },
  { path: "scripts/security/s1/__tests__/risk-register.selftest.mjs", role: "S1_ARTIFACT" },
  { path: "docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md", role: "S0_EVIDENCE" },
  { path: ".gitattributes", role: "CONFIGURATION" },
]);

export const STRICT_PRODUCT_RULE =
  "a changed path outside docs/, .github/ and scripts/ that is not a test file (a __tests__/ directory or a .test. or .spec. name) and is not .gitattributes";
export const BROAD_RUNTIME_RULE =
  "a changed path outside docs/ that is not a test file and is not .gitattributes, so it adds the workflows and the scripts to the strict set";

export const REACHABILITY = Object.freeze(["INTERNAL_ONLY_PURE_READ", "BACKGROUND_ONLY", "AUTHENTICATED_USER_VISIBLE", "PUBLICLY_REACHABLE", "SECURITY_CONTROL_DEPENDENCY"]);
export const ORIGINS = Object.freeze(["REVIEWER", "REMEDIATOR"]);
export const EVIDENCE_SCOPES = Object.freeze(["DELTA", "CONTEXT"]);
export const EVIDENCE_RULES = Object.freeze(["PRESENT", "ABSENT", "REGEX", "ABSENT_REGEX", "FN_BODY_REGEX", "BLOCK_REGEX", "TREE_ABSENT_REGEX", "CALLERS_LACK"]);

const SHA = /^[0-9a-f]{40}$/;
export const LEDGER_CHANGE_TYPES = Object.freeze(["A", "M", "D", "R"]);
export const LEDGER_DISPOSITIONS = Object.freeze([
  "FINDING_EVIDENCE",
  "POSITIVE_CONTROL_EVIDENCE",
  "REVIEWED_NO_SECURITY_EFFECT",
  "TEST_ONLY",
  "DOCUMENTATION_ONLY",
  "LOCALIZATION_COPY",
  "ASSURANCE_CONFIGURATION",
]);
export const LEDGER_METHODS = Object.freeze(["SOURCE_AND_DIFF_READ", "DIFF_READ", "PATH_AND_CONTENT_CLASSIFICATION"]);
export const LEDGER_CATEGORIES = Object.freeze([
  "ASSURANCE_CONFIG",
  "TEST",
  "DOCUMENTATION",
  "LOCALIZATION",
  "MIGRATION",
  "SCHEMA",
  "API_ROUTE",
  "PAGE",
  "UI_COMPONENT",
  "LIBRARY",
  "DEPLOY_AND_RUNTIME_CONFIG",
]);
/** The category a disposition may describe, where it describes one. */
const DISPOSITION_CATEGORY = Object.freeze({ TEST_ONLY: "TEST", DOCUMENTATION_ONLY: "DOCUMENTATION", LOCALIZATION_COPY: "LOCALIZATION", ASSURANCE_CONFIGURATION: "ASSURANCE_CONFIG" });
const LEDGER_FINDING_ID = /^RS-\d{3}$/;
const LEDGER_CONTROL_ID = /^RS-P\d{2}$/;

const FINDING_ID = /^(?:RL|RR|RS)-\d{3}$/;
const OBSERVATION_ID = /^R[LS]-P\d{2}$/;
/** The identifier prefixes a layer may use. A second-layer document never carries a first-layer id, or the reverse. */
export const LAYER_ID_PREFIXES = Object.freeze({ FIRST: Object.freeze(["RL", "RR"]), SECOND: Object.freeze(["RS"]) });
export const layerOf = (data) => data?.sources?.layer ?? "FIRST";
const idPrefix = (id) => String(id).split("-")[0];
const RISK_ID = /^R-\d{2}$/;

/* ── process helpers ───────────────────────────────────────────────────────── */

function git(args, root) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
}
function gitOk(args, root) {
  try {
    git(args, root);
    return true;
  } catch {
    return false;
  }
}
const hasCommit = (sha, root) => SHA.test(sha) && gitOk(["cat-file", "-e", `${sha}^{commit}`], root);
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const lf = (s) => s.replace(/\r\n?/g, "\n");
const readText = (p) => lf(readFileSync(p, "utf8"));
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* ── a small structural validator, so an unknown key is a failure and not a shrug ─ */

const T = {
  str: { t: "string" },
  text: { t: "string", min: 20 },
  bool: { t: "bool" },
  int: { t: "int" },
  sha: { t: "sha" },
  obj: (keys, optional = []) => ({ t: "object", keys, optional }),
  arr: (of, min = 0) => ({ t: "array", of, min }),
  en: (values) => ({ t: "enum", values }),
};

export function validateShape(node, spec, where, out) {
  const bad = (what) => out.push({ klass: "SCHEMA", code: "SCHEMA", detail: `${where}: ${what}` });
  switch (spec.t) {
    case "string":
      if (typeof node !== "string" || node.length < (spec.min ?? 1)) bad("expected a non-empty string");
      return;
    case "bool":
      if (typeof node !== "boolean") bad("expected a boolean");
      return;
    case "int":
      if (!Number.isInteger(node)) bad("expected an integer");
      return;
    case "sha":
      if (typeof node !== "string" || !SHA.test(node)) bad("expected a 40-hex commit id");
      return;
    case "enum":
      if (!spec.values.includes(node)) bad(`expected one of ${spec.values.join("|")}`);
      return;
    case "array":
      if (!Array.isArray(node)) return bad("expected an array");
      if (node.length < spec.min) bad(`expected at least ${spec.min} item(s)`);
      node.forEach((v, i) => validateShape(v, spec.of, `${where}[${i}]`, out));
      return;
    case "object": {
      if (node === null || typeof node !== "object" || Array.isArray(node)) return bad("expected an object");
      for (const k of Object.keys(node)) if (!(k in spec.keys)) out.push({ klass: "SCHEMA", code: "UNKNOWN_KEY", detail: `${where}: unknown key "${k}"` });
      for (const k of Object.keys(spec.keys)) {
        if (!(k in node)) {
          if (!spec.optional.includes(k)) out.push({ klass: "SCHEMA", code: "MISSING_KEY", detail: `${where}: missing key "${k}"` });
          continue;
        }
        validateShape(node[k], spec.keys[k], `${where}.${k}`, out);
      }
      return;
    }
    default:
      bad(`unknown spec ${spec.t}`);
  }
}

const EVIDENCE_SPEC = T.obj(
  { scope: T.en(EVIDENCE_SCOPES), path: T.str, anchor: T.str, absent: T.str, note: T.str, fact: T.str, rule: T.en(EVIDENCE_RULES), pattern: T.str, symbol: T.str, lacks: T.str },
  ["anchor", "absent", "fact", "rule", "pattern", "symbol", "lacks"],
);

/** The authored part of the document. Derived sections are validated by recomputation instead. */
const AUTHORED_SPEC = T.obj(
  {
    schemaVersion: T.int,
    phase: T.str,
    methodVersion: T.str,
    note: T.text,
    sources: T.obj(
      {
        frozenSourceSha: T.sha,
        securityHeadSha: T.sha,
        targetMainSha: T.sha,
        integrationMergeSha: T.sha,
        layer: T.en(["FIRST", "SECOND"]),
        originalFrozenSourceSha: T.sha,
        reconciledTreeSha: T.sha,
      },
      ["layer", "originalFrozenSourceSha", "reconciledTreeSha"],
    ),
    attribution: T.obj({ historicalBaseline: T.text, currentMainDelta: T.text, reconciledTree: T.text }),
    findings: T.arr(
      T.obj(
        {
          findingId: T.str,
          registerFindingId: T.str,
          origin: T.en(ORIGINS),
          title: T.str,
          summary: T.text,
          disposition: T.en(DELTA_DISPOSITIONS),
          canonicalRiskId: T.str,
          callsiteBacked: T.bool,
          relatedCallsiteIds: T.arr(T.str),
          callsiteRelation: T.text,
          evidence: T.arr(EVIDENCE_SPEC, 1),
        },
        ["callsiteRelation"],
      ),
      1,
    ),
    positiveControls: T.arr(T.obj({ id: T.str, title: T.str, evidence: T.arr(EVIDENCE_SPEC, 1) })),
    supersessions: T.arr(T.obj({ target: T.str, kind: T.str, statement: T.text })),
    openItems: T.arr(T.obj({ id: T.str, statement: T.text })),
    reviewedCallsites: T.arr(T.obj({ id: T.str, reachability: T.en(REACHABILITY), note: T.text }), 1),
    pathDispositions: T.arr(
      T.obj({
        path: T.str,
        changeType: T.en(LEDGER_CHANGE_TYPES),
        reviewedBlob: T.str,
        securityRelevant: T.bool,
        disposition: T.en(LEDGER_DISPOSITIONS),
        reason: T.text,
        findingIds: T.arr(T.str),
        positiveControlIds: T.arr(T.str),
        reviewerMethod: T.en(LEDGER_METHODS),
      }),
    ),
    sourceBehaviorChanges: T.arr(T.obj({ callsiteId: T.str, summary: T.text })),
  },
  ["pathDispositions", "sourceBehaviorChanges"],
);

/** Every top-level key the document may carry; anything else is an unknown key. */
const DERIVED_KEYS = Object.freeze(["delta", "getPrisma", "derivedFacts", "historicalFiles", "canonicalProjection", "topPriorities"]);
const TOP_ORDER = Object.freeze([
  "schemaVersion",
  "phase",
  "methodVersion",
  "note",
  "sources",
  "attribution",
  "delta",
  "getPrisma",
  "derivedFacts",
  "historicalFiles",
  "canonicalProjection",
  "topPriorities",
  "reviewedCallsites",
  "pathDispositions",
  "sourceBehaviorChanges",
  "findings",
  "positiveControls",
  "supersessions",
  "openItems",
]);

/* ── derived: the delta ────────────────────────────────────────────────────── */

export function isStrictProductPath(p) {
  if (p.startsWith("docs/") || p.startsWith(".github/") || p.startsWith("scripts/")) return false;
  if (p === ".gitattributes") return false;
  return !(/(^|\/)__tests__\//.test(p) || /\.(test|spec)\./.test(p));
}
export function isBroadRuntimePath(p) {
  if (p.startsWith("docs/") || p === ".gitattributes") return false;
  return !(/(^|\/)__tests__\//.test(p) || /\.(test|spec)\./.test(p));
}

export function deltaPathRows(sources, root) {
  return git(["diff", "--no-renames", "--name-status", sources.frozenSourceSha, sources.targetMainSha], root)
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [status, ...rest] = l.split("\t");
      return { status, path: rest.join("\t") };
    });
}

/* ── layer 2: the ledger of every changed path ─────────────────────────────── */


export function categoryOf(path) {
  if (path === ".gitattributes") return "ASSURANCE_CONFIG";
  if (/(^|\/)__tests__\//.test(path) || /\.(test|spec)\./.test(path)) return "TEST";
  if (path.startsWith("docs/")) return "DOCUMENTATION";
  if (path.startsWith("messages/")) return "LOCALIZATION";
  if (path.startsWith("prisma/migrations/")) return "MIGRATION";
  if (path === "prisma/schema.prisma") return "SCHEMA";
  if (path.startsWith("src/app/api/")) return "API_ROUTE";
  if (/^src\/app\/.*\/(page|layout)\.tsx$/.test(path)) return "PAGE";
  if (path.startsWith("src/components/")) return "UI_COMPONENT";
  if (path.startsWith("src/")) return "LIBRARY";
  return "DEPLOY_AND_RUNTIME_CONFIG";
}

const NO_BLOB = /^0{40}$/;

/**
 * Every changed path of the range as git reports it with rename detection: its change type, the path it came from
 * when it was renamed, and the blob it had at each end. A deleted path has no target blob, an added path no base blob.
 */
export function ledgerGitRows(sources, root) {
  const raw = git(["diff", "--raw", "--no-abbrev", "-M", "-z", sources.frozenSourceSha, sources.targetMainSha], root);
  const tokens = raw.split("\0");
  const rows = [];
  for (let i = 0; i < tokens.length; ) {
    const header = tokens[i++];
    if (!header) break;
    const m = /^:\d+ \d+ ([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Z])\d*$/.exec(header);
    if (!m) throw new Error("unreadable git diff header");
    const kind = m[3];
    const first = tokens[i++];
    const second = kind === "R" || kind === "C" ? tokens[i++] : null;
    rows.push({
      changeType: kind,
      path: second ?? first,
      previousPath: second === null ? null : first,
      baseBlob: NO_BLOB.test(m[1]) ? null : m[1],
      targetBlob: NO_BLOB.test(m[2]) ? null : m[2],
    });
  }
  return rows.sort((a, b) => byStr(a.path, b.path));
}

/**
 * The ledger: one row per changed path, git's facts merged with the reviewer's. A row is `reviewed` only when a
 * disposition was recorded for exactly this path, this change type and this blob. Everything the reviewer did not
 * record is reported by the counters (`missing`, `extra`, `duplicate`, `stale`) and by the gates, never filled in.
 */
export function buildPathLedger(sources, root, authored) {
  const gitRows = ledgerGitRows(sources, root);
  const byPath = new Map();
  const duplicate = new Set();
  for (const a of authored ?? []) {
    if (byPath.has(a.path)) duplicate.add(a.path);
    else byPath.set(a.path, a);
  }
  const rows = gitRows.map((g) => {
    const a = byPath.get(g.path);
    const reviewed = a !== undefined && a.changeType === g.changeType && a.reviewedBlob === (g.targetBlob ?? "ABSENT");
    return {
      path: g.path,
      previousPath: g.previousPath,
      changeType: g.changeType,
      strictProduct: isStrictProductPath(g.path),
      broadProduct: isBroadRuntimePath(g.path),
      category: categoryOf(g.path),
      securityRelevant: a ? a.securityRelevant : null,
      disposition: a ? a.disposition : null,
      reason: a ? a.reason : null,
      findingIds: a ? [...a.findingIds] : [],
      positiveControlIds: a ? [...a.positiveControlIds] : [],
      reviewed,
      reviewerMethod: a ? a.reviewerMethod : null,
      baseBlob: g.baseBlob,
      targetBlob: g.targetBlob,
    };
  });
  const gitPaths = new Set(gitRows.map((g) => g.path));
  const count = (f) => rows.filter(f).length;
  const tally = (key) => {
    const out = {};
    for (const r of rows) out[r[key] ?? "NONE"] = (out[r[key] ?? "NONE"] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort(([x], [y]) => byStr(x, y)));
  };
  return {
    rows,
    summary: {
      total: rows.length,
      uniquePaths: gitPaths.size,
      byChangeType: { A: count((r) => r.changeType === "A"), M: count((r) => r.changeType === "M"), D: count((r) => r.changeType === "D"), R: count((r) => r.changeType === "R") },
      byCategory: tally("category"),
      byDisposition: tally("disposition"),
      securityRelevant: count((r) => r.securityRelevant === true),
      reviewed: count((r) => r.reviewed),
      missing: count((r) => !byPath.has(r.path)),
      extra: [...byPath.keys()].filter((p) => !gitPaths.has(p)).length,
      duplicate: duplicate.size,
      stale: count((r) => byPath.has(r.path) && !r.reviewed),
    },
  };
}

export function gatherDelta(sources, root, options = {}) {
  const range = `${sources.frozenSourceSha}..${sources.targetMainSha}`;
  const total = Number(git(["rev-list", "--count", range], root).trim());
  const nonMerge = git(["log", "--no-merges", "--format=%H", range], root).split("\n").filter(Boolean);
  if (options.layer === "SECOND") {
    // The second layer derives every aggregate FROM the ledger, so a count cannot say anything its rows do not.
    const ledger = buildPathLedger(sources, root, options.authored);
    const rows = ledger.rows.map((r) => ({ status: r.changeType, path: r.path }));
    const strict = ledger.rows.filter((r) => r.strictProduct).map((r) => r.path).sort(byStr);
    const broad = ledger.rows.filter((r) => r.broadProduct).map((r) => r.path).sort(byStr);
    const schemaDiff = git(["diff", sources.frozenSourceSha, sources.targetMainSha, "--", "prisma/schema.prisma"], root);
    const added = (kw) => [...schemaDiff.matchAll(new RegExp(`^\\+${kw} (\\w+)`, "gm"))].map((m) => m[1]).sort(byStr);
    return {
      range,
      commits: { total, nonMerge: nonMerge.length, nonMergeShortIds: nonMerge.map((s) => s.slice(0, 8)).sort(byStr) },
      paths: { total: rows.length, added: ledger.summary.byChangeType.A, modified: ledger.summary.byChangeType.M, deleted: ledger.summary.byChangeType.D, renamed: ledger.summary.byChangeType.R },
      strictProductPaths: { rule: STRICT_PRODUCT_RULE, total: strict.length, list: strict },
      broadRuntimeAffectingPaths: { rule: BROAD_RUNTIME_RULE, total: broad.length },
      apiRoutes: strict.filter((p) => /^src\/app\/api\/.+\/route\.ts$/.test(p)),
      pages: strict.filter((p) => /^src\/app\/\[locale\]\/.+\/page\.tsx$/.test(p)),
      schema: {
        models: added("model"),
        enums: added("enum"),
        migrations: [...new Set(rows.filter((r) => r.status === "A" && /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(r.path)).map((r) => r.path.split("/")[2]))].sort(byStr),
      },
      infrastructure: rows
        .filter((r) => /^(Dockerfile|\.dockerignore|docker-compose.*\.yml|\.github\/workflows\/.+|scripts\/executive\/.+|scripts\/ci\/.+)$/.test(r.path))
        .map((r) => `${r.status} ${r.path}`)
        .sort(byStr),
      authSessionNamedProductPaths: strict.filter((p) => /(^|\/)(auth|session|middleware|proxy|nginx)[^/]*(\/|\.|$)/i.test(p)),
      pathLedgerSummary: ledger.summary,
      pathLedger: ledger.rows,
    };
  }
  const rows = deltaPathRows(sources, root);
  const strict = rows.filter((r) => isStrictProductPath(r.path)).map((r) => r.path).sort(byStr);
  const broad = rows.filter((r) => isBroadRuntimePath(r.path)).map((r) => r.path).sort(byStr);
  const count = (s) => rows.filter((r) => r.status === s).length;
  const schemaDiff = git(["diff", sources.frozenSourceSha, sources.targetMainSha, "--", "prisma/schema.prisma"], root);
  const added = (kw) => [...schemaDiff.matchAll(new RegExp(`^\\+${kw} (\\w+)`, "gm"))].map((m) => m[1]).sort(byStr);
  return {
    range,
    commits: { total, nonMerge: nonMerge.length, nonMergeShortIds: nonMerge.map((s) => s.slice(0, 8)).sort(byStr) },
    paths: { total: rows.length, added: count("A"), modified: count("M"), deleted: count("D") },
    strictProductPaths: { rule: STRICT_PRODUCT_RULE, total: strict.length, list: strict },
    broadRuntimeAffectingPaths: { rule: BROAD_RUNTIME_RULE, total: broad.length },
    apiRoutes: strict.filter((p) => /^src\/app\/api\/.+\/route\.ts$/.test(p)),
    pages: strict.filter((p) => /^src\/app\/\[locale\]\/.+\/page\.tsx$/.test(p)),
    schema: {
      models: added("model"),
      enums: added("enum"),
      migrations: [...new Set(rows.filter((r) => r.status === "A" && /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(r.path)).map((r) => r.path.split("/")[2]))].sort(byStr),
    },
    infrastructure: rows
      .filter((r) => /^(Dockerfile|\.dockerignore|docker-compose.*\.yml|\.github\/workflows\/.+|scripts\/executive\/.+|scripts\/ci\/.+)$/.test(r.path))
      .map((r) => `${r.status} ${r.path}`)
      .sort(byStr),
    authSessionNamedProductPaths: strict.filter((p) => /(^|\/)(auth|session|middleware|proxy|nginx)[^/]*(\/|\.|$)/i.test(p)),
  };
}

/* ── derived: getPrisma ────────────────────────────────────────────────────── */

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export const S0_ADJUDICATIONS_REL = "scripts/security/s0/getprisma-manual-adjudications.json";

/**
 * A SEALED layer (one whose sources name a `reconciledTreeSha`) reads its reconciled tree from git, so a later tree
 * cannot move its figures. It does so only when the caller did not point the checker at other S0 files: a test or a
 * campaign that hands over its own inventory is asking about THOSE bytes.
 */
export function sealedTree(sources, paths) {
  if (sources.reconciledTreeSha === undefined) return false;
  const d = defaultPaths(paths.root);
  return paths.inventory === d.inventory && paths.adjudications === d.adjudications;
}

function inventoryAt(sources, paths, root) {
  const before = JSON.parse(git(["show", `${sources.securityHeadSha}:${S0_INVENTORY_REL}`], root));
  const after = sealedTree(sources, paths) ? JSON.parse(git(["show", `${sources.reconciledTreeSha}:${S0_INVENTORY_REL}`], root)) : readJson(paths.inventory);
  return { before, after };
}

/** The source files a consumer trace may read: tracked product source under src, tests excluded. */
function sourceFiles(sources, root) {
  return git(["ls-tree", "-r", "--name-only", sources.targetMainSha, "--", "src"], root)
    .split("\n")
    .filter((p) => /\.(ts|tsx|mjs)$/.test(p) && !/(^|\/)__tests__\//.test(p) && !/\.(test|spec)\./.test(p))
    .sort(byStr);
}

const FN_DEF = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/;

/** Enclosing top-level function of a 1-based line, and whether it is exported. */
function enclosing(lines, line) {
  for (let i = line - 1; i >= 0; i -= 1) {
    const m = FN_DEF.exec(lines[i]);
    if (m) return { name: m[1] ?? m[2], exported: /^export\b/.test(lines[i]), defaultExport: /^export\s+default\b/.test(lines[i]), line: i + 1 };
  }
  return null;
}

function resolveImport(spec, fromFile, fileSet) {
  let base;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(fromFile), spec));
  else return null;
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}/index.ts`, `${base}/index.tsx`, base]) if (fileSet.has(cand)) return cand;
  return null;
}

/**
 * Static consumers of one call site: the exported functions that contain it, directly
 * or through local helpers of the same file, and the files that import those functions.
 * This is an over-approximation of reachability (it cannot see a caller that passes its
 * own client), which is why the field is called staticImporters.
 */
export function traceConsumers(site, ctx) {
  const lines = ctx.text(site.file).split("\n");
  const start = enclosing(lines, site.line);
  const roots = new Map(); // exported name -> file
  const seen = new Set();
  const walk = (fn, depth) => {
    if (!fn || seen.has(fn.name) || depth > 3) return;
    seen.add(fn.name);
    if (fn.exported) {
      roots.set(fn.defaultExport ? "default" : fn.name, site.file);
      return;
    }
    const callRx = new RegExp(`\\b${fn.name}\\s*\\(`);
    lines.forEach((l, i) => {
      if (i + 1 === fn.line || !callRx.test(l)) return;
      walk(enclosing(lines, i + 1), depth + 1);
    });
  };
  walk(start, 0);
  const importers = new Set();
  for (const [name, file] of roots) {
    const isHandler = /\/route\.ts$/.test(file) || /\/page\.tsx$/.test(file);
    if (isHandler) importers.add(file);
    for (const other of ctx.files) {
      if (other === file) continue;
      const txt = ctx.text(other);
      const nameRx = name === "default" ? null : new RegExp(`\\b${name}\\b`);
      if (nameRx && !nameRx.test(txt)) continue;
      if (!nameRx) continue;
      for (const m of txt.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
        if (resolveImport(m[1], other, ctx.fileSet) === file) {
          importers.add(other);
          break;
        }
      }
    }
  }
  return {
    enclosingFunction: start ? start.name : null,
    exportedRoots: [...roots.keys()].sort(byStr),
    staticImporters: [...importers].sort(byStr),
  };
}

/** Every named file of one commit in a single git process: `git cat-file --batch` prints a header and the bytes. */
export function readBlobs(root, sha, files) {
  const out = new Map();
  if (files.length === 0) return out;
  const r = spawnSync("git", ["cat-file", "--batch"], { cwd: root, input: files.map((f) => `${sha}:${f}
`).join(""), maxBuffer: 1 << 30 });
  if (r.status !== 0) return out;
  const buf = r.stdout;
  let at = 0;
  for (const f of files) {
    const eol = buf.indexOf(10, at);
    if (eol < 0) break;
    const header = buf.toString("utf8", at, eol).split(" ");
    at = eol + 1;
    if (header[1] !== "blob") continue;
    const size = Number(header[2]);
    out.set(f, lf(buf.toString("utf8", at, at + size)));
    at += size + 1;
  }
  return out;
}

const contextMemo = new Map();

/** The file list and the text cache are per process and per target: reading the tree once is enough for a run. */
function consumerContext(sources, root) {
  const key = `${root}|${sources.targetMainSha}`;
  if (!contextMemo.has(key)) {
    const files = sourceFiles(sources, root);
    // The text of a file is the text of the COMMITTED target, never of the working tree: a sealed layer must give the same
    // answer whatever a later tree looks like, and an uncommitted edit cannot create or hide a position.
    const cache = readBlobs(root, sources.targetMainSha, files);
    contextMemo.set(key, {
      files,
      fileSet: new Set(files),
      text: (f) => {
        if (!cache.has(f)) cache.set(f, blobText(root, sources.targetMainSha, f) === null ? "" : lf(blobText(root, sources.targetMainSha, f)));
        return cache.get(f);
      },
    });
  }
  return contextMemo.get(key);
}

export function gatherGetPrisma(data, paths, root) {
  const sources = data.sources;
  const { before, after } = inventoryAt(sources, paths, root);
  const B = new Map(before.callSites.map((c) => [c.id, c]));
  const A = new Map(after.callSites.map((c) => [c.id, c]));
  const addedIds = [...A.keys()].filter((k) => !B.has(k)).sort(byStr);
  const removed = [...B.keys()].filter((k) => !A.has(k)).sort(byStr);
  const sig = (c) => `${c.file}|${c.fingerprint}`;
  const addedSigs = new Set(addedIds.map((k) => sig(A.get(k))));
  const moved = removed.filter((k) => addedSigs.has(sig(B.get(k)))).sort(byStr);
  const filesOf = (inv) => new Set(inv.callSites.map((c) => c.file));
  const bf = filesOf(before);
  const af = filesOf(after);
  const ctx = consumerContext(sources, root);
  const reviewed = new Map((data.reviewedCallsites ?? []).map((r) => [r.id, r]));
  const added = addedIds.map((id) => {
    const c = A.get(id);
    const lineText = ctx.text(c.file).split("\n")[c.line - 1] ?? "";
    const tokenFound = lineText.slice(c.column - 1, c.column - 1 + "getPrisma".length) === "getPrisma";
    const trace = traceConsumers(c, ctx);
    return {
      id,
      classification: c.classification,
      confidence: c.confidence,
      ruleId: c.ruleId,
      decision: c.adjudication ? "MANUAL_ADJUDICATION" : "RULE_BASED",
      position: { file: c.file, line: c.line, column: c.column, tokenFound },
      enclosingFunction: trace.enclosingFunction,
      exportedRoots: trace.exportedRoots,
      staticImporters: trace.staticImporters,
      outcomeFlags: c.adjudication?.outcomeFlags ?? [],
      reachability: reviewed.get(id)?.reachability ?? null,
    };
  });
  const edgeCount = added.reduce((n, a) => n + a.staticImporters.length, 0);
  const summary = after.summary;
  const partition = summary.primaryPartition;
  return {
    before: { textualOccurrences: before.summary.textualOccurrences, realCallExpressions: before.callSites.length, files: bf.size },
    after: { textualOccurrences: summary.textualOccurrences, realCallExpressions: after.callSites.length, files: af.size },
    decisions: {
      manualAdjudications: added.filter((a) => a.decision === "MANUAL_ADJUDICATION").length,
      ruleBased: added.filter((a) => a.decision === "RULE_BASED").length,
      ruleBasedIds: added.filter((a) => a.decision === "RULE_BASED").map((a) => `${a.id} (${a.ruleId}, ${a.confidence})`),
    },
    added,
    removed,
    moved,
    newFiles: [...af].filter((f) => !bf.has(f)).sort(byStr),
    changedExistingRecords: [...A.keys()].filter((k) => B.has(k) && JSON.stringify(B.get(k)) !== JSON.stringify(A.get(k))).length,
    staticConsumerEdgesOfAdded: edgeCount,
    unresolved: after.callSites.filter((c) => c.classification === "UNRESOLVED_REQUIRES_MANUAL_REVIEW").length,
    unresolvedEdges: summary.consumerEdgesUnresolved,
    primaryPartition: {
      sum: partition.sum,
      total: partition.total,
      missingPrimaryIds: partition.missingPrimaryIds.length,
      duplicatePrimaryIds: partition.duplicatePrimaryIds.length,
      outsideClosedSet: partition.classificationsOutsideClosedSet.length,
      counts: partition.counts,
    },
    outcomeTotals: summary.outcomes.totals,
    frozenOutcomeTotals: before.summary.outcomes.totals,
    rulesetVersion: after.rulesetVersion,
    inventorySha256: sealedTree(sources, paths) ? sha256(Buffer.from(git(["show", `${sources.reconciledTreeSha}:${S0_INVENTORY_REL}`], root), "utf8")) : sha256(readFileSync(paths.inventory)),
    adjudicationsSha256: sealedTree(sources, paths) ? sha256(Buffer.from(git(["show", `${sources.reconciledTreeSha}:${S0_ADJUDICATIONS_REL}`], root), "utf8")) : sha256(readFileSync(paths.adjudications)),
    ...(layerOf(data) === "SECOND" ? movedLedgerSections(data, paths, root, { before, after, B, A, addedIds, removed, moved }) : {}),
  };
}

/* ── layer 2: the moved call sites, kept apart from the three kinds of change ─── */

const TOP_LEVEL_DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum)\b|^(?:export\s+)?(?:const|let|var)\s/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/** The code of the top-level function that holds a 1-based line: comments and trailing blanks are not behaviour. */
export function functionSpan(text, line) {
  const lines = String(text).split("\n");
  const fn = enclosing(lines, line);
  const start = fn ? fn.line : 1;
  let end = lines.length + 1;
  for (let i = start; i < lines.length; i += 1) {
    if (TOP_LEVEL_DECL.test(lines[i])) {
      end = i + 1;
      break;
    }
  }
  const code = lines
    .slice(start - 1, end - 1)
    .filter((l) => !COMMENT_LINE.test(l))
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length > 0);
  return { name: fn ? fn.name : null, code: code.join("\n") };
}

const POSITIONAL_ADJUDICATION_KEYS = Object.freeze(["evidence", "callerPath"]);
const POSITIONAL_TRACE_KEYS = Object.freeze(["operationIdentity", "sourceReferences"]);

/** Which fields of a call site's adjudication changed with the move, split into those that only name a position and the rest. */
export function adjudicationMove(o, n) {
  const oa = o.adjudication ?? null;
  const na = n.adjudication ?? null;
  if (!oa && !na) return { before: false, after: false, positionalFields: [], semanticFields: [] };
  if (!oa || !na) return { before: Boolean(oa), after: Boolean(na), positionalFields: [], semanticFields: ["adjudication"] };
  const positional = [];
  const semantic = [];
  for (const k of [...new Set([...Object.keys(oa), ...Object.keys(na)])].sort(byStr)) {
    if (JSON.stringify(oa[k]) === JSON.stringify(na[k])) continue;
    if (POSITIONAL_ADJUDICATION_KEYS.includes(k)) positional.push(k);
    else if (k === "retryTrace" && oa.retryTrace && na.retryTrace) {
      for (const t of [...new Set([...Object.keys(oa.retryTrace), ...Object.keys(na.retryTrace)])].sort(byStr)) {
        if (JSON.stringify(oa.retryTrace[t]) === JSON.stringify(na.retryTrace[t])) continue;
        (POSITIONAL_TRACE_KEYS.includes(t) ? positional : semantic).push(`retryTrace.${t}`);
      }
    } else semantic.push(k);
  }
  return { before: true, after: true, positionalFields: positional, semanticFields: semantic };
}

const EVIDENCE_REFERENCE = /([A-Za-z0-9_@()[\].\/-]+\.(?:ts|tsx|mjs|js)):(\d+)(?:-(\d+))?(?:\s*\(`([^`]+)`)?/g;
export const EVIDENCE_WINDOW_BEFORE = 2;
export const EVIDENCE_WINDOW_AFTER = 8;

/**
 * The adjudication's evidence names `path:from-to` (and, in backticks, the expression it points at). After a move it
 * must point at the call site where it is NOW: every named range lies inside its file, the expression quoted for a
 * range is inside that range, and the citation of the call site's own file lies within its window.
 */
export function evidenceWindowProblems(site, evidenceText, textOf) {
  const out = [];
  if (typeof evidenceText !== "string") return out;
  const own = [];
  for (const m of evidenceText.matchAll(EVIDENCE_REFERENCE)) {
    const [, path, a, b, snippet] = m;
    const from = Number(a);
    const to = b === undefined ? from : Number(b);
    const text = textOf(path);
    if (text === null) {
      out.push(`evidence cites ${path}, which is not in the target tree`);
      continue;
    }
    const lines = String(text ?? "").split("\n");
    if (to < from || from < 1 || to > lines.length) {
      out.push(`evidence cites ${path}:${from}-${to}, outside the file`);
      continue;
    }
    if (snippet !== undefined && !lines.slice(from - 1, to).join("\n").includes(snippet)) out.push(`evidence quotes \`${snippet.slice(0, 50)}\` at ${path}:${from}-${to} and the expression is not there`);
    if (path === site.file) own.push({ from, to });
  }
  if (own.length > 0 && !own.some((r) => r.to >= site.line - EVIDENCE_WINDOW_BEFORE && r.from <= site.line + EVIDENCE_WINDOW_AFTER)) {
    out.push(`no evidence citation of ${site.file} lies within ${EVIDENCE_WINDOW_BEFORE} lines before to ${EVIDENCE_WINDOW_AFTER} after line ${site.line}`);
  }
  return out;
}

const sameList = (a, b) => JSON.stringify([...(a ?? [])].sort(byStr)) === JSON.stringify([...(b ?? [])].sort(byStr));

/**
 * THREE KINDS OF CHANGE, never one number:
 *
 *   classificationSemanticChanges  the verdict changed: classification, rule, confidence, guard shape, control flow,
 *                                  reason, or an adjudicated field that is not merely a position;
 *   sourceBehaviorChanges          the code of the enclosing function differs between the first-layer tree and the
 *                                  integrated tree, comments aside, whether or not the verdict moved with it;
 *   derivedTagChanges              a secondary tag the scanner derives from a bounded window differs.
 *
 * Each moved pair is paired one to one by file, ordinal and fingerprint. A pair whose verdict changed is not a move.
 */
function movedLedgerSections(data, paths, root, ctx) {
  const { A, B, addedIds, removed, moved } = ctx;
  const sources = data.sources;
  const declared = new Map((data.sourceBehaviorChanges ?? []).map((x) => [x.callsiteId, x.summary]));
  const edgePath = join(dirname(paths.adjudications), "getprisma-consumer-edge-traces.json");
  const artifacts = [paths.adjudications, paths.residual, edgePath, paths.inventory].map((p) => (existsSync(p) ? readFileSync(p, "utf8") : ""));
  const residueOf = (id) => artifacts.reduce((n, t) => n + (t.split(id).length - 1), 0);
  const claimed = new Map();
  const ambiguous = [];
  const pairs = [];
  for (const oldId of moved) {
    const o = B.get(oldId);
    const candidates = addedIds.filter((id) => {
      const n = A.get(id);
      return n.file === o.file && n.fingerprint === o.fingerprint && n.ordinalInFile === o.ordinalInFile;
    });
    if (candidates.length !== 1) {
      ambiguous.push(oldId);
      continue;
    }
    claimed.set(candidates[0], (claimed.get(candidates[0]) ?? 0) + 1);
    pairs.push([oldId, candidates[0]]);
  }
  for (const [id, n] of claimed) if (n > 1) ambiguous.push(id);
  const rows = pairs
    .map(([oldId, newId]) => {
      const o = B.get(oldId);
      const n = A.get(newId);
      const adj = adjudicationMove(o, n);
      const verdictFields = ["classification", "ruleId", "confidence", "autoConfidence", "guardShape", "controlFlow", "reason", "testOnly"].filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]));
      const flagsDiffer = !sameList(o.adjudication?.outcomeFlags, n.adjudication?.outcomeFlags);
      const semantic = verdictFields.length > 0 || adj.semanticFields.length > 0 || flagsDiffer;
      const tagsAdded = (n.secondaryTags ?? []).filter((t) => !(o.secondaryTags ?? []).includes(t)).sort(byStr);
      const tagsRemoved = (o.secondaryTags ?? []).filter((t) => !(n.secondaryTags ?? []).includes(t)).sort(byStr);
      const beforeText = blobText(root, sources.securityHeadSha, o.file) ?? "";
      const afterText = blobText(root, sources.integrationMergeSha, n.file) ?? "";
      const bs = functionSpan(beforeText, o.line);
      const as = functionSpan(afterText, n.line);
      const bodyChanged = bs.code !== as.code;
      return {
        file: n.file,
        ordinalInFile: n.ordinalInFile,
        fingerprint: n.fingerprint,
        before: { id: oldId, line: o.line, column: o.column },
        after: { id: newId, line: n.line, column: n.column },
        lineDelta: n.line - o.line,
        classification: { before: o.classification, after: n.classification },
        ruleId: { before: o.ruleId, after: n.ruleId },
        outcomeFlags: { before: o.adjudication?.outcomeFlags ?? [], after: n.adjudication?.outcomeFlags ?? [] },
        adjudication: adj,
        classificationSemanticChange: semantic,
        derivedTagChanges: { added: tagsAdded, removed: tagsRemoved },
        sourceBehavior: { enclosingFunction: as.name, bodyChanged, summary: declared.get(newId) ?? null },
        evidenceProblems: evidenceWindowProblems(n, n.adjudication?.evidence, (path) => blobText(root, sources.integrationMergeSha, path)),
        oldIdResidue: residueOf(oldId),
      };
    })
    .sort((x, y) => byStr(x.after.id, y.after.id));
  const pairedNew = new Set(rows.map((r) => r.after.id));
  const pairedOld = new Set(rows.map((r) => r.before.id));
  return {
    movedLedger: rows,
    movedPairProblems: { ambiguous: [...new Set(ambiguous)].sort(byStr), unpairedAdded: addedIds.filter((id) => !pairedNew.has(id)).sort(byStr), unpairedRemoved: removed.filter((id) => !pairedOld.has(id)).sort(byStr) },
    changeModel: {
      movedPairs: rows.length,
      genuinelyAdded: addedIds.filter((id) => !pairedNew.has(id)).length,
      genuinelyRemoved: removed.filter((id) => !pairedOld.has(id)).length,
      unchangedRecords: [...A.keys()].filter((k) => B.has(k) && JSON.stringify(B.get(k)) === JSON.stringify(A.get(k))).length,
      classificationSemanticChanges: rows.filter((r) => r.classificationSemanticChange).length,
      sourceBehaviorChanges: rows.filter((r) => r.sourceBehavior.bodyChanged).length,
      derivedTagChanges: rows.filter((r) => r.derivedTagChanges.added.length + r.derivedTagChanges.removed.length > 0).length,
      positionOnlyPairs: rows.filter((r) => !r.classificationSemanticChange && !r.sourceBehavior.bodyChanged && r.derivedTagChanges.added.length + r.derivedTagChanges.removed.length === 0).length,
    },
  };
}

const treeSummaryMemo = new Map();

/**
 * The summary the S0 scanner derives from the source tree RIGHT NOW. A committed
 * inventory whose own summary differs is stale, whatever else it says.
 */
export function treeInventorySummary(root) {
  if (!treeSummaryMemo.has(root)) {
    const tool = join(root, "scripts", "security", "s0", "getprisma-callsite-inventory.mjs");
    treeSummaryMemo.set(
      root,
      JSON.parse(execFileSync(process.execPath, [tool, "summary"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] })),
    );
  }
  return treeSummaryMemo.get(root);
}

/** Adjudications and screenings must name a live call site with a live fingerprint. */
export function orphanAdjudications(paths) {
  const inv = readJson(paths.inventory);
  const live = new Map(inv.callSites.map((c) => [c.id, c.fingerprint]));
  const out = [];
  for (const a of readJson(paths.adjudications).adjudications) {
    if (!live.has(a.callsiteId)) out.push(`adjudication ${a.callsiteId} names no live call site`);
    else if (live.get(a.callsiteId) !== a.sourceFingerprint) out.push(`adjudication ${a.callsiteId} is pinned to a stale fingerprint`);
  }
  for (const s of readJson(paths.residual).screenings) {
    if (!live.has(s.callsiteId)) out.push(`screening ${s.callsiteId} names no live call site`);
    else if (live.get(s.callsiteId) !== s.sourceFingerprint) out.push(`screening ${s.callsiteId} is pinned to a stale fingerprint`);
  }
  return out;
}

/* ── derived: names read by the worker script, compose env_file, historical files ─ */

function composeEnvFileServices(text) {
  const out = [];
  let service = null;
  let inServices = false;
  for (const line of text.split("\n")) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (inServices && /^\S/.test(line) && !/^\s*#/.test(line)) inServices = false;
    if (!inServices) continue;
    const s = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (s) service = s[1];
    else if (service && /^    env_file:/.test(line)) out.push(service);
  }
  return [...new Set(out)].sort(byStr);
}

const PLATFORM_GATE = 'can(user.role, "admin")';

/** How many route files under one prefix carry the platform-capability test, counted from the target tree. */
function platformGateCount(sources, root, prefix) {
  const files = git(["ls-tree", "-r", "--name-only", sources.targetMainSha, "--", prefix], root)
    .split("\n")
    .filter((p) => /\/route\.ts$/.test(p));
  let withGate = 0;
  for (const f of files) if (git(["show", `${sources.targetMainSha}:${f}`], root).includes(PLATFORM_GATE)) withGate += 1;
  return { files: files.length, withGate };
}

/** The route files under one prefix, and how many of them read the platform identity or carry an equivalent gate. */
function routeSetFacts(sources, root, prefix) {
  const files = git(["ls-tree", "-r", "--name-only", sources.targetMainSha, "--", prefix], root)
    .split("\n")
    .filter((p) => /\/route\.ts$/.test(p))
    .sort(byStr);
  let withGetCurrentUser = 0;
  let withEquivalentGate = 0;
  for (const f of files) {
    const text = git(["show", `${sources.targetMainSha}:${f}`], root);
    if (text.includes("getCurrentUser")) withGetCurrentUser += 1;
    if (/\bplatformCan\s*\(|\bcan\(\s*user\.role/.test(text)) withEquivalentGate += 1;
  }
  return { list: files, withGetCurrentUser, withEquivalentGate };
}

/**
 * The source text with every comment and every string, template and regular-expression body replaced by
 * spaces. Line ends, offsets and the quotes themselves survive, so a position found in the result is the
 * position in the file. A string whose whole body is `partyId` keeps it: a quoted object key is a key.
 */
export function blankNonCode(text) {
  const n = text.length;
  const out = text.split("");
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  let prev = "";
  let i = 0;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      let j = i;
      while (j < n && text[j] !== "\n" && text[j] !== "\r") j += 1;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && d === "*") {
      const j = text.indexOf("*/", i + 2);
      const e = j < 0 ? n : j + 2;
      blank(i, e);
      i = e;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== "\n") {
        if (text[j] === "\\") j += 1;
        j += 1;
      }
      if (text.slice(i + 1, j) !== "partyId") blank(i + 1, j);
      i = j + 1;
      prev = c;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      let depth = 0;
      while (j < n && !(text[j] === "`" && depth === 0)) {
        if (text[j] === "\\") j += 1;
        else if (text[j] === "$" && text[j + 1] === "{") {
          depth += 1;
          j += 1;
        } else if (text[j] === "}" && depth > 0) depth -= 1;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
      prev = "`";
      continue;
    }
    if (c === "/" && /^[(,=:[!&|?{};]?$/.test(prev)) {
      // a regular-expression literal: it may hold quotes and braces
      let j = i + 1;
      let inClass = false;
      while (j < n && text[j] !== "\n" && (text[j] !== "/" || inClass)) {
        if (text[j] === "\\") j += 1;
        else if (text[j] === "[") inClass = true;
        else if (text[j] === "]") inClass = false;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
      prev = "/";
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i += 1;
  }
  return out.join("");
}

/** The index of the bracket that closes the one at `open`, or -1. Strings are already blank. */
function closingBracket(s, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  for (let k = open; k < s.length; k += 1) {
    const c = s[k];
    if (c === "(" || c === "[" || c === "{") stack.push(pairs[c]);
    else if (c === ")" || c === "]" || c === "}") {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return k;
    }
  }
  return -1;
}

/** The top-level properties of the object literal whose `{` is at `open`: key, where the key is, and where the value is. */
function objectProperties(s, open) {
  const close = closingBracket(s, open);
  if (close < 0) return [];
  const props = [];
  let k = open + 1;
  const skipSpace = () => {
    while (k < close && /\s/.test(s[k])) k += 1;
  };
  while (k < close) {
    skipSpace();
    if (k >= close) break;
    const at = k;
    let key = null;
    if (s.startsWith("...", k)) {
      k += 3;
    } else if (/[A-Za-z_$]/.test(s[k])) {
      let j = k;
      while (j < close && /[\w$]/.test(s[j])) j += 1;
      key = s.slice(k, j);
      k = j;
    } else if (s[k] === '"' || s[k] === "'") {
      const q = s[k];
      let j = k + 1;
      while (j < close && s[j] !== q) j += 1;
      key = s.slice(k + 1, j);
      k = j + 1;
    } else if (s[k] === "[") {
      const e = closingBracket(s, k);
      k = e < 0 ? close : e + 1;
    } else {
      k += 1;
    }
    skipSpace();
    let valueStart = -1;
    let valueEnd = k;
    if (s[k] === ":") {
      valueStart = k + 1;
      k += 1;
    } else if (key !== null && (s[k] === "," || k >= close)) {
      props.push({ key, at, valueStart: -1, valueEnd: k, shorthand: true });
    }
    // advance to the next top-level comma
    let depth = 0;
    while (k < close) {
      const c = s[k];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") depth -= 1;
      else if (c === "," && depth === 0) break;
      k += 1;
    }
    valueEnd = k;
    if (valueStart >= 0 && key !== null) props.push({ key, at, valueStart, valueEnd, shorthand: false });
    k += 1;
  }
  return props;
}

const PRISMA_WRITE_CALL = /(?:\.|\?\.)\s*erpProject\s*(?:\.|\?\.)\s*(update|updateMany|create|createMany|upsert)\s*(?:<[^<>()]*>)?\s*\(/g;
const WRITE_PAYLOAD_KEYS = Object.freeze({ update: ["data"], updateMany: ["data"], create: ["data"], createMany: ["data"], upsert: ["create", "update"] });

/**
 * The write sites of a project's partyId inside ONE file's text. A site is a `partyId` property of the
 * object that is the value of `data:` (or of `create:` / `update:` for an upsert) in the first argument of
 * a Prisma write call on the project model (`erpProject`: update, updateMany, create, createMany, upsert).
 * A `partyId` of another model (an interaction, a contact) is that model's own column, not a project's.
 * The site is found in the structure of the source, not by a pattern over its characters: the property may
 * sit anywhere in the object, among spreads and other properties, shorthand or quoted, on one line or many.
 * A `partyId` in `where:`, in `metadata:`, in a comment or a string, in a nested object, or in an object
 * outside such a call is not a write. A payload that is not an object literal (`data: payload`) is not read.
 */
export function partyIdWriteSites(text) {
  const s = blankNonCode(text);
  const sites = new Set();
  const lineOf = (offset) => text.slice(0, offset).split("\n").length;
  for (const m of s.matchAll(PRISMA_WRITE_CALL)) {
    const open = m.index + m[0].length - 1;
    const close = closingBracket(s, open);
    if (close < 0) continue;
    let a = open + 1;
    while (a < close && /\s/.test(s[a])) a += 1;
    if (s[a] !== "{") continue;
    for (const prop of objectProperties(s, a)) {
      if (!WRITE_PAYLOAD_KEYS[m[1]].includes(prop.key) || prop.valueStart < 0) continue;
      let v = prop.valueStart;
      while (v < prop.valueEnd && /\s/.test(s[v])) v += 1;
      const payloads = [];
      if (s[v] === "{") payloads.push(v);
      else if (s[v] === "[") {
        const end = closingBracket(s, v);
        for (let k = v + 1; end > 0 && k < end; k += 1) {
          if (s[k] === "{") {
            payloads.push(k);
            k = closingBracket(s, k);
            if (k < 0) break;
          }
        }
      }
      for (const p of payloads) {
        for (const q of objectProperties(s, p)) if (q.key === "partyId") sites.add(lineOf(q.at));
      }
    }
  }
  return [...sites].sort((x, y) => x - y);
}

export function partyIdWriterFiles(sources, root) {
  return treeMatches(root, sources.targetMainSha, ["src"], "partyId")
    .filter((p) => partyIdWriteSites(lf(git(["show", `${sources.targetMainSha}:${p}`], root))).length > 0)
    .sort(byStr);
}

const CORRECTION_DEFINITION = "src/lib/executive/report/generate.ts";

/** Every non-test caller of generateDailyReport in src and scripts, and the ones that mention a correction. */
function reportCorrectionCallers(sources, root) {
  const callers = treeMatches(root, sources.targetMainSha, ["src", "scripts"], "\\bgenerateDailyReport\\s*\\(").filter((p) => p !== CORRECTION_DEFINITION);
  const withCorrection = callers.filter((p) => /\bcorrection\b/.test(git(["show", `${sources.targetMainSha}:${p}`], root)));
  return { definition: CORRECTION_DEFINITION, callers, withCorrection };
}

export function gatherDerivedFacts(sources, root) {
  const runner = git(["show", `${sources.targetMainSha}:scripts/executive/daily-report-worker.mjs`], root);
  return {
    platformCapabilityGate: {
      expression: PLATFORM_GATE,
      erpRoutes: { ...platformGateCount(sources, root, "src/app/api/erp"), ...routeSetFacts(sources, root, "src/app/api/erp") },
      customerRoutes: { ...platformGateCount(sources, root, "src/app/api/tenant/customers"), ...routeSetFacts(sources, root, "src/app/api/tenant/customers") },
      partyIdWriters: partyIdWriterFiles(sources, root),
    },
    reportCorrectionCallers: reportCorrectionCallers(sources, root),
    workerEnvironmentNames: [...new Set([...runner.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort(byStr),
    composeEnvFileServices: {
      frozenSource: composeEnvFileServices(git(["show", `${sources.frozenSourceSha}:docker-compose.prod.yml`], root)),
      target: composeEnvFileServices(git(["show", `${sources.targetMainSha}:docker-compose.prod.yml`], root)),
    },
  };
}

export function gatherHistoricalFiles(sources, root) {
  return HISTORICAL_FILES.map(({ path, role }) => {
    const frozen = sha256(Buffer.from(git(["show", `${sources.securityHeadSha}:${path}`], root), "utf8"));
    const atMerge = sha256(Buffer.from(git(["show", `${sources.integrationMergeSha}:${path}`], root), "utf8"));
    return { path, role, frozenSha256: frozen, preservedByMerge: frozen === atMerge };
  });
}

/** The ten risks the reconciled register schedules first. The report consumes the register, never a list of its own. */
export function projectPriorities(register) {
  return [...register.risks]
    .sort((a, b) => a.remediationPriority - b.remediationPriority)
    .slice(0, 10)
    .map((r) => ({ priority: r.remediationPriority, riskId: r.riskId, severity: r.severity, score: r.score, scope: r.originScope ?? "HISTORICAL_S1_BASELINE" }));
}

export function projectRegister(data, register) {
  const risks = new Map(register.risks.map((r) => [r.riskId, r]));
  const findings = new Map(register.findings.map((f) => [f.findingId, f]));
  return data.findings.map((f) => {
    const rf = findings.get(f.registerFindingId);
    const owner = rf ? risks.get(rf.ownerRiskId) : undefined;
    return {
      findingId: f.findingId,
      registerFindingId: f.registerFindingId,
      status: rf ? rf.status : null,
      deltaDisposition: rf ? rf.deltaDisposition ?? null : null,
      ownerRiskId: rf ? rf.ownerRiskId ?? null : null,
      severity: owner ? owner.severity : null,
      score: owner ? owner.score : null,
      productionState: owner ? owner.productionState : null,
      ownerScope: owner ? owner.originScope ?? "HISTORICAL_S1_BASELINE" : null,
    };
  });
}

function ordered(obj, order) {
  const out = {};
  for (const k of order) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  for (const k of Object.keys(obj).sort()) if (!(k in out)) out[k] = obj[k];
  return out;
}

export function deriveAll(data, paths) {
  const root = paths.root;
  const register = readJson(paths.register);
  return {
    delta: gatherDelta(data.sources, root, layerOf(data) === "SECOND" ? { layer: "SECOND", authored: data.pathDispositions ?? [] } : {}),
    getPrisma: gatherGetPrisma(data, paths, root),
    derivedFacts: gatherDerivedFacts(data.sources, root),
    historicalFiles: gatherHistoricalFiles(data.sources, root),
    canonicalProjection: projectRegister(data, register),
    topPriorities: projectPriorities(register),
  };
}

export function canonicalize(data, paths) {
  const next = { ...data, schemaVersion: SCHEMA_VERSION, methodVersion: RELOCK_METHOD_VERSION, ...deriveAll(data, paths) };
  next.findings = [...data.findings].sort((a, b) => byStr(a.findingId, b.findingId));
  next.reviewedCallsites = [...data.reviewedCallsites].sort((a, b) => byStr(a.id, b.id));
  if (data.pathDispositions) next.pathDispositions = [...data.pathDispositions].sort((a, b) => byStr(a.path, b.path));
  if (data.sourceBehaviorChanges) next.sourceBehaviorChanges = [...data.sourceBehaviorChanges].sort((a, b) => byStr(a.callsiteId, b.callsiteId));
  return ordered(next, TOP_ORDER);
}
export const serialize = (data) => `${JSON.stringify(data, null, 2)}\n`;

/* ── the report: generated blocks ──────────────────────────────────────────── */

export const BLOCK_OPEN = (n) => `<!-- RELOCK-BLOCK:${n} -->`;
export const BLOCK_CLOSE = (n) => `<!-- /RELOCK-BLOCK:${n} -->`;
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n+/g, " ");
const short = (sha) => String(sha).slice(0, 8);

export function renderBlocks(data, record) {
  const d = data.delta;
  const g = data.getPrisma;
  const s = data.sources;
  const proj = new Map(data.canonicalProjection.map((p) => [p.findingId, p]));
  const sev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
  const L = {};

  const second = layerOf(data) === "SECOND";
  L.scopes = (second
    ? [
        "| Name | Commit | What it is |",
        "|---|---|---|",
        `| Original frozen source | \`${s.originalFrozenSourceSha}\` | The tree the S0/S1 audit was performed on; changed by neither relock. |`,
        `| First relock target | \`${s.frozenSourceSha}\` | Main as authorized for the first relock; the base of this delta. |`,
        `| Security head | \`${s.securityHeadSha}\` | Final commit of the first relock lane. |`,
        `| Second relock target | \`${s.targetMainSha}\` | Main as authorized for the supplementary relock. |`,
        `| Integration merge | \`${s.integrationMergeSha}\` | Merge of the security head into the second target; parents in that order. |`,
      ]
    : [
        "| Name | Commit | What it is |",
        "|---|---|---|",
        `| Frozen source | \`${s.frozenSourceSha}\` | The tree the S0/S1 audit was performed on. |`,
        `| Security head | \`${s.securityHeadSha}\` | Tip of the historical lane. |`,
        `| Relock target | \`${s.targetMainSha}\` | Main as authorized for the relock. |`,
        `| Integration merge | \`${s.integrationMergeSha}\` | Merge of the security head into the target; parents in that order. |`,
      ]
  ).join("\n");

  L.delta = [
    "| Measure | Value |",
    "|---|---|",
    `| Range | \`${short(s.frozenSourceSha)}..${short(s.targetMainSha)}\` |`,
    `| Commits (all / non-merge) | ${d.commits.total} / ${d.commits.nonMerge} |`,
    second ? `| Changed paths (added / modified / deleted / renamed) | ${d.paths.total} (${d.paths.added} / ${d.paths.modified} / ${d.paths.deleted} / ${d.paths.renamed}) |` : `| Changed paths (added / modified / deleted) | ${d.paths.total} (${d.paths.added} / ${d.paths.modified} / ${d.paths.deleted}) |`,
    `| STRICT_PRODUCT_PATHS | ${d.strictProductPaths.total} |`,
    `| BROAD_RUNTIME_AFFECTING_PATHS | ${d.broadRuntimeAffectingPaths.total} |`,
    `| API route files | ${d.apiRoutes.length} |`,
    `| Pages | ${d.pages.length} |`,
    `| Models / enums / migrations added | ${d.schema.models.length} / ${d.schema.enums.length} / ${d.schema.migrations.length} |`,
    `| Auth, session, middleware, proxy or nginx named product paths | ${d.authSessionNamedProductPaths.length} (${d.authSessionNamedProductPaths.map((p) => `\`${p}\``).join(", ") || "none"}) |`,
    "",
    `STRICT_PRODUCT_PATHS is ${d.strictProductPaths.rule}.`,
    `BROAD_RUNTIME_AFFECTING_PATHS is ${d.broadRuntimeAffectingPaths.rule}.`,
  ].join("\n");

  L.getprisma = [
    second ? "| | First relock tree | Integrated tree |" : "| | Frozen source | Integrated tree |",
    "|---|---|---|",
    `| Textual occurrences | ${g.before.textualOccurrences} | ${g.after.textualOccurrences} |`,
    `| Real call expressions | ${g.before.realCallExpressions} | ${g.after.realCallExpressions} |`,
    `| Files with a real call | ${g.before.files} | ${g.after.files} |`,
    "",
    `Added ${g.added.length}, removed ${g.removed.length}, moved ${g.moved.length}, new files ${g.newFiles.length}, changed existing records ${g.changedExistingRecords}, unresolved call sites ${g.unresolved}, unresolved consumer edges ${g.unresolvedEdges}. Of the ${g.added.length} added, ${g.decisions.manualAdjudications} are manual adjudications and ${g.decisions.ruleBased} are rule-based decisions: ${g.decisions.ruleBasedIds.map((x) => `\`${x}\``).join(" and ")}. The primary partition sums to ${g.primaryPartition.sum} of ${g.primaryPartition.total} with ${g.primaryPartition.missingPrimaryIds} missing, ${g.primaryPartition.duplicatePrimaryIds} duplicate and ${g.primaryPartition.outsideClosedSet} outside the closed set.`,
    "",
    "| Call site | Classification | Decision | Rule | Reachability | Static importers |",
    "|---|---|---|---|---|---|",
    ...g.added.map(
      (a) =>
        `| \`${a.id}\` | ${a.classification} | ${a.decision === "MANUAL_ADJUDICATION" ? `manual (${a.confidence})` : `rule (${a.confidence})`} | ${a.ruleId} | ${a.reachability} | ${a.staticImporters.length} |`,
    ),
  ].join("\n");

  for (const f of data.findings) {
    const p = proj.get(f.findingId);
    if (p && p.severity in sev) sev[p.severity] += 1;
  }
  L.findings = [
    "| Delta finding | Origin | Disposition | Canonical risk | Severity | Production state | Score | Call-site backed |",
    "|---|---|---|---|---|---|---|---|",
    ...data.findings.map((f) => {
      const p = proj.get(f.findingId) ?? { severity: "NOT_PROJECTED", productionState: "NOT_PROJECTED", score: "n/a" };
      return `| \`${f.registerFindingId}\` | ${f.origin} | ${f.disposition} | \`${f.canonicalRiskId}\` | **${p.severity}** | ${p.productionState} | ${p.score} | ${f.callsiteBacked ? `yes (${f.relatedCallsiteIds.length})` : "no"} |`;
    }),
    "",
    `Projected severities of the delta findings (by finding, not by risk): ${Object.entries(sev).map(([k, v]) => `${k} ${v}`).join(", ")}. The values are read from the canonical register; this document sets none of them.`,
  ].join("\n");

  L.historicalfiles = [
    "| File | Role | SHA-256 at the security head | Preserved by the integration merge |",
    "|---|---|---|---|",
    ...data.historicalFiles.map((h) => `| \`${h.path}\` | ${h.role} | \`${h.frozenSha256}\` | ${h.preservedByMerge ? "yes" : "no"} |`),
  ].join("\n");

  const envFrozen = new Set(data.derivedFacts.composeEnvFileServices.frozenSource);
  const envTarget = new Set(data.derivedFacts.composeEnvFileServices.target);
  const gate = data.derivedFacts.platformCapabilityGate;
  L.authzgate = [
    "| Route group | Route files | Files that test the platform capability |",
    "|---|---|---|",
    `| ERP routes (\`src/app/api/erp\`) | ${gate.erpRoutes.files} | ${gate.erpRoutes.withGate} |`,
    `| Customer routes (\`src/app/api/tenant/customers\`) | ${gate.customerRoutes.files} | ${gate.customerRoutes.withGate} |`,
    "",
    `The test counted is \`${gate.expression}\`, read from the target tree.`,
    "",
    "| Route group | Files that read the platform identity (`getCurrentUser`) | Files with an equivalent platform gate |",
    "|---|---|---|",
    `| ERP routes | ${gate.erpRoutes.withGetCurrentUser} | ${gate.erpRoutes.withEquivalentGate} |`,
    `| Customer routes | ${gate.customerRoutes.withGetCurrentUser} | ${gate.customerRoutes.withEquivalentGate} |`,
    "",
    `The \`partyId\` column of a project is written by: ${gate.partyIdWriters.map((p) => `\`${p}\``).join(", ")}.`,
    `The non-test callers of \`generateDailyReport\` are ${data.derivedFacts.reportCorrectionCallers.callers.map((p) => `\`${p}\``).join(", ")}; the callers that mention a correction number ${data.derivedFacts.reportCorrectionCallers.withCorrection.length}.`,
  ].join("\n");

  L.runtimeenv = [
    "| Compose service | Declares env_file at the frozen source | Declares env_file at the target |",
    "|---|---|---|",
    ...[...new Set([...envFrozen, ...envTarget])].sort(byStr).map((n) => `| \`${n}\` | ${envFrozen.has(n) ? "yes" : "no"} | ${envTarget.has(n) ? "yes" : "no"} |`),
    "",
    `Variable names read by the new worker script: ${data.derivedFacts.workerEnvironmentNames.map((n) => `\`${n}\``).join(", ")}.`,
  ].join("\n");

  L.observations = [
    "| Observation | What was checked and found sound | Evidence items |",
    "|---|---|---|",
    ...data.positiveControls.map((p) => `| \`${p.id}\` | ${cell(p.title)} | ${p.evidence.length} |`),
  ].join("\n");

  L.supersessions = [
    "| Target | Kind | Statement |",
    "|---|---|---|",
    ...data.supersessions.map((x) => `| ${cell(x.target)} | ${x.kind} | ${cell(x.statement)} |`),
  ].join("\n");

  L.openitems = [
    "| Item | Statement |",
    "|---|---|",
    ...data.openItems.map((x) => `| \`${x.id}\` | ${cell(x.statement)} |`),
  ].join("\n");

  L.priorities = [
    "| Priority | Risk | Severity | Score | Scope |",
    "|---|---|---|---|---|",
    ...data.topPriorities.map((t) => `| ${t.priority} | \`${t.riskId}\` | **${t.severity}** | ${t.score} | ${t.scope} |`),
  ].join("\n");

  L.mutations = renderMutations(record);
  if (second) Object.assign(L, renderSecondLayerBlocks(data));
  return L;
}

/** The ledger of every changed path, the moved call sites and the three kinds of change: all read from derived sections. */
export function renderSecondLayerBlocks(data) {
  const ledger = data.delta.pathLedger;
  const sum = data.delta.pathLedgerSummary;
  const g = data.getPrisma;
  const L = {};
  const yes = (b) => (b ? "yes" : "no");
  const codeList = (ids) => ids.map((x) => `\`${x}\``).join(", ") || "none";
  L.pathledger = [
    "| Measure | Value |",
    "|---|---|",
    `| Changed paths in the ledger | ${sum.total} |`,
    `| Added / modified / deleted / renamed | ${sum.byChangeType.A} / ${sum.byChangeType.M} / ${sum.byChangeType.D} / ${sum.byChangeType.R} |`,
    `| Strict product paths / broad runtime-affecting paths | ${ledger.filter((r) => r.strictProduct).length} / ${ledger.filter((r) => r.broadProduct).length} |`,
    `| Security-relevant paths | ${sum.securityRelevant} |`,
    `| Paths with a valid recorded review | ${sum.reviewed} |`,
    `| Missing / extra / duplicate / stale | ${sum.missing} / ${sum.extra} / ${sum.duplicate} / ${sum.stale} |`,
    "",
    "| Category | Paths |",
    "|---|---|",
    ...Object.entries(sum.byCategory).map(([k, n]) => `| ${k} | ${n} |`),
    "",
    "| Disposition | Paths |",
    "|---|---|",
    ...Object.entries(sum.byDisposition).map(([k, n]) => `| ${k} | ${n} |`),
    "",
    "| Path | Type | Category | Strict | Broad | Security | Disposition | Findings | Controls | Target blob |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...ledger.map(
      (r) =>
        `| \`${r.path}\`${r.previousPath ? ` (from \`${r.previousPath}\`)` : ""} | ${r.changeType} | ${r.category} | ${yes(r.strictProduct)} | ${yes(r.broadProduct)} | ${r.securityRelevant === null ? "n/a" : yes(r.securityRelevant)} | ${r.disposition ?? "UNREVIEWED"} | ${codeList(r.findingIds)} | ${codeList(r.positiveControlIds)} | ${r.targetBlob ? r.targetBlob.slice(0, 10) : "none"} |`,
    ),
  ].join("\n");
  L.movedledger = [
    "| After | Before | Lines moved | Classification | Verdict changed | Source behaviour changed | Derived tags added / removed | Old identifier left behind |",
    "|---|---|---|---|---|---|---|---|",
    ...g.movedLedger.map(
      (r) =>
        `| \`${r.after.id}\` | \`${r.before.id}\` | ${r.lineDelta} | ${r.classification.after} | ${yes(r.classificationSemanticChange)} | ${yes(r.sourceBehavior.bodyChanged)} | ${r.derivedTagChanges.added.join(", ") || "none"} / ${r.derivedTagChanges.removed.join(", ") || "none"} | ${r.oldIdResidue} |`,
    ),
  ].join("\n");
  const m = g.changeModel;
  L.changemodel = [
    "| Kind of change | Moved call sites |",
    "|---|---|",
    `| classificationSemanticChanges | ${m.classificationSemanticChanges} |`,
    `| sourceBehaviorChanges | ${m.sourceBehaviorChanges} |`,
    `| derivedTagChanges | ${m.derivedTagChanges} |`,
    `| Position only | ${m.positionOnlyPairs} |`,
    "",
    `Moved pairs ${m.movedPairs}, genuinely added ${m.genuinelyAdded}, genuinely removed ${m.genuinelyRemoved}, unchanged records ${m.unchangedRecords}.`,
    "",
    "| Call site | Enclosing function | Source behaviour that changed |",
    "|---|---|---|",
    ...g.movedLedger.filter((r) => r.sourceBehavior.bodyChanged).map((r) => `| \`${r.after.id}\` | ${r.sourceBehavior.enclosingFunction ?? "n/a"} | ${cell(r.sourceBehavior.summary ?? "UNDECLARED")} |`),
  ].join("\n");
  return L;
}

export function renderMutations(record) {
  if (!record) return "No campaign record exists yet.";
  const t = record.totals;
  const rows = [
    "| Measure | Value |",
    "|---|---|",
    `| Manifest version | ${record.manifestVersion} |`,
    `| Manifest SHA-256 | \`${record.manifestSha256}\` |`,
    `| Mutants | ${t.mutants} |`,
    `| Targeted kills | ${t.targetedKill} |`,
    `| Incidental kills | ${t.incidental} |`,
    `| Survivors | ${t.survived} |`,
    `| Invalid mutants | ${t.invalid} |`,
    `| Placebos green | ${t.placebosGreen} of ${t.mutants} |`,
    `| Controls as expected | ${t.controlsAsExpected} of ${t.controls} |`,
    `| Deviations | ${t.deviations} |`,
    `| Cleanup | ${record.cleanup} |`,
    "",
    "| Mutant | Gate under test | Named test | Result |",
    "|---|---|---|---|",
    ...record.mutants.map((m) => `| \`${m.id}\` | ${cell(m.gate)} | ${cell(m.test)} | ${m.status} |`),
  ];
  return rows.join("\n");
}

export function extractBlock(md, name) {
  const open = `${BLOCK_OPEN(name)}\n`;
  const a = md.indexOf(open);
  if (a === -1) return null;
  const start = a + open.length;
  const b = md.indexOf(`\n${BLOCK_CLOSE(name)}`, start - 1);
  if (b === -1) return null;
  return md.slice(start, Math.max(start, b));
}

export const BLOCK_NAMES = Object.freeze(["scopes", "delta", "getprisma", "runtimeenv", "authzgate", "findings", "priorities", "historicalfiles", "observations", "supersessions", "openitems", "mutations"]);
/** The second layer's report carries three more generated blocks: the path ledger, the moved call sites and the change model. */
export const SECOND_BLOCK_NAMES = Object.freeze([...BLOCK_NAMES, "pathledger", "movedledger", "changemodel"]);
export const blockNamesOf = (layer) => (layer === "SECOND" ? SECOND_BLOCK_NAMES : BLOCK_NAMES);

export function fillBlocks(md, blocks, names = BLOCK_NAMES) {
  let out = md;
  for (const name of names) {
    const a = out.indexOf(BLOCK_OPEN(name));
    const b = out.indexOf(BLOCK_CLOSE(name));
    if (a < 0 || b < a) throw new Error(`block absent: ${name}`);
    out = `${out.slice(0, a)}${BLOCK_OPEN(name)}\n${blocks[name]}\n${out.slice(b)}`;
  }
  return out;
}

export function narrativeOnly(md, names = BLOCK_NAMES) {
  let out = md;
  for (const name of names) {
    const a = out.indexOf(BLOCK_OPEN(name));
    const b = out.indexOf(BLOCK_CLOSE(name));
    if (a < 0 || b < a) continue;
    out = `${out.slice(0, a)}${out.slice(a, b).replace(/[^\n]/g, "")}${out.slice(b)}`;
  }
  return out;
}

/* ── the gates ─────────────────────────────────────────────────────────────── */

const v = (klass, code, detail) => ({ klass, code, detail });
const ABSOLUTE_PATH = /[A-Za-z]:[\\/]|\/(?:home|Users|root)\/|\\\\|AppData|\/tmp\//;
const ABSOLUTE_PATH_NO_UNC = /[A-Za-z]:[\\/]|\/(?:home|Users|root)\/|AppData|\/tmp\//;
const TIMESTAMP = /\b\d{1,2}:\d{2}(?::\d{2})?\b|\d{4}-\d{2}-\d{2}T\d{2}/;
const NARRATIVE_NUMBER = /(?<![A-Za-z0-9.§-])\d+\s+(?:[A-Za-z0-9_`-]+\s+){0,3}(?:commits?|paths?|call sites?|call expressions?|files?|routes?|findings?|risks?)\b/i;

export function checkRelock(data, md, paths, record, extra = {}) {
  const out = [];
  const root = paths.root;
  const add = (...a) => out.push(v(...a));

  /* schema: authored keys, no unknown keys, derived keys present */
  // (an unknown top-level key is refused by the structural validator below)
  for (const k of DERIVED_KEYS) if (!(k in data)) add("SCHEMA", "MISSING_KEY", `top level: missing derived key "${k}"`);
  const authored = Object.fromEntries(Object.entries(data).filter(([k]) => !DERIVED_KEYS.includes(k)));
  const shape = [];
  validateShape(authored, AUTHORED_SPEC, "$", shape);
  out.push(...shape);
  if (data.schemaVersion !== SCHEMA_VERSION) add("SCHEMA", "SCHEMA_VERSION", `schemaVersion must be ${SCHEMA_VERSION}`);
  if (data.methodVersion !== RELOCK_METHOD_VERSION) add("SCHEMA", "METHOD_VERSION", `methodVersion must be ${RELOCK_METHOD_VERSION}`);
  if (out.some((x) => x.klass === "SCHEMA")) return out;

  /* sources */
  const s = data.sources;
  const objectsPresent = ["frozenSourceSha", "securityHeadSha", "targetMainSha", "integrationMergeSha"].every((k) => hasCommit(s[k], root));
  if (!objectsPresent) {
    add("SOURCES", "GIT_OBJECTS", "a named commit is not present in this repository");
    return out;
  }
  if (!gitOk(["merge-base", "--is-ancestor", s.frozenSourceSha, s.targetMainSha], root)) add("SOURCES", "FROZEN_NOT_ANCESTOR_OF_TARGET", "the frozen source must be an ancestor of the target");
  if (git(["merge-base", s.securityHeadSha, s.targetMainSha], root).trim() !== s.frozenSourceSha) add("SOURCES", "MERGE_BASE", "merge-base of the security head and the target must be the frozen source");
  const parents = git(["rev-list", "--parents", "-n", "1", s.integrationMergeSha], root).trim().split(" ").slice(1);
  if (!(parents.length === 2 && parents[0] === s.targetMainSha && parents[1] === s.securityHeadSha)) {
    add("SOURCES", "MERGE_PARENTS", "the integration merge must have the target and the security head as its two parents, in that order");
  }
  if (!gitOk(["merge-base", "--is-ancestor", s.integrationMergeSha, "HEAD"], root)) add("SOURCES", "HEAD_NOT_DESCENDANT", "HEAD must descend from the integration merge");
  /* a second-layer sources block names the range base, which must itself descend from the original frozen source */
  const layer = layerOf(data);
  if (layer === "SECOND") {
    if (!s.originalFrozenSourceSha) add("SOURCES", "ORIGINAL_FROZEN_SOURCE_ABSENT", "a second-layer document must name the original frozen source");
    else if (!hasCommit(s.originalFrozenSourceSha, root)) add("SOURCES", "GIT_OBJECTS", "the original frozen source is not present in this repository");
    else if (!gitOk(["merge-base", "--is-ancestor", s.originalFrozenSourceSha, s.frozenSourceSha], root) || s.originalFrozenSourceSha === s.frozenSourceSha) {
      add("SOURCES", "ORIGINAL_FROZEN_SOURCE_NOT_ANCESTOR", "the original frozen source must be a proper ancestor of the second-layer range base");
    }
  } else if (s.originalFrozenSourceSha !== undefined) {
    add("SOURCES", "ORIGINAL_FROZEN_SOURCE_UNEXPECTED", "a first-layer document does not carry an original frozen source");
  }
  if (s.reconciledTreeSha !== undefined && (!hasCommit(s.reconciledTreeSha, root) || !gitOk(["merge-base", "--is-ancestor", s.integrationMergeSha, s.reconciledTreeSha], root))) {
    add("SOURCES", "RECONCILED_TREE_NOT_DESCENDANT", "the reconciled tree commit must exist and descend from the integration merge");
  }
  const headBase = layer === "FIRST" ? successorBase(paths, s) : s.integrationMergeSha;
  out.push(...headViolations(s, root, headBase));
  out.push(...worktreeViolations(worktreeStatus(root)));
  out.push(...indexFlagViolations(indexFlags(root)));
  if (out.length) return out;

  /* derived sections are recomputed, never trusted */
  const orphan = orphanAdjudications(paths);
  for (const o of orphan) add("DERIVED_DRIFT", "ORPHAN_ADJUDICATION", o);
  if (JSON.stringify(treeInventorySummary(root)) !== JSON.stringify(readJson(paths.inventory).summary)) {
    add("DERIVED_DRIFT", "STALE_INVENTORY", "the committed inventory's summary differs from the one the scanner derives from the tree");
  }
  const fresh = deriveAll(data, paths);
  for (const key of DERIVED_KEYS) {
    if (JSON.stringify(fresh[key]) !== JSON.stringify(data[key])) add("DERIVED_DRIFT", "DERIVED_DRIFT", `section "${key}" does not match what git, the S0 inventory and the register produce`);
  }
  if (fresh.getPrisma.unresolved !== 0) add("DERIVED_DRIFT", "GETPRISMA_UNRESOLVED", `${fresh.getPrisma.unresolved} call sites are unresolved`);
  if (fresh.getPrisma.unresolvedEdges !== 0) add("DERIVED_DRIFT", "GETPRISMA_UNRESOLVED_EDGES", `${fresh.getPrisma.unresolvedEdges} consumer edges are unresolved`);
  const pp = fresh.getPrisma.primaryPartition;
  if (pp.sum !== pp.total || pp.sum !== fresh.getPrisma.after.realCallExpressions || pp.missingPrimaryIds + pp.duplicatePrimaryIds + pp.outsideClosedSet !== 0) {
    add("DERIVED_DRIFT", "PRIMARY_PARTITION", "the primary partition does not cover every real call expression exactly once");
  }
  for (const a of fresh.getPrisma.added) {
    if (!a.position.tokenFound) add("DERIVED_DRIFT", "CALLSITE_POSITION", `${a.id}: no getPrisma token at the recorded line and column`);
    if (a.reachability === null) add("DERIVED_DRIFT", "CALLSITE_NOT_REVIEWED", `${a.id}: no reachability review is recorded`);
    if (a.staticImporters.length === 0) add("DERIVED_DRIFT", "CALLSITE_NO_CONSUMER", `${a.id}: no consumer could be derived`);
  }
  const reviewedIds = new Set(data.reviewedCallsites.map((r) => r.id));
  const addedIds = new Set(fresh.getPrisma.added.map((a) => a.id));
  for (const id of reviewedIds) if (!addedIds.has(id)) add("DERIVED_DRIFT", "REVIEW_OF_UNKNOWN_CALLSITE", `${id} is not a call site added by the delta`);
  const reg = readJson(paths.register);
  const edgeRow = fresh.historicalFiles.find((h) => h.role === "S0_EVIDENCE");
  for (const x of historicalViolations(fresh.historicalFiles, edgeRow ? sha256(readFileSync(join(root, edgeRow.path))) : null, layer === "FIRST" ? reg.reconciliation?.historicalSnapshot?.registerFileSha256 ?? null : null)) {
    out.push(x);
  }

  /* findings */
  const deltaPaths = new Set(deltaPathRows(s, root).map((r) => r.path));
  const evidenceCtx = { root, sha: s.integrationMergeSha };
  const seen = new Set();
  const regFindings = new Map(reg.findings.map((f) => [f.findingId, f]));
  const regRisks = new Map(reg.risks.map((r) => [r.riskId, r]));
  const declared = new Set(data.findings.map((f) => f.registerFindingId));
  const docRel = `docs/security/${LAYERS[layer].data}`;
  for (const f of reg.findings.filter((x) => x.family === DELTA_FAMILY && (x.source === undefined || x.source === docRel))) {
    if (!declared.has(f.findingId)) add("FINDINGS", "REGISTER_FINDING_MISSING_FROM_DELTA", `${f.findingId} is in the register but not in the delta document`);
  }
  const addedFiles = new Map(fresh.getPrisma.added.map((a) => [a.id, a.position.file]));
  for (const f of data.findings) {
    const w = f.findingId;
    if (!FINDING_ID.test(w)) add("FINDINGS", "FINDING_ID", `${w}: malformed id`);
    else if (!LAYER_ID_PREFIXES[layer].includes(idPrefix(w))) add("FINDINGS", "FINDING_LAYER", `${w}: a ${layer.toLowerCase()}-layer document may not carry this identifier`);
    if (f.registerFindingId !== `${DELTA_FINDING_PREFIX}${f.findingId}`) add("FINDINGS", "REGISTER_ID", `${w}: registerFindingId must be ${DELTA_FINDING_PREFIX}${w}`);
    if (seen.has(w)) add("FINDINGS", "DUPLICATE_FINDING", `${w}: declared twice`);
    seen.add(w);
    if (!RISK_ID.test(f.canonicalRiskId)) add("FINDINGS", "RISK_ID", `${w}: ${f.canonicalRiskId}`);
    const rf = regFindings.get(f.registerFindingId);
    if (!rf) add("FINDINGS", "FINDING_NOT_IN_REGISTER", `${w}: ${f.registerFindingId} is not in the canonical register`);
    else {
      if (rf.ownerRiskId !== f.canonicalRiskId) add("FINDINGS", "OWNER_DISAGREES", `${w}: register owner ${rf.ownerRiskId}, delta owner ${f.canonicalRiskId}`);
      if (rf.deltaDisposition !== f.disposition) add("FINDINGS", "DISPOSITION_DISAGREES", `${w}: register ${rf.deltaDisposition}, delta ${f.disposition}`);
      if (rf.status !== DISPOSITION_STATUS[f.disposition]) add("FINDINGS", "STATUS_DISAGREES", `${w}: register status ${rf.status}`);
      const owners = reg.risks.filter((r) => r.sourceFindingIds.includes(f.registerFindingId)).map((r) => r.riskId);
      if (owners.length === 0) add("FINDINGS", "NO_OWNER", `${w}: no risk lists it`);
      if (owners.length > 1) add("FINDINGS", "DUPLICATE_OWNERSHIP", `${w}: listed by ${owners.join(", ")}`);
      const owner = regRisks.get(f.canonicalRiskId);
      if (!owner) add("FINDINGS", "OWNER_RISK_MISSING", `${w}: ${f.canonicalRiskId}`);
      else {
        const newScope = (owner.originScope ?? "HISTORICAL_S1_BASELINE") === "DELTA_RELOCK";
        if (layer === "SECOND") {
          // The supplementary relock may open a risk of its own (scope DELTA_RELOCK_2). A risk the first relock opened is
          // already existing for it, and only a risk of its own scope is new.
          const ownScope = (owner.originScope ?? "HISTORICAL_S1_BASELINE") === "DELTA_RELOCK_2";
          if (f.disposition === "OWNED_BY_NEW_RISK" && !ownScope) add("FINDINGS", "SECOND_LAYER_NEW_RISK", `${w}: ${owner.riskId} was not opened by the second layer, so the finding cannot claim a new risk`);
          if (f.disposition === "OWNED_BY_EXISTING_RISK" && ownScope) add("FINDINGS", "SECOND_LAYER_EXISTING_RISK", `${w}: ${owner.riskId} was opened by the second layer, so the finding cannot call it existing`);
        } else {
          if (f.disposition === "OWNED_BY_NEW_RISK" && !newScope) add("FINDINGS", "NEW_RISK_EXPECTED", `${w}: ${owner.riskId} is a historical risk`);
          if (f.disposition === "OWNED_BY_EXISTING_RISK" && newScope) add("FINDINGS", "EXISTING_RISK_EXPECTED", `${w}: ${owner.riskId} is a delta risk`);
        }
      }
    }
    // callsite linkage
    if (f.callsiteBacked && f.relatedCallsiteIds.length === 0) add("FINDINGS", "CALLSITE_BACKED_WITHOUT_LINK", `${w}: callsiteBacked is true and no call site is linked`);
    if (!f.callsiteBacked && f.relatedCallsiteIds.length > 0) add("FINDINGS", "LINK_WITHOUT_CALLSITE_BACKED", `${w}: call sites are linked but callsiteBacked is false`);
    if (f.relatedCallsiteIds.length > 0 && !f.callsiteRelation) add("FINDINGS", "LINK_WITHOUT_RELATION", `${w}: a linked call site needs callsiteRelation`);
    const evPaths = new Set(f.evidence.map((e) => e.path));
    for (const id of f.relatedCallsiteIds) {
      if (!addedIds.has(id)) add("FINDINGS", "CALLSITE_LINK", `${w}: ${id} is not a call site added by the delta`);
      else if (!evPaths.has(addedFiles.get(id))) add("FINDINGS", "CALLSITE_LINK_NOT_ANCHORED", `${w}: ${id} is linked but no evidence cites ${addedFiles.get(id)}`);
    }
    // evidence
    if (!f.evidence.some((e) => e.scope === "DELTA")) add("FINDINGS", "NO_DELTA_EVIDENCE", `${w}: no evidence in scope DELTA`);
    checkEvidence(f.evidence, w, evidenceCtx, deltaPaths, add);
  }
  for (const p of data.positiveControls) {
    if (!OBSERVATION_ID.test(p.id) || !LAYER_ID_PREFIXES[layer].includes(idPrefix(p.id))) add("FINDINGS", "OBSERVATION_ID", p.id);
    checkEvidence(p.evidence, p.id, evidenceCtx, deltaPaths, add);
  }
  const proj = new Map(data.canonicalProjection.map((p) => [p.findingId, p]));
  for (const f of data.findings) if (!proj.has(f.findingId)) add("FINDINGS", "PROJECTION_MISSING", f.findingId);
  // The content pins describe first-layer findings; a second-layer document carries none of them.
  if (layer === "FIRST") out.push(...identityViolations(data, reg, fresh.derivedFacts, root));
  out.push(...duplicateContentViolations(data.findings));

  if (layer === "SECOND") out.push(...secondLayerViolations(data, fresh, md, paths, root));
  else if ("pathDispositions" in data || "sourceBehaviorChanges" in data) add("SCHEMA", "LAYER_KEY", "the ledger keys belong to the second layer");

  /* report */
  if (typeof md !== "string") add("REPORT", "REPORT_MISSING", "the Markdown report was not supplied");
  else {
    const blocks = renderBlocks(data, record);
    for (const name of blockNamesOf(layer)) {
      const found = extractBlock(md, name);
      if (found === null) add("REPORT", "BLOCK_ABSENT", `block ${name}`);
      else if (found !== blocks[name]) add("REPORT", "BLOCK_DRIFT", `block ${name} differs from the renderer`);
    }
    for (const f of data.findings) if (!md.includes(f.registerFindingId)) add("REPORT", "FINDING_NOT_IN_REPORT", f.registerFindingId);
    for (const p of data.positiveControls) if (!md.includes(p.id)) add("REPORT", "OBSERVATION_NOT_IN_REPORT", p.id);
    const nar = narrativeOnly(md, blockNamesOf(layer));
    nar.split("\n").forEach((line, i) => {
      if (NARRATIVE_NUMBER.test(line)) add("REPORT", "UNMARKED_NARRATIVE_NUMBER", `line ${i + 1}: ${line.trim().slice(0, 70)}`);
    });
    if (/INDEPENDENT_PASS|independent PASS (?:issued|granted)/i.test(md)) add("REPORT", "REPORT_CLAIM", "the report must not claim an independent PASS");
  }

  /* the mutation record (internal consistency; its binding to the files is the campaign tool's gate) */
  for (const r of recordViolations(record)) add("RECORD", r.code, r.detail);

  /* content */
  const text = JSON.stringify(data);
  const openId = (line) => /^\s*"id": "OPEN-\d+",?$/.test(line) || /^\| `OPEN-\d+` \|/.test(line);
  const stale = [
    ...staleProcessTextHits(JSON.stringify(data, null, 2), "delta", { openIdLine: openId }),
    ...(typeof md === "string" ? staleProcessTextHits(md, "report", { openIdLine: openId }) : []),
  ];
  if (stale.length) add("CONTENT", "STALE_PROCESS_TEXT", `${stale.length} line(s) still describe a finished step, first at ${stale[0].label}:${stale[0].line} (${stale[0].pattern})`);
  const hits = [...secretShapeHits(text, "delta"), ...(typeof md === "string" ? secretShapeHits(md, "report") : [])];
  if (hits.length) add("CONTENT", "SECRET_SHAPE", `${hits.length} secret-shaped string(s)`);
  // The regex fields of an evidence item are SOURCE TEXT of a pattern and legitimately contain backslashes, which a
  // JSON dump doubles into what looks like a UNC prefix. They are read with the rule that has no UNC clause; every
  // other string is read with the full rule.
  const REGEX_FIELDS = ["pattern", "lacks", "symbol"];
  const dataWithoutRegex = JSON.stringify(data, (k, val) => (REGEX_FIELDS.includes(k) ? "" : val));
  const regexFields = [];
  for (const f of [...data.findings, ...data.positiveControls]) for (const e of f.evidence) for (const k of REGEX_FIELDS) if (typeof e[k] === "string") regexFields.push(e[k]);
  if (ABSOLUTE_PATH.test(dataWithoutRegex) || (typeof md === "string" && ABSOLUTE_PATH.test(md)) || regexFields.some((p) => ABSOLUTE_PATH_NO_UNC.test(p))) {
    add("CONTENT", "ABSOLUTE_PATH", "an absolute local path is present");
  }
  if (TIMESTAMP.test(text) || (typeof md === "string" && TIMESTAMP.test(md))) add("CONTENT", "TIMESTAMP", "a clock time or date-time is present");
  void extra;
  return out;
}

/* ── layer 2: the ledger, the moved call sites and the three kinds of change are gated ─────────── */

const ALLOWED_SEMANTIC_PHRASE = /classificationSemanticChanges?/g;
/** "semantic change" with no qualifier is the number the first draft misread; only the three named kinds may be counted. */
export function unqualifiedSemanticChange(text) {
  return /semantic[\s-]*changes?/i.test(String(text).replace(ALLOWED_SEMANTIC_PHRASE, ""));
}

const evidenceCovers = (evidencePath, rowPath) => rowPath === evidencePath || (evidencePath.endsWith("/") && rowPath.startsWith(evidencePath));

export function secondLayerViolations(data, fresh, md, paths, root) {
  const out = [];
  const add = (...a) => out.push(v(...a));
  const authoredText = JSON.stringify(Object.fromEntries(Object.entries(data).filter(([k]) => !["delta", "getPrisma", "derivedFacts", "historicalFiles", "canonicalProjection", "topPriorities"].includes(k))));
  if (!Array.isArray(data.pathDispositions)) add("FINDINGS", "LEDGER_ABSENT", "a second-layer document must carry pathDispositions");
  if (!Array.isArray(data.sourceBehaviorChanges)) add("FINDINGS", "SOURCE_BEHAVIOR_LIST_ABSENT", "a second-layer document must carry sourceBehaviorChanges");
  // an absent list is reported above and read as empty below, so the rest of the gate still answers instead of crashing
  const authoredLedger = Array.isArray(data.pathDispositions) ? data.pathDispositions : [];
  const authoredBehavior = Array.isArray(data.sourceBehaviorChanges) ? data.sourceBehaviorChanges : [];

  /* the ledger covers exactly the changed paths, once each, as they are now */
  const ledger = fresh.delta.pathLedger;
  const sum = fresh.delta.pathLedgerSummary;
  const gitPaths = new Set(deltaPathRows(data.sources, root).map((r) => r.path));
  const ledgerPaths = new Set(ledger.flatMap((r) => [r.path, ...(r.previousPath ? [r.previousPath] : [])]));
  const authoredByPath = new Map();
  for (const a of authoredLedger) {
    if (authoredByPath.has(a.path)) add("FINDINGS", "LEDGER_DUPLICATE", `${a.path}: recorded twice`);
    else authoredByPath.set(a.path, a);
  }
  for (const g of gitPaths) if (!ledgerPaths.has(g)) add("FINDINGS", "LEDGER_PATHSET", `${g}: changed in the range and absent from the ledger`);
  for (const l of ledgerPaths) if (!gitPaths.has(l)) add("FINDINGS", "LEDGER_PATHSET", `${l}: in the ledger but not changed in the range`);
  if (sum.total !== ledger.length || sum.uniquePaths !== ledger.length) add("FINDINGS", "LEDGER_COUNT", "the ledger summary does not count its rows");
  for (const row of ledger) {
    const a = authoredByPath.get(row.path);
    if (!a) {
      add("FINDINGS", "LEDGER_MISSING", `${row.path}: no disposition is recorded`);
      continue;
    }
    if (a.changeType !== row.changeType) add("FINDINGS", "LEDGER_CHANGE_TYPE", `${row.path}: reviewed as ${a.changeType}, git reports ${row.changeType}`);
    else if (a.reviewedBlob !== (row.targetBlob ?? "ABSENT")) add("FINDINGS", "LEDGER_STALE", `${row.path}: the reviewed content is not the content at the target`);
  }
  for (const a of authoredByPath.keys()) if (!ledgerPaths.has(a)) add("FINDINGS", "LEDGER_EXTRA", `${a}: a disposition for a path the range did not change`);

  /* each row is internally sound and cross-checked against the findings and observations it names */
  const findings = new Map(data.findings.map((f) => [f.findingId, f]));
  const controls = new Map(data.positiveControls.map((c) => [c.id, c]));
  const linked = new Map();
  for (const row of ledger) {
    if (!row.reviewed) continue;
    const w = row.path;
    if (row.disposition in DISPOSITION_CATEGORY && DISPOSITION_CATEGORY[row.disposition] !== row.category) add("FINDINGS", "LEDGER_DISPOSITION_CATEGORY", `${w}: ${row.disposition} describes ${DISPOSITION_CATEGORY[row.disposition]} paths, this one is ${row.category}`);
    const hasLinks = row.findingIds.length + row.positiveControlIds.length > 0;
    if (row.securityRelevant && !hasLinks) add("FINDINGS", "LEDGER_SECURITY_UNLINKED", `${w}: security-relevant and tied to no finding or positive control`);
    if (!row.securityRelevant && hasLinks) add("FINDINGS", "LEDGER_LINK_WITHOUT_SECURITY", `${w}: names a finding or a control and is not marked security-relevant`);
    if (row.disposition === "FINDING_EVIDENCE" && row.findingIds.length === 0) add("FINDINGS", "LEDGER_DISPOSITION_LINKS", `${w}: FINDING_EVIDENCE names no finding`);
    if (row.disposition === "POSITIVE_CONTROL_EVIDENCE" && row.positiveControlIds.length === 0) add("FINDINGS", "LEDGER_DISPOSITION_LINKS", `${w}: POSITIVE_CONTROL_EVIDENCE names no control`);
    if (!["FINDING_EVIDENCE", "POSITIVE_CONTROL_EVIDENCE"].includes(row.disposition) && (row.securityRelevant || hasLinks)) add("FINDINGS", "LEDGER_DISPOSITION_LINKS", `${w}: ${row.disposition} cannot be security-relevant or linked`);
    for (const id of row.findingIds) {
      const f = LEDGER_FINDING_ID.test(id) ? findings.get(id) : undefined;
      if (!f) {
        add("FINDINGS", "LEDGER_FINDING_UNKNOWN", `${w}: ${id} is not a finding of this document`);
        continue;
      }
      if (!f.evidence.some((e) => evidenceCovers(e.path, row.path) || (row.previousPath && evidenceCovers(e.path, row.previousPath)))) add("FINDINGS", "LEDGER_LINK_NOT_EVIDENCED", `${w}: ${id} cites no evidence at this path`);
      linked.set(`${id}|${row.path}`, true);
    }
    for (const id of row.positiveControlIds) {
      const c = LEDGER_CONTROL_ID.test(id) ? controls.get(id) : undefined;
      if (!c) {
        add("FINDINGS", "LEDGER_CONTROL_UNKNOWN", `${w}: ${id} is not an observation of this document`);
        continue;
      }
      if (!c.evidence.some((e) => evidenceCovers(e.path, row.path) || (row.previousPath && evidenceCovers(e.path, row.previousPath)))) add("FINDINGS", "LEDGER_LINK_NOT_EVIDENCED", `${w}: ${id} cites no evidence at this path`);
      linked.set(`${id}|${row.path}`, true);
    }
  }
  /* and the other way: every changed path a finding or an observation cites as DELTA evidence is a ledger row that names it */
  for (const item of [...data.findings.map((f) => ({ id: f.findingId, evidence: f.evidence })), ...data.positiveControls.map((c) => ({ id: c.id, evidence: c.evidence }))]) {
    for (const e of item.evidence) {
      if (e.scope !== "DELTA") continue;
      const rows = ledger.filter((r) => evidenceCovers(e.path, r.path));
      if (rows.length === 0 || !rows.some((r) => linked.has(`${item.id}|${r.path}`))) add("FINDINGS", "LEDGER_EVIDENCE_NOT_LINKED", `${item.id}: its evidence at ${e.path} is not named by any ledger row`);
    }
  }

  /* the moved call sites */
  const g = fresh.getPrisma;
  const mp = g.movedPairProblems;
  if (mp.ambiguous.length) add("DERIVED_DRIFT", "MOVED_PAIR_AMBIGUOUS", `${mp.ambiguous.length} moved call site(s) cannot be paired one to one, first ${mp.ambiguous[0]}`);
  if (g.movedLedger.length !== g.moved.length - mp.ambiguous.length) add("DERIVED_DRIFT", "MOVED_LEDGER_INCOMPLETE", "the moved ledger does not hold one row per moved call site");
  const declared = new Map();
  for (const s of authoredBehavior) {
    if (declared.has(s.callsiteId)) add("FINDINGS", "SOURCE_BEHAVIOR_DUPLICATE", s.callsiteId);
    declared.set(s.callsiteId, s.summary);
  }
  const movedAfter = new Set(g.movedLedger.map((r) => r.after.id));
  for (const id of declared.keys()) if (!movedAfter.has(id)) add("FINDINGS", "SOURCE_BEHAVIOR_UNKNOWN_CALLSITE", `${id} is not a moved call site`);
  for (const r of g.movedLedger) {
    const w = r.after.id;
    if (r.classificationSemanticChange) add("DERIVED_DRIFT", "MOVED_PAIR_REINTERPRETED", `${w}: its verdict changed, so it is not a move`);
    if (r.oldIdResidue > 0) add("DERIVED_DRIFT", "MOVED_OLD_ID_RESIDUE", `${w}: the old identifier ${r.before.id} still occurs ${r.oldIdResidue} time(s) in the S0 artifacts`);
    if (authoredText.includes(r.before.id) || (typeof md === "string" && narrativeOnly(md, SECOND_BLOCK_NAMES).includes(r.before.id))) add("DERIVED_DRIFT", "MOVED_OLD_ID_IN_DOCUMENT", `${w}: the old identifier ${r.before.id} is named outside the derived ledgers`);
    if (r.sourceBehavior.bodyChanged && !declared.get(w)) add("FINDINGS", "SOURCE_BEHAVIOR_UNDECLARED", `${w}: the code of ${r.sourceBehavior.enclosingFunction} changed and no sourceBehaviorChanges entry says how`);
    if (!r.sourceBehavior.bodyChanged && declared.get(w)) add("FINDINGS", "SOURCE_BEHAVIOR_SPURIOUS", `${w}: declared as a source behaviour change, the code did not change`);
    for (const problem of r.evidenceProblems) add("DERIVED_DRIFT", "MOVED_EVIDENCE_WINDOW", `${w}: ${problem}`);
  }
  const m = g.changeModel;
  if (m.classificationSemanticChanges !== g.movedLedger.filter((r) => r.classificationSemanticChange).length) add("DERIVED_DRIFT", "CHANGE_MODEL", "classificationSemanticChanges is not counted from the ledger");

  /* the words: three kinds of change, never one number */
  if (unqualifiedSemanticChange(authoredText)) add("CONTENT", "UNQUALIFIED_SEMANTIC_CHANGE", "the document says \"semantic change\" without naming which of classificationSemanticChanges, sourceBehaviorChanges or derivedTagChanges it means");
  if (typeof md === "string" && unqualifiedSemanticChange(narrativeOnly(md, SECOND_BLOCK_NAMES))) add("CONTENT", "UNQUALIFIED_SEMANTIC_CHANGE", "the report says \"semantic change\" without naming which kind of change it means");
  return out;
}

/**
 * IDENTITY PINS. An identifier alone does not say what a finding is, and a finding
 * whose text was swapped, reworded or re-owned under the same identifier must not
 * pass. The authoritative findings are therefore pinned by CONTENT:
 *
 *   - title, owner risk, affected assets, verification method and the acceptance
 *     criteria the owner risk must carry;
 *   - `facts`: structured, machine-evaluated claims about the committed target. Each
 *     fact names a source path, an extraction rule and its operand; the finding must
 *     carry an evidence item with the same `fact` identifier, path, rule and operand
 *     (the identity linkage), and `checkEvidence` evaluates that item against the
 *     blob of the integration merge. Dropping or editing the item fails the linkage,
 *     and a source that no longer shows the fact fails the evaluation;
 *   - `mechanismSha256` and `registerSummarySha256`: the digest of the canonical
 *     (whitespace-collapsed) mechanism sentence in the delta document and in the
 *     register. A phrase list cannot see an inverted sentence that keeps its
 *     keywords; a digest sees any change.
 */
export const canonicalText = (s) => String(s).replace(/\s+/g, " ").trim();
export const mechanismDigest = (s) => sha256(Buffer.from(canonicalText(s), "utf8"));

export const AUTHORITATIVE_IDENTITIES = Object.freeze({
  "RR-001": Object.freeze({
    title: "A transient failure of the site read freezes a report whose industrial section says FORBIDDEN",
    ownerRiskId: "R-68",
    affectedAssets: ["AUDIT_EVIDENCE", "FACTORY_AND_ERP_DATA", "WORKER_BOUNDARY"],
    sourceReferences: [
      { path: "src/lib/executive/report/worker.ts", anchor: "async function siteIdsOf(client: unknown, organizationId: string): Promise<string[]> {" },
      { path: "src/lib/executive/summary.ts", anchor: 'return refusedSection("FORBIDDEN", REASON.noSites);' },
      { path: "src/lib/executive/report/generate.ts", anchor: "if (existing && !args.correction) {" },
    ],
    mechanism: ["siteIdsOf", "empty list", "FORBIDDEN", "noSites", "no worker, route, scheduler or page passes it"],
    mechanismSha256: "f311bf5a206ac54f51adef8227d31a6d65c38198067b7535715769ee809a4827",
    registerSummary: ["single read of an organization's active sites", "FORBIDDEN"],
    registerSummarySha256: "023f149e395bf43570919308084b1e8759976dfb5d3bafd97ace2b91c53c5a36",
    acceptance: ["A test asserts that a failed site read writes no FORBIDDEN industrial section"],
    verificationMethod: "AUTOMATED_TEST",
    policyBranches: 0,
    facts: [
      { fact: "RR-001.SITE_IDS_FN", rule: "PRESENT", path: "src/lib/executive/report/worker.ts", anchor: "async function siteIdsOf(client: unknown, organizationId: string): Promise<string[]> {" },
      { fact: "RR-001.MISSING_DELEGATE_EMPTY", rule: "PRESENT", path: "src/lib/executive/report/worker.ts", anchor: "if (!sites) return [];" },
      { fact: "RR-001.CATCH_EMPTY", rule: "FN_BODY_REGEX", path: "src/lib/executive/report/worker.ts", pattern: "catch\\s*(?:\\([^)]*\\))?\\s*\\{\\s*return \\[\\];\\s*\\}", symbol: "siteIdsOf" },
      { fact: "RR-001.SCOPE_CONSUMES", rule: "PRESENT", path: "src/lib/executive/report/worker.ts", anchor: "siteIds: await siteIdsOf(client, organizationId)," },
      { fact: "RR-001.EMPTY_TO_FORBIDDEN", rule: "REGEX", path: "src/lib/executive/summary.ts", pattern: "if \\(siteIds\\.length === 0\\) \\{\\s*return refusedSection\\(\"FORBIDDEN\", REASON\\.noSites\\);" },
      { fact: "RR-001.CORRECTION_OPTION", rule: "PRESENT", path: "src/lib/executive/report/generate.ts", anchor: "correction?: { actorUserId: string; reason: string };" },
      { fact: "RR-001.ALREADY_REPORTED_GUARD", rule: "PRESENT", path: "src/lib/executive/report/generate.ts", anchor: "if (existing && !args.correction) {" },
      { fact: "RR-001.WORKER_NEVER_PASSES", rule: "ABSENT", path: "src/lib/executive/report/worker.ts", absent: "correction:" },
      { fact: "RR-001.NO_CORRECTION_CALLER", rule: "CALLERS_LACK", path: "src/lib/executive/report/generate.ts", pattern: "\\bgenerateDailyReport\\s*\\(", lacks: "\\bcorrection\\b" },
    ],
  }),
  "RR-002": Object.freeze({
    title: "The customer and project-link routes skip the platform-administrator gate that all ERP routes apply",
    ownerRiskId: "R-73",
    affectedAssets: ["AUTHORIZATION_BOUNDARY", "FACTORY_AND_ERP_DATA"],
    sourceReferences: [
      { path: "src/app/api/tenant/customers/[id]/projects/route.ts", anchor: 'if (!requirePermission(active.scope.role, "manage_erp").ok) return forbidden();' },
      { path: "src/app/api/erp/projects/route.ts", anchor: 'if (!can(user.role, "admin")) return erpFailure(new ErpError(403, "FORBIDDEN"));' },
      { path: "src/lib/customers/service.ts", anchor: "data: { partyId: next }," },
    ],
    mechanism: ["ERP route files", "platform capability", "getCurrentUser", "ErpProject.partyId", "authorization bypass inside the tenant"],
    mechanismSha256: "c225d680252e09045a81bbd9be99814df63ac0a5eb5282dd2f6ad36a9f136e92",
    registerSummary: ["ERP route files", "platform admin capability"],
    registerSummarySha256: "c6ff6d3f84548a9451d3ca5165de2040a542ba28c927668db65e946be29b8060",
    acceptance: [
      "If the owner decides that the platform-administrator capability is required on the customer surface:",
      "a test asserts that an OWNER or ADMIN who lacks the platform capability is refused by every customer route that reads or writes project data",
      "If the owner decides that tenant OWNER and ADMIN may use the customer surface without the platform capability:",
      "a test asserts that every role without view_erp (and without manage_erp for the link) is refused by the customer project routes",
    ],
    verificationMethod: "AUTOMATED_TEST",
    policyBranches: 2,
    facts: [
      { fact: "RR-002.PROJECTS_PERMISSION_ONLY", rule: "PRESENT", path: "src/app/api/tenant/customers/[id]/projects/route.ts", anchor: "if (!requirePermission(active.scope.role, \"manage_erp\").ok) return forbidden();" },
      { fact: "RR-002.ERP_REFERENCE_GATE", rule: "PRESENT", path: "src/app/api/erp/projects/route.ts", anchor: "if (!can(user.role, \"admin\")) return erpFailure(new ErpError(403, \"FORBIDDEN\"));" },
      { fact: "RR-002.PARTY_WRITE", rule: "PRESENT", path: "src/lib/customers/service.ts", anchor: "data: { partyId: next }," },
      { fact: "RR-002.NO_GETCURRENTUSER_PROJECTS", rule: "ABSENT", path: "src/app/api/tenant/customers/[id]/projects/route.ts", absent: "getCurrentUser" },
      { fact: "RR-002.NO_ADMIN_GATE_PROJECTS", rule: "ABSENT", path: "src/app/api/tenant/customers/[id]/projects/route.ts", absent: "can(user.role" },
      { fact: "RR-002.NO_GETCURRENTUSER_LIST", rule: "ABSENT", path: "src/app/api/tenant/customers/route.ts", absent: "getCurrentUser" },
      { fact: "RR-002.CUSTOMER_TREE_NO_GATE", rule: "TREE_ABSENT_REGEX", path: "src/app/api/tenant/customers/", pattern: "getCurrentUser|platformCan\\(|can\\(user\\.role" },
      { fact: "RR-002.PAGE_SCOPE_NO_GATE", rule: "ABSENT_REGEX", path: "src/lib/customers/page-scope.ts", pattern: "getCurrentUser|platformCan\\(|can\\(user\\.role" },
      { fact: "RR-002.PAGES_ORG_PERMISSION_ONLY", rule: "PRESENT", path: "src/lib/customers/page-scope.ts", anchor: "canViewProjects: can(role, \"view_erp\")," },
    ],
  }),
  "RR-010": Object.freeze({
    title: "Creating a frozen financial snapshot and reading the archive leave no audit record",
    ownerRiskId: "R-69",
    affectedAssets: ["AUDIT_EVIDENCE", "FACTORY_AND_ERP_DATA"],
    sourceReferences: [],
    mechanism: ["only audit write", "correction branch", "no audit writer at all", "no migration defines a database trigger", "is therefore not recorded"],
    mechanismSha256: "8bd027500a890b86af1a5892128566fc4893c9cec0e23055db9d38e024a73add",
    registerSummary: ["no audit record", "no read of the archive is audited", "database trigger"],
    registerSummarySha256: "02f41c5e7681917e238416d4f4d2e463c0edf895c47aa8ae598846b30238317b",
    acceptance: [
      "A test asserts that opening a stored report, on the archive list page and on the detail page, writes an audit event naming the reader, the organization and the night.",
      "A test asserts that the creation of a stored report by the nightly pass writes an audit event naming the organization and the night",
    ],
    verificationMethod: "AUTOMATED_TEST",
    policyBranches: 0,
    facts: [
      { fact: "RR-010.AUDIT_ONLY_ON_CORRECTION", rule: "REGEX", path: "src/lib/executive/report/generate.ts", pattern: "if \\(args\\.correction\\) \\{\\s*await recordAuditEvent\\(" },
      { fact: "RR-010.SINGLE_AUDIT_CALL", rule: "REGEX", path: "src/lib/executive/report/generate.ts", pattern: "^(?:(?!recordAuditEvent\\()[\\s\\S])*recordAuditEvent\\((?:(?!recordAuditEvent\\()[\\s\\S])*$" },
      { fact: "RR-010.CREATE_NOT_AUDITED", rule: "PRESENT", path: "src/lib/executive/report/generate.ts", anchor: "The ordinary nightly run is not audited per organization: it is" },
      { fact: "RR-010.NO_WORKER_AUDIT", rule: "ABSENT_REGEX", path: "src/lib/executive/report/worker.ts", pattern: "[Aa]udit" },
      { fact: "RR-010.NO_READ_AUDIT", rule: "ABSENT_REGEX", path: "src/lib/executive/report/read.ts", pattern: "[Aa]udit" },
      { fact: "RR-010.NO_LIST_PAGE_AUDIT", rule: "ABSENT_REGEX", path: "src/app/[locale]/dashboard/executive/reports/page.tsx", pattern: "[Aa]udit" },
      { fact: "RR-010.NO_DETAIL_PAGE_AUDIT", rule: "ABSENT_REGEX", path: "src/app/[locale]/dashboard/executive/reports/[date]/page.tsx", pattern: "[Aa]udit" },
      { fact: "RR-010.NO_RUN_ROUTE_AUDIT", rule: "ABSENT_REGEX", path: "src/app/api/executive/reports/run/route.ts", pattern: "[Aa]udit" },
      { fact: "RR-010.NO_DB_TRIGGER_MIGRATION", rule: "TREE_ABSENT_REGEX", path: "prisma/migrations/20261011090000_executive_daily_report/", pattern: "(?:TRIGGER|[Tt]rigger)" },
      { fact: "RR-010.NO_DB_TRIGGER_ANYWHERE", rule: "TREE_ABSENT_REGEX", path: "prisma/migrations/", pattern: "ExecutiveDailyReport.*(?:TRIGGER|[Tt]rigger)|(?:TRIGGER|[Tt]rigger).*ExecutiveDailyReport" },
    ],
  }),
  "RR-011": Object.freeze({
    title: "Customer personal data has no erasure, export or retention path",
    ownerRiskId: "R-72",
    affectedAssets: ["FACTORY_AND_ERP_DATA", "PII_AND_CANDIDATE_DATA"],
    sourceReferences: [],
    mechanism: ["Party and PartyInteraction are in none of them", "closed registries for erasure, export and processing", "no delete, anonymisation or export operation", "separate finding RR-007"],
    mechanismSha256: "bf3864235964a2793569942f8d662cfb42d2ed006988c157cee421c77318d102",
    registerSummary: ["closed erasure registry", "closed export registry", "processing inventory"],
    registerSummarySha256: "3693330aac02df9f32852e13b7c8e3a4d773ac93d7acea5db031f0de85866080",
    acceptance: [
      "If the owner decides that customer contact data and stored report snapshots are personal data:",
      "are enumerated in the closed registries erasure-targets, export-sources and processing-inventory",
      "If the owner decides that customer contact data and stored report snapshots are not subject to erasure and export:",
      "a test asserts that the closed registries name Party, PartyInteraction and the report snapshot as exempt with that basis",
    ],
    verificationMethod: "OWNER_POLICY_STATEMENT",
    policyBranches: 2,
    facts: [
      { fact: "RR-011.PARTY_PERSONAL_FIELDS", rule: "BLOCK_REGEX", path: "prisma/schema.prisma", pattern: "email\\s+String\\?[\\s\\S]*phone\\s+String\\?[\\s\\S]*notes\\s+String\\?", symbol: "model Party" },
      { fact: "RR-011.INTERACTION_FREE_TEXT", rule: "BLOCK_REGEX", path: "prisma/schema.prisma", pattern: "summary\\s+String\\s+@db\\.VarChar\\(2000\\)", symbol: "model PartyInteraction" },
      { fact: "RR-011.ERASURE_REGISTRY_LACKS_PARTY", rule: "ABSENT_REGEX", path: "src/lib/compliance/erasure-targets.ts", pattern: "\\bParty(?:Interaction)?\\b" },
      { fact: "RR-011.EXPORT_REGISTRY_LACKS_PARTY", rule: "ABSENT_REGEX", path: "src/lib/compliance/export-sources.ts", pattern: "\\bParty(?:Interaction)?\\b" },
      { fact: "RR-011.INVENTORY_LACKS_PARTY", rule: "ABSENT_REGEX", path: "src/lib/compliance/processing-inventory.ts", pattern: "\\bParty(?:Interaction)?\\b" },
      { fact: "RR-011.NO_DELETE_IN_LIB", rule: "TREE_ABSENT_REGEX", path: "src/lib/customers/", pattern: "\\.(?:delete|deleteMany)\\(" },
      { fact: "RR-011.NO_DELETE_IN_ROUTES", rule: "TREE_ABSENT_REGEX", path: "src/app/api/tenant/customers/", pattern: "\\.(?:delete|deleteMany)\\(" },
      { fact: "RR-011.NO_ANONYMISE_OR_EXPORT", rule: "TREE_ABSENT_REGEX", path: "src/lib/customers/", pattern: "anonymi[sz]e|export(?:Customer|Party|Parties)\\w*" },
      { fact: "RR-011.ONLY_ORG_CASCADE", rule: "BLOCK_REGEX", path: "prisma/schema.prisma", pattern: "organization\\s+Organization\\s+@relation\\(fields: \\[organizationId\\], references: \\[id\\], onDelete: Cascade\\)", symbol: "model Party" },
      { fact: "RR-011.NOTHING_DELETED_NOTE", rule: "PRESENT", path: "src/lib/customers/service.ts", anchor: "Nothing is deleted. A customer is archived; interactions are append-only." },
    ],
  }),
});

/** Where a finding must NOT reach: RR-011 is the customer records, RR-007 the frozen report snapshots. */
export const DOMAIN_SEPARATION = Object.freeze([
  { finding: "RR-011", forbiddenPrefix: "src/lib/executive/report/", because: "RR-011 concerns the customer records; the frozen report snapshots are RR-007" },
  { finding: "RR-007", forbiddenPrefix: "src/lib/customers/", because: "RR-007 concerns the frozen report snapshots; the customer records are RR-011" },
]);

/** The normalised key two findings share when they describe the same defect. */
const contentKey = (f) =>
  JSON.stringify(
    f.evidence
      .map((e) => `${e.path}|${e.anchor ?? ""}|${e.absent ?? ""}|${e.rule ?? ""}|${e.pattern ?? ""}|${e.symbol ?? ""}|${e.lacks ?? ""}`)
      .sort(),
  );

export function duplicateContentViolations(findings) {
  const out = [];
  const live = findings.filter((f) => f.disposition !== "DUPLICATE");
  const byTitle = new Map();
  const byKey = new Map();
  for (const f of live) {
    const t = f.title.trim().toLowerCase();
    if (byTitle.has(t)) out.push(v("FINDINGS", "DUPLICATE_FINDING_CONTENT", `${f.findingId} repeats the title of ${byTitle.get(t)}`));
    else byTitle.set(t, f.findingId);
    const k = contentKey(f);
    if (byKey.has(k)) out.push(v("FINDINGS", "DUPLICATE_FINDING_CONTENT", `${f.findingId} cites exactly the evidence of ${byKey.get(k)}`));
    else byKey.set(k, f.findingId);
  }
  return out;
}

const OPERAND_KEYS = Object.freeze(["anchor", "absent", "pattern", "symbol", "lacks"]);

export function identityViolations(data, register, derivedFacts, root = REPO_ROOT) {
  const out = [];
  const add = (code, detail) => out.push(v("FINDINGS", code, detail));
  const risks = new Map(register.risks.map((r) => [r.riskId, r]));
  const regFindings = new Map(register.findings.map((f) => [f.findingId, f]));
  for (const [id, pin] of Object.entries(AUTHORITATIVE_IDENTITIES)) {
    const f = data.findings.find((x) => x.findingId === id);
    if (!f) {
      add("IDENTITY_MISSING", `${id}: the authoritative finding is not declared`);
      continue;
    }
    if (f.title !== pin.title) add("IDENTITY_TITLE", `${id}: the title is not the authoritative one`);
    if (f.canonicalRiskId !== pin.ownerRiskId) add("IDENTITY_OWNER", `${id}: the delta owner is ${f.canonicalRiskId}, the pinned owner is ${pin.ownerRiskId}`);
    for (const ref of pin.sourceReferences) {
      if (!f.evidence.some((e) => e.path === ref.path && e.anchor === ref.anchor)) add("IDENTITY_SOURCE_REFERENCE", `${id}: the source reference in ${ref.path} is absent`);
    }
    for (const phrase of pin.mechanism) {
      if (!f.summary.includes(phrase)) add("IDENTITY_MECHANISM", `${id}: the mechanism summary lacks "${phrase}"`);
    }
    if (mechanismDigest(f.summary) !== pin.mechanismSha256) add("IDENTITY_MECHANISM_HASH", `${id}: the mechanism sentence is not the authoritative one`);
    // the structured facts: linkage here, truth in checkEvidence
    const known = new Set(pin.facts.map((x) => x.fact));
    const seenFacts = new Set();
    for (const e of f.evidence) {
      if (e.fact === undefined) continue;
      if (!known.has(e.fact)) add("IDENTITY_FACT_UNKNOWN", `${id}: the evidence item names the unpinned fact ${e.fact}`);
      if (seenFacts.has(e.fact)) add("IDENTITY_FACT_REPEATED", `${id}: the fact ${e.fact} is carried twice`);
      seenFacts.add(e.fact);
    }
    for (const fact of pin.facts) {
      const hit = f.evidence.find((e) => e.fact === fact.fact);
      if (!hit) {
        add("IDENTITY_FACT_MISSING", `${id}: no evidence item carries the fact ${fact.fact}`);
        continue;
      }
      const same = hit.path === fact.path && evidenceRuleOf(hit) === fact.rule && OPERAND_KEYS.every((k) => (hit[k] ?? null) === (fact[k] ?? null));
      if (!same) add("IDENTITY_FACT_CHANGED", `${id}: the evidence item for ${fact.fact} is not the pinned one`);
    }
    const rf = regFindings.get(f.registerFindingId);
    if (!rf) {
      add("IDENTITY_REGISTER", `${id}: not in the register`);
      continue;
    }
    if (rf.ownerRiskId !== pin.ownerRiskId) add("IDENTITY_OWNER", `${id}: the register owner is ${rf.ownerRiskId}, the pinned owner is ${pin.ownerRiskId}`);
    for (const phrase of pin.registerSummary) {
      if (!String(rf.summary).includes(phrase)) add("IDENTITY_MECHANISM", `${id}: the register summary lacks "${phrase}"`);
    }
    if (mechanismDigest(rf.summary) !== pin.registerSummarySha256) add("IDENTITY_MECHANISM_HASH", `${id}: the register summary is not the authoritative one`);
    const owner = risks.get(pin.ownerRiskId);
    if (!owner) {
      add("IDENTITY_OWNER", `${id}: the pinned owner risk ${pin.ownerRiskId} does not exist`);
      continue;
    }
    for (const a of pin.affectedAssets) if (!owner.affectedAssets.includes(a)) add("IDENTITY_ASSETS", `${id}: ${pin.ownerRiskId} does not list the asset ${a}`);
    if (owner.verificationMethod !== pin.verificationMethod) add("IDENTITY_VERIFICATION", `${id}: ${pin.ownerRiskId} verifies by ${owner.verificationMethod}`);
    const criteria = owner.acceptanceCriteria.join("\n");
    for (const phrase of pin.acceptance) if (!criteria.includes(phrase)) add("IDENTITY_ACCEPTANCE", `${id}: ${pin.ownerRiskId} lacks the acceptance criterion "${phrase.slice(0, 50)}"`);
    if (pin.policyBranches > 0) {
      const branches = owner.policy?.branches ?? [];
      if (branches.length < pin.policyBranches) add("IDENTITY_POLICY", `${id}: ${pin.ownerRiskId} must carry a policy with ${pin.policyBranches} branches, it carries ${branches.length}`);
      // a remediation never chooses a branch; a DECIDED policy is the owner's, and only with the evidence the register's own gate accepts
      if (owner.policy?.status === "DECIDED") {
        const problems = policyViolations({ risks: [owner] }, root).filter((x) => x.riskId === pin.ownerRiskId && x.why !== "POLICY_REQUIRED_RISK_ABSENT");
        if (problems.length > 0) add("IDENTITY_POLICY", `${id}: ${pin.ownerRiskId} records a decided policy without the owner's evidence (${problems[0].why}); the remediation must not choose one`);
      }
    }
  }
  for (const sep of DOMAIN_SEPARATION) {
    const f = data.findings.find((x) => x.findingId === sep.finding);
    if (!f) continue;
    for (const e of f.evidence) {
      if (e.path.startsWith(sep.forbiddenPrefix)) add("IDENTITY_DOMAIN_MIXED", `${sep.finding}: ${e.path} is outside its domain — ${sep.because}`);
    }
  }
  const rr2 = AUTHORITATIVE_IDENTITIES["RR-002"];
  const gate = derivedFacts?.platformCapabilityGate;
  if (rr2 && gate && (gate.erpRoutes.files !== 27 || gate.erpRoutes.withGate !== 27 || gate.customerRoutes.withGate !== 0)) {
    add("IDENTITY_GATE_FACT", "RR-002: the tree no longer shows 27 of 27 ERP route files with the gate and none in the customer routes");
  }
  if (rr2 && gate) {
    const erp = gate.erpRoutes;
    const cust = gate.customerRoutes;
    const setsHold =
      erp.files > 0 &&
      erp.list?.length === erp.files &&
      erp.withGetCurrentUser === erp.files &&
      erp.withGate === erp.files &&
      cust.files > 0 &&
      cust.list?.length === cust.files &&
      cust.withGetCurrentUser === 0 &&
      cust.withGate === 0 &&
      cust.withEquivalentGate === 0 &&
      Array.isArray(gate.partyIdWriters) &&
      gate.partyIdWriters.includes("src/lib/customers/service.ts");
    if (!setsHold) add("IDENTITY_GATE_SETS", "RR-002: the derived ERP and customer route sets, their getCurrentUser and platform-gate counts or the partyId writer do not show the claimed gap");
  }
  const callers = derivedFacts?.reportCorrectionCallers;
  if (AUTHORITATIVE_IDENTITIES["RR-001"] && callers) {
    if (!(callers.callers?.length >= 1 && callers.withCorrection?.length === 0)) add("IDENTITY_CORRECTION_CALLERS", "RR-001: the derived callers of generateDailyReport are missing, or one of them passes a correction");
  }
  return out;
}

/**
 * What the relock may and may not have done to the historical files. The S0 evidence
 * file must be identical in the integration merge and on disk; the S1 artifacts may
 * differ (they are modified on purpose) but the frozen register hash must be the one
 * the canonical register pins.
 */
export function historicalViolations(rows, edgeCurrentSha, registerPinSha) {
  const out = [];
  for (const h of rows) {
    if (h.role === "S0_EVIDENCE" && !h.preservedByMerge) out.push(v("DERIVED_DRIFT", "HISTORICAL_EVIDENCE_MODIFIED", `${h.path} differs between the security head and the integration merge`));
  }
  const edge = rows.find((h) => h.role === "S0_EVIDENCE");
  if (edge && edgeCurrentSha !== edge.frozenSha256) out.push(v("DERIVED_DRIFT", "HISTORICAL_EVIDENCE_EDITED_AFTER_MERGE", `${edge.path} was edited after the merge`));
  const regRow = rows.find((h) => h.path === "docs/security/s1-risk-register.json");
  if (regRow && registerPinSha !== null && regRow.frozenSha256 !== registerPinSha) {
    out.push(v("DERIVED_DRIFT", "FROZEN_REGISTER_HASH", "the frozen register hash differs from the one the canonical register pins"));
  }
  return out;
}

/* ── evidence: every fact is read from the COMMITTED target, never from the working tree ─────────── */

/**
 * FR-05. An anchor, an absence and every rule below is evaluated against the blob of
 * `sources.integrationMergeSha` (`git show <sha>:<path>`, `git grep <sha>`), so editing a
 * product file in the working tree can neither create nor hide a fact. The working tree is
 * the subject of the review only inside the allowlist (see `worktreeViolations`).
 */
const TEST_PATH = /(^|\/)__tests__\/|\.(test|spec)\./;

const blobMemo = new Map();

/** The text of one path at one commit with LF line endings, or null when the commit has no such path. */
export function blobText(root, sha, path) {
  const key = `${root}\0${sha}\0${path}`;
  if (!blobMemo.has(key)) {
    let text = null;
    try {
      text = lf(git(["show", `${sha}:${path}`], root));
    } catch {
      text = null;
    }
    blobMemo.set(key, text);
  }
  return blobMemo.get(key);
}

/** Non-test files under the prefixes whose text at `sha` matches the PCRE pattern on at least one line. */
export function treeMatches(root, sha, prefixes, pattern) {
  let out = "";
  try {
    out = git(["grep", "-l", "-P", "-I", "-e", pattern, sha, "--", ...prefixes], root);
  } catch (e) {
    if (e && e.status === 1) return [];
    throw e;
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(sha.length + 1))
    .filter((p) => !TEST_PATH.test(p))
    .sort(byStr);
}

function closingIndex(text, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The text between the braces of `function <name>(…) {…}`, or null. */
export function functionBody(text, name) {
  const m = new RegExp(`(?:^|\\n)[ \\t]*(?:export[ \\t]+)?(?:async[ \\t]+)?function[ \\t]+${name}\\b`).exec(text);
  if (!m) return null;
  const params = text.indexOf("(", m.index + m[0].length);
  if (params === -1) return null;
  const paramsEnd = closingIndex(text, params, "(", ")");
  if (paramsEnd === -1) return null;
  const open = text.indexOf("{", paramsEnd);
  if (open === -1) return null;
  const end = closingIndex(text, open, "{", "}");
  return end === -1 ? null : text.slice(open + 1, end);
}

/** The text between the braces of a declaration such as `model Party {…}`, or null. */
export function blockBody(text, header) {
  const idx = text.indexOf(`${header} {`);
  if (idx === -1) return null;
  const open = text.indexOf("{", idx);
  const end = closingIndex(text, open, "{", "}");
  return end === -1 ? null : text.slice(open + 1, end);
}

const compile = (pattern) => {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
};

export const evidenceRuleOf = (e) => e.rule ?? (typeof e.anchor === "string" ? "PRESENT" : typeof e.absent === "string" ? "ABSENT" : null);

/** One evidence item against the committed tree. Returns null when the fact holds, else { code, detail }. */
export function evaluateEvidence(e, ctx) {
  const rule = evidenceRuleOf(e);
  if (rule === null) return { code: "EVIDENCE_NEEDS_ANCHOR_OR_ABSENT", detail: e.path };
  if (!EVIDENCE_RULES.includes(rule)) return { code: "EVIDENCE_RULE", detail: `${e.path}: unknown rule ${rule}` };
  const { root, sha } = ctx;
  if (rule === "TREE_ABSENT_REGEX") {
    if (typeof e.pattern !== "string" || !compile(e.pattern)) return { code: "EVIDENCE_PATTERN", detail: `${e.path}: a tree rule needs a valid pattern` };
    const listed = git(["ls-tree", "-r", "--name-only", sha, "--", e.path], root).split("\n").filter((p) => p && !TEST_PATH.test(p));
    if (listed.length === 0) return { code: "EVIDENCE_PATH", detail: `${e.path}: no non-test file under this prefix at the target` };
    const hit = treeMatches(root, sha, [e.path], e.pattern);
    return hit.length ? { code: "EVIDENCE_TREE", detail: `${e.path}: ${hit.length} file(s) match /${e.pattern}/, first ${hit[0]}` } : null;
  }
  if (rule === "CALLERS_LACK") {
    if (typeof e.pattern !== "string" || typeof e.lacks !== "string" || !compile(e.pattern) || !compile(e.lacks)) {
      return { code: "EVIDENCE_PATTERN", detail: `${e.path}: a callers rule needs a callee pattern and a lacks pattern` };
    }
    if (blobText(root, sha, e.path) === null) return { code: "EVIDENCE_PATH", detail: `${e.path} is not in the target tree` };
    const callers = treeMatches(root, sha, ["src", "scripts"], e.pattern).filter((p) => p !== e.path);
    if (callers.length === 0) return { code: "EVIDENCE_CALLERS", detail: `${e.path}: no product caller of /${e.pattern}/ was found, so the claim cannot be read` };
    const bad = callers.filter((p) => compile(e.lacks).test(blobText(root, sha, p) ?? ""));
    return bad.length ? { code: "EVIDENCE_CALLERS", detail: `${e.path}: caller(s) ${bad.join(", ")} match /${e.lacks}/` } : null;
  }
  const text = blobText(root, sha, e.path);
  if (text === null) return { code: "EVIDENCE_PATH", detail: `${e.path} is not in the target tree` };
  switch (rule) {
    case "PRESENT":
      return typeof e.anchor === "string" && e.anchor.length >= 8 && text.includes(e.anchor) ? null : { code: "EVIDENCE_ANCHOR", detail: `anchor not found in ${e.path}: ${String(e.anchor).slice(0, 60)}` };
    case "ABSENT":
      return typeof e.absent === "string" && e.absent.length >= 4 && !text.includes(e.absent) ? null : { code: "EVIDENCE_ABSENCE", detail: `${e.path} contains "${e.absent}"` };
    case "REGEX": {
      const re = typeof e.pattern === "string" ? compile(e.pattern) : null;
      return re && re.test(text) ? null : { code: "EVIDENCE_PATTERN", detail: `/${e.pattern}/ does not match in ${e.path}` };
    }
    case "ABSENT_REGEX": {
      const re = typeof e.pattern === "string" ? compile(e.pattern) : null;
      return re && !re.test(text) ? null : { code: "EVIDENCE_ABSENT_PATTERN", detail: `/${e.pattern}/ matches in ${e.path}` };
    }
    case "FN_BODY_REGEX": {
      const body = typeof e.symbol === "string" ? functionBody(text, e.symbol) : null;
      const re = typeof e.pattern === "string" ? compile(e.pattern) : null;
      if (body === null) return { code: "EVIDENCE_SYMBOL", detail: `${e.path}: function ${e.symbol} was not found` };
      return re && re.test(body) ? null : { code: "EVIDENCE_PATTERN", detail: `/${e.pattern}/ does not match in function ${e.symbol} of ${e.path}` };
    }
    case "BLOCK_REGEX": {
      const body = typeof e.symbol === "string" ? blockBody(text, e.symbol) : null;
      const re = typeof e.pattern === "string" ? compile(e.pattern) : null;
      if (body === null) return { code: "EVIDENCE_SYMBOL", detail: `${e.path}: declaration ${e.symbol} was not found` };
      return re && re.test(body) ? null : { code: "EVIDENCE_PATTERN", detail: `/${e.pattern}/ does not match in ${e.symbol} of ${e.path}` };
    }
    default:
      return { code: "EVIDENCE_RULE", detail: `${e.path}: unhandled rule ${rule}` };
  }
}

function checkEvidence(list, where, ctx, deltaPaths, add) {
  for (const e of list) {
    const inDelta = evidenceRuleOf(e) === "TREE_ABSENT_REGEX" ? [...deltaPaths].some((p) => p.startsWith(e.path)) : deltaPaths.has(e.path);
    if (e.scope === "DELTA" && !inDelta) add("PATH_OUTSIDE_DELTA", "PATH_OUTSIDE_DELTA", `${where}: ${e.path} is cited as DELTA evidence but the delta did not change it`);
    const bad = evaluateEvidence(e, ctx);
    if (bad) add("FINDINGS", bad.code, `${where}: ${bad.detail}`);
  }
}

/* ── the working tree and HEAD must still be the source lock ──────────────────────────────────── */

/** Where an uncommitted change is the subject of the review. Everything else must be byte-for-byte the committed tree. */
export const WORKTREE_ALLOWLIST = Object.freeze([".gitattributes", "docs/security/", "scripts/security/s0/", "scripts/security/s1/"]);
export const isAllowlistedPath = (p) => p === ".gitattributes" || WORKTREE_ALLOWLIST.slice(1).some((d) => p.startsWith(d));

/** `git status --porcelain=v1 -z --untracked-files=all` without rename pairing. */
export function worktreeStatus(root) {
  return git(["-c", "status.renames=false", "status", "--porcelain=v1", "-z", "--untracked-files=all"], root);
}

export function worktreeViolations(porcelainZ) {
  const out = [];
  for (const entry of porcelainZ.split("\0").filter(Boolean)) {
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (isAllowlistedPath(path)) continue;
    out.push(v("SOURCES", status === "??" ? "WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST" : "WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST", path));
  }
  return out;
}

/**
 * POSTREV-F4. `git update-index --assume-unchanged` and `--skip-worktree` make `git status` and `git diff`
 * blind to an edit. `git ls-files -v -z` prints one tag character per entry: a LOWERCASE letter marks
 * assume-unchanged, `S` marks skip-worktree. Any such entry, modified or not, on any tracked path, fails
 * the source lock. The tags are single ASCII letters and the paths are NUL-separated, so the parse does not
 * depend on the locale or on path quoting.
 */
export function indexFlags(root) {
  return git(["ls-files", "-v", "-z"], root);
}

export function indexFlagViolations(lsFilesVZ) {
  const out = [];
  for (const entry of lsFilesVZ.split("\0").filter(Boolean)) {
    const tag = entry[0];
    const path = entry.slice(2);
    if (tag === "S") out.push(v("SOURCES", "INDEX_SKIP_WORKTREE", path));
    else if (tag >= "a" && tag <= "z") out.push(v("SOURCES", "INDEX_ASSUME_UNCHANGED", path));
  }
  return out;
}

/**
 * The commit a first-layer document is measured against at HEAD. A first-layer document is sealed at its own
 * integration merge, but HEAD is allowed to carry the later integration merge of the second layer: the second-layer
 * document names it, and it must be a proper descendant of the first-layer merge. The second layer itself is never
 * given such a base: it is held to its OWN merge, so the base cannot be moved by editing the first-layer document.
 */
export function successorBase(paths, sources, secondDocument = join(paths.root, "docs", "security", LAYERS.SECOND.data)) {
  const p = secondDocument;
  if (!existsSync(p)) return sources.integrationMergeSha;
  try {
    const next = JSON.parse(readFileSync(p, "utf8"))?.sources;
    const sha = next?.integrationMergeSha;
    if (hasCommit(sha, paths.root) && sha !== sources.integrationMergeSha && gitOk(["merge-base", "--is-ancestor", sources.integrationMergeSha, sha], paths.root)) return sha;
  } catch {
    // an unreadable second-layer document leaves the first layer held to its own merge
  }
  return sources.integrationMergeSha;
}

/**
 * WHERE HEAD MAY BE. The identity of a layer is its integration merge, a fixed commit named by the document. HEAD is
 * NOT that identity: the artifacts are committed on top of the merge, and the moment they are, HEAD is a child of it.
 * So HEAD must be the integration merge OR a descendant of it such that
 *
 *   - the merge is an ancestor of HEAD (an unrelated commit, a rewritten history and a history that lost the merge
 *     all fail the ancestry test);
 *   - no commit after the merge is itself a merge (a merge after the integration pulls in history nobody reviewed);
 *   - EVERY commit after the merge changed only allowlisted paths, one by one, so a product change that a later
 *     commit reverted still fails: the history is the subject, not only the net result;
 *   - the net difference between the merge and HEAD is inside the allowlist too.
 *
 * `head` is a parameter so that the answer can be asked about a position without moving the repository to it.
 * A test that asks about the real HEAD answers differently before and after a commit; a test that names the position
 * answers the same everywhere, and that is what the mutation campaign relies on.
 */
export function headViolations(sources, root, base = sources.integrationMergeSha, head = git(["rev-parse", "HEAD"], root).trim()) {
  if (head === base) return [];
  if (!gitOk(["merge-base", "--is-ancestor", base, head], root)) {
    return [v("SOURCES", "HEAD_NOT_DESCENDANT_OF_BASE", "HEAD does not descend from the commit it is measured against")];
  }
  const out = [];
  const history = git(["rev-list", "--parents", `${base}..${head}`], root).split("\n").filter(Boolean);
  const merges = history.filter((l) => l.split(" ").length > 2);
  if (merges.length) out.push(v("SOURCES", "HEAD_MERGE_AFTER_INTEGRATION", `${merges.length} merge commit(s) lie between the integration merge and HEAD`));
  const offending = [];
  for (const line of history) {
    const [commit, ...parents] = line.split(" ");
    if (parents.length !== 1) continue;
    const outsideOne = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames", commit], root)
      .split("\n")
      .filter((p) => p && !isAllowlistedPath(p));
    if (outsideOne.length) offending.push(`${commit.slice(0, 8)}:${outsideOne[0]}`);
  }
  if (offending.length) out.push(v("SOURCES", "HEAD_COMMIT_OUTSIDE_ALLOWLIST", `${offending.length} commit(s) after the integration merge changed a path outside the allowlist, first ${offending[0]}`));
  const outside = git(["diff", "--name-only", "--no-renames", base, head], root)
    .split("\n")
    .filter((p) => p && !isAllowlistedPath(p));
  if (outside.length) out.push(v("SOURCES", "HEAD_MOVED_OUTSIDE_ALLOWLIST", `${outside.length} path(s) changed since the integration merge outside the allowlist, first ${outside[0]}`));
  return out;
}

/** The record's own consistency. Whether it belongs to the current files is checked by the campaign tool. */
export function recordViolations(record) {
  const out = [];
  const bad = (code, detail) => out.push({ code, detail });
  if (!record) return [{ code: "RECORD_MISSING", detail: "the mutation campaign record is missing" }];
  const t = record.totals ?? {};
  const ms = record.mutants ?? [];
  const cs = record.controls ?? [];
  if (t.mutants !== ms.length) bad("RECORD_COUNT", "totals.mutants differs from the list");
  const count = (st) => ms.filter((m) => m.status === st).length;
  if (t.targetedKill !== count("TARGETED_KILL")) bad("RECORD_COUNT", "totals.targetedKill differs from the list");
  if (t.incidental !== count("ONLY_INCIDENTAL") || t.survived !== count("SURVIVED") || t.invalid !== count("INVALID_MUTANT")) bad("RECORD_COUNT", "a status total differs from the list");
  if (t.placebosGreen !== ms.filter((m) => m.placebo === "GREEN").length) bad("RECORD_COUNT", "totals.placebosGreen differs from the list");
  if (t.controls !== cs.length || t.controlsAsExpected !== cs.filter((c) => c.observed === c.expected).length) bad("RECORD_COUNT", "the control totals differ from the list");
  const deviations = ms.filter((m) => m.status !== "TARGETED_KILL" || m.placebo !== "GREEN").length + cs.filter((c) => c.observed !== c.expected).length;
  if (t.deviations !== deviations) bad("RECORD_COUNT", "totals.deviations differs from the list");
  if (ms.length === 0) bad("RECORD_EMPTY", "no mutant is recorded");
  if (t.targetedKill !== t.mutants) bad("RECORD_NOT_ALL_KILLED", "every mutant must be a targeted kill");
  if (t.incidental !== 0 || t.survived !== 0 || t.invalid !== 0 || t.deviations !== 0) bad("RECORD_NOT_CLEAN", "incidental, survivor, invalid and deviation counts must be zero");
  if (t.placebosGreen !== t.mutants) bad("RECORD_PLACEBO", "every placebo must be green");
  if (record.cleanup !== "REMOVED") bad("RECORD_CLEANUP", "cleanup must be REMOVED");
  const ids = new Set();
  for (const m of ms) {
    if (ids.has(m.id)) bad("RECORD_DUPLICATE", m.id);
    ids.add(m.id);
  }
  return out;
}

export function counters(data) {
  const sev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
  for (const p of data.canonicalProjection) if (p.severity in sev) sev[p.severity] += 1;
  return {
    deltaFindings: data.findings.length,
    projectedSeverityByFinding: sev,
    positiveControls: data.positiveControls.length,
    delta: {
      commits: data.delta.commits.total,
      nonMergeCommits: data.delta.commits.nonMerge,
      paths: data.delta.paths.total,
      strictProductPaths: data.delta.strictProductPaths.total,
      broadRuntimeAffectingPaths: data.delta.broadRuntimeAffectingPaths.total,
    },
    getPrisma: {
      before: data.getPrisma.before,
      after: data.getPrisma.after,
      added: data.getPrisma.added.length,
      manualAdjudications: data.getPrisma.decisions.manualAdjudications,
      ruleBased: data.getPrisma.decisions.ruleBased,
      removed: data.getPrisma.removed.length,
      moved: data.getPrisma.moved.length,
      newFiles: data.getPrisma.newFiles.length,
      unresolved: data.getPrisma.unresolved,
    },
  };
}

/* ── command line ──────────────────────────────────────────────────────────── */

/**
 * THE COMMAND-LINE CONTRACT, one parser for every mode (generate, check, summary).
 *
 *   relock-delta-check.mjs [mode] [--layer=1|2] [--root=DIR] [--data=FILE] [--report=FILE] [--register=FILE]
 *                          [--inventory=FILE] [--adjudications=FILE] [--residual=FILE] [--record=FILE]
 *
 *   - no mode means `check`; no `--layer` means layer 1, deliberately: the first layer is the original
 *     document and the default of every command that existed before the second layer;
 *   - an option is exactly `--name=value`, with a lowercase name and a non-empty value, and may be given once;
 *   - `--layer` takes exactly `1` or `2`: not `02`, not ` 2`, not `two`, not empty, not `--layer 2`;
 *   - an unknown option, a stray argument, a repeated option or a malformed token is a usage error (exit 2).
 *
 * An invalid value is NEVER read as a layer: it stops the command before any file is read or written.
 */
export const LAYER_VALUES = Object.freeze(["1", "2"]);
export const OPTION_NAMES = Object.freeze(["layer", "root", "data", "report", "register", "inventory", "adjudications", "residual", "record"]);

export function parseArgs(argv) {
  const opts = {};
  const rest = [];
  const errors = [];
  for (const a of argv) {
    if (typeof a !== "string") {
      errors.push("an argument is not a string");
      continue;
    }
    if (!a.startsWith("-")) {
      rest.push(a);
      continue;
    }
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (!m) {
      errors.push(`malformed option "${a.slice(0, 40)}" — an option is written --name=value`);
      continue;
    }
    const [, name, value] = m;
    if (!OPTION_NAMES.includes(name)) errors.push(`unknown option --${name}`);
    else if (Object.prototype.hasOwnProperty.call(opts, name)) errors.push(`option --${name} is given more than once`);
    else if (value === "") errors.push(`option --${name} has an empty value`);
    else if (name === "layer" && !LAYER_VALUES.includes(value)) errors.push(`--layer must be 1 or 2, got "${value.slice(0, 20)}"`);
    else opts[name] = value;
  }
  if (rest.length > 1) errors.push(`unexpected argument "${rest[1].slice(0, 40)}" — only one mode is accepted`);
  return { opts, rest, errors };
}

export function pathsFromOptions(opts) {
  const root = opts.root ? resolve(opts.root) : REPO_ROOT;
  const p = defaultPaths(root, opts.layer === "2" ? "SECOND" : "FIRST");
  for (const k of ["data", "report", "register", "inventory", "adjudications", "residual", "record"]) if (opts[k]) p[k] = resolve(opts[k]);
  return p;
}

export function exitCodeFor(violations) {
  if (violations.length === 0) return EXIT.OK;
  const first = [...violations].sort((a, b) => CLASS_ORDER.indexOf(a.klass) - CLASS_ORDER.indexOf(b.klass))[0];
  return EXIT[first.klass];
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function loadJson(path, label, fail) {
  if (!existsSync(path)) return fail(EXIT.MISSING_FILE, `${label} is missing`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fail(EXIT.MALFORMED_JSON, `${label} is not readable JSON`);
  }
}

export function main(argv = process.argv.slice(2)) {
  const { opts, rest, errors } = parseArgs(argv);
  const mode = rest[0] ?? "check";
  const stop = (code, message) => {
    process.stderr.write(`[s1-relock] ${message}\n`);
    process.exit(code);
  };
  if (errors.length > 0) return stop(EXIT.USAGE, `usage: ${errors[0]}`);
  if (!["generate", "check", "summary"].includes(mode)) return stop(EXIT.USAGE, `unknown mode "${mode}" — use generate | check | summary`);
  const paths = pathsFromOptions(opts);
  if (!gitOk(["rev-parse", "--git-dir"], paths.root)) return stop(EXIT.MISSING_FILE, "git is required");

  const data = loadJson(paths.data, "the delta document", stop);
  const record = existsSync(paths.record) ? loadJson(paths.record, "the mutation record", stop) : null;
  for (const [file, label] of [[paths.register, "the canonical register"], [paths.inventory, "the S0 inventory"], [paths.adjudications, "the adjudications file"], [paths.residual, "the residual screenings"]]) {
    loadJson(file, label, stop);
  }

  if (mode === "generate") {
    const canonical = canonicalize(data, paths);
    writeFileSync(paths.data, serialize(canonical));
    if (existsSync(paths.report)) {
      const md = readText(paths.report);
      writeFileSync(paths.report, fillBlocks(md, renderBlocks(canonical, record), blockNamesOf(layerOf(canonical))));
    }
    process.stdout.write(`[s1-relock] wrote the delta document and its report blocks (${data.findings.length} delta findings)\n`);
    return;
  }

  if (mode === "summary") {
    process.stdout.write(`${JSON.stringify(counters(data), null, 2)}\n`);
    return;
  }

  const md = existsSync(paths.report) ? readText(paths.report) : null;
  const violations = checkRelock(data, md, paths, record);
  if (violations.length === 0) {
    const text = serialize(canonicalize(data, paths));
    if (text !== readFileSync(paths.data, "utf8")) violations.push(v("NOT_CANONICAL", "NOT_CANONICAL", "the file is not in canonical form — run generate and review the diff"));
  }
  if (violations.length > 0) {
    process.stderr.write(`[s1-relock] ${violations.length} violation(s)\n`);
    for (const x of violations) process.stderr.write(`  ${x.klass}/${x.code}: ${x.detail}\n`);
    process.exit(exitCodeFor(violations));
  }
  const c = counters(data);
  process.stdout.write(
    `[s1-relock] relock provenance consistent — ${c.deltaFindings} delta findings, ${c.positiveControls} positive controls, ` +
      `${c.getPrisma.added} call sites added (${c.getPrisma.manualAdjudications} manual, ${c.getPrisma.ruleBased} rule-based), ${c.getPrisma.unresolved} unresolved\n`,
  );
}

if (isMain()) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`[s1-relock] internal error: ${e && e.name ? e.name : "Error"}\n`);
    process.exit(EXIT.INTERNAL_ERROR);
  }
}

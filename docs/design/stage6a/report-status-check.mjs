/**
 * Phase 107 FINAL R2 — one live source of phase-level truth, checked ACROSS
 * every report the package ships.
 *
 * The previous checker examined contradictions INSIDE one legacy document. That
 * is not where the contradiction was. The submitted package carried two reports:
 * `PHASE-107-FINAL-REPORT.md` claiming visual closure and 439 collected test
 * files, and `STAGE-6A-REPORT.md` opening with a block headed "STATUS — the only
 * place it is stated" that said `VISUAL_AUDIT_COMPLETE=NO`, `PHASE107_COMPLETE=NO`
 * and `437 files collected`. Both were shipped as current. A reviewer opening the
 * wrong one first is told the opposite thing.
 *
 * The model this enforces:
 *
 *   - exactly ONE document may carry live phase-level status — the canonical
 *     report, named on the command line;
 *   - every other packaged report is a substage record and must say so, in its
 *     first lines, before it is allowed to mention a phase-level key at all;
 *   - where two documents do state the same key, they must agree.
 *
 * A document is treated as a substage record only if its opening explicitly
 * marks itself superseded. Being named "Stage 6-A" earns no exemption — the
 * defect was precisely that an old name was assumed to imply an old status.
 *
 * Usage:
 *   node docs/design/stage6a/report-status-check.mjs <canonical.md> [other.md ...]
 */
import fs from "node:fs";
import path from "node:path";

import crypto from "node:crypto";

const rawArgs = process.argv.slice(2);
const epochAt = rawArgs.indexOf("--epoch");
const EXPECTED_EPOCH = epochAt >= 0 ? rawArgs[epochAt + 1] : null;
const files = rawArgs.filter((a, i) => a !== "--epoch" && i !== epochAt + 1);
const [CANONICAL, ...OTHERS] = files;
if (!CANONICAL) {
  console.error("usage: report-status-check.mjs [--epoch <uuid>] <canonical.md> [other.md ...]");
  process.exit(2);
}

/*
 * TWO TIERS, because two different mistakes are possible.
 *
 * PHASE_STATUS_KEYS answer "where does Phase 107 stand?". Exactly one document
 * may state them. A substage record that says `VISUAL_AUDIT_COMPLETE=NO` while
 * the canonical report says YES is the contradiction that shipped, and no
 * amount of surrounding prose makes it safe.
 *
 * SHARED_MEASUREMENT_KEYS are findings a substage legitimately reports —
 * `SELECTORS_REQUIRING_FIX`, `DETECTOR_SELFCHECK`. They may appear anywhere,
 * but where the canonical report also states them they must AGREE. A stale
 * `437 files collected` beside a canonical 439 is a conflict even though the
 * key itself is not a verdict about the phase.
 */
const PHASE_STATUS_KEYS = [
  "VISUAL_AUDIT_COMPLETE", "PHASE107_COMPLETE", "PHASE107_FINAL_REVIEW_PACKAGE_READY",
  "STAGE107_CHECKPOINT_CANDIDATE", "STAGE107_CHECKPOINT_READY",
];
const SHARED_MEASUREMENT_KEYS = [
  "TEST_DISCOVERY_PARITY", "OUTSTANDING_OVERFLOW_DEBT", "OUTSTANDING_HIDDEN_FOCUSABLE_DEBT",
  "CLASSIFICATION_DIFFERENCES", "EVIDENCE_INTEGRITY_FAILURES", "MUTATIONS_CAUGHT",
  "DETECTOR_SELFCHECK", "SELECTORS_REQUIRING_FIX", "REFUSAL_FORWARDING_EXCEPTIONS",
  "FINAL_TREE_EVIDENCE_CELLS", "COLLECTED_TEST_FILES",
];
const PHASE_KEYS = [...PHASE_STATUS_KEYS, ...SHARED_MEASUREMENT_KEYS];

/** `KEY=value` occurrences, with the line they sit on. */
function assignments(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/\b([A-Z][A-Z0-9_]{3,})\s*=\s*([^\s|,)`]+)/g)) {
      out.push({ key: m[1], value: m[2].replace(/[`",.)]+$/, ""), line: i + 1, text: line.trim() });
    }
  });
  return out;
}

/** A record that declares itself superseded in its opening lines. */
function declaresSuperseded(text) {
  const head = text.split(/\r?\n/).slice(0, 25).join("\n");
  return /SUPERSEDED|SUBSTAGE RECORD|HISTORICAL/i.test(head);
}

const canonicalText = fs.readFileSync(CANONICAL, "utf8");
const canonicalAssignments = assignments(canonicalText);
const canonicalValues = new Map();
for (const a of canonicalAssignments) if (!canonicalValues.has(a.key)) canonicalValues.set(a.key, a.value);

const conflicts = [];
let liveDocuments = 1;   // the canonical one

console.log(`canonical: ${path.basename(CANONICAL)}`);
console.log(`  phase-level keys stated: ${PHASE_KEYS.filter((k) => canonicalValues.has(k)).length}`);

for (const other of OTHERS) {
  const text = fs.readFileSync(other, "utf8");
  const superseded = declaresSuperseded(text);
  const name = path.basename(other);

  // The appendix is where a document quotes its own retired answers.
  const lines = text.split(/\r?\n/);
  const appendixAt = lines.findIndex((l) => /^#+\s*Appendix: HISTORICAL_SUPERSEDED/.test(l));
  const bodyEnd = appendixAt === -1 ? lines.length : appendixAt;

  const live = assignments(lines.slice(0, bodyEnd).join("\n"))
    .filter((a) => PHASE_KEYS.includes(a.key))
    // A paragraph that marks itself superseded is quoting, not asserting.
    .filter((a) => !/SUPERSEDED/i.test(a.text));

  if (!superseded && live.length > 0) {
    liveDocuments++;
    conflicts.push({ file: name, kind: "second live status document", detail: `${live.length} phase-level assignment(s) and no superseded marker` });
  }

  for (const a of live) {
    if (PHASE_STATUS_KEYS.includes(a.key)) {
      // A phase verdict belongs to the canonical document alone.
      conflicts.push({
        file: name, kind: "phase-status key outside the canonical report",
        detail: `${a.key}=${a.value} (line ${a.line})`,
      });
      continue;
    }
    const canon = canonicalValues.get(a.key);
    if (canon !== undefined && canon !== a.value) {
      conflicts.push({
        file: name, kind: "disagrees with the canonical report",
        detail: `${a.key}=${a.value} vs canonical ${canon} (line ${a.line})`,
      });
    }
  }

  console.log(`  ${name}: ${superseded ? "superseded record" : "LIVE"}  phase-level assignments in body: ${live.length}`);
}

for (const c of conflicts) console.log(`   CONFLICT  ${c.file}: ${c.kind} — ${c.detail}`);

/*
 * PHASE 107 FINAL R4 - BIND THIS CHECK TO BYTES AND TO AN EPOCH.
 *
 * "Conflicts: 0" is only meaningful if you know WHICH report was checked and
 * WHEN. Without that, a status log from an earlier report is indistinguishable
 * from one describing the report actually being packaged - which is precisely
 * how a stale document survived three rounds. The SHA below is of the exact
 * bytes read; the packaging step recomputes it and refuses to package a
 * different file.
 */
const canonicalSha = crypto.createHash("sha256").update(fs.readFileSync(CANONICAL)).digest("hex");
const statedEpoch = (canonicalText.match(/^VALIDATION_EPOCH=(\S+)$/m) || [])[1] || null;
const epochMatch = EXPECTED_EPOCH ? statedEpoch === EXPECTED_EPOCH : Boolean(statedEpoch);

console.log("");
if (statedEpoch) console.log(`# VALIDATION_EPOCH=${statedEpoch}`);
console.log(`CANONICAL_REPORT=${path.basename(CANONICAL)}`);
console.log(`CANONICAL_REPORT_SHA256=${canonicalSha}`);
console.log(`REPORT_STATUS_EPOCH=${statedEpoch ?? "ABSENT"}`);
console.log(`REPORT_STATUS_EPOCH_MATCH=${epochMatch ? "YES" : "NO"}`);
console.log(`CANONICAL_PHASE_STATUS_DOCUMENTS=${liveDocuments}`);
console.log(`REPORT_STATUS_CONFLICTS=${conflicts.length}`);
process.exit(conflicts.length === 0 && liveDocuments === 1 && epochMatch ? 0 : 1);

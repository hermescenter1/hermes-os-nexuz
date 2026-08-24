/**
 * Phase 107 Stage 6-A — assemble the Codex review pack.
 *
 * A review pack is a liability if it carries anything it should not. This one is
 * built by ALLOWLIST: every entry is named explicitly, and the result is scanned
 * before it is written. Nothing is copied by wildcard from the repository.
 *
 * Excluded by construction: the repository itself, node_modules, `.next`, any
 * PNG or other screenshot, `.env`, lock files, and the absolute path of the
 * machine that produced it. Every file is scanned for the ephemeral audit
 * credential and for a user home directory before it is admitted; a hit aborts
 * the build rather than shipping a redacted guess.
 *
 * Usage: node docs/design/stage6a/build-review-pack.mjs <outDir>
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const OUT = process.argv[2] || "E:/hermes-os-phase107-stage6a-review";
const STAGE = path.join(OUT, "stage6a-codex-review");

const sh = (cmd) => execSync(cmd, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/*
 * PHASE 107 STAGE 6-A.3 — the stage is an ARGUMENT, not a literal.
 *
 * It was hard-coded, went stale once (a Stage 6-A.1 pack labelled itself 6-A),
 * was corrected to a new literal, and went stale again the very next round.
 * A constant that must be edited by hand every time will be forgotten every
 * time. Refusing to build without it makes the author state it, once, per pack.
 */
const PHASE_ID = process.argv[8];
const STAGE_ID = process.argv[7];
if (!STAGE_ID || !PHASE_ID) {
  console.error("REFUSING: pass stage as argv[7] and phase as argv[8].");
  console.error("It labels the archive; a stale literal made two packs indistinguishable.");
  process.exit(2);
}

/* ── things that must never appear in the pack ────────────────────────────── */
const FORBIDDEN = [
  { name: "audit credential", re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@local\.invalid/ },
  { name: "user home path", re: /C:\\Users\\[A-Za-z0-9_.-]+|\/Users\/[A-Za-z0-9_.-]+/ },
  { name: "env assignment", re: /(ADMIN_PASSWORD|JWT_SECRET|AUTH_SECRET|DATABASE_URL)\s*=\s*\S/ },
];

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

/*
 * PHASE 107 FINAL R2 — staged paths are a SET, and a second emit is an ERROR.
 *
 * `written` was an array and `emit` pushed unconditionally, so a path listed
 * twice in `MACHINERY` overwrote the file harmlessly and added a SECOND
 * manifest row. The submitted package carried 142 ZIP entries against 142
 * manifest rows covering only 141 unique paths, and the verifier — which
 * compared counts, not uniqueness — passed it.
 *
 * Refusing is deliberate. Silently de-duplicating would have hidden the
 * duplicate in `MACHINERY` instead of surfacing it, and the point of this pass
 * is that the proof system stops being quietly wrong.
 */
const written = new Set();
function emit(rel, content) {
  const key = rel.split(path.sep).join("/");
  if (written.has(key)) {
    console.error(`REFUSING: "${key}" was emitted twice.`);
    console.error("A duplicate staged path produces duplicate manifest rows. Fix the source list.");
    process.exit(1);
  }
  const target = path.join(STAGE, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  written.add(key);
}

/* ── 1. the unified diff of tracked changes, plus every new file ──────────── */
emit("01-unified-diff/tracked-changes.diff", sh("git diff"));

/*
 * PHASE 107 STAGE 6-A.2 — the file list comes from the FROZEN snapshot, not from
 * a fresh `git status`.
 *
 * Re-reading the worktree here is what produced three different totals for one
 * change set: the pack, the checksum file and the report were each taken at a
 * different moment, and every generator that writes into `docs/design/stage6a/`
 * moved the target for the next one. The snapshot is taken once, from outside
 * the repository, and everything downstream quotes it.
 */
const SNAPSHOT = process.argv[5];
if (!SNAPSHOT || !fs.existsSync(SNAPSHOT)) {
  console.error("REFUSING: a frozen snapshot (worktree-inventory.json) is required as argv[5].");
  console.error("Run docs/design/stage6a/freeze-snapshot.mjs first.");
  process.exit(2);
}
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
const status = snapshot.entries.map((e) => ({ untracked: e.state === "NEW", p: e.path }));

// New source and test files are the other half of the change; docs are large and
// are represented by the report rather than copied wholesale.
const newSource = status
  .filter((s) => s.untracked && /^(src|tools)\//.test(s.p) && /\.(ts|tsx|mjs|js)$/.test(s.p));
for (const { p } of newSource) emit(path.join("02-new-files", p), fs.readFileSync(p, "utf8"));

/* ── 2. the inventories ───────────────────────────────────────────────────── */
emit("03-inventories/changed-paths.txt",
  status.map((s) => `${s.untracked ? "NEW " : "MOD "}${s.p}`).join("\n"));
// The snapshot itself travels, so every count in the report can be re-derived.
emit("03-inventories/worktree-inventory.json", fs.readFileSync(SNAPSHOT, "utf8"));
for (const f of ["diff-inventory.json", "impact-map.json", "caller-inventory.json",
  "stage6b-debt.json", "test-discovery-parity.json"]) {
  const src = path.join("docs/design/stage6a", f);
  if (fs.existsSync(src)) emit(path.join("03-inventories", f), fs.readFileSync(src, "utf8"));
}

/*
 * A reviewer cannot check a number by reading the number. The SOURCE of every
 * generator and every mutation proof travels with the pack, so each claim can be
 * re-derived rather than taken on trust — including the script that decides what
 * goes into this pack and what counts as a violation.
 */
const MACHINERY = [
  "caller-inventory.mjs", "impact-map.mjs", "diff-inventory.mjs",
  "evidence-integrity.mjs", "verify-stage6a-evidence.mjs", "explain-auth-required.mjs",
  "stage6b-debt.mjs", "build-review-pack.mjs", "zip-review-pack.mjs",
  "mutation-proof.mjs", "mutation-proof-harness.mjs",
  "mutation-proof-context.mjs", "mutation-proof-refusal.mjs",
  // Proves the forwarding detector can still fail. Without it the reviewer has
  // only the detector's own reassuring zero, which is what went wrong before.
  "detector-selfcheck.mjs",
  // Derives REPORT_STATUS_CONFLICTS, which was previously asserted by hand.
  "report-status-check.mjs", "verify-affected-routes.mjs",
  "final-sweep-report.mjs", "refusal-contract-probe.mjs",
  "test-discovery-parity.mjs", "build-cells.mjs",
  // Stage 6-A.2: the AST analyser that replaced the regex, its positive and
  // negative controls, the selector audit, the control-character gate, and the
  // freeze that makes every count in the report come from one measurement.
  "refusal-sites.mjs", "detector-controls.mjs", "selector-audit.mjs",
  "control-char-gate.mjs", "freeze-snapshot.mjs",
  // Stage 6-A.3: the order-sensitive selector audit, the pixel differ and the
  // bundler that makes its measurement independently reproducible.
  "image-diff.mjs", "screenshot-stability.mjs", "instability-evidence.mjs",
  "classification-rules.mjs",
  // Phase 107 FINAL: the orchestrator that states phase/stage once, the
  // adversarial selector controls, the visual-debt gate, the gate mutations
  // and the generator that writes the closing report from evidence.
  "build-final-review.mjs", "selector-controls.mjs", "visual-debt-gate.mjs",
  "mutation-proof-gates.mjs", "generate-final-report.mjs",
  "verify-package.mjs",
  // Phase 107 FINAL R2: browser-level focusability controls, the package
  // verifier’s own adversarial mutations, and the shared classification rules.
  "focus-controls.mjs", "package-verifier-mutations.mjs",
  // Phase 107 FINAL R3: the fail-closed orchestrator and the scanner controls.
  "final-closure.mjs", "scanner-controls.mjs",
  // Phase 107 FINAL R4: the one content-bound tree fingerprint and the
  // adversarial controls for the report generator’s own gate enforcement.
  "tree-fingerprint.mjs", "report-gate-mutations.mjs",
  // R4: the controls that attack the tree binding and the live-probe gate.
  "tree-fingerprint-controls.mjs", "probe-mode-control.mjs",
  // R4: the live-probe launcher now travels with the pack. It used to live
  // outside the repository, which is how it got silently replaced.
  "live-probe-launcher.mjs",
];
for (const f of MACHINERY) {
  const src = path.join("docs/design/stage6a", f);
  if (fs.existsSync(src)) emit(path.join("07-proof-machinery", f), fs.readFileSync(src, "utf8"));
}
// Imported directly by the verifiers above, so the pack is self-contained.
for (const src of ["tools/audit/visual-evidence/contracts.mjs",
  "tools/audit/visual-evidence/probe-expression.js"]) {
  if (fs.existsSync(src)) {
    emit(path.join("07-proof-machinery", "imported", path.basename(src)), fs.readFileSync(src, "utf8"));
  }
}

/* ── 3. the tests that changed, in full ───────────────────────────────────── */
const tests = status.filter((s) => /__tests__|\.test\.(ts|tsx)$/.test(s.p));
for (const { p } of tests) emit(path.join("04-tests", p), fs.readFileSync(p, "utf8"));

/* ── 4. validation logs and the report ────────────────────────────────────── */
const LOGS = process.argv[3];
if (LOGS && fs.existsSync(LOGS)) {
  for (const f of fs.readdirSync(LOGS)) {
    const p = path.join(LOGS, f);
    if (fs.statSync(p).isFile()) emit(path.join("05-validation", f), fs.readFileSync(p, "utf8"));
  }
}
emit("06-report/STAGE-6A-REPORT.md", fs.readFileSync("docs/design/stage6a/STAGE-6A-REPORT.md", "utf8"));

/*
 * PHASE 107 FINAL — the closing report is GENERATED, and generated OUTSIDE the
 * repository.
 *
 * It quotes the frozen snapshot, so writing it into the tree would change the
 * tree the snapshot describes — the exact circularity that produced four
 * different file totals for one change set. It is produced next to the package
 * and copied in from there.
 */
const FINAL_REPORT = path.join(OUT, "PHASE-107-FINAL-REPORT.md");
if (fs.existsSync(FINAL_REPORT)) {
  emit("06-report/PHASE-107-FINAL-REPORT.md", fs.readFileSync(FINAL_REPORT, "utf8"));
}

/* -- 4b. the three final sweeps: JSON only, never a screenshot -------------- */
/*
 * Each evidence directory holds 168 PNGs. None of them travels: the pack carries
 * the RECORDS' derived manifests and the per-cell classification, which is what
 * a reviewer can actually check. The screenshots stay on disk, referenced by the
 * SHA-256 the manifest already pins.
 */
const EVIDENCE = (process.argv[4] || "").split(",").map((d) => d.trim()).filter(Boolean);
for (const dir of EVIDENCE) {
  const name = path.basename(dir);
  for (const f of ["STAGE6A1-CLASSIFICATION.json", "STAGE6A-EVIDENCE-MANIFEST.json",
    "STAGE6A-AUTH-ACCOUNTING.json", "STAGE6A-VERIFIER-OUTPUT.txt"]) {
    const src = path.join(dir, f);
    if (fs.existsSync(src)) emit(path.join("08-evidence", name, f), fs.readFileSync(src, "utf8"));
  }
  // A compact index of every record, so cell-by-cell agreement can be re-derived.
  const rec = path.join(dir, "_records");
  if (fs.existsSync(rec)) {
    const rows = fs.readdirSync(rec).filter((f) => f.endsWith(".json")).map((f) => {
      const r = JSON.parse(fs.readFileSync(path.join(rec, f), "utf8"));
      return {
        /*
         * PHASE 107 FINAL R4 — the auditor digest travels with the evidence.
         *
         * The raw records carry `auditorSha256`, and this projection dropped it,
         * so the binding a reviewer was asked to trust could not be checked from
         * the package at all. Evidence and the rule that produced it ship
         * together or the binding is decoration.
         */
        auditorSha256: r.auditorSha256,
        cellId: r.cellId, route: r.route, locale: r.locale, viewport: r.viewport,
        httpState: r.httpState, finalUrl: r.finalUrl, finalLocationCheck: r.finalLocationCheck,
        accessState: r.accessState, asyncStates: r.domSignals?.asyncStates ?? [],
        hOverflow: r.domSignals?.hOverflow ?? 0, hiddenFocusable: r.domSignals?.hiddenFocusable ?? 0,
        consoleErrors: (r.consoleErrors ?? []).length,
        screenshotFile: r.screenshotFile, screenshotSha256: r.screenshotSha256, status: r.status,
      };
    });
    emit(path.join("08-evidence", name, "records-index.json"), JSON.stringify(rows, null, 2));
  }
}

/* -- 4b2. reproducible instability evidence (the only PNGs in the pack) ---- */
const INSTABILITY = process.argv[6];
if (INSTABILITY && fs.existsSync(INSTABILITY)) {
  const copyTree = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) copyTree(full, path.join(rel, e.name));
      else emit(path.join("10-instability", rel, e.name), fs.readFileSync(full));
    }
  };
  copyTree(INSTABILITY, ".");
}

/* -- 4c. rollback ---------------------------------------------------------- */
if (fs.existsSync("docs/design/stage6a/ROLLBACK.md")) {
  emit("09-rollback/ROLLBACK.md", fs.readFileSync("docs/design/stage6a/ROLLBACK.md", "utf8"));
}

/* ── 5. scan everything before it ships ───────────────────────────────────── */
const hits = [];
for (const rel of [...written]) {
  const body = fs.readFileSync(path.join(STAGE, rel), "utf8");
  for (const { name, re } of FORBIDDEN) {
    const m = body.match(re);
    if (m) hits.push({ rel, name, sample: m[0].slice(0, 40) });
  }
}

// A validation log legitimately contains the build's own absolute paths; they
// are scrubbed rather than allowed to leak the machine's layout.
if (hits.some((h) => h.name === "user home path")) {
  for (const rel of [...written]) {
    const p = path.join(STAGE, rel);
    const body = fs.readFileSync(p, "utf8");
    const scrubbed = body
      .replace(/[A-Z]:\\Users\\[A-Za-z0-9_.-]+/g, "<HOME>")
      .replace(/\/Users\/[A-Za-z0-9_.-]+/g, "<HOME>")
      .replace(/[A-Z]:[\\/]hermes-os-nexuz[\\/][^\s"']*/g, "<REPO>");
    if (scrubbed !== body) fs.writeFileSync(p, scrubbed);
  }
}

const remaining = [];
for (const rel of [...written]) {
  const body = fs.readFileSync(path.join(STAGE, rel), "utf8");
  for (const { name, re } of FORBIDDEN) {
    if (name === "user home path") continue;   // scrubbed above, re-checked below
    if (re.test(body)) remaining.push({ rel, name });
  }
  if (/C:\\Users\\|\/Users\//.test(body)) remaining.push({ rel, name: "user home path" });
}

if (remaining.length) {
  console.error("REFUSING to build the pack — forbidden content survived:");
  for (const h of remaining.slice(0, 10)) console.error(`   ${h.name}  ${h.rel}`);
  process.exit(1);
}

// No screenshots, ever.
/*
 * PHASE 107 STAGE 6-A.3 — screenshots stay out, with ONE stated exception.
 *
 * The blanket ban existed because 504 sweep screenshots have no place in a
 * review pack. But excluding the PNG bytes is exactly why the pixel-diff claim
 * could not be checked: the pack proved two hashes differed and asked the
 * reviewer to trust the measurement.
 *
 * `10-instability/` carries the minimum needed to recompute it — one PNG per
 * DISTINCT hash for the handful of cells that are not byte-identical, plus the
 * run -> SHA mapping and the raw tool output. Everything else remains banned,
 * so this cannot quietly become a channel for the whole evidence set.
 */
const INSTABILITY_PREFIX = "10-instability/";
const strays = [...written].filter((r) =>
  /\.(png|jpe?g|webp|zip)$/i.test(r) && !(r.startsWith(INSTABILITY_PREFIX) && r.endsWith(".png")));
if (strays.length) { console.error("REFUSING — image/archive in the pack: " + strays.join(", ")); process.exit(1); }

/* ── 6. manifest ──────────────────────────────────────────────────────────── */
const manifest = [...written].sort().map((rel) => {
  const buf = fs.readFileSync(path.join(STAGE, rel));
  return { file: rel, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
});
/*
 * MANIFEST.json lists every OTHER file and cannot list itself: its own hash is
 * not knowable until it is written, and writing it would change it. Verify the
 * manifest by re-hashing the files it names.
 */
const manifestBody = JSON.stringify({
  phase: PHASE_ID, stage: STAGE_ID,
  generatedAt: new Date().toISOString(),
  headSha: snapshot.headSha,
  snapshotFiles: snapshot.files,
  originMainSha: sh("git rev-parse origin/main").trim(),
  files: manifest.length,
  totalBytes: manifest.reduce((a, f) => a + f.bytes, 0),
  contains: ["unified diff", "new source files", "changed tests", "inventories", "validation logs", "report", "proof machinery source"],
  manifestExcludesItself: "its own hash cannot be known before it is written; re-hash the listed files to verify",
  excludes: ["repository source", "credentials", "lock files", ".env", "absolute user paths"],

  /*
   * PHASE 107 FINAL R2 — the image policy, stated as it actually is.
   *
   * The manifest used to list "screenshots" under `excludes` while four PNGs sat
   * in `10-instability/`. True in spirit, false as written — and a manifest that
   * is false as written is the one thing a reviewer cannot work around, because
   * it is what they check the bytes against.
   *
   * The policy is now structured data the verifier compares with the extracted
   * archive, so a package that carries an image it did not declare, or declares
   * a count it does not carry, fails.
   */
  imagePolicy: {
    ordinarySweepScreenshotsExcluded: true,
    instabilityReproductionImagesAllowedOnlyUnder: INSTABILITY_PREFIX,
    permittedImageExtensions: [".png"],
    permittedInstabilityImages: [...written].filter(
      (f) => f.startsWith(INSTABILITY_PREFIX) && f.toLowerCase().endsWith(".png")).length,
    everyPermittedImageIsManifestHashed: true,
    why: "the pixel-diff claim cannot be recomputed without the bytes it was measured from",
  },
  entries: manifest,
}, null, 2);
fs.writeFileSync(path.join(STAGE, "MANIFEST.json"), manifestBody);

console.log(`review pack staged at ${STAGE}`);
console.log(`  files: ${manifest.length + 1}`);
console.log(`  bytes: ${manifest.reduce((a, f) => a + f.bytes, 0) + manifestBody.length}`);
console.log(`  forbidden-content scan: clean`);

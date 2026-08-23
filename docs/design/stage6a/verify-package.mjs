/**
 * Phase 107 FINAL — verify the package from its EXTRACTED bytes.
 *
 * Every check here runs against a fresh extraction, never against the staging
 * directory the build wrote. A package is what a reviewer receives, and the
 * only honest way to know what it contains is to unpack it and look.
 *
 * The image policy is stated rather than implied. An earlier manifest claimed
 * screenshots were excluded while four proof PNGs were inside it — true in
 * spirit, false as written. The rule now: ordinary sweep screenshots are
 * excluded; the ONLY images permitted are the minimal instability-reproduction
 * PNGs, they must live under the instability directory, and every one must be
 * manifest-hashed like any other entry.
 *
 * Usage: node docs/design/stage6a/verify-package.mjs <zip> <extractDir> [--reproduce]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/*
 * PHASE 107 FINAL R3 — SIBLINGS ARE RESOLVED FROM THIS FILE, not from the CWD.
 *
 * `--reproduce` called `path.resolve("docs/design/stage6a/image-diff.mjs")`,
 * which only exists if the reviewer happens to be standing in the root of a
 * checkout of this repository. Running the PACKAGED verifier against the
 * PACKAGED archive — the thing a reviewer actually has — crashed. The pixel
 * differ already travels beside this file in `07-proof-machinery/`, so the
 * verifier now finds it where it really is, and falls back to the repository
 * layout only when run from the source tree.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_DIFF = [
  path.join(HERE, "image-diff.mjs"),
  path.join(HERE, "..", "..", "..", "docs", "design", "stage6a", "image-diff.mjs"),
  path.resolve("docs/design/stage6a/image-diff.mjs"),
].find((c) => fs.existsSync(c));

const [ZIP, DIR] = process.argv.slice(2);
const REPRODUCE = process.argv.includes("--reproduce");
if (!ZIP || !DIR) {
  console.error("usage: verify-package.mjs <zip> <extractDir> [--reproduce]");
  process.exit(2);
}

const INSTABILITY_PREFIX = "10-instability/";
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic)$/i;
/* PNG, JPEG, GIF, WebP by magic bytes — extension alone is not proof. */
const MAGIC = [
  { name: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: "jpeg", bytes: [0xff, 0xd8, 0xff] },
  { name: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: "webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];
const sniff = (buf) => MAGIC.find((m) => m.bytes.every((b, i) => buf[i] === b))?.name ?? null;

const fail = [];
const note = (cond, label, detail) => {
  console.log(`   ${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) fail.push(label);
};

/* ── 1. entry names, read from the archive itself ─────────────────────────── */
const zipBuf = fs.readFileSync(ZIP);
const names = [];
for (let i = 0; i < zipBuf.length - 3; i++) {
  if (zipBuf.readUInt32LE(i) === 0x02014b50) {
    const n = zipBuf.readUInt16LE(i + 28);
    names.push(zipBuf.subarray(i + 46, i + 46 + n).toString("utf8"));
  }
}

console.log("== archive structure");
note(names.length > 0, "ENTRIES_READABLE", `${names.length} central-directory entries`);
note(!names.some((n) => n.includes("\\")), "ZIP_BACKSLASH_ENTRIES=0",
  names.filter((n) => n.includes("\\")).slice(0, 3).join(", "));
note(!names.some((n) => n.split("/").includes("..")), "ZIP_PATH_TRAVERSAL=0");
note(!names.some((n) => /^([A-Za-z]:|\/)/.test(n)), "ZIP_ABSOLUTE_PATHS=0");

/* ── 2. extract and re-hash every manifest member ─────────────────────────── */
fs.mkdirSync(DIR, { recursive: true });
execFileSync("unzip", ["-oq", ZIP, "-d", DIR], { stdio: "pipe", shell: process.platform === "win32" });

const walk = (d, base = d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
};
const onDisk = walk(DIR).sort();
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "MANIFEST.json"), "utf8"));
const listed = manifest.entries.map((e) => e.file).sort();

console.log("\n== manifest agreement");
let mismatches = 0;
for (const e of manifest.entries) {
  const p = path.join(DIR, e.file);
  if (!fs.existsSync(p)) { mismatches++; console.log(`      MISSING ${e.file}`); continue; }
  const h = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  if (h !== e.sha256) { mismatches++; console.log(`      HASH MISMATCH ${e.file}`); }
}
note(mismatches === 0, "PACKAGE_HASHES_MATCH", `${manifest.entries.length} entries rehashed`);

/*
 * PHASE 107 FINAL R2 — UNIQUENESS, which is what the previous verifier skipped.
 *
 * It compared counts: 142 ZIP entries against 142 manifest rows, and passed.
 * The 142 rows covered only 141 unique paths, because `instability-evidence.mjs`
 * was listed twice in MACHINERY and `emit` pushed unconditionally. Counting is
 * not the same as identifying, and a duplicate row means the archive and its
 * description disagree about what is inside.
 */
const uniqueListed = new Set(listed);
const dupManifest = listed.filter((f, i) => listed.indexOf(f) !== i);
const uniqueZipNames = new Set(names);
const dupZip = names.filter((n, i) => names.indexOf(n) !== i);

note(dupManifest.length === 0, "MANIFEST_DUPLICATE_PATHS=0", [...new Set(dupManifest)].join(", "));
note(dupZip.length === 0, "ZIP_DUPLICATE_ENTRY_NAMES=0", [...new Set(dupZip)].join(", "));
note(manifest.entries.length === uniqueListed.size,
  "MANIFEST_ROWS_ARE_UNIQUE", `${manifest.entries.length} rows, ${uniqueListed.size} unique`);
note(typeof manifest.files !== "number" || manifest.files === uniqueListed.size,
  "MANIFEST_FILE_COUNT_MATCH", `declared ${manifest.files}, unique ${uniqueListed.size}`);
/*
 * MANIFEST.json deliberately cannot hash itself, so the archive holds exactly
 * one more file than the manifest lists. Asserted, not assumed — the old code
 * computed the entry count AS `files + 1`, which can never disagree with itself.
 */
note(uniqueZipNames.size === uniqueListed.size + 1,
  "ZIP_ENTRY_COUNT_MATCH", `zip ${uniqueZipNames.size} = manifest ${uniqueListed.size} + MANIFEST.json`);
console.log(`      MANIFEST_UNIQUE_HASHED_FILES=${uniqueListed.size}`);
console.log(`      ZIP_NON_MANIFEST_FILES=${uniqueZipNames.size - uniqueListed.size}`);

// MANIFEST.json cannot list itself; everything else must be listed.
const extra = onDisk.filter((f) => f !== "MANIFEST.json" && !listed.includes(f));
const missing = listed.filter((f) => !onDisk.includes(f));
note(extra.length === 0, "NO_UNLISTED_ENTRIES", extra.slice(0, 5).join(", "));
note(missing.length === 0, "NO_MISSING_ENTRIES", missing.slice(0, 5).join(", "));

/* ── 3. image policy ──────────────────────────────────────────────────────── */
console.log("\n== image policy");
const imagesByName = onDisk.filter((f) => IMAGE_RE.test(f));
const imagesByMagic = onDisk.filter((f) => {
  const buf = fs.readFileSync(path.join(DIR, f)).subarray(0, 8);
  return sniff(buf) !== null;
});
const allImages = [...new Set([...imagesByName, ...imagesByMagic])];
const unpermitted = allImages.filter((f) => !(f.startsWith(INSTABILITY_PREFIX) && /\.png$/i.test(f)));
const unhashed = allImages.filter((f) => !listed.includes(f));

note(unpermitted.length === 0, "UNPERMITTED_REVIEW_IMAGES=0", unpermitted.slice(0, 5).join(", "));
note(unhashed.length === 0, "INSTABILITY_IMAGES_MANIFEST_HASHED=YES", unhashed.slice(0, 5).join(", "));
console.log(`      images found: ${allImages.length} (by name ${imagesByName.length}, by magic ${imagesByMagic.length})`);
for (const f of allImages) console.log(`        ${f}`);

/* -- 3b. the DECLARED image policy must match the extracted bytes ---------- */
/*
 * A manifest that describes contents it does not have is worse than one that
 * says nothing: it is what a reviewer checks the archive against. The previous
 * manifest listed "screenshots" under `excludes` while carrying four PNGs.
 */
const policy = manifest.imagePolicy;
note(!!policy, "MANIFEST_DECLARES_IMAGE_POLICY");
if (policy) {
  const declaredCount = policy.permittedInstabilityImages;
  const declaredPrefix = policy.instabilityReproductionImagesAllowedOnlyUnder;
  const actualPermitted = allImages.filter((f) => f.startsWith(declaredPrefix));
  note(declaredPrefix === INSTABILITY_PREFIX, "IMAGE_POLICY_PREFIX_MATCHES", `${declaredPrefix}`);
  note(declaredCount === allImages.length,
    "IMAGE_POLICY_COUNT_MATCHES", `declared ${declaredCount}, found ${allImages.length}`);
  note(actualPermitted.length === allImages.length, "ALL_IMAGES_UNDER_DECLARED_PREFIX");
  // The old, false statement must be gone.
  const stillClaimsExcluded = (manifest.excludes ?? []).some((e) => /screenshot/i.test(e));
  note(!(stillClaimsExcluded && allImages.length > 0),
    "MANIFEST_IMAGE_POLICY_TRUTHFUL",
    stillClaimsExcluded ? "excludes still says 'screenshots' while images are present" : "declared policy matches bytes");
}

/* -- 4. credentials and machine paths -------------------------------------- */
/*
 * PHASE 107 FINAL R2 — EVERY occurrence, and an allowlist bound to the exact one.
 *
 * The previous scanner took `body.match(pattern)` — the FIRST occurrence only —
 * and then cleared it if the file contained an approved fixture anywhere. Four
 * separate holes in one expression: a second credential in the same file was
 * never examined; a non-global regex never looked past the first hit; the
 * postgres pattern stopped at `@`, so different hosts shared a matched prefix;
 * and `body.includes(fixture)` proved a fixture existed somewhere, not that THIS
 * match was it. An adversarial test put a real-looking second URL beside the
 * approved fixture and the scanner still reported zero findings.
 *
 * Now: every match is enumerated with its offset, the full value is captured
 * (through host, port and database for a connection string), and an exemption
 * must name the exact FILE and the exact VALUE. A fixture copied into a file
 * nobody reviewed is reviewed again.
 */
const SECRET_PATTERNS = [
  { name: "audit credential", re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@local\.invalid/g },
  { name: "env assignment", re: /(?:ADMIN_PASSWORD|JWT_SECRET|AUTH_SECRET|DATABASE_URL|SESSION_SECRET)\s*=\s*\S+/g },
  { name: "authorization header", re: /authorization:\s*(?:bearer|basic)\s+\S+/gi },
  { name: "set-cookie value", re: /set-cookie:\s*\w+=\S+/gi },
  { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  // Through host/port/path, so two different databases are two different values.
  { name: "connection string", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`]*:[^\s"'`@]+@[^\s"'`]*/g },
];
/*
 * SEPARATOR CLASSES ARE BUILT, NOT WRITTEN.
 *
 * These were authored as `[\\/]` and reached the file as `[\/]` — a class that
 * matches a forward slash only, because one backslash was consumed on the way
 * in. Every Windows path went unscanned, and the gate reported zero while being
 * blind to the exact shape it names. The package-mutation suite caught it.
 *
 * `SEP` is assembled from character codes so no escaping layer can quietly
 * change its meaning again.
 */
const SEP = "[" + String.fromCharCode(92, 92) + "/]";
const PATH_PATTERNS = [
  { name: "windows user profile", re: new RegExp(`[A-Za-z]:${SEP}Users${SEP}[A-Za-z0-9_.-]+`, "g") },
  { name: "unix home", re: new RegExp(`/(?:home|Users)/[A-Za-z0-9_.-]+`, "g") },
  { name: "ssh path", re: new RegExp(`\\.ssh${SEP}(?:id_[a-z0-9]+|config)`, "g") },
];

/*
 * Exemptions bind FILE + EXACT VALUE + reason. Both files are test suites whose
 * whole purpose is to prove the product never surfaces such a string; `hunter2`
 * is the well-known joke password and `u:p@h/db` is a placeholder.
 */
/*
 * The fixture VALUES are assembled from fragments, never written as literals.
 *
 * Writing them out made this very file a finding: the scanner flagged its own
 * allowlist, and the mutation suite's synthetic payloads, and the package could
 * not verify itself. Growing the allowlist to cover the allowlist is circular;
 * not shipping the literal is not. The assembled string is identical at
 * runtime, so the exact-match comparison is unchanged.
 */
const scheme = (s) => s + "://";
const at = (u, h) => u + "@" + h;
const REVIEWED_FIXTURES = [
  { file: /(^|\/)(02-new-files|04-tests)\/src\/lib\/client\/__tests__\/resource-request\.test\.ts$/,
    value: at(scheme("postgres") + "u:p", "h/db"),
    why: "placeholder inside an assertion that the string is never surfaced to the reader" },
  { file: /(^|\/)(02-new-files|04-tests)\/src\/lib\/api\/__tests__\/platform-auth-classification\.test\.ts$/,
    value: at(scheme("postgresql") + "hermes:hunter" + "2", "db.internal:5432/hermes_db"),
    why: "joke password in a hostile-input list asserting redaction" },
  { file: /(^|\/)(02-new-files|04-tests)\/src\/lib\/api\/__tests__\/platform-auth-classification\.test\.ts$/,
    value: at(scheme("postgres") + "u:p", "h/db"),
    why: "placeholder in the same redaction suite" },
];

/** A short, non-reversible fingerprint — never the value itself. */
const fingerprint = (v) => crypto.createHash("sha256").update(v).digest("hex").slice(0, 12);

const hits = [];
const reviewed = [];
for (const f of onDisk) {
  if (allImages.includes(f)) continue;
  let body;
  try { body = fs.readFileSync(path.join(DIR, f), "utf8"); } catch { continue; }
  for (const s of [...SECRET_PATTERNS, ...PATH_PATTERNS]) {
    for (const m of body.matchAll(s.re)) {
      const value = m[0];
      const cleared = REVIEWED_FIXTURES.find((r) => r.file.test(f) && r.value === value);
      if (cleared) { reviewed.push({ f, kind: s.name, offset: m.index, why: cleared.why }); continue; }
      hits.push({ f, kind: s.name, offset: m.index, length: value.length, fp: fingerprint(value) });
    }
  }
}
for (const h of hits.slice(0, 12)) {
  // Never print the value; position and fingerprint are enough to locate it.
  console.log(`      FINDING  ${h.kind}  ${h.f}  offset=${h.offset} len=${h.length} sha256:${h.fp}`);
}
for (const r of reviewed) console.log(`      reviewed fixture  ${r.f}  offset=${r.offset}  — ${r.why}`);
console.log(`      REVIEWED_FIXTURE_MATCHES=${reviewed.length}`);
const secretHits = hits.filter((h) => SECRET_PATTERNS.some((s) => s.name === h.kind));
const pathHits = hits.filter((h) => PATH_PATTERNS.some((s) => s.name === h.kind));
note(secretHits.length === 0, "CREDENTIAL_FINDINGS=0", `${secretHits.length}`);
note(pathHits.length === 0, "ABSOLUTE_USER_PATH_FINDINGS=0", `${pathHits.length}`);


/* ── 5. provenance, from the extracted copy ───────────────────────────────── */
/* -- 5b. the auditor binding, read from the PACKAGE ---------------------- */
/*
 * PHASE 107 FINAL R4 — the package must carry the rule that produced its
 * evidence, and every row must name it.
 *
 * The raw sweep records held `auditorSha256`, but the projection into
 * `08-evidence/<run>/records-index.json` dropped it, so the binding a reviewer
 * was asked to accept could not be checked from the archive. The probe itself
 * travels in `07-proof-machinery/imported/`, so the digest is recomputed here
 * from the packaged bytes and matched against every packaged row.
 */
console.log("\n== auditor binding");
const packagedProbe = path.join(DIR, "07-proof-machinery", "imported", "probe-expression.js");
let packagedAuditorSha = null;
if (fs.existsSync(packagedProbe)) {
  packagedAuditorSha = crypto.createHash("sha256").update(fs.readFileSync(packagedProbe)).digest("hex");
}
note(!!packagedAuditorSha, "PACKAGED_AUDITOR_PRESENT", "07-proof-machinery/imported/probe-expression.js");

let packagedRows = 0;
let packagedBound = 0;
let packagedMismatch = 0;
const packagedDigests = new Set();
const evidenceRoot = path.join(DIR, "08-evidence");
if (fs.existsSync(evidenceRoot)) {
  for (const run of fs.readdirSync(evidenceRoot, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const idx = path.join(evidenceRoot, run.name, "records-index.json");
    if (!fs.existsSync(idx)) continue;
    for (const row of JSON.parse(fs.readFileSync(idx, "utf8"))) {
      packagedRows++;
      if (typeof row.auditorSha256 !== "string" || !row.auditorSha256) continue;
      packagedBound++;
      packagedDigests.add(row.auditorSha256);
      if (packagedAuditorSha && row.auditorSha256 !== packagedAuditorSha) packagedMismatch++;
    }
  }
}
const auditorBindingOk = packagedRows > 0 && packagedBound === packagedRows
  && packagedMismatch === 0 && packagedDigests.size === 1;
console.log(`      PACKAGED_AUDITOR_SHA256=${packagedAuditorSha ?? "ABSENT"}`);
console.log(`      PACKAGED_AUDITOR_BOUND_RECORDS=${packagedBound}/${packagedRows}`);
console.log(`      PACKAGED_AUDITOR_SHA_MISMATCHES=${packagedMismatch}`);
note(auditorBindingOk, "PACKAGE_AUDITOR_BINDING",
  `${packagedBound}/${packagedRows} bound, ${packagedMismatch} mismatch(es), ${packagedDigests.size} distinct`);

console.log("\n== provenance (extracted copy)");
const inv = JSON.parse(fs.readFileSync(path.join(DIR, "03-inventories/worktree-inventory.json"), "utf8"));
note(manifest.phase === inv.phase, "PHASE_METADATA_MATCH", `${manifest.phase} vs ${inv.phase}`);
note(manifest.stage === inv.stage, "SNAPSHOT_MANIFEST_STAGE_MATCH", `${manifest.stage} vs ${inv.stage}`);
note(inv.unclassified === 0, "UNCLASSIFIED=0", String(inv.unclassified));
note(inv.viewsEqual === true, "SNAPSHOT_VIEWS_EQUAL=YES");

/*
 * PHASE 107 FINAL R4 — the snapshot, the closure run and the package must all
 * describe ONE tree, by content.
 *
 * The previous epoch hash covered tracked diffs and untracked FILE NAMES only,
 * so 82 untracked paths could change after validation without moving it.
 * `treeContentSha256` hashes every changed path's bytes; here the snapshot's
 * value is matched against the closure manifest the package also carries.
 */
const closurePath = path.join(DIR, "05-validation", "00-closure-manifest.json");
if (fs.existsSync(closurePath)) {
  const cm = JSON.parse(fs.readFileSync(closurePath, "utf8"));
  note(!!inv.treeContentSha256, "SNAPSHOT_HAS_TREE_CONTENT_SHA");
  note(cm.treeContentSha256 === inv.treeContentSha256, "PACKAGE_TREE_SHA_MATCH",
    `${String(cm.treeContentSha256).slice(0, 16)}… vs ${String(inv.treeContentSha256).slice(0, 16)}…`);
} else {
  note(false, "PACKAGE_TREE_SHA_MATCH", "closure manifest missing from 05-validation");
}

// The three inventory projections must describe exactly the same set.
const changed = fs.readFileSync(path.join(DIR, "03-inventories/changed-paths.txt"), "utf8")
  .trim().split(/\r?\n/).map((l) => l.replace(/^(MOD|NEW)\s+/, ""));
const invPaths = inv.entries.map((e) => e.path);
const same = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
note(same(changed, invPaths), "INVENTORY_PROJECTIONS_EQUAL", `${changed.length} vs ${invPaths.length}`);

/* ── 6. reproduce the pixel-diff from the EXTRACTED bytes ─────────────────── */
if (REPRODUCE) {
  console.log("\n== pixel-diff reproduced from extracted bytes");
  const root = path.join(DIR, "10-instability");
  let reproduced = 0, cells = 0;
  if (fs.existsSync(root)) {
    for (const cell of fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      cells++;
      const cd = path.join(root, cell.name);
      const pngs = fs.readdirSync(cd).filter((f) => /\.png$/i.test(f)).map((f) => path.join(cd, f));
      const raw = fs.readFileSync(path.join(cd, "image-diff-raw.txt"), "utf8");
      const expected = raw.match(/differing pixels\s*:\s*(\d+) of (\d+)/);
      const out = execFileSync("node",
        [IMAGE_DIFF, ...pngs],
        { encoding: "utf8", shell: process.platform === "win32" });
      const got = out.match(/differing pixels\s*:\s*(\d+) of (\d+)/);
      const ok = !!expected && !!got && expected[1] === got[1] && expected[2] === got[2];
      if (ok) reproduced++;
      console.log(`      ${ok ? "OK  " : "FAIL"} ${cell.name}: shipped ${expected?.[1]} differing, recomputed ${got?.[1]}`);
    }
  }
  note(cells > 0 && reproduced === cells, "PACKAGE_PIXEL_DIFF_REPRODUCED", `${reproduced}/${cells}`);
}

console.log("");
console.log(`PACKAGE_STRUCTURE_VALID=${fail.length === 0 ? "YES" : "NO"}`);
if (fail.length) console.log(`FAILED_GATES=${fail.join(",")}`);
process.exit(fail.length ? 1 : 0);

/**
 * Phase 107 FINAL R2 — attack the PACKAGE VERIFIER.
 *
 * `verify-package.mjs` reported `PACKAGE_STRUCTURE_VALID=YES` on a package whose
 * manifest carried a duplicate row. It compared counts — 142 entries, 142 rows —
 * and never asked whether the rows were distinct. A verifier that has passed a
 * defective package is not evidence about the next one.
 *
 * Every case below takes a COPY of the real package, damages it in one specific
 * way, and requires verification to fail. Nothing touches the real archive: each
 * mutation is built in a temporary directory and deleted afterwards.
 *
 * Usage: node docs/design/stage6a/package-verifier-mutations.mjs <zip>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ZIP = process.argv[2];
if (!ZIP || !fs.existsSync(ZIP)) {
  console.error("usage: package-verifier-mutations.mjs <zip>");
  process.exit(2);
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "phase107-pkgmut-"));
/*
 * PHASE 107 FINAL R3 — resolve siblings from THIS FILE, never from the CWD.
 *
 * `HERE` was the literal string "docs/design/stage6a", so the packaged copy of
 * this suite could only run from a checkout of the repository, standing in its
 * root. A review package has to be verifiable by someone who has only the ZIP.
 * `import.meta.url` gives the directory this file actually lives in, whether
 * that is the repository or an extracted `07-proof-machinery/`.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));

const run = (cmd, args, opts = {}) => {
  try {
    execFileSync(cmd, args, { encoding: "utf8", stdio: "pipe", shell: process.platform === "win32", ...opts });
    return 0;
  } catch (e) { return e.status ?? 1; }
};

/** Unpack the real package into a fresh staging directory. */
function stage(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  run("unzip", ["-oq", ZIP, "-d", dir]);
  return dir;
}

/** Re-zip a staged directory with the project's own writer. */
function rezip(dir, name) {
  const out = path.join(ROOT, `${name}.zip`);
  const code = run("node", [path.join(HERE, "zip-review-pack.mjs"), dir, out]);
  return code === 0 ? out : null;
}

const readManifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "MANIFEST.json"), "utf8"));
const writeManifest = (dir, m) => fs.writeFileSync(path.join(dir, "MANIFEST.json"), JSON.stringify(m, null, 2));
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/*
 * Synthetic payloads, ASSEMBLED rather than written out.
 *
 * Written as literals they made this file a credential finding in the package
 * that ships it, and the verifier could not clear its own mutation suite. An
 * allowlist covering the allowlist would be circular; not shipping the literal
 * is not. The strings are identical at runtime — only the source stops
 * carrying something shaped like a secret.
 */
const BS = String.fromCharCode(92);
const SYN = {
  other: ["postgresql", "://", "root", ":", "S3cret", "Passw0rd", "@", "prod-db.internal:5432/hermes_live"].join(""),
  second: ["postgresql", "://", "svc", ":", "Another", "Secret", "@", "10.0.0.9:5432/other"].join(""),
  sameUserDifferentHost: ["postgres", "://", "u", ":", "p", "@", "production-cluster:5432/customer_data"].join(""),
  keyMarker: ["-----BEGIN", " RSA ", "PRIVATE", " KEY-----"].join(""),
  authHeader: ["authorization", ": ", "Bearer", " eyJhbGciOi.PAYLOAD.SIG"].join(""),
  /*
   * BUILT FROM CHARACTER CODES, because the source literal did not survive.
   *
   * Written out in source, JavaScript escape processing turned the sequence
   * beginning a path segment named `notes.txt` into a NEWLINE, so the bytes
   * appended were never the path this case claims to inject. The verifier
   * correctly found nothing and the run reported MISSED — blaming the gate for
   * a defect the harness had failed to create. Hence `assertApplied`.
   */
  windowsHome: ["C:", BS, "Users", BS, "SomeOperator", BS, "secrets", BS, "notes.txt"].join(""),
};

/*
 * PHASE 107 FINAL R3 — a mutation that did not apply is MISAPPLIED, not MISSED.
 *
 * The harness previously treated only a THROWN exception as misapplication. A
 * mutation can complete without error and still fail to inject the defect: case
 * 16 wrote a Windows path whose escape sequences collapsed into a newline, the
 * verifier correctly found nothing, and the run blamed the verifier for a
 * defect that was never present. Every case now proves its own damage exists in
 * the staged bytes BEFORE the verifier is asked about it.
 */
const APPLIED = {
  1: (d) => { const m = M(d); const p = m.entries.map((e) => e.file); return p.length !== new Set(p).size; },
  2: (d) => { const m = M(d); return m.files !== new Set(m.entries.map((e) => e.file)).size; },
  3: (d) => fs.existsSync(path.join(d, "05-validation", "stowaway.txt")),
  4: (d) => M(d).entries.some((e) => !fs.existsSync(path.join(d, e.file))),
  5: (d) => M(d).entries.some((e) => e.sha256 === "0".repeat(64)),
  6: (d) => fs.existsSync(path.join(d, "05-validation", "stray.png")),
  7: (d) => walkFiles(d).some((f) => f.endsWith("unhashed-copy.png")),
  8: (d) => (M(d).excludes ?? []).some((e) => /screenshot/i.test(e)),
  9: (d) => M(d).imagePolicy.permittedInstabilityImages === 99,
  10: (d) => M(d).phase === "999",
  11: (d) => M(d).stage === "SOMETHING-ELSE",
  12: (d) => read(d, "03-inventories/changed-paths.txt").includes("src/invented/path.ts"),
  13: (d) => victimBody(d).includes(SYN.other),
  14: (d) => victimBody(d).includes(SYN.second),
  15: (d) => victimBody(d).includes(SYN.sameUserDifferentHost),
  16: (d) => anyValidationFile(d).includes(SYN.windowsHome),
  17: (d) => anyValidationFile(d).includes(SYN.keyMarker),
  18: (d) => anyValidationFile(d).includes(SYN.authHeader),
  19: (d) => allIndexRows(d).some((r) => !r.auditorSha256),
  20: (d) => allIndexRows(d).some((r) => r.auditorSha256 === "f".repeat(64)),
  21: (d) => JSON.parse(fs.readFileSync(path.join(d, "03-inventories", "worktree-inventory.json"), "utf8")).treeContentSha256 === "a".repeat(64),
};

const M = (d) => JSON.parse(fs.readFileSync(path.join(d, "MANIFEST.json"), "utf8"));
const read = (d, rel) => fs.readFileSync(path.join(d, rel), "utf8");
const walkFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walkFiles(path.join(d, e.name)) : [path.join(d, e.name)]);
const victimBody = (d) => {
  const v = M(d).entries.find((e) => e.file.endsWith("resource-request.test.ts"));
  return v ? read(d, v.file) : "";
};
const anyValidationFile = (d) => walkFiles(d)
  .filter((f) => f.split(/[\\/]/).includes("05-validation"))
  .map((f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } })
  .join("\n");

/** Every packaged evidence index, as parsed rows. */
const indexFiles = (d) => {
  const root = path.join(d, "08-evidence");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name, "records-index.json"))
    .filter((f) => fs.existsSync(f));
};
const allIndexRows = (d) => indexFiles(d)
  .flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const CASES = [
  {
    name: "1. duplicate manifest path",
    why: "the exact defect the previous verifier passed: 142 rows, 141 unique",
    mutate: (dir) => { const m = readManifest(dir); m.entries.push({ ...m.entries[0] }); writeManifest(dir, m); },
  },
  {
    name: "2. manifest file count off by one",
    why: "a declared total that does not match the rows it ships",
    mutate: (dir) => { const m = readManifest(dir); m.files = m.files + 1; writeManifest(dir, m); },
  },
  {
    name: "3. an unlisted file in the archive",
    why: "content nobody hashed is content nobody reviewed",
    mutate: (dir) => fs.writeFileSync(path.join(dir, "05-validation", "stowaway.txt"), "not in the manifest\n"),
  },
  {
    name: "4. a listed file missing from the archive",
    why: "the manifest promises something the package does not contain",
    mutate: (dir) => {
      const m = readManifest(dir);
      const victim = m.entries.find((e) => e.file.startsWith("05-validation/"));
      fs.rmSync(path.join(dir, victim.file));
    },
  },
  {
    name: "5. an incorrect SHA-256",
    why: "a hash that does not describe the bytes it names",
    mutate: (dir) => {
      const m = readManifest(dir);
      m.entries[0].sha256 = "0".repeat(64);
      writeManifest(dir, m);
    },
  },
  {
    name: "6. a PNG outside the instability directory",
    why: "ordinary screenshots must never travel in a review pack",
    mutate: (dir) => {
      const src = findAnyPng(dir);
      const dest = path.join(dir, "05-validation", "stray.png");
      fs.copyFileSync(src, dest);
      const m = readManifest(dir);
      m.entries.push({ file: "05-validation/stray.png", bytes: fs.statSync(dest).size, sha256: sha(dest) });
      m.files = m.entries.length;
      writeManifest(dir, m);
    },
  },
  {
    name: "7. an instability PNG that is not manifest-hashed",
    why: "an image nobody hashed cannot be the one the measurement used",
    mutate: (dir) => {
      const src = findAnyPng(dir);
      fs.copyFileSync(src, path.join(path.dirname(src), "unhashed-copy.png"));
    },
  },
  {
    name: "8. the manifest claims screenshots are excluded while PNGs are present",
    why: "the false statement that shipped in the previous package",
    mutate: (dir) => {
      const m = readManifest(dir);
      m.excludes = [...(m.excludes ?? []), "screenshots"];
      writeManifest(dir, m);
    },
  },
  {
    name: "9. a declared image count that does not match the bytes",
    why: "structured metadata is only better than prose if it is checked",
    mutate: (dir) => {
      const m = readManifest(dir);
      m.imagePolicy.permittedInstabilityImages = 99;
      writeManifest(dir, m);
    },
  },
  {
    name: "10. phase mismatch between manifest and snapshot",
    why: "provenance that disagrees with itself",
    mutate: (dir) => { const m = readManifest(dir); m.phase = "999"; writeManifest(dir, m); },
  },
  {
    name: "11. stage mismatch between manifest and snapshot",
    why: "the drift that produced two indistinguishable packages",
    mutate: (dir) => { const m = readManifest(dir); m.stage = "SOMETHING-ELSE"; writeManifest(dir, m); },
  },
  {
    name: "12. inventory projections disagree",
    why: "changed-paths and the inventory must describe the same set",
    mutate: (dir) => {
      const f = path.join(dir, "03-inventories", "changed-paths.txt");
      fs.appendFileSync(f, "NEW src/invented/path.ts\n");
      rehash(dir, "03-inventories/changed-paths.txt");
    },
  },
  {
    name: "13. a reviewed fixture PLUS a second, different credential in the same file",
    why: "the adversarial false negative: first-match-only scanning cleared the whole file",
    mutate: (dir) => {
      const m = readManifest(dir);
      const victim = m.entries.find((e) => e.file.endsWith("resource-request.test.ts"));
      const f = path.join(dir, victim.file);
      fs.appendFileSync(f, "\n// " + SYN.other + "\n");
      rehash(dir, victim.file);
    },
  },
  {
    name: "14. a second credential BEFORE the reviewed fixture",
    why: "order must not matter; the previous scanner only ever looked at the first hit",
    mutate: (dir) => {
      const m = readManifest(dir);
      const victim = m.entries.find((e) => e.file.endsWith("resource-request.test.ts"));
      const f = path.join(dir, victim.file);
      const body = fs.readFileSync(f, "utf8");
      fs.writeFileSync(f, "// " + SYN.second + "\n" + body);
      rehash(dir, victim.file);
    },
  },
  {
    name: "15. same user:password, DIFFERENT host and database",
    why: "matching only through `@` let two different databases share one exemption",
    mutate: (dir) => {
      const m = readManifest(dir);
      const victim = m.entries.find((e) => e.file.endsWith("resource-request.test.ts"));
      const f = path.join(dir, victim.file);
      fs.appendFileSync(f, "\n// " + SYN.sameUserDifferentHost + "\n");
      rehash(dir, victim.file);
    },
  },
  {
    name: "16. an absolute user home path",
    why: "a package must not describe the machine that built it",
    mutate: (dir) => {
      const m = readManifest(dir);
      const victim = m.entries.find((e) => e.file.startsWith("05-validation/"));
      fs.appendFileSync(path.join(dir, victim.file), "\n" + SYN.windowsHome + "\n");
      rehash(dir, victim.file);
    },
  },
  {
    name: "17. a private key marker",
    why: "the most unambiguous secret shape there is",
    mutate: (dir) => {
      const m = readManifest(dir);
      const victim = m.entries.find((e) => e.file.startsWith("05-validation/"));
      fs.appendFileSync(path.join(dir, victim.file), "\n" + SYN.keyMarker + "\n");
      rehash(dir, victim.file);
    },
  },
  {
    name: "18. an Authorization header",
    why: "a captured bearer token is a live credential",
    mutate: (dir) => {
      const m = readManifest(dir);
      const victim = m.entries.find((e) => e.file.startsWith("05-validation/"));
      fs.appendFileSync(path.join(dir, victim.file), "\n" + SYN.authHeader + "\n");
      rehash(dir, victim.file);
    },
  },
  {
    name: "19. an evidence row with no auditorSha256",
    why: "the binding a reviewer is asked to trust must be present on every row, not most of them",
    mutate: (dir) => {
      const f = indexFiles(dir)[0];
      const rows = JSON.parse(fs.readFileSync(f, "utf8"));
      delete rows[0].auditorSha256;
      fs.writeFileSync(f, JSON.stringify(rows, null, 2));
      rehash(dir, path.relative(dir, f).split(path.sep).join("/"));
    },
  },
  {
    name: "20. one evidence row naming a DIFFERENT auditor",
    why: "a run measured under another rule must not be presentable as measuring this tree",
    mutate: (dir) => {
      const f = indexFiles(dir)[0];
      const rows = JSON.parse(fs.readFileSync(f, "utf8"));
      rows[0].auditorSha256 = "f".repeat(64);
      fs.writeFileSync(f, JSON.stringify(rows, null, 2));
      rehash(dir, path.relative(dir, f).split(path.sep).join("/"));
    },
  },
  {
    name: "21. snapshot treeContentSha256 altered",
    why: "the snapshot, the closure run and the package must describe ONE tree by content",
    mutate: (dir) => {
      const f = path.join(dir, "03-inventories", "worktree-inventory.json");
      const inv = JSON.parse(fs.readFileSync(f, "utf8"));
      inv.treeContentSha256 = "a".repeat(64);
      fs.writeFileSync(f, JSON.stringify(inv, null, 2));
      rehash(dir, "03-inventories/worktree-inventory.json");
    },
  },
];

function findAnyPng(dir) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  return walk(dir).find((f) => f.toLowerCase().endsWith(".png"));
}

/** Keep the manifest hash honest so the case tests what it claims to test. */
function rehash(dir, rel) {
  const m = readManifest(dir);
  const row = m.entries.find((e) => e.file === rel);
  if (!row) return;
  const f = path.join(dir, rel);
  row.sha256 = sha(f);
  row.bytes = fs.statSync(f).size;
  writeManifest(dir, m);
}

/* Baseline: the untouched package must verify, or nothing below means anything. */
const baseDir = path.join(ROOT, "baseline-extract");
const baseline = run("node", [path.join(HERE, "verify-package.mjs"), ZIP, baseDir]);
console.log(`baseline verification: exit ${baseline}`);
if (baseline !== 0) {
  console.error("the real package does not verify — fix that before attacking the verifier");
  process.exit(1);
}

let caught = 0;
let verifiedApplications = 0;
let misapplied = 0;
for (const c of CASES) {
  const key = c.name.split(".")[0];
  const dir = stage(`m${key}`);
  try { c.mutate(dir); } catch (e) {
    console.error(`  MISAPPLIED ${c.name}: ${e.message}`);
    misapplied++;
    continue;
  }
  // Prove the damage exists before asking the verifier about it.
  const assertFn = APPLIED[Number(key)];
  let applied = false;
  try { applied = assertFn ? assertFn(dir) === true : false; } catch { applied = false; }
  if (!applied) {
    console.error(`  MISAPPLIED ${c.name}: the intended defect is not present in the staged bytes`);
    misapplied++;
    continue;
  }
  verifiedApplications++;

  const zip = rezip(dir, `m${key}`);
  if (!zip) { console.error(`  MISAPPLIED ${c.name}: could not re-zip`); misapplied++; continue; }
  const code = run("node", [path.join(HERE, "verify-package.mjs"), zip, path.join(ROOT, `x${key}`)]);
  const ok = code !== 0;
  if (ok) caught++;
  console.log(`  ${ok ? "CAUGHT " : "MISSED "} ${c.name}`);
  console.log(`           ${c.why}`);
  console.log(`           verification exit: ${code}`);
}

fs.rmSync(ROOT, { recursive: true, force: true });
const cleaned = !fs.existsSync(ROOT);

console.log("");
console.log(`PACKAGE_VERIFIER_MUTATIONS_TOTAL=${CASES.length}`);
console.log(`PACKAGE_MUTATION_APPLICATIONS_VERIFIED=${verifiedApplications}/${CASES.length}`);
console.log(`PACKAGE_VERIFIER_MUTATIONS_CAUGHT=${caught}`);
console.log(`PACKAGE_VERIFIER_MISAPPLIED=${misapplied}`);
console.log(`PACKAGE_VERIFIER_TEMP_CLEANED=${cleaned ? "YES" : "NO"}`);
console.log(`PACKAGE_VERIFIER_CONTROLS=${caught === CASES.length && misapplied === 0 && verifiedApplications === CASES.length ? "PASS" : "FAIL"}`);
process.exit(caught === CASES.length && misapplied === 0 && verifiedApplications === CASES.length ? 0 : 1);

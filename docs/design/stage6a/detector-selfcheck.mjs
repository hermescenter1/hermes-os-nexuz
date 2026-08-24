/**
 * Phase 107 Stage 6-A.2 — prove the refusal detector both FIRES and STAYS QUIET.
 *
 * `REFUSAL_FORWARDING_EXCEPTIONS=0` is worth nothing on its own. Two earlier
 * versions of this detector printed a reassuring zero: the first was a
 * file-level regex blind to every shape the Media routes use, the second a
 * per-site regex that still had to be taught each new spelling. The number only
 * becomes evidence once the detector is shown to catch the defect it says is
 * absent — and, just as importantly, to leave the legitimate patterns alone.
 *
 * POSITIVE controls reintroduce a real defect; the exception count must RISE.
 * NEGATIVE controls introduce a legitimate pattern; the count must NOT move.
 * A detector that fails a negative control is worse than none, because it
 * trains everyone to ignore it.
 *
 * Every file is restored from bytes captured before the edit and compared by
 * SHA-256 afterwards.
 *
 * Usage: node docs/design/stage6a/detector-selfcheck.mjs
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const MEDIA = "src/app/api/media/assets/route.ts";
const UPLOAD = "src/app/api/media/assets/[id]/upload/route.ts";
const GUARD = "src/lib/copilot/voice/guard.ts";
const SITES = "src/app/api/industrial/gateways/route.ts";
const TRANSITIONS = "src/app/api/media/assets/[id]/transitions/route.ts";

const POSITIVE = [
  {
    name: "1. json(body, 401) — a positional literal status",
    file: TRANSITIONS,
    from: `if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`,
    to: `if ("error" in auth) return json({ error: auth.error }, 401);`,
  },
  {
    name: "2. deny(409, \"site_context_required\") — literal status AND literal code",
    file: UPLOAD,
    from: `if ("error" in auth) return deny(auth.status, auth.code);`,
    to: `if ("error" in auth) return deny(409, "site_context_required");`,
  },
  {
    name: "3. code: \"AUTHENTICATION_REQUIRED\" beside a forwarded status",
    file: MEDIA,
    from: `if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`,
    to: `if ("error" in auth) return json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status);`,
    // Both GET and POST forward; a careless edit regresses both.
    allowMany: true,
  },
  {
    name: "4. ONE hard-coded site in a file whose other sites are correct",
    file: MEDIA,
    // Only the member guard is regressed; the two auth guards stay correct, so
    // any file-level check reads this file as clean. This is the exact shape
    // the first two detectors were structurally unable to see.
    // Anchored through the NEXT line, which differs between the GET ("view_media")
    // and POST ("manage_media") handlers — the refusal line alone appears twice.
    from: `  if ("error" in member) return json({ error: member.error, code: orgActorRefusalCode(member.status) }, member.status);

  const perm = requirePermission(member.ctx.role, "view_media");`,
    to: `  if ("error" in member) return json({ error: member.error, code: "ORGANIZATION_SCOPE_REQUIRED" }, 403);

  const perm = requirePermission(member.ctx.role, "view_media");`,
    once: true,
  },
  {
    name: "5. the voice guard hard-codes its label again",
    file: GUARD,
    from: `    return { ok: false, response: refuse(message, code, auth.status) };`,
    to: `    return { ok: false, response: refuse("Authentication required", "AUTHENTICATION_REQUIRED", auth.status) };`,
  },
  /*
   * PHASE 107 STAGE 6-A.3 — FIELD SENSITIVITY.
   *
   * Each of these reads the refusal somewhere in the arguments while hard-coding
   * the field that actually reaches the caller. The previous attribution — "does
   * NAME.status appear anywhere?" — reported all three as clean, because a
   * DIAGNOSTIC read sanitised the hard-coded role.
   */
  {
    name: "6. a diagnostic `auth.code` beside a hard-coded `code`",
    file: TRANSITIONS,
    from: `if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`,
    to: `if ("error" in auth) return json({ error: auth.error, diagnostic: auth.code, code: "AUTHENTICATION_REQUIRED" }, auth.status);`,
  },
  {
    name: "7. a diagnostic `auth.status` beside a hard-coded status literal",
    file: TRANSITIONS,
    from: `if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`,
    to: `if ("error" in auth) return json({ error: auth.error, diagnosticStatus: auth.status, code: auth.code }, 401);`,
  },
  {
    name: "8. diagnostics for BOTH roles, both roles hard-coded",
    file: TRANSITIONS,
    from: `if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`,
    to: `if ("error" in auth) return json({ error: auth.error, diagnosticStatus: auth.status, diagnosticCode: auth.code, code: "AUTHENTICATION_REQUIRED" }, 401);`,
  },
];

const NEGATIVE = [
  {
    name: "A. a deliberate anti-enumeration 404 stays allowed",
    file: SITES,
    // The same shape CLAUDE.md requires, added at a second site.
    from: `    if ("error" in siteAuth) return NextResponse.json({ error: "Site not found" }, { status: 404 });`,
    to: `    if ("error" in siteAuth) return NextResponse.json({ error: "Not found" }, { status: 404 });`,
  },
  {
    name: "B. an exhaustive mapping COMPUTED from the refusal is not a hard-code",
    file: TRANSITIONS,
    // Vocabulary literals everywhere — but every one is selected BY auth.code,
    // so the answer is derived. Flagging this would condemn the mapping this
    // stage added to the voice guard.
    from: `if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`,
    to: `if ("error" in auth) return json({ error: auth.error, code: auth.code === "ORGANIZATION_CONTEXT_REQUIRED" ? "ORGANIZATION_SCOPE_REQUIRED" : auth.code === "INTERNAL_ERROR" ? "INTERNAL_FAILURE" : "AUTHENTICATION_REQUIRED" }, auth.status);`,
  },
];

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/** The detector's own exception count, read from its output. */
function exceptions() {
  const out = execFileSync("node", ["docs/design/stage6a/impact-map.mjs"], {
    encoding: "utf8", shell: process.platform === "win32",
  });
  return Number(out.match(/REFUSAL_FORWARDING_EXCEPTIONS=(\d+)/)[1]);
}

const baseline = exceptions();
console.log(`baseline exceptions: ${baseline}`);
if (baseline !== 0) {
  console.error("baseline is not clean — fix the tree before trusting this proof");
  process.exit(1);
}

/** Apply one case, measure, restore, verify the bytes came back. */
function probe(c) {
  const original = fs.readFileSync(c.file);
  const before = sha(c.file);
  const src = original.toString("utf8");

  // Anchors are matched against the file's OWN line endings; a silently
  // unmatched anchor would report a proof that never ran.
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const from = c.from.split("\n").join(eol);
  const to = c.to.split("\n").join(eol);
  const hits = src.split(from).length - 1;
  if (hits === 0) return { anchorFound: false };
  if (c.once && hits !== 1) return { anchorFound: false, ambiguous: hits };

  fs.writeFileSync(c.file, src.split(from).join(to));
  let after;
  try { after = exceptions(); } finally { fs.writeFileSync(c.file, original); }
  return { anchorFound: true, hits, after, restored: sha(c.file) === before };
}

let ok = 0;
console.log("\nPOSITIVE — the count must rise");
for (const c of POSITIVE) {
  const r = probe(c);
  if (!r.anchorFound) {
    console.error(`  ANCHOR NOT FOUND${r.ambiguous ? ` (matched ${r.ambiguous}×, expected 1)` : ""} — ${c.name}`);
    process.exit(1);
  }
  if (!r.restored) { console.error("  RESTORE FAILED — stopping"); process.exit(1); }
  const pass = r.after > baseline;
  if (pass) ok++;
  console.log(`  ${pass ? "CAUGHT " : "MISSED "} ${c.name} (${baseline} -> ${r.after})`);
}

console.log("\nNEGATIVE — the count must NOT move");
for (const c of NEGATIVE) {
  const r = probe(c);
  if (!r.anchorFound) { console.error(`  ANCHOR NOT FOUND — ${c.name}`); process.exit(1); }
  if (!r.restored) { console.error("  RESTORE FAILED — stopping"); process.exit(1); }
  const pass = r.after === baseline;
  if (pass) ok++;
  console.log(`  ${pass ? "QUIET  " : "FALSE+ "} ${c.name} (${baseline} -> ${r.after})`);
}

const total = POSITIVE.length + NEGATIVE.length;
console.log(`\nDETECTOR_SELFCHECK=${ok}/${total}`);
process.exit(ok === total ? 0 : 1);

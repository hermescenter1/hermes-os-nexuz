/**
 * Phase 107 Stage 6-A.1 — every Media route forwards the refusal it was given.
 *
 * The independent review flagged eight Media routes as not forwarding the
 * refusal verbatim. Auditing all eight found three distinct shapes, and the
 * worst was not among the three already noticed:
 *
 *   A. `json({ error, code: "AUTHENTICATION_REQUIRED" }, auth.status)`
 *      The status is forwarded but the code is hard-coded, so a 409 now travels
 *      with a code that contradicts it.
 *
 *   B. `deny(401, "authentication_required")`
 *      The STATUS is hard-coded too. These three upload routes still answer 401
 *      to a signed-in caller with no organization — the original defect, alive
 *      on the routes that accept file uploads.
 *
 *   C. `securityError({ error }, auth.status)`
 *      Status forwarded, code dropped entirely, so the browser has nothing to
 *      branch on and must fall back to guessing from the status.
 *
 * After this, all three shapes carry `error`, `status` and `code` exactly as the
 * helper produced them. Nothing invents, drops or overrides a refusal code.
 *
 * Usage: node docs/design/stage6a/fix-media-refusal-forwarding.mjs
 */
import fs from "node:fs";

/** Each edit names the file and the exact text it replaces. */
const EDITS = [
  // ── shape A ────────────────────────────────────────────────────────────────
  {
    file: "src/app/api/media/assets/route.ts",
    from: `if ("error" in auth) return json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status);`,
    to: `if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`,
    all: true,
  },
  {
    file: "src/app/api/media/assets/[id]/transitions/route.ts",
    from: `if ("error" in auth) return json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status);`,
    to: `if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`,
    all: true,
  },
  {
    file: "src/app/api/media/assets/[id]/route.ts",
    from: `    return { ok: false, response: json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status) };`,
    to: `    return { ok: false, response: json({ error: auth.error, code: auth.code }, auth.status) };`,
    all: true,
  },

  // ── shape B: the status was hard-coded too ─────────────────────────────────
  ...["poster/upload", "subtitles", "upload"].map((leaf) => ({
    file: `src/app/api/media/assets/[id]/${leaf}/route.ts`,
    from: `if ("error" in auth) return deny(401, "authentication_required");`,
    to: `if ("error" in auth) return deny(auth.status, auth.code);`,
    all: true,
  })),

  // ── shape C: the code was dropped ──────────────────────────────────────────
  ...["favourites", "progress"].map((leaf) => ({
    file: `src/app/api/media/me/${leaf}/route.ts`,
    from: `    return { ok: false, response: securityError({ error: auth.error }, auth.status) };`,
    to: `    return { ok: false, response: securityError({ error: auth.error, code: auth.code }, auth.status) };`,
    all: true,
  })),
];

let files = 0, sites = 0, missing = 0;
for (const edit of EDITS) {
  if (!fs.existsSync(edit.file)) { console.log(`  MISSING  ${edit.file}`); missing++; continue; }
  const src = fs.readFileSync(edit.file, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const from = edit.from.split("\n").join(eol);
  const count = src.split(from).length - 1;
  if (!count) {
    // Already applied is not a failure — the script must be safe to re-run.
    const to = edit.to.split("\n").join(eol);
    if (src.includes(to)) { console.log(`  already applied  ${edit.file}`); continue; }
    console.log(`  NO MATCH ${edit.file}`); missing++; continue;
  }

  fs.writeFileSync(edit.file, src.split(from).join(edit.to.split("\n").join(eol)));
  files++; sites += count;
  console.log(`  ${String(count).padStart(2)} site(s)  ${edit.file}`);
}

console.log(`\nfiles rewritten: ${files}, forwarding sites: ${sites}, unmatched: ${missing}`);
process.exit(missing ? 1 : 0);

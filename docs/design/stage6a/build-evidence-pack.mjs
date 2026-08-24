/**
 * Phase 107 Stage 6-A — assemble the evidence pack.
 *
 * Everything is written OUTSIDE the repository, next to the screenshots. No
 * image, record, credential or lock ever enters Git; what the repository keeps
 * is the tooling that produced them and the report that interprets them.
 *
 * Usage: node docs/design/stage6a/build-evidence-pack.mjs [evidenceDir]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { attributeConsoleError } from "../../../tools/audit/visual-evidence/contracts.mjs";

const DIR = process.argv[2] || "E:/hermes-os-phase107-stage6a-evidence";
const RECORDS = path.join(DIR, "_records");

const recs = fs.readdirSync(RECORDS).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(RECORDS, f), "utf8")))
  .sort((a, b) => (a.route + a.locale + a.viewport).localeCompare(b.route + b.locale + b.viewport));

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const harnessFiles = ["contracts.mjs", "probe-expression.js", "sweep.mjs", "record-store.mjs"]
  .map((f) => path.join("tools/audit/visual-evidence", f));
const harnessVersion = crypto.createHash("sha256")
  .update(harnessFiles.map((f) => sha(f)).join("")).digest("hex");

/** The declared state of a cell, from structure alone. */
function stateOf(r) {
  const d = r.domSignals || {};
  const declared = d.asyncStates || [];
  if (declared.length) return declared.join("+");
  if (r.httpState === 404) return "not-found (document)";
  if (d.ariaBusy || Number(d.progressbars || 0) > 0) return "loading";
  if (Number(d.alerts || 0) > 0) return "alert";
  return "ready";
}

/** Which bucket a cell belongs in for a human reviewer. */
function group(r) {
  const s = stateOf(r);
  if (s.includes("auth-required")) return "auth-required";
  // PHASE 107 STAGE 6-A — these must be checked BEFORE the fallthrough, or 30
  // cells that correctly say "select an organization" get counted as `ready`
  // and the pack quietly under-reports the very state this stage created.
  if (s.includes("org-context-required")) return "org-context-required";
  if (s.includes("site-context-required")) return "site-context-required";
  if (s.includes("forbidden")) return "forbidden";
  if (s.includes("not-found")) return "not-found";
  if (s.includes("server-error")) return "server-error";
  if (s.includes("network-error")) return "network-error";
  if (s.includes("empty")) return "empty";
  if (s.includes("loading")) return "loading";
  return "ready";
}

/* ── manifest ─────────────────────────────────────────────────────────────── */
const manifest = {
  phase: "107",
  stage: "6-A",
  generatedAt: new Date().toISOString(),
  harnessVersionSha256: harnessVersion,
  harnessFiles: Object.fromEntries(harnessFiles.map((f) => [f, sha(f)])),
  authMethod: "REAL_FORM_LOGIN",
  authBypassUsed: false,
  cookieInjection: false,
  credentialExposure: 0,
  cells: recs.length,
  manifest: recs.map((r) => ({
    route: r.route, locale: r.locale, viewport: r.viewport,
    requestedUrl: r.requestedUrl, finalUrl: r.finalUrl, httpState: r.httpState,
    accessState: r.accessState, finalLocationCheck: r.finalLocationCheck,
    asyncState: stateOf(r), group: group(r),
    dir: r.domSignals?.dir, h1Count: r.domSignals?.h1Count,
    hOverflow: r.domSignals?.hOverflow,
    clipped: (r.domSignals?.clipped || []).length,
    brokenImages: (r.domSignals?.brokenImages || []).length,
    controlsNoName: r.domSignals?.controlsNoName,
    hiddenFocusable: r.domSignals?.hiddenFocusable,
    recoveryControls: r.domSignals?.recoveryControls,
    consentDialog: r.domSignals?.consentDialog,
    consoleByOrigin: (r.consoleErrors || []).reduce((acc, e) => {
      const o = attributeConsoleError(e); acc[o] = (acc[o] || 0) + 1; return acc;
    }, {}),
    screenshot: r.screenshotFile, screenshotSha256: r.screenshotSha256,
    runId: r.runId,
  })),
};
fs.writeFileSync(path.join(DIR, "STAGE6A-EVIDENCE-MANIFEST.json"), JSON.stringify(manifest, null, 2));

/* ── coverage index ───────────────────────────────────────────────────────── */
const routes = [...new Set(recs.map((r) => r.route))].sort();
const locales = [...new Set(recs.map((r) => r.locale))];
const viewports = [...new Set(recs.map((r) => r.viewport))];
const coverage = [
  "# Stage 6-A — Coverage Index", "",
  `${routes.length} routes × ${locales.length} locales × ${viewports.length} viewports = **${recs.length} cells**`, "",
  `harness version: \`${harnessVersion.slice(0, 16)}…\``, "",
  "| route | " + locales.flatMap((l) => viewports.map((v) => `${l} ${v}`)).join(" | ") + " |",
  "|---|" + locales.flatMap(() => viewports.map(() => "---")).join("|") + "|",
  ...routes.map((route) => {
    const cells = locales.flatMap((l) => viewports.map((v) => {
      const r = recs.find((x) => x.route === route && x.locale === l && x.viewport === v);
      return r ? `${r.httpState} ${group(r)}` : "MISSING";
    }));
    return `| \`${route}\` | ${cells.join(" | ")} |`;
  }),
].join("\n");
fs.writeFileSync(path.join(DIR, "STAGE6A-COVERAGE-INDEX.md"), coverage);

/* ── human review index ───────────────────────────────────────────────────── */
const GROUPS = ["auth-required", "org-context-required", "site-context-required", "forbidden", "not-found", "server-error", "network-error", "empty", "loading", "ready"];
const review = ["# Stage 6-A — Human Review Index", "",
  "Grouped by the state each page DECLARES, not by the words on it.", ""];
for (const g of GROUPS) {
  const inGroup = manifest.manifest.filter((c) => c.group === g);
  review.push(`## ${g} — ${inGroup.length} cell(s)`, "");
  for (const c of inGroup.slice(0, 30)) {
    review.push(`- \`${c.route}\` ${c.locale} ${c.viewport} — HTTP ${c.httpState}, recovery controls: ${c.recoveryControls ?? 0} — \`${c.screenshot}\``);
  }
  if (inGroup.length > 30) review.push(`- …and ${inGroup.length - 30} more`);
  review.push("");
}
review.push("## RTL (fa)", "", ...manifest.manifest.filter((c) => c.locale === "fa" && c.dir === "rtl").slice(0, 10)
  .map((c) => `- \`${c.route}\` ${c.viewport} — dir=${c.dir}, overflow ${c.hOverflow}px`), "");
review.push("## German long copy (de)", "", ...manifest.manifest.filter((c) => c.locale === "de").slice(0, 10)
  .map((c) => `- \`${c.route}\` ${c.viewport} — clipped ${c.clipped}, overflow ${c.hOverflow}px`), "");
review.push("## mobile (390×844)", "", ...manifest.manifest.filter((c) => c.viewport.startsWith("390")).slice(0, 10)
  .map((c) => `- \`${c.route}\` ${c.locale} — overflow ${c.hOverflow}px`), "");
review.push("## desktop (1440×900)", "", ...manifest.manifest.filter((c) => c.viewport.startsWith("1440")).slice(0, 10)
  .map((c) => `- \`${c.route}\` ${c.locale} — overflow ${c.hOverflow}px`), "");
fs.writeFileSync(path.join(DIR, "STAGE6A-HUMAN-REVIEW-INDEX.md"), review.join("\n"));

/* ── async state report ───────────────────────────────────────────────────── */
const stateTally = new Map();
for (const c of manifest.manifest) stateTally.set(c.group, (stateTally.get(c.group) ?? 0) + 1);
const asyncReport = ["# Stage 6-A — Async State Report", "",
  "Every cell's state, read from accessibility roles, `aria-busy` and the product's",
  "own `data-async-state`. No page text is consulted: the Stage 5 detector searched",
  "for /error|failed|خطا|fehler/ and so reported 27 correct OT cells as defects.", "",
  "| state | cells |", "|---|---|",
  ...[...stateTally].sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), "",
  "## Per route", "", "| route | locale | viewport | HTTP | declared state | recovery |", "|---|---|---|---|---|---|",
  ...manifest.manifest.map((c) => `| \`${c.route}\` | ${c.locale} | ${c.viewport} | ${c.httpState} | ${c.asyncState} | ${c.recoveryControls ?? 0} |`),
].join("\n");
fs.writeFileSync(path.join(DIR, "STAGE6A-ASYNC-STATE-REPORT.md"), asyncReport);

console.log(`evidence pack written to ${DIR}`);
console.log(`  cells:            ${recs.length}`);
console.log(`  harness version:  ${harnessVersion.slice(0, 16)}…`);
console.log("  state distribution:");
for (const [k, v] of [...stateTally].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(3)}  ${k}`);

/**
 * Phase 107 Stage 6-A.1 — stop promising a selector that does not exist.
 *
 * The OT copy said "Select an organization" and "Choose an organization to load
 * its OT estate". The product has no organization selector anywhere — a search
 * for one found nothing — so the instruction was impossible to follow. Telling a
 * stuck operator to do something they cannot do is only marginally better than
 * telling them to sign in again, which is the defect this whole stage exists to
 * close.
 *
 * The replacement states the situation and names the person who can change it.
 * The SITE copy is untouched: the OT list pages do have a real site filter, so
 * asking for a site selection is a truthful instruction there.
 *
 * Only VALUES change, never keys, so the catalogue leaf counts are unaffected.
 *
 * Usage: node docs/design/stage6a/fix-ot-org-copy.mjs
 */
import fs from "node:fs";

const COPY = {
  en: {
    orgContextTitle: "No organization context",
    orgContextBody: "You are signed in, but no active organization context is available for this account. Ask an administrator to add you to an organization.",
  },
  fa: {
    orgContextTitle: "زمینهٔ سازمانی در دسترس نیست",
    orgContextBody: "شما وارد شده‌اید، اما هیچ زمینهٔ سازمانی فعالی برای این حساب در دسترس نیست. از مدیر سامانه بخواهید شما را به یک سازمان اضافه کند.",
  },
  de: {
    orgContextTitle: "Kein Organisationskontext",
    orgContextBody: "Sie sind angemeldet, aber für dieses Konto ist kein aktiver Organisationskontext verfügbar. Bitten Sie die Administration, Sie einer Organisation hinzuzufügen.",
  },
};

/** The character span of one top-level namespace, so the edit cannot stray. */
function spanOf(src, key) {
  const start = src.indexOf(`\n  "${key}": {`);
  if (start === -1) throw new Error(`namespace ${key} not found`);
  let depth = 0;
  let i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return [start, i + 1];
  }
  throw new Error(`namespace ${key} is unterminated`);
}

for (const [locale, copy] of Object.entries(COPY)) {
  const file = `messages/${locale}.json`;
  const src = fs.readFileSync(file, "utf8");
  const before = JSON.parse(src);
  const leavesBefore = Object.keys(before.otEdge.states).length;

  const [start, end] = spanOf(src, "otEdge");
  let region = src.slice(start, end);

  for (const [key, value] of Object.entries(copy)) {
    // Replace the VALUE only, matched from the key so no other leaf can move.
    const re = new RegExp(`("${key}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
    if (!re.test(region)) throw new Error(`${file}: ${key} not found inside otEdge`);
    region = region.replace(re, `$1${JSON.stringify(value)}`);
  }

  const next = src.slice(0, start) + region + src.slice(end);
  const after = JSON.parse(next);
  const leavesAfter = Object.keys(after.otEdge.states).length;
  if (leavesAfter !== leavesBefore) throw new Error(`${file}: leaf count moved ${leavesBefore} → ${leavesAfter}`);

  fs.writeFileSync(file, next);
  console.log(`${locale}: values updated, otEdge.states leaves unchanged (${leavesAfter})`);
  console.log(`   ${after.otEdge.states.orgContextTitle}`);
}

/* ── the catalogue gates this repository already enforces ─────────────────── */
const problems = [];
for (const locale of ["en", "fa", "de"]) {
  const m = JSON.parse(fs.readFileSync(`messages/${locale}.json`, "utf8"));
  const values = [m.otEdge.states.orgContextTitle, m.otEdge.states.orgContextBody].join(" ");

  if (locale === "fa") {
    // Arabic yeh/kaf must never appear in Persian copy.
    if (/[يك]/.test(values)) problems.push("fa: Arabic ي or ك present");
    // ZWNJ is how Persian joins a prefix to its word; its absence is a defect
    // in text that needs it. "شما وارد شده‌اید" carries one.
    if (!/‌/.test(values)) problems.push("fa: no ZWNJ in text that needs it");
  }
  if (locale === "de" && !/[äöüßÄÖÜ]/.test(values)) problems.push("de: no German diacritics — suspicious");
}

const keys = (l) => Object.keys(JSON.parse(fs.readFileSync(`messages/${l}.json`, "utf8")).otEdge.states).sort().join(",");
const [en, fa, de] = ["en", "fa", "de"].map(keys);
if (en !== fa || en !== de) problems.push("otEdge.states key parity broken");

console.log("");
console.log(`catalogue gates: ${problems.length === 0 ? "clean" : problems.join("; ")}`);
process.exit(problems.length ? 1 : 0);

/**
 * Phase 107 Stage 6-A — copy for the context refusals on the non-OT surfaces.
 *
 * Billing and the API-key dashboard were telling a signed-in administrator that
 * their session had ended. These four leaves per locale say what is actually
 * missing and what to do — and never suggest signing in again, because the
 * reader already is.
 *
 * Inserted textually at a key unique to `errors.resource`; the catalogues are
 * CRLF with mixed historical indentation, so re-serializing would rewrite
 * thousands of unrelated lines.
 *
 * Usage: node docs/design/stage6a/add-context-resource-messages.mjs
 */
import fs from "node:fs";

const COPY = {
  en: {
    orgContextTitle: "No organization is available",
    orgContextHint: "You are signed in, but this account is not an active member of any organization. Ask an administrator to add you, or select a different organization — signing in again will not change this.",
    siteContextTitle: "Select a site",
    siteContextHint: "You are signed in, but no site is selected. Choose a site to load its data.",
  },
  fa: {
    orgContextTitle: "سازمانی در دسترس نیست",
    orgContextHint: "شما وارد شده‌اید، اما این حساب عضو فعال هیچ سازمانی نیست. از مدیر سامانه بخواهید شما را اضافه کند یا سازمان دیگری انتخاب کنید؛ ورود دوباره چیزی را تغییر نمی‌دهد.",
    siteContextTitle: "یک سایت انتخاب کنید",
    siteContextHint: "شما وارد شده‌اید، اما سایتی انتخاب نشده است. برای بارگذاری داده‌ها یک سایت انتخاب کنید.",
  },
  de: {
    orgContextTitle: "Keine Organisation verfügbar",
    orgContextHint: "Sie sind angemeldet, aber dieses Konto ist in keiner Organisation aktives Mitglied. Bitten Sie die Administration, Sie hinzuzufügen, oder wählen Sie eine andere Organisation — eine erneute Anmeldung ändert daran nichts.",
    siteContextTitle: "Standort auswählen",
    siteContextHint: "Sie sind angemeldet, aber es ist kein Standort ausgewählt. Wählen Sie einen Standort, um die Daten zu laden.",
  },
};

/** The character span of one top-level object, so the edit cannot stray. */
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
  const eol = src.includes("\r\n") ? "\r\n" : "\n";

  if (src.includes('"orgContextHint"')) { console.log(`${locale}: already present, skipped`); continue; }

  const [start, end] = spanOf(src, "errors");
  const errors = src.slice(start, end);

  // A leaf that exists only in errors.resource.
  const anchor = `      "unauthenticatedTitle":`;
  const hits = errors.split(anchor).length - 1;
  if (hits !== 1) throw new Error(`${file}: anchor matched ${hits}× inside errors`);

  const block = Object.entries(copy)
    .map(([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join(eol);

  const next = src.slice(0, start) + errors.replace(anchor, `${block}${eol}${anchor}`) + src.slice(end);
  JSON.parse(next);
  fs.writeFileSync(file, next);

  const leaves = Object.keys(JSON.parse(next).errors.resource).length;
  console.log(`${locale}: +${Object.keys(copy).length} leaves, errors.resource now ${leaves}`);
}

const keys = (l) => Object.keys(JSON.parse(fs.readFileSync(`messages/${l}.json`, "utf8")).errors.resource).sort().join(",");
const [en, fa, de] = ["en", "fa", "de"].map(keys);
console.log(`\nerrors.resource parity  en=fa ${en === fa}  en=de ${en === de}`);

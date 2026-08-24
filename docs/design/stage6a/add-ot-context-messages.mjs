/**
 * Phase 107 Stage 6-A — copy for the OT context states.
 *
 * A signed-in operator whose organization is not selected was being told their
 * session had ended. These six leaves per locale say what is actually missing
 * and what to do about it, and keep "no organization selected", "no site
 * selected" and "no connection" apart from one another and from a real 401.
 *
 * The catalogues are CRLF with mixed historical indentation, so the block is
 * inserted textually at one anchor and the result is parsed to prove it is
 * still valid JSON.
 *
 * Usage: node docs/design/stage6a/add-ot-context-messages.mjs
 */
import fs from "node:fs";

const COPY = {
  en: {
    orgContextTitle: "Select an organization",
    orgContextBody: "You are signed in, but no organization is selected for this session. Choose an organization to load its OT estate.",
    siteContextTitle: "Select a site",
    siteContextBody: "You are signed in, but no site is selected. Choose a site to load its gateways and devices.",
    offlineTitle: "No connection to the server",
    offlineBody: "The request never reached Hermes. Check your network connection and try again.",
  },
  fa: {
    orgContextTitle: "یک سازمان انتخاب کنید",
    orgContextBody: "شما وارد شده‌اید، اما برای این نشست سازمانی انتخاب نشده است. برای بارگذاری دارایی‌های OT، یک سازمان انتخاب کنید.",
    siteContextTitle: "یک سایت انتخاب کنید",
    siteContextBody: "شما وارد شده‌اید، اما سایتی انتخاب نشده است. برای بارگذاری گیت‌وی‌ها و دستگاه‌ها، یک سایت انتخاب کنید.",
    offlineTitle: "ارتباط با سرور برقرار نشد",
    offlineBody: "درخواست هرگز به هرمس نرسید. اتصال شبکهٔ خود را بررسی کنید و دوباره تلاش کنید.",
  },
  de: {
    orgContextTitle: "Organisation auswählen",
    orgContextBody: "Sie sind angemeldet, aber für diese Sitzung ist keine Organisation ausgewählt. Wählen Sie eine Organisation, um deren OT-Bestand zu laden.",
    siteContextTitle: "Standort auswählen",
    siteContextBody: "Sie sind angemeldet, aber es ist kein Standort ausgewählt. Wählen Sie einen Standort, um dessen Gateways und Geräte zu laden.",
    offlineTitle: "Keine Verbindung zum Server",
    offlineBody: "Die Anfrage hat Hermes nie erreicht. Prüfen Sie Ihre Netzwerkverbindung und versuchen Sie es erneut.",
  },
};

for (const [locale, copy] of Object.entries(COPY)) {
  const file = `messages/${locale}.json`;
  const src = fs.readFileSync(file, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";

  if (src.includes('"orgContextTitle"')) { console.log(`${locale}: already present, skipped`); continue; }

  /*
   * A key that exists ONLY in otEdge.states. `unauthenticatedTitle` was the
   * obvious choice and the wrong one: `errors.resource` has a leaf of the same
   * name at the same indentation, so the anchor matched twice and the edit was
   * refused rather than landing in the wrong namespace.
   */
  const anchor = `      "emptyGatewaysTitle":`;
  const hits = src.split(anchor).length - 1;
  if (hits !== 1) throw new Error(`${file}: anchor matched ${hits}×, refusing to edit`);

  const block = Object.entries(copy)
    .map(([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join(eol);

  const next = src.replace(anchor, `${block}${eol}${anchor}`);
  JSON.parse(next); // never write a broken catalogue
  fs.writeFileSync(file, next);

  const leaves = Object.keys(JSON.parse(next).otEdge.states).length;
  console.log(`${locale}: +${Object.keys(copy).length} leaves, otEdge.states now ${leaves}`);
}

const shape = (l) => Object.keys(JSON.parse(fs.readFileSync(`messages/${l}.json`, "utf8")).otEdge.states).sort().join(",");
const [en, fa, de] = ["en", "fa", "de"].map(shape);
console.log(`\nkey parity  en=fa ${en === fa}  en=de ${en === de}`);

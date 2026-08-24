/**
 * Phase 107 Stage 6-A — add the localized copy for resource failure states.
 *
 * The message catalogues have mixed indentation across their history, so
 * re-serializing them with JSON.stringify would rewrite thousands of unrelated
 * lines. This inserts the new block TEXTUALLY at one anchor and then parses the
 * result to prove the file is still valid JSON.
 *
 * The copy deliberately gives each failure its own words. "Your session has
 * ended" and "you do not have access" call for different actions from the
 * reader, and neither may look like "there is nothing here" — that conflation
 * is the defect Stage 6-A exists to close.
 *
 * Usage: node docs/design/stage6a/add-resource-messages.mjs
 */
import fs from "node:fs";

const COPY = {
  en: {
    unauthenticatedTitle: "Your session has ended",
    unauthenticatedHint: "Sign in again to load this data. Nothing is shown rather than presenting an incomplete or outdated view.",
    forbiddenTitle: "You do not have access to this data",
    forbiddenHint: "Your account is signed in but does not have permission for this record. Ask your administrator to grant access.",
    notFoundTitle: "This record no longer exists",
    notFoundHint: "It may have been deleted or moved. Return to the list to see what is currently available.",
    invalidTitle: "The request could not be processed",
    invalidHint: "The server rejected the parameters for this view. Reload the page, and report it if it happens again.",
    rateLimitedTitle: "Too many requests",
    rateLimitedHint: "This view was refreshed too often. Wait a moment before trying again.",
    unavailableTitle: "The service is temporarily unavailable",
    unavailableHint: "The server is not answering requests right now. This is usually brief — try again shortly.",
    offlineTitle: "No connection to the server",
    offlineHint: "The request never reached Hermes. Check your network connection and try again.",
    failedTitle: "This data could not be loaded",
    failedHint: "The server replied unexpectedly, so nothing is shown rather than presenting unverified data.",
    retry: "Try again",
    signIn: "Sign in again",
  },
  fa: {
    unauthenticatedTitle: "نشست شما پایان یافته است",
    unauthenticatedHint: "برای بارگذاری این داده‌ها دوباره وارد شوید. به‌جای نمایش نمایی ناقص یا قدیمی، چیزی نشان داده نمی‌شود.",
    forbiddenTitle: "به این داده‌ها دسترسی ندارید",
    forbiddenHint: "حساب شما وارد شده است اما مجوز دیدن این رکورد را ندارد. از مدیر سامانه درخواست دسترسی کنید.",
    notFoundTitle: "این رکورد دیگر وجود ندارد",
    notFoundHint: "ممکن است حذف یا جابه‌جا شده باشد. برای دیدن موارد موجود به فهرست بازگردید.",
    invalidTitle: "درخواست پردازش نشد",
    invalidHint: "سرور پارامترهای این نما را نپذیرفت. صفحه را دوباره بارگذاری کنید و اگر تکرار شد گزارش دهید.",
    rateLimitedTitle: "درخواست‌های بیش از حد",
    rateLimitedHint: "این نما بیش از اندازه به‌روزرسانی شد. کمی صبر کنید و دوباره تلاش کنید.",
    unavailableTitle: "سرویس موقتاً در دسترس نیست",
    unavailableHint: "سرور در حال حاضر به درخواست‌ها پاسخ نمی‌دهد. این وضعیت معمولاً کوتاه است؛ کمی بعد دوباره تلاش کنید.",
    offlineTitle: "ارتباط با سرور برقرار نشد",
    offlineHint: "درخواست هرگز به هرمس نرسید. اتصال شبکهٔ خود را بررسی کنید و دوباره تلاش کنید.",
    failedTitle: "این داده‌ها بارگذاری نشد",
    failedHint: "سرور پاسخی غیرمنتظره داد؛ به‌جای نمایش دادهٔ تأییدنشده، چیزی نشان داده نمی‌شود.",
    retry: "تلاش دوباره",
    signIn: "ورود دوباره",
  },
  de: {
    unauthenticatedTitle: "Ihre Sitzung ist abgelaufen",
    unauthenticatedHint: "Melden Sie sich erneut an, um diese Daten zu laden. Es wird nichts angezeigt, statt eine unvollständige oder veraltete Ansicht darzustellen.",
    forbiddenTitle: "Kein Zugriff auf diese Daten",
    forbiddenHint: "Ihr Konto ist angemeldet, hat aber keine Berechtigung für diesen Datensatz. Bitten Sie die Administration um Zugriff.",
    notFoundTitle: "Dieser Datensatz existiert nicht mehr",
    notFoundHint: "Er wurde möglicherweise gelöscht oder verschoben. Kehren Sie zur Liste zurück, um die derzeit verfügbaren Einträge zu sehen.",
    invalidTitle: "Die Anfrage konnte nicht verarbeitet werden",
    invalidHint: "Der Server hat die Parameter dieser Ansicht abgelehnt. Laden Sie die Seite neu und melden Sie es, falls es erneut auftritt.",
    rateLimitedTitle: "Zu viele Anfragen",
    rateLimitedHint: "Diese Ansicht wurde zu häufig aktualisiert. Warten Sie einen Moment, bevor Sie es erneut versuchen.",
    unavailableTitle: "Der Dienst ist vorübergehend nicht verfügbar",
    unavailableHint: "Der Server beantwortet derzeit keine Anfragen. Das dauert meist nur kurz — versuchen Sie es in Kürze erneut.",
    offlineTitle: "Keine Verbindung zum Server",
    offlineHint: "Die Anfrage hat Hermes nie erreicht. Prüfen Sie Ihre Netzwerkverbindung und versuchen Sie es erneut.",
    failedTitle: "Diese Daten konnten nicht geladen werden",
    failedHint: "Der Server hat unerwartet geantwortet. Es wird nichts angezeigt, statt ungeprüfte Daten darzustellen.",
    retry: "Erneut versuchen",
    signIn: "Erneut anmelden",
  },
};

/**
 * The end of the top-level `errors` namespace, immediately before `otEdge`.
 * The two-space indentation is what makes this unique: there is a nested
 * `otEdge` deeper in the file, indented six spaces.
 *
 * These catalogues are stored with CRLF endings, and MSYS tools strip the CR
 * when you look at them, so the anchor is built from the file's OWN endings
 * rather than from an assumption about them.
 */
const anchorFor = (eol) => `    }${eol}  },${eol}  "otEdge": {`;

for (const [locale, copy] of Object.entries(COPY)) {
  const file = `messages/${locale}.json`;
  const src = fs.readFileSync(file, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";

  if (src.includes("\"resource\": {")) {
    console.log(`${locale}: already present, skipped`);
    continue;
  }
  const ANCHOR = anchorFor(eol);
  const hits = src.split(ANCHOR).length - 1;
  if (hits !== 1) throw new Error(`${file}: anchor matched ${hits} times, refusing to edit`);

  const body = Object.entries(copy)
    .map(([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(`,${eol}`);
  const block = [
    "    },",
    '    "resource": {',
    body,
    "    }",
    "  },",
    '  "otEdge": {',
  ].join(eol);

  const next = src.replace(ANCHOR, block);
  JSON.parse(next); // fail loudly rather than write a broken catalogue
  fs.writeFileSync(file, next);

  const leaves = Object.keys(JSON.parse(next).errors.resource).length;
  console.log(`${locale}: +${leaves} leaves under errors.resource`);
}

/* Every locale must carry the same keys, or the German gate will say so later. */
const shape = (l) => Object.keys(JSON.parse(fs.readFileSync(`messages/${l}.json`, "utf8")).errors.resource).sort().join(",");
const [en, fa, de] = ["en", "fa", "de"].map(shape);
console.log(`\nkey parity  en=fa ${en === fa}  en=de ${en === de}`);

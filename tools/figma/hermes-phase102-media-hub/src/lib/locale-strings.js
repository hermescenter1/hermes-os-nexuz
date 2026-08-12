// @ts-check
'use strict'
/**
 * Tri-locale (EN/FA/DE) copy for the Phase 102 Screens page.
 *
 * IMPORTANT — provenance (unlike the Phase 87 design-system plugin's
 * locale-strings.js, which copies EXISTING repository catalog strings
 * verbatim): the ADR (`docs/phase102/architecture.md` §1) establishes that
 * **Phase 102 video functionality does not exist yet** — there is no
 * `mediaHub` namespace in `messages/{en,fa,de}.json` to source from. Every
 * string below is therefore ORIGINAL DESIGN COPY, written for this Figma file
 * only, in the exact register the future `mediaHub` i18n namespace should
 * use. It is NOT a substitute for real translation work and must never be
 * copied verbatim into `messages/*.json` without the normal localisation
 * review CLAUDE.md requires for shipped UI strings.
 *
 * Persian uses ی/ک (never ي/ك) throughout, per CLAUDE.md.
 */

/** @type {Record<string, {en:string, fa:string, de:string}>} */
const STRINGS = {
  // Screen headings
  libraryHeading: { en: 'Video Library', fa: 'کتابخانه ویدیو', de: 'Video-Bibliothek' },
  searchHeading: { en: 'Search Results', fa: 'نتایج جستجو', de: 'Suchergebnisse' },
  searchQueryNote: { en: 'Results for “bearing vibration”', fa: 'نتایج برای «ارتعاش یاتاقان»', de: 'Ergebnisse für „Lagervibration“' },
  watchRelatedHeading: { en: 'Related videos', fa: 'ویدیوهای مرتبط', de: 'Ähnliche Videos' },
  instructorCoursesHeading: { en: 'Courses by this instructor', fa: 'دوره‌های این مدرس', de: 'Kurse dieses Dozenten' },
  continueHeading: { en: 'Continue Watching', fa: 'ادامه تماشا', de: 'Weiterschauen' },
  favouritesHeading: { en: 'Favourites', fa: 'موردعلاقه‌ها', de: 'Favoriten' },
  uploadHeading: { en: 'Upload Video', fa: 'بارگذاری ویدیو', de: 'Video hochladen' },
  moderationHeading: { en: 'Moderation queue', fa: 'صف بازبینی', de: 'Moderationswarteschlange' },

  // Representative instance copy (proves RTL + long-word wrapping)
  videoTitle: { en: 'Root cause analysis: bearing failure', fa: 'تحلیل ریشه‌ای خرابی: نقص یاتاقان', de: 'Ursachenanalyse: Lagerausfall' },
  videoMeta: { en: 'A. Karimi · Intermediate · Rotating Equipment', fa: 'آ. کریمی · سطح متوسط · تجهیزات دوار', de: 'A. Karimi · Mittelstufe · Rotierende Anlagen' },
  relatedTitle: { en: 'Related: Alignment tolerances', fa: 'مرتبط: تلورانس‌های هم‌ترازی', de: 'Verwandt: Ausrichtungstoleranzen' },
  relatedMeta: { en: 'B. Rahimi · Beginner', fa: 'ب. رحیمی · سطح مقدماتی', de: 'B. Rahimi · Einsteiger' },
  instructorName: { en: 'Dr. Sara Ahmadi', fa: 'دکتر سارا احمدی', de: 'Dr. Sara Ahmadi' },
  instructorRole: { en: 'Senior Process Engineer', fa: 'مهندس ارشد فرایند', de: 'Leitende Verfahrenstechnikerin' },
  instructorBio: { en: 'Instructor biography that must remain readable when translated into longer Persian or German sentences.', fa: 'شرح‌حال مدرس که باید حتی در جمله‌های فارسی یا آلمانی طولانی‌تر همچنان خوانا بماند.', de: 'Dozentenbiografie, die auch bei längeren deutschen oder persischen Sätzen lesbar bleiben muss.' },
  searchPlaceholder: { en: 'Search videos, chapters, transcripts…', fa: 'جست‌وجوی ویدیو، فصل، متن پیاده‌شده…', de: 'Videos, Kapitel, Transkripte durchsuchen…' },
  filterLevel: { en: 'Level: Intermediate', fa: 'سطح: متوسط', de: 'Stufe: Mittelstufe' },
  categoryIndustrial: { en: 'Rotating Equipment', fa: 'تجهیزات دوار', de: 'Rotierende Anlagen' },
  continueTitle: { en: 'Resume: root cause analysis', fa: 'ازسرگیری: تحلیل ریشه‌ای', de: 'Fortsetzen: Ursachenanalyse' },
  continueTrail: { en: '12 min left', fa: '۱۲ دقیقه باقی‌مانده', de: 'Noch 12 Min.' },
  favouritesEmptyTitle: { en: 'No favourites yet', fa: 'هنوز موردعلاقه‌ای ندارید', de: 'Noch keine Favoriten' },
  favouritesEmptyBody: { en: 'Videos you save will appear here for quick access later.', fa: 'ویدیوهایی که ذخیره می‌کنید برای دسترسی سریع در اینجا نمایش داده می‌شوند.', de: 'Gespeicherte Videos erscheinen hier für den schnellen späteren Zugriff.' },
  uploadStep1: { en: 'Upload file', fa: 'بارگذاری فایل', de: 'Datei hochladen' },
  uploadStep2: { en: 'Details', fa: 'جزئیات', de: 'Details' },
  uploadStep3: { en: 'Review', fa: 'بازبینی', de: 'Überprüfung' },
  uploadStep4: { en: 'Published', fa: 'منتشرشده', de: 'Veröffentlicht' },
  reviewTitle: { en: 'Pending review', fa: 'در انتظار بازبینی', de: 'Ausstehende Überprüfung' },
  reviewBody: { en: 'Submitted by the author; verify accuracy and safety guidance before publishing.', fa: 'ازسوی نویسنده ارسال شده است؛ پیش از انتشار، صحت و راهنمای ایمنی را بررسی کنید.', de: 'Vom Autor eingereicht; Genauigkeit und Sicherheitshinweise vor der Veröffentlichung prüfen.' },
  publishDialogTitle: { en: 'Publish this video?', fa: 'این ویدیو منتشر شود؟', de: 'Dieses Video veröffentlichen?' },
  publishDialogBody: { en: 'It will become visible to everyone with library access.', fa: 'این ویدیو برای همهٔ افراد دارای دسترسی به کتابخانه قابل‌مشاهده خواهد شد.', de: 'Es wird für alle mit Bibliothekszugriff sichtbar.' },
}

/** @type {ReadonlyArray<'en'|'fa'|'de'>} */
const LOCALES = ['en', 'fa', 'de']

/** RTL locales (FA only; EN/DE are LTR). */
const RTL_LOCALES = new Set(['fa'])

/**
 * @param {keyof typeof STRINGS} id
 * @param {'en'|'fa'|'de'} locale
 * @returns {string}
 */
function str(id, locale) {
  const entry = STRINGS[id]
  if (!entry) throw new Error('unknown locale string: ' + String(id))
  return entry[locale]
}

module.exports = { STRINGS, LOCALES, RTL_LOCALES, str }

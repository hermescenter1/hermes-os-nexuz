// @ts-check
'use strict'
/**
 * Tri-locale (EN/FA/DE) string snapshot for the native reference assemblies.
 *
 * Every value is copied VERBATIM from the repository's real translation
 * catalogs (`messages/en.json`, `messages/fa.json`, `messages/de.json`) at the
 * recorded key path — never machine-invented copy. The test suite re-reads the
 * catalogs and asserts each snapshot value still matches byte-for-byte, so any
 * catalog change fails the build until this snapshot is refreshed.
 *
 * `deGenuine: false` marks the ONE key whose German catalog value is currently
 * an English carryover in the repository itself (`copilot.title` renders
 * "Industrial Copilot" for DE users today). Using it is repo-accurate; flagging
 * it keeps the honesty contract (no silent English placeholders).
 */

/** @type {Record<string, {key:string, en:string, fa:string, de:string, deGenuine:boolean}>} */
const STRINGS = {
  heroHeadlineA: { key: 'publicSite.hero.headlineA', en: 'Industrial Intelligence.', fa: 'هوش صنعتی؛', de: 'Industrielle Intelligenz.', deGenuine: true },
  heroHeadlineB: { key: 'publicSite.hero.headlineB', en: 'Engineered for Action.', fa: 'از شواهد تا اقدام ایمن', de: 'Entwickelt für sicheres Handeln.', deGenuine: true },
  heroLede: { key: 'publicSite.hero.lede', en: 'Transform industrial evidence, engineering knowledge, and operational data into explainable decisions and safe action paths.', fa: 'شواهد صنعتی، دانش مهندسی و داده‌های عملیاتی را به تصمیم‌های قابل‌توضیح و مسیرهای اقدام ایمن تبدیل کنید.', de: 'Verwandeln Sie industrielle Evidenz, Engineering-Wissen und Betriebsdaten in nachvollziehbare Entscheidungen und sichere Maßnahmenpfade.', deGenuine: true },
  requestDemo: { key: 'publicSite.hero.requestDemo', en: 'Request a Demo', fa: 'درخواست دمو', de: 'Demo anfragen', deGenuine: true },
  explorePlatform: { key: 'publicSite.hero.explorePlatform', en: 'Explore the Platform', fa: 'کاوش پلتفرم', de: 'Plattform entdecken', deGenuine: true },
  platformTitle: { key: 'platform.title', en: 'One surface for the people who run the plant.', fa: 'یک سطح برای کسانی که کارخانه را اداره می‌کنند.', de: 'Eine Oberfläche für die Menschen, die die Anlage betreiben.', deGenuine: true },
  loginTitle: { key: 'auth.loginTitle', en: 'Sign in to Hermes OS', fa: 'ورود به هرمس‌اواس', de: 'Bei Hermes OS anmelden', deGenuine: true },
  email: { key: 'auth.email', en: 'Email', fa: 'ایمیل', de: 'E-Mail', deGenuine: true },
  password: { key: 'auth.password', en: 'Password', fa: 'گذرواژه', de: 'Passwort', deGenuine: true },
  rememberMe: { key: 'auth.rememberMe', en: 'Remember me', fa: 'مرا به خاطر بسپار', de: 'Angemeldet bleiben', deGenuine: true },
  signIn: { key: 'auth.submit', en: 'Sign in', fa: 'ورود', de: 'Anmelden', deGenuine: true },
  dashboardTitle: { key: 'dashboard.title', en: 'Factory Dashboard', fa: 'داشبورد کارخانه', de: 'Werksdashboard', deGenuine: true },
  copilotTitle: { key: 'copilot.title', en: 'Industrial Copilot', fa: 'کوپایلت صنعتی', de: 'Industrial Copilot', deGenuine: false },
  copilotPlaceholder: { key: 'copilot.placeholder', en: 'Describe the engineering problem — equipment, symptoms, vendor, alarms, recent changes…', fa: 'مسئلهٔ مهندسی را شرح دهید — تجهیز، نشانه‌ها، سازنده، هشدارها، تغییرات اخیر…', de: 'Beschreiben Sie das technische Problem — Anlage, Symptome, Hersteller, Alarme, kürzliche Änderungen…', deGenuine: true },
  copilotEmptyHint: { key: 'copilot.emptyHint', en: 'Enter a problem description to run the analysis.', fa: 'برای اجرای تحلیل، شرح مسئله را وارد کنید.', de: 'Geben Sie eine Problembeschreibung ein, um die Analyse zu starten.', deGenuine: true },
  brainTitle: { key: 'brain.title', en: 'Industrial engineering analysis', fa: 'تحلیل مهندسی صنعتی', de: 'Industrielle Engineering-Analyse', deGenuine: true },
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

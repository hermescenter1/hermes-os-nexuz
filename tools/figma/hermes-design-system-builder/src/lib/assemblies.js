// @ts-check
'use strict'
/**
 * Managed NATIVE REFERENCE ASSEMBLIES registry — TRI-LINGUAL.
 *
 * Six approved experiences × Desktop/Mobile × EN/FA/DE = 36 assemblies, each
 * built ONLY from component INSTANCES of the generated native component sets
 * (plus auto-layout containers and heading text). They live in a second managed
 * section and NEVER touch the 34 original unmanaged reference frames.
 *
 * Locale contract:
 *  - EN/FA assemblies map to the original reference frames recorded in
 *    docs/design/phase-87-closure/README.md §2 (originalRef = node id).
 *  - DE has NO original Figma reference — DE assemblies are NEWLY GENERATED
 *    managed assets (originalRef: null, newlyGenerated: true), composed from
 *    the approved component system and the repository's REAL German catalog
 *    strings (locale-strings.js, verbatim from messages/de.json — never
 *    invented copy; the single EN-carryover key is flagged there).
 *  - FA is RTL; EN and DE are LTR. DE strings include long compounds
 *    (e.g. "Werksdashboard", "Maßnahmenpfade") — heading styles drop to
 *    Heading/L on mobile and all body text wraps (fixed width, auto height),
 *    which the test suite checks with a longest-word width heuristic.
 *
 * Item shape (interpreted by the renderer):
 *   { family, variant?, props?, D }  component instance (+Direction when family has the axis)
 *   { heading: string, style }       plain heading text
 *   { row: Item[] }                  horizontal group (reversed under RTL)
 */

const { STRINGS, LOCALES, RTL_LOCALES, str } = require('./locale-strings')

/** Original reference node ids (closure README §2) — EN/FA only; DE has none. */
const ORIGINAL_REFS = Object.freeze({
  homepage: { desktopEn: '26:783', desktopFa: '28:941', mobileEn: '28:1001', mobileFa: '28:1032' },
  platform: { desktopEn: '28:1055', desktopFa: '29:1093', mobileEn: '30:1123', mobileFa: '30:1148' },
  login: { desktopEn: '30:1171', desktopFa: '30:1205', mobileEn: '30:1229', mobileFa: '30:1246' },
  copilot: { desktopEn: '30:1264', desktopFa: '30:1320', mobileEn: '30:1352', mobileFa: '30:1376' },
  dashboard: { desktopEn: '12:260', desktopFa: '24:632', mobileEn: '24:466', mobileFa: '25:733' },
  'industrial-brain': { desktopEn: '18:381', desktopFa: '24:672', mobileEn: '24:494', mobileFa: '25:760' },
})

/**
 * Item list for one experience+context+locale. All visible strings come from
 * the repository catalogs via locale-strings.js.
 * @param {string} exp @param {'desktop'|'mobile'} ctx @param {'en'|'fa'|'de'} l
 * @returns {any[]}
 */
function itemsFor(exp, ctx, l) {
  const mobile = ctx === 'mobile'
  const rtl = RTL_LOCALES.has(l)
  const D = rtl ? 'RTL' : 'LTR'
  const heroStyle = mobile ? 'Heading/L' : 'Display/XL'
  const headStyle = mobile ? 'Heading/M' : 'Heading/L'
  const inst = (family, variant, props, extra) => ({ family, variant: variant || {}, props: props || {}, D, ...(extra || {}) })

  switch (exp) {
    case 'homepage':
      return [
        inst('top-nav'),
        { heading: str('heroHeadlineA', l) + ' ' + str('heroHeadlineB', l), style: heroStyle },
        { heading: str('heroLede', l), style: 'Body/M' },
        { row: [inst('button', { Variant: 'Primary', State: 'Default' }, { Label: str('requestDemo', l) }), inst('button', { Variant: 'Secondary', State: 'Default' }, { Label: str('explorePlatform', l) })] },
        { row: [inst('card', { Elevation: 'E1' }), inst('card', { Elevation: 'E1' }), ...(mobile ? [] : [inst('card', { Elevation: 'E1' })])] },
        inst('language-selector', { Locale: l.toUpperCase(), State: 'Default' }),
      ]
    case 'platform':
      return [
        inst('top-nav'),
        { heading: str('platformTitle', l), style: headStyle },
        { row: [inst('kpi-card', { Trend: 'Up', State: 'Default' }), ...(mobile ? [] : [inst('kpi-card', { Trend: 'Flat', State: 'Default' }), inst('kpi-card', { Trend: 'Down', State: 'Default' })])] },
        inst('data-table', { Density: 'Comfortable', State: 'Default' }),
        inst('pagination', { State: 'Default' }),
      ]
    case 'login':
      return [
        { heading: str('loginTitle', l), style: headStyle },
        inst('input', { State: 'Default' }, { Label: str('email', l) }),
        inst('input', { State: 'Default' }, { Label: str('password', l) }),
        inst('checkbox', { Value: 'Checked', State: 'Default' }, { Label: str('rememberMe', l) }),
        inst('button', { Variant: 'Primary', State: 'Default' }, { Label: str('signIn', l) }),
        inst('alert', { Tone: 'Info' }, { Title: str('copilotEmptyHint', l) }),
      ]
    case 'copilot':
      return [
        inst('top-nav'),
        { heading: str('copilotTitle', l), style: headStyle },
        inst('search', { State: 'Default' }, { Placeholder: str('copilotPlaceholder', l) }),
        inst('insight-card', { Tone: 'Evidence' }),
        inst('insight-card', { Tone: 'Hypothesis' }),
        inst('empty-state', { Tone: 'Neutral' }, { Title: str('copilotEmptyHint', l) }),
      ]
    case 'dashboard':
      return [
        inst('top-nav'),
        ...(mobile ? [] : [{ row: [inst('sidebar', { State: 'Expanded' })], side: true }]),
        { heading: str('dashboardTitle', l), style: headStyle },
        { row: [inst('kpi-card', { Trend: 'Up', State: 'Default' }), inst('kpi-card', { Trend: 'Down', State: 'Default' }), ...(mobile ? [] : [inst('kpi-card', { Trend: 'Flat', State: 'Default' }), inst('kpi-card', { Trend: 'Up', State: 'Default' })])] },
        { row: [inst('status-indicator', { Status: 'Success' }), inst('status-indicator', { Status: 'Warning' }), ...(mobile ? [] : [inst('status-indicator', { Status: 'Danger' })])] },
        inst('data-table', { Density: mobile ? 'Compact' : 'Comfortable', State: 'Default' }),
      ]
    case 'industrial-brain':
      return [
        inst('top-nav'),
        { heading: str('brainTitle', l), style: headStyle },
        { row: [inst('industrial-signal-tile', { Status: 'Healthy' }), inst('industrial-signal-tile', { Status: 'Warning' }), ...(mobile ? [] : [inst('industrial-signal-tile', { Status: 'Fault' }), inst('industrial-signal-tile', { Status: 'Offline' })])] },
        inst('fault-hypothesis-card', { Confidence: 'High' }),
        { row: [inst('evidence-item', { Kind: 'Evidence' }), ...(mobile ? [] : [inst('evidence-item', { Kind: 'Contradiction' })])] },
        ...(mobile ? [] : [inst('evidence-item', { Kind: 'Missing' })]),
        inst('confidence-indicator', { Level: 'High' }),
        inst('safe-action-panel', { State: 'Ready' }),
        inst('timeline', { State: 'Default' }),
      ]
    default:
      throw new Error('unknown experience: ' + exp)
  }
}

const EXPERIENCES = Object.freeze(['homepage', 'platform', 'login', 'copilot', 'dashboard', 'industrial-brain'])
const CONTEXTS = /** @type {const} */ (['desktop', 'mobile'])

/**
 * The 36 assembly declarations (6 experiences × desktop/mobile × EN/FA/DE).
 * @returns {any[]}
 */
function buildAssemblies() {
  /** @type {any[]} */
  const out = []
  for (const exp of EXPERIENCES) {
    for (const ctx of CONTEXTS) {
      for (const l of LOCALES) {
        const hasOriginal = l === 'en' || l === 'fa'
        const refKey = ctx + (l === 'en' ? 'En' : 'Fa')
        out.push({
          key: 'assembly:' + exp + ':' + ctx + ':' + l,
          experience: exp,
          context: ctx,
          locale: l,
          rtl: RTL_LOCALES.has(l),
          width: ctx === 'desktop' ? 1200 : 390,
          name: 'Ref/' + exp + '/' + (ctx === 'desktop' ? 'Desktop' : 'Mobile') + '/' + l.toUpperCase() + (hasOriginal ? '' : ' · generated'),
          originalRef: hasOriginal ? ORIGINAL_REFS[exp][refKey] : null,
          newlyGenerated: !hasOriginal,
          items: itemsFor(exp, ctx, l),
        })
      }
    }
  }
  return out
}

module.exports = { buildAssemblies, ORIGINAL_REFS, EXPERIENCES, LOCALES, RTL_LOCALES, STRINGS, str }

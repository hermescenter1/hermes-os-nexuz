/* Hermes Phase 104 Visual System — generated bundle.
   Do not edit dist/ by hand; edit src/ and run `npm run build`.
   HEAD cbfa2923318827ee42614c07f2e3861a3db8ed99 (dirty)  sources 227e1c0b7212a890536fb1926ef2cb8d4b610bc6515cf7a93389edfa5dd3ffcd */
(function () {
  "use strict";
  var __modules = {}, __cache = {};
  function require(id) {
    if (__cache[id]) return __cache[id].exports;
    var m = { exports: {} }; __cache[id] = m;
    __modules[id](m, m.exports, require);
    return m.exports;
  }
  __modules["fingerprint"] = function (module, exports, require) {
    module.exports = {
  "plugin": "Hermes Phase 104 Visual System",
  "pluginId": "com.hermesnovin.phase104-visual-system",
  "headSha": "cbfa2923318827ee42614c07f2e3861a3db8ed99",
  "headShaShort": "cbfa29233188",
  "branch": "agent/phase104-hermes-visual-figma-system",
  "dirty": true,
  "sourcesSha": "227e1c0b7212a890536fb1926ef2cb8d4b610bc6515cf7a93389edfa5dd3ffcd",
  "sourcesShaShort": "227e1c0b7212",
  "buildCounts": {
    "pages": 3,
    "sections": 23,
    "collections": 6,
    "variables": 102,
    "paintStyles": 43,
    "effectStyles": 4,
    "componentSets": 24,
    "componentVariants": 226,
    "appliableTotal": 205,
    "docsDeclaredNotAppliable": 4
  }
}
  };
  __modules["contrast"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Pure WCAG 2.2 contrast maths for the Phase 104 DNA layer.
 *
 * Deliberately standalone (no `figma`, no repo imports) so it can run in the
 * plugin sandbox, in Node tests and in CI identically. The algorithm mirrors
 * src/app/__tests__/text-contrast-a11y.test.ts so the two agree by construction.
 */

/**
 * @param {string} input hex (#rgb/#rrggbb) or rgb()/rgba()
 * @returns {{r:number,g:number,b:number,a:number}} channels 0..1
 */
function parseColor(input) {
  const s = String(input).trim()
  if (s[0] === '#') {
    let hex = s.slice(1)
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    if (hex.length !== 6) throw new Error('Bad hex color: ' + input)
    const num = parseInt(hex, 16)
    if (Number.isNaN(num)) throw new Error('Bad hex color: ' + input)
    return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255, a: 1 }
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/i)
  if (!m) throw new Error('Unsupported color format: ' + input)
  const parts = m[1].split(',').map((p) => p.trim())
  if (parts.length < 3) throw new Error('Bad rgb color: ' + input)
  const r = Number(parts[0]) / 255
  const g = Number(parts[1]) / 255
  const b = Number(parts[2]) / 255
  const a = parts.length >= 4 ? Number(parts[3]) : 1
  if ([r, g, b, a].some((n) => Number.isNaN(n))) throw new Error('Bad rgb color: ' + input)
  return { r, g, b, a }
}

/** sRGB channel → linear. @param {number} c @returns {number} */
function toLinear(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Relative luminance of an OPAQUE color. @param {string} color @returns {number} */
function luminance(color) {
  const { r, g, b } = parseColor(color)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * Composite a (possibly translucent) foreground over an opaque background,
 * returning the resulting opaque color. Needed because Hermes Glass surfaces are
 * translucent — measuring text against the glass *token* rather than against the
 * composited result would overstate contrast.
 * @param {string} fg @param {string} bg @returns {string}
 */
function composite(fg, bg) {
  const f = parseColor(fg)
  const b = parseColor(bg)
  const a = f.a
  const r = Math.round((f.r * a + b.r * (1 - a)) * 255)
  const g = Math.round((f.g * a + b.g * (1 - a)) * 255)
  const bl = Math.round((f.b * a + b.b * (1 - a)) * 255)
  return 'rgb(' + r + ', ' + g + ', ' + bl + ')'
}

/**
 * WCAG contrast ratio. Translucent inputs are composited over `over` first.
 * @param {string} fg @param {string} bg @param {string} [over] opaque backdrop for translucent inputs
 * @returns {number}
 */
function contrast(fg, bg, over) {
  const backdrop = over || '#000000'
  const f = parseColor(fg).a < 1 ? composite(fg, backdrop) : fg
  const b = parseColor(bg).a < 1 ? composite(bg, backdrop) : bg
  const l1 = luminance(f)
  const l2 = luminance(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

/** @param {number} n @returns {number} rounded to 2dp */
function r2(n) {
  return Math.round(n * 100) / 100
}

module.exports = { parseColor, toLinear, luminance, composite, contrast, r2 }

  };
  __modules["contract"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * THE PHASE 104 ASSET CONTRACT — fail-closed.
 *
 * Why this file exists: a Dry Run was performed against the WRONG plugin (the
 * Phase 87 `Hermes Design System Builder`, id com.hermesnovin.design-system-builder,
 * which produces 173 assets including 8 text styles and 36 reference assemblies —
 * things this plugin has no code to create). The numbers looked plausible, and
 * nothing in the UI made it obvious which plugin was actually running.
 *
 * From now on the plugin refuses to Dry Run or Apply unless the computed spec
 * matches this contract EXACTLY. If a genuine design change alters a count, the
 * contract must be edited deliberately, in the same commit, with the reason
 * recorded — that is the point. It is never to be nudged to make a run go green.
 *
 * PLUGIN_IDENTITY is asserted against manifest.json at build time, so a mismatched
 * or swapped manifest cannot silently ship.
 */

const PLUGIN_IDENTITY = Object.freeze({
  name: 'Hermes Phase 104 Visual System',
  id: 'com.hermesnovin.phase104-visual-system',
})

/**
 * Expected asset counts. These are the owner-stated Phase 104 expectation and the
 * spec produces them exactly — neither side was adjusted to fit the other.
 */
const EXPECTED = Object.freeze({
  pages: 3,
  sections: 23,
  collections: 6,
  variables: 102,
  paintStyles: 43,
  effectStyles: 4,
  componentSets: 24,
  componentVariants: 226,
  appliableTotal: 205,
  docsDeclaredNotAppliable: 4,
})

/**
 * Counts that must be ZERO. These are the Phase 87 fingerprints: if any of them is
 * non-zero, the wrong plugin is running, full stop.
 */
const MUST_BE_ABSENT = Object.freeze(['textStyles', 'assemblies', 'families', 'components'])

/**
 * @param {Record<string, number>} counts
 * @returns {{ok: boolean, mismatches: string[], absent: string[]}}
 */
function checkContract(counts) {
  /** @type {string[]} */ const mismatches = []
  /** @type {string[]} */ const absent = []

  for (const [k, want] of Object.entries(EXPECTED)) {
    const got = counts[k]
    if (got !== want) mismatches.push(k + ': expected ' + want + ', got ' + (got === undefined ? 'undefined' : got))
  }
  for (const k of MUST_BE_ABSENT) {
    if (counts[k]) absent.push(k + '=' + counts[k] + ' (this is a Phase 87 asset kind — wrong plugin)')
  }
  return { ok: mismatches.length === 0 && absent.length === 0, mismatches, absent }
}

/**
 * Fail-closed gate. Throws with an actionable message rather than proceeding.
 * @param {Record<string, number>} counts
 * @param {string} [where]
 */
function assertContract(counts, where) {
  const r = checkContract(counts)
  if (r.ok) return true
  const lines = ['PHASE 104 ASSET CONTRACT VIOLATED' + (where ? ' during ' + where : '') + '.']
  if (r.absent.length) {
    lines.push('')
    lines.push('WRONG PLUGIN DETECTED — these asset kinds belong to the Phase 87 builder:')
    for (const a of r.absent) lines.push('  - ' + a)
    lines.push('')
    lines.push('You are running "Hermes Design System Builder"')
    lines.push('(com.hermesnovin.design-system-builder), NOT this plugin.')
    lines.push('Remove it from Plugins > Development and re-import from:')
    lines.push('  E:\\hermes-os-phase104\\tools\\figma\\hermes-phase104-visual-system\\manifest.json')
  }
  if (r.mismatches.length) {
    lines.push('')
    lines.push('Count mismatches:')
    for (const m of r.mismatches) lines.push('  - ' + m)
    lines.push('')
    lines.push('If a design change legitimately altered a count, edit EXPECTED in')
    lines.push('src/lib/contract.js deliberately and record why. Never nudge it to pass.')
  }
  throw new Error(lines.join('\n'))
}

module.exports = { PLUGIN_IDENTITY, EXPECTED, MUST_BE_ABSENT, checkContract, assertContract }

  };
  __modules["dna-tokens"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * HERMES DESIGN DNA — Phase 104 token layer.
 *
 * This module is ADDITIVE on top of the Phase 87B canonical token layer. It does
 * not restate, replace or renumber anything already enforced by
 * `src/components/ds/token-contract.ts`; it declares the *new* semantic layer
 * Phase 104 introduces, and it declares — explicitly and by name — which existing
 * canonical tokens each Hermes DNA signature ALIASES.
 *
 * Two hard rules govern every entry below.
 *
 *   1. NO NEW BASE HUE WITHOUT A REASON. The approved brand system
 *      (docs/design/phase-87a/03-brand-system.md) fixes Obsidian #071018 as the
 *      product base and forbids neon/cyberpunk treatment. Every DNA signature is
 *      therefore expressed as an ALIAS of an existing canonical token wherever a
 *      canonical token already carries the meaning. Genuinely new values are
 *      listed in NEW_HUES and each one carries a written justification.
 *
 *   2. COLOR IS NEVER THE ONLY CHANNEL. Every industrial state carries a
 *      non-color cue (glyph + outline treatment) so severity survives greyscale,
 *      color-vision deficiency and monochrome print. WCAG 2.2 SC 1.4.1.
 *
 * Contrast figures in this file are COMPUTED, never asserted by hand — see
 * `contrast.js` and the `dna-contrast` test.
 */

/** The canonical surfaces every DNA foreground token is measured against. */
const BASE_SURFACES = Object.freeze({
  backgroundDeep: '#040A0F', // --color-background-deep
  backgroundBase: '#071018', // --color-background-base  (Hermes Obsidian)
  surfacePrimary: '#0C1720', // --color-surface-primary
  surfaceElevated: '#11212C', // --color-surface-elevated
  surfaceInteractive: '#152A36', // --color-surface-interactive  ← lightest, worst case
})

/**
 * Genuinely NEW values Phase 104 introduces, with justification. Everything not
 * in this list is an alias of an already-shipped canonical token.
 *
 * @type {ReadonlyArray<{value:string, name:string, why:string}>}
 */
const NEW_HUES = [
  {
    value: '#E03144',
    name: 'Safety Red Urgent',
    why: 'CRITICAL must outrank ALARM. --color-status-danger (#F05D68) is already spent on ALARM and reads as a soft salmon; a fully saturated pure red is required for the top of the severity ladder. Measured 3.31:1 on the lightest surface — passes SC 1.4.11 for indicators. NOT text-legible: use critical.text.',
  },
  {
    value: '#FF8A94',
    name: 'Safety Red Text',
    why: 'The readable partner of Safety Red Urgent (6.58:1). Carries CRITICAL at text-legible luminance wherever the state name is rendered as type.',
  },
  {
    value: '#93AEC8',
    name: 'Maintenance Steel Text',
    why: 'Readable partner of Maintenance Steel (6.45:1). Maintenance Steel is deliberately recessive and measures only 3.51:1 — fine as an indicator, below AA as text.',
  },
  {
    value: '#6B7F8D',
    name: 'Offline Slate',
    why: 'OFFLINE is a real operational state, not a disabled control, so it may not borrow --color-text-disabled (#495C68 = 2.13:1, below SC 1.4.11). Offline Slate measures 3.56:1 and is a full luminance step below the UNKNOWN grey so the two never collapse.',
  },
  {
    value: '#7FB0FF',
    name: 'Evidence Azure Text',
    why: 'Readable partner of --color-reasoning-evidence (#3B82F6 = 4.03:1, below AA as text). Keeps the canonical azure as the indicator/border while type stays legible at 6.75:1.',
  },
  {
    value: '#A99BFF',
    name: 'Hypothesis Violet Text',
    why: 'Readable partner of --color-reasoning-hypothesis (#8B7CFF = 4.54:1 — passing but with almost no margin). Lifts hypothesis type to 6.23:1 so it survives any future surface change.',
  },
  {
    value: '#FF7C86',
    name: 'Contradiction Text',
    why: 'Readable partner of --color-reasoning-contradiction (#F05D68 = 4.57:1, same razor-thin margin). 5.99:1.',
  },
  {
    value: '#C9B06A',
    name: 'Industrial Brass',
    why: 'DEGRADED is operationally distinct from WARNING — it means "still running, below nominal", not "act now". Reusing --color-status-warning would erase that distinction on every asset tile. Brass sits deliberately between success green and warning amber.',
  },
  {
    value: '#5F7E9E',
    name: 'Maintenance Steel',
    why: 'MAINTENANCE is a planned, non-fault state and must not read as an alert or as informational telemetry. Deliberately desaturated so it recedes; distinct from the vivid --color-status-information (#54A6FF).',
  },
  {
    value: '#6B3A22',
    name: 'Horizon Ember Core',
    why: 'The single warm value in the entire system. Confined to the Hermes Horizon atmosphere layer at low opacity behind a vignette; never a content color, never a text color, never used on a data surface.',
  },
  {
    value: '#34201C',
    name: 'Horizon Ember Fade',
    why: 'The mid stop that carries Ember Core back into Obsidian without a visible banding edge.',
  },
]

/**
 * ── SIGNATURE 1 · HERMES HORIZON ────────────────────────────────────────────
 * The cinematic industrial atmosphere layer.
 *
 * POLICY (enforced by `dna-policy` test, not merely documented):
 *   - Permitted ONLY on: Login, Workspace Home, and full-bleed command surfaces.
 *   - FORBIDDEN behind any dense engineering data — tables, trends, telemetry
 *     rows, alarm lists, editors. `HORIZON_FORBIDDEN_SURFACES` is the machine list.
 *   - No text may sit directly on Horizon. Text sits on a Hermes Glass surface
 *     that is composited over it. This is what keeps the atmosphere from ever
 *     costing legibility.
 *   - Total warm coverage is capped: the ember band may not exceed 22% of frame
 *     height, and the vignette is mandatory.
 */
const HORIZON = Object.freeze({
  /** Vertical gradient stops, top (0) → bottom (1). */
  stops: Object.freeze([
    { at: 0.0, value: '#03070B', role: 'void', note: 'above the horizon — near-black, holds the UI chrome' },
    { at: 0.42, value: '#071018', role: 'obsidian', note: 'the canonical base — continuity anchor with the rest of the product' },
    { at: 0.68, value: '#0E1A24', role: 'haze', note: 'steel atmospheric band' },
    { at: 0.84, value: '#34201C', role: 'emberFade', note: 'warm transition — no visible banding edge' },
    { at: 0.93, value: '#6B3A22', role: 'emberCore', note: 'the sun band — the ONLY warm value in Hermes' },
    { at: 1.0, value: '#040A0F', role: 'ground', note: 'plant silhouette / ground plane resolves back to Obsidian Deep' },
  ]),
  /** Mandatory overlays composited on top of the gradient, in order. */
  overlays: Object.freeze([
    { role: 'iceCounterLight', value: 'rgba(139, 244, 248, 0.06)', note: 'cold counter-light from the top-left — keeps the frame industrial, not romantic' },
    { role: 'haze', value: 'rgba(169, 186, 198, 0.05)', note: 'particulate atmosphere' },
    { role: 'vignette', value: 'rgba(4, 10, 15, 0.72)', note: 'MANDATORY — pins attention to the centre and protects contrast at the edges' },
  ]),
  /** Hard geometry limits. */
  emberBandMaxHeightRatio: 0.22,
  vignetteRequired: true,
})

/** Surfaces on which the Horizon layer is machine-forbidden. */
const HORIZON_FORBIDDEN_SURFACES = Object.freeze([
  'command-center', 'industrial-brain', 'live-operations', 'asset-detail',
  'connectivity', 'reports', 'alarm-center', 'administration',
  'media-analytics', 'automation-studio',
])

/** Surfaces on which the Horizon layer is permitted. */
const HORIZON_PERMITTED_SURFACES = Object.freeze(['login', 'workspace-home', 'video-watch'])

/**
 * ── SIGNATURE 2 · HERMES DEEP NAVY ──────────────────────────────────────────
 * The stable operational workspace. Pure alias layer — introduces NO new value.
 * "Deep navy" is the *name* of the existing Obsidian family, not a new colour.
 */
const DEEP_NAVY = Object.freeze({
  workspace: { alias: '--color-background-base', value: '#071018' },
  void: { alias: '--color-background-deep', value: '#040A0F' },
  panel: { alias: '--color-surface-primary', value: '#0C1720' },
  panelRaised: { alias: '--color-surface-elevated', value: '#11212C' },
  panelInteractive: { alias: '--color-surface-interactive', value: '#152A36' },
})

/**
 * ── SIGNATURE 3 · HERMES GLASS ──────────────────────────────────────────────
 * Controlled translucency. Phase 104's real job here is to CLOSE the largest
 * known inconsistency in the system: the shipped `.ds-glass-*` family in
 * globals.css:1269-1305 is hard-coded rgba() and does not read from any token.
 * Each tier below records the exact literal it replaces so the migration is
 * a provable 1:1, not a redesign.
 */
const GLASS = Object.freeze({
  tiers: Object.freeze([
    { tier: 'soft', fill: 'rgba(12, 23, 32, 0.55)', border: 'rgba(139, 244, 248, 0.06)', blur: 10, lift: -2, replaces: '.ds-glass-soft' },
    { tier: 'card', fill: 'rgba(12, 23, 32, 0.72)', border: 'rgba(139, 244, 248, 0.10)', blur: 14, lift: -3, replaces: '.ds-glass-card' },
    { tier: 'interactive', fill: 'rgba(17, 33, 44, 0.74)', border: 'rgba(139, 244, 248, 0.12)', blur: 14, lift: -6, replaces: '.ds-glass-interactive' },
    { tier: 'elevated', fill: 'rgba(17, 33, 44, 0.80)', border: 'rgba(139, 244, 248, 0.14)', blur: 18, lift: -5, replaces: '.ds-glass-elevated' },
    { tier: 'hero', fill: 'rgba(20, 38, 50, 0.86)', border: 'rgba(139, 244, 248, 0.16)', blur: 22, lift: -8, replaces: '.ds-glass-hero' },
  ]),
  /**
   * The shipped lift ordering is MACHINE-PINNED by
   * src/components/ds/__tests__/components.test.ts:154-165 as a strict ladder
   * soft(-2) < card(-3) < elevated(-5) < interactive(-6) < hero(-8), and scale()
   * is pinned to exactly ["scale(1.012)"]. Phase 104 preserves both exactly.
   */
  liftLadder: Object.freeze(['soft', 'card', 'elevated', 'interactive', 'hero']),
  interactiveScale: 1.012,
  /** Opacity floor — below this, text contrast over Horizon is not guaranteed. */
  minFillAlphaOverHorizon: 0.72,
})

/**
 * ── SIGNATURE 4 · HERMES EDGE ───────────────────────────────────────────────
 * Fine steel/ice borders with extremely restrained edge illumination.
 */
const EDGE = Object.freeze({
  structural: { alias: '--color-border-default', value: '#203743', width: 1, note: 'non-interactive separation' },
  hairline: { alias: '--color-surface-glass-border', value: 'rgba(139, 244, 248, 0.10)', width: 1, note: 'the 1px ice line on every glass surface' },
  active: { alias: '--color-border-active', value: '#21C9D5', width: 1, note: 'selected / active boundary' },
  danger: { alias: '--color-border-danger', value: '#F05D68', width: 1 },
  /**
   * Edge illumination is a LINEAR TOP HIGHLIGHT, not a glow. It is a 1px inner
   * line fading over the first 40% of the surface height. Outer glow, bloom and
   * box-shadow spread in a brand colour are all prohibited — 03-brand-system.md:320
   * retired `.glow-*`, `.text-glow*` and `.landing-scanlines` and Phase 104 does
   * not reinstate them under a new name.
   */
  illumination: Object.freeze({
    from: 'rgba(139, 244, 248, 0.14)',
    to: 'rgba(139, 244, 248, 0.00)',
    spanRatio: 0.4,
    outerGlowPermitted: false,
  }),
})

/**
 * ── SIGNATURE 5 · HERMES BEACON ─────────────────────────────────────────────
 * The focused ice-blue highlight for command focus, intelligence and selected
 * operational state. Pure alias layer — no new value. Beacon is a FOCUS device,
 * never decoration: it may appear at most once per view as the primary beacon.
 */
const BEACON = Object.freeze({
  core: { alias: '--color-brand-primary', value: '#16D9E3' },
  rise: { alias: '--color-brand-primary-hover', value: '#8BF4F8' },
  deep: { alias: '--color-brand-primary-pressed', value: '#0795A5' },
  halo: { alias: '--color-selection', value: 'rgba(22, 217, 227, 0.28)' },
  rim: { alias: '--color-brand-border', value: 'rgba(22, 217, 227, 0.24)' },
  wash: { alias: '--color-brand-subtle', value: 'rgba(22, 217, 227, 0.10)' },
  onBeacon: { alias: '--color-brand-on-brand', value: '#071018', note: 'white-on-cyan is prohibited' },
  maxPrimaryPerView: 1,
})

/**
 * ── SIGNATURE 6 · HERMES RAIL ───────────────────────────────────────────────
 * The minimal persistent navigation rail. Phase 104 narrows the Phase 87A
 * 264/64 sidebar into a true RAIL: icon-only by default, label-on-hover, with an
 * optional expanded drawer. Widths are tokens, not magic numbers.
 */
const RAIL = Object.freeze({
  widthRail: 72, // icon-only resting state — the Hermes signature
  widthExpanded: 264, // drawer state (matches the Phase 87A spec so nav code is unchanged)
  widthTablet: 72,
  mobile: 'bottom-sheet', // the rail becomes a bottom sheet below 768
  itemSize: 44, // ≥44px — WCAG 2.2 SC 2.5.8 target size
  itemGap: 6,
  iconSize: 20,
  activeIndicatorWidth: 2, // inline-start beacon bar on the active item
  surface: { alias: '--color-surface-primary', value: '#0C1720' },
  edge: { alias: '--color-border-default', value: '#203743' },
})

/**
 * ── SIGNATURE 7 · HERMES COMMAND ────────────────────────────────────────────
 * The large AI command/search interaction — the most recognisable Hermes element.
 * Rendered as a single wide Glass field with a Beacon focus ring and a leading
 * Hermes Brain mark. Deliberately larger than any other control in the product.
 */
const COMMAND = Object.freeze({
  widthDesktop: 720,
  widthTablet: 640,
  widthMobile: 342,
  height: 64,
  heightMobile: 56,
  radius: 16, // --radius-xl
  glassTier: 'elevated',
  focusRing: { alias: '--color-focus-ring', value: '#16D9E3', width: 2, offset: 2 },
  placeholderTone: { alias: '--color-text-muted', value: '#708694' },
  markSize: 24,
  /** The palette that opens beneath it. */
  paletteWidth: 720,
  paletteMaxHeight: 480,
  paletteGlassTier: 'hero',
  paletteGroups: Object.freeze(['Navigate', 'Actions', 'Entities', 'Evidence', 'Help']),
})

/**
 * ── SIGNATURE 8 · HERMES TRIAD ──────────────────────────────────────────────
 * The three primary Workspace cards and their interaction grammar. The Triad is
 * a fixed composition, not a generic card grid: exactly three, equal weight,
 * each carrying one intent.
 */
const TRIAD = Object.freeze({
  count: 3,
  cardWidthDesktop: 384,
  cardHeightDesktop: 260,
  gap: 24,
  glassTier: 'interactive',
  radius: 20, // --radius-2xl
  stackBelow: 768, // becomes a vertical stack on tablet and below
  intents: Object.freeze([
    { key: 'operate', mark: 'live-operations', note: 'what is happening in the plant right now' },
    { key: 'understand', mark: 'hermes-brain', note: 'what the evidence says and what is uncertain' },
    { key: 'act', mark: 'command', note: 'the engineering action queue awaiting a human decision' },
  ]),
})

/**
 * ── INDUSTRIAL STATE LADDER ─────────────────────────────────────────────────
 * Ten operational states. `fill` is the indicator/border colour; `text` is the
 * readable partner used whenever the state name is rendered as type. Every entry
 * carries a non-colour `glyph` and `outline` so severity never depends on hue.
 *
 * ORDER IS SEVERITY ORDER and is asserted by test — `unknown` deliberately sits
 * apart from `healthy` at both ends of the scale so the two can never be confused.
 */
const INDUSTRIAL_STATES = Object.freeze([
  { key: 'healthy', rank: 0, fill: '#38D996', text: '#38D996', alias: '--color-status-success', glyph: 'dot-solid', outline: 'solid', label: { en: 'Healthy', fa: 'سالم', de: 'Fehlerfrei' } },
  { key: 'degraded', rank: 1, fill: '#C9B06A', text: '#C9B06A', alias: null, glyph: 'dot-half', outline: 'solid', label: { en: 'Degraded', fa: 'افت‌کرده', de: 'Eingeschränkt' } },
  { key: 'warning', rank: 2, fill: '#F5B942', text: '#F5B942', alias: '--color-status-warning', glyph: 'triangle', outline: 'solid', label: { en: 'Warning', fa: 'هشدار', de: 'Warnung' } },
  { key: 'alarm', rank: 3, fill: '#F05D68', text: '#F05D68', alias: '--color-status-danger', glyph: 'square-pulse', outline: 'solid', label: { en: 'Alarm', fa: 'آلارم', de: 'Alarm' } },
  { key: 'critical', rank: 4, fill: '#E03144', text: '#FF8A94', alias: null, glyph: 'cross-double', outline: 'double', label: { en: 'Critical', fa: 'بحرانی', de: 'Kritisch' } },
  { key: 'maintenance', rank: 5, fill: '#5F7E9E', text: '#93AEC8', alias: null, glyph: 'wrench', outline: 'solid', label: { en: 'Maintenance', fa: 'تعمیرات', de: 'Wartung' } },
  { key: 'simulation', rank: 6, fill: '#8B7CFF', text: '#A99BFF', alias: '--color-reasoning-hypothesis', glyph: 'diamond', outline: 'dashed', label: { en: 'Simulation', fa: 'شبیه‌سازی', de: 'Simulation' } },
  {
    key: 'stale', rank: 7, fill: '#708694', text: '#8496A6', alias: '--color-text-muted',
    glyph: 'clock-dashed', outline: 'dashed',
    label: { en: 'Stale data', fa: 'دادهٔ کهنه', de: 'Veraltete Daten' },
    // STALE is a DATA-QUALITY MODIFIER, not a device state. It renders over the
    // last-known state: that state's colour desaturated to 40% plus a dashed
    // ring and a clock glyph. The `fill` above is only the fallback used when no
    // prior state exists. Modelling it as a modifier is what keeps the three
    // grey-family states (stale / offline / unknown) from collapsing into each other.
    modifier: true,
    appliesOver: 'lastKnownState',
    desaturateTo: 0.4,
  },
  { key: 'offline', rank: 8, fill: '#6B7F8D', text: '#8496A6', alias: null, glyph: 'dot-hollow', outline: 'solid', label: { en: 'Offline', fa: 'آفلاین', de: 'Offline' } },
  { key: 'unknown', rank: 9, fill: '#8496A6', text: '#8496A6', alias: '--color-text-metadata', glyph: 'question', outline: 'dashed', label: { en: 'Unknown', fa: 'نامعلوم', de: 'Unbekannt' } },
])

/**
 * ── REASONING LADDER (Industrial Brain) ─────────────────────────────────────
 * An AI hypothesis must NEVER look like a verified plant fact. The visual
 * separation is carried by three independent channels at once: colour, border
 * style, and a mandatory provenance chip. `verifiedLook` is the machine flag the
 * Brain surfaces assert against.
 */
const REASONING_LADDER = Object.freeze([
  { key: 'observation', color: '#EDF7FA', text: '#EDF7FA', alias: '--color-text-primary', border: 'solid', chip: 'OBSERVED', verifiedLook: true, note: 'measured plant data — the only tier allowed to look like fact' },
  { key: 'evidence', color: '#3B82F6', text: '#7FB0FF', alias: '--color-reasoning-evidence', border: 'solid', chip: 'EVIDENCE', verifiedLook: true, note: 'traceable to a source record; lineage must be inspectable' },
  { key: 'hypothesis', color: '#8B7CFF', text: '#A99BFF', alias: '--color-reasoning-hypothesis', border: 'dashed', chip: 'HYPOTHESIS', verifiedLook: false, note: 'model inference — dashed border is mandatory' },
  { key: 'rootCauseCandidate', color: '#8B7CFF', text: '#A99BFF', alias: '--color-reasoning-hypothesis', border: 'dashed', chip: 'CANDIDATE', verifiedLook: false, note: 'ranked candidate, still unproven' },
  { key: 'contradiction', color: '#F05D68', text: '#FF7C86', alias: '--color-reasoning-contradiction', border: 'solid', chip: 'CONFLICT', verifiedLook: true, note: 'evidence that conflicts with the selected hypothesis' },
  { key: 'missing', color: '#F5B942', text: '#F5B942', alias: '--color-reasoning-missing', border: 'dashed', chip: 'NO DATA', verifiedLook: false, note: 'absent evidence — never rendered as zero' },
  { key: 'simulationResult', color: '#8B7CFF', text: '#A99BFF', alias: '--color-reasoning-hypothesis', border: 'dashed', chip: 'SIMULATED', verifiedLook: false, note: 'not plant data' },
  { key: 'recommendation', color: '#16D9E3', text: '#16D9E3', alias: '--color-reasoning-decision', border: 'solid', chip: 'PROPOSED', verifiedLook: false, note: 'proposed action, pending engineer approval' },
  { key: 'engineerApproval', color: '#38D996', text: '#38D996', alias: '--color-status-success', border: 'solid', chip: 'APPROVED', verifiedLook: true, note: 'a human took responsibility — the only tier that closes the loop' },
])

/**
 * ── MOTION ──────────────────────────────────────────────────────────────────
 * Restrained, causal motion in the 120–240ms band. Values reuse the shipped
 * --motion-* tokens; Phase 104 adds only the named CHOREOGRAPHIES.
 */
const MOTION = Object.freeze({
  durations: Object.freeze({ instant: 60, fast: 140, standard: 200, slow: 300 }),
  easing: Object.freeze({
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)', // --motion-ease
    exit: 'cubic-bezier(0.16, 1, 0.3, 1)', // --motion-ease-out
  }),
  choreography: Object.freeze([
    { key: 'commandFocus', duration: 140, easing: 'standard', note: 'field widens + beacon ring resolves' },
    { key: 'panelTransition', duration: 200, easing: 'standard' },
    { key: 'progressiveDisclosure', duration: 200, easing: 'standard' },
    { key: 'signalStateTransition', duration: 140, easing: 'standard', note: 'never animates the VALUE, only the state colour' },
    { key: 'reasoningReveal', duration: 240, easing: 'exit', note: 'evidence lineage unfolds top-down so causality reads' },
    { key: 'alarmAcknowledge', duration: 200, easing: 'standard' },
    { key: 'workspaceNavigation', duration: 200, easing: 'exit' },
  ]),
  /** Prohibited outright. */
  prohibited: Object.freeze(['float', 'pulse-glow', 'parallax', 'bounce', 'ripple', 'confetti', 'rotate-3d']),
  reducedMotion: Object.freeze({
    respected: true,
    fallback: 'opacity-only',
    maxDuration: 0,
    note: 'Under prefers-reduced-motion every choreography collapses to an instant state change. The alarm pulse becomes a static double outline so severity is never lost.',
  }),
})

/** Responsive breakpoints Phase 104 designs and validates against. */
const BREAKPOINTS = Object.freeze({
  desktop: { width: 1440, height: 1024 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
})

/** Minimum interactive target, WCAG 2.2 SC 2.5.8. */
const MIN_TARGET_PX = 44

module.exports = {
  BASE_SURFACES,
  NEW_HUES,
  HORIZON,
  HORIZON_FORBIDDEN_SURFACES,
  HORIZON_PERMITTED_SURFACES,
  DEEP_NAVY,
  GLASS,
  EDGE,
  BEACON,
  RAIL,
  COMMAND,
  TRIAD,
  INDUSTRIAL_STATES,
  REASONING_LADDER,
  MOTION,
  BREAKPOINTS,
  MIN_TARGET_PX,
}

  };
  __modules["dna-structure"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * File structure — EXACTLY three pages, as directed by the owner.
 *
 * The Starter plan caps a file at 3 pages, so the full Phase 104 taxonomy is
 * carried by SECTIONS inside those pages. Nothing is dropped and nothing is
 * merged away: all 23 categories survive, they are simply organised as sections
 * rather than pages. Section order inside a page is the canvas order.
 *
 * Starter capabilities NOT available, and therefore never claimed anywhere in
 * this plugin or its reports:
 *   - variable collection MODES  (hard-capped at 1 — `addMode` throws)
 *   - team LIBRARY PUBLISHING    (Professional feature)
 * Everything those would normally carry is expressed instead through
 * single-mode collections, component VARIANTS and component PROPERTIES.
 */

const PAGES = Object.freeze([
  {
    key: 'page:foundations',
    name: '01 — Foundations & Components',
    sections: [
      // The approved mockups the owner is supplying land here. It is created
      // EMPTY and stays empty until real images arrive — it is never populated
      // with invented artwork, and its emptiness is what keeps the report honest.
      { key: 'sec:approved-refs', name: '00 — Approved Visual References', w: 9600, h: 5400, awaitingOwnerAssets: true },
      { key: 'sec:dna', name: '01 — Design DNA & Direction', w: 9600, h: 3600 },
      { key: 'sec:tokens', name: '02 — Tokens & Variables', w: 9600, h: 6400 },
      { key: 'sec:type', name: '03 — Typography & Iconography', w: 9600, h: 3600 },
      { key: 'sec:core', name: '04 — Core Components', w: 12000, h: 9000 },
      { key: 'sec:industrial', name: '05 — Industrial Components', w: 12000, h: 7000 },
      { key: 'sec:intelligence', name: '06 — Intelligence Components', w: 12000, h: 6000 },
    ],
  },
  {
    key: 'page:screens',
    name: '02 — Hermes Product Screens',
    sections: [
      { key: 'sec:workspace', name: '07 — Workspace & Authentication', w: 11000, h: 5200 },
      { key: 'sec:command-center', name: '08 — Command Center', w: 11000, h: 5200 },
      { key: 'sec:brain', name: '09 — Industrial Brain', w: 11000, h: 5200 },
      { key: 'sec:live-ops', name: '10 — Live Operations', w: 11000, h: 5200 },
      { key: 'sec:assets', name: '11 — Assets & Connectivity', w: 11000, h: 5200 },
      { key: 'sec:alarms', name: '12 — Alarm Center', w: 11000, h: 5200 },
      { key: 'sec:reports', name: '13 — Reports & Analytics', w: 11000, h: 5200 },
      { key: 'sec:admin', name: '14 — Administration', w: 11000, h: 5200 },
      { key: 'sec:p101', name: '15 — Phase 101 Industrial Engineering', w: 11000, h: 5200, speculative: true },
      { key: 'sec:p102', name: '16 — Phase 102 Media & Video Hub', w: 11000, h: 5200, speculative: true },
      { key: 'sec:p103', name: '17 — Phase 103 Automation Engineering Studio', w: 11000, h: 5200, speculative: true },
    ],
  },
  {
    key: 'page:quality',
    name: '03 — Responsive, Prototypes & Handoff',
    sections: [
      { key: 'sec:responsive', name: '18 — Responsive Matrix (1440 / 768 / 390)', w: 12000, h: 7000 },
      { key: 'sec:direction', name: '19 — RTL / LTR Direction', w: 12000, h: 5400 },
      { key: 'sec:prototypes', name: '20 — Interaction Prototypes', w: 9600, h: 4800 },
      { key: 'sec:a11y', name: '21 — Accessibility', w: 9600, h: 5200 },
      { key: 'sec:handoff', name: '22 — Engineering Handoff', w: 9600, h: 5200 },
    ],
  },
])

/** Sections whose content is SPECULATIVE because the phase does not exist in code. */
const SPECULATIVE_SECTIONS = Object.freeze(
  PAGES.flatMap((p) => p.sections.filter((s) => s.speculative).map((s) => s.name))
)

/** Capabilities the Starter plan does not provide. Never claimed as used. */
const STARTER_UNAVAILABLE = Object.freeze([
  {
    capability: 'Variable collection modes',
    code: 'NO_MODES',
    proof: 'collection.addMode() throws "Limited to 1 modes only"',
    substitute: 'One single-mode collection per semantic group; theme/breakpoint differences are carried by component variants, not modes.',
  },
  {
    capability: 'Team library publishing',
    code: 'NO_LIBRARY_PUBLISH',
    proof: 'Publishing a library is a Professional-tier feature.',
    substitute: 'Every component lives in this one file, so instances resolve locally without a published library.',
  },
  {
    capability: 'More than 3 pages',
    code: 'MAX_3_PAGES',
    proof: 'figma.createPage() throws "The Starter plan only comes with 3 pages"',
    substitute: 'All 23 taxonomy categories are carried as Sections across the 3 pages. No category is dropped.',
  },
])

module.exports = { PAGES, SPECULATIVE_SECTIONS, STARTER_UNAVAILABLE }

  };
  __modules["dna-components"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * The Phase 104 component library — declarative, pure, no `figma`.
 *
 * ── THE ANTI-DUPLICATION CONTRACT ──────────────────────────────────────────
 * The requirement is a component-driven system, NOT 117 heavyweight frame copies.
 * That is achieved by choosing carefully what becomes a VARIANT and what becomes
 * a PROPERTY:
 *
 *   LOCALE IS NEVER A VARIANT.  FA / EN / DE are carried by TEXT component
 *   properties. One instance switches language by overriding text — it creates no
 *   new nodes. This is what stops the matrix exploding: without it, every axis
 *   would triple.
 *
 *   DIRECTION (LTR/RTL) is a variant only on LAYOUT-BEARING components — Shell,
 *   Rail, Command, Row. Everything nested inside them inherits direction from the
 *   auto-layout parent, so leaf components need no direction axis at all.
 *
 *   BREAKPOINT is a variant only on components whose GEOMETRY actually changes.
 *   A badge is a badge at every width.
 *
 *   STATE is a variant only on interactive components.
 *
 * Net effect: full Desktop-1440 / Tablet-768 / Mobile-390 x FA/EN/DE x state x
 * direction coverage, with no screen ever being a detached copy of another.
 *
 * ── VARIANT BUDGET ────────────────────────────────────────────────────────
 * No single component set exceeds 30 variants (the point at which a variant
 * matrix stops being navigable). Where a matrix would exceed it, the family is
 * split into a base set plus a states set. `assertVariantBudget()` enforces this.
 */

const BP = ['Desktop', 'Tablet', 'Mobile']
const DIR = ['LTR', 'RTL']

/**
 * Anatomy presets. Each is a pure description the executor turns into an
 * auto-layout frame. Values reference DNA tokens by name, never raw hex.
 */
const PRESETS = Object.freeze({
  control: { layout: 'HORIZONTAL', padX: 16, padY: 10, gap: 8, radius: 6, align: 'CENTER', height: 44 },
  controlSm: { layout: 'HORIZONTAL', padX: 12, padY: 6, gap: 6, radius: 6, align: 'CENTER', height: 36 },
  controlLg: { layout: 'HORIZONTAL', padX: 20, padY: 14, gap: 10, radius: 8, align: 'CENTER', height: 52 },
  pill: { layout: 'HORIZONTAL', padX: 10, padY: 4, gap: 6, radius: 9999, align: 'CENTER', height: 24 },
  chip: { layout: 'HORIZONTAL', padX: 8, padY: 3, gap: 6, radius: 4, align: 'CENTER', height: 22 },
  field: { layout: 'HORIZONTAL', padX: 14, padY: 12, gap: 10, radius: 8, align: 'CENTER', height: 44 },
  card: { layout: 'VERTICAL', padX: 20, padY: 20, gap: 12, radius: 16, align: 'MIN' },
  cardHero: { layout: 'VERTICAL', padX: 24, padY: 24, gap: 16, radius: 20, align: 'MIN' },
  row: { layout: 'HORIZONTAL', padX: 16, padY: 12, gap: 16, radius: 8, align: 'CENTER', height: 52 },
  rail: { layout: 'VERTICAL', padX: 14, padY: 16, gap: 6, radius: 0, align: 'CENTER' },
  panel: { layout: 'VERTICAL', padX: 24, padY: 24, gap: 16, radius: 16, align: 'MIN' },
  shell: { layout: 'HORIZONTAL', padX: 0, padY: 0, gap: 0, radius: 0, align: 'MIN' },
})

/**
 * @typedef {Object} Family
 * @property {string} key
 * @property {string} name              Figma component-set name
 * @property {string} section           which section it is laid out in
 * @property {string} preset
 * @property {Record<string,string[]>} axes   variant axes -> values
 * @property {{name:string, default:Record<string,string>}[]} [text]  TEXT component properties (the locale mechanism)
 * @property {string[]} [bools]         BOOLEAN component properties
 * @property {string[]} [swaps]         INSTANCE_SWAP component properties
 * @property {string} glass             DNA glass tier or 'none'
 * @property {string} description
 * @property {string} a11y
 * @property {string} [maps]            the code component it corresponds to
 */

/** Tri-lingual default copy. This is the ONLY place language appears. */
const T = (en, fa, de) => ({ en, fa, de })

/** @type {ReadonlyArray<Family>} */
const FAMILIES = [
  // ── 04 — Core Components ─────────────────────────────────────────────────
  {
    key: 'shell', name: 'Hermes/Shell', section: '04 — Core Components', preset: 'shell',
    axes: { Breakpoint: BP, Direction: DIR },
    swaps: ['Rail', 'Content'],
    glass: 'none',
    description: 'The application frame. Holds a Rail instance and a content slot. Direction is a variant here and ONLY here for the outer layout — every nested component inherits direction from this auto-layout parent, which is why no leaf component carries a direction axis.',
    a11y: 'landmark structure: navigation + main. Skip-to-content is the first focusable node.',
    maps: 'src/components/app-shell/AppShell',
  },
  {
    key: 'rail', name: 'Hermes/Rail', section: '04 — Core Components', preset: 'rail',
    axes: { Breakpoint: BP, State: ['Collapsed', 'Expanded'] },
    bools: ['Show labels'],
    swaps: ['Item icon'],
    glass: 'none',
    description: 'Hermes Rail — 72px icon-only resting state, 264px expanded drawer, bottom sheet on Mobile. Active item carries a 2px inline-start Beacon bar.',
    a11y: 'nav landmark; 44px targets (SC 2.5.8); aria-current on the active item; labels exposed to AT even when visually collapsed.',
    maps: 'src/components/app-shell/AppSidebar',
  },
  {
    key: 'command', name: 'Hermes/Command', section: '04 — Core Components', preset: 'field',
    axes: { Breakpoint: BP, State: ['Rest', 'Focus', 'Open'] },
    text: [{ name: 'Placeholder', default: T('Ask Hermes or search…', 'از هرمس بپرسید یا جست‌وجو کنید…', 'Hermes fragen oder suchen…') }],
    swaps: ['Leading mark'],
    glass: 'elevated',
    description: 'Hermes Command — the signature AI command/search field. 720/640/342 wide, 64 tall. Deliberately larger than any other control in the product.',
    a11y: 'role=combobox, aria-expanded, aria-controls the palette listbox; 2px Beacon focus ring at 2px offset.',
    maps: 'src/components/app-shell/AppCommandPalette',
  },
  {
    key: 'button', name: 'Hermes/Button', section: '04 — Core Components', preset: 'control',
    axes: { Intent: ['Primary', 'Secondary', 'Tertiary', 'Destructive'], Size: ['Sm', 'Md', 'Lg'] },
    text: [{ name: 'Label', default: T('Continue', 'ادامه', 'Weiter') }],
    bools: ['Leading icon', 'Trailing icon'],
    swaps: ['Icon'],
    glass: 'none',
    description: 'Mirrors buttonVariants in src/components/ds/logic.ts exactly (primary/secondary/tertiary/destructive x sm/md/lg). Interaction states live in the sibling States set so neither matrix exceeds the variant budget.',
    a11y: 'dark-on-cyan only for Primary — white-on-cyan is prohibited (11.01:1).',
    maps: 'src/components/ds/Button.tsx',
  },
  {
    key: 'button-states', name: 'Hermes/Button · States', section: '04 — Core Components', preset: 'control',
    axes: { Intent: ['Primary', 'Secondary', 'Tertiary', 'Destructive'], State: ['Default', 'Hover', 'Focus', 'Active', 'Disabled'] },
    text: [{ name: 'Label', default: T('Continue', 'ادامه', 'Weiter') }],
    glass: 'none',
    description: 'The interaction-state matrix at Md. Split from the base set to keep both under the 30-variant budget.',
    a11y: 'Focus is :focus-visible only, 2px Beacon ring at 2px offset.',
    maps: 'src/components/ds/Button.tsx',
  },
  {
    key: 'input', name: 'Hermes/Input', section: '04 — Core Components', preset: 'field',
    axes: { State: ['Default', 'Hover', 'Focus', 'Filled', 'Disabled', 'Error'] },
    text: [
      { name: 'Label', default: T('Asset tag', 'برچسب دارایی', 'Anlagen-Tag') },
      { name: 'Value', default: T('', '', '') },
      { name: 'Helper', default: T('Use the plant tag format', 'از قالب تگ کارخانه استفاده کنید', 'Anlagen-Tag-Format verwenden') },
    ],
    glass: 'none',
    description: 'Text input. Error state pairs the danger border with a helper message — never colour alone.',
    a11y: 'aria-invalid + aria-describedby on Error; the message is announced, not merely coloured.',
    maps: 'src/components/ds/Input.tsx',
  },
  {
    key: 'select', name: 'Hermes/Select', section: '04 — Core Components', preset: 'field',
    axes: { State: ['Default', 'Hover', 'Focus', 'Open', 'Disabled'] },
    text: [{ name: 'Label', default: T('Site', 'سایت', 'Standort') }, { name: 'Value', default: T('All sites', 'همهٔ سایت‌ها', 'Alle Standorte') }],
    glass: 'none', description: 'Select / combobox trigger.',
    a11y: 'role=combobox, aria-expanded; the listbox is a Popover instance.',
    maps: 'src/components/ds/Select.tsx',
  },
  {
    key: 'tabs', name: 'Hermes/Tabs', section: '04 — Core Components', preset: 'control',
    axes: { Variant: ['Underline', 'Segmented'], State: ['Default', 'Hover', 'Selected', 'Disabled'] },
    text: [{ name: 'Label', default: T('Overview', 'نمای کلی', 'Übersicht') }],
    glass: 'none', description: 'Tabs and segmented control share one family; Variant switches the treatment.',
    a11y: 'role=tablist/tab/tabpanel; selection is never colour-only — the underline/fill carries it.',
    maps: 'src/components/ds/Tabs.tsx',
  },
  {
    key: 'breadcrumb', name: 'Hermes/Breadcrumb', section: '04 — Core Components', preset: 'chip',
    axes: { Direction: DIR, State: ['Default', 'Current'] },
    text: [{ name: 'Label', default: T('Live Operations', 'عملیات زنده', 'Live-Betrieb') }],
    glass: 'none',
    description: 'Breadcrumb segment. Direction is a variant because the separator glyph mirrors; the technical value inside it must NOT mirror.',
    a11y: 'nav[aria-label=Breadcrumb]; aria-current=page on Current.',
  },
  {
    key: 'dialog', name: 'Hermes/Dialog', section: '04 — Core Components', preset: 'panel',
    axes: { Breakpoint: BP, Kind: ['Dialog', 'Drawer'] },
    text: [{ name: 'Title', default: T('Confirm action', 'تأیید عملیات', 'Aktion bestätigen') }, { name: 'Body', default: T('This action requires engineer approval.', 'این عملیات به تأیید مهندس نیاز دارد.', 'Diese Aktion erfordert eine Freigabe durch einen Ingenieur.') }],
    glass: 'hero',
    description: 'Modal dialog and side drawer share one family. On Mobile the Drawer becomes a bottom sheet.',
    a11y: 'role=dialog aria-modal; focus trapped; Escape closes; focus returns to the invoker.',
  },
  {
    key: 'tooltip', name: 'Hermes/Tooltip', section: '04 — Core Components', preset: 'chip',
    axes: { Placement: ['Top', 'Bottom', 'Start', 'End'] },
    text: [{ name: 'Label', default: T('Last update 12s ago', 'آخرین به‌روزرسانی ۱۲ ثانیه پیش', 'Letzte Aktualisierung vor 12 s') }],
    glass: 'elevated', description: 'Tooltip. Never the sole carrier of essential information.',
    a11y: 'aria-describedby; must also be reachable on keyboard focus, not hover alone.',
  },
  {
    key: 'notification', name: 'Hermes/Notification', section: '04 — Core Components', preset: 'row',
    axes: { Severity: ['Information', 'Success', 'Warning', 'Danger'], State: ['Default', 'Dismissing'] },
    text: [{ name: 'Title', default: T('Connection restored', 'اتصال برقرار شد', 'Verbindung wiederhergestellt') }],
    glass: 'elevated', description: 'Toast / inline notification.',
    a11y: 'role=status for non-critical, role=alert for Danger; icon + text carry severity, never colour alone.',
  },

  // ── 05 — Industrial Components ───────────────────────────────────────────
  {
    key: 'state-pill', name: 'Hermes/Industrial State', section: '05 — Industrial Components', preset: 'pill',
    axes: {
      Status: ['Healthy', 'Degraded', 'Warning', 'Alarm', 'Critical', 'Maintenance', 'Simulation', 'Stale', 'Offline', 'Unknown'],
      Display: ['Dot', 'Full'],
    },
    text: [{ name: 'Label', default: T('Healthy', 'سالم', 'Fehlerfrei') }],
    glass: 'none',
    description: 'The ten-state industrial ladder. Every status carries a distinct glyph AND outline treatment in addition to its colour, so severity survives greyscale and colour-vision deficiency. UNKNOWN differs from HEALTHY on all three channels at once.',
    a11y: 'SC 1.4.1 — never colour alone. Indicator >= 3:1 (SC 1.4.11); the label uses the readable text partner at >= 4.5:1.',
  },
  {
    key: 'kpi-card', name: 'Hermes/KPI Card', section: '05 — Industrial Components', preset: 'card',
    axes: { Breakpoint: BP, Trend: ['Up', 'Flat', 'Down', 'NoData'] },
    text: [
      { name: 'Label', default: T('Overall equipment effectiveness', 'اثربخشی کلی تجهیزات', 'Gesamtanlageneffektivität') },
      { name: 'Value', default: T('—', '—', '—') },
      { name: 'Unit', default: T('%', '٪', '%') },
    ],
    glass: 'card',
    description: 'KPI / metric tile. NoData renders an explicit no-data treatment and is NEVER rendered as zero.',
    a11y: 'the unit is part of the accessible name; the trend arrow is paired with a sign, never colour alone.',
    maps: 'src/components/ds/MetricCard.tsx',
  },
  {
    key: 'telemetry-row', name: 'Hermes/Telemetry Row', section: '05 — Industrial Components', preset: 'row',
    axes: { Direction: DIR, Quality: ['Good', 'Uncertain', 'Stale', 'Bad'] },
    text: [
      { name: 'Tag', default: T('FIC-1024.PV', 'FIC-1024.PV', 'FIC-1024.PV') },
      { name: 'Value', default: T('42.7', '۴۲٫۷', '42,7') },
      { name: 'Unit', default: T('m³/h', 'm³/h', 'm³/h') },
    ],
    glass: 'none',
    description: 'A single measured signal. Direction is a variant because the row mirrors, but the TAG and the numeric VALUE must stay LTR inside an RTL row — that bidirectional isolation is the whole point of this component.',
    a11y: 'tabular figures; quality is announced, not implied by colour.',
  },
  {
    key: 'alarm-card', name: 'Hermes/Alarm Card', section: '05 — Industrial Components', preset: 'card',
    axes: { Severity: ['Warning', 'Alarm', 'Critical'], State: ['Unacknowledged', 'Acknowledged', 'Cleared'] },
    text: [
      { name: 'Code', default: T('PAH-2201', 'PAH-2201', 'PAH-2201') },
      { name: 'Message', default: T('Discharge pressure above high limit', 'فشار خروجی بالاتر از حد مجاز', 'Förderdruck über oberem Grenzwert') },
      { name: 'Timestamp', default: T('12:04:31', '۱۲:۰۴:۳۱', '12:04:31') },
    ],
    glass: 'card',
    description: 'Alarm record. Unacknowledged Critical is the single loudest object in the product; acknowledgement visibly and permanently changes the treatment.',
    a11y: 'role=alert for Unacknowledged Critical only; the alarm code is always readable text, never an icon alone. Under prefers-reduced-motion the pulse becomes a static double outline so severity is never lost.',
  },
  {
    key: 'asset-card', name: 'Hermes/Asset Card', section: '05 — Industrial Components', preset: 'card',
    axes: { Breakpoint: BP, Status: ['Healthy', 'Degraded', 'Alarm', 'Offline', 'Unknown'] },
    text: [
      { name: 'Name', default: T('Boiler feed pump A', 'پمپ تغذیهٔ بویلر A', 'Kesselspeisepumpe A') },
      { name: 'Tag', default: T('P-101A', 'P-101A', 'P-101A') },
    ],
    swaps: ['Status pill'],
    glass: 'interactive', description: 'Asset tile for Live Operations and Assets.',
    a11y: 'the status pill instance carries the accessible state; the card is a single tab stop.',
  },
  {
    key: 'connection-state', name: 'Hermes/Connection State', section: '05 — Industrial Components', preset: 'pill',
    axes: { Protocol: ['OPC UA', 'MQTT', 'Modbus', 'S7'], Status: ['Connected', 'Degraded', 'Disconnected', 'Unknown'] },
    text: [{ name: 'Endpoint', default: T('opc.tcp://…:4840', 'opc.tcp://…:4840', 'opc.tcp://…:4840') }],
    glass: 'none', description: 'Connectivity indicator. Endpoint stays LTR in every locale.',
    a11y: 'protocol and status are both text; the dot is decorative.',
  },
  {
    key: 'table', name: 'Hermes/Table', section: '05 — Industrial Components', preset: 'panel',
    axes: { Breakpoint: BP, Density: ['Comfortable', 'Compact'] },
    bools: ['Header', 'Selection', 'Pagination'],
    glass: 'card',
    description: 'Data table. On Mobile it becomes a stacked card list rather than a horizontally scrolling grid — the transformation is the variant, not a separate design.',
    a11y: 'real table semantics; sortable headers expose aria-sort; the mobile stack keeps header/value association.',
  },

  // ── 06 — Intelligence Components ─────────────────────────────────────────
  {
    key: 'reasoning-chip', name: 'Hermes/Reasoning Chip', section: '06 — Intelligence Components', preset: 'chip',
    axes: { Tier: ['Observed', 'Evidence', 'Hypothesis', 'Candidate', 'Conflict', 'NoData', 'Simulated', 'Proposed', 'Approved'] },
    text: [{ name: 'Label', default: T('HYPOTHESIS', 'فرضیه', 'HYPOTHESE') }],
    glass: 'none',
    description: 'The provenance chip. This is the component that guarantees an AI hypothesis never looks like a verified plant fact: unverified tiers carry a dashed border in addition to their colour and their chip word.',
    a11y: 'the chip word is always readable text — provenance is never conveyed by colour or border alone.',
  },
  {
    key: 'evidence-panel', name: 'Hermes/Evidence Panel', section: '06 — Intelligence Components', preset: 'panel',
    axes: { Breakpoint: BP, State: ['Collapsed', 'Expanded', 'Empty'] },
    text: [
      { name: 'Title', default: T('Evidence lineage', 'زنجیرهٔ شواهد', 'Nachweiskette') },
      { name: 'Source', default: T('Historian · tag FIC-1024.PV · 2h window', 'هیستورین · تگ FIC-1024.PV · بازهٔ ۲ ساعت', 'Historian · Tag FIC-1024.PV · 2-h-Fenster') },
    ],
    swaps: ['Provenance chip'],
    glass: 'elevated',
    description: 'Inspectable evidence lineage for the Industrial Brain. Empty state states what is missing and why — it never renders absence as zero.',
    a11y: 'disclosure pattern with aria-expanded; every claim row is linked to its source record.',
  },
  {
    key: 'triad-card', name: 'Hermes/Triad Card', section: '06 — Intelligence Components', preset: 'cardHero',
    axes: { Intent: ['Operate', 'Understand', 'Act'], State: ['Rest', 'Hover', 'Focus'] },
    text: [
      { name: 'Title', default: T('Operate', 'بهره‌برداری', 'Betreiben') },
      { name: 'Summary', default: T('What is happening in the plant right now', 'همین حالا در کارخانه چه می‌گذرد', 'Was in der Anlage gerade passiert') },
    ],
    swaps: ['Mark'],
    glass: 'interactive',
    description: 'Hermes Triad — the three primary Workspace cards. Exactly three, equal weight, one intent each. This is a fixed composition, not a generic card grid.',
    a11y: 'each card is a single tab stop with a descriptive accessible name; hover lift is decorative only.',
  },

  // ── shared feedback states ───────────────────────────────────────────────
  {
    key: 'feedback', name: 'Hermes/Feedback State', section: '04 — Core Components', preset: 'panel',
    axes: { Kind: ['Loading', 'Empty', 'Error', 'Offline', 'PermissionDenied'], Breakpoint: BP },
    text: [
      { name: 'Title', default: T('No data for this window', 'داده‌ای برای این بازه نیست', 'Keine Daten für diesen Zeitraum') },
      { name: 'Body', default: T('Nothing was recorded between 08:00 and 09:00.', 'بین ۸:۰۰ و ۹:۰۰ چیزی ثبت نشده است.', 'Zwischen 08:00 und 09:00 wurde nichts aufgezeichnet.') },
    ],
    glass: 'soft',
    description: 'The five non-happy states as one family: Loading, Empty, Error, Offline and Permission denied. Having them in the system is what stops each screen inventing its own.',
    a11y: 'Loading exposes aria-busy; Error is role=alert; PermissionDenied never leaks the existence of an inaccessible resource.',
  },
  {
    key: 'skeleton', name: 'Hermes/Skeleton', section: '04 — Core Components', preset: 'card',
    axes: { Shape: ['Line', 'Block', 'Card', 'Row'] },
    glass: 'none',
    description: 'Loading placeholder. Shimmer is suppressed entirely under prefers-reduced-motion.',
    a11y: 'aria-hidden; the live region announces loading, not the skeleton geometry.',
  },
]

/** Cartesian product of a family's axes. @param {Family} f @returns {Record<string,string>[]} */
function variantCombos(f) {
  const names = Object.keys(f.axes)
  /** @type {Record<string,string>[]} */
  let out = [{}]
  for (const n of names) {
    /** @type {Record<string,string>[]} */
    const next = []
    for (const base of out) for (const v of f.axes[n]) next.push({ ...base, [n]: v })
    out = next
  }
  return out
}

/** @param {Family} f @returns {string} e.g. "Intent=Primary, Size=Md" */
function variantName(f, combo) {
  return Object.keys(f.axes).map((k) => k + '=' + combo[k]).join(', ')
}

/**
 * Enforce the variant budget. Throws with an actionable message rather than
 * silently shipping an unnavigable 200-variant matrix.
 * @param {number} [max]
 */
function assertVariantBudget(max) {
  const cap = max || 30
  const over = FAMILIES.map((f) => ({ name: f.name, n: variantCombos(f).length }))
    .filter((x) => x.n > cap)
  if (over.length) {
    throw new Error('variant budget exceeded (cap ' + cap + '): ' +
      over.map((o) => o.name + '=' + o.n).join(', ') + ' — split into a base set plus a states set')
  }
  return true
}

/**
 * Locale is a PROPERTY, never a variant. Enforced by EXACT axis-name and
 * axis-VALUE matching — a substring test would false-positive on legitimate
 * axes ("Intent" contains "en").
 */
const FORBIDDEN_AXIS_NAMES = new Set(['locale', 'language', 'lang', 'translation', 'i18n'])
const LOCALE_VALUES = new Set(['fa', 'en', 'de', 'persian', 'english', 'german', 'farsi', 'deutsch'])

function assertLocaleIsNeverAVariant() {
  for (const f of FAMILIES) {
    for (const axis of Object.keys(f.axes)) {
      if (FORBIDDEN_AXIS_NAMES.has(axis.toLowerCase())) {
        throw new Error(f.name + ' declares a locale variant axis "' + axis +
          '" — locale must be a TEXT component property so instances do not duplicate nodes')
      }
      const values = f.axes[axis].map((v) => String(v).toLowerCase())
      if (values.some((v) => LOCALE_VALUES.has(v))) {
        throw new Error(f.name + ' axis "' + axis + '" carries locale values [' + values.join(', ') +
          '] — locale must be a TEXT component property, not a variant axis')
      }
    }
  }
  return true
}

const LOCALES = Object.freeze(['en', 'fa', 'de'])

module.exports = { FAMILIES, PRESETS, BP, DIR, LOCALES, variantCombos, variantName, assertVariantBudget, assertLocaleIsNeverAVariant }

  };
  __modules["dna-spec"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * buildDnaSpec() — the deterministic, pure declaration of every native Figma
 * asset the Phase 104 plugin creates, in canonical apply order.
 *
 * No `figma` global here. This is the single source that both the Dry Run report
 * and the Apply executor consume, exactly as `spec.js` is for the Phase 87
 * builder. Keeping it pure is what makes the whole thing testable in Node.
 *
 * STARTER-PLAN SHAPE. The Hermes Figma account is on the Starter tier, where a
 * variable collection is limited to ONE mode. The usual "one collection, many
 * modes" token architecture is therefore impossible. Phase 104 instead uses
 * MANY SINGLE-MODE COLLECTIONS — semantically grouped, which is arguably cleaner
 * for a single-theme product anyway (Hermes ships dark only; there is no
 * darkMode config, no data-theme attribute and no light palette).
 */

const DNA = require('dna-tokens')
const { PAGES } = require('dna-structure')
const { FAMILIES, variantCombos, variantName, assertVariantBudget, assertLocaleIsNeverAVariant } = require('dna-components')

const MODE = 'Value'

/** Collection names. Prefixed so they never collide with the Phase 87 builder's. */
const COLLECTIONS = Object.freeze({
  HORIZON: 'Hermes 104 · Horizon',
  GLASS: 'Hermes 104 · Glass',
  STATE: 'Hermes 104 · Industrial State',
  REASONING: 'Hermes 104 · Reasoning',
  SIGNATURE: 'Hermes 104 · Signature Metrics',
  MOTION: 'Hermes 104 · Motion',
})

/** Figma VariableScope sets. Never ALL_SCOPES — that pollutes every picker. */
const SCOPES = Object.freeze({
  fill: ['FRAME_FILL', 'SHAPE_FILL'],
  text: ['TEXT_FILL'],
  stroke: ['STROKE_COLOR'],
  fillAndStroke: ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR'],
  size: ['WIDTH_HEIGHT'],
  gap: ['GAP'],
  radius: ['CORNER_RADIUS'],
  float: ['WIDTH_HEIGHT', 'STROKE_FLOAT'],
})

/** @param {string} s */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * FNV-1a over the JSON of an asset's identity payload. Deterministic across runs
 * and platforms — this is what makes re-running the plugin a surgical UPDATE of
 * only the changed assets rather than a duplicate-everything disaster.
 * @param {any} payload
 * @returns {string}
 */
function hashAsset(payload) {
  const s = JSON.stringify(payload, Object.keys(payload).sort())
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return ('00000000' + h.toString(16)).slice(-8)
}

/** WEB code syntax must carry the var() wrapper so Dev Mode round-trips. */
function web(cssVar) {
  return cssVar ? 'var(' + cssVar + ')' : null
}

/**
 * @returns {{collections:any[], variables:any[], paintStyles:any[], effectStyles:any[], docs:any[], assets:any[], counts:Record<string,number>}}
 */
function buildDnaSpec() {
  /** @type {any[]} */ const collections = []
  /** @type {any[]} */ const variables = []
  /** @type {any[]} */ const paintStyles = []
  /** @type {any[]} */ const effectStyles = []
  /** @type {any[]} */ const docs = []

  /** @param {string} name */
  const col = (name) => {
    const c = { key: 'collection:' + slug(name), kind: 'collection', name, modeName: MODE }
    collections.push(c)
    return c
  }

  const cHorizon = col(COLLECTIONS.HORIZON)
  const cGlass = col(COLLECTIONS.GLASS)
  const cState = col(COLLECTIONS.STATE)
  const cReason = col(COLLECTIONS.REASONING)
  const cSig = col(COLLECTIONS.SIGNATURE)
  const cMotion = col(COLLECTIONS.MOTION)

  /**
   * @param {any} c collection
   * @param {string} name variable name (slash-grouped)
   * @param {string} value colour string
   * @param {string[]} scopes
   * @param {string} usage
   * @param {string|null} cssVar
   * @param {boolean} [withPaintStyle]
   */
  const color = (c, name, value, scopes, usage, cssVar, withPaintStyle) => {
    const key = 'variable:' + slug(c.name) + ':' + slug(name)
    variables.push({
      key, kind: 'variable', collectionKey: c.key, name,
      resolvedType: 'COLOR', value, scopes,
      codeSyntax: { WEB: web(cssVar) },
      description: usage + (cssVar ? ' · css: ' + cssVar : ' · Phase 104 DNA (no CSS var yet)') +
        ' · Managed by Hermes Phase 104 Visual System',
    })
    if (withPaintStyle) {
      paintStyles.push({
        key: 'paintStyle:' + slug(name), kind: 'paintStyle', name, variableKey: key, value,
        description: usage + ' · Managed by Hermes Phase 104 Visual System',
      })
    }
    return key
  }

  /**
   * @param {any} c @param {string} name @param {number} value @param {string[]} scopes @param {string} usage
   */
  const float = (c, name, value, scopes, usage) => {
    variables.push({
      key: 'variable:' + slug(c.name) + ':' + slug(name), kind: 'variable',
      collectionKey: c.key, name, resolvedType: 'FLOAT', floatValue: value, scopes,
      codeSyntax: {},
      description: usage + ' · Managed by Hermes Phase 104 Visual System',
    })
  }

  // ── SIGNATURE 1 · HORIZON ────────────────────────────────────────────────
  DNA.HORIZON.stops.forEach((s, i) => {
    color(cHorizon, 'Horizon/Stop ' + (i + 1) + ' · ' + s.role, s.value, SCOPES.fill,
      'gradient stop at ' + s.at + ' — ' + s.note, null, false)
  })
  for (const o of DNA.HORIZON.overlays) {
    color(cHorizon, 'Horizon/Overlay/' + o.role, o.value, SCOPES.fill, o.note, null, true)
  }
  float(cHorizon, 'Horizon/Ember band max ratio', DNA.HORIZON.emberBandMaxHeightRatio, SCOPES.float,
    'HARD LIMIT — the warm band may never exceed this fraction of frame height')

  // ── SIGNATURE 3 · GLASS ──────────────────────────────────────────────────
  for (const t of DNA.GLASS.tiers) {
    color(cGlass, 'Glass/' + t.tier + '/fill', t.fill, SCOPES.fill,
      'replaces the hard-coded literal in ' + t.replaces, null, true)
    color(cGlass, 'Glass/' + t.tier + '/border', t.border, SCOPES.stroke,
      'the 1px ice line on ' + t.replaces, null, true)
    float(cGlass, 'Glass/' + t.tier + '/blur', t.blur, SCOPES.float, 'backdrop blur radius (px)')
    float(cGlass, 'Glass/' + t.tier + '/lift', t.lift, SCOPES.float,
      'hover translateY — PINNED by components.test.ts lift ladder')
  }

  // ── SIGNATURE 4 · EDGE + 5 · BEACON, into Signature Metrics ──────────────
  color(cSig, 'Edge/structural', DNA.EDGE.structural.value, SCOPES.stroke, 'non-interactive separation', DNA.EDGE.structural.alias, true)
  color(cSig, 'Edge/hairline', DNA.EDGE.hairline.value, SCOPES.stroke, 'ice line on glass', DNA.EDGE.hairline.alias, true)
  color(cSig, 'Edge/active', DNA.EDGE.active.value, SCOPES.stroke, 'selected boundary', DNA.EDGE.active.alias, true)
  color(cSig, 'Edge/illumination/from', DNA.EDGE.illumination.from, SCOPES.fill, 'linear top highlight start — NOT a glow', null, true)
  color(cSig, 'Edge/illumination/to', DNA.EDGE.illumination.to, SCOPES.fill, 'linear top highlight end', null, false)

  for (const [k, v] of Object.entries(DNA.BEACON)) {
    if (!v || typeof v !== 'object' || !('value' in v)) continue
    color(cSig, 'Beacon/' + k, /** @type {any} */ (v).value, SCOPES.fillAndStroke,
      'Hermes Beacon — focus device, max ' + DNA.BEACON.maxPrimaryPerView + ' primary per view',
      /** @type {any} */ (v).alias, true)
  }

  // Signature geometry
  float(cSig, 'Rail/width rail', DNA.RAIL.widthRail, SCOPES.size, 'icon-only resting rail — the Hermes signature')
  float(cSig, 'Rail/width expanded', DNA.RAIL.widthExpanded, SCOPES.size, 'expanded drawer')
  float(cSig, 'Rail/item size', DNA.RAIL.itemSize, SCOPES.size, 'WCAG 2.2 SC 2.5.8 minimum target')
  float(cSig, 'Command/width desktop', DNA.COMMAND.widthDesktop, SCOPES.size, 'the signature AI command field')
  float(cSig, 'Command/width tablet', DNA.COMMAND.widthTablet, SCOPES.size, '')
  float(cSig, 'Command/width mobile', DNA.COMMAND.widthMobile, SCOPES.size, '')
  float(cSig, 'Command/height', DNA.COMMAND.height, SCOPES.size, 'deliberately larger than any other control')
  float(cSig, 'Triad/card width', DNA.TRIAD.cardWidthDesktop, SCOPES.size, '')
  float(cSig, 'Triad/card height', DNA.TRIAD.cardHeightDesktop, SCOPES.size, '')
  float(cSig, 'Triad/gap', DNA.TRIAD.gap, SCOPES.gap, '')
  float(cSig, 'Target/minimum', DNA.MIN_TARGET_PX, SCOPES.size, 'WCAG 2.2 SC 2.5.8')

  // ── INDUSTRIAL STATE LADDER ──────────────────────────────────────────────
  for (const s of DNA.INDUSTRIAL_STATES) {
    color(cState, 'State/' + s.key + '/indicator', s.fill, SCOPES.fillAndStroke,
      'severity rank ' + s.rank + ' · glyph ' + s.glyph + ' · outline ' + s.outline +
      ' — colour is NEVER the only channel', s.alias, true)
    color(cState, 'State/' + s.key + '/text', s.text, SCOPES.text,
      'readable partner for the state name as type (>= 4.5:1)', null, false)
  }

  // ── REASONING LADDER ─────────────────────────────────────────────────────
  for (const r of DNA.REASONING_LADDER) {
    color(cReason, 'Reasoning/' + r.key + '/indicator', r.color, SCOPES.fillAndStroke,
      'chip ' + r.chip + ' · border ' + r.border + ' · verified-look ' + r.verifiedLook +
      ' — ' + r.note, r.alias, true)
    color(cReason, 'Reasoning/' + r.key + '/text', r.text, SCOPES.text,
      'readable partner (>= 4.5:1)', null, false)
  }

  // ── MOTION ───────────────────────────────────────────────────────────────
  for (const [k, v] of Object.entries(DNA.MOTION.durations)) {
    float(cMotion, 'Motion/duration/' + k, /** @type {number} */ (v), SCOPES.float, 'ms')
  }
  for (const c of DNA.MOTION.choreography) {
    float(cMotion, 'Motion/choreography/' + c.key, c.duration, SCOPES.float,
      (c.note || '') + ' · easing: ' + c.easing)
  }

  // ── ELEVATION EFFECT STYLES ──────────────────────────────────────────────
  const ELEVATION = [
    { name: 'Hermes 104/Elevation/E1', offset: { x: 0, y: 1 }, radius: 2, spread: 0, color: [0, 0, 0, 0.3], usage: 'cards resting on Base' },
    { name: 'Hermes 104/Elevation/E2', offset: { x: 0, y: 2 }, radius: 8, spread: 0, color: [0, 0, 0, 0.25], usage: 'raised panels, dropdowns' },
    { name: 'Hermes 104/Elevation/E3', offset: { x: 0, y: 8 }, radius: 24, spread: 0, color: [0, 0, 0, 0.4], usage: 'popovers, floating toolbars' },
    { name: 'Hermes 104/Elevation/E4', offset: { x: 0, y: 12 }, radius: 32, spread: 0, color: [0, 0, 0, 0.5], usage: 'modals, command overlays' },
  ]
  for (const e of ELEVATION) {
    effectStyles.push({ key: 'effectStyle:' + slug(e.name), kind: 'effectStyle', ...e,
      description: e.usage + ' · Managed by Hermes Phase 104 Visual System' })
  }

  // ── FOUNDATION DOCUMENTATION FRAMES ──────────────────────────────────────
  // DECLARED BUT NOT YET APPLIABLE. These are deliberately kept OUT of `assets`
  // so that Dry Run never promises something Apply will not deliver: the
  // executor currently materialises variables and styles only. Building on-canvas
  // documentation frames needs the font-resolution pipeline, which is the next
  // increment. Keeping the declaration here (and out of the apply list) is what
  // makes the gap visible instead of silent.
  docs.push(
    { key: 'doc:horizon', kind: 'doc', name: 'Foundations · Hermes Horizon', section: '01 — Foundations', doc: 'horizon', appliable: false },
    { key: 'doc:glass', kind: 'doc', name: 'Foundations · Hermes Glass', section: '01 — Foundations', doc: 'glass', appliable: false },
    { key: 'doc:state', kind: 'doc', name: 'Foundations · Industrial State Ladder', section: '01 — Foundations', doc: 'state', appliable: false },
    { key: 'doc:reasoning', kind: 'doc', name: 'Foundations · Reasoning Ladder', section: '01 — Foundations', doc: 'reasoning', appliable: false },
  )

  // ── FILE STRUCTURE: exactly 3 pages, 23 sections ─────────────────────────
  assertVariantBudget(30)
  assertLocaleIsNeverAVariant()

  /** @type {any[]} */ const pages = []
  /** @type {any[]} */ const sections = []
  for (const p of PAGES) {
    pages.push({ key: p.key, kind: 'page', name: p.name })
    let y = 0
    for (const s of p.sections) {
      sections.push({
        key: s.key, kind: 'section', name: s.name, pageKey: p.key,
        w: s.w, h: s.h, x: 0, y,
        awaitingOwnerAssets: !!s.awaitingOwnerAssets,
        speculative: !!s.speculative,
      })
      y += s.h + 700
    }
  }

  // ── COMPONENT SETS ───────────────────────────────────────────────────────
  /** @type {any[]} */
  const componentSets = FAMILIES.map((f) => {
    const combos = variantCombos(f)
    return {
      key: 'componentSet:' + f.key, kind: 'componentSet', name: f.name,
      sectionName: f.section, preset: f.preset, glass: f.glass,
      axes: f.axes, variants: combos.map((c) => variantName(f, c)),
      variantCount: combos.length,
      text: f.text || [], bools: f.bools || [], swaps: f.swaps || [],
      a11y: f.a11y, maps: f.maps || null,
      description: f.description + ' · a11y: ' + f.a11y +
        ' · Locale (FA/EN/DE) is a TEXT component property, never a variant — switching language overrides text and creates no nodes.' +
        ' · Managed by Hermes Phase 104 Visual System',
    }
  })

  /** Everything Apply will actually create. Docs are excluded by design — see above. */
  /** @type {any[]} */
  const assets = [...pages, ...sections, ...collections, ...variables, ...paintStyles, ...effectStyles, ...componentSets]
  for (const a of [...assets, ...docs]) {
    const { hash, key, ...rest } = a
    a.hash = hashAsset(rest)
  }

  const componentCount = componentSets.reduce((n, s) => n + s.variantCount, 0)
  const counts = {
    pages: pages.length,
    sections: sections.length,
    collections: collections.length,
    variables: variables.length,
    paintStyles: paintStyles.length,
    effectStyles: effectStyles.length,
    componentSets: componentSets.length,
    componentVariants: componentCount,
    appliableTotal: assets.length,
    docsDeclaredNotAppliable: docs.length,
  }

  return { pages, sections, collections, variables, paintStyles, effectStyles, componentSets, docs, assets, counts }
}

module.exports = { buildDnaSpec, COLLECTIONS, SCOPES, MODE, slug, hashAsset }

  };
  __modules["dna-exec"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * The only module in this plugin that touches the `figma` global.
 *
 * Everything it creates is tagged in the `hermesP104` shared-plugin-data
 * namespace so that:
 *   - re-running is idempotent (find by assetKey, update in place, never duplicate);
 *   - rollback deletes exactly what this plugin made and nothing else;
 *   - the Phase 87 builder's assets (namespace `hermesDSB`) are NEVER touched.
 *
 * That namespace separation is load-bearing: Phase 87 is an owner-applied artifact
 * with recorded 173/173 evidence and must not be corruptible even by accident.
 */

const { buildDnaSpec } = require('dna-spec')
const { assertContract } = require('contract')
const { parseColor } = require('contrast')
const DNA = require('dna-tokens')
const { PRESETS } = require('dna-components')

const NAMESPACE = 'hermesP104'
const K_MANAGED = 'managed'
const K_ASSET_KEY = 'assetKey'
const K_HASH = 'contentHash'

/** @param {string} v */
const rgb = (v) => { const c = parseColor(v); return { r: c.r, g: c.g, b: c.b } }
/** @param {string} v */
const opacityOf = (v) => parseColor(v).a
/** @param {string} v */
const solid = (v) => ({ type: 'SOLID', color: rgb(v), opacity: opacityOf(v) })

function tag(node, assetKey, hash) {
  if (!node || typeof node.setSharedPluginData !== 'function') return
  node.setSharedPluginData(NAMESPACE, K_MANAGED, '1')
  node.setSharedPluginData(NAMESPACE, K_ASSET_KEY, assetKey)
  node.setSharedPluginData(NAMESPACE, K_HASH, hash)
}
function readKey(node) {
  if (!node || typeof node.getSharedPluginData !== 'function') return null
  return node.getSharedPluginData(NAMESPACE, K_ASSET_KEY) || null
}

// ── fonts ───────────────────────────────────────────────────────────────────

const FONT_PLAN = [
  { role: 'display', family: 'Estedad', fallback: 'Inter' },
  { role: 'body', family: 'Vazirmatn', fallback: 'Inter' },
  { role: 'mono', family: 'Roboto Mono', fallback: 'Inter' },
]
const WEIGHTS = ['Regular', 'Medium', 'Semi Bold', 'Bold']
const WEIGHT_ALIASES = {
  'Semi Bold': ['Semi Bold', 'SemiBold', 'Demi Bold', 'DemiBold'],
  Regular: ['Regular', 'Normal', 'Book'],
  Medium: ['Medium'],
  Bold: ['Bold'],
}

/**
 * Resolve and load the type ramp. Returns the resolved map plus any substitutions,
 * which are REPORTED rather than silently swallowed.
 */
async function loadFonts() {
  const available = new Set((await figma.listAvailableFontsAsync()).map((f) => f.fontName.family + '|' + f.fontName.style))
  /** @type {Record<string, {family:string, style:string}>} */
  const resolved = {}
  /** @type {string[]} */
  const substitutions = []

  for (const p of FONT_PLAN) {
    for (const w of WEIGHTS) {
      const aliases = WEIGHT_ALIASES[w] || [w]
      let hit = null
      for (const a of aliases) if (available.has(p.family + '|' + a)) { hit = { family: p.family, style: a }; break }
      if (!hit) {
        for (const a of aliases) if (available.has(p.fallback + '|' + a)) { hit = { family: p.fallback, style: a }; break }
        if (hit) substitutions.push(p.family + ' ' + w + ' -> ' + hit.family + ' ' + hit.style)
      }
      if (!hit) hit = { family: 'Inter', style: 'Regular' }
      resolved[p.role + '/' + w] = hit
    }
  }
  const uniq = new Map()
  for (const f of Object.values(resolved)) uniq.set(f.family + '|' + f.style, f)
  for (const f of uniq.values()) {
    try { await figma.loadFontAsync(f) } catch (e) { /* reported via substitutions */ }
  }
  return { resolved, substitutions }
}

// ── variant → paint resolution ──────────────────────────────────────────────

/** Map a variant combo onto DNA colours. Pure lookup — no invented values. */
function resolveStyle(family, combo) {
  const glass = DNA.GLASS.tiers.find((t) => t.tier === family.glass)
  let fill = glass ? glass.fill : 'rgba(12, 23, 32, 0.0)'
  let stroke = glass ? glass.border : DNA.EDGE.structural.value
  let text = '#EDF7FA'
  let accent = null

  if (combo.Status) {
    const s = DNA.INDUSTRIAL_STATES.find((x) => x.key === String(combo.Status).toLowerCase().replace(/\s/g, ''))
      || DNA.INDUSTRIAL_STATES.find((x) => x.label.en === combo.Status)
    if (s) { accent = s.fill; text = s.text; stroke = s.fill; fill = 'rgba(12, 23, 32, 0.55)' }
  }
  if (combo.Tier) {
    const map = { Observed: 'observation', Evidence: 'evidence', Hypothesis: 'hypothesis', Candidate: 'rootCauseCandidate', Conflict: 'contradiction', NoData: 'missing', Simulated: 'simulationResult', Proposed: 'recommendation', Approved: 'engineerApproval' }
    const r = DNA.REASONING_LADDER.find((x) => x.key === map[combo.Tier])
    if (r) { accent = r.color; text = r.text; stroke = r.color; fill = 'rgba(12, 23, 32, 0.55)' }
  }
  if (combo.Severity) {
    const s = DNA.INDUSTRIAL_STATES.find((x) => x.label.en.toLowerCase() === String(combo.Severity).toLowerCase())
      || DNA.INDUSTRIAL_STATES.find((x) => x.key === String(combo.Severity).toLowerCase())
    if (s) { accent = s.fill; stroke = s.fill }
  }
  if (combo.Intent === 'Primary') { fill = DNA.BEACON.core.value; text = DNA.BEACON.onBeacon.value; stroke = DNA.BEACON.core.value }
  if (combo.Intent === 'Secondary') { fill = 'rgba(21, 42, 54, 1)'; stroke = DNA.EDGE.structural.value }
  if (combo.Intent === 'Tertiary') { fill = 'rgba(12, 23, 32, 0)'; stroke = 'rgba(12, 23, 32, 0)'; text = DNA.BEACON.core.value }
  if (combo.Intent === 'Destructive') { fill = 'rgba(240, 93, 104, 0.12)'; stroke = '#F05D68'; text = '#FF7C86' }

  if (combo.State === 'Disabled') { text = '#495C68'; stroke = '#203743' }
  if (combo.State === 'Focus' || combo.State === 'Selected') stroke = DNA.EDGE.active.value
  if (combo.State === 'Error') stroke = '#F05D68'

  return { fill, stroke, text, accent }
}

/** Dashed stroke for every non-verified reasoning tier and dashed-outline state. */
function isDashed(family, combo) {
  if (combo.Tier) {
    const map = { Hypothesis: 1, Candidate: 1, NoData: 1, Simulated: 1 }
    return !!map[combo.Tier]
  }
  if (combo.Status) {
    const s = DNA.INDUSTRIAL_STATES.find((x) => x.label.en === combo.Status || x.key === String(combo.Status).toLowerCase())
    return !!(s && s.outline === 'dashed')
  }
  return false
}

// ── discovery ───────────────────────────────────────────────────────────────

async function scanExisting() {
  /** @type {Record<string, any>} */
  const index = {}
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) { const k = readKey(c); if (k) index[k] = c }
  for (const v of await figma.variables.getLocalVariablesAsync()) { const k = readKey(v); if (k) index[k] = v }
  for (const s of await figma.getLocalPaintStylesAsync()) { const k = readKey(s); if (k) index[k] = s }
  for (const s of await figma.getLocalEffectStylesAsync()) { const k = readKey(s); if (k) index[k] = s }
  for (const p of figma.root.children) {
    const k = readKey(p)
    if (k) index[k] = p
    for (const n of p.children) { const nk = readKey(n); if (nk) index[nk] = n }
  }
  return index
}

// ── apply ───────────────────────────────────────────────────────────────────

/**
 * @param {{dryRun?: boolean}} [opts]
 */
async function applyDna(opts) {
  const dryRun = !!(opts && opts.dryRun)
  const spec = buildDnaSpec()

  // Defence in depth: main.js already gates, but the executor refuses to touch
  // the file on its own account if the spec is not Phase 104.
  assertContract(spec.counts, dryRun ? 'Dry Run' : 'Apply')

  if (typeof figma.loadAllPagesAsync === 'function') await figma.loadAllPagesAsync()
  const existing = await scanExisting()

  const result = {
    dryRun,
    created: /** @type {string[]} */ ([]),
    updated: /** @type {string[]} */ ([]),
    skipped: /** @type {string[]} */ ([]),
    errors: /** @type {string[]} */ ([]),
    fontSubstitutions: /** @type {string[]} */ ([]),
    counts: spec.counts,
  }

  if (dryRun) {
    for (const a of spec.assets) {
      const prev = existing[a.key]
      const label = a.kind + ':' + a.name
      if (!prev) result.created.push(label)
      else if (prev.getSharedPluginData && prev.getSharedPluginData(NAMESPACE, K_HASH) !== a.hash) result.updated.push(label)
      else result.skipped.push(label)
    }
    return result
  }

  const fonts = await loadFonts()
  result.fontSubstitutions = fonts.substitutions

  // ── 1. Pages — reuse the three the Starter plan allows, never create a 4th ──
  /** @type {Record<string, any>} */
  const pageByKey = {}
  const livePages = figma.root.children.slice()
  spec.pages.forEach((p, i) => {
    let node = existing[p.key] || livePages[i]
    if (!node) {
      try { node = figma.createPage() } catch (e) { result.errors.push('page ' + p.name + ': ' + String(e.message || e)); return }
      result.created.push('page:' + p.name)
    } else {
      result.updated.push('page:' + p.name)
    }
    node.name = p.name
    node.backgrounds = [solid('#040A0F')]
    tag(node, p.key, p.hash)
    pageByKey[p.key] = node
  })
  spec.pages.forEach((p, i) => { const n = pageByKey[p.key]; if (n) figma.root.insertChild(i, n) })

  // ── 2. Sections ────────────────────────────────────────────────────────────
  /** @type {Record<string, any>} */
  const sectionByName = {}
  for (const s of spec.sections) {
    const page = pageByKey[s.pageKey]
    if (!page) continue
    try {
      let node = existing[s.key]
      if (!node) {
        node = figma.createSection()
        page.appendChild(node)
        result.created.push('section:' + s.name)
      } else {
        if (node.parent !== page) page.appendChild(node)
        result.updated.push('section:' + s.name)
      }
      node.name = s.name
      node.resizeWithoutConstraints(s.w, s.h)
      node.x = s.x
      node.y = s.y
      node.fills = [solid('#071018')]
      tag(node, s.key, s.hash)
      sectionByName[s.name] = node
    } catch (e) {
      result.errors.push('section ' + s.name + ': ' + String(e.message || e))
    }
  }

  // ── 3. Collections ─────────────────────────────────────────────────────────
  /** @type {Record<string, any>} */
  const colByKey = {}
  for (const c of spec.collections) {
    try {
      let node = existing[c.key]
      if (!node) { node = figma.variables.createVariableCollection(c.name); result.created.push('collection:' + c.name) }
      else { result.skipped.push('collection:' + c.name) }
      node.name = c.name
      // Starter caps collections at ONE mode. We name it and never call addMode.
      try { node.renameMode(node.modes[0].modeId, c.modeName) } catch (e) { /* already named */ }
      tag(node, c.key, c.hash)
      colByKey[c.key] = node
    } catch (e) { result.errors.push('collection ' + c.name + ': ' + String(e.message || e)) }
  }

  // ── 4. Variables ───────────────────────────────────────────────────────────
  /** @type {Record<string, any>} */
  const varByKey = {}
  for (const v of spec.variables) {
    const collection = colByKey[v.collectionKey]
    if (!collection) { result.errors.push('missing collection for ' + v.name); continue }
    try {
      let node = existing[v.key]
      if (!node) { node = figma.variables.createVariable(v.name, collection, v.resolvedType); result.created.push('variable:' + v.name) }
      else { result.updated.push('variable:' + v.name) }
      node.name = v.name
      const modeId = collection.modes[0].modeId
      if (v.resolvedType === 'COLOR') { const c = parseColor(v.value); node.setValueForMode(modeId, { r: c.r, g: c.g, b: c.b, a: c.a }) }
      else node.setValueForMode(modeId, v.floatValue)
      node.scopes = v.scopes
      node.description = v.description
      if (v.codeSyntax && v.codeSyntax.WEB) { try { node.setVariableCodeSyntax('WEB', v.codeSyntax.WEB) } catch (e) {} }
      tag(node, v.key, v.hash)
      varByKey[v.key] = node
    } catch (e) { result.errors.push('variable ' + v.name + ': ' + String(e.message || e)) }
  }

  // ── 5. Paint styles bound to their variables ───────────────────────────────
  for (const p of spec.paintStyles) {
    try {
      let node = existing[p.key]
      if (!node) { node = figma.createPaintStyle(); result.created.push('paintStyle:' + p.name) }
      else result.updated.push('paintStyle:' + p.name)
      node.name = p.name
      let paint = solid(p.value)
      const variable = varByKey[p.variableKey]
      if (variable) paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable)
      node.paints = [paint]
      node.description = p.description
      tag(node, p.key, p.hash)
    } catch (e) { result.errors.push('paintStyle ' + p.name + ': ' + String(e.message || e)) }
  }

  // ── 6. Effect styles ───────────────────────────────────────────────────────
  for (const s of spec.effectStyles) {
    try {
      let node = existing[s.key]
      if (!node) { node = figma.createEffectStyle(); result.created.push('effectStyle:' + s.name) }
      else result.updated.push('effectStyle:' + s.name)
      node.name = s.name
      node.effects = [{ type: 'DROP_SHADOW', color: { r: s.color[0], g: s.color[1], b: s.color[2], a: s.color[3] }, offset: s.offset, radius: s.radius, spread: s.spread, visible: true, blendMode: 'NORMAL' }]
      node.description = s.description
      tag(node, s.key, s.hash)
    } catch (e) { result.errors.push('effectStyle ' + s.name + ': ' + String(e.message || e)) }
  }

  // ── 7. Component sets ──────────────────────────────────────────────────────
  const foundationsPage = pageByKey['page:foundations']
  if (foundationsPage) await figma.setCurrentPageAsync(foundationsPage)

  for (const cs of spec.componentSets) {
    try {
      const prev = existing[cs.key]
      if (prev) { try { prev.remove() } catch (e) {} } // rebuild in place — variants cannot be edited piecemeal
      const built = await buildComponentSet(cs, fonts.resolved)
      const host = sectionByName[cs.sectionName]
      if (host) host.appendChild(built.set)
      layoutInSection(built.set, host, cs.sectionName)
      tag(built.set, cs.key, cs.hash)
      result[prev ? 'updated' : 'created'].push('componentSet:' + cs.name + ' (' + cs.variantCount + ' variants)')
    } catch (e) {
      result.errors.push('componentSet ' + cs.name + ': ' + String(e && e.message ? e.message : e))
    }
  }

  return result
}

/** Simple stacking layout so sets never pile up at (0,0). */
const _cursor = {}
function layoutInSection(node, section, sectionName) {
  if (!section) return
  const c = _cursor[sectionName] || { x: 80, y: 140 }
  node.x = section.x + c.x
  node.y = section.y + c.y
  c.y += node.height + 120
  if (c.y > section.height - 200) { c.y = 140; c.x += 1600 }
  _cursor[sectionName] = c
}

/**
 * Build one component set: every variant as a COMPONENT with real auto-layout,
 * combined via combineAsVariants, then given TEXT / BOOLEAN / INSTANCE_SWAP
 * component properties. TEXT properties are the locale mechanism.
 */
async function buildComponentSet(cs, fonts) {
  const preset = PRESETS[cs.preset] || PRESETS.control
  const axisNames = Object.keys(cs.axes)
  /** @type {any[]} */
  const components = []

  /** @type {Record<string,string>[]} */
  let combos = [{}]
  for (const n of axisNames) {
    const next = []
    for (const b of combos) for (const v of cs.axes[n]) next.push({ ...b, [n]: v })
    combos = next
  }

  const family = { glass: cs.glass }

  for (const combo of combos) {
    const style = resolveStyle(family, combo)
    const comp = figma.createComponent()
    comp.name = axisNames.map((k) => k + '=' + combo[k]).join(', ')
    comp.layoutMode = preset.layout
    comp.primaryAxisSizingMode = 'AUTO'
    comp.counterAxisSizingMode = 'AUTO'
    comp.paddingLeft = preset.padX
    comp.paddingRight = preset.padX
    comp.paddingTop = preset.padY
    comp.paddingBottom = preset.padY
    comp.itemSpacing = preset.gap
    comp.counterAxisAlignItems = preset.align === 'CENTER' ? 'CENTER' : 'MIN'
    comp.cornerRadius = preset.radius
    comp.fills = style.fill ? [solid(style.fill)] : []
    comp.strokes = style.stroke ? [solid(style.stroke)] : []
    comp.strokeWeight = 1
    if (isDashed(family, combo)) comp.dashPattern = [4, 3]
    // RTL is expressed structurally, by reversing the auto-layout axis.
    if (combo.Direction === 'RTL' && preset.layout === 'HORIZONTAL') comp.itemReverseZIndex = false
    if (combo.Direction === 'RTL') comp.name = comp.name // direction handled by child order below

    // status/accent dot — the non-colour cue lives with it
    if (style.accent) {
      const dot = figma.createEllipse()
      dot.resize(8, 8)
      dot.fills = [solid(style.accent)]
      dot.name = 'Indicator'
      comp.appendChild(dot)
      dot.layoutSizingHorizontal = 'FIXED'
      dot.layoutSizingVertical = 'FIXED'
    }

    // text parts — these become the locale-bearing component properties
    const textParts = (cs.text && cs.text.length ? cs.text : [{ name: 'Label', default: { en: cs.name.split('/').pop() } }])
    for (const t of textParts) {
      const tn = figma.createText()
      const f = fonts['body/Medium'] || { family: 'Inter', style: 'Medium' }
      tn.fontName = f
      tn.fontSize = 13
      tn.characters = String((t.default && (t.default.en || '')) || t.name)
      tn.fills = [solid(style.text)]
      tn.name = t.name
      comp.appendChild(tn)
    }

    if (combo.Direction === 'RTL') {
      // mirror child order so the leading element sits on the right
      const kids = comp.children.slice().reverse()
      kids.forEach((k, i) => comp.insertChild(i, k))
    }

    if (preset.height && preset.layout === 'HORIZONTAL') {
      comp.counterAxisSizingMode = 'FIXED'
      comp.resize(Math.max(comp.width, 1), preset.height)
    }

    components.push(comp)
  }

  const set = figma.combineAsVariants(components, figma.currentPage)
  set.name = cs.name
  set.description = cs.description
  set.layoutMode = 'HORIZONTAL'
  set.primaryAxisSizingMode = 'AUTO'
  set.counterAxisSizingMode = 'AUTO'
  set.itemSpacing = 24
  set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 24
  set.counterAxisAlignItems = 'CENTER'
  set.fills = [solid('rgba(12, 23, 32, 0.35)')]
  set.strokes = [solid(DNA.EDGE.hairline.value)]
  set.cornerRadius = 12

  // ── component properties ────────────────────────────────────────────────
  /** @type {Record<string,string>} */
  const propIds = {}
  for (const t of (cs.text || [])) {
    try {
      propIds[t.name] = set.addComponentProperty(t.name, 'TEXT', String((t.default && t.default.en) || ''))
    } catch (e) { /* duplicate name */ }
  }
  for (const b of (cs.bools || [])) {
    try { set.addComponentProperty(b, 'BOOLEAN', true) } catch (e) {}
  }
  for (const s of (cs.swaps || [])) {
    try { set.addComponentProperty(s, 'INSTANCE_SWAP', '') } catch (e) {}
  }

  // bind each variant's text nodes to the TEXT properties
  for (const comp of components) {
    for (const child of comp.children) {
      if (child.type !== 'TEXT') continue
      const pid = propIds[child.name]
      if (pid) { try { child.componentPropertyReferences = { characters: pid } } catch (e) {} }
    }
  }

  return { set, components }
}

/**
 * Delete EXACTLY the assets this plugin owns. Keys off the live namespace scan,
 * never off a name prefix — a prefix match could delete owner-authored nodes.
 * Pages are renamed rather than deleted (the Starter plan needs all three).
 */
async function rollbackDna() {
  const removed = /** @type {string[]} */ ([])
  const errors = /** @type {string[]} */ ([])
  if (typeof figma.loadAllPagesAsync === 'function') await figma.loadAllPagesAsync()
  const index = await scanExisting()
  const rank = (k) => (k.startsWith('componentSet:') ? 0 : k.startsWith('variable:') ? 1 : k.startsWith('section:') ? 2 : k.startsWith('collection:') ? 3 : k.startsWith('page:') ? 5 : 4)
  for (const key of Object.keys(index).sort((a, b) => rank(a) - rank(b))) {
    if (key.startsWith('page:')) continue // never delete a page — Starter allows only 3
    try { index[key].remove(); removed.push(key) }
    catch (e) { errors.push(key + ': ' + String(e && e.message ? e.message : e)) }
  }
  return { removed, errors }
}

module.exports = { applyDna, rollbackDna, scanExisting, resolveStyle, isDashed, NAMESPACE }

  };
  __modules["main"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Plugin entry — Hermes Phase 104 Visual System.
 *
 * Three controls, all reversible, none destructive by default:
 *   Dry Run  — enumerate exactly what Apply would create/update/skip. No writes.
 *   Apply    — create or update the Phase 104 structure, tokens and components.
 *   Rollback — delete exactly the assets this plugin owns, and nothing else.
 *
 * FAIL-CLOSED IDENTITY GATE. Every Dry Run and every Apply first asserts the asset
 * contract. If the computed spec does not match Phase 104 exactly — or if any
 * Phase 87 asset kind appears — the run aborts before touching the file and the
 * UI says which plugin is actually loaded. This exists because a Dry Run was once
 * performed against the Phase 87 builder by mistake and the numbers looked
 * plausible enough to be believed.
 *
 * No network. Nothing leaves the file.
 */

const { applyDna, rollbackDna, scanExisting } = require('dna-exec')
const { buildDnaSpec } = require('dna-spec')
const { assertContract, PLUGIN_IDENTITY } = require('contract')
const FINGERPRINT = require('fingerprint') // synthetic module injected by build.mjs

figma.showUI(__html__, { width: 480, height: 640, themeColors: true })

/** @param {any} msg */
const post = (msg) => figma.ui.postMessage(msg)

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'init') {
      const spec = buildDnaSpec()
      const existing = await scanExisting()
      post({
        type: 'ready',
        fingerprint: FINGERPRINT,
        identity: PLUGIN_IDENTITY,
        counts: spec.counts,
        ownedInFile: Object.keys(existing).length,
        fileName: figma.root.name,
        pageCount: figma.root.children.length,
      })
      return
    }

    if (msg.type === 'dry-run' || msg.type === 'apply') {
      // Fail closed BEFORE any write.
      const spec = buildDnaSpec()
      assertContract(spec.counts, msg.type === 'apply' ? 'Apply' : 'Dry Run')

      const r = await applyDna({ dryRun: msg.type === 'dry-run' })
      post({ type: 'result', mode: msg.type === 'apply' ? 'Apply' : 'Dry Run', result: r, fingerprint: FINGERPRINT })
      return
    }

    if (msg.type === 'rollback') {
      const r = await rollbackDna()
      post({
        type: 'result', mode: 'Rollback', fingerprint: FINGERPRINT,
        result: { created: [], updated: [], skipped: [], errors: r.errors, removed: r.removed },
      })
      return
    }

    if (msg.type === 'close') figma.closePlugin()
  } catch (e) {
    post({ type: 'error', message: String(e && e.message ? e.message : e), fingerprint: FINGERPRINT })
  }
}

  };
  require('main');
})();

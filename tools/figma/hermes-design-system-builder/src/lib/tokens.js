// @ts-check
'use strict'
/**
 * Design-token source of truth for the plugin, mirrored 1:1 from the code's
 * canonical token layer so the Figma file and the code move together:
 *
 *   - COLOR_TOKENS  ⟵ src/components/ds/token-contract.ts  (the enforcement point;
 *                     every entry is asserted against globals.css + Tailwind in CI)
 *   - SPACE/RADIUS/SIZE/SHADOW ⟵ the canonical Phase 87B block in src/app/globals.css
 *
 * IMPORTANT: do not edit a value here without editing it in token-contract.ts /
 * globals.css in the same change. The plugin's Verify control reports drift.
 *
 * The type ramp (TEXT_STYLES) is DERIVED: the canonical CSS token layer defines
 * font FAMILIES (Estedad display / Vazirmatn body) but no numeric size ramp, so
 * the ramp below is a standard industrial scale, clearly labelled as derived.
 */

/**
 * @typedef {Object} ColorToken
 * @property {string} figma   Figma variable name in the "Semantic Colors" collection.
 * @property {string} cssVar  CSS custom property in globals.css.
 * @property {string} value   Canonical hex or rgba() value (mirrored into the variable).
 * @property {string|null} tailwind Tailwind theme key, or null.
 * @property {string} group
 * @property {string} usage
 * @property {string} [a11y]
 */

/** @type {ReadonlyArray<ColorToken>} — mirror of TOKEN_CONTRACT (token-contract.ts). */
const COLOR_TOKENS = [
  // Background & surface
  { figma: 'Color/Background/Base', cssVar: '--color-background-base', value: '#071018', tailwind: 'background-base', group: 'background', usage: 'app background — 70% of every screen (Hermes Obsidian)' },
  { figma: 'Color/Background/Deep', cssVar: '--color-background-deep', value: '#040A0F', tailwind: 'background-deep', group: 'background', usage: 'engineering void, full-screen canvases (Obsidian Deep)' },
  { figma: 'Color/Surface/Primary', cssVar: '--color-surface-primary', value: '#0C1720', tailwind: 'surface-primary', group: 'surface', usage: 'default cards, panels, table containers (E1)' },
  { figma: 'Color/Surface/Elevated', cssVar: '--color-surface-elevated', value: '#11212C', tailwind: 'surface-elevated', group: 'surface', usage: 'raised panels, dropdowns, popovers (E2–E3)' },
  { figma: 'Color/Surface/Interactive', cssVar: '--color-surface-interactive', value: '#152A36', tailwind: 'surface-interactive', group: 'surface', usage: 'hover/selected fills, input surfaces (E4)' },
  { figma: 'Color/Surface/Glass', cssVar: '--color-surface-glass', value: 'rgba(12, 23, 32, 0.78)', tailwind: 'surface-glass', group: 'surface', usage: 'overlays only (modal, toolbar, command) — never opaque panels' },
  { figma: 'Color/Surface/Glass (border)', cssVar: '--color-surface-glass-border', value: 'rgba(139, 244, 248, 0.10)', tailwind: 'surface-glass-border', group: 'surface', usage: '1px ice border on glass overlays' },

  // Brand
  { figma: 'Color/Brand/Primary', cssVar: '--color-brand-primary', value: '#16D9E3', tailwind: 'brand-primary', group: 'brand', usage: 'CTAs, active states, live signal (Hermes Cyan)', a11y: '11.0:1 on Base' },
  { figma: 'Color/Brand/Hover', cssVar: '--color-brand-primary-hover', value: '#8BF4F8', tailwind: 'brand-primary-hover', group: 'brand', usage: 'hover on brand elements, focus halo (Hermes Ice)' },
  { figma: 'Color/Brand/Pressed', cssVar: '--color-brand-primary-pressed', value: '#0795A5', tailwind: 'brand-primary-pressed', group: 'brand', usage: 'pressed states, cyan on light surfaces (Cyan Deep)' },
  { figma: 'Color/Brand/OnBrand', cssVar: '--color-brand-on-brand', value: '#071018', tailwind: 'brand-on-brand', group: 'brand', usage: 'text/icons on cyan fills — white-on-cyan is prohibited', a11y: 'dark-on-cyan 11.0:1' },

  // Text
  { figma: 'Color/Text/Primary', cssVar: '--color-text-primary', value: '#EDF7FA', tailwind: 'text-primary', group: 'text', usage: 'primary text', a11y: '17.6:1 on Base — AAA everywhere' },
  { figma: 'Color/Text/Secondary', cssVar: '--color-text-secondary', value: '#A9BAC6', tailwind: 'text-secondary', group: 'text', usage: 'secondary text (Titanium)', a11y: '9.6:1 on Base — AA on all surfaces' },
  { figma: 'Color/Text/Muted', cssVar: '--color-text-muted', value: '#708694', tailwind: 'text-muted', group: 'text', usage: 'metadata, captions — NOT body text on Elevated/Interactive' },
  { figma: 'Color/Text/Disabled', cssVar: '--color-text-disabled', value: '#495C68', tailwind: 'text-disabled', group: 'text', usage: 'disabled controls only — never for readable content' },
  { figma: 'Color/Text/Inverse', cssVar: '--color-text-inverse', value: '#071018', tailwind: 'text-inverse', group: 'text', usage: 'dark text on light / brand surfaces' },

  // Border
  { figma: 'Color/Border/Default', cssVar: '--color-border-default', value: '#203743', tailwind: 'border-default', group: 'border', usage: 'structural separation, non-interactive (decorative, 1.5:1)' },
  { figma: 'Color/Border/Active', cssVar: '--color-border-active', value: '#21C9D5', tailwind: 'border-active', group: 'border', usage: 'active/selected component boundaries', a11y: '9.5:1 — passes SC 1.4.11' },

  // Status
  { figma: 'Color/Status/Success', cssVar: '--color-status-success', value: '#38D996', tailwind: 'status-success', group: 'status', usage: 'healthy, verified, safe, connected', a11y: '10.5:1' },
  { figma: 'Color/Status/Warning', cssVar: '--color-status-warning', value: '#F5B942', tailwind: 'status-warning', group: 'status', usage: 'warning, incomplete evidence, review required (Industrial Amber)', a11y: '10.9:1' },
  { figma: 'Color/Status/Danger', cssVar: '--color-status-danger', value: '#F05D68', tailwind: 'status-danger', group: 'status', usage: 'danger, failed interlock, destructive (Safety Red)', a11y: '5.9:1' },
  { figma: 'Color/Status/Information', cssVar: '--color-status-information', value: '#54A6FF', tailwind: 'status-information', group: 'status', usage: 'informational status', a11y: '7.6:1' },

  // Reasoning (Industrial Brain semantic layer)
  { figma: 'Color/Reasoning/Hypothesis', cssVar: '--color-reasoning-hypothesis', value: '#8B7CFF', tailwind: 'reasoning-hypothesis', group: 'reasoning', usage: 'model inference / hypothesis only (Diagnostic Violet)' },
  { figma: 'Color/Reasoning/Evidence', cssVar: '--color-reasoning-evidence', value: '#3B82F6', tailwind: 'reasoning-evidence', group: 'reasoning', usage: 'verified evidence, analytics, predictions (Intelligence Azure)' },
  { figma: 'Color/Reasoning/Contradiction', cssVar: '--color-reasoning-contradiction', value: '#F05D68', tailwind: 'reasoning-contradiction', group: 'reasoning', usage: 'evidence conflicting with the selected hypothesis' },
  { figma: 'Color/Reasoning/Missing', cssVar: '--color-reasoning-missing', value: '#F5B942', tailwind: 'reasoning-missing', group: 'reasoning', usage: 'absent evidence, data gaps — pair with dashed treatment' },
  { figma: 'Color/Reasoning/Decision', cssVar: '--color-reasoning-decision', value: '#16D9E3', tailwind: 'reasoning-decision', group: 'reasoning', usage: 'human decision, approved safe action' },

  // Focus
  { figma: 'Color/Focus/Ring', cssVar: '--color-focus-ring', value: '#16D9E3', tailwind: 'focus-ring', group: 'focus', usage: '2px outline + 2px offset, :focus-visible only' },
  { figma: 'Color/Focus/Halo', cssVar: '--color-focus-halo', value: '#8BF4F8', tailwind: 'focus-halo', group: 'focus', usage: '1px outer halo — keeps focus visible on cyan-filled elements' },
]

/**
 * @typedef {Object} FloatToken
 * @property {string} figma  Variable name inside its collection.
 * @property {string} cssVar
 * @property {number} value  pixels
 * @property {string} usage
 */

/** @type {ReadonlyArray<FloatToken>} — canonical --space-* tokens (globals.css). */
const SPACE_TOKENS = [
  { figma: 'control-x', cssVar: '--space-control-x', value: 16, usage: 'horizontal padding inside controls' },
  { figma: 'control-y', cssVar: '--space-control-y', value: 10, usage: 'vertical padding inside controls' },
  { figma: 'card', cssVar: '--space-card', value: 20, usage: 'card inner padding' },
  { figma: 'panel', cssVar: '--space-panel', value: 24, usage: 'panel inner padding' },
  { figma: 'section', cssVar: '--space-section', value: 64, usage: 'section rhythm' },
  { figma: 'page', cssVar: '--space-page', value: 96, usage: 'page rhythm' },
]

/** @type {ReadonlyArray<FloatToken>} — canonical --radius-* tokens (globals.css). */
const RADIUS_TOKENS = [
  { figma: 'xs', cssVar: '--radius-xs', value: 4, usage: 'chips, small controls' },
  { figma: 'sm', cssVar: '--radius-sm', value: 6, usage: 'inputs, buttons' },
  { figma: 'md', cssVar: '--radius-md', value: 8, usage: 'cards' },
  { figma: 'lg', cssVar: '--radius-lg', value: 12, usage: 'panels' },
  { figma: 'xl', cssVar: '--radius-xl', value: 16, usage: 'large panels' },
  { figma: '2xl', cssVar: '--radius-2xl', value: 20, usage: 'hero surfaces' },
  { figma: 'full', cssVar: '--radius-full', value: 9999, usage: 'pills, avatars' },
]

/**
 * @type {ReadonlyArray<FloatToken>} — sizing tokens grounded in the token-contract
 * usage notes ("1px ice border", "1.5:1" hairline border, "2px outline + 2px offset").
 */
const SIZE_TOKENS = [
  { figma: 'border-hairline', cssVar: '--size-border-hairline', value: 1, usage: '1px ice border on glass overlays' },
  { figma: 'border-thin', cssVar: '--size-border-thin', value: 1.5, usage: 'default structural borders' },
  { figma: 'focus-ring', cssVar: '--size-focus-ring', value: 2, usage: ':focus-visible outline width' },
  { figma: 'focus-offset', cssVar: '--size-focus-offset', value: 2, usage: ':focus-visible outline offset' },
]

/**
 * @typedef {Object} ShadowToken
 * @property {string} name  Effect style name.
 * @property {string} cssVar
 * @property {{x:number,y:number}} offset
 * @property {number} radius blur radius
 * @property {number} spread
 * @property {[number,number,number,number]} color rgba 0..1 (a in 0..1)
 * @property {string} usage
 */

/** @type {ReadonlyArray<ShadowToken>} — DROP_SHADOW effects from canonical --shadow-e* box-shadows. */
const SHADOW_TOKENS = [
  { name: 'Elevation/E1', cssVar: '--shadow-e1', offset: { x: 0, y: 1 }, radius: 2, spread: 0, color: [0, 0, 0, 0.3], usage: 'cards resting on Base (E1)' },
  { name: 'Elevation/E2', cssVar: '--shadow-e2', offset: { x: 0, y: 2 }, radius: 8, spread: 0, color: [0, 0, 0, 0.25], usage: 'raised panels, dropdowns (E2)' },
  { name: 'Elevation/E3', cssVar: '--shadow-e3', offset: { x: 0, y: 8 }, radius: 24, spread: 0, color: [0, 0, 0, 0.4], usage: 'popovers, floating toolbars (E3)' },
  { name: 'Elevation/E4', cssVar: '--shadow-e4', offset: { x: 0, y: 12 }, radius: 32, spread: 0, color: [0, 0, 0, 0.5], usage: 'modals, command overlays (E4)' },
]

/**
 * Font families from the canonical CSS token layer. Estedad/Vazirmatn are the
 * product fonts; the plugin loads them if the running machine has them and
 * transparently falls back (recording the substitution in the run report) when
 * they are not installed in Figma. Inter is Figma's always-available default.
 */
const FONTS = Object.freeze({
  display: { family: 'Estedad', fallback: 'Inter' },
  body: { family: 'Vazirmatn', fallback: 'Inter' },
  mono: { family: 'Roboto Mono', fallback: 'Inter' },
})

/**
 * @typedef {Object} TextStyleToken
 * @property {string} name
 * @property {'display'|'body'|'mono'} font
 * @property {string} weight  Figma style string (e.g. "Bold", "Semi Bold", "Regular", "Medium")
 * @property {number} size    px
 * @property {number} line    px line-height
 * @property {number} tracking letter-spacing px
 * @property {string} usage
 */

/**
 * @type {ReadonlyArray<TextStyleToken>} — DERIVED industrial type ramp (see file header).
 * Weights use Figma's exact style strings ("Semi Bold" not "SemiBold").
 */
const TEXT_STYLES = [
  { name: 'Display/XL', font: 'display', weight: 'Bold', size: 32, line: 40, tracking: -0.5, usage: 'hero titles' },
  { name: 'Heading/L', font: 'display', weight: 'Semi Bold', size: 24, line: 32, tracking: -0.2, usage: 'page headings' },
  { name: 'Heading/M', font: 'display', weight: 'Semi Bold', size: 20, line: 28, tracking: 0, usage: 'section headings' },
  { name: 'Title/S', font: 'body', weight: 'Semi Bold', size: 16, line: 24, tracking: 0, usage: 'card titles, control labels' },
  { name: 'Body/M', font: 'body', weight: 'Regular', size: 14, line: 22, tracking: 0, usage: 'default body text' },
  { name: 'Body/S', font: 'body', weight: 'Regular', size: 13, line: 20, tracking: 0, usage: 'dense body, table cells' },
  { name: 'Caption', font: 'body', weight: 'Medium', size: 12, line: 16, tracking: 0.2, usage: 'metadata, captions' },
  { name: 'Technical/Mono', font: 'mono', weight: 'Regular', size: 13, line: 20, tracking: 0, usage: 'measured values, IDs, code (TechnicalValue)' },
]

/**
 * Parse a canonical hex / rgb() / rgba() string into normalized channels (0..1).
 * Pure — no `figma`. Returns { r, g, b, a }.
 * @param {string} input
 * @returns {{ r: number, g: number, b: number, a: number }}
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
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim())
    if (parts.length < 3) throw new Error('Bad rgb color: ' + input)
    const r = Number(parts[0]) / 255
    const g = Number(parts[1]) / 255
    const b = Number(parts[2]) / 255
    const a = parts.length >= 4 ? Number(parts[3]) : 1
    if ([r, g, b, a].some((n) => Number.isNaN(n))) throw new Error('Bad rgb color: ' + input)
    return { r, g, b, a }
  }
  throw new Error('Unsupported color format: ' + input)
}

/**
 * Common style-name spellings per canonical weight. Estedad/Vazirmatn desktop
 * releases use the NO-SPACE "SemiBold"/"ExtraBold" spellings (verified against
 * the upstream repos), Figma's own bundled fonts use "Semi Bold" — aliasing
 * resolves the SAME weight under either name; it is NOT a substitution.
 */
const WEIGHT_ALIASES = Object.freeze({
  Thin: ['Thin', '100'],
  'Extra Light': ['Extra Light', 'ExtraLight', 'Ultra Light', '200'],
  Light: ['Light', '300'],
  Regular: ['Regular', 'Normal', 'Book', '400'],
  Medium: ['Medium', '500'],
  'Semi Bold': ['Semi Bold', 'SemiBold', 'Demi Bold', 'DemiBold', 'Demi', '600'],
  Bold: ['Bold', '700'],
  'Extra Bold': ['Extra Bold', 'ExtraBold', 'Ultra Bold', '800'],
  Black: ['Black', 'Heavy', '900'],
})

/**
 * PURE canonical-typography gate. Given the set of available "Family Style"
 * strings (from listAvailableFontsAsync), decide whether every canonical
 * (family, weight) pair the type ramp needs resolves — exactly or via a
 * same-weight name alias. Missing pairs BLOCK a canonical Apply (fail closed)
 * unless the owner explicitly opts into the documented fallback.
 * @param {Set<string>} available "Family Style" strings
 * @returns {{ canonicalPresent: boolean, missing: {family:string, weight:string}[], resolved: {family:string, weight:string, style:string}[] }}
 */
function assessFontAvailability(available) {
  /** @type {{family:string, weight:string}[]} */
  const missing = []
  /** @type {{family:string, weight:string, style:string}[]} */
  const resolved = []
  const need = new Set()
  for (const t of TEXT_STYLES) {
    if (t.font === 'mono') continue // mono ships a generic fallback chain by design
    need.add(FONTS[t.font].family + '|' + t.weight)
  }
  for (const key of [...need].sort()) {
    const [family, weight] = key.split('|')
    const style = (WEIGHT_ALIASES[weight] || [weight]).find((s) => available.has(family + ' ' + s))
    if (style) resolved.push({ family, weight, style })
    else missing.push({ family, weight })
  }
  return { canonicalPresent: missing.length === 0, missing, resolved }
}

module.exports = { COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SHADOW_TOKENS, TEXT_STYLES, FONTS, WEIGHT_ALIASES, parseColor, assessFontAvailability }

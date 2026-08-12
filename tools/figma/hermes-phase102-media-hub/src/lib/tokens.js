// @ts-check
'use strict'
/**
 * Design-token source of truth for the Phase 102 plugin, transcribed 1:1 from
 * the CANONICAL `--color-*` / `--space-*` / `--radius-*` / `--shadow-e*` block
 * in `src/app/globals.css` (the "PHASE 87B — HERMES DESIGN SYSTEM FOUNDATION"
 * section, currently lines ~1150-1249). Every value below is a byte-for-byte
 * copy of that block — do not edit a value here without editing it in
 * globals.css in the same change.
 *
 * The Phase 102 file gets the FULL current token set (49 color variables),
 * which is a superset of the one captured by the earlier
 * `tools/figma/hermes-design-system-builder` plugin (29 colors) — it now also
 * includes `--color-text-metadata`, `--color-border-subtle`,
 * `--color-border-danger`, the status/brand/reasoning "-subtle"/"-border" pairs
 * used for tone-coded chips and badges, and `--color-selection`. All of these
 * are genuinely useful for the media-hub's chip/badge-heavy vocabulary
 * (category chips, filter chips, editorial workflow badges).
 *
 * The type ramp (TEXT_STYLES) is DERIVED: globals.css defines font FAMILIES
 * (Estedad display / Vazirmatn body) and a `--text-*` rem scale but no fixed
 * px line-height/tracking ramp for Figma text styles, so the ramp below is a
 * standard industrial scale sized off the closest `--text-*` steps, clearly
 * labelled as derived (same convention as the Phase 87 design-system plugin).
 */

/**
 * @typedef {Object} ColorToken
 * @property {string} figma   Figma variable name in the "Colors" collection.
 * @property {string} cssVar  CSS custom property in globals.css.
 * @property {string} value   Canonical hex or rgba() value (mirrored into the variable).
 * @property {string} group
 * @property {string} usage
 */

/** @type {ReadonlyArray<ColorToken>} — transcribed verbatim from globals.css Phase 87B block. */
const COLOR_TOKENS = [
  // Background & surface
  { figma: 'Color/Background/Deep', cssVar: '--color-background-deep', value: '#040A0F', group: 'background', usage: 'engineering void, full-bleed video surfaces' },
  { figma: 'Color/Background/Base', cssVar: '--color-background-base', value: '#071018', group: 'background', usage: 'app background — 70% of every screen' },
  { figma: 'Color/Surface/Primary', cssVar: '--color-surface-primary', value: '#0C1720', group: 'surface', usage: 'default cards, panels, video-card containers' },
  { figma: 'Color/Surface/Elevated', cssVar: '--color-surface-elevated', value: '#11212C', group: 'surface', usage: 'raised panels, player control bar, popovers' },
  { figma: 'Color/Surface/Interactive', cssVar: '--color-surface-interactive', value: '#152A36', group: 'surface', usage: 'hover/selected fills, input surfaces, meter track' },
  { figma: 'Color/Surface/Glass', cssVar: '--color-surface-glass', value: 'rgba(12, 23, 32, 0.78)', group: 'surface', usage: 'overlays only (dialog, transcript flyout) — never opaque panels' },
  { figma: 'Color/Surface/Glass (border)', cssVar: '--color-surface-glass-border', value: 'rgba(139, 244, 248, 0.10)', group: 'surface', usage: '1px ice border on glass overlays' },

  // Brand
  { figma: 'Color/Brand/Primary', cssVar: '--color-brand-primary', value: '#16D9E3', group: 'brand', usage: 'CTAs, play button, active states (Hermes Cyan)' },
  { figma: 'Color/Brand/Hover', cssVar: '--color-brand-primary-hover', value: '#8BF4F8', group: 'brand', usage: 'hover on brand elements, focus halo (Hermes Ice)' },
  { figma: 'Color/Brand/Pressed', cssVar: '--color-brand-primary-pressed', value: '#0795A5', group: 'brand', usage: 'pressed states (Cyan Deep)' },
  { figma: 'Color/Brand/Ice', cssVar: '--color-brand-ice', value: '#8BF4F8', group: 'brand', usage: 'secondary accent, alias of Brand/Hover' },
  { figma: 'Color/Brand/Deep', cssVar: '--color-brand-deep', value: '#0795A5', group: 'brand', usage: 'deep accent, alias of Brand/Pressed' },
  { figma: 'Color/Brand/OnBrand', cssVar: '--color-brand-on-brand', value: '#071018', group: 'brand', usage: 'text/icons on cyan fills — white-on-cyan is prohibited' },
  { figma: 'Color/Brand/Subtle', cssVar: '--color-brand-subtle', value: 'rgba(22, 217, 227, 0.10)', group: 'brand', usage: 'subtle fill for brand-tone chips/badges' },
  { figma: 'Color/Brand/Border', cssVar: '--color-brand-border', value: 'rgba(22, 217, 227, 0.24)', group: 'brand', usage: 'border for brand-tone chips/badges' },
  { figma: 'Color/Intelligence/Azure', cssVar: '--color-intelligence-azure', value: '#3B82F6', group: 'brand', usage: 'analytics accent' },

  // Text
  { figma: 'Color/Text/Primary', cssVar: '--color-text-primary', value: '#EDF7FA', group: 'text', usage: 'primary text' },
  { figma: 'Color/Text/Secondary', cssVar: '--color-text-secondary', value: '#A9BAC6', group: 'text', usage: 'secondary text' },
  { figma: 'Color/Text/Muted', cssVar: '--color-text-muted', value: '#708694', group: 'text', usage: 'metadata, captions — NOT body text on Elevated/Interactive' },
  { figma: 'Color/Text/Metadata', cssVar: '--color-text-metadata', value: '#8496A6', group: 'text', usage: 'readable tertiary/caption text — WCAG AA on every surface incl. Interactive' },
  { figma: 'Color/Text/Disabled', cssVar: '--color-text-disabled', value: '#495C68', group: 'text', usage: 'disabled controls only' },
  { figma: 'Color/Text/Inverse', cssVar: '--color-text-inverse', value: '#071018', group: 'text', usage: 'dark text on light / brand surfaces' },

  // Border
  { figma: 'Color/Border/Default', cssVar: '--color-border-default', value: '#203743', group: 'border', usage: 'structural separation, non-interactive' },
  { figma: 'Color/Border/Subtle', cssVar: '--color-border-subtle', value: 'rgba(237, 247, 250, 0.06)', group: 'border', usage: 'faint hairline separators' },
  { figma: 'Color/Border/Active', cssVar: '--color-border-active', value: '#21C9D5', group: 'border', usage: 'active/selected component boundaries' },
  { figma: 'Color/Border/Danger', cssVar: '--color-border-danger', value: '#F05D68', group: 'border', usage: 'error field / player error boundaries' },

  // Status
  { figma: 'Color/Status/Success', cssVar: '--color-status-success', value: '#38D996', group: 'status', usage: 'published, complete, healthy' },
  { figma: 'Color/Status/Success (subtle)', cssVar: '--color-status-success-subtle', value: 'rgba(56, 217, 150, 0.10)', group: 'status', usage: 'success chip/badge fill' },
  { figma: 'Color/Status/Success (border)', cssVar: '--color-status-success-border', value: 'rgba(56, 217, 150, 0.24)', group: 'status', usage: 'success chip/badge border' },
  { figma: 'Color/Status/Warning', cssVar: '--color-status-warning', value: '#F5B942', group: 'status', usage: 'in review, buffering, incomplete' },
  { figma: 'Color/Status/Warning (subtle)', cssVar: '--color-status-warning-subtle', value: 'rgba(245, 185, 66, 0.10)', group: 'status', usage: 'warning chip/badge fill' },
  { figma: 'Color/Status/Warning (border)', cssVar: '--color-status-warning-border', value: 'rgba(245, 185, 66, 0.24)', group: 'status', usage: 'warning chip/badge border' },
  { figma: 'Color/Status/Danger', cssVar: '--color-status-danger', value: '#F05D68', group: 'status', usage: 'rejected, playback error, destructive' },
  { figma: 'Color/Status/Danger (subtle)', cssVar: '--color-status-danger-subtle', value: 'rgba(240, 93, 104, 0.10)', group: 'status', usage: 'danger chip/badge fill' },
  { figma: 'Color/Status/Danger (border)', cssVar: '--color-status-danger-border', value: 'rgba(240, 93, 104, 0.24)', group: 'status', usage: 'danger chip/badge border' },
  { figma: 'Color/Status/Information', cssVar: '--color-status-information', value: '#54A6FF', group: 'status', usage: 'informational status' },
  { figma: 'Color/Status/Information (subtle)', cssVar: '--color-status-information-subtle', value: 'rgba(84, 166, 255, 0.10)', group: 'status', usage: 'info chip/badge fill' },
  { figma: 'Color/Status/Information (border)', cssVar: '--color-status-information-border', value: 'rgba(84, 166, 255, 0.24)', group: 'status', usage: 'info chip/badge border' },

  // Reasoning (Industrial Brain semantic layer — reused for analytics tone)
  { figma: 'Color/Reasoning/Violet', cssVar: '--color-reasoning-violet', value: '#8B7CFF', group: 'reasoning', usage: 'model inference tone (alias of Hypothesis)' },
  { figma: 'Color/Reasoning/Hypothesis', cssVar: '--color-reasoning-hypothesis', value: '#8B7CFF', group: 'reasoning', usage: 'model inference / hypothesis only' },
  { figma: 'Color/Reasoning/Hypothesis (subtle)', cssVar: '--color-reasoning-hypothesis-subtle', value: 'rgba(139, 124, 255, 0.10)', group: 'reasoning', usage: 'hypothesis chip fill' },
  { figma: 'Color/Reasoning/Hypothesis (border)', cssVar: '--color-reasoning-hypothesis-border', value: 'rgba(139, 124, 255, 0.24)', group: 'reasoning', usage: 'hypothesis chip border' },
  { figma: 'Color/Reasoning/Evidence', cssVar: '--color-reasoning-evidence', value: '#3B82F6', group: 'reasoning', usage: 'verified evidence, analytics' },
  { figma: 'Color/Reasoning/Contradiction', cssVar: '--color-reasoning-contradiction', value: '#F05D68', group: 'reasoning', usage: 'conflicting evidence' },
  { figma: 'Color/Reasoning/Missing', cssVar: '--color-reasoning-missing', value: '#F5B942', group: 'reasoning', usage: 'absent evidence, data gaps' },
  { figma: 'Color/Reasoning/Decision', cssVar: '--color-reasoning-decision', value: '#16D9E3', group: 'reasoning', usage: 'human decision, approved safe action' },

  // Focus & selection
  { figma: 'Color/Focus/Ring', cssVar: '--color-focus-ring', value: '#16D9E3', group: 'focus', usage: '2px outline, :focus-visible only' },
  { figma: 'Color/Focus/Halo', cssVar: '--color-focus-halo', value: '#8BF4F8', group: 'focus', usage: '1px outer halo — keeps focus visible on cyan-filled elements' },
  { figma: 'Color/Selection', cssVar: '--color-selection', group: 'focus', value: 'rgba(22, 217, 227, 0.28)', usage: 'text/list selection highlight' },
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
  { figma: 'md', cssVar: '--radius-md', value: 8, usage: 'cards, video thumbnails' },
  { figma: 'lg', cssVar: '--radius-lg', value: 12, usage: 'panels, player control bar' },
  { figma: 'xl', cssVar: '--radius-xl', value: 16, usage: 'large panels' },
  { figma: '2xl', cssVar: '--radius-2xl', value: 20, usage: 'hero surfaces' },
  { figma: 'full', cssVar: '--radius-full', value: 9999, usage: 'pills, chips, avatars' },
]

/**
 * @typedef {Object} SizeToken
 * @property {string} figma
 * @property {string|null} cssRef  A literal grounding in globals.css when one exists
 *   (a real rule, not a fabricated `--size-*` custom property — globals.css does
 *   not declare one), or null when the value is a documented convention instead.
 * @property {number} value px
 * @property {string} usage
 */

/** @type {ReadonlyArray<SizeToken>} — sizing scale. globals.css has no literal
 * `--size-*` custom properties, so each entry is honestly grounded either in a
 * real CSS rule (cssRef) or flagged as a documented convention (cssRef: null). */
const SIZE_TOKENS = [
  { figma: 'border-hairline', cssRef: '.ds-glass { border: 1px solid var(--color-surface-glass-border) }', value: 1, usage: '1px ice border on glass overlays' },
  { figma: 'focus-ring', cssRef: ':focus-visible { outline: 2px solid …; outline-offset: 2px }', value: 2, usage: ':focus-visible outline width' },
  { figma: 'focus-offset', cssRef: ':focus-visible { outline-offset: 2px }', value: 2, usage: ':focus-visible outline offset' },
  { figma: 'touch-min', cssRef: null, value: 40, usage: 'minimum interactive touch target (design convention, matches ds/*.tsx controls)' },
  { figma: 'timeline-track', cssRef: null, value: 6, usage: 'player seek-bar track height (design convention)' },
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

/** @type {ReadonlyArray<ShadowToken>} — DROP_SHADOW effects transcribed from
 * globals.css `--shadow-e1`..`--shadow-e4` (E0 = "none" is not a style). */
const SHADOW_TOKENS = [
  { name: 'Elevation/E1', cssVar: '--shadow-e1', offset: { x: 0, y: 1 }, radius: 2, spread: 0, color: [0, 0, 0, 0.3], usage: 'video cards resting on Base (E1)' },
  { name: 'Elevation/E2', cssVar: '--shadow-e2', offset: { x: 0, y: 2 }, radius: 8, spread: 0, color: [0, 0, 0, 0.25], usage: 'raised panels, dropdowns (E2)' },
  { name: 'Elevation/E3', cssVar: '--shadow-e3', offset: { x: 0, y: 8 }, radius: 24, spread: 0, color: [0, 0, 0, 0.4], usage: 'player control bar, popovers (E3)' },
  { name: 'Elevation/E4', cssVar: '--shadow-e4', offset: { x: 0, y: 12 }, radius: 32, spread: 0, color: [0, 0, 0, 0.5], usage: 'dialogs, upload/editorial overlays (E4)' },
]

/**
 * @typedef {Object} GlassToken
 * @property {string} name
 * @property {number} blurRadius   BACKGROUND_BLUR radius (px)
 * @property {{x:number,y:number}} offset
 * @property {number} radius
 * @property {number} spread
 * @property {[number,number,number,number]} color
 * @property {string} usage
 */

/**
 * @type {ReadonlyArray<GlassToken>} — the requested "effect styles for the
 * glass elevation": a BACKGROUND_BLUR + DROP_SHADOW pair transcribed from the
 * `.ds-glass` rule in globals.css (`backdrop-filter: blur(14px) saturate(1.3)`
 * over `--color-surface-glass`), used for the transcript flyout, dialogs and
 * command overlays. This is distinct from the opaque Elevation/E1-E4 shadows.
 */
const GLASS_TOKENS = [
  { name: 'Glass/Overlay', blurRadius: 14, offset: { x: 0, y: 2 }, radius: 8, spread: 0, color: [0, 0, 0, 0.28], usage: 'ds-glass overlay surfaces — modal, transcript flyout, command panels (css: .ds-glass, backdrop-filter blur(14px))' },
]

/**
 * Font families. The Hermes brand faces are Estedad (display) / Vazirmatn
 * (body) per globals.css, but the ONLY Persian-capable face verified present
 * on this Figma account is the variable font "Estedad-VF" — so both the
 * display and body roles resolve to it here, with Figma's always-available
 * Inter as the graceful fallback (never a hard failure — see resolveFontPlan
 * below and the CRITICAL requirement in the task brief).
 */
const FONTS = Object.freeze({
  display: { family: 'Estedad-VF', fallback: 'Inter' },
  body: { family: 'Estedad-VF', fallback: 'Inter' },
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
 * @type {ReadonlyArray<TextStyleToken>} — DERIVED industrial type ramp (see
 * file header), sized off the nearest globals.css `--text-*` step.
 */
const TEXT_STYLES = [
  { name: 'Display/XL', font: 'display', weight: 'Bold', size: 32, line: 40, tracking: -0.5, usage: 'video hero title (~--text-3xl)' },
  { name: 'Heading/L', font: 'display', weight: 'Semi Bold', size: 24, line: 32, tracking: -0.2, usage: 'screen headings (--text-2xl)' },
  { name: 'Heading/M', font: 'display', weight: 'Semi Bold', size: 20, line: 28, tracking: 0, usage: 'section headings (--text-xl)' },
  { name: 'Title/S', font: 'body', weight: 'Semi Bold', size: 16, line: 24, tracking: 0, usage: 'card titles, control labels (--text-lg)' },
  { name: 'Body/M', font: 'body', weight: 'Regular', size: 14, line: 22, tracking: 0, usage: 'default body text (--text-sm)' },
  { name: 'Body/S', font: 'body', weight: 'Regular', size: 13, line: 20, tracking: 0, usage: 'dense body, chip labels' },
  { name: 'Caption', font: 'body', weight: 'Medium', size: 12, line: 16, tracking: 0.2, usage: 'metadata, captions (--text-xs)' },
  { name: 'Technical/Mono', font: 'mono', weight: 'Regular', size: 13, line: 20, tracking: 0, usage: 'timestamps, durations, IDs — ALWAYS LTR even inside an RTL frame' },
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
 * Common style-name spellings per canonical weight — resolves the Figma
 * "Semi Bold" spelling vs. common upstream variable-font instance names like
 * "SemiBold" for the SAME weight (not a substitution).
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
 * PURE, NEVER-THROWING font resolution plan. Given the set of available
 * "Family Style" strings (from figma.listAvailableFontsAsync at runtime), for
 * ONE (family, weight) request return the concrete font to actually load:
 * the exact weight if present, a same-weight alias spelling, the family's
 * Regular cut, or the documented fallback family (Inter) — in that order.
 * This never blocks/throws; it only reports what it decided so the Apply
 * summary can show substitutions honestly. Matches the task's explicit
 * instruction: "verify… and fall back gracefully… rather than throwing."
 * @param {string} family @param {string} weight @param {Set<string>} available
 * @returns {{ family: string, style: string, exact: boolean, substituted: boolean, note: string }}
 */
function resolveFontPlan(family, weight, available) {
  const tryFamily = (fam, w) => {
    for (const style of WEIGHT_ALIASES[w] || [w]) {
      if (available.has(fam + ' ' + style)) return style
    }
    return null
  }
  let style = tryFamily(family, weight)
  if (style) return { family, style, exact: style === weight, substituted: style !== weight, note: style === weight ? 'exact' : family + ' ' + weight + ' ≈ ' + family + ' ' + style }
  if (weight !== 'Regular') {
    style = tryFamily(family, 'Regular')
    if (style) return { family, style, exact: false, substituted: true, note: family + ' ' + weight + ' → ' + family + ' ' + style + ' (weight unavailable)' }
  }
  const fb = FONTS.display.family === family ? FONTS.display.fallback : FONTS.body.family === family ? FONTS.body.fallback : FONTS.mono.fallback
  style = tryFamily(fb, weight) || tryFamily(fb, 'Regular') || 'Regular'
  return { family: fb, style, exact: false, substituted: true, note: family + ' ' + weight + ' → ' + fb + ' ' + style + ' (family unavailable — graceful fallback, not blocked)' }
}

module.exports = {
  COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SHADOW_TOKENS, GLASS_TOKENS, TEXT_STYLES,
  FONTS, WEIGHT_ALIASES, parseColor, resolveFontPlan,
}

/* Hermes Phase 102 Media Hub Builder — generated bundle. Do not edit dist/ by hand; edit src/ and run `npm run build`. */
(function () {
  "use strict";
  var __modules = {}, __cache = {};
  function require(id) {
    if (__cache[id]) return __cache[id].exports;
    var m = { exports: {} }; __cache[id] = m;
    __modules[id](m, m.exports, require);
    return m.exports;
  }
  __modules["constants"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Shared constants for the Hermes Phase 102 Media & Video Hub Builder plugin.
 *
 * Everything the plugin creates is tagged in a single shared-plugin-data
 * namespace and tracked per-page, so every run is deterministic, idempotent and
 * precisely reversible. NONE of these values are secret; there is no network
 * access and nothing leaves the file.
 */

const PLUGIN_VERSION = '0.1.0'
const PLUGIN_NAME = 'Hermes Phase 102 Media Hub Builder'

/**
 * Shared-plugin-data namespace. Every managed node/style/variable carries data
 * under this namespace. Rollback and idempotency both key off it.
 */
const NAMESPACE = 'hermesP102'

/** Shared-plugin-data keys written on every managed asset. */
const KEYS = Object.freeze({
  MANAGED: 'managed', // always "1" on assets this plugin created
  ASSET_KEY: 'assetKey', // stable semantic identity
  ASSET_KIND: 'assetKind',
  RUN_ID: 'runId', // the run that first created the asset
  CONTENT_HASH: 'contentHash', // hash of the spec that produced the asset
  PLUGIN_VERSION: 'pluginVersion',
})

/** Asset kinds (mirrors KEYS.ASSET_KIND values). */
const KIND = Object.freeze({
  PAGE: 'page',
  COLLECTION: 'collection',
  VARIABLE: 'variable',
  PAINT_STYLE: 'paintStyle',
  TEXT_STYLE: 'textStyle',
  EFFECT_STYLE: 'effectStyle',
  COMPONENT: 'component',
  COMPONENT_SET: 'componentSet',
  SCREEN: 'screen',
  SECTION: 'section',
  DOC: 'doc', // foundation documentation swatch/specimen frame
  MANIFEST: 'manifest',
})

/**
 * The file already exists on the Figma STARTER plan, which allows AT MOST 3
 * pages total (figma.createPage() throws "The Starter plan only comes with 3
 * pages" on the 4th). These are the exact 3 pages this plugin manages, in
 * apply order. pages.js enforces this as a hard, testable guard.
 */
const PAGES = Object.freeze({
  FOUNDATIONS: '01 Foundations',
  COMPONENTS: '02 Components',
  SCREENS: '03 Screens',
})
const PAGE_NAMES = Object.freeze([PAGES.FOUNDATIONS, PAGES.COMPONENTS, PAGES.SCREENS])
const MAX_PAGES = 3

/** Managed sections, one per page, so generated content never touches
 *  anything the owner placed on these pages by hand. */
const SECTIONS = Object.freeze({
  FOUNDATIONS: 'Hermes Media · Foundations (managed)',
  COMPONENTS: 'Hermes Media · Components (managed)',
  SCREENS: 'Hermes Media · Screens (managed)',
})

/** Local variable collection names created by this plugin (one mode each — see starter.js). */
const COLLECTIONS = Object.freeze({
  COLORS: 'Hermes Media · Colors',
  SPACING: 'Hermes Media · Spacing',
  RADIUS: 'Hermes Media · Radius',
  SIZING: 'Hermes Media · Sizing',
})

/** Name of the manifest node (a tiny hidden frame) recording an AUDIT COPY of
 *  the assetKey -> nodeId/styleId/variableId map plus the last run summary.
 *  Idempotency and rollback key off the LIVE shared-plugin-data markers, not
 *  this node — it is a human/audit convenience only. */
const MANIFEST_NODE_NAME = '⟦ hermes-p102 · manifest — do not delete ⟧'

/**
 * Deterministic REVISION markers. Bumping a revision changes the content hash
 * of the affected asset kind, so a rerun produces a surgical UPDATE plan
 * instead of a no-op SKIP.
 */
const REVISIONS = Object.freeze({
  component: 1,
  textStyle: 1,
  screen: 1,
})

module.exports = {
  PLUGIN_VERSION, PLUGIN_NAME, NAMESPACE, KEYS, KIND,
  PAGES, PAGE_NAMES, MAX_PAGES, SECTIONS, COLLECTIONS,
  MANIFEST_NODE_NAME, REVISIONS,
}

  };
  __modules["util"] = function (module, exports, require) {
// @ts-check
'use strict'
/** Pure, deterministic helpers. No `figma`, no Date, no Math.random. */

/**
 * @param {string} s
 * @returns {string} kebab slug
 */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Deterministic JSON with recursively sorted object keys, so a hash of the same
 * logical value is stable regardless of key insertion order.
 * @param {unknown} v
 * @returns {string}
 */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const obj = /** @type {Record<string, unknown>} */ (v)
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

/**
 * FNV-1a 32-bit hash → 8-char hex. Deterministic; used for content hashes so
 * reruns can tell "unchanged" (skip) from "changed" (update).
 * @param {string} str
 * @returns {string}
 */
function fnv1a(str) {
  let h = 0x811c9dc5 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return ('0000000' + h.toString(16)).slice(-8)
}

/**
 * Content hash of an asset payload (order-independent).
 * @param {unknown} payload
 * @returns {string}
 */
function hashAsset(payload) {
  return fnv1a(stableStringify(payload))
}

module.exports = { slug, stableStringify, fnv1a, hashAsset }

  };
  __modules["tokens"] = function (module, exports, require) {
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

  };
  __modules["rtl"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * PURE RTL mirroring rules — the single source of truth for how a component's
 * anatomy tree mirrors under Direction=RTL, shared by:
 *   - the pure test suite (walks NodeSpec trees from presets.js, no `figma`)
 *   - figma-exec.js's real `mirrorRtl()` (walks the actual rendered nodes,
 *     matching by role/name using the SAME protected-role set)
 *
 * THE CRITICAL RULE (task brief): time always flows left-to-right, even inside
 * an RTL layout. The player's seek bar/timeline must stay LTR while the
 * surrounding controls (play/pause, volume, captions, fullscreen) mirror
 * normally. Getting this backwards is the classic bug.
 *
 * Mechanism: any NodeSpec role in PROTECTED_LTR_ROLES is treated as an OPAQUE
 * LTR-locked subtree during mirroring — its own children are never reordered
 * and text inside it is never right-aligned — but the node itself still
 * participates normally as a child of its parent (so if the parent row
 * reverses, the whole protected block still moves to the mirrored side, which
 * is correct: the BLOCK mirrors, its INTERNAL time-flow does not).
 */

/**
 * Roles that represent time-based / numeric-technical content and must never
 * be internally mirrored: the player timeline, any progress/watch meter, and
 * the timestamp/remaining-time labels that flank them.
 */
const PROTECTED_LTR_ROLES = new Set([
  'Timeline', 'Scrubber', 'Track', 'Fill', 'Playhead',
  'Meter', 'MeterTrack', 'MeterFill',
  'TimeElapsed', 'TimeRemaining', 'Trail', 'Duration', 'Timestamp', 'DurationBadge',
])

/** @param {string} role */
function isProtectedRole(role) {
  return PROTECTED_LTR_ROLES.has(role)
}

/**
 * Pure mirror-plan over a NodeSpec tree (the same trees `PRESETS[...]`
 * returns). Never touches `figma`. Returns exactly what an RTL build WOULD do:
 * which horizontal frames get their children reversed, which text roles get
 * right-aligned, and which subtrees are skipped (protected, LTR-locked).
 * @param {any} spec NodeSpec root
 * @returns {{ reversedFrames: string[], rightAlignedText: string[], skippedSubtrees: string[] }}
 */
function computeMirrorPlan(spec) {
  /** @type {string[]} */
  const reversedFrames = []
  /** @type {string[]} */
  const rightAlignedText = []
  /** @type {string[]} */
  const skippedSubtrees = []

  /** @param {any} n */
  const walk = (n) => {
    if (!n) return
    if (isProtectedRole(n.role)) { skippedSubtrees.push(n.role); return } // opaque — do not descend
    if (n.type === 'frame' && n.row) reversedFrames.push(n.role)
    if (n.type === 'text') rightAlignedText.push(n.role)
    for (const c of n.children || []) walk(c)
  }
  walk(spec)
  return { reversedFrames, rightAlignedText, skippedSubtrees }
}

/**
 * Whether a family blueprint contains at least one protected (LTR-locked)
 * subtree — used by component tests to assert PlayerControlBar / meter-bearing
 * families actually exercise the protection, and that unrelated families do
 * not spuriously trip it.
 * @param {any} spec
 * @returns {boolean}
 */
function hasProtectedSubtree(spec) {
  return computeMirrorPlan(spec).skippedSubtrees.length > 0
}

module.exports = { PROTECTED_LTR_ROLES, isProtectedRole, computeMirrorPlan, hasProtectedSubtree }

  };
  __modules["presets"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Anatomy + state DSL for the Phase 102 media-hub component sets.
 *
 * A family's visual contract is declared as a pure tree of NodeSpecs plus
 * state/tone override tables — same architecture as the Phase 87 design-system
 * plugin (`tools/figma/hermes-design-system-builder/src/lib/presets.js`). The
 * Figma renderer (figma-exec.js) interprets these; the tests validate them
 * (roles unique, tokens exist, bindings resolvable) WITHOUT needing Figma.
 *
 * NodeSpec:
 *   role      unique-within-family layer name (semantic; used for bindings,
 *             overrides AND the RTL-protection lookup in rtl.js)
 *   type      'frame' | 'text' | 'ellipse' | 'rect' | 'iconSlot'
 *   row       frame only: horizontal auto-layout (default vertical)
 *   gap,padX,padY   auto-layout metrics (px, token-derived at call sites)
 *   fill,stroke     token name from tokens.js paint styles
 *   strokeW,radius  px
 *   w,h,minW,minH,maxW  sizing (px); text with maxW wraps (textAutoResize HEIGHT)
 *   grow      'fill' → layoutSizingHorizontal FILL inside parent
 *   center    frame only: counterAxisAlignItems CENTER
 *   textStyle ramp name from tokens.js TEXT_STYLES
 *   textFill  token name for the text paint
 *   text      default characters (EN)
 *   hidden    initially invisible (bound bools reveal)
 *   children  NodeSpec[]
 */

/** Token-derived metric constants (mirror the globals.css space + radius tokens). */
const M = Object.freeze({
  controlX: 16, controlY: 10, card: 20, panel: 24,
  radiusXs: 4, radiusSm: 6, radiusMd: 8, radiusLg: 12, radiusXl: 16, radius2xl: 20, radiusFull: 9999,
  gap: 8, gapTight: 4, gapWide: 12,
  touchMin: 40, // min interactive height (touch target incl. border)
  timelineTrack: 6,
})

// tiny builders --------------------------------------------------------------
/** @param {string} role @param {any} [o] */
const frame = (role, o) => Object.assign({ role, type: 'frame', children: [] }, o)
/** @param {string} role @param {string} text @param {string} textStyle @param {string} textFill @param {any} [o] */
const txt = (role, text, textStyle, textFill, o) => Object.assign({ role, type: 'text', text, textStyle, textFill }, o)
/** @param {string} role @param {number} d @param {string} fill @param {any} [o] */
const dot = (role, d, fill, o) => Object.assign({ role, type: 'ellipse', w: d, h: d, fill }, o)
/** @param {string} role @param {any} [o] */
const rect = (role, o) => Object.assign({ role, type: 'rect' }, o)
/** @param {string} role @param {any} [o] */
const iconSlot = (role, o) => Object.assign({ role, type: 'iconSlot', w: 16, h: 16 }, o)

// state override presets ------------------------------------------------------
/**
 * A state override: { role, set: { fill?, stroke?, strokeW?, textFill?, opacity?, hidden? } }
 * 'root' targets the variant component itself. Interpreted by the renderer and
 * validated by tests. These are the SHARED interaction-state semantics; a
 * family may extend/override via its own `valueOverrides`.
 */
const STATE_PRESETS = Object.freeze({
  Default: [],
  Hover: [{ role: 'root', set: { fill: 'Color/Surface/Interactive' } }],
  Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
  Active: [{ role: 'root', set: { stroke: 'Color/Border/Active', strokeW: 1.5 } }],
  Selected: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }],
  Disabled: [
    { role: 'root', set: { opacity: 0.55 } },
    { role: 'Label', set: { textFill: 'Color/Text/Disabled' } },
  ],
  Loading: [
    { role: 'Label', set: { textFill: 'Color/Text/Muted' } },
  ],
  Error: [
    { role: 'root', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } },
  ],
  Empty: [
    { role: 'Body', set: { hidden: true } },
    { role: 'EmptyNote', set: { hidden: false } },
  ],
})

// anatomy presets -------------------------------------------------------------
/**
 * Each preset returns the root NodeSpec for one VARIANT COMPONENT of a family.
 * Text roles used by prop bindings: Label, Value, Hint, Title, Meta, Tag, Unit…
 */
const PRESETS = Object.freeze({
  /** Horizontal control (chips, toggle triggers, small buttons). */
  control(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gap, padX: o.padX ?? M.controlX, padY: o.padY ?? M.controlY,
      radius: o.radius ?? M.radiusSm, fill: o.fill ?? 'Color/Surface/Interactive',
      stroke: o.stroke ?? 'Color/Border/Default', strokeW: 1, minH: o.minH ?? M.touchMin, minW: o.minW,
      children: [
        ...(o.icon ? [iconSlot('IconSlot')] : []),
        txt('Label', o.label ?? 'Label', o.textStyle ?? 'Title/S', o.textFill ?? 'Color/Text/Primary'),
      ],
    })
  },

  /** Labelled field (SearchField). */
  field(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapTight, fill: null, minW: 220,
      children: [
        txt('Label', o.label ?? 'Label', 'Caption', 'Color/Text/Secondary'),
        frame('Box', {
          row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY,
          radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default',
          strokeW: 1, minH: M.touchMin, grow: 'fill',
          children: [
            ...(o.leadIcon ? [iconSlot('IconSlot')] : []),
            txt('Value', o.value ?? 'Value', 'Body/M', 'Color/Text/Primary', { grow: 'fill' }),
            ...(o.trailMark ? [dot('TrailMark', 8, 'Color/Text/Muted', { hidden: true })] : []),
          ],
        }),
        txt('Hint', o.hint ?? 'Hint', 'Caption', 'Color/Text/Muted', { hidden: true }),
      ],
    })
  },

  /** Boolean input (SubtitleToggle). */
  toggle(opts) {
    const o = opts || {}
    const mark = frame('Mark', {
      row: true, w: 36, h: 20, radius: M.radiusFull, fill: 'Color/Surface/Interactive',
      stroke: 'Color/Border/Default', strokeW: 1, padX: 2, padY: 2,
      children: [dot('Knob', 16, 'Color/Text/Secondary')],
    })
    return frame('root', {
      row: true, center: true, gap: M.gap, padY: 2, minH: M.touchMin, fill: null,
      children: [mark, txt('Label', o.label ?? 'Label', 'Body/M', 'Color/Text/Primary')],
    })
  },

  /** Surface card (VideoHero fallback, AnalyticsCard, InstructorProfileCard header, MediaEmptyState, MediaErrorState). */
  card(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gap, padX: M.card, padY: M.card, radius: M.radiusMd,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 260,
      children: [
        frame('Header', {
          row: true, center: true, gap: M.gap,
          children: [dot('StateDot', 10, o.dotFill ?? 'Color/Brand/Primary'), txt('Title', o.title ?? 'Title', 'Title/S', 'Color/Text/Primary', { maxW: 320 })],
        }),
        txt('Body', o.body ?? 'Supporting description that must survive long Persian and German copy without overflowing.', 'Body/M', 'Color/Text/Secondary', { maxW: 360 }),
        ...(o.value ? [frame('ValueRow', { row: true, center: true, gap: M.gapTight, children: [txt('Value', o.value, 'Display/XL', 'Color/Text/Primary'), txt('Unit', o.unit ?? '', 'Caption', 'Color/Text/Muted')] })] : []),
        ...(o.meta ? [txt('Meta', o.meta, 'Caption', 'Color/Text/Muted', { maxW: 360 })] : []),
        ...(o.action ? [frame('ActionRow', { row: true, gap: M.gap, children: [frame('Action', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Brand/Primary', minH: M.touchMin, children: [txt('ActionLabel', o.action, 'Title/S', 'Color/Brand/OnBrand')] })] })] : []),
        txt('EmptyNote', o.emptyNote ?? 'No data available yet.', 'Body/S', 'Color/Text/Muted', { hidden: true, maxW: 360 }),
      ],
    })
  },

  /** List/tree row (PlaylistChapterNav item). */
  listRow(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gap, padX: o.padX ?? M.controlX, padY: o.padY ?? M.controlY,
      radius: o.radius ?? M.radiusSm, fill: o.fill ?? 'Color/Surface/Primary',
      stroke: o.stroke ?? 'Color/Border/Default', strokeW: o.strokeW ?? 1, minH: M.touchMin, minW: o.minW ?? 280,
      children: [
        dot('StateDot', 10, o.dotFill ?? 'Color/Brand/Primary'),
        frame('Content', {
          gap: 2, grow: 'fill',
          children: [
            txt('Title', o.title ?? 'Title', o.titleStyle ?? 'Body/M', 'Color/Text/Primary', { maxW: 340 }),
            ...(o.meta !== false ? [txt('Meta', o.meta ?? 'Metadata', 'Caption', 'Color/Text/Muted', { maxW: 340 })] : []),
          ],
        }),
        ...(o.trail ? [txt('Trail', o.trail, 'Technical/Mono', 'Color/Text/Secondary')] : []),
      ],
    })
  },

  /** Overlay surface (MediaDialog). */
  overlay(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.panel, radius: o.radius ?? M.radiusLg,
      fill: 'Color/Surface/Elevated', stroke: 'Color/Surface/Glass (border)', strokeW: 1, minW: o.minW ?? 320,
      children: [
        frame('Header', { row: true, center: true, gap: M.gap, children: [txt('Title', o.title ?? 'Title', 'Heading/M', 'Color/Text/Primary', { grow: 'fill', maxW: 360 }), txt('Dismiss', '✕', 'Body/M', 'Color/Text/Muted')] }),
        txt('Body', o.body ?? 'Overlay content copy resilient to long FA/DE strings.', 'Body/M', 'Color/Text/Secondary', { maxW: 380 }),
        frame('ActionRow', { row: true, gap: M.gap, children: [
          frame('PrimaryAction', { row: true, center: true, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: o.primaryFill ?? 'Color/Brand/Primary', minH: M.touchMin, children: [txt('PrimaryLabel', (o.actions && o.actions[0]) ?? 'Confirm', 'Title/S', o.primaryTextFill ?? 'Color/Brand/OnBrand')] }),
          frame('SecondaryAction', { row: true, center: true, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, minH: M.touchMin, children: [txt('SecondaryLabel', (o.actions && o.actions[1]) ?? 'Cancel', 'Title/S', 'Color/Text/Primary')] }),
        ] }),
      ],
    })
  },

  /** Skeleton loader (MediaLoadingState). */
  loader(opts) {
    const o = opts || {}
    const shape = o.shape === 'Circle'
      ? dot('Bone', 40, 'Color/Surface/Interactive')
      : rect('Bone', { w: o.shape === 'Block' ? 220 : 260, h: o.shape === 'Block' ? 120 : 12, radius: o.shape === 'Block' ? M.radiusMd : M.radiusFull, fill: 'Color/Surface/Interactive' })
    return frame('root', { padX: 0, padY: 0, fill: null, children: [shape] })
  },

  /** Geometric icon marks (used inline for play/pause/volume/fullscreen slots). */
  iconMark(opts) {
    const o = opts || {}
    const fill = 'Color/Text/Secondary'
    const kids = {
      Dot: [dot('Mark', 10, fill)],
      Ring: [frame('Mark', { w: 12, h: 12, radius: M.radiusFull, stroke: fill, strokeW: 2, fill: null, children: [] })],
      Square: [rect('Mark', { w: 10, h: 10, radius: 2, fill })],
      Bar: [rect('Mark', { w: 12, h: 3, radius: 2, fill })],
      Diamond: [rect('Mark', { w: 10, h: 10, radius: 2, fill, rotation: 45 })],
    }[o.mark || 'Dot']
    return frame('root', { center: true, w: 16, h: 16, fill: null, children: kids })
  },

  /**
   * Standalone progress meter (ProgressIndicator — watch-progress bar used on
   * video cards and the continue-watching row). LTR-locked: `Track`/`Fill` are
   * PROTECTED_LTR_ROLES (rtl.js) — a watch-progress bar always fills
   * left-to-right, matching the player timeline convention.
   */
  meter(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapTight, fill: null, minW: o.minW ?? 200,
      children: [
        frame('Track', { row: true, center: true, h: M.timelineTrack, radius: M.radiusFull, fill: 'Color/Surface/Interactive', minW: o.minW ?? 200, w: o.minW ?? 200, children: [
          rect('Fill', { w: o.fillW ?? 0, h: M.timelineTrack, radius: M.radiusFull, fill: 'Color/Brand/Primary' }),
        ] }),
        txt('Label', o.label ?? '0% watched', 'Caption', 'Color/Text/Muted'),
      ],
    })
  },

  /**
   * Player control bar — the flagship component. `Timeline` is a
   * PROTECTED_LTR_ROLE: it and its children (`TimeElapsed`/`Track`/`Fill`/
   * `Playhead`/`TimeRemaining`) are NEVER reordered or right-aligned by RTL
   * mirroring, even though the surrounding `ControlsRow` (play/pause, skip,
   * volume, captions, fullscreen) mirrors normally. See rtl.js.
   */
  player(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.card, radius: M.radiusLg,
      fill: 'Color/Surface/Elevated', stroke: 'Color/Surface/Glass (border)', strokeW: 1, minW: o.minW ?? 480,
      children: [
        frame('VideoSurface', {
          row: true, center: true, fill: 'Color/Background/Deep', h: o.surfaceH ?? 220, radius: M.radiusMd,
          children: [
            dot('PlayBadge', 56, 'Color/Brand/Primary'),
            frame('BufferingRing', { row: true, center: true, w: 40, h: 40, radius: M.radiusFull, stroke: 'Color/Brand/Primary', strokeW: 3, fill: null, hidden: true, children: [] }),
            txt('ErrorLabel', 'Playback failed. Retry.', 'Body/S', 'Color/Status/Danger', { hidden: true }),
          ],
        }),
        frame('Timeline', {
          row: true, center: true, gap: M.gap,
          children: [
            txt('TimeElapsed', '04:12', 'Technical/Mono', 'Color/Text/Secondary'),
            frame('Track', { row: true, center: true, h: M.timelineTrack, radius: M.radiusFull, fill: 'Color/Surface/Interactive', grow: 'fill', children: [
              rect('Fill', { w: 140, h: M.timelineTrack, radius: M.radiusFull, fill: 'Color/Brand/Primary' }),
              dot('Playhead', 12, 'Color/Brand/Primary'),
            ] }),
            txt('TimeRemaining', '-38:20', 'Technical/Mono', 'Color/Text/Muted'),
          ],
        }),
        frame('ControlsRow', {
          row: true, center: true, gap: M.gapWide,
          children: [
            iconSlot('PlayPauseIcon'), iconSlot('SkipBackIcon'), iconSlot('SkipForwardIcon'),
            frame('Spacer', { row: true, grow: 'fill', children: [] }),
            iconSlot('VolumeIcon'), iconSlot('CaptionsIcon'), iconSlot('SettingsIcon'), iconSlot('FullscreenIcon'),
          ],
        }),
      ],
    })
  },

  /** Video thumbnail card (VideoCard / RelatedContentCard in compact mode). */
  videoCard(opts) {
    const o = opts || {}
    const compact = !!o.compact
    return frame('root', {
      gap: M.gapTight, radius: M.radiusMd, fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default',
      strokeW: 1, minW: compact ? 220 : 280,
      children: [
        frame('Thumb', {
          row: true, center: true, fill: 'Color/Background/Deep', h: compact ? 110 : 158, radius: M.radiusMd,
          children: [
            dot('PlayMark', 32, 'Color/Brand/Primary'),
            txt('DurationBadge', '12:04', 'Technical/Mono', 'Color/Text/Primary'),
          ],
        }),
        frame('Body', {
          gap: 4, padX: M.gapWide, padY: M.gapWide,
          children: [
            frame('TitleRow', { row: true, gap: M.gap, children: [
              txt('Title', o.title ?? 'Video title', 'Title/S', 'Color/Text/Primary', { maxW: compact ? 180 : 240, grow: 'fill' }),
              dot('FavouriteFill', 8, 'Color/Brand/Primary', { hidden: true }),
            ] }),
            txt('Meta', o.meta ?? 'Instructor · Level · Category', 'Caption', 'Color/Text/Muted', { maxW: compact ? 180 : 240 }),
          ],
        }),
      ],
    })
  },

  /** Featured video hero banner (VideoHero). */
  hero(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.panel, radius: M.radius2xl,
      fill: 'Color/Background/Deep', stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 640,
      children: [
        frame('Surface', { row: true, center: true, fill: 'Color/Surface/Primary', h: 260, radius: M.radiusLg, children: [dot('PlayMark', 64, 'Color/Brand/Primary')] }),
        txt('Eyebrow', o.eyebrow ?? 'Featured', 'Caption', 'Color/Brand/Primary'),
        txt('Title', o.title ?? 'Featured video title that must wrap gracefully', 'Display/XL', 'Color/Text/Primary', { maxW: 640 }),
        txt('Meta', o.meta ?? 'Instructor · Duration · Level', 'Body/M', 'Color/Text/Secondary', { maxW: 640 }),
        frame('ActionRow', { row: true, gap: M.gap, children: [
          frame('PlayAction', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Brand/Primary', minH: M.touchMin, children: [txt('PlayLabel', o.playLabel ?? 'Play', 'Title/S', 'Color/Brand/OnBrand')] }),
          frame('SaveAction', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, minH: M.touchMin, children: [txt('SaveLabel', o.saveLabel ?? 'Save for later', 'Title/S', 'Color/Text/Primary')] }),
        ] }),
      ],
    })
  },

  /** Instructor profile card. */
  profile(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.panel, radius: M.radiusLg,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 320,
      children: [
        frame('Header', { row: true, center: true, gap: M.gapWide, children: [
          dot('Avatar', 56, 'Color/Brand/Primary'),
          frame('Identity', { gap: 2, grow: 'fill', children: [
            txt('Name', o.name ?? 'Instructor name', 'Heading/M', 'Color/Text/Primary', { maxW: 260 }),
            txt('Role', o.role ?? 'Senior Process Engineer', 'Body/S', 'Color/Text/Secondary', { maxW: 260 }),
          ] }),
        ] }),
        txt('Bio', o.bio ?? 'Short instructor biography that must remain readable when translated into longer Persian or German sentences.', 'Body/M', 'Color/Text/Secondary', { maxW: 420 }),
        frame('StatsRow', { row: true, gap: M.gapWide, children: [
          frame('Stat1', { gap: 2, children: [txt('Stat1Value', '18', 'Heading/M', 'Color/Text/Primary'), txt('Stat1Label', 'Courses', 'Caption', 'Color/Text/Muted')] }),
          frame('Stat2', { gap: 2, children: [txt('Stat2Value', '4.8', 'Heading/M', 'Color/Text/Primary'), txt('Stat2Label', 'Rating', 'Caption', 'Color/Text/Muted')] }),
        ] }),
      ],
    })
  },

  /** Upload workflow step chip (UploadWorkflowStep). */
  step(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusFull,
      fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, minH: M.touchMin, minW: 180,
      children: [
        dot('StepDot', 20, 'Color/Text/Muted'),
        frame('Content', { gap: 0, grow: 'fill', children: [
          txt('StepLabel', o.label ?? 'Upload', 'Title/S', 'Color/Text/Primary'),
          txt('StepMeta', o.meta ?? 'Step 1 of 4', 'Caption', 'Color/Text/Muted'),
        ] }),
      ],
    })
  },

  /** Transcript panel with a search field and a few timestamped lines. */
  transcript(opts) {
    const o = opts || {}
    const line = (i) => frame('Line' + i, { row: true, gap: M.gap, children: [
      txt('Stamp' + i, '0' + i + ':1' + i, 'Technical/Mono', 'Color/Text/Muted'),
      txt('Text' + i, 'Transcript line ' + i + ' of the recorded engineering walkthrough, long enough to wrap.', 'Body/S', 'Color/Text/Secondary', { grow: 'fill', maxW: 320 }),
    ] })
    return frame('root', {
      gap: M.gap, padX: M.card, padY: M.card, radius: M.radiusMd, fill: 'Color/Surface/Primary',
      stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 320,
      children: [
        frame('Header', { row: true, center: true, gap: M.gap, children: [txt('Title', 'Transcript', 'Title/S', 'Color/Text/Primary', { grow: 'fill' })] }),
        frame('SearchRow', { row: true, center: true, gap: M.gap, padX: M.gapWide, padY: M.gapTight, radius: M.radiusSm, fill: 'Color/Surface/Interactive', minH: 36, children: [txt('SearchValue', 'Search transcript…', 'Body/S', 'Color/Text/Muted', { grow: 'fill' })] }),
        frame('Lines', { gap: M.gapTight, children: [line(1), line(2), line(3)] }),
        txt('EmptyNote', 'No transcript available for this video yet.', 'Body/S', 'Color/Text/Muted', { hidden: true, maxW: 320 }),
        txt('LoadingNote', 'Loading transcript…', 'Body/S', 'Color/Text/Muted', { hidden: true }),
      ],
    })
  },

  /** Moderation review card with Approve/Reject actions. */
  reviewCard(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gap, padX: M.card, padY: M.card, radius: M.radiusMd,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 340,
      children: [
        frame('Header', { row: true, center: true, gap: M.gap, children: [dot('StateDot', 10, 'Color/Status/Warning'), txt('Title', o.title ?? 'Pending review', 'Title/S', 'Color/Text/Primary', { maxW: 320 })] }),
        txt('Body', o.body ?? 'Submitted by the author; verify accuracy and safety guidance before publishing.', 'Body/M', 'Color/Text/Secondary', { maxW: 360 }),
        frame('ActionRow', { row: true, gap: M.gap, children: [
          frame('ApproveAction', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Status/Success', minH: M.touchMin, children: [txt('ApproveLabel', 'Approve', 'Title/S', 'Color/Brand/OnBrand')] }),
          frame('RejectAction', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Status/Danger', strokeW: 1, minH: M.touchMin, children: [txt('RejectLabel', 'Reject', 'Title/S', 'Color/Status/Danger')] }),
        ] }),
      ],
    })
  },

  /** Continue-watching row: thumbnail + title/meta + LTR-locked meter + remaining time. */
  continueRow(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gapWide, padX: M.controlX, padY: M.controlY, radius: M.radiusSm,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minH: 72, minW: o.minW ?? 360,
      children: [
        frame('Thumb', { row: true, center: true, fill: 'Color/Background/Deep', w: 96, h: 54, radius: M.radiusSm, children: [dot('PlayMark', 20, 'Color/Brand/Primary')] }),
        frame('Content', { gap: 4, grow: 'fill', children: [
          txt('Title', o.title ?? 'Resume: video title', 'Body/M', 'Color/Text/Primary', { maxW: 320 }),
          frame('Meter', { row: true, center: true, gap: M.gapTight, children: [
            frame('MeterTrack', { row: true, center: true, h: 4, radius: M.radiusFull, fill: 'Color/Surface/Interactive', w: 200, children: [rect('MeterFill', { w: 120, h: 4, radius: M.radiusFull, fill: 'Color/Brand/Primary' })] }),
          ] }),
        ] }),
        txt('Trail', o.trail ?? '12 min left', 'Technical/Mono', 'Color/Text/Muted'),
      ],
    })
  },
})

// pure validators (used by tests) --------------------------------------------
/** Collect roles of a NodeSpec tree. @param {any} n @param {string[]} [acc] */
function collectRoles(n, acc) {
  const out = acc || []
  out.push(n.role)
  for (const c of n.children || []) collectRoles(c, out)
  return out
}
/** Collect referenced token names (fill/stroke/textFill). @param {any} n @param {Set<string>} [acc] */
function collectTokens(n, acc) {
  const out = acc || new Set()
  for (const k of ['fill', 'stroke', 'textFill']) if (n[k]) out.add(n[k])
  for (const c of n.children || []) collectTokens(c, out)
  return out
}
/** Collect referenced textStyle names. @param {any} n @param {Set<string>} [acc] */
function collectTextStyles(n, acc) {
  const out = acc || new Set()
  if (n.textStyle) out.add(n.textStyle)
  for (const c of n.children || []) collectTextStyles(c, out)
  return out
}
/** Find a role in a tree. @param {any} n @param {string} role @returns {any|null} */
function findRole(n, role) {
  if (n.role === role) return n
  for (const c of n.children || []) { const f = findRole(c, role); if (f) return f }
  return null
}

module.exports = { M, PRESETS, STATE_PRESETS, frame, txt, dot, rect, iconSlot, collectRoles, collectTokens, collectTextStyles, findRole }

  };
  __modules["components"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Phase 102 "Hermes Media & Video Hub" component registry — 23 families (22
 * media-domain families + 1 shared Icon utility) declared as production
 * anatomy blueprints (presets.js) with variant AXES,
 * interaction STATES (Focus is a REAL variant on every interactive family, not
 * decoration), per-value overrides, bound TEXT/BOOLEAN/INSTANCE_SWAP
 * properties, Direction (LTR/RTL) axes where horizontal ordering matters, and
 * accessibility descriptions.
 *
 * Coverage against the task brief:
 *   video card, video hero, player (control bar + timeline + buffering +
 *   error), playlist/chapter navigation, transcript panel, subtitle toggle,
 *   search field, filter controls, category chips, progress indicators,
 *   instructor profile, related content, favourite button, continue-watching
 *   row, analytics cards, upload workflow steps, editorial workflow states
 *   (draft/submitted/in review/published/rejected/archived), moderation/review
 *   state, empty/error/loading states, dialogs, explicit focus states.
 *
 * Family shape (same contract as the Phase 87 design-system plugin):
 *   key, name, category, maps
 *   preset, presetOpts        anatomy blueprint (presets.js)
 *   axes: [{prop, values}]    variant axes (cartesian product = components)
 *   valueOverrides?: {axisProp: {value: overrides[]}}   family-specific looks
 *   text/bools/swaps: [{name, role}]                    bound component props
 *   dirAxis?: true            adds Direction=LTR/RTL axis (renderer mirrors,
 *                             respecting rtl.js PROTECTED_LTR_ROLES)
 *   a11y: accessible-usage contract (joined into description + annotation)
 *   description
 */

/** @param {string} prop @param {string[]} values */
const axis = (prop, values) => ({ prop, values })
/** @param {string} name @param {string} role */
const p = (name, role) => ({ name, role })

/** @type {any[]} */
const FAMILIES = [
  {
    key: 'video-card', name: 'VideoCard', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaAsset',
    preset: 'videoCard', presetOpts: { title: 'Root cause analysis: bearing failure', meta: 'A. Karimi · Intermediate · Rotating Equipment' },
    axes: [axis('State', ['Default', 'Hover', 'Focus', 'Loading'])], dirAxis: true,
    bools: [p('Favourited', 'FavouriteFill')],
    text: [p('Title', 'Title'), p('Meta', 'Meta'), p('Duration', 'DurationBadge')],
    valueOverrides: {
      State: {
        Hover: [{ role: 'root', set: { fill: 'Color/Surface/Interactive' } }],
        Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
        Loading: [{ role: 'Title', set: { textFill: 'Color/Text/Muted' } }, { role: 'Meta', set: { textFill: 'Color/Text/Muted' } }, { role: 'DurationBadge', set: { hidden: true } }],
      },
    },
    a11y: 'Play state is icon + text duration badge, never colour alone; Favourite carries an accessible name in code; whole card is one tab stop to the detail page; focus ring 2px + halo.',
    description: 'Video thumbnail card for library grids, search results and related content.',
  },
  {
    key: 'video-hero', name: 'VideoHero', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaAsset',
    preset: 'hero', presetOpts: {},
    axes: [axis('State', ['Default', 'Loading'])], dirAxis: true,
    text: [p('Eyebrow', 'Eyebrow'), p('Title', 'Title'), p('Meta', 'Meta'), p('PlayLabel', 'PlayLabel'), p('SaveLabel', 'SaveLabel')],
    valueOverrides: {
      State: { Loading: [{ role: 'Title', set: { textFill: 'Color/Text/Muted' } }, { role: 'PlayAction', set: { fill: 'Color/Surface/Interactive' } }, { role: 'PlayLabel', set: { textFill: 'Color/Text/Disabled' } }] },
    },
    a11y: 'Hero is a landmark region with a real heading; Play/Save are ≥40px targets with visible focus; loading state is textual, not merely a spinner.',
    description: 'Featured video banner for the library landing area.',
  },
  {
    key: 'player-control-bar', name: 'PlayerControlBar', category: 'media', maps: 'docs/phase102/architecture.md §4 self-hosted playback',
    preset: 'player', presetOpts: {},
    axes: [axis('State', ['Playing', 'Paused', 'Buffering', 'Focus', 'Error', 'Ended'])], dirAxis: true,
    text: [p('ElapsedTime', 'TimeElapsed'), p('RemainingTime', 'TimeRemaining')],
    swaps: [p('PlayPauseIcon', 'PlayPauseIcon')],
    valueOverrides: {
      State: {
        Paused: [{ role: 'PlayBadge', set: { fill: 'Color/Brand/Hover' } }],
        Buffering: [{ role: 'BufferingRing', set: { hidden: false } }, { role: 'PlayBadge', set: { hidden: true } }],
        Error: [{ role: 'ErrorLabel', set: { hidden: false } }, { role: 'PlayBadge', set: { hidden: true } }, { role: 'Fill', set: { fill: 'Color/Status/Danger' } }, { role: 'root', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }],
        Ended: [{ role: 'Fill', set: { w: 400 } }, { role: 'TimeRemaining', set: { text: '00:00' } }, { role: 'TimeElapsed', set: { text: '42:32' } }],
      },
    },
    a11y: 'Buffering/Error are explicit TEXTUAL + iconic states, never spinner-only. CRITICAL: the seek bar and elapsed/remaining timestamps are LOCKED left-to-right even under RTL layouts — Direction=RTL mirrors only the surrounding transport controls (rtl.js PROTECTED_LTR_ROLES). All transport controls are ≥40px targets with visible focus.',
    description: 'Self-hosted video player control bar: timeline, transport controls, buffering and error states.',
  },
  {
    key: 'playlist-chapter-nav', name: 'PlaylistChapterNav', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaChapter',
    preset: 'listRow', presetOpts: { title: 'Chapter 2 — Vibration diagnostics', meta: false, trail: '06:40', titleStyle: 'Body/M' },
    axes: [axis('State', ['Upcoming', 'Active', 'Completed', 'Focus'])], dirAxis: true,
    text: [p('ChapterTitle', 'Title'), p('ChapterTime', 'Trail')],
    valueOverrides: {
      State: {
        Upcoming: [{ role: 'StateDot', set: { fill: 'Color/Text/Muted' } }, { role: 'Title', set: { textFill: 'Color/Text/Secondary' } }],
        Active: [{ role: 'root', set: { fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Active' } }, { role: 'StateDot', set: { fill: 'Color/Brand/Primary' } }],
        Completed: [{ role: 'StateDot', set: { fill: 'Color/Status/Success' } }],
        Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
      },
    },
    a11y: 'Chapter list is a nav landmark; current chapter has aria-current in code; timestamp is Technical/Mono and always LTR; row ≥40px.',
    description: 'Chapter/playlist navigation row for the video-detail sidebar.',
  },
  {
    key: 'transcript-panel', name: 'TranscriptPanel', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaTranscript',
    preset: 'transcript', presetOpts: {},
    axes: [axis('State', ['Default', 'Empty', 'Loading', 'Focus'])], dirAxis: true,
    text: [p('PanelTitle', 'Title'), p('SearchValue', 'SearchValue')],
    valueOverrides: {
      State: {
        Empty: [{ role: 'Lines', set: { hidden: true } }, { role: 'EmptyNote', set: { hidden: false } }],
        Loading: [{ role: 'Lines', set: { hidden: true } }, { role: 'LoadingNote', set: { hidden: false } }],
        Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
      },
    },
    a11y: 'Transcript lines are readable, wrapping body text; each timestamp is Technical/Mono and always LTR; empty/loading states are textual; search input ≥36px.',
    description: 'Searchable per-locale transcript panel next to the player.',
  },
  {
    key: 'subtitle-toggle', name: 'SubtitleToggle', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaSubtitleTrack',
    preset: 'toggle', presetOpts: { label: 'English captions' },
    axes: [axis('Value', ['Off', 'On']), axis('State', ['Default', 'Hover', 'Focus', 'Disabled'])], dirAxis: true,
    text: [p('Label', 'Label')],
    valueOverrides: {
      Value: { Off: [], On: [{ role: 'Mark', set: { fill: 'Color/Brand/Primary', stroke: null } }, { role: 'Knob', set: { fill: 'Color/Brand/OnBrand' } }] },
      State: { Focus: [{ role: 'Mark', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    a11y: 'role=switch with state announced; label programmatically associated; 40px row target.',
    description: 'WebVTT subtitle/caption language toggle.',
  },
  {
    key: 'search-field', name: 'SearchField', category: 'media', maps: null,
    preset: 'field', presetOpts: { label: 'Search', value: 'Search videos, chapters, transcripts…', leadIcon: true, trailMark: true },
    axes: [axis('State', ['Default', 'Focus', 'Filled'])], dirAxis: true,
    text: [p('Placeholder', 'Value')], swaps: [p('LeadIcon', 'IconSlot')],
    valueOverrides: {
      State: {
        Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
        Filled: [{ role: 'Value', set: { textFill: 'Color/Text/Primary' } }, { role: 'TrailMark', set: { hidden: false } }],
      },
    },
    a11y: 'type=search with a clear affordance in code (TrailMark reveals it); icon decorative; box ≥40px.',
    description: 'Library and search-results query field.',
  },
  {
    key: 'filter-chip', name: 'FilterChip', category: 'media', maps: null,
    preset: 'control', presetOpts: { label: 'Level: Intermediate', padY: 8, radius: 9999, minH: 40, textStyle: 'Body/S' },
    axes: [axis('State', ['Default', 'Selected', 'Focus'])], dirAxis: true,
    text: [p('Label', 'Label')],
    valueOverrides: {
      State: {
        Selected: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }, { role: 'Label', set: { textFill: 'Color/Brand/Primary' } }],
        Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
      },
    },
    a11y: 'aria-pressed reflects Selected; toggled via keyboard and pointer; ≥36px target; focus ring 2px.',
    description: 'Facet filter control (level, category, language).',
  },
  {
    key: 'category-chip', name: 'CategoryChip', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaCategory',
    preset: 'control', presetOpts: { label: 'Rotating Equipment', padY: 4, radius: 9999, minH: 28, textStyle: 'Caption' },
    axes: [axis('Tone', ['Default', 'Industrial', 'Safety', 'Featured'])], dirAxis: false,
    text: [p('Label', 'Label')],
    valueOverrides: {
      Tone: {
        Default: [{ role: 'root', set: { fill: null, stroke: 'Color/Border/Default' } }],
        Industrial: [{ role: 'root', set: { fill: 'Color/Status/Information (subtle)', stroke: 'Color/Status/Information (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Information' } }],
        Safety: [{ role: 'root', set: { fill: 'Color/Status/Danger (subtle)', stroke: 'Color/Status/Danger (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Danger' } }],
        Featured: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }, { role: 'Label', set: { textFill: 'Color/Brand/Primary' } }],
      },
    },
    a11y: 'Read-only taxonomy tag; non-interactive; tone is decorative only, label always present.',
    description: 'Category/taxonomy tag pill shown on video cards and detail pages.',
  },
  {
    key: 'progress-indicator', name: 'ProgressIndicator', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaWatchProgress',
    preset: 'meter', presetOpts: {},
    axes: [axis('Value', ['0', '25', '50', '75', '100'])], dirAxis: false,
    text: [p('Label', 'Label')],
    valueOverrides: {
      Value: {
        '0': [{ role: 'Fill', set: { w: 0 } }, { role: 'Label', set: { text: 'Not started' } }],
        '25': [{ role: 'Fill', set: { w: 50 } }, { role: 'Label', set: { text: '25% watched' } }],
        '50': [{ role: 'Fill', set: { w: 100 } }, { role: 'Label', set: { text: '50% watched' } }],
        '75': [{ role: 'Fill', set: { w: 150 } }, { role: 'Label', set: { text: '75% watched' } }],
        '100': [{ role: 'Fill', set: { w: 200 } }, { role: 'Label', set: { text: 'Completed' } }],
      },
    },
    a11y: 'Percentage always stated as text, never colour-only; the fill track is LOCKED left-to-right even inside RTL frames (rtl.js) — a watch-progress bar reads the same direction as the player timeline.',
    description: 'Standalone watch-progress meter used on video cards and the continue-watching row.',
  },
  {
    key: 'instructor-profile-card', name: 'InstructorProfileCard', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaInstructor',
    preset: 'profile', presetOpts: {},
    axes: [axis('State', ['Default', 'Focus'])], dirAxis: true,
    text: [p('Name', 'Name'), p('Role', 'Role'), p('Bio', 'Bio')],
    valueOverrides: { State: { Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] } },
    a11y: 'Heading order preserved in code; bio wraps at a fixed width (FA/DE resilient); stats are labelled, not icon-only.',
    description: 'Instructor profile summary card.',
  },
  {
    key: 'related-content-card', name: 'RelatedContentCard', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaAsset',
    preset: 'videoCard', presetOpts: { compact: true, title: 'Related: Alignment tolerances', meta: 'B. Rahimi · Beginner' },
    axes: [axis('State', ['Default', 'Hover', 'Focus'])], dirAxis: true,
    text: [p('Title', 'Title'), p('Meta', 'Meta')],
    valueOverrides: {
      State: { Hover: [{ role: 'root', set: { fill: 'Color/Surface/Interactive' } }], Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    a11y: 'Compact VideoCard variant; same accessibility contract (icon+text duration, single tab stop, 2px focus ring).',
    description: 'Compact related/recommended video card.',
  },
  {
    key: 'favourite-button', name: 'FavouriteButton', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaSave',
    preset: 'control', presetOpts: { icon: true, label: '', padX: 10, minH: 40, minW: 40 },
    axes: [axis('Value', ['Unsaved', 'Saved']), axis('State', ['Default', 'Hover', 'Focus'])], dirAxis: false,
    swaps: [p('Icon', 'IconSlot')],
    valueOverrides: {
      Value: { Unsaved: [], Saved: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }] },
      State: { Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    hideLabel: true,
    a11y: 'Icon-only: REQUIRES aria-pressed + aria-label in code ("Save"/"Saved"); 40×40 min target; focus ring 2px.',
    description: 'Save/favourite toggle for a video.',
  },
  {
    key: 'continue-watching-row', name: 'ContinueWatchingRow', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaWatchProgress',
    preset: 'continueRow', presetOpts: {},
    axes: [axis('State', ['Default', 'Focus'])], dirAxis: true,
    text: [p('Title', 'Title'), p('RemainingLabel', 'Trail')],
    valueOverrides: { State: { Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] } },
    a11y: 'Title/meta mirror under RTL; the embedded watch-progress meter and the remaining-time label are LOCKED left-to-right (rtl.js) exactly like the player timeline; row ≥40px, single tab stop.',
    description: 'Resume-watching row for the "Continue Watching" surface.',
  },
  {
    key: 'analytics-card', name: 'AnalyticsCard', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaViewEvent',
    preset: 'card', presetOpts: { title: 'Total views', value: '12,480', unit: 'plays', meta: 'vs last 30 days', minW: 240 },
    axes: [axis('Trend', ['Up', 'Down', 'Flat']), axis('State', ['Default', 'Loading'])], dirAxis: true,
    text: [p('Label', 'Title'), p('Value', 'Value'), p('Unit', 'Unit')],
    valueOverrides: {
      Trend: { Up: [{ role: 'StateDot', set: { fill: 'Color/Status/Success' } }], Down: [{ role: 'StateDot', set: { fill: 'Color/Status/Danger' } }], Flat: [{ role: 'StateDot', set: { fill: 'Color/Text/Muted' } }] },
      State: { Loading: [{ role: 'Value', set: { textFill: 'Color/Text/Muted' } }] },
    },
    a11y: 'Value carries meaning; trend colour is supportive only; loading state is stated in text, never a bare spinner.',
    description: 'Single-metric analytics card (views, completion, saves) for the instructor and admin surfaces.',
  },
  {
    key: 'upload-workflow-step', name: 'UploadWorkflowStep', category: 'media', maps: 'docs/phase102/architecture.md §5 processingState',
    preset: 'step', presetOpts: { label: 'Upload file', meta: 'Step 1 of 4' },
    axes: [axis('State', ['Upcoming', 'Current', 'Complete', 'Error'])], dirAxis: true,
    text: [p('StepLabel', 'StepLabel'), p('StepMeta', 'StepMeta')],
    valueOverrides: {
      State: {
        Upcoming: [{ role: 'StepDot', set: { fill: 'Color/Text/Muted' } }, { role: 'StepLabel', set: { textFill: 'Color/Text/Secondary' } }],
        Current: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }, { role: 'StepDot', set: { fill: 'Color/Brand/Primary' } }],
        Complete: [{ role: 'StepDot', set: { fill: 'Color/Status/Success' } }],
        Error: [{ role: 'StepDot', set: { fill: 'Color/Status/Danger' } }, { role: 'root', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }],
      },
    },
    a11y: 'Stepper item exposes aria-current="step" for Current in code; state is textual + colour; ≥40px row.',
    description: 'One step of the upload wizard (Upload → Details → Review → Published).',
  },
  {
    key: 'editorial-workflow-badge', name: 'EditorialWorkflowBadge', category: 'media', maps: 'docs/phase102/architecture.md §11 editorial workflow',
    preset: 'control', presetOpts: { label: 'Draft', padX: 10, padY: 4, minH: 24, radius: 9999, textStyle: 'Caption' },
    axes: [axis('State', ['Draft', 'Submitted', 'InReview', 'Published', 'Rejected', 'Archived'])], dirAxis: false,
    text: [p('Label', 'Label')],
    valueOverrides: {
      State: {
        Draft: [{ role: 'root', set: { fill: null, stroke: 'Color/Border/Default' } }, { role: 'Label', set: { textFill: 'Color/Text/Muted', text: 'Draft' } }],
        Submitted: [{ role: 'root', set: { fill: 'Color/Status/Information (subtle)', stroke: 'Color/Status/Information (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Information', text: 'Submitted' } }],
        InReview: [{ role: 'root', set: { fill: 'Color/Status/Warning (subtle)', stroke: 'Color/Status/Warning (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Warning', text: 'In review' } }],
        Published: [{ role: 'root', set: { fill: 'Color/Status/Success (subtle)', stroke: 'Color/Status/Success (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Success', text: 'Published' } }],
        Rejected: [{ role: 'root', set: { fill: 'Color/Status/Danger (subtle)', stroke: 'Color/Status/Danger (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Danger', text: 'Rejected' } }],
        Archived: [{ role: 'root', set: { fill: null, stroke: 'Color/Border/Default' } }, { role: 'Label', set: { textFill: 'Color/Text/Disabled', text: 'Archived' } }],
      },
    },
    a11y: 'Lifecycle state is text + colour, never colour alone; the 6 variants map 1:1 onto the pure transition table in the architecture ADR §11 (DRAFT → SUBMITTED → IN_REVIEW → PUBLISHED → ARCHIVED, REJECTED reachable from review).',
    description: 'Editorial lifecycle-state badge (real variants, not decoration).',
  },
  {
    key: 'moderation-review-card', name: 'ModerationReviewCard', category: 'media', maps: 'docs/phase102/architecture.md §11 review_media',
    preset: 'reviewCard', presetOpts: {},
    axes: [axis('State', ['Pending', 'Approved', 'Rejected', 'Focus'])], dirAxis: true,
    text: [p('Title', 'Title'), p('Body', 'Body')],
    valueOverrides: {
      State: {
        Pending: [],
        Approved: [{ role: 'StateDot', set: { fill: 'Color/Status/Success' } }, { role: 'RejectAction', set: { opacity: 0.5 } }],
        Rejected: [{ role: 'StateDot', set: { fill: 'Color/Status/Danger' } }, { role: 'ApproveAction', set: { opacity: 0.5 } }],
      },
    },
    a11y: 'Approve/Reject are distinct, separately labelled ≥40px actions (review_media permission in code); outcome dimming is supportive, never colour-only (label text still present); Focus shows a keyboard-navigable ring before either action is chosen.',
    description: 'Moderation queue card for SUBMITTED/IN_REVIEW media.',
  },
  {
    key: 'media-empty-state', name: 'MediaEmptyState', category: 'media', maps: null,
    preset: 'card', presetOpts: { title: 'No videos yet', body: 'Once your organization publishes media, it will appear here.', action: 'Upload a video', minW: 320 },
    axes: [axis('Tone', ['Neutral', 'Brand'])], dirAxis: true,
    text: [p('Title', 'Title'), p('Description', 'Body'), p('ActionLabel', 'ActionLabel')],
    valueOverrides: {
      Tone: {
        Brand: [{ role: 'StateDot', set: { fill: 'Color/Brand/Primary' } }, { role: 'Action', set: { fill: 'Color/Brand/Primary' } }],
        Neutral: [{ role: 'StateDot', set: { fill: 'Color/Text/Muted' } }, { role: 'Action', set: { fill: 'Color/Surface/Interactive' } }, { role: 'ActionLabel', set: { textFill: 'Color/Text/Primary' } }],
      },
    },
    a11y: 'Always offers a next action; action is a real ≥40px target.',
    description: 'Zero-data placeholder for empty video lists/search results.',
  },
  {
    key: 'media-error-state', name: 'MediaErrorState', category: 'media', maps: null,
    preset: 'card', presetOpts: { title: 'Video failed to load', body: 'The stream could not be reached. Check your connection and try again.', action: 'Retry', dotFill: 'Color/Status/Danger', minW: 320 },
    axes: [axis('Tone', ['Danger', 'Warning'])], dirAxis: true,
    text: [p('Title', 'Title'), p('Description', 'Body'), p('ActionLabel', 'ActionLabel')],
    valueOverrides: {
      Tone: { Danger: [{ role: 'StateDot', set: { fill: 'Color/Status/Danger' } }], Warning: [{ role: 'StateDot', set: { fill: 'Color/Status/Warning' } }, { role: 'Title', set: { text: 'Playback degraded' } }] },
    },
    a11y: 'Error announced via a live region in code; retry is a ≥40px target.',
    description: 'Recoverable error surface for library/search/player failures.',
  },
  {
    key: 'media-loading-state', name: 'MediaLoadingState', category: 'media', maps: null,
    preset: 'loader', presetOpts: {},
    axes: [axis('Shape', ['Line', 'Block', 'Circle'])], shapeAxis: true, dirAxis: false,
    a11y: 'Decorative: aria-hidden; paired with a textual busy status in code.',
    description: 'Loading skeleton placeholder (title line, thumbnail block, avatar circle).',
  },
  {
    key: 'media-dialog', name: 'MediaDialog', category: 'media', maps: 'docs/phase102/architecture.md §11 publication event',
    preset: 'overlay', presetOpts: { title: 'Publish this video?', body: 'It will become visible to everyone with library access.', actions: ['Publish', 'Cancel'] },
    axes: [axis('Kind', ['Confirm', 'Destructive', 'Info'])], dirAxis: true, elevation: 'Elevation/E4',
    text: [p('Title', 'Title'), p('Body', 'Body'), p('ConfirmLabel', 'PrimaryLabel'), p('CancelLabel', 'SecondaryLabel')],
    valueOverrides: {
      Kind: {
        Confirm: [],
        Destructive: [{ role: 'PrimaryAction', set: { fill: 'Color/Status/Danger' } }, { role: 'PrimaryLabel', set: { text: 'Delete' } }, { role: 'Title', set: { text: 'Delete this video?' } }],
        Info: [{ role: 'PrimaryAction', set: { fill: 'Color/Status/Information' } }, { role: 'PrimaryLabel', set: { text: 'Got it' } }],
      },
    },
    a11y: 'aria-modal + labelled title + focus trap in code; E4 elevation on glass overlay; Destructive requires a confirmation phrase in code, not just colour.',
    description: 'Confirmation/destructive/informational dialog for publish, delete and review actions.',
  },
  {
    key: 'icon', name: 'Icon', category: 'utility', maps: null,
    preset: 'iconMark', presetOpts: {},
    axes: [axis('Mark', ['Dot', 'Ring', 'Square', 'Bar', 'Diamond'])], markAxis: true, dirAxis: false,
    a11y: 'Decorative geometric marks; meaning is always carried by adjacent text/label, never the icon alone.',
    description: 'Geometric icon-mark utility family used as the INSTANCE_SWAP default for play/pause, transport, volume, captions, fullscreen, search and favourite icon slots across the other 22 families (honest, font-free — same convention as the Phase 87 design-system plugin).',
  },
]

// derived helpers -------------------------------------------------------------
/** Cartesian variant combos for a family. @param {any} fam @returns {Record<string,string>[]} */
function variantCombos(fam) {
  /** @type {Record<string,string>[]} */
  let combos = [{}]
  const axes = [...fam.axes, ...(fam.dirAxis ? [{ prop: 'Direction', values: ['LTR', 'RTL'] }] : [])]
  for (const ax of axes) {
    const next = []
    for (const c of combos) for (const v of ax.values) next.push({ ...c, [ax.prop]: v })
    combos = next
  }
  return combos
}
/** Total variant components across all families. */
function totalVariants() {
  return FAMILIES.reduce((n, f) => n + variantCombos(f).length, 0)
}

module.exports = { FAMILIES, variantCombos, totalVariants }

  };
  __modules["locale-strings"] = function (module, exports, require) {
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

  };
  __modules["screens"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Screens page composition — 6 screen types × 3 breakpoints × 3 locales = 54
 * screen declarations, each built ONLY from component INSTANCES of the
 * generated Phase 102 component sets (plus heading text and row/col auto-
 * layout groups) — same architecture as the Phase 87 design-system plugin's
 * `assemblies.js`, extended with a THIRD breakpoint and a vertical `col`
 * grouping (needed for the chapter-list + transcript side-by-side layout).
 *
 * Item shape (interpreted by the renderer in figma-exec.js):
 *   { family, variant?, props?, D }   component instance (+Direction when the
 *                                      family declares a Direction axis)
 *   { heading: string, style }        plain heading text
 *   { row: Item[] }                   HORIZONTAL group — reversed under RTL
 *   { col: Item[] }                   VERTICAL group — never reversed (only
 *                                      horizontal order mirrors under RTL)
 *
 * RTL correctness: reversing a `row`'s items (and right-aligning heading text)
 * happens here, at composition time — exactly like the proven assemblies.js
 * pattern. The player timeline / progress-meter LTR lock is NOT handled here;
 * it is guaranteed one level down, inside each protected component's OWN
 * Direction=RTL variant (see rtl.js + figma-exec.js mirrorRtl), so simply
 * placing a `player-control-bar` instance and letting its position in a row
 * flip is correct — the instance's internal timeline never gets touched.
 */

const { LOCALES, RTL_LOCALES, str } = require('locale-strings')

/** @type {ReadonlyArray<{ id:string, width:number }>} */
const BREAKPOINTS = [
  { id: 'desktop', width: 1440 },
  { id: 'tablet', width: 768 },
  { id: 'mobile', width: 390 },
]

const SCREEN_TYPES = Object.freeze(['library', 'watch', 'search', 'instructor', 'continue-watching', 'upload'])

/** Column budget per breakpoint for repeated grid content. @param {string} bp */
function colsFor(bp) {
  return bp === 'desktop' ? 3 : bp === 'tablet' ? 2 : 1
}

/** @param {number} n @param {(i:number)=>any} factory */
function times(n, factory) {
  return Array.from({ length: n }, (_, i) => factory(i))
}

/**
 * Item list for one screen type + breakpoint + locale. All visible strings
 * come from locale-strings.js (see its provenance note — original design
 * copy, not yet in the repository catalogs).
 * @param {string} screenType @param {string} bp @param {'en'|'fa'|'de'} l
 * @returns {any[]}
 */
function itemsFor(screenType, bp, l) {
  const cols = colsFor(bp)
  const rtl = RTL_LOCALES.has(l)
  const D = rtl ? 'RTL' : 'LTR'
  const headStyle = bp === 'desktop' ? 'Heading/L' : 'Heading/M'
  const subHeadStyle = 'Heading/M'
  /** @param {string} family @param {Record<string,string>} [variant] @param {Record<string,string>} [props] */
  const inst = (family, variant, props) => ({ family, variant: variant || {}, props: props || {}, D })

  switch (screenType) {
    case 'library':
      return [
        inst('video-hero', { State: 'Default' }, { Eyebrow: 'Featured', Title: str('videoTitle', l), Meta: str('videoMeta', l), PlayLabel: 'Play', SaveLabel: 'Save for later' }),
        { heading: str('libraryHeading', l), style: headStyle },
        inst('search-field', { State: 'Default' }, { Placeholder: str('searchPlaceholder', l) }),
        { row: [
          inst('filter-chip', { State: 'Selected' }, { Label: str('filterLevel', l) }),
          ...(cols >= 2 ? [inst('filter-chip', { State: 'Default' }, { Label: 'Category' })] : []),
          ...(cols >= 3 ? [inst('filter-chip', { State: 'Default' }, { Label: 'Language' })] : []),
        ] },
        { row: [
          inst('category-chip', { Tone: 'Featured' }, { Label: str('categoryIndustrial', l) }),
          ...(cols >= 2 ? [inst('category-chip', { Tone: 'Industrial' }, { Label: 'Safety' })] : []),
          ...(cols >= 3 ? [inst('category-chip', { Tone: 'Default' }, { Label: 'Maintenance' })] : []),
        ] },
        { row: times(cols, () => inst('video-card', { State: 'Default' }, { Title: str('videoTitle', l), Meta: str('videoMeta', l), Duration: '12:04' })) },
        { row: times(cols, () => inst('video-card', { State: 'Default' }, { Title: str('relatedTitle', l), Meta: str('relatedMeta', l), Duration: '08:21' })) },
      ]

    case 'watch': {
      const chapters = [
        inst('playlist-chapter-nav', { State: 'Completed' }, { ChapterTitle: 'Chapter 1 — Symptom review', ChapterTime: '00:00' }),
        inst('playlist-chapter-nav', { State: 'Active' }, { ChapterTitle: 'Chapter 2 — Vibration diagnostics', ChapterTime: '06:40' }),
        inst('playlist-chapter-nav', { State: 'Upcoming' }, { ChapterTitle: 'Chapter 3 — Corrective action', ChapterTime: '18:05' }),
      ]
      const transcript = inst('transcript-panel', { State: 'Default' })
      const sideBySide = cols >= 2 ? [{ row: [{ col: chapters }, transcript] }] : [{ col: chapters }, transcript]
      return [
        { heading: str('videoTitle', l), style: headStyle },
        inst('player-control-bar', { State: 'Playing' }, { ElapsedTime: '04:12', RemainingTime: '-38:20' }),
        { row: [inst('favourite-button', { Value: 'Unsaved', State: 'Default' }), inst('subtitle-toggle', { Value: 'On', State: 'Default' }, { Label: 'English captions' })] },
        ...sideBySide,
        { heading: str('watchRelatedHeading', l), style: subHeadStyle },
        { row: times(cols, () => inst('related-content-card', { State: 'Default' }, { Title: str('relatedTitle', l), Meta: str('relatedMeta', l) })) },
      ]
    }

    case 'search':
      return [
        { heading: str('searchHeading', l), style: headStyle },
        { heading: str('searchQueryNote', l), style: 'Body/M' },
        inst('search-field', { State: 'Filled' }, { Placeholder: str('searchPlaceholder', l) }),
        { row: [
          inst('filter-chip', { State: 'Default' }, { Label: str('filterLevel', l) }),
          ...(cols >= 2 ? [inst('filter-chip', { State: 'Selected' }, { Label: str('categoryIndustrial', l) })] : []),
        ] },
        { row: times(cols, () => inst('video-card', { State: 'Default' }, { Title: str('videoTitle', l), Meta: str('videoMeta', l), Duration: '12:04' })) },
      ]

    case 'instructor': {
      const stats = [
        { trend: 'Up', label: 'Total views', value: '12,480', unit: 'plays' },
        { trend: 'Flat', label: 'Avg. rating', value: '4.8', unit: '/5' },
        { trend: 'Down', label: 'Completion rate', value: '62', unit: '%' },
      ]
      return [
        inst('instructor-profile-card', { State: 'Default' }, { Name: str('instructorName', l), Role: str('instructorRole', l), Bio: str('instructorBio', l) }),
        { row: times(cols, (i) => inst('analytics-card', { Trend: stats[i % 3].trend, State: 'Default' }, { Label: stats[i % 3].label, Value: stats[i % 3].value, Unit: stats[i % 3].unit })) },
        { heading: str('instructorCoursesHeading', l), style: subHeadStyle },
        { row: times(cols, () => inst('related-content-card', { State: 'Default' }, { Title: str('relatedTitle', l), Meta: str('relatedMeta', l) })) },
      ]
    }

    case 'continue-watching':
      return [
        { heading: str('continueHeading', l), style: headStyle },
        ...times(cols, () => inst('continue-watching-row', { State: 'Default' }, { Title: str('continueTitle', l), RemainingLabel: str('continueTrail', l) })),
        { heading: str('favouritesHeading', l), style: subHeadStyle },
        { row: times(cols, () => inst('video-card', { State: 'Default' }, { Title: str('videoTitle', l), Meta: str('videoMeta', l), Duration: '12:04' })) },
      ]

    case 'upload': {
      const steps = [
        inst('upload-workflow-step', { State: 'Complete' }, { StepLabel: str('uploadStep1', l), StepMeta: '1/4' }),
        inst('upload-workflow-step', { State: 'Complete' }, { StepLabel: str('uploadStep2', l), StepMeta: '2/4' }),
        inst('upload-workflow-step', { State: 'Current' }, { StepLabel: str('uploadStep3', l), StepMeta: '3/4' }),
        inst('upload-workflow-step', { State: 'Upcoming' }, { StepLabel: str('uploadStep4', l), StepMeta: '4/4' }),
      ]
      const stepRows = cols >= 3 ? [{ row: steps }] : cols === 2 ? [{ row: steps.slice(0, 2) }, { row: steps.slice(2) }] : steps
      return [
        { heading: str('uploadHeading', l), style: headStyle },
        ...stepRows,
        { row: [inst('video-card', { State: 'Default' }, { Title: str('videoTitle', l), Meta: str('videoMeta', l), Duration: '12:04' }), inst('editorial-workflow-badge', { State: 'InReview' }, { Label: 'In review' })] },
        { heading: str('moderationHeading', l), style: subHeadStyle },
        inst('moderation-review-card', { State: 'Pending' }, { Title: str('reviewTitle', l), Body: str('reviewBody', l) }),
        inst('media-dialog', { Kind: 'Confirm' }, { Title: str('publishDialogTitle', l), Body: str('publishDialogBody', l), ConfirmLabel: 'Publish', CancelLabel: 'Cancel' }),
      ]
    }

    default:
      throw new Error('unknown screen type: ' + screenType)
  }
}

/**
 * The 54 screen declarations (6 screen types × 3 breakpoints × 3 locales).
 * @returns {any[]}
 */
function buildScreens() {
  /** @type {any[]} */
  const out = []
  for (const st of SCREEN_TYPES) {
    for (const bp of BREAKPOINTS) {
      for (const l of LOCALES) {
        out.push({
          key: 'screen:' + st + ':' + bp.id + ':' + l,
          screenType: st,
          breakpoint: bp.id,
          locale: l,
          rtl: RTL_LOCALES.has(l),
          width: bp.width,
          name: 'Screen/' + st + '/' + bp.id + '/' + l.toUpperCase(),
          items: itemsFor(st, bp.id, l),
        })
      }
    }
  }
  return out
}

module.exports = { buildScreens, BREAKPOINTS, SCREEN_TYPES, colsFor }

  };
  __modules["docs"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Foundations-page documentation specimens — pure NodeSpec trees (same DSL as
 * presets.js) rendered directly onto "01 Foundations" (not components; no
 * variants). These make the token collections visually reviewable: a colour
 * swatch grid grouped exactly like tokens.js `COLOR_TOKENS[].group`, a
 * self-labelled type-ramp specimen (each line rendered IN its own text
 * style), a spacing/radius scale strip, and an elevation/glass specimen row
 * that actually binds the real Elevation/E1-E4 + Glass/Overlay effect styles.
 */

const { frame, txt, rect, M } = require('presets')

/**
 * @param {ReadonlyArray<{figma:string, group:string}>} colorTokens
 * @returns {any} NodeSpec
 */
function buildColorSwatchesSpec(colorTokens) {
  /** @type {Record<string, {figma:string}[]>} */
  const groups = {}
  for (const t of colorTokens) { (groups[t.group] = groups[t.group] || []).push(t) }
  const rows = Object.keys(groups).sort().map((g) => frame('Group_' + g, {
    gap: M.gapTight,
    children: [
      txt('GroupLabel_' + g, g.toUpperCase(), 'Caption', 'Color/Text/Muted'),
      frame('Row_' + g, {
        row: true, gap: M.gap,
        children: groups[g].map((t, i) => frame('Swatch_' + g + '_' + i, {
          gap: 4,
          children: [
            rect('Tile_' + g + '_' + i, { w: 100, h: 56, radius: M.radiusSm, fill: t.figma, stroke: 'Color/Border/Default', strokeW: 1 }),
            txt('Label_' + g + '_' + i, t.figma.split('/').slice(1).join(' / '), 'Caption', 'Color/Text/Secondary', { maxW: 100 }),
          ],
        })),
      }),
    ],
  }))
  return frame('ColorSwatches', { gap: M.gapWide, children: rows })
}

/**
 * @param {ReadonlyArray<{name:string, size:number, line:number}>} textStyles
 * @returns {any} NodeSpec
 */
function buildTypeRampSpec(textStyles) {
  return frame('TypeRamp', {
    gap: M.gap,
    children: textStyles.map((t, i) => txt('Specimen_' + i, t.name + ' — ' + t.size + '/' + t.line + 'px', t.name, 'Color/Text/Primary')),
  })
}

/**
 * @param {string} role @param {ReadonlyArray<{figma:string, value:number}>} tokens @param {'space'|'radius'} kind
 * @returns {any} NodeSpec
 */
function buildScaleSpec(role, tokens, kind) {
  return frame(role, {
    row: true, gap: M.gapWide,
    children: tokens.map((t, i) => frame(role + '_' + i, {
      gap: 4, center: true,
      children: [
        kind === 'radius'
          ? rect(role + '_Box_' + i, { w: 64, h: 64, radius: t.value, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1 })
          : rect(role + '_Box_' + i, { w: Math.max(t.value, 4), h: 24, radius: 2, fill: 'Color/Brand/Primary' }),
        txt(role + '_Label_' + i, t.figma + ' · ' + t.value + 'px', 'Caption', 'Color/Text/Muted'),
      ],
    })),
  })
}

/**
 * @param {ReadonlyArray<{name:string}>} shadowTokens @param {ReadonlyArray<{name:string}>} glassTokens
 * @returns {any} NodeSpec — tiles carry `effectStyle` so the renderer binds the REAL effect style.
 */
function buildElevationSpec(shadowTokens, glassTokens) {
  return frame('Elevation', {
    row: true, gap: M.gapWide,
    children: [
      ...shadowTokens.map((s, i) => frame('E_' + i, { w: 130, h: 84, radius: M.radiusMd, fill: 'Color/Surface/Primary', center: true, effectStyle: s.name, children: [txt('ELabel_' + i, s.name, 'Caption', 'Color/Text/Secondary')] })),
      ...glassTokens.map((g, i) => frame('Glass_' + i, { w: 160, h: 84, radius: M.radiusMd, fill: 'Color/Surface/Glass', stroke: 'Color/Surface/Glass (border)', strokeW: 1, center: true, effectStyle: g.name, children: [txt('GlassLabel_' + i, g.name, 'Caption', 'Color/Text/Secondary')] })),
    ],
  })
}

module.exports = { buildColorSwatchesSpec, buildTypeRampSpec, buildScaleSpec, buildElevationSpec }

  };
  __modules["validate"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * PURE fail-closed validator for every string that will ever reach
 * `TextNode.characters` or `instance.setProperties(...)` when building the
 * Screens page. Mirrors the proven pattern from the Phase 87 design-system
 * plugin (`validate.js`, added after that plugin's real run-ms7vkx9n-1
 * incident where an undefined heading crashed a partially-built run).
 *
 * The executor calls this BEFORE generating a runId or invoking any Figma
 * mutation API; Dry Run surfaces the same result, so an invalid string is
 * caught with full context (screen key, breakpoint, locale, text role)
 * instead of throwing mid-build and leaving partial, unmanaged nodes.
 */

/**
 * @param {unknown} v
 * @returns {string|null} problem description, or null when valid
 */
function textProblem(v) {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (typeof v !== 'string') return 'non-string (' + typeof v + ')'
  if (v.length === 0) return 'empty string'
  if (v.trim().length === 0) return 'whitespace-only string'
  return null
}

/**
 * Validate every text value of every screen in the spec.
 * @param {{ screens: any[] }} spec
 * @returns {{ ok: boolean, issues: {screenKey:string, screenType:string, locale:string, breakpoint:string, role:string, problem:string, value:unknown}[] }}
 */
function validateScreenText(spec) {
  /** @type {any[]} */
  const issues = []

  for (const scr of spec.screens || []) {
    /** @param {any} item */
    const walk = (item) => {
      if (item.row) { item.row.forEach(walk); return }
      if ('heading' in item) {
        const p = textProblem(item.heading)
        if (p) {
          issues.push({
            screenKey: scr.key, screenType: scr.screenType, locale: scr.locale,
            breakpoint: scr.breakpoint, role: 'Heading(' + (item.style || 'Heading/L') + ')',
            problem: p, value: item.heading,
          })
        }
        return
      }
      for (const propName of Object.keys(item.props || {})) {
        const v = item.props[propName]
        const p = textProblem(v)
        if (p) {
          issues.push({
            screenKey: scr.key, screenType: scr.screenType, locale: scr.locale,
            breakpoint: scr.breakpoint, role: item.family + '.' + propName,
            problem: p, value: v,
          })
        }
      }
    }
    for (const item of scr.items || []) walk(item)
  }

  return { ok: issues.length === 0, issues }
}

/**
 * Structured error for a defensive characters assignment.
 * @param {unknown} value @param {{screenKey?:string, role?:string, locale?:string}} ctx
 */
function charactersError(value, ctx) {
  const c = ctx || {}
  return new Error(
    'set_characters blocked: value is ' + (textProblem(value) || 'invalid') +
    ' [screen=' + (c.screenKey || '-') + ' role=' + (c.role || '-') + ' locale=' + (c.locale || '-') + ']'
  )
}

module.exports = { textProblem, charactersError, validateScreenText }

  };
  __modules["pages"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * PURE page-planning logic enforcing the Figma STARTER-plan hard ceiling:
 * `figma.createPage()` throws "The Starter plan only comes with 3 pages" on
 * the 4th page — this is a FILE-LEVEL cap, not a per-plugin cap. The target
 * file already exists with its own default page(s), so this plugin must never
 * blindly call createPage() 3 times; it must find-or-create/rename to land on
 * exactly the 3 named pages (`01 Foundations` / `02 Components` /
 * `03 Screens`) without ever exceeding the ceiling.
 *
 * Strategy (idempotent, deterministic, pure):
 *   1. Any existing page whose name already matches a desired name is REUSED.
 *   2. Any remaining desired name claims one existing "spare" page (a page not
 *      already claimed and not itself one of the desired names) by RENAMING
 *      it, in file order — this is how the file's original default page
 *      (typically "Page 1") becomes "01 Foundations" without a net page-count
 *      increase.
 *   3. Only once spares are exhausted does a remaining desired name CREATE a
 *      new page — and only if doing so keeps the file at or under the cap.
 *   4. If honouring every desired name would exceed the cap, the WHOLE plan
 *      is reported blocked (fail closed) rather than silently dropping a page
 *      or throwing mid-run.
 */

const MAX_PAGES = 3

/**
 * @typedef {{ name: string, action: 'reuse'|'rename'|'create', fromName?: string, idx?: number }} PageAction
 *   `idx` (reuse/rename only) is the ORIGINAL index into existingPageNames —
 *   the executor must key off this, not `fromName`, because Figma allows
 *   duplicate page names and a name-only lookup could grab the wrong page.
 */

/**
 * @param {string[]} existingPageNames current figma.root.children names, in file order
 * @param {string[]} desiredNames the pages this plugin manages, in apply order
 * @returns {{ ok: boolean, actions: PageAction[], blocked?: string, finalPageCount: number }}
 */
function planPages(existingPageNames, desiredNames) {
  const existing = [...(existingPageNames || [])]
  const desired = [...(desiredNames || [])]
  const claimedExistingIdx = new Set()
  /** @type {PageAction[]} */
  const actions = []

  // Pass 1 — exact-name reuse.
  for (const name of desired) {
    const idx = existing.findIndex((n, i) => n === name && !claimedExistingIdx.has(i))
    if (idx !== -1) { claimedExistingIdx.add(idx); actions.push({ name, action: 'reuse', idx }) }
  }

  // Pass 2 — remaining desired names claim spare pages (rename) or create.
  let projectedTotal = existing.length
  for (const name of desired) {
    if (actions.some((a) => a.name === name)) continue // already reused
    const spareIdx = existing.findIndex((n, i) => !claimedExistingIdx.has(i))
    if (spareIdx !== -1) {
      claimedExistingIdx.add(spareIdx)
      actions.push({ name, action: 'rename', fromName: existing[spareIdx], idx: spareIdx })
      continue
    }
    if (projectedTotal + 1 > MAX_PAGES) {
      return { ok: false, actions, blocked: 'Starter plan allows at most ' + MAX_PAGES + ' pages total; creating "' + name + '" would exceed the cap (existing=' + existing.length + ').', finalPageCount: projectedTotal }
    }
    projectedTotal += 1
    actions.push({ name, action: 'create' })
  }

  // Final page count = untouched existing pages (preserved as-is) + the managed desired pages.
  const untouchedExisting = existing.length - claimedExistingIdx.size
  const total = untouchedExisting + desired.length
  if (total > MAX_PAGES) {
    return { ok: false, actions, blocked: 'Resulting page count ' + total + ' would exceed the Starter cap of ' + MAX_PAGES + '.', finalPageCount: total }
  }
  return { ok: true, actions, finalPageCount: total }
}

module.exports = { MAX_PAGES, planPages }

  };
  __modules["starter"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Figma STARTER (free) plan capability gating for the Phase 102 plugin.
 * Same sourcing discipline as the Phase 87 design-system plugin's starter.js
 * (verified against official Figma documentation) — nothing here is faked.
 */

const DEFERRED_CODE = 'DEFERRED_REQUIRES_FIGMA_PROFESSIONAL'

/** Native LOCAL capabilities this plugin uses that ARE supported on Starter. */
const STARTER_SUPPORTED = [
  { capability: 'Local variables & variable collections', note: 'createVariableCollection / createVariable — available on any plan.' },
  { capability: 'Local Paint / Text / Effect styles', note: 'createPaintStyle / createTextStyle / createEffectStyle — creatable on free Starter.' },
  { capability: 'Components, Component Sets & Variants', note: 'Components can be created on the free Starter plan.' },
  { capability: 'Component Properties (BOOLEAN / TEXT / INSTANCE_SWAP / VARIANT)', note: 'Core component feature; no plan gate on creation.' },
  { capability: 'Auto Layout', note: 'Ungated core editing feature.' },
  { capability: 'Sections', note: 'figma.createSection() — ungated.' },
  { capability: 'Variable → Paint style binding', note: 'setBoundVariableForPaint — local binding, no plan gate.' },
  { capability: 'Single default variable mode ("Value") per collection', note: 'Every collection always has its one default mode on Starter.' },
]

/** Plan-gated capabilities deliberately NOT attempted on Starter. */
const STARTER_DEFERRED = [
  {
    capability: 'Multiple variable modes (light/dark, per-breakpoint or per-locale modes)',
    code: DEFERRED_CODE,
    reason: 'Starter is limited to one mode per collection; collection.addMode() throws "Limited to 1 modes only". This plugin uses SEPARATE COLLECTIONS instead of modes wherever a variant axis was needed.',
  },
  {
    capability: 'A 4th page (or more)',
    code: DEFERRED_CODE,
    reason: 'figma.createPage() throws "The Starter plan only comes with 3 pages" on the 4th. The plugin manages exactly 3 pages (01 Foundations / 02 Components / 03 Screens) via pages.js — reusing/renaming existing pages rather than creating extras.',
  },
  {
    capability: 'Publishing variables/styles/components as a shared Team Library',
    code: DEFERRED_CODE,
    reason: 'Libraries are only available on paid plans; Starter has "No team libraries".',
  },
]

/**
 * Not a plan-tier gate but an orthogonal hard requirement: the user running
 * the plugin must have EDIT access to the file.
 */
const FILE_EDIT_REQUIREMENT = {
  requirement: 'The Figma Desktop session must be signed in as a user with "can edit" access to the file. A "View"/viewer seat cannot run a write plugin, independent of plan tier.',
}

/** The mode strategy the plugin uses on Starter: a single default mode per collection. */
function modeStrategy() {
  return { modeName: 'Value', multiMode: false, deferred: DEFERRED_CODE }
}

module.exports = { DEFERRED_CODE, STARTER_SUPPORTED, STARTER_DEFERRED, FILE_EDIT_REQUIREMENT, modeStrategy }

  };
  __modules["spec"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * buildSpec() — the deterministic, pure declaration of EVERY native asset the
 * plugin will create, in canonical apply order (foundation before components;
 * collections before their variables; variables before the paint styles that
 * bind them; components before the screens that instance them). No `figma`
 * here — this is the single source the Dry Run reports and the Apply
 * executor consumes, and the ONLY thing the pure test suite has to import.
 */

const { KIND, REVISIONS, PAGES, SECTIONS } = require('constants')
const { COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SHADOW_TOKENS, GLASS_TOKENS, TEXT_STYLES } = require('tokens')
const { FAMILIES, variantCombos } = require('components')
const { buildScreens } = require('screens')
const { buildColorSwatchesSpec, buildTypeRampSpec, buildScaleSpec, buildElevationSpec } = require('docs')
const { modeStrategy } = require('starter')
const { slug, hashAsset } = require('util')

const MODE = modeStrategy().modeName // 'Value'

const COLLECTIONS = require('constants').COLLECTIONS

/** Variable scopes per collection group. */
const SCOPES = Object.freeze({
  color: ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR'],
  spacing: ['GAP', 'WIDTH_HEIGHT'],
  radius: ['CORNER_RADIUS'],
  sizing: ['WIDTH_HEIGHT', 'STROKE_FLOAT'],
})

/**
 * @param {string} figmaName @param {string} usage @param {string} cssVar @param {string} [extra]
 * @returns {string}
 */
function variableDescription(figmaName, usage, cssVar, extra) {
  const bits = [usage, 'css: ' + cssVar]
  if (extra) bits.push(extra)
  bits.push('Managed by Hermes Phase 102 Media Hub Builder — mirrors src/app/globals.css')
  return bits.join(' · ')
}

/**
 * @param {{component:number, textStyle:number, screen?:number}} [revisions]
 */
function buildSpec(revisions) {
  const rev = revisions || REVISIONS
  /** @type {any[]} */
  const collections = []
  /** @type {any[]} */
  const variables = []
  /** @type {any[]} */
  const paintStyles = []

  // ── Collections ────────────────────────────────────────────────────────
  const colColors = { key: 'collection:' + slug(COLLECTIONS.COLORS), kind: KIND.COLLECTION, name: COLLECTIONS.COLORS, resolvedType: 'COLOR', modeName: MODE }
  const colSpacing = { key: 'collection:' + slug(COLLECTIONS.SPACING), kind: KIND.COLLECTION, name: COLLECTIONS.SPACING, resolvedType: 'FLOAT', modeName: MODE }
  const colRadius = { key: 'collection:' + slug(COLLECTIONS.RADIUS), kind: KIND.COLLECTION, name: COLLECTIONS.RADIUS, resolvedType: 'FLOAT', modeName: MODE }
  const colSizing = { key: 'collection:' + slug(COLLECTIONS.SIZING), kind: KIND.COLLECTION, name: COLLECTIONS.SIZING, resolvedType: 'FLOAT', modeName: MODE }
  collections.push(colColors, colSpacing, colRadius, colSizing)

  // ── Color variables + a bound paint style per color ───────────────────
  for (const t of COLOR_TOKENS) {
    const vkey = 'variable:' + slug(COLLECTIONS.COLORS) + ':' + t.figma
    variables.push({
      key: vkey, kind: KIND.VARIABLE, name: t.figma, collectionKey: colColors.key,
      resolvedType: 'COLOR', value: t.value, scopes: SCOPES.color, cssVar: t.cssVar, group: t.group,
      description: variableDescription(t.figma, t.usage, t.cssVar),
    })
    paintStyles.push({
      key: 'paintStyle:' + t.figma, kind: KIND.PAINT_STYLE, name: t.figma, variableKey: vkey, value: t.value,
      description: variableDescription(t.figma, t.usage, t.cssVar),
    })
  }

  // ── Float variables (spacing / radius / sizing) ────────────────────────
  /** @param {any} col @param {readonly any[]} toks @param {string[]} scopes @param {string} prefix */
  const addFloats = (col, toks, scopes, prefix) => {
    for (const t of toks) {
      variables.push({
        key: 'variable:' + slug(col.name) + ':' + t.figma, kind: KIND.VARIABLE,
        name: prefix + '/' + t.figma, collectionKey: col.key, resolvedType: 'FLOAT',
        floatValue: t.value, scopes, cssVar: t.cssVar ?? t.cssRef ?? null, group: prefix.toLowerCase(),
        description: variableDescription(prefix + '/' + t.figma, t.usage, t.cssVar ?? (t.cssRef || 'derived (see tokens.js SIZE_TOKENS)')),
      })
    }
  }
  addFloats(colSpacing, SPACE_TOKENS, SCOPES.spacing, 'Space')
  addFloats(colRadius, RADIUS_TOKENS, SCOPES.radius, 'Radius')
  addFloats(colSizing, SIZE_TOKENS, SCOPES.sizing, 'Size')

  // ── Text styles ─────────────────────────────────────────────────────────
  const textStyles = TEXT_STYLES.map((t) => ({
    key: 'textStyle:' + t.name, kind: KIND.TEXT_STYLE, name: t.name,
    font: t.font, weight: t.weight, size: t.size, line: t.line, tracking: t.tracking,
    rev: rev.textStyle,
    description: t.usage + ' · Managed by Hermes Phase 102 Media Hub Builder',
  }))

  // ── Effect styles (opaque elevation E1-E4 + the glass-elevation pair) ──
  const effectStyles = [
    ...SHADOW_TOKENS.map((s) => ({
      key: 'effectStyle:' + s.name, kind: KIND.EFFECT_STYLE, name: s.name, glass: false,
      offset: s.offset, radius: s.radius, spread: s.spread, color: s.color,
      description: s.usage + ' · css: ' + s.cssVar + ' · Managed by Hermes Phase 102 Media Hub Builder',
    })),
    ...GLASS_TOKENS.map((g) => ({
      key: 'effectStyle:' + g.name, kind: KIND.EFFECT_STYLE, name: g.name, glass: true,
      blurRadius: g.blurRadius, offset: g.offset, radius: g.radius, spread: g.spread, color: g.color,
      description: g.usage + ' · Managed by Hermes Phase 102 Media Hub Builder',
    })),
  ]

  // ── Foundations-page documentation specimens (visual review, not components) ──
  const docs = [
    { key: 'doc:color-swatches', kind: KIND.DOC, name: 'Colour tokens (' + COLOR_TOKENS.length + ')', spec: buildColorSwatchesSpec(COLOR_TOKENS) },
    { key: 'doc:type-ramp', kind: KIND.DOC, name: 'Type ramp', spec: buildTypeRampSpec(TEXT_STYLES) },
    { key: 'doc:spacing-scale', kind: KIND.DOC, name: 'Spacing scale', spec: buildScaleSpec('SpacingScale', SPACE_TOKENS, 'space') },
    { key: 'doc:radius-scale', kind: KIND.DOC, name: 'Radius scale', spec: buildScaleSpec('RadiusScale', RADIUS_TOKENS, 'radius') },
    { key: 'doc:elevation', kind: KIND.DOC, name: 'Elevation + glass', spec: buildElevationSpec(SHADOW_TOKENS, GLASS_TOKENS) },
  ]

  // ── Component families (one component SET each) ────────────────────────
  const families = FAMILIES.map((f) => ({
    key: 'componentSet:' + f.key, kind: KIND.COMPONENT_SET, name: f.name,
    category: f.category, maps: f.maps,
    preset: f.preset, presetOpts: f.presetOpts || {},
    axes: f.axes, dirAxis: !!f.dirAxis,
    valueOverrides: f.valueOverrides || {},
    text: f.text || [], bools: f.bools || [], swaps: f.swaps || [],
    elevation: f.elevation || null, hideLabel: !!f.hideLabel, shapeAxis: !!f.shapeAxis,
    a11y: f.a11y,
    description: f.description + ' Labels localize FA·EN·DE at runtime (next-intl in the eventual app); the Screens page carries per-locale reference frames.',
    variantCount: variantCombos(f).length,
    rev: rev.component,
  }))

  // ── Screens (third managed section) ─────────────────────────────────────
  const screens = buildScreens().map((s) => ({
    ...s, kind: KIND.SCREEN, rev: rev.screen ?? 1,
  }))

  const sectionFoundations = { key: 'section:foundations', kind: KIND.SECTION, name: SECTIONS.FOUNDATIONS, page: PAGES.FOUNDATIONS }
  const sectionComponents = { key: 'section:components', kind: KIND.SECTION, name: SECTIONS.COMPONENTS, page: PAGES.COMPONENTS }
  const sectionScreens = { key: 'section:screens', kind: KIND.SECTION, name: SECTIONS.SCREENS, page: PAGES.SCREENS }

  // ── Flatten in canonical apply order + attach content hashes ────────────
  /** @type {any[]} */
  const assets = [
    sectionFoundations, sectionComponents, sectionScreens,
    ...collections, ...variables, ...paintStyles, ...textStyles, ...effectStyles, ...docs,
    ...families, ...screens,
  ]
  for (const a of assets) a.hash = hashAsset(hashPayload(a))

  const componentCount = families.reduce((n, f) => n + f.variantCount, 0)
  const counts = {
    collections: collections.length,
    variables: variables.length,
    paintStyles: paintStyles.length,
    textStyles: textStyles.length,
    effectStyles: effectStyles.length,
    docs: docs.length,
    families: families.length,
    components: componentCount,
    screens: screens.length,
    sections: 3,
    total: assets.length,
  }

  return {
    collections, variables, paintStyles, textStyles, effectStyles, docs, families, screens,
    sectionFoundations, sectionComponents, sectionScreens, assets, counts,
  }
}

/**
 * The subset of an asset that defines its VISUAL/STRUCTURAL identity for
 * hashing (excludes the derived `hash`/`key` fields — and for NodeSpec-bearing
 * doc entries, a function-free deep spec is already plain data, so it hashes
 * fine as-is).
 * @param {any} a
 * @returns {any}
 */
function hashPayload(a) {
  const { hash, key, ...rest } = a
  return rest
}

module.exports = { buildSpec, SCOPES, MODE }

  };
  __modules["plan"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * computePlan() — the deterministic, idempotent planner. Given the spec and
 * the index of assets a previous run recorded (from a LIVE scan of
 * shared-plugin-data markers), it decides for each asset: CREATE (new),
 * UPDATE (spec hash changed) or SKIP (unchanged), and flags PRUNE candidates
 * (recorded before but no longer in the spec). Pure — no `figma`.
 *
 * This is exactly what Dry Run reports; Apply then executes the same ops
 * against the file, one STAGE at a time (see figma-exec.js `run({stage})`),
 * which is what makes the build incremental and resumable: rerunning a stage
 * that partially completed only touches assets whose hash actually changed.
 *
 * @typedef {Object} IndexEntry
 * @property {string} id
 * @property {string} hash
 * @property {string} [kind]
 */

/**
 * @param {{ assets: any[], counts: Record<string, number> }} spec
 * @param {Record<string, IndexEntry>} [existingIndex] assetKey -> {id, hash, kind}
 */
function computePlan(spec, existingIndex) {
  const index = existingIndex || {}
  /** @type {any[]} */
  const ops = []
  const specKeys = new Set()

  for (const a of spec.assets) {
    specKeys.add(a.key)
    const prior = index[a.key]
    let action
    let reason
    if (!prior || !prior.id) {
      action = 'create'
      reason = 'not present in file'
    } else if (prior.hash !== a.hash) {
      action = 'update'
      reason = 'spec changed (' + prior.hash + ' → ' + a.hash + ')'
    } else {
      action = 'skip'
      reason = 'unchanged'
    }
    ops.push({ key: a.key, kind: a.kind, name: a.name, category: a.category || null, action, reason, hash: a.hash })
  }

  /** @type {any[]} */
  const prune = []
  for (const k of Object.keys(index)) {
    const entry = index[k]
    if (!specKeys.has(k) && entry && entry.id) {
      prune.push({ key: k, kind: entry.kind || 'unknown', id: entry.id, action: 'prune', reason: 'no longer in spec' })
    }
  }

  /** @type {Record<string, number>} */
  const summary = { create: 0, update: 0, skip: 0, prune: prune.length, total: ops.length }
  for (const o of ops) summary[o.action]++

  /** @type {Record<string, {create:number,update:number,skip:number}>} */
  const byKind = {}
  for (const o of ops) {
    if (!byKind[o.kind]) byKind[o.kind] = { create: 0, update: 0, skip: 0 }
    byKind[o.kind][o.action]++
  }

  return { ops, prune, summary, byKind, counts: spec.counts }
}

/**
 * Render a compact human-readable plan summary (used by the UI and the Node
 * dry-run harness). Pure.
 * @param {ReturnType<typeof computePlan>} plan
 * @returns {string}
 */
function renderPlanText(plan) {
  const s = plan.summary
  const lines = []
  lines.push('PLAN: ' + s.create + ' create · ' + s.update + ' update · ' + s.skip + ' skip · ' + s.prune + ' prune (of ' + s.total + ' assets)')
  const kinds = Object.keys(plan.byKind).sort()
  for (const k of kinds) {
    const b = plan.byKind[k]
    lines.push('  - ' + k + ': +' + b.create + ' ~' + b.update + ' =' + b.skip)
  }
  lines.push('  native components to materialise: ' + plan.counts.components + ' across ' + plan.counts.families + ' component sets')
  lines.push('  screens to materialise: ' + plan.counts.screens)
  return lines.join('\n')
}

/**
 * Pure model of rollback scoping: given an index of managed assets carrying
 * the run that FIRST created each one, return the assetKeys a rollback would
 * remove. `runId` null/undefined = "all managed".
 * @param {Record<string, {runId?: string}>} index
 * @param {string|null} [runId]
 * @returns {string[]} assetKeys in scope, sorted
 */
function runScope(index, runId) {
  const keys = []
  for (const k of Object.keys(index || {})) {
    const e = index[k]
    if (!e) continue
    if (!runId || e.runId === runId) keys.push(k)
  }
  return keys.sort()
}

/**
 * Detect ownership ambiguity: two live managed objects claiming the SAME
 * assetKey. Apply must FAIL CLOSED on any ambiguity instead of guessing which
 * node to update. Pure: takes [{assetKey, id, kind}] observations in scan order.
 * @param {{assetKey:string, id:string, kind?:string}[]} observations
 * @returns {{assetKey:string, ids:string[]}[]} ambiguities (empty = safe)
 */
function detectAmbiguity(observations) {
  /** @type {Record<string, Set<string>>} */
  const seen = {}
  for (const o of observations || []) {
    if (!o || !o.assetKey) continue
    if (!seen[o.assetKey]) seen[o.assetKey] = new Set()
    seen[o.assetKey].add(o.id)
  }
  const out = []
  for (const k of Object.keys(seen)) if (seen[k].size > 1) out.push({ assetKey: k, ids: [...seen[k]].sort() })
  return out.sort((a, b) => (a.assetKey < b.assetKey ? -1 : 1))
}

/**
 * Filter a plan's ops to just the kinds relevant to one build STAGE, so Apply
 * can run incrementally: 'foundations' (collections/variables/paint/text/
 * effect styles + doc specimens), 'components' (component sets), 'screens'
 * (screen frames). 'all' returns every op, in spec order.
 * @param {'foundations'|'components'|'screens'|'all'} stage
 */
function stageKinds(stage) {
  if (stage === 'foundations') return new Set(['section', 'collection', 'variable', 'paintStyle', 'textStyle', 'effectStyle', 'doc'])
  if (stage === 'components') return new Set(['section', 'componentSet'])
  if (stage === 'screens') return new Set(['section', 'screen'])
  return null // 'all'
}

module.exports = { computePlan, renderPlanText, runScope, detectAmbiguity, stageKinds }

  };
  __modules["figma-exec"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Figma executor — the ONLY module that touches the `figma` global. Builds
 * the 3-page Phase 102 file (01 Foundations / 02 Components / 03 Screens) in
 * INCREMENTAL, RESUMABLE stages, idempotently (create/update/skip keyed off
 * shared-plugin-data markers — a rerun never duplicates).
 *
 * Safety invariants:
 *  - Every created asset is tagged in the `hermesP102` shared-plugin-data
 *    namespace (assetKey + kind + content hash + FIRST-creation runId).
 *  - FAIL CLOSED before any mutation on: (a) invalid/empty text anywhere in
 *    the Screens spec, (b) a page plan that would exceed the Starter 3-page
 *    cap, (c) ambiguous ownership (duplicate assetKey markers).
 *  - Fonts NEVER block Apply — resolveFontPlan (tokens.js) always resolves to
 *    something loadable and reports substitutions; graceful fallback per the
 *    task brief, not a hard gate.
 *  - RTL mirroring respects rtl.js PROTECTED_LTR_ROLES: the player timeline,
 *    any progress/watch meter and timestamp labels are never reordered or
 *    right-aligned, even while everything around them mirrors.
 *  - Interrupted Apply recovery = RERUN the same stage (or "All"): per-asset
 *    hashes converge; nothing is duplicated.
 */

const C = require('constants')
const { buildSpec } = require('spec')
const { computePlan, detectAmbiguity, stageKinds } = require('plan')
const { planPages } = require('pages')
const { parseColor, resolveFontPlan, FONTS } = require('tokens')
const { PRESETS } = require('presets')
const { variantCombos } = require('components')
const { validateScreenText, textProblem, charactersError } = require('validate')
const { isProtectedRole } = require('rtl')

const NS = C.NAMESPACE
const K = C.KEYS

// ── shared-plugin-data tagging ─────────────────────────────────────────────
/** @param {any} obj @param {{assetKey:string, kind:string, hash:string, runId:string}} t */
function tag(obj, t) {
  obj.setSharedPluginData(NS, K.MANAGED, '1')
  obj.setSharedPluginData(NS, K.ASSET_KEY, t.assetKey)
  obj.setSharedPluginData(NS, K.ASSET_KIND, t.kind)
  obj.setSharedPluginData(NS, K.CONTENT_HASH, t.hash)
  const priorRun = obj.getSharedPluginData(NS, K.RUN_ID)
  obj.setSharedPluginData(NS, K.RUN_ID, priorRun && priorRun.length ? priorRun : t.runId)
  obj.setSharedPluginData(NS, K.PLUGIN_VERSION, C.PLUGIN_VERSION)
}
/** @param {any} obj */
function isManaged(obj) {
  try { return obj.getSharedPluginData(NS, K.MANAGED) === '1' } catch (_e) { return false }
}
/** @param {any} obj */
function readTag(obj) {
  return {
    assetKey: obj.getSharedPluginData(NS, K.ASSET_KEY),
    kind: obj.getSharedPluginData(NS, K.ASSET_KIND),
    hash: obj.getSharedPluginData(NS, K.CONTENT_HASH),
    runId: obj.getSharedPluginData(NS, K.RUN_ID),
  }
}

let _runSeq = 0
function newRunId() {
  _runSeq += 1
  return 'run-' + Date.now().toString(36) + '-' + _runSeq
}

// ── pages (Starter 3-page cap) ──────────────────────────────────────────────
/** Pure pre-check, safe to call before any mutation. */
function checkPagePlan() {
  const existingNames = figma.root.children.map((p) => p.name)
  return planPages(existingNames, [...C.PAGE_NAMES])
}
/** Executes a (previously validated) page plan. Mutates: rename/create pages. */
function applyPagePlan(plan) {
  /** @type {Record<string, any>} */
  const pagesByName = {}
  for (const act of plan.actions) {
    if (act.action === 'reuse') {
      pagesByName[act.name] = figma.root.children[/** @type {number} */ (act.idx)]
    } else if (act.action === 'rename') {
      const pg = figma.root.children[/** @type {number} */ (act.idx)]
      pg.name = act.name
      pagesByName[act.name] = pg
    } else if (act.action === 'create') {
      const pg = figma.createPage()
      pg.name = act.name
      pagesByName[act.name] = pg
    }
  }
  return pagesByName
}

// ── LIVE index (source of truth) across the 3 managed pages ────────────────
/** @param {Record<string, any>} pagesByName */
async function buildLiveIndex(pagesByName) {
  /** @type {Record<string, {id:string, hash:string, kind:string, runId:string}>} */
  const index = {}
  const paint = {}
  const text = {}
  const effect = {}
  const variables = {}
  const collections = {}
  const componentSets = {}
  const docs = {}
  const screens = {}
  /** @type {{assetKey:string, id:string, kind:string}[]} */
  const observations = []
  /** @type {Record<string, any>} */
  const sections = {}

  /** @param {any} obj @param {Record<string, any>|null} bucket */
  const note = (obj, bucket) => {
    const t = readTag(obj)
    if (t.kind === C.KIND.MANIFEST || !t.assetKey) return
    observations.push({ assetKey: t.assetKey, id: obj.id, kind: t.kind })
    index[t.assetKey] = { id: obj.id, hash: t.hash, kind: t.kind, runId: t.runId }
    if (bucket) bucket[t.assetKey] = obj
  }

  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) if (isManaged(c)) note(c, collections)
  for (const v of await figma.variables.getLocalVariablesAsync()) if (isManaged(v)) note(v, variables)
  for (const ps of await figma.getLocalPaintStylesAsync()) if (isManaged(ps)) note(ps, paint)
  for (const ts of await figma.getLocalTextStylesAsync()) if (isManaged(ts)) note(ts, text)
  for (const es of await figma.getLocalEffectStylesAsync()) if (isManaged(es)) note(es, effect)

  /** @param {any} page @param {Record<string, any>} contentBucket */
  const scanPage = (page, contentBucket) => {
    if (!page) return
    for (const child of page.children) {
      if (isManaged(child)) {
        const t = readTag(child)
        if (t.kind === C.KIND.SECTION) {
          observations.push({ assetKey: t.assetKey, id: child.id, kind: t.kind })
          index[t.assetKey] = { id: child.id, hash: t.hash, kind: t.kind, runId: t.runId }
          sections[t.assetKey] = child
          for (const sub of child.children || []) {
            if (!isManaged(sub)) continue
            note(sub, contentBucket)
          }
        } else {
          note(child, contentBucket)
        }
      }
    }
  }
  scanPage(pagesByName[C.PAGES.FOUNDATIONS], docs)
  scanPage(pagesByName[C.PAGES.COMPONENTS], componentSets)
  scanPage(pagesByName[C.PAGES.SCREENS], screens)

  return { index, observations, styles: { paint, text, effect }, variables, collections, docs, componentSets, screens, sections }
}

// ── font resolution (never blocks — graceful fallback) ─────────────────────
/** @param {ReadonlyArray<{font:string, weight:string}>} textStyleSpecs @param {{display:{family:string,fallback:string}, body:{family:string,fallback:string}, mono:{family:string,fallback:string}}} FONTS */
async function resolveFonts(textStyleSpecs, FONTS) {
  const available = await figma.listAvailableFontsAsync()
  const has = new Set(available.map((f) => f.fontName.family + ' ' + f.fontName.style))
  const substitutions = []
  /** @type {Record<string, {family:string, style:string}>} */
  const cache = {}
  for (const t of textStyleSpecs) {
    const desired = FONTS[t.font]
    const key = t.font + '|' + t.weight
    if (cache[key]) continue
    const plan = resolveFontPlan(desired.family, t.weight, has)
    try { await figma.loadFontAsync({ family: plan.family, style: plan.style }) } catch (_e) { /* Inter is always preloaded */ }
    cache[key] = { family: plan.family, style: plan.style }
    if (plan.substituted) substitutions.push(plan.note)
  }
  return { resolve: (role, weight) => cache[role + '|' + weight] || cache[role + '|Regular'] || { family: 'Inter', style: 'Regular' }, substitutions }
}

// ── paint helper ───────────────────────────────────────────────────────────
/** @param {string} value */
function solidPaint(value) {
  const c = parseColor(value)
  const p = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b } }
  if (c.a < 1) /** @type {any} */ (p).opacity = c.a
  return p
}

// ── foundation upserts ──────────────────────────────────────────────────────
function upsertCollection(specEntry, live, runId) {
  let col = live.collections[specEntry.key]
  if (!col) { col = figma.variables.createVariableCollection(specEntry.name); live.collections[specEntry.key] = col }
  else if (col.name !== specEntry.name) col.name = specEntry.name
  try { if (col.modes[0] && col.modes[0].name !== specEntry.modeName) col.renameMode(col.defaultModeId, specEntry.modeName) } catch (_e) { /* best-effort */ }
  tag(col, { assetKey: specEntry.key, kind: C.KIND.COLLECTION, hash: specEntry.hash, runId })
  return col
}
function upsertVariable(v, live, runId) {
  const col = live.collections[v.collectionKey]
  if (!col) throw new Error('collection missing for ' + v.key)
  let variable = live.variables[v.key]
  if (!variable) { variable = figma.variables.createVariable(v.name, col, v.resolvedType); live.variables[v.key] = variable }
  else if (variable.name !== v.name) variable.name = v.name
  try { variable.scopes = v.scopes } catch (_e) { /* ignore */ }
  variable.description = v.description
  const modeId = col.defaultModeId
  if (v.resolvedType === 'COLOR') variable.setValueForMode(modeId, parseColor(v.value))
  else variable.setValueForMode(modeId, v.floatValue)
  tag(variable, { assetKey: v.key, kind: C.KIND.VARIABLE, hash: v.hash, runId })
  return variable
}
function upsertPaintStyle(p, live, runId) {
  let ps = live.styles.paint[p.key]
  if (!ps) { ps = figma.createPaintStyle(); live.styles.paint[p.key] = ps }
  ps.name = p.name
  ps.description = p.description
  let paint = /** @type {any} */ (solidPaint(p.value))
  const variable = live.variables[p.variableKey]
  if (variable) { try { paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable) } catch (_e) { /* raw */ } }
  ps.paints = [paint]
  tag(ps, { assetKey: p.key, kind: C.KIND.PAINT_STYLE, hash: p.hash, runId })
  return ps
}
function upsertTextStyle(t, live, fonts, runId) {
  let ts = live.styles.text[t.key]
  if (!ts) { ts = figma.createTextStyle(); live.styles.text[t.key] = ts }
  ts.name = t.name
  ts.description = t.description
  ts.fontName = fonts.resolve(t.font, t.weight)
  ts.fontSize = t.size
  ts.lineHeight = { unit: 'PIXELS', value: t.line }
  ts.letterSpacing = { unit: 'PIXELS', value: t.tracking }
  tag(ts, { assetKey: t.key, kind: C.KIND.TEXT_STYLE, hash: t.hash, runId })
  return ts
}
function upsertEffectStyle(e, live, runId) {
  let es = live.styles.effect[e.key]
  if (!es) { es = figma.createEffectStyle(); live.styles.effect[e.key] = es }
  es.name = e.name
  es.description = e.description
  /** @type {any[]} */
  const effects = []
  if (e.glass) effects.push({ type: 'BACKGROUND_BLUR', radius: e.blurRadius, visible: true })
  effects.push({ type: 'DROP_SHADOW', color: { r: e.color[0], g: e.color[1], b: e.color[2], a: e.color[3] }, offset: { x: e.offset.x, y: e.offset.y }, radius: e.radius, spread: e.spread, visible: true, blendMode: 'NORMAL' })
  es.effects = effects
  tag(es, { assetKey: e.key, kind: C.KIND.EFFECT_STYLE, hash: e.hash, runId })
  return es
}

// ── sections (one per managed page) ─────────────────────────────────────────
/** @param {any} sectionSpec @param {any} live @param {any} page @param {string} runId */
function ensureSection(sectionSpec, live, page, runId) {
  let section = live.sections[sectionSpec.key]
  if (!section) {
    const sec = /** @type {any} */ (figma.createSection())
    sec.x = 0
    sec.y = 0
    try { sec.resizeWithoutConstraints(3600, 6000) } catch (_e) { /* ignore */ }
    page.appendChild(sec)
    section = sec
    live.sections[sectionSpec.key] = sec
  } else if (section.parent !== page) {
    page.appendChild(section) // idempotent re-parent, e.g. after a page rename swap
  }
  section.name = sectionSpec.name
  tag(section, { assetKey: sectionSpec.key, kind: C.KIND.SECTION, hash: sectionSpec.hash, runId })
  return section
}

// ── blueprint renderer (shared by components AND doc specimens) ────────────
/**
 * Render a NodeSpec tree into Figma nodes. Returns { node, roles }.
 * @param {any} spec @param {any} ctx { fonts, paintByToken, textStyleByName, effectByName, iconDefault }
 */
async function renderNode(spec, ctx) {
  /** @type {Record<string, any>} */
  const roles = {}

  /** @param {any} s @param {any|null} parent */
  const build = async (s, parent) => {
    let node
    if (s.type === 'text') {
      node = figma.createText()
      node.fontName = ctx.fonts.resolve('body', 'Regular')
      setChars(node, s.text != null ? s.text : '', { role: s.role }, { allowEmpty: true })
    } else if (s.type === 'ellipse') {
      node = figma.createEllipse()
      node.resize(s.w || 10, s.h || 10)
    } else if (s.type === 'rect') {
      node = figma.createRectangle()
      node.resize(s.w || 10, s.h || 10)
      if (s.radius != null) node.cornerRadius = s.radius
      if (s.rotation) { try { node.rotation = s.rotation } catch (_e) { /* ignore */ } }
    } else if (s.type === 'iconSlot') {
      if (ctx.iconDefault) { try { node = ctx.iconDefault.createInstance() } catch (_e) { node = null } }
      if (!node) { node = figma.createEllipse(); node.resize(s.w || 16, s.h || 16) }
    } else {
      node = figma.createFrame()
      node.layoutMode = s.row ? 'HORIZONTAL' : 'VERTICAL'
      node.primaryAxisSizingMode = 'AUTO'
      node.counterAxisSizingMode = 'AUTO'
      node.itemSpacing = s.gap ?? 0
      node.paddingLeft = node.paddingRight = s.padX ?? 0
      node.paddingTop = node.paddingBottom = s.padY ?? 0
      if (s.center) node.counterAxisAlignItems = 'CENTER'
      if (s.radius != null) node.cornerRadius = s.radius
      node.fills = []
    }
    node.name = s.role
    if (parent) parent.appendChild(node)

    const styleFor = (tok) => (tok ? ctx.paintByToken[tok] : null)
    if (s.fill !== undefined && s.type !== 'iconSlot') {
      if (s.fill === null) node.fills = []
      else { const st = styleFor(s.fill); if (st) { try { await node.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } } }
    }
    if (s.stroke !== undefined && s.stroke !== null) {
      const st = styleFor(s.stroke)
      node.strokes = [solidPaint('#203743')]
      node.strokeWeight = s.strokeW ?? 1
      if (st) { try { await node.setStrokeStyleIdAsync(st.id) } catch (_e) { /* ignore */ } }
    }
    if (s.type === 'text') {
      const ramp = ctx.textStyleByName[s.textStyle]
      if (ramp) { try { await node.setTextStyleIdAsync(ramp.id) } catch (_e) { /* ignore */ } }
      const tf = styleFor(s.textFill)
      if (tf) { try { await node.setFillStyleIdAsync(tf.id) } catch (_e) { /* ignore */ } }
      if (s.maxW) { node.textAutoResize = 'HEIGHT'; node.resize(s.maxW, node.height) }
    }
    if (s.effectStyle && ctx.effectByName[s.effectStyle]) { try { await node.setEffectStyleIdAsync(ctx.effectByName[s.effectStyle].id) } catch (_e) { /* ignore */ } }
    if (s.hidden) node.visible = false

    for (const c of s.children || []) await build(c, node)

    if (parent && s.grow === 'fill') { try { node.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ } }
    if (s.minH != null) { try { node.minHeight = s.minH } catch (_e) { /* ignore */ } }
    if (s.minW != null) { try { node.minWidth = s.minW } catch (_e) { /* ignore */ } }
    if (s.type === 'frame' && (s.w != null || s.h != null)) {
      try {
        if (s.w != null) { if (s.row) node.primaryAxisSizingMode = 'FIXED'; else node.counterAxisSizingMode = 'FIXED' }
        if (s.h != null) { if (s.row) node.counterAxisSizingMode = 'FIXED'; else node.primaryAxisSizingMode = 'FIXED' }
        node.resize(s.w != null ? s.w : node.width, s.h != null ? s.h : node.height)
      } catch (_e) { /* ignore */ }
    }

    roles[s.role] = node
    return node
  }

  const node = await build(spec, null)
  return { node, roles }
}

/** DEFENSIVE characters assignment — never assigns a non-string/undefined/null; throws with full context otherwise. */
function setChars(node, value, ctxInfo, opts) {
  const p = textProblem(value)
  if (p && !(opts && opts.allowEmpty && (p === 'empty string' || p === 'whitespace-only string'))) {
    throw charactersError(value, ctxInfo)
  }
  node.characters = value
}

/** Apply one override list ({role, set:{...}}) to rendered roles. */
async function applyOverrides(roles, overrides, ctx) {
  for (const o of overrides || []) {
    const node = o.role === 'root' ? roles.root : roles[o.role]
    if (!node) continue
    const s = o.set || {}
    const styleFor = (tok) => (tok ? ctx.paintByToken[tok] : null)
    if (s.fill !== undefined) {
      if (s.fill === null) node.fills = []
      else { const st = styleFor(s.fill); if (st) { try { await node.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } } }
    }
    if (s.stroke !== undefined) {
      if (s.stroke === null) { node.strokes = [] } else {
        const st = styleFor(s.stroke)
        if (!node.strokes || !node.strokes.length) node.strokes = [solidPaint('#203743')]
        if (st) { try { await node.setStrokeStyleIdAsync(st.id) } catch (_e) { /* ignore */ } }
      }
    }
    if (s.strokeW != null) node.strokeWeight = s.strokeW
    if (s.textFill) { const st = styleFor(s.textFill); if (st && node.type === 'TEXT') { try { await node.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } } }
    if (s.opacity != null) node.opacity = s.opacity
    if (s.hidden !== undefined) node.visible = !s.hidden
    if (s.text !== undefined && node.type === 'TEXT') { setChars(node, s.text, { role: o.role }) }
    if (s.w != null) { try { node.resize(s.w, node.height) } catch (_e) { /* ignore */ } }
    if (s.minW != null) { try { node.minWidth = s.minW } catch (_e) { /* ignore */ } }
  }
}

/**
 * Mirror a rendered tree for RTL: reverse every horizontal frame's children +
 * right-align text — EXCEPT any subtree rooted at a PROTECTED_LTR_ROLES role
 * (rtl.js), which is left completely untouched (see the CRITICAL player-
 * timeline requirement in the task brief).
 * @param {any} node
 */
function mirrorRtl(node) {
  if (isProtectedRole(node.name)) return
  if (node.type === 'FRAME' || node.type === 'COMPONENT') {
    if (node.layoutMode === 'HORIZONTAL') {
      const kids = [...node.children]
      for (let i = kids.length - 1; i >= 0; i--) node.appendChild(kids[i])
    }
  }
  if (node.type === 'TEXT') { try { node.textAlignHorizontal = 'RIGHT' } catch (_e) { /* ignore */ } }
  for (const c of node.children || []) mirrorRtl(c)
}

/** Default tone/dot override — Phase 102 families always supply explicit
 *  per-value overrides (components.js), so this is a documented safe no-op
 *  fallback rather than a guessed colour. */
function toneOverridesFor() { return [] }

// ── doc specimens (Foundations page) ────────────────────────────────────────
async function upsertDoc(docSpec, live, ctx, runId) {
  const existing = live.docs[docSpec.key]
  let originRunId = runId
  if (existing) {
    try { const prior = existing.getSharedPluginData(NS, K.RUN_ID); if (prior && prior.length) originRunId = prior } catch (_e) { /* ignore */ }
    try { existing.remove() } catch (_e) { /* ignore */ }
    delete live.docs[docSpec.key]
  }
  const r = await renderNode(docSpec.spec, ctx)
  r.node.name = docSpec.name
  ctx.section.appendChild(r.node)
  tag(r.node, { assetKey: docSpec.key, kind: C.KIND.DOC, hash: docSpec.hash, runId: originRunId })
  live.docs[docSpec.key] = r.node
  return r.node
}

// ── component family builder ────────────────────────────────────────────────
const STATE_PRESETS = require('presets').STATE_PRESETS

/** @param {any} fam @param {Record<string,string>} combo */
function presetOptsFor(fam, combo) {
  const o = { ...(fam.presetOpts || {}) }
  if (fam.shapeAxis && combo.Shape) o.shape = combo.Shape
  if (fam.markAxis && combo.Mark) o.mark = combo.Mark
  return o
}

/** Find the component inside a set matching a combo. @param {any} set @param {Record<string,string>} combo */
function findVariant(set, combo) {
  if (!set) return null
  if (set.type === 'COMPONENT') return set
  const want = Object.keys(combo).map((k) => k + '=' + combo[k]).join(', ')
  const kids = (set.children || []).filter((c) => c.type === 'COMPONENT')
  let hit = kids.find((c) => c.name === want)
  if (hit) return hit
  const pairs = Object.keys(combo).map((k) => k + '=' + combo[k])
  hit = kids.find((c) => pairs.every((p2) => c.name.includes(p2)))
  return hit || kids[0] || null
}

/** Full text-property id map of a set. @param {any} set */
function textPropIdsOf(set) {
  /** @type {Record<string, string>} */
  const out = {}
  try {
    const defs = set.componentPropertyDefinitions || {}
    for (const full of Object.keys(defs)) out[full.split('#')[0]] = full
  } catch (_e) { /* ignore */ }
  return out
}

/**
 * @param {any} fam @param {any} live @param {any} ctx
 */
async function upsertFamily(fam, live, ctx) {
  const existing = live.componentSets[fam.key]
  let originRunId = ctx.runId
  if (existing) {
    try { const prior = existing.getSharedPluginData(NS, K.RUN_ID); if (prior && prior.length) originRunId = prior } catch (_e) { /* ignore */ }
    try { existing.remove() } catch (_e) { /* ignore */ }
    delete live.componentSets[fam.key]
  }

  const combos = variantCombos(fam)
  /** @type {any[]} */
  const variantComponents = []
  /** @type {{comp:any, roles:Record<string,any>, combo:Record<string,string>}[]} */
  const rendered = []

  for (const combo of combos) {
    const spec = PRESETS[fam.preset](presetOptsFor(fam, combo))
    const comp = figma.createComponent()
    comp.name = Object.keys(combo).map((k) => k + '=' + combo[k]).join(', ')
    comp.layoutMode = spec.row ? 'HORIZONTAL' : 'VERTICAL'
    comp.primaryAxisSizingMode = 'AUTO'
    comp.counterAxisSizingMode = 'AUTO'
    comp.itemSpacing = spec.gap ?? 0
    comp.paddingLeft = comp.paddingRight = spec.padX ?? 0
    comp.paddingTop = comp.paddingBottom = spec.padY ?? 0
    if (spec.center) comp.counterAxisAlignItems = 'CENTER'
    if (spec.radius != null) comp.cornerRadius = spec.radius
    comp.fills = []
    ctx.section.appendChild(comp)

    const roles = { root: comp }
    const styleFor = (tok) => (tok ? ctx.paintByToken[tok] : null)
    if (spec.fill) { const st = styleFor(spec.fill); if (st) { try { await comp.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } } }
    if (spec.stroke) {
      comp.strokes = [solidPaint('#203743')]
      comp.strokeWeight = spec.strokeW ?? 1
      const st = styleFor(spec.stroke)
      if (st) { try { await comp.setStrokeStyleIdAsync(st.id) } catch (_e) { /* ignore */ } }
    }
    if (spec.minH != null) { try { comp.minHeight = spec.minH } catch (_e) { /* ignore */ } }
    if (spec.minW != null) { try { comp.minWidth = spec.minW } catch (_e) { /* ignore */ } }

    for (const child of spec.children || []) {
      const r = await renderNode(child, ctx)
      comp.appendChild(r.node)
      Object.assign(roles, r.roles)
      if (child.grow === 'fill') { try { r.node.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ } }
    }
    if (fam.hideLabel && roles.Label) { try { roles.Label.visible = false } catch (_e) { /* ignore */ } }

    for (const axisProp of Object.keys(combo)) {
      const value = combo[axisProp]
      if (axisProp === 'Direction') continue
      const famOv = fam.valueOverrides && fam.valueOverrides[axisProp] && fam.valueOverrides[axisProp][value]
      if (famOv) await applyOverrides(roles, famOv, ctx)
      else if (axisProp === 'State') await applyOverrides(roles, STATE_PRESETS[value] || [], ctx)
      else await applyOverrides(roles, toneOverridesFor(), ctx)
      if (famOv && axisProp === 'State' && STATE_PRESETS[value] && STATE_PRESETS[value].length) {
        await applyOverrides(roles, STATE_PRESETS[value].filter((o2) => !famOv.some((f2) => f2.role === o2.role)), ctx)
      }
    }
    if (fam.elevation && ctx.effectByName[fam.elevation]) {
      try { await comp.setEffectStyleIdAsync(ctx.effectByName[fam.elevation].id) } catch (_e) { /* ignore */ }
    }
    if (combo.Direction === 'RTL') mirrorRtl(comp)

    variantComponents.push(comp)
    rendered.push({ comp, roles, combo })
  }

  let set
  if (variantComponents.length > 1) {
    try { set = figma.combineAsVariants(variantComponents, ctx.section) }
    catch (_e) { for (let i = 1; i < variantComponents.length; i++) { try { variantComponents[i].remove() } catch (_e2) { /* ignore */ } } set = variantComponents[0] }
  } else {
    set = variantComponents[0]
  }
  set.name = fam.name
  set.description = fam.description + (fam.maps ? '\nMaps to ' + fam.maps : '') + '\nA11y: ' + fam.a11y
  try {
    set.layoutMode = 'HORIZONTAL'
    set.itemSpacing = 24
    ;/** @type {any} */ (set).layoutWrap = 'WRAP'
    set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 24
  } catch (_e) { /* lone component */ }

  /** @type {Record<string, string>} */
  const propIds = {}
  let propsAdded = 0
  const canProps = typeof set.addComponentProperty === 'function'
  if (canProps) {
    for (const tp of fam.text || []) { try { propIds[tp.name] = set.addComponentProperty(tp.name, 'TEXT', ''); propsAdded++ } catch (_e) { /* ignore */ } }
    for (const bp of fam.bools || []) {
      const baseLayer = rendered[0] && rendered[0].roles[bp.role]
      const def = baseLayer ? baseLayer.visible !== false : true
      try { propIds[bp.name] = set.addComponentProperty(bp.name, 'BOOLEAN', def); propsAdded++ } catch (_e) { /* ignore */ }
    }
    for (const sp of fam.swaps || []) {
      if (!ctx.iconDefault) continue
      try { propIds[sp.name] = set.addComponentProperty(sp.name, 'INSTANCE_SWAP', ctx.iconDefault.id); propsAdded++ } catch (_e) { /* ignore */ }
    }
    for (const r of rendered) {
      for (const tp of fam.text || []) {
        const layer = r.roles[tp.role]
        if (layer && propIds[tp.name] && layer.type === 'TEXT') { try { layer.componentPropertyReferences = { characters: propIds[tp.name] } } catch (_e) { /* ignore */ } }
      }
      for (const bp of fam.bools || []) {
        const layer = r.roles[bp.role]
        if (layer && propIds[bp.name]) { try { layer.componentPropertyReferences = { visible: propIds[bp.name] } } catch (_e) { /* ignore */ } }
      }
      for (const sp of fam.swaps || []) {
        const layer = r.roles[sp.role]
        if (layer && propIds[sp.name] && layer.type === 'INSTANCE') { try { layer.componentPropertyReferences = { mainComponent: propIds[sp.name] } } catch (_e) { /* ignore */ } }
      }
    }
  }

  tag(set, { assetKey: fam.key, kind: C.KIND.COMPONENT_SET, hash: fam.hash, runId: originRunId })
  live.componentSets[fam.key] = set
  return { set, propIds, fidelity: 'rev' + fam.rev + ' (' + combos.length + ' variants, ' + propsAdded + ' props)' }
}

// ── screen builder (Screens page) ───────────────────────────────────────────
/**
 * @param {any} scr spec screen @param {any} live @param {any} ctx { section, fonts, paintByToken, textStyleByName, runId, familyByKey, unresolved }
 */
async function upsertScreen(scr, live, ctx) {
  const existing = live.screens[scr.key]
  let originRunId = ctx.runId
  let frame
  if (existing) {
    try { const prior = existing.getSharedPluginData(NS, K.RUN_ID); if (prior && prior.length) originRunId = prior } catch (_e) { /* ignore */ }
    for (const ch of [...(existing.children || [])]) { try { ch.remove() } catch (_e) { /* ignore */ } }
    frame = existing
  } else {
    frame = figma.createFrame()
    ctx.section.appendChild(frame)
  }
  frame.name = scr.name
  frame.layoutMode = 'VERTICAL'
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'FIXED'
  frame.itemSpacing = 24
  const pad = scr.breakpoint === 'mobile' ? 20 : scr.breakpoint === 'tablet' ? 32 : 48
  frame.paddingLeft = frame.paddingRight = pad
  frame.paddingTop = frame.paddingBottom = pad
  frame.resize(scr.width, 100)
  const bg = ctx.paintByToken['Color/Background/Base']
  if (bg) { try { await frame.setFillStyleIdAsync(bg.id) } catch (_e) { /* ignore */ } }

  /** @param {any} item @param {any} parent */
  const place = async (item, parent) => {
    if (item.row) {
      const row = figma.createFrame()
      row.name = 'Row'
      row.layoutMode = 'HORIZONTAL'
      row.primaryAxisSizingMode = 'AUTO'
      row.counterAxisSizingMode = 'AUTO'
      row.itemSpacing = 16
      row.fills = []
      parent.appendChild(row)
      const items = scr.rtl ? [...item.row].reverse() : item.row
      for (const sub of items) await place(sub, row)
      return
    }
    if (item.col) {
      const col = figma.createFrame()
      col.name = 'Col'
      col.layoutMode = 'VERTICAL'
      col.primaryAxisSizingMode = 'AUTO'
      col.counterAxisSizingMode = 'AUTO'
      col.itemSpacing = 12
      col.fills = []
      parent.appendChild(col)
      for (const sub of item.col) await place(sub, col) // vertical order never mirrors
      return
    }
    if ('heading' in item) {
      const t = figma.createText()
      const displayStyle = !item.style || item.style.startsWith('Display') || item.style.startsWith('Heading')
      t.fontName = ctx.fonts.resolve(displayStyle ? 'display' : 'body', displayStyle ? 'Bold' : 'Regular')
      setChars(t, item.heading, { screenKey: scr.key, role: 'Heading(' + (item.style || 'Heading/L') + ')', locale: scr.locale })
      parent.appendChild(t)
      const ramp = ctx.textStyleByName[item.style || 'Heading/L']
      if (ramp) { try { await t.setTextStyleIdAsync(ramp.id) } catch (_e) { /* ignore */ } }
      const fillStyle = ctx.paintByToken[item.style === 'Body/M' ? 'Color/Text/Secondary' : 'Color/Text/Primary']
      if (fillStyle) { try { await t.setFillStyleIdAsync(fillStyle.id) } catch (_e) { /* ignore */ } }
      t.textAutoResize = 'HEIGHT'
      try { t.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ }
      if (scr.rtl) { try { t.textAlignHorizontal = 'RIGHT' } catch (_e) { /* ignore */ } }
      return
    }
    // component instance
    const famKey = 'componentSet:' + item.family
    const set = live.componentSets[famKey]
    if (!set) { ctx.unresolved.push(scr.key + ' → ' + item.family + ' (run the Components stage first)'); return }
    const combo = { ...(item.variant || {}) }
    const specFam = ctx.familyByKey[famKey]
    if (specFam && specFam.dirAxis) combo.Direction = item.D
    const variant = findVariant(set, combo)
    if (!variant) { ctx.unresolved.push(scr.key + ' → ' + item.family + ' variant ' + JSON.stringify(combo) + ' not found'); return }
    let inst
    try { inst = variant.createInstance() } catch (_e) { return }
    parent.appendChild(inst)
    const props = item.props || {}
    const ids = textPropIdsOf(set)
    /** @type {Record<string, string>} */
    const setProps = {}
    for (const name of Object.keys(props)) {
      const v = props[name]
      const p = textProblem(v)
      if (p) throw charactersError(v, { screenKey: scr.key, role: item.family + '.' + name, locale: scr.locale })
      if (ids[name]) setProps[ids[name]] = v
    }
    if (Object.keys(setProps).length) { try { inst.setProperties(setProps) } catch (_e) { /* ignore */ } }
  }

  for (const item of scr.items) await place(item, frame)

  tag(frame, { assetKey: scr.key, kind: C.KIND.SCREEN, hash: scr.hash, runId: originRunId })
  live.screens[scr.key] = frame
  return frame
}

// ── layout helpers ───────────────────────────────────────────────────────────
function layoutSets(sets, section) {
  const COLS = 2, CW = 1700, CH = 900, PAD = 60
  sets.forEach((s, i) => { if (!s) return; try { s.x = section.x + PAD + (i % COLS) * CW; s.y = section.y + 80 + Math.floor(i / COLS) * CH } catch (_e) { /* ignore */ } })
}
function layoutDocs(nodes, section) {
  let y = 80
  for (const n of nodes) { if (!n) continue; try { n.x = section.x + 60; n.y = section.y + y; y += n.height + 80 } catch (_e) { /* ignore */ } }
}
function layoutScreens(nodes, section) {
  const byType = {}
  for (const n of nodes) { if (!n) continue; const t = n.getSharedPluginData ? n.getSharedPluginData(NS, K.ASSET_KEY).split(':')[1] : 'x'; (byType[t] = byType[t] || []).push(n) }
  const PAD = 80
  let rowY = 0
  for (const t of Object.keys(byType).sort()) {
    let x = 0
    let maxH = 0
    for (const n of byType[t]) {
      try { n.x = section.x + PAD + x; n.y = section.y + PAD + rowY; x += n.width + 100; maxH = Math.max(maxH, n.height) } catch (_e) { /* ignore */ }
    }
    rowY += maxH + 140
  }
}

// ── top-level operations ────────────────────────────────────────────────────
/**
 * @param {{ stage?: 'all'|'foundations'|'components'|'screens', dryRun?: boolean, _specForTest?: any }} [options]
 *   _specForTest is a TEST-ONLY hook (never set by the UI).
 */
async function run(options) {
  const stage = (options && options.stage) || 'all'
  const dryRun = !!(options && options.dryRun)
  const spec = (options && options._specForTest) || buildSpec()

  // FAIL-CLOSED PREFLIGHT — pure checks, before any mutation.
  const textValidation = validateScreenText(spec)
  const pagePlan = checkPagePlan()

  if (dryRun) {
    const wantKinds = stageKinds(stage)
    const opsForStage = wantKinds ? spec.assets.filter((a) => wantKinds.has(a.kind)) : spec.assets
    const plan = computePlan({ assets: opsForStage, counts: spec.counts }, {})
    return {
      ok: textValidation.ok && pagePlan.ok,
      mode: 'dry-run', stage,
      counts: spec.counts,
      plan,
      textValidation,
      pagePlan,
    }
  }

  if (!textValidation.ok) return { ok: false, mode: 'apply', stage, blocked: 'TEXT_VALIDATION_FAILED', issues: textValidation.issues, counts: spec.counts }
  if (!pagePlan.ok) return { ok: false, mode: 'apply', stage, blocked: 'PAGE_CAP_EXCEEDED', reason: pagePlan.blocked, counts: spec.counts }

  const runId = newRunId()
  const errors = []
  const unresolved = []

  try {
    // NOTE on ordering: page rename/create is the one mutation that happens
    // BEFORE the ambiguity gate below, because ambiguity can only be observed
    // by scanning the 3 managed pages' contents, and those pages must exist
    // first. This is deliberately narrow (idempotent, reversible, and cannot
    // itself create a duplicate managed marker) — every higher-risk mutation
    // (variables, styles, components, screens) still happens strictly after
    // the ambiguity check.
    const pagesByName = applyPagePlan(pagePlan)
    const live = await buildLiveIndex(pagesByName)
    const ambiguities = detectAmbiguity(live.observations)
    if (ambiguities.length) return { ok: false, mode: 'apply', stage, runId, blocked: 'AMBIGUOUS_OWNERSHIP', ambiguities, counts: spec.counts }

    const fullPlan = computePlan(spec, live.index)

    // sections (idempotent; cheap; always ensured)
    ensureSection(spec.sectionFoundations, live, pagesByName[C.PAGES.FOUNDATIONS], runId)
    ensureSection(spec.sectionComponents, live, pagesByName[C.PAGES.COMPONENTS], runId)
    ensureSection(spec.sectionScreens, live, pagesByName[C.PAGES.SCREENS], runId)

    // foundation styles — ALWAYS ensured first (cheap; every later stage depends on them).
    for (const col of spec.collections) upsertCollection(col, live, runId)
    for (const v of spec.variables) { try { upsertVariable(v, live, runId) } catch (e) { errors.push('variable ' + v.key + ': ' + e.message) } }
    const paintByToken = {}
    for (const p of spec.paintStyles) { try { const ps = upsertPaintStyle(p, live, runId); paintByToken[p.name] = ps } catch (e) { errors.push('paintStyle ' + p.key + ': ' + e.message) } }
    const fonts = await resolveFonts(spec.textStyles, FONTS)
    const textStyleByName = {}
    for (const t of spec.textStyles) { try { const ts = upsertTextStyle(t, live, fonts, runId); textStyleByName[t.name] = ts } catch (e) { errors.push('textStyle ' + t.key + ': ' + e.message) } }
    const effectByName = {}
    for (const e of spec.effectStyles) { try { const es = upsertEffectStyle(e, live, runId); effectByName[e.name] = es } catch (er) { errors.push('effectStyle ' + e.key + ': ' + er.message) } }

    const opByKey = {}
    for (const op of fullPlan.ops) opByKey[op.key] = op

    // ── Foundations doc specimens ──
    const docNodes = []
    if (stage === 'all' || stage === 'foundations') {
      const ctxDoc = { section: live.sections['section:foundations'], paintByToken, textStyleByName, effectByName, fonts, iconDefault: null }
      for (const d of spec.docs) {
        const op = opByKey[d.key]
        if (op && op.action === 'skip' && live.docs[d.key]) { docNodes.push(live.docs[d.key]); continue }
        try { docNodes.push(await upsertDoc(d, live, ctxDoc, runId)) } catch (e) { errors.push('doc ' + d.key + ': ' + e.message) }
      }
      layoutDocs(docNodes, live.sections['section:foundations'])
    }

    // ── Components ──
    const builtSets = []
    const fidelity = []
    if (stage === 'all' || stage === 'components') {
      // Icon FIRST — it is the INSTANCE_SWAP default target for every other
      // family's icon slots (PlayPauseIcon, LeadIcon, FavouriteButton Icon…).
      const famOrder = [...spec.families].sort((a, b) => (a.key === 'componentSet:icon' ? -1 : b.key === 'componentSet:icon' ? 1 : 0))
      const ctx = { section: live.sections['section:components'], paintByToken, textStyleByName, effectByName, fonts, runId, iconDefault: null }
      for (const fam of famOrder) {
        const op = opByKey[fam.key]
        if (op && op.action === 'skip' && live.componentSets[fam.key]) {
          builtSets.push(live.componentSets[fam.key])
          fidelity.push({ family: fam.name, fidelity: 'unchanged (skipped, id preserved)' })
        } else {
          try {
            const r = await upsertFamily(fam, live, ctx)
            builtSets.push(r.set)
            fidelity.push({ family: fam.name, fidelity: r.fidelity })
          } catch (e) { errors.push('family ' + fam.key + ': ' + e.message); builtSets.push(null) }
        }
        if (fam.key === 'componentSet:icon') {
          const iconSet = live.componentSets['componentSet:icon']
          ctx.iconDefault = findVariant(iconSet, { Mark: 'Dot' })
        }
      }
      layoutSets(builtSets, live.sections['section:components'])
    }

    // ── Screens ──
    const screenNodes = []
    if (stage === 'all' || stage === 'screens') {
      const familyByKey = {}
      for (const f of spec.families) familyByKey[f.key] = f
      const ctxScreen = { section: live.sections['section:screens'], fonts, paintByToken, textStyleByName, runId, familyByKey, unresolved }
      for (const scr of spec.screens) {
        const op = opByKey[scr.key]
        if (op && op.action === 'skip' && live.screens[scr.key]) { screenNodes.push(live.screens[scr.key]); continue }
        try { screenNodes.push(await upsertScreen(scr, live, ctxScreen)) } catch (e) { errors.push('screen ' + scr.key + ': ' + e.message) }
      }
      layoutScreens(screenNodes, live.sections['section:screens'])
    }

    await writeManifest(live, runId, spec, fullPlan, pagePlan)

    const wantKinds = stageKinds(stage)
    const stageOps = wantKinds ? fullPlan.ops.filter((o) => wantKinds.has(o.kind)) : fullPlan.ops
    const stageSummary = { create: 0, update: 0, skip: 0 }
    for (const o of stageOps) if (stageSummary[o.action] !== undefined) stageSummary[o.action]++

    return {
      ok: errors.length === 0,
      mode: 'apply', stage, runId,
      counts: spec.counts,
      pageActions: pagePlan.actions,
      applied: stageSummary,
      fontSubstitutions: fonts.substitutions,
      fidelity,
      unresolved,
      errors,
      recovery: 'If this Apply was interrupted, RERUN the same stage (or "All"): per-asset hashes converge (stale assets update, finished ones skip).',
    }
  } catch (e) {
    return { ok: false, mode: 'apply', stage, runId, error: e.message, errors, recovery: 'Rerun the stage to converge, or Rollback(runId) to remove assets first created by this run.' }
  }
}

async function verify() {
  const spec = buildSpec()
  const existingNames = figma.root.children.map((p) => p.name)
  /** @type {Record<string, any>} */
  const pagesByName = {}
  for (const name of C.PAGE_NAMES) pagesByName[name] = figma.root.children.find((p) => p.name === name) || null
  const live = await buildLiveIndex(pagesByName)
  const ambiguities = detectAmbiguity(live.observations)
  const present = []
  const missing = []
  const drifted = []
  for (const a of spec.assets) {
    const e = live.index[a.key]
    if (!e) { missing.push({ key: a.key, kind: a.kind, name: a.name }); continue }
    if (e.hash !== a.hash) drifted.push({ key: a.key, kind: a.kind, name: a.name, recorded: e.hash, expected: a.hash })
    else present.push(a.key)
  }
  return {
    ok: missing.length === 0 && drifted.length === 0 && ambiguities.length === 0,
    present: present.length,
    missing,
    drifted,
    ambiguities,
    pagesFound: C.PAGE_NAMES.filter((n) => !!pagesByName[n]).length,
    pagesExpected: C.PAGE_NAMES.length,
    existingPageNames: existingNames,
    total: spec.assets.length,
  }
}

/** @param {{ runId?: string|null }} [options] */
async function rollback(options) {
  const filterRun = options && options.runId ? options.runId : null
  const removed = { variables: 0, collections: 0, paintStyles: 0, textStyles: 0, effectStyles: 0, componentSets: 0, docs: 0, screens: 0, manifest: 0, sections: 0 }
  const errors = []
  const notes = []
  const inScope = (obj) => isManaged(obj) && (!filterRun || obj.getSharedPluginData(NS, K.RUN_ID) === filterRun)

  for (const page of figma.root.children) {
    for (const ch of [...page.children]) {
      if (ch.type !== 'SECTION') continue
      for (const sub of [...(/** @type {any} */ (ch).children || [])]) {
        if (!inScope(sub)) continue
        const kind = sub.getSharedPluginData(NS, K.ASSET_KIND)
        try {
          sub.remove()
          if (kind === C.KIND.MANIFEST) removed.manifest++
          else if (kind === C.KIND.DOC) removed.docs++
          else if (kind === C.KIND.SCREEN) removed.screens++
          else removed.componentSets++
        } catch (e) { errors.push(e.message) }
      }
    }
  }
  for (const ps of await figma.getLocalPaintStylesAsync()) if (inScope(ps)) { try { ps.remove(); removed.paintStyles++ } catch (e) { errors.push(e.message) } }
  for (const ts of await figma.getLocalTextStylesAsync()) if (inScope(ts)) { try { ts.remove(); removed.textStyles++ } catch (e) { errors.push(e.message) } }
  for (const es of await figma.getLocalEffectStylesAsync()) if (inScope(es)) { try { es.remove(); removed.effectStyles++ } catch (e) { errors.push(e.message) } }
  for (const v of await figma.variables.getLocalVariablesAsync()) if (inScope(v)) { try { v.remove(); removed.variables++ } catch (e) { errors.push(e.message) } }
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) if (inScope(c)) { try { c.remove(); removed.collections++ } catch (e) { errors.push(e.message) } }
  for (const page of figma.root.children) {
    for (const ch of [...page.children]) {
      if (ch.type === 'SECTION' && inScope(ch)) {
        const remaining = (/** @type {any} */ (ch).children || []).length
        if (remaining === 0) { try { ch.remove(); removed.sections++ } catch (e) { errors.push(e.message) } }
        else notes.push('section "' + ch.name + '" kept: ' + remaining + ' out-of-scope/user child(ren) remain')
      }
    }
  }
  notes.push('Pages themselves (01 Foundations / 02 Components / 03 Screens) are NEVER deleted or renamed back by rollback — only the managed content inside their sections. Renaming pages back is a manual, explicit owner action.')
  return { ok: errors.length === 0, scope: filterRun || 'all-managed', removed, notes, errors }
}

// ── manifest node (audit copy; live markers are the source of truth) ───────
const CHUNK = 60000
function writeChunked(node, base, str) {
  const n = Math.max(1, Math.ceil(str.length / CHUNK))
  node.setSharedPluginData(NS, base + ':count', String(n))
  for (let i = 0; i < n; i++) node.setSharedPluginData(NS, base + ':' + i, str.slice(i * CHUNK, (i + 1) * CHUNK))
}
function rebuildIndexFromLive(live) {
  /** @type {Record<string, {id:string, hash:string, kind:string}>} */
  const idx = {}
  const add = (obj) => { if (!obj) return; try { const t = readTag(obj); if (t.assetKey) idx[t.assetKey] = { id: obj.id, hash: t.hash, kind: t.kind } } catch (_e) { /* ignore */ } }
  const groups = [live.collections, live.variables, live.styles.paint, live.styles.text, live.styles.effect, live.docs, live.componentSets, live.screens]
  for (const g of groups) for (const k of Object.keys(g || {})) add(g[k])
  for (const k of Object.keys(live.sections || {})) add(live.sections[k])
  return idx
}
async function writeManifest(live, runId, spec, plan, pagePlan) {
  const section = live.sections['section:foundations']
  if (!section) return
  let node = section.children.find((n) => n.getSharedPluginData(NS, K.ASSET_KIND) === C.KIND.MANIFEST)
  if (!node) {
    node = figma.createFrame()
    node.name = C.MANIFEST_NODE_NAME
    node.resize(24, 24)
    node.visible = false
    section.appendChild(node)
  }
  const index = rebuildIndexFromLive(live)
  const payload = { pluginVersion: C.PLUGIN_VERSION, lastRunId: runId, counts: spec.counts, summary: plan.summary, pageActions: pagePlan.actions, index }
  writeChunked(node, 'manifest', JSON.stringify(payload))
  node.setSharedPluginData(NS, K.MANAGED, '1')
  node.setSharedPluginData(NS, K.ASSET_KIND, C.KIND.MANIFEST)
  node.setSharedPluginData(NS, K.ASSET_KEY, 'manifest:node')
  const priorRun = node.getSharedPluginData(NS, K.RUN_ID)
  node.setSharedPluginData(NS, K.RUN_ID, priorRun && priorRun.length ? priorRun : runId)
}

module.exports = { run, verify, rollback, buildLiveIndex, checkPagePlan }

  };
  __modules["main"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Plugin entry point (runs in Figma's main thread). Shows the UI and routes
 * its messages to the executor. No network; all work is local to the open
 * file. Apply is STAGED (foundations / components / screens / all) so a run
 * is incremental and resumable — see figma-exec.js `run({ stage })`.
 */

const C = require('constants')
const { buildSpec } = require('spec')
const { renderPlanText } = require('plan')
const starter = require('starter')
const exec = require('figma-exec')

figma.showUI(__html__, { width: 520, height: 720, title: C.PLUGIN_NAME })

/** @param {string} type @param {any} payload */
function post(type, payload) {
  figma.ui.postMessage({ type, payload })
}

figma.ui.onmessage = async (msg) => {
  const m = /** @type {any} */ (msg)
  try {
    switch (m && m.type) {
      case 'init': {
        const spec = buildSpec()
        const pagePlan = exec.checkPagePlan()
        post('meta', {
          name: C.PLUGIN_NAME,
          version: C.PLUGIN_VERSION,
          counts: spec.counts,
          pages: C.PAGE_NAMES,
          pagePlan,
          supported: starter.STARTER_SUPPORTED,
          deferred: starter.STARTER_DEFERRED,
          fileEdit: starter.FILE_EDIT_REQUIREMENT,
        })
        break
      }
      case 'dry-run': {
        const res = await exec.run({ dryRun: true, stage: m.stage || 'all' })
        post('dry-run', Object.assign({}, res, { text: renderPlanText(res.plan) }))
        break
      }
      case 'apply': {
        post('progress', { message: 'Applying stage "' + (m.stage || 'all') + '"…' })
        const res = await exec.run({ dryRun: false, stage: m.stage || 'all' })
        post('apply', res)
        break
      }
      case 'verify': {
        const res = await exec.verify()
        post('verify', res)
        break
      }
      case 'rollback': {
        const res = await exec.rollback({ runId: m.runId || null })
        post('rollback', res)
        break
      }
      case 'close':
        figma.closePlugin()
        break
      default:
        post('error', { message: 'Unknown message: ' + (m && m.type) })
    }
  } catch (e) {
    post('error', { message: (e && e.message) || String(e) })
  }
}

  };
  require('main');
})();

/* Hermes Design System Builder — generated bundle. Do not edit dist/ by hand; edit src/ and run `npm run build`. */
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
 * Shared constants for the Hermes Design System Builder plugin.
 *
 * Everything the plugin creates is tagged in a single shared-plugin-data
 * namespace and tracked in a single on-canvas manifest node, so that every run
 * is deterministic, idempotent and precisely reversible. NONE of these values
 * are secret; there is no network access and nothing leaves the file.
 */

/** Bump when the asset SHAPE changes in a way that should trigger reconciliation. */
const PLUGIN_VERSION = '0.1.0'
const PLUGIN_NAME = 'Hermes Design System Builder'

/**
 * Shared-plugin-data namespace. Every managed node/style/variable carries data
 * under this namespace. Rollback and idempotency both key off it. Anything
 * WITHOUT this namespace (e.g. the 34 reference frames) is never touched.
 */
const NAMESPACE = 'hermesDSB'

/** Shared-plugin-data keys written on every managed asset. */
const KEYS = Object.freeze({
  MANAGED: 'managed', // always "1" on assets this plugin created
  ASSET_KEY: 'assetKey', // stable semantic identity (see naming.js)
  ASSET_KIND: 'assetKind', // 'collection' | 'variable' | 'paintStyle' | 'textStyle' | 'effectStyle' | 'component' | 'componentSet' | 'section' | 'manifest'
  RUN_ID: 'runId', // the run that first created the asset
  CONTENT_HASH: 'contentHash', // hash of the spec that produced the asset
  PLUGIN_VERSION: 'pluginVersion',
})

/**
 * Name of the single manifest node (a tiny frame) that stores an AUDIT COPY of
 * the assetKey -> nodeId/styleId/variableId map plus the last run summary.
 *
 * NOTE: idempotency (computePlan) and rollback do NOT rely on this node — they
 * key off a LIVE scan of the shared-plugin-data markers on the assets themselves,
 * which stays correct even if the manifest node is deleted or the file is edited
 * by hand. The manifest node is a human/audit convenience, refreshed each Apply.
 */
const MANIFEST_NODE_NAME = '⟦ hermes-dsb · manifest — do not delete ⟧'

/** All generated COMPONENTS live inside this one top-level section for isolation. */
const SECTION_NAME = 'Hermes DS · Generated (managed by plugin)'

/** Native reference assemblies live in this SECOND managed section. */
const SECTION2_NAME = 'Hermes DS · Native Reference Assemblies'

/** Local variable collection names created by this plugin. */
const COLLECTIONS = Object.freeze({
  COLORS: 'Hermes · Semantic Colors',
  SPACING: 'Hermes · Spacing',
  RADIUS: 'Hermes · Radius',
  SIZING: 'Hermes · Sizing',
})

/**
 * Deterministic REVISION markers. Bumping a revision changes the content hash of
 * the affected asset kind, so a rerun produces a surgical UPDATE plan (only those
 * assets) instead of a no-op SKIP — this is how a fidelity uplift of the local
 * builder is safely rolled out to already-applied managed assets.
 *
 *   revision 1 = the initially shipped scaffold (commit 8d49c44, applied run-ms7q88mf-1)
 *   revision 2 = intermediate fidelity uplift (never applied, folded into FINAL)
 *   revision 3 = FINAL production-fidelity components (full anatomy/states/props)
 *   assembly 1 = first revision of the native reference assemblies
 *
 * Foundation variables/collections/paint/effect styles are NOT revisioned here —
 * their content is fully token-derived, so they only update when a token changes.
 */
const REVISIONS = Object.freeze({
  component: 3, // component-set builder revision (FINAL)
  textStyle: 2, // text-style / font-resolution revision
  assembly: 2, // assemblies: rev 2 = repaired text pipeline (run-ms7vkx9n-1 fix)
})

/** Asset kinds (mirrors KEYS.ASSET_KIND values). */
const KIND = Object.freeze({
  COLLECTION: 'collection',
  VARIABLE: 'variable',
  PAINT_STYLE: 'paintStyle',
  TEXT_STYLE: 'textStyle',
  EFFECT_STYLE: 'effectStyle',
  COMPONENT: 'component',
  COMPONENT_SET: 'componentSet',
  ASSEMBLY: 'assembly',
  SECTION: 'section',
  MANIFEST: 'manifest',
})

module.exports = { PLUGIN_VERSION, PLUGIN_NAME, NAMESPACE, KEYS, MANIFEST_NODE_NAME, SECTION_NAME, SECTION2_NAME, COLLECTIONS, KIND, REVISIONS }

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

  };
  __modules["presets"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Anatomy + state DSL for the FINAL production-fidelity revision.
 *
 * A family's visual contract is declared as a pure tree of NodeSpecs plus
 * state/tone override tables. The Figma renderer (figma-exec) interprets these;
 * the tests validate them (roles unique, tokens exist, bindings resolvable)
 * WITHOUT needing Figma. Everything here is pure data + pure helpers.
 *
 * NodeSpec:
 *   role      unique-within-family layer name (semantic, used for bindings/overrides)
 *   type      'frame' | 'text' | 'ellipse' | 'rect' | 'iconSlot'
 *   row       frame only: horizontal auto-layout (default vertical)
 *   gap,padX,padY   auto-layout metrics (px, token-derived at call sites)
 *   fill,stroke     token name from tokens.js paint styles (e.g. 'Color/Surface/Primary')
 *   strokeW,radius  px
 *   w,h,minW,minH,maxW  sizing (px); text with maxW wraps (textAutoResize HEIGHT)
 *   grow      'fill' → layoutSizingHorizontal FILL inside parent
 *   center    frame only: counterAxisAlignItems CENTER
 *   textStyle ramp name from tokens.js TEXT_STYLES (e.g. 'Body/M')
 *   textFill  token name for the text paint
 *   text      default characters (EN)
 *   hidden    initially invisible (bound bools reveal)
 *   children  NodeSpec[]
 */

/** Token-derived metric constants (mirror the globals.css space + radius tokens). */
const M = Object.freeze({
  controlX: 16, controlY: 10, card: 20, panel: 24,
  radiusSm: 6, radiusMd: 8, radiusLg: 12, radiusFull: 9999,
  gap: 8, gapTight: 4, gapWide: 12,
  touchMin: 40, // min interactive height (touch target incl. border)
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
 * validated by tests. These are the SHARED interaction-state semantics; families
 * may extend/override via their own `states` table.
 */
const STATE_PRESETS = Object.freeze({
  Default: [],
  Hover: [{ role: 'root', set: { fill: 'Color/Surface/Interactive' } }],
  Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
  Active: [{ role: 'root', set: { stroke: 'Color/Border/Active', strokeW: 1.5 } }],
  Disabled: [
    { role: 'root', set: { opacity: 0.55 } },
    { role: 'Label', set: { textFill: 'Color/Text/Disabled' } },
  ],
  Loading: [
    { role: 'Label', set: { textFill: 'Color/Text/Muted' } },
    { role: 'Spinner', set: { hidden: false } },
  ],
  Error: [
    { role: 'root', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } },
    { role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } },
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
  /** Horizontal control (Button/Link/IconButton/Tabs/Badge/chips). */
  control(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gap, padX: o.padX ?? M.controlX, padY: o.padY ?? M.controlY,
      radius: o.radius ?? M.radiusSm, fill: o.fill ?? 'Color/Surface/Interactive',
      stroke: o.stroke ?? 'Color/Border/Default', strokeW: 1, minH: o.minH ?? M.touchMin,
      children: [
        ...(o.icon ? [iconSlot('IconSlot')] : []),
        txt('Label', o.label ?? 'Label', o.textStyle ?? 'Title/S', o.textFill ?? 'Color/Text/Primary'),
        ...(o.spinner ? [dot('Spinner', 12, 'Color/Brand/Primary', { hidden: true })] : []),
      ],
    })
  },

  /** Labelled field (Input/Textarea/Select/Search/Dropdown trigger). */
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
            txt('Value', o.value ?? 'Value', 'Body/M', 'Color/Text/Primary', { grow: 'fill', maxW: o.tall ? 280 : undefined }),
            ...(o.trailMark ? [dot('TrailMark', 8, 'Color/Text/Muted')] : []),
          ],
        }),
        txt('Hint', o.hint ?? 'Hint', 'Caption', 'Color/Text/Muted', { hidden: true }),
      ],
    })
  },

  /** Boolean input (Checkbox/Radio/Switch). */
  toggle(opts) {
    const o = opts || {}
    const mark = o.kind === 'switch'
      ? frame('Mark', { row: true, w: 36, h: 20, radius: M.radiusFull, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, padX: 2, padY: 2, children: [dot('Knob', 16, 'Color/Text/Secondary')] })
      : o.kind === 'radio'
        ? frame('Mark', { w: 18, h: 18, radius: M.radiusFull, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1.5, center: true, children: [dot('Knob', 8, 'Color/Brand/Primary', { hidden: true })] })
        : frame('Mark', { w: 18, h: 18, radius: 4, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1.5, center: true, children: [rect('Knob', { w: 10, h: 10, radius: 2, fill: 'Color/Brand/Primary', hidden: true })] })
    return frame('root', {
      row: true, center: true, gap: M.gap, padY: 2, minH: M.touchMin, fill: null,
      children: [mark, txt('Label', o.label ?? 'Label', 'Body/M', 'Color/Text/Primary')],
    })
  },

  /** Surface card (Card/MetricCard/InsightCard/EmptyState/ErrorState/FaultHypothesisCard/ConfidenceIndicator/SafeActionPanel/AssetStatusBlock). */
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

  /** List/tree row (StatusIndicator/EvidenceItem/TimelineEventRow/Breadcrumb/Pagination/DataTable rows/Accordion header/Toast/Alert). */
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
        ...(o.dismiss ? [txt('Dismiss', '✕', 'Body/S', 'Color/Text/Muted', { hidden: false })] : []),
      ],
    })
  },

  /** Overlay surface (Dialog/Drawer/Tooltip/Toast host/UserMenu popover). */
  overlay(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.panel, radius: o.radius ?? M.radiusLg,
      fill: 'Color/Surface/Elevated', stroke: 'Color/Surface/Glass (border)', strokeW: 1, minW: o.minW ?? 320,
      children: [
        frame('Header', { row: true, center: true, gap: M.gap, children: [txt('Title', o.title ?? 'Title', 'Heading/M', 'Color/Text/Primary', { grow: 'fill', maxW: 360 }), txt('Dismiss', '✕', 'Body/M', 'Color/Text/Muted')] }),
        txt('Body', o.body ?? 'Overlay content copy resilient to long FA/DE strings.', 'Body/M', 'Color/Text/Secondary', { maxW: 380 }),
        ...(o.actions ? [frame('ActionRow', { row: true, gap: M.gap, children: [
          frame('PrimaryAction', { row: true, center: true, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Brand/Primary', minH: M.touchMin, children: [txt('PrimaryLabel', o.actions[0], 'Title/S', 'Color/Brand/OnBrand')] }),
          ...(o.actions[1] ? [frame('SecondaryAction', { row: true, center: true, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, minH: M.touchMin, children: [txt('SecondaryLabel', o.actions[1], 'Title/S', 'Color/Text/Primary')] })] : []),
        ] })] : []),
      ],
    })
  },

  /** App shell strip (TopNavigation/Sidebar/LanguageSelector/UserMenu trigger). */
  shell(opts) {
    const o = opts || {}
    if (o.kind === 'sidebar') {
      return frame('root', {
        gap: M.gapTight, padX: M.gapWide, padY: M.panel, w: o.collapsed ? 64 : 240,
        fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minH: 320,
        children: [
          frame('Brand', { row: true, center: true, gap: M.gap, padY: M.gap, children: [dot('BrandMark', 12, 'Color/Brand/Primary'), ...(o.collapsed ? [] : [txt('BrandName', 'Hermes OS', 'Title/S', 'Color/Text/Primary')])] }),
          ...[1, 2, 3, 4].map((i) => frame('NavItem' + i, {
            row: true, center: true, gap: M.gap, padX: M.gap, padY: M.controlY, radius: M.radiusSm,
            fill: i === 1 ? 'Color/Surface/Interactive' : null, minH: M.touchMin,
            children: [dot('NavDot' + i, 8, i === 1 ? 'Color/Brand/Primary' : 'Color/Text/Muted'), ...(o.collapsed ? [] : [txt('NavLabel' + i, 'Navigation ' + i, 'Body/M', i === 1 ? 'Color/Text/Primary' : 'Color/Text/Secondary')])],
          })),
        ],
      })
    }
    // top navigation
    return frame('root', {
      row: true, center: true, gap: M.gapWide, padX: M.panel, padY: M.controlY,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minH: 56, minW: o.minW ?? 640,
      children: [
        frame('Brand', { row: true, center: true, gap: M.gap, children: [dot('BrandMark', 12, 'Color/Brand/Primary'), txt('BrandName', 'Hermes OS', 'Title/S', 'Color/Text/Primary')] }),
        frame('Spacer', { row: true, grow: 'fill', children: [] }),
        iconSlot('SearchSlot'),
        frame('UserChip', { row: true, center: true, gap: M.gap, padX: M.gap, padY: 4, radius: M.radiusFull, fill: 'Color/Surface/Interactive', children: [dot('Avatar', 20, 'Color/Brand/Primary'), txt('UserName', 'User', 'Body/S', 'Color/Text/Primary')] }),
      ],
    })
  },

  /** Industrial signal tile. */
  tile(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gap, padX: M.card, padY: M.card, radius: M.radiusMd,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: 220,
      children: [
        frame('TagRow', { row: true, center: true, gap: M.gap, children: [dot('StateDot', 10, o.dotFill ?? 'Color/Status/Success'), txt('Tag', o.tag ?? 'TT-1204.PV', 'Technical/Mono', 'Color/Text/Secondary')] }),
        frame('ValueRow', { row: true, center: true, gap: M.gapTight, children: [txt('Value', o.value ?? '182.4', 'Display/XL', 'Color/Text/Primary'), txt('Unit', o.unit ?? '°C', 'Body/S', 'Color/Text/Muted')] }),
        txt('Meta', o.meta ?? 'Updated 2s ago · Site A', 'Caption', 'Color/Text/Muted', { maxW: 220 }),
        txt('EmptyNote', 'No signal data.', 'Body/S', 'Color/Text/Muted', { hidden: true }),
      ],
    })
  },

  /** Data table (header + rows + state notes). */
  table(opts) {
    const o = opts || {}
    const row = (i, tone) => frame('Row' + i, {
      row: true, center: true, gap: M.gapWide, padX: M.controlX, padY: o.compact ? 6 : M.controlY,
      stroke: 'Color/Border/Default', strokeW: 1, minH: o.compact ? 32 : M.touchMin,
      children: [
        txt('Cell' + i + 'a', 'PLC-' + (100 + i), 'Technical/Mono', 'Color/Text/Primary', { w: 110 }),
        txt('Cell' + i + 'b', 'Asset description ' + i, 'Body/S', 'Color/Text/Secondary', { grow: 'fill', maxW: 260 }),
        dot('RowDot' + i, 8, tone),
      ],
    })
    return frame('root', {
      gap: 0, radius: M.radiusMd, fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: 480,
      children: [
        frame('HeaderRow', {
          row: true, center: true, gap: M.gapWide, padX: M.controlX, padY: M.controlY, fill: 'Color/Surface/Elevated',
          children: [txt('Header', o.header ?? 'Asset', 'Caption', 'Color/Text/Secondary', { w: 110 }), txt('Header2', 'Description', 'Caption', 'Color/Text/Secondary', { grow: 'fill' }), txt('Header3', 'State', 'Caption', 'Color/Text/Secondary')],
        }),
        frame('Body', { gap: 0, children: [row(1, 'Color/Status/Success'), row(2, 'Color/Status/Warning'), row(3, 'Color/Status/Danger')] }),
        txt('EmptyNote', 'No records match the current filter.', 'Body/S', 'Color/Text/Muted', { hidden: true, padX: M.controlX }),
        txt('LoadingNote', 'Loading records…', 'Body/S', 'Color/Text/Muted', { hidden: true }),
        txt('ErrorNote', 'Failed to load records. Retry.', 'Body/S', 'Color/Status/Danger', { hidden: true }),
      ],
    })
  },

  /** Skeleton/Spinner loaders. */
  loader(opts) {
    const o = opts || {}
    if (o.kind === 'spinner') {
      const d = o.size === 'L' ? 32 : o.size === 'S' ? 16 : 24
      return frame('root', { center: true, padX: 4, padY: 4, fill: null, children: [frame('Ring', { w: d, h: d, radius: M.radiusFull, stroke: 'Color/Brand/Primary', strokeW: 2, fill: null, children: [] })] })
    }
    const shape = o.shape === 'Circle'
      ? dot('Bone', 40, 'Color/Surface/Interactive')
      : rect('Bone', { w: o.shape === 'Block' ? 160 : 220, h: o.shape === 'Block' ? 80 : 12, radius: o.shape === 'Block' ? M.radiusMd : M.radiusFull, fill: 'Color/Surface/Interactive' })
    return frame('root', { padX: 0, padY: 0, fill: null, children: [shape] })
  },

  /** Geometric icon marks (the Icon utility family used by INSTANCE_SWAP slots). */
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
 * FINAL-revision component registry: 44 families (23 primitives mapped to
 * src/components/ds/*.tsx, 13 core, 7 industrial, 1 Icon utility) declared as
 * production anatomy blueprints (presets.js) with variant AXES, interaction
 * STATES, per-value overrides, bound TEXT/BOOLEAN/INSTANCE_SWAP properties,
 * Direction (LTR/RTL) axes where horizontal ordering matters, sizing/touch
 * rules and accessibility descriptions.
 *
 * Renames (same assetKey — completed, NOT duplicated): KpiCard → MetricCard,
 * TopNav → TopNavigation, Timeline → TimelineEventRow.
 *
 * Family shape:
 *   key, name, category, maps
 *   preset, presetOpts        anatomy blueprint (presets.js)
 *   axes: [{prop, values}]    variant axes (cartesian product = components)
 *   valueOverrides?: {axisProp: {value: overrides[]}}   family-specific looks
 *   text/bools/swaps: [{name, role}]                    bound component props
 *   dirAxis?: true            adds Direction=LTR/RTL axis (renderer mirrors rows)
 *   a11y: accessible-usage contract (joined into description + annotation)
 *   description
 */

const { PRESETS } = require('presets')

/** Variant VALUE keyword → semantic color token (dot/accent default mapping). */
const TONE_TOKEN = Object.freeze({
  Primary: 'Color/Brand/Primary', Brand: 'Color/Brand/Primary', Decision: 'Color/Reasoning/Decision',
  Secondary: 'Color/Text/Secondary', Ghost: 'Color/Text/Muted', Neutral: 'Color/Text/Muted',
  Success: 'Color/Status/Success', Healthy: 'Color/Status/Success', Running: 'Color/Status/Success', On: 'Color/Status/Success', Up: 'Color/Status/Success',
  Warning: 'Color/Status/Warning', Missing: 'Color/Reasoning/Missing', Maintenance: 'Color/Status/Warning', Idle: 'Color/Status/Warning', Flat: 'Color/Text/Muted',
  Danger: 'Color/Status/Danger', Fault: 'Color/Status/Danger', Down: 'Color/Status/Danger', Contradiction: 'Color/Reasoning/Contradiction',
  Information: 'Color/Status/Information', Info: 'Color/Status/Information', Offline: 'Color/Text/Disabled',
  Evidence: 'Color/Reasoning/Evidence', Hypothesis: 'Color/Reasoning/Hypothesis',
  High: 'Color/Status/Success', Medium: 'Color/Status/Warning', Low: 'Color/Status/Danger',
  Blocked: 'Color/Status/Danger', Ready: 'Color/Status/Success', Executed: 'Color/Reasoning/Decision',
})

const ON_BRAND = [{ role: 'Label', set: { textFill: 'Color/Brand/OnBrand' } }]
const INTERACTIVE_STATES = ['Default', 'Hover', 'Focus', 'Disabled']

/** @param {string} prop @param {string[]} values */
const axis = (prop, values) => ({ prop, values })
/** @param {string} name @param {string} role */
const p = (name, role) => ({ name, role })

/** @type {any[]} */
const PRIMITIVES = [
  {
    key: 'button', name: 'Button', category: 'primitive', maps: 'src/components/ds/Button.tsx',
    preset: 'control', presetOpts: { icon: true, spinner: true, label: 'Action' },
    axes: [axis('Variant', ['Primary', 'Secondary', 'Ghost', 'Danger']), axis('State', ['Default', 'Hover', 'Focus', 'Disabled', 'Loading'])],
    valueOverrides: {
      Variant: {
        Primary: [{ role: 'root', set: { fill: 'Color/Brand/Primary', stroke: null } }, ...ON_BRAND],
        Secondary: [],
        Ghost: [{ role: 'root', set: { fill: null, stroke: null } }],
        Danger: [{ role: 'root', set: { fill: 'Color/Status/Danger', stroke: null } }, ...ON_BRAND],
      },
      State: { Hover: [{ role: 'root', set: { fill: 'Color/Brand/Hover' } }] },
    },
    text: [p('Label', 'Label')], bools: [p('ShowIcon', 'IconSlot')], swaps: [p('Icon', 'IconSlot')], dirAxis: true,
    a11y: 'Accessible name = Label; on-brand text is dark (11.0:1); focus ring 2px + halo; min target 40px.',
    description: 'Primary action control.',
  },
  {
    key: 'icon-button', name: 'IconButton', category: 'primitive', maps: 'src/components/ds/IconButton.tsx',
    preset: 'control', presetOpts: { icon: true, label: '', padX: 10, minH: 40 },
    axes: [axis('Variant', ['Primary', 'Secondary', 'Ghost']), axis('State', INTERACTIVE_STATES)],
    valueOverrides: { Variant: { Primary: [{ role: 'root', set: { fill: 'Color/Brand/Primary', stroke: null } }], Ghost: [{ role: 'root', set: { fill: null, stroke: null } }] } },
    bools: [], swaps: [p('Icon', 'IconSlot')],
    a11y: 'Icon-only: REQUIRES aria-label in code; 40px min target; focus ring 2px.',
    description: 'Icon-only action.', hideLabel: true,
  },
  {
    key: 'badge', name: 'Badge', category: 'primitive', maps: 'src/components/ds/Badge.tsx',
    preset: 'control', presetOpts: { label: 'Badge', padX: 10, padY: 4, minH: 24, radius: 9999, textStyle: 'Caption' },
    axes: [axis('Tone', ['Neutral', 'Brand', 'Success', 'Warning', 'Danger'])],
    valueOverrides: { Tone: { Brand: [{ role: 'root', set: { stroke: 'Color/Brand/Primary' } }, { role: 'Label', set: { textFill: 'Color/Brand/Primary' } }], Success: [{ role: 'Label', set: { textFill: 'Color/Status/Success' } }], Warning: [{ role: 'Label', set: { textFill: 'Color/Status/Warning' } }], Danger: [{ role: 'Label', set: { textFill: 'Color/Status/Danger' } }] } },
    text: [p('Label', 'Label')], dirAxis: false,
    a11y: 'Non-interactive; never the sole carrier of meaning — label text required.',
    description: 'Compact status/label chip.',
  },
  {
    key: 'alert', name: 'Alert', category: 'primitive', maps: 'src/components/ds/Alert.tsx',
    preset: 'listRow', presetOpts: { title: 'Alert title', meta: 'Alert message with room for long localized copy.', dismiss: true, minW: 360 },
    axes: [axis('Tone', ['Info', 'Success', 'Warning', 'Danger'])],
    text: [p('Title', 'Title'), p('Message', 'Meta')], bools: [p('Dismissible', 'Dismiss')], dirAxis: true,
    a11y: 'role=alert/status in code; icon+text meet 4.5:1 on tinted surface; dismiss target ≥40px.',
    description: 'Inline alert banner.',
  },
  {
    key: 'card', name: 'Card', category: 'primitive', maps: 'src/components/ds/Card.tsx',
    preset: 'card', presetOpts: { title: 'Card title', meta: 'Metadata', minW: 300 },
    axes: [axis('Elevation', ['E1', 'E2', 'E3'])],
    text: [p('Title', 'Title'), p('Body', 'Body')], dirAxis: true, elevationAxis: true,
    a11y: 'Surface container; heading order preserved in code; body on surface-primary ≥ 9.6:1.',
    description: 'Surface container; Elevation binds the E1–E3 effect styles.',
  },
  {
    key: 'checkbox', name: 'Checkbox', category: 'primitive', maps: 'src/components/ds/Checkbox.tsx',
    preset: 'toggle', presetOpts: { kind: 'checkbox', label: 'Option' },
    axes: [axis('Value', ['Unchecked', 'Checked', 'Indeterminate']), axis('State', INTERACTIVE_STATES)],
    valueOverrides: {
      Value: {
        Checked: [{ role: 'Knob', set: { hidden: false } }, { role: 'Mark', set: { stroke: 'Color/Brand/Primary' } }],
        Indeterminate: [{ role: 'Knob', set: { hidden: false } }, { role: 'Mark', set: { stroke: 'Color/Brand/Primary' } }],
      },
      State: { Hover: [{ role: 'Mark', set: { stroke: 'Color/Brand/Hover' } }], Focus: [{ role: 'Mark', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    text: [p('Label', 'Label')], dirAxis: true,
    a11y: 'Native checkbox semantics in code; label programmatically associated; 40px row target.',
    description: 'Boolean input.',
  },
  {
    key: 'radio', name: 'Radio', category: 'primitive', maps: 'src/components/ds/Radio.tsx',
    preset: 'toggle', presetOpts: { kind: 'radio', label: 'Choice' },
    axes: [axis('Value', ['Unselected', 'Selected']), axis('State', INTERACTIVE_STATES)],
    valueOverrides: {
      Value: { Selected: [{ role: 'Knob', set: { hidden: false } }, { role: 'Mark', set: { stroke: 'Color/Brand/Primary' } }] },
      State: { Focus: [{ role: 'Mark', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    text: [p('Label', 'Label')], dirAxis: true,
    a11y: 'Single choice within a named radiogroup; label associated; 40px row target.',
    description: 'Single-choice input.',
  },
  {
    key: 'switch', name: 'Switch', category: 'primitive', maps: 'src/components/ds/Switch.tsx',
    preset: 'toggle', presetOpts: { kind: 'switch', label: 'Enabled' },
    axes: [axis('Value', ['Off', 'On']), axis('State', INTERACTIVE_STATES)],
    valueOverrides: {
      Value: { On: [{ role: 'Mark', set: { fill: 'Color/Brand/Primary', stroke: null } }, { role: 'Knob', set: { fill: 'Color/Brand/OnBrand' } }] },
      State: { Focus: [{ role: 'Mark', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    text: [p('Label', 'Label')], dirAxis: true,
    a11y: 'role=switch with state announced; label associated; 40px row target.',
    description: 'Binary toggle.',
  },
  {
    key: 'input', name: 'Input', category: 'primitive', maps: 'src/components/ds/Input.tsx',
    preset: 'field', presetOpts: { label: 'Label', value: 'Value', hint: 'Helper text' },
    axes: [axis('State', ['Default', 'Hover', 'Focus', 'Error', 'Disabled'])],
    valueOverrides: {
      State: {
        Hover: [{ role: 'Box', set: { stroke: 'Color/Border/Active' } }],
        Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
        Error: [{ role: 'Box', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }, { role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } }],
        Disabled: [{ role: 'root', set: { opacity: 0.55 } }, { role: 'Value', set: { textFill: 'Color/Text/Disabled' } }],
      },
    },
    text: [p('Label', 'Label'), p('Value', 'Value'), p('Hint', 'Hint')], bools: [p('ShowHint', 'Hint')], dirAxis: true,
    a11y: 'Label + error programmatically associated; error uses text+color; 40px box.',
    description: 'Single-line text input.',
  },
  {
    key: 'textarea', name: 'Textarea', category: 'primitive', maps: 'src/components/ds/Textarea.tsx',
    preset: 'field', presetOpts: { label: 'Label', value: 'Multi-line value that wraps across lines to prove long-text resilience.', hint: 'Helper text', tall: true },
    axes: [axis('State', ['Default', 'Focus', 'Error', 'Disabled'])],
    valueOverrides: { State: { Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }], Error: [{ role: 'Box', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }, { role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } }], Disabled: [{ role: 'root', set: { opacity: 0.55 } }] } },
    text: [p('Label', 'Label'), p('Value', 'Value'), p('Hint', 'Hint')], dirAxis: true,
    a11y: 'Same semantics as Input; wrapping value text (fixed width, auto height).',
    description: 'Multi-line text input.',
  },
  {
    key: 'form-field', name: 'FormField', category: 'primitive', maps: 'src/components/ds/FormField.tsx',
    preset: 'field', presetOpts: { label: 'Field label', value: 'Control slot', hint: 'Hint or error' },
    axes: [axis('State', ['Default', 'Error', 'Disabled'])],
    valueOverrides: { State: { Error: [{ role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } }], Disabled: [{ role: 'root', set: { opacity: 0.55 } }] } },
    text: [p('Label', 'Label'), p('Hint', 'Hint')], dirAxis: true,
    a11y: 'Wrapper contract: label/hint/error association happens in code.',
    description: 'Label + control + hint/error wrapper.',
  },
  {
    key: 'dialog', name: 'Dialog', category: 'primitive', maps: 'src/components/ds/Dialog.tsx',
    preset: 'overlay', presetOpts: { title: 'Dialog title', actions: ['Confirm', 'Cancel'] },
    axes: [axis('Size', ['S', 'M', 'L'])],
    valueOverrides: { Size: { S: [{ role: 'root', set: { minW: 320 } }], M: [{ role: 'root', set: { minW: 420 } }], L: [{ role: 'root', set: { minW: 560 } }] } },
    text: [p('Title', 'Title'), p('Body', 'Body'), p('ConfirmLabel', 'PrimaryLabel'), p('CancelLabel', 'SecondaryLabel')], dirAxis: true, elevation: 'Elevation/E4',
    a11y: 'aria-modal + labelled title + focus trap in code; E4 elevation on glass overlay.',
    description: 'Modal dialog.',
  },
  {
    key: 'drawer', name: 'Drawer', category: 'primitive', maps: 'src/components/ds/Drawer.tsx',
    preset: 'overlay', presetOpts: { title: 'Drawer title', actions: ['Apply'] },
    axes: [axis('Side', ['Start', 'End'])],
    text: [p('Title', 'Title'), p('Body', 'Body')], dirAxis: true, elevation: 'Elevation/E3',
    a11y: 'Side is logical (Start/End) so it mirrors under RTL; focus trap in code.',
    description: 'Edge panel.',
  },
  {
    key: 'tooltip', name: 'Tooltip', category: 'primitive', maps: 'src/components/ds/Tooltip.tsx',
    preset: 'overlay', presetOpts: { title: 'Tooltip', minW: 160 },
    axes: [axis('Side', ['Top', 'Bottom', 'Start', 'End'])],
    text: [p('Content', 'Title')], dirAxis: false, elevation: 'Elevation/E2', trimBody: true,
    a11y: 'Supplementary only — never the sole source of essential info; shown on hover AND focus.',
    description: 'Transient label.',
  },
  {
    key: 'tabs', name: 'Tabs', category: 'primitive', maps: 'src/components/ds/Tabs.tsx',
    preset: 'control', presetOpts: { label: 'Tab', radius: 0, minH: 40 },
    axes: [axis('State', ['Default', 'Hover', 'Active', 'Focus', 'Disabled'])],
    valueOverrides: { State: { Active: [{ role: 'root', set: { stroke: 'Color/Border/Active', strokeW: 2 } }, { role: 'Label', set: { textFill: 'Color/Text/Primary' } }], Default: [{ role: 'Label', set: { textFill: 'Color/Text/Secondary' } }] } },
    text: [p('Label', 'Label')], dirAxis: true,
    a11y: 'Single tab item; roving tabindex + aria-selected in code; active underline + text (not color-only).',
    description: 'Tab item.',
  },
  {
    key: 'status-indicator', name: 'StatusIndicator', category: 'primitive', maps: 'src/components/ds/StatusIndicator.tsx',
    preset: 'listRow', presetOpts: { title: 'Operational', meta: false, padX: 10, padY: 4, minW: 140, fill: null, stroke: null, strokeW: 0 },
    axes: [axis('Status', ['Success', 'Warning', 'Danger', 'Information', 'Neutral'])],
    text: [p('Label', 'Title')], dirAxis: true,
    a11y: 'Dot color NEVER alone — label required; dot 10px + label ≥ Body/M.',
    description: 'Dot + label status.',
  },
  {
    key: 'technical-value', name: 'TechnicalValue', category: 'primitive', maps: 'src/components/ds/TechnicalValue.tsx',
    preset: 'tile', presetOpts: { tag: 'FLOW.PV', value: '96.2', unit: 'm³/h', meta: 'LTR numerals enforced' },
    axes: [axis('Tone', ['Default', 'Success', 'Warning', 'Danger'])],
    valueOverrides: { Tone: { Default: [{ role: 'StateDot', set: { fill: 'Color/Text/Muted' } }] } },
    text: [p('Value', 'Value'), p('Unit', 'Unit'), p('Tag', 'Tag')], dirAxis: false,
    a11y: 'Monospace measured value; numerals stay LTR even in RTL context.',
    description: 'Measured value + unit.',
  },
  {
    key: 'kpi-card', name: 'MetricCard', category: 'primitive', maps: 'src/components/ds/KpiCard.tsx',
    preset: 'card', presetOpts: { title: 'Availability', value: '99.2', unit: '%', meta: 'vs last week', minW: 260 },
    axes: [axis('Trend', ['Up', 'Down', 'Flat']), axis('State', ['Default', 'Loading', 'Error'])],
    valueOverrides: {
      Trend: { Down: [{ role: 'StateDot', set: { fill: 'Color/Status/Danger' } }] },
      State: { Loading: [{ role: 'Value', set: { textFill: 'Color/Text/Muted' } }], Error: [{ role: 'EmptyNote', set: { hidden: false, textFill: 'Color/Status/Danger' } }, { role: 'ValueRow', set: { hidden: true } }] },
    },
    text: [p('Label', 'Title'), p('Value', 'Value'), p('Unit', 'Unit')], dirAxis: true,
    a11y: 'Value carries meaning; trend color supportive only; loading/error stated in text.',
    description: 'Single-metric KPI card (renamed from KpiCard — same managed asset).',
  },
  {
    key: 'insight-card', name: 'InsightCard', category: 'primitive', maps: 'src/components/ds/InsightCard.tsx',
    preset: 'card', presetOpts: { title: 'Insight', value: '0.87', meta: 'confidence', minW: 280 },
    axes: [axis('Tone', ['Evidence', 'Hypothesis', 'Decision'])],
    text: [p('Title', 'Title'), p('Value', 'Value')], dirAxis: true,
    a11y: 'Reasoning tone mapped to the reasoning semantic layer; uncertainty stated numerically.',
    description: 'Reasoning insight card.',
  },
  {
    key: 'empty-state', name: 'EmptyState', category: 'primitive', maps: 'src/components/ds/EmptyState.tsx',
    preset: 'card', presetOpts: { title: 'Nothing here yet', body: 'Guidance copy telling the user what to do next, resilient to long FA/DE strings.', action: 'Create first item', minW: 320 },
    axes: [axis('Tone', ['Neutral', 'Brand'])],
    text: [p('Title', 'Title'), p('Description', 'Body'), p('ActionLabel', 'ActionLabel')], dirAxis: true,
    a11y: 'Always offers a next action; action is a real ≥40px target.',
    description: 'Zero-data placeholder.',
  },
  {
    key: 'error-state', name: 'ErrorState', category: 'primitive', maps: 'src/components/ds/ErrorState.tsx',
    preset: 'card', presetOpts: { title: 'Something went wrong', body: 'Recoverable error description with a retry affordance.', action: 'Retry', dotFill: 'Color/Status/Danger', minW: 320 },
    axes: [axis('Tone', ['Danger', 'Warning'])],
    text: [p('Title', 'Title'), p('Description', 'Body'), p('ActionLabel', 'ActionLabel')], dirAxis: true,
    a11y: 'Error announced via live region in code; retry is a ≥40px target.',
    description: 'Recoverable error surface.',
  },
  {
    key: 'skeleton', name: 'Skeleton', category: 'primitive', maps: 'src/components/ds/Skeleton.tsx',
    preset: 'loader', presetOpts: {},
    axes: [axis('Shape', ['Line', 'Block', 'Circle'])],
    shapeAxis: true, dirAxis: false,
    a11y: 'Decorative: aria-hidden; paired with a textual busy status in code.',
    description: 'Loading placeholder.',
  },
  {
    key: 'spinner', name: 'Spinner', category: 'primitive', maps: 'src/components/ds/Spinner.tsx',
    preset: 'loader', presetOpts: { kind: 'spinner' },
    axes: [axis('Size', ['S', 'M', 'L'])],
    sizeAxis: true, dirAxis: false,
    a11y: 'Indeterminate progress; accessible busy label in code.',
    description: 'Indeterminate progress.',
  },
]

/** @type {any[]} */
const CORE = [
  {
    key: 'link', name: 'Link', category: 'core', maps: null,
    preset: 'control', presetOpts: { label: 'Learn more', padX: 2, padY: 2, minH: 24, textStyle: 'Body/M' },
    axes: [axis('State', ['Default', 'Hover', 'Focus', 'Visited'])],
    valueOverrides: { State: { Default: [{ role: 'root', set: { fill: null, stroke: null } }, { role: 'Label', set: { textFill: 'Color/Brand/Primary' } }], Hover: [{ role: 'root', set: { fill: null } }, { role: 'Label', set: { textFill: 'Color/Brand/Hover' } }], Visited: [{ role: 'root', set: { fill: null, stroke: null } }, { role: 'Label', set: { textFill: 'Color/Brand/Pressed' } }] } },
    text: [p('Label', 'Label')], dirAxis: false,
    a11y: 'Underline on hover/focus in code; color alone insufficient.',
    description: 'Text hyperlink.',
  },
  {
    key: 'select', name: 'Select', category: 'core', maps: null,
    preset: 'field', presetOpts: { label: 'Select', value: 'Selected option', trailMark: true },
    axes: [axis('State', ['Default', 'Open', 'Focus', 'Error', 'Disabled'])],
    valueOverrides: { State: { Open: [{ role: 'Box', set: { stroke: 'Color/Border/Active' } }], Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }], Error: [{ role: 'Box', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }, { role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } }], Disabled: [{ role: 'root', set: { opacity: 0.55 } }] } },
    text: [p('Label', 'Label'), p('Value', 'Value')], dirAxis: true,
    a11y: 'Combobox semantics + listbox popover in code; chevron mirrors under RTL.',
    description: 'Single-select control.',
  },
  {
    key: 'search', name: 'Search', category: 'core', maps: null,
    preset: 'field', presetOpts: { label: 'Search', value: 'Search assets, cases, signals…', leadIcon: true },
    axes: [axis('State', ['Default', 'Focus'])],
    valueOverrides: { State: { Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] } },
    text: [p('Placeholder', 'Value')], swaps: [p('LeadIcon', 'IconSlot')], dirAxis: true,
    a11y: 'type=search with clear affordance in code; icon decorative.',
    description: 'Search input.',
  },
  {
    key: 'dropdown', name: 'Dropdown', category: 'core', maps: null,
    preset: 'overlay', presetOpts: { title: 'Menu', minW: 220 },
    axes: [axis('State', ['Closed', 'Open'])],
    valueOverrides: { State: { Closed: [{ role: 'Body', set: { hidden: true } }] } },
    text: [p('Label', 'Title')], dirAxis: true, elevation: 'Elevation/E2',
    a11y: 'Menu button + menu roles in code; E2 elevation when open.',
    description: 'Menu trigger + menu.',
  },
  {
    key: 'accordion', name: 'Accordion', category: 'core', maps: null,
    preset: 'listRow', presetOpts: { title: 'Section title', meta: 'Expanded section content that can hold long localized copy.', minW: 360 },
    axes: [axis('State', ['Collapsed', 'Expanded'])],
    valueOverrides: { State: { Collapsed: [{ role: 'Meta', set: { hidden: true } }] } },
    text: [p('Title', 'Title'), p('Content', 'Meta')], dirAxis: true,
    a11y: 'Header is a button with aria-expanded in code; 40px header target.',
    description: 'Disclosure section.',
  },
  {
    key: 'toast', name: 'Toast', category: 'core', maps: null,
    preset: 'listRow', presetOpts: { title: 'Saved', meta: 'Change stored successfully.', dismiss: true, fill: 'Color/Surface/Elevated', minW: 320 },
    axes: [axis('Tone', ['Info', 'Success', 'Warning', 'Danger'])],
    text: [p('Message', 'Meta'), p('Title', 'Title')], dirAxis: true, elevation: 'Elevation/E3',
    a11y: 'Announced via polite/assertive live region in code; E3 elevation.',
    description: 'Transient notification.',
  },
  {
    key: 'data-table', name: 'DataTable', category: 'core', maps: null,
    preset: 'table', presetOpts: {},
    axes: [axis('Density', ['Comfortable', 'Compact']), axis('State', ['Default', 'Empty', 'Loading', 'Error'])],
    valueOverrides: {
      State: {
        Empty: [{ role: 'Body', set: { hidden: true } }, { role: 'EmptyNote', set: { hidden: false } }],
        Loading: [{ role: 'Body', set: { hidden: true } }, { role: 'LoadingNote', set: { hidden: false } }],
        Error: [{ role: 'Body', set: { hidden: true } }, { role: 'ErrorNote', set: { hidden: false } }],
      },
    },
    densityAxis: true,
    text: [p('Header', 'Header')], dirAxis: true,
    a11y: 'th scope + sortable state in code; row height ≥40px comfortable / 32px compact; empty/loading/error are textual.',
    description: 'Header + rows scaffold with real empty/loading/error states.',
  },
  {
    key: 'pagination', name: 'Pagination', category: 'core', maps: null,
    preset: 'listRow', presetOpts: { title: 'Page 3 of 12', meta: false, trail: '‹ ›', minW: 220, fill: null, stroke: null, strokeW: 0 },
    axes: [axis('State', ['Default', 'FirstPage', 'LastPage'])],
    bools: [p('HasPrev', 'StateDot'), p('HasNext', 'Trail')],
    text: [p('Label', 'Title')], dirAxis: true,
    a11y: 'nav landmark + current-page announced; prev marker = lead dot, next marker = trail arrows; both ≥40px row; arrows mirror in RTL.',
    description: 'Page navigator.',
  },
  {
    key: 'breadcrumb', name: 'Breadcrumb', category: 'core', maps: null,
    preset: 'listRow', presetOpts: { title: 'Assets / Site A / PLC-104', meta: false, minW: 280, fill: null, stroke: null, strokeW: 0, padY: 4 },
    axes: [axis('State', ['Default'])],
    text: [p('Path', 'Title')], dirAxis: true,
    a11y: 'nav landmark; separators decorative and mirrored under RTL; current item aria-current.',
    description: 'Hierarchical trail.',
  },
  {
    key: 'sidebar', name: 'Sidebar', category: 'core', maps: null,
    preset: 'shell', presetOpts: { kind: 'sidebar' },
    axes: [axis('State', ['Expanded', 'Collapsed'])],
    valueOverrides: { State: { Collapsed: [{ role: 'root', set: { w: 64 } }] } }, collapseAxis: true,
    dirAxis: true,
    a11y: 'nav landmark; active item marked by fill+dot+text; 40px items; collapses to icons with tooltips in code.',
    description: 'App navigation rail.',
  },
  {
    key: 'top-nav', name: 'TopNavigation', category: 'core', maps: null,
    preset: 'shell', presetOpts: {},
    axes: [axis('State', ['Default'])],
    text: [p('UserName', 'UserName')], swaps: [p('SearchIcon', 'SearchSlot')], dirAxis: true,
    a11y: 'banner landmark; brand → home; user chip ≥40px target.',
    description: 'Top application bar (renamed from TopNav — same managed asset).',
  },
  {
    key: 'language-selector', name: 'LanguageSelector', category: 'core', maps: null,
    preset: 'control', presetOpts: { label: 'FA · EN · DE', padX: 12, minH: 36, textStyle: 'Body/S' },
    axes: [axis('Locale', ['FA', 'EN', 'DE']), axis('State', ['Default', 'Open'])],
    valueOverrides: {
      Locale: { FA: [{ role: 'Label', set: { text: 'فارسی' } }], EN: [{ role: 'Label', set: { text: 'English' } }], DE: [{ role: 'Label', set: { text: 'Deutsch' } }] },
      State: { Open: [{ role: 'root', set: { stroke: 'Color/Border/Active' } }] },
    },
    dirAxis: true,
    a11y: 'Current locale announced; FA switches document dir to RTL.',
    description: 'Locale switcher.',
  },
  {
    key: 'user-menu', name: 'UserMenu', category: 'core', maps: null,
    preset: 'overlay', presetOpts: { title: 'user@hermesnovin.com', minW: 260, actions: ['Sign out'] },
    axes: [axis('State', ['Closed', 'Open'])],
    valueOverrides: { State: { Closed: [{ role: 'Body', set: { hidden: true } }, { role: 'ActionRow', set: { hidden: true } }] } },
    text: [p('Name', 'Title')], dirAxis: true, elevation: 'Elevation/E2',
    a11y: 'Menu semantics; trigger ≥40px; focus returns to trigger on close (code).',
    description: 'Account menu.',
  },
]

/** @type {any[]} */
const INDUSTRIAL = [
  {
    key: 'industrial-signal-tile', name: 'IndustrialSignalTile', category: 'industrial', maps: null,
    preset: 'tile', presetOpts: {},
    axes: [axis('Status', ['Healthy', 'Warning', 'Fault', 'Offline'])],
    valueOverrides: { Status: { Offline: [{ role: 'ValueRow', set: { hidden: true } }, { role: 'EmptyNote', set: { hidden: false } }] } },
    text: [p('Tag', 'Tag'), p('Value', 'Value'), p('Unit', 'Unit')], dirAxis: false,
    a11y: 'Status is textual (tag+meta), color supportive; numerals LTR; Offline shows an explicit no-data note.',
    description: 'Live signal tile.',
  },
  {
    key: 'fault-hypothesis-card', name: 'FaultHypothesisCard', category: 'industrial', maps: null,
    preset: 'card', presetOpts: { title: 'Bearing wear on drive end', body: 'Hypothesis derived from vibration + temperature correlation.', meta: 'Confidence stated explicitly', dotFill: 'Color/Reasoning/Hypothesis', minW: 320 },
    axes: [axis('Confidence', ['High', 'Medium', 'Low'])],
    text: [p('Hypothesis', 'Title'), p('Rationale', 'Body')], dirAxis: true,
    a11y: 'Model inference clearly separated from evidence; confidence is text + tone.',
    description: 'Diagnostic hypothesis.',
  },
  {
    key: 'evidence-item', name: 'EvidenceItem', category: 'industrial', maps: null,
    preset: 'listRow', presetOpts: { title: 'Vibration RMS 4.2 mm/s', meta: 'Sensor VIB-3 · 12:04:31', trail: '№', minW: 340 },
    axes: [axis('Kind', ['Evidence', 'Contradiction', 'Missing'])],
    valueOverrides: { Kind: { Missing: [{ role: 'root', set: { stroke: 'Color/Reasoning/Missing' } }] } },
    text: [p('Label', 'Title'), p('Source', 'Meta')], dirAxis: true,
    a11y: 'Kind is textual; Missing pairs color with a distinct border treatment (dashed in code).',
    description: 'Single evidence row.',
  },
  {
    key: 'confidence-indicator', name: 'ConfidenceIndicator', category: 'industrial', maps: null,
    preset: 'card', presetOpts: { title: 'Confidence', value: '0.87', minW: 200 },
    axes: [axis('Level', ['High', 'Medium', 'Low'])],
    text: [p('Label', 'Title'), p('Value', 'Value')], dirAxis: true,
    a11y: 'Numeric confidence ALWAYS stated; level color is supportive.',
    description: 'Explicit uncertainty indicator.',
  },
  {
    key: 'safe-action-panel', name: 'SafeActionPanel', category: 'industrial', maps: null,
    preset: 'card', presetOpts: { title: 'Reduce line speed to 60%', body: 'Interlock verified. Human approval required before execution.', action: 'Approve action', minW: 340 },
    axes: [axis('State', ['Ready', 'Blocked', 'Executed'])],
    valueOverrides: { State: { Blocked: [{ role: 'Action', set: { fill: 'Color/Surface/Interactive' } }, { role: 'ActionLabel', set: { textFill: 'Color/Text/Disabled' } }], Executed: [{ role: 'ActionLabel', set: { text: 'Executed' } }] } },
    text: [p('Action', 'Title'), p('Detail', 'Body'), p('ButtonLabel', 'ActionLabel')], dirAxis: true,
    a11y: 'Blocked disables execution (visual + semantic); decision is human, recorded.',
    description: 'Human-decision safe-action panel.',
  },
  {
    key: 'timeline', name: 'TimelineEventRow', category: 'industrial', maps: null,
    preset: 'listRow', presetOpts: { title: 'Alarm acknowledged', meta: '2026-07-30 11:42:03 · operator A', trail: '11:42', minW: 360 },
    axes: [axis('State', ['Default', 'Empty'])],
    valueOverrides: { State: { Empty: [{ role: 'Content', set: { hidden: true } }, { role: 'Trail', set: { hidden: true } }] } },
    text: [p('Label', 'Title'), p('Timestamp', 'Meta')], dirAxis: true,
    a11y: 'Timestamp monospace LTR; marker decorative; row ≥40px (renamed from Timeline — same managed asset).',
    description: 'Event timeline row.',
  },
  {
    key: 'asset-status-block', name: 'AssetStatusBlock', category: 'industrial', maps: null,
    preset: 'card', presetOpts: { title: 'Compressor C-201', meta: 'Site A · Line 2', minW: 280 },
    axes: [axis('Status', ['Running', 'Idle', 'Down', 'Maintenance'])],
    text: [p('Asset', 'Title')], dirAxis: true,
    a11y: 'Status labelled and colour-supported; block links to asset detail in code.',
    description: 'Asset health summary.',
  },
]

/** Icon utility family (INSTANCE_SWAP targets). Geometric marks only — honest, font-free. */
const ICON = {
  key: 'icon', name: 'Icon', category: 'core', maps: null,
  preset: 'iconMark', presetOpts: {},
  axes: [axis('Mark', ['Dot', 'Ring', 'Square', 'Bar', 'Diamond'])],
  markAxis: true, dirAxis: false,
  a11y: 'Decorative geometric marks; meaning always carried by adjacent text.',
  description: 'Geometric icon marks used by instance-swap slots.',
}

/** @type {any[]} */
const FAMILIES = [...PRIMITIVES, ...CORE, ICON, ...INDUSTRIAL]

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

module.exports = { PRIMITIVES, CORE, INDUSTRIAL, ICON, FAMILIES, TONE_TOKEN, variantCombos, totalVariants }

  };
  __modules["locale-strings"] = function (module, exports, require) {
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

  };
  __modules["validate"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * PURE fail-closed validators for the text pipeline and orphan adoption.
 *
 * Added after run-ms7vkx9n-1 ("Applied with issues"): the tri-lingual rewrite
 * changed assembly headings to pre-localized strings, but the renderer still
 * read `heading.fa/.en` — assigning `undefined` to TextNode.characters, which
 * Figma rejects (`set_characters: Required value missing`). The throw happened
 * BEFORE the assembly was tagged, leaving 36 partially-built, unmanaged frames.
 *
 * validateAssemblyText() re-derives EVERY string that will ever reach
 * `characters` or `setProperties` for the 36 assemblies and rejects anything
 * that is not a non-empty, non-whitespace JavaScript string — with full
 * context (assembly key, experience, locale, viewport, text role, source
 * catalog key). The executor calls it BEFORE generating a runId or invoking
 * any Figma mutation API; Dry Run surfaces the same result.
 */

const { STRINGS } = require('locale-strings')

/**
 * Reverse map: exact string value per locale → source catalog key (for error
 * context). Values are distinct in practice; collisions keep the first key.
 * @returns {Record<string, Record<string, string>>} locale → value → catalog key
 */
function buildReverseCatalog() {
  /** @type {Record<string, Record<string, string>>} */
  const rev = { en: {}, fa: {}, de: {} }
  for (const id of Object.keys(STRINGS)) {
    const s = STRINGS[id]
    for (const l of ['en', 'fa', 'de']) {
      if (rev[l][s[l]] === undefined) rev[l][s[l]] = s.key
    }
  }
  return rev
}

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
 * Validate every text value of every assembly in the spec.
 * @param {{ assemblies: any[] }} spec
 * @returns {{ ok: boolean, issues: {assemblyKey:string, experience:string, locale:string, viewport:string, role:string, catalogKey:string, problem:string, value:unknown}[] }}
 */
function validateAssemblyText(spec) {
  const rev = buildReverseCatalog()
  /** @type {any[]} */
  const issues = []

  // STRINGS integrity first (missing locale keys / unresolved values)
  for (const id of Object.keys(STRINGS)) {
    const s = STRINGS[id]
    for (const l of ['en', 'fa', 'de']) {
      const p = textProblem(s[l])
      if (p) issues.push({ assemblyKey: '(catalog)', experience: '-', locale: l, viewport: '-', role: id, catalogKey: s.key, problem: 'catalog value ' + p, value: s[l] })
    }
  }

  for (const asm of spec.assemblies || []) {
    /** @param {any} item */
    const walk = (item) => {
      if (item.row) { item.row.forEach(walk); return }
      if ('heading' in item) {
        const p = textProblem(item.heading)
        if (p) {
          issues.push({
            assemblyKey: asm.key, experience: asm.experience, locale: asm.locale,
            viewport: asm.context, role: 'Heading(' + (item.style || 'Heading/L') + ')',
            catalogKey: typeof item.heading === 'string' ? (rev[asm.locale] && rev[asm.locale][item.heading]) || 'composed/literal' : 'unresolved',
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
            assemblyKey: asm.key, experience: asm.experience, locale: asm.locale,
            viewport: asm.context, role: item.family + '.' + propName,
            catalogKey: typeof v === 'string' ? (rev[asm.locale] && rev[asm.locale][v]) || 'literal' : 'unresolved',
            problem: p, value: v,
          })
        }
      }
    }
    for (const item of asm.items || []) walk(item)
  }

  return { ok: issues.length === 0, issues }
}

/**
 * Structured error for a defensive characters assignment.
 * @param {unknown} value @param {{assemblyKey?:string, role?:string, locale?:string}} ctx
 */
function charactersError(value, ctx) {
  const c = ctx || {}
  return new Error(
    'set_characters blocked: value is ' + (textProblem(value) || 'invalid') +
    ' [assembly=' + (c.assemblyKey || '-') + ' role=' + (c.role || '-') + ' locale=' + (c.locale || '-') + ']'
  )
}

/**
 * Orphan adoption picker (repairs run-ms7vkx9n-1 debris IN PLACE, preserving
 * node ids). Given the direct children of the managed assemblies section,
 * select the single unmanaged FRAME whose name exactly matches the assembly
 * name. ≥2 matches = ambiguity (fail closed). Managed frames never match.
 * @param {{id:string, name:string, type:string, managed:boolean}[]} children
 * @param {string} wantedName
 * @returns {{ id: string|null, ambiguous: string[] }}
 */
function pickAdoptable(children, wantedName) {
  const matches = (children || []).filter((c) => c && c.type === 'FRAME' && !c.managed && c.name === wantedName)
  if (matches.length > 1) return { id: null, ambiguous: matches.map((m) => m.id).sort() }
  return { id: matches.length === 1 ? matches[0].id : null, ambiguous: [] }
}

module.exports = { validateAssemblyText, textProblem, charactersError, pickAdoptable, buildReverseCatalog }

  };
  __modules["assemblies"] = function (module, exports, require) {
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

const { STRINGS, LOCALES, RTL_LOCALES, str } = require('locale-strings')

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

  };
  __modules["starter"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Figma STARTER (free) plan capability gating.
 *
 * Every classification below is grounded in official Figma documentation
 * (verified 2026-07-30). The plugin creates ONLY what is genuinely supported on
 * Starter and records everything else honestly as
 * DEFERRED_REQUIRES_FIGMA_PROFESSIONAL — it never fakes a plan-gated feature.
 *
 * Sources:
 *  - Variables available on any plan:
 *    https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
 *  - Modes gated to paid plans (Starter effectively 1 mode; addMode throws):
 *    https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables
 *    https://developers.figma.com/docs/plugins/api/VariableCollection/ ("Limited to N modes only")
 *  - Create components & styles on free Starter (publish is the paid gate):
 *    https://help.figma.com/hc/en-us/articles/360025508373-Publish-a-library
 *  - Team libraries are paid-only / Starter "No team libraries":
 *    https://help.figma.com/hc/en-us/articles/13838684089751-Starter-plan-overview
 *  - No network via manifest allowedDomains ["none"]:
 *    https://developers.figma.com/docs/plugins/making-network-requests/
 */

const DEFERRED_CODE = 'DEFERRED_REQUIRES_FIGMA_PROFESSIONAL'

/** Native LOCAL capabilities this plugin uses that ARE supported on Starter. */
const STARTER_SUPPORTED = [
  { capability: 'Local variables & variable collections', note: 'createVariableCollection / createVariable — "Available on any plan".' },
  { capability: 'Local Paint / Text / Effect styles', note: 'createPaintStyle / createTextStyle / createEffectStyle — creatable on free Starter.' },
  { capability: 'Components, Component Sets & Variants', note: 'You can create components on the free Starter plan.' },
  { capability: 'Component Properties (BOOLEAN / TEXT / INSTANCE_SWAP / VARIANT)', note: 'Core component feature; no plan gate on creation.' },
  { capability: 'Auto Layout', note: 'Ungated core editing feature.' },
  { capability: 'Variable → Paint style binding', note: 'setBoundVariableForPaint — local binding, no plan gate.' },
  { capability: 'Component descriptions & mapping to token-contract.ts', note: 'Stored locally on each asset.' },
  { capability: 'Single default variable mode ("Value")', note: 'Every collection always has its one default mode on Starter.' },
]

/** Plan-gated capabilities we deliberately DO NOT attempt on Starter. */
const STARTER_DEFERRED = [
  {
    capability: 'Multiple variable modes (e.g. light/dark theme, per-locale FA/EN/DE modes)',
    code: DEFERRED_CODE,
    reason: 'Starter is limited to one mode per collection; collection.addMode() throws "Limited to 1 modes only".',
    source: 'https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables',
  },
  {
    capability: 'Publishing variables/styles/components as a shared Team Library',
    code: DEFERRED_CODE,
    reason: 'Libraries are only available on paid plans; Starter has "No team libraries".',
    source: 'https://help.figma.com/hc/en-us/articles/360025508373-Publish-a-library',
  },
]

/**
 * Not a plan-tier gate but an orthogonal hard requirement: the user running the
 * plugin must have EDIT access to the file. A "View"/viewer seat cannot run a
 * write plugin even on a paid plan. Surfaced so the report never overstates.
 */
const FILE_EDIT_REQUIREMENT = {
  requirement: 'The Figma Desktop session must be signed in as a user with "can edit" access to the file.',
  reason: 'A viewer ("can view") seat cannot run a write plugin, independent of plan tier.',
  source: 'https://help.figma.com/hc/en-us/articles/35361119554711-File-and-project-permissions',
}

/**
 * The mode strategy the plugin uses on Starter: a single default mode.
 * @returns {{ modeName: string, multiMode: false, deferred: string }}
 */
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
 * bind them). No `figma` here — this is the single source the Dry Run reports
 * and the Apply executor consumes.
 */

const { COLLECTIONS, KIND, REVISIONS, SECTION2_NAME } = require('constants')
const { COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SHADOW_TOKENS, TEXT_STYLES } = require('tokens')
const { FAMILIES, variantCombos } = require('components')
const { buildAssemblies } = require('assemblies')
const { modeStrategy } = require('starter')
const { slug, hashAsset } = require('util')

const MODE = modeStrategy().modeName // 'Value'

/** Variable scopes per collection group (all members of the Figma VariableScope union). */
const SCOPES = Object.freeze({
  color: ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR'],
  spacing: ['GAP', 'WIDTH_HEIGHT'],
  radius: ['CORNER_RADIUS'],
  sizing: ['WIDTH_HEIGHT', 'STROKE_FLOAT'],
})

/**
 * @param {string} figmaName
 * @param {string} usage
 * @param {string} cssVar
 * @param {string|null} [tailwind]
 * @param {string} [a11y]
 * @returns {string}
 */
function variableDescription(figmaName, usage, cssVar, tailwind, a11y) {
  const bits = [usage, 'css: ' + cssVar]
  if (tailwind) bits.push('tw: ' + tailwind)
  if (a11y) bits.push('a11y: ' + a11y)
  bits.push('Managed by Hermes Design System Builder — maps to token-contract.ts')
  return bits.join(' · ')
}

/**
 * @param {{component:number, textStyle:number, assembly?:number}} [revisions]
 * @returns {{
 *   collections: any[], variables: any[], paintStyles: any[], textStyles: any[],
 *   effectStyles: any[], families: any[], assemblies: any[], section: any,
 *   section2: any, assets: any[], counts: Record<string, number>
 * }}
 */
function buildSpec(revisions) {
  const rev = revisions || REVISIONS
  /** @type {any[]} */
  const collections = []
  /** @type {any[]} */
  const variables = []
  /** @type {any[]} */
  const paintStyles = []

  // ── Collections ──────────────────────────────────────────────────────────
  const colColors = { key: 'collection:' + slug(COLLECTIONS.COLORS), kind: KIND.COLLECTION, name: COLLECTIONS.COLORS, resolvedType: 'COLOR', modeName: MODE }
  const colSpacing = { key: 'collection:' + slug(COLLECTIONS.SPACING), kind: KIND.COLLECTION, name: COLLECTIONS.SPACING, resolvedType: 'FLOAT', modeName: MODE }
  const colRadius = { key: 'collection:' + slug(COLLECTIONS.RADIUS), kind: KIND.COLLECTION, name: COLLECTIONS.RADIUS, resolvedType: 'FLOAT', modeName: MODE }
  const colSizing = { key: 'collection:' + slug(COLLECTIONS.SIZING), kind: KIND.COLLECTION, name: COLLECTIONS.SIZING, resolvedType: 'FLOAT', modeName: MODE }
  collections.push(colColors, colSpacing, colRadius, colSizing)

  // ── Color variables + a bound paint style per color ──────────────────────
  for (const t of COLOR_TOKENS) {
    const vkey = 'variable:' + slug(COLLECTIONS.COLORS) + ':' + t.figma
    variables.push({
      key: vkey, kind: KIND.VARIABLE, name: t.figma, collectionKey: colColors.key,
      resolvedType: 'COLOR', value: t.value, scopes: SCOPES.color,
      cssVar: t.cssVar, tailwind: t.tailwind, a11y: t.a11y || null, group: t.group,
      description: variableDescription(t.figma, t.usage, t.cssVar, t.tailwind, t.a11y),
    })
    paintStyles.push({
      key: 'paintStyle:' + t.figma, kind: KIND.PAINT_STYLE, name: t.figma,
      variableKey: vkey, value: t.value,
      description: variableDescription(t.figma, t.usage, t.cssVar, t.tailwind, t.a11y),
    })
  }

  // ── Float variables (spacing / radius / sizing) ──────────────────────────
  /** @param {any} col @param {readonly any[]} toks @param {string[]} scopes @param {string} prefix */
  const addFloats = (col, toks, scopes, prefix) => {
    for (const t of toks) {
      variables.push({
        key: 'variable:' + slug(col.name) + ':' + t.figma, kind: KIND.VARIABLE,
        name: prefix + '/' + t.figma, collectionKey: col.key, resolvedType: 'FLOAT',
        floatValue: t.value, scopes, cssVar: t.cssVar, tailwind: null, a11y: null, group: prefix.toLowerCase(),
        description: variableDescription(prefix + '/' + t.figma, t.usage, t.cssVar, null),
      })
    }
  }
  addFloats(colSpacing, SPACE_TOKENS, SCOPES.spacing, 'Space')
  addFloats(colRadius, RADIUS_TOKENS, SCOPES.radius, 'Radius')
  addFloats(colSizing, SIZE_TOKENS, SCOPES.sizing, 'Size')

  // ── Text styles ──────────────────────────────────────────────────────────
  const textStyles = TEXT_STYLES.map((t) => ({
    key: 'textStyle:' + t.name, kind: KIND.TEXT_STYLE, name: t.name,
    font: t.font, weight: t.weight, size: t.size, line: t.line, tracking: t.tracking,
    rev: rev.textStyle,
    description: t.usage + ' · Managed by Hermes Design System Builder',
  }))

  // ── Effect styles ────────────────────────────────────────────────────────
  const effectStyles = SHADOW_TOKENS.map((s) => ({
    key: 'effectStyle:' + s.name, kind: KIND.EFFECT_STYLE, name: s.name,
    offset: s.offset, radius: s.radius, spread: s.spread, color: s.color,
    description: s.usage + ' · css: ' + s.cssVar + ' · Managed by Hermes Design System Builder',
  }))

  // ── Component families (one component SET each) ──────────────────────────
  // ── Component families: the FULL blueprint contract is in the hash payload,
  // so any anatomy/state/prop/axis change rolls out as a deterministic update.
  const families = FAMILIES.map((f) => ({
    key: 'componentSet:' + f.key, kind: KIND.COMPONENT_SET, name: f.name,
    category: f.category, maps: f.maps,
    preset: f.preset, presetOpts: f.presetOpts || {},
    axes: f.axes, dirAxis: !!f.dirAxis,
    valueOverrides: f.valueOverrides || {},
    text: f.text || [], bools: f.bools || [], swaps: f.swaps || [],
    elevationAxis: !!f.elevationAxis, elevation: f.elevation || null,
    hideLabel: !!f.hideLabel, sizeAxis: !!f.sizeAxis, shapeAxis: !!f.shapeAxis,
    markAxis: !!f.markAxis, densityAxis: !!f.densityAxis, collapseAxis: !!f.collapseAxis,
    trimBody: !!f.trimBody,
    a11y: f.a11y,
    description: f.description + ' Labels/descriptions localize FA·EN·DE at runtime (next-intl); the tri-lingual reference assemblies carry the per-locale strings.',
    variantCount: variantCombos(f).length,
    rev: rev.component,
  }))

  // ── Native reference assemblies (second managed section) ─────────────────
  const assemblies = buildAssemblies().map((a) => ({
    ...a, kind: KIND.ASSEMBLY, rev: rev.assembly ?? 1,
  }))

  const section = { key: 'section:generated', kind: KIND.SECTION, name: require('constants').SECTION_NAME }
  const section2 = { key: 'section:assemblies', kind: KIND.SECTION, name: SECTION2_NAME }

  // ── Flatten in canonical apply order + attach content hashes ─────────────
  /** @type {any[]} */
  const assets = [section, section2, ...collections, ...variables, ...paintStyles, ...textStyles, ...effectStyles, ...families, ...assemblies]
  for (const a of assets) a.hash = hashAsset(hashPayload(a))

  const componentCount = families.reduce((n, f) => n + f.variantCount, 0)
  const counts = {
    collections: collections.length,
    variables: variables.length,
    paintStyles: paintStyles.length,
    textStyles: textStyles.length,
    effectStyles: effectStyles.length,
    families: families.length,
    components: componentCount,
    assemblies: assemblies.length,
    sections: 2,
    total: assets.length,
  }

  return { collections, variables, paintStyles, textStyles, effectStyles, families, assemblies, section, section2, assets, counts }
}

/**
 * The subset of an asset that defines its VISUAL/STRUCTURAL identity for hashing
 * (excludes the derived `hash`/`key` fields themselves).
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
 * computePlan() — the deterministic, idempotent planner. Given the spec and the
 * index of assets a previous run recorded in the manifest node, it decides for
 * each asset: CREATE (new), UPDATE (spec hash changed) or SKIP (unchanged), and
 * flags PRUNE candidates (recorded before but no longer in the spec).
 *
 * Pure — no `figma`. This is exactly what Dry Run reports; Apply then executes
 * the same ops against the file. Running twice with no spec change yields an
 * all-SKIP plan (nothing is ever duplicated).
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

  /** @type {any[]} — assets recorded before but no longer declared. */
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
  return lines.join('\n')
}

/**
 * Pure model of rollback scoping: given an index of managed assets carrying the
 * run that FIRST created each one, return the assetKeys a rollback would remove.
 * `runId` null/undefined = "all managed". Mirrors the executor's inScope marker
 * predicate, so run-isolation across plugin revisions can be proven in tests:
 * a pure "upgrade" run (which only UPDATES existing assets, preserving their
 * origin runId) creates nothing new, so rollback(upgradeRunId) removes nothing.
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
 * assetKey (duplicate markers — e.g. a user duplicated a managed node). Apply
 * must FAIL CLOSED on any ambiguity instead of guessing which node to update.
 * Pure: takes [{assetKey, id, kind}] observations in scan order.
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

module.exports = { computePlan, renderPlanText, runScope, detectAmbiguity }

  };
  __modules["figma-exec"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Figma executor — the ONLY module that touches the `figma` global. Implements
 * Dry Run, Apply, Verify and Rollback for the FINAL production-fidelity
 * revision: full component anatomy/states/properties, native reference
 * assemblies, fail-closed safety gates.
 *
 * Safety invariants:
 *  - Every created asset is tagged in the `hermesDSB` shared-plugin-data
 *    namespace (assetKey + kind + content hash + FIRST-creation runId).
 *  - Idempotency + rollback key off a LIVE marker scan; a rerun never
 *    duplicates; rollback removes ONLY plugin-created assets; the 34 unmanaged
 *    reference frames are never read-for-mutation and never deleted.
 *  - FAIL CLOSED before any mutation on (a) ambiguous ownership (duplicate
 *    assetKey markers) and (b) missing canonical fonts without an explicit,
 *    documented owner opt-in to fallback.
 *  - Interrupted Apply recovery = RERUN: per-asset hashes converge (documented
 *    transactional limitation: no snapshot restore of pre-update content).
 */

const C = require('constants')
const { buildSpec } = require('spec')
const { computePlan, detectAmbiguity } = require('plan')
const { parseColor, FONTS, WEIGHT_ALIASES, assessFontAvailability } = require('tokens')
const { TONE_TOKEN } = require('components')
const { PRESETS, STATE_PRESETS } = require('presets')
const { validateAssemblyText, textProblem, charactersError, pickAdoptable } = require('validate')

/**
 * DEFENSIVE characters assignment. Never assigns unless the value is a real
 * string; never stringifies undefined/null; never substitutes placeholders —
 * throws a structured error carrying the full text context instead.
 * Empty strings are allowed ONLY when a blueprint explicitly declares them
 * (e.g. IconButton's hidden label) via opts.allowEmpty.
 * @param {any} node TEXT node
 * @param {unknown} value
 * @param {{assemblyKey?:string, role?:string, locale?:string}} ctxInfo
 * @param {{allowEmpty?:boolean}} [opts]
 */
function setChars(node, value, ctxInfo, opts) {
  const p = textProblem(value)
  if (p && !(opts && opts.allowEmpty && (p === 'empty string' || p === 'whitespace-only string'))) {
    throw charactersError(value, ctxInfo)
  }
  node.characters = /** @type {string} */ (value)
}

const NS = C.NAMESPACE
const K = C.KEYS

// ── shared-plugin-data tagging ─────────────────────────────────────────────
/**
 * Tag an asset as managed. RUN_ID records the run that FIRST created the asset
 * and is preserved across reruns/updates, so a runId-filtered rollback removes
 * exactly the assets that run created.
 * @param {any} obj @param {{assetKey:string, kind:string, hash:string, runId:string}} t
 */
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

// ── LIVE index (source of truth) + ambiguity observations ──────────────────
async function buildLiveIndex() {
  /** @type {Record<string, {id:string, hash:string, kind:string, runId:string}>} */
  const index = {}
  const paint = {}
  const text = {}
  const effect = {}
  const variables = {}
  const collections = {}
  const componentSets = {}
  const assemblies = {}
  /** @type {{assetKey:string, id:string, kind:string}[]} */
  const observations = []
  let section = null
  let section2 = null

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

  for (const child of figma.currentPage.children) {
    if (isManaged(child)) {
      const t = readTag(child)
      if (t.kind === C.KIND.SECTION) {
        observations.push({ assetKey: t.assetKey, id: child.id, kind: t.kind })
        index[t.assetKey] = { id: child.id, hash: t.hash, kind: t.kind, runId: t.runId }
        if (t.assetKey === 'section:assemblies') section2 = child
        else section = child
      } else {
        note(child, t.kind === C.KIND.COMPONENT_SET ? componentSets : t.kind === C.KIND.ASSEMBLY ? assemblies : null)
      }
    }
    if (child.type === 'SECTION') {
      for (const sub of /** @type {any} */ (child).children || []) {
        if (!isManaged(sub)) continue
        const t = readTag(sub)
        note(sub, t.kind === C.KIND.COMPONENT_SET ? componentSets : t.kind === C.KIND.ASSEMBLY ? assemblies : null)
      }
    }
  }
  return { index, observations, styles: { paint, text, effect }, variables, collections, componentSets, assemblies, section, section2 }
}

// ── font resolution (aliases → downgrade → fallback; gate is separate) ─────
async function resolveFonts(textStyleSpecs) {
  const available = await figma.listAvailableFontsAsync()
  const has = new Set(available.map((f) => f.fontName.family + ' ' + f.fontName.style))
  const substitutions = []
  const aliases = []
  /** @type {Record<string, {family:string, style:string}>} */
  const cache = {}

  /** @param {string} family @param {string} weight */
  const tryLoad = async (family, weight) => {
    for (const style of WEIGHT_ALIASES[weight] || [weight]) {
      if (!has.has(family + ' ' + style)) continue
      try { await figma.loadFontAsync({ family, style }); return style } catch (_e) { /* next alias */ }
    }
    return null
  }

  for (const t of textStyleSpecs) {
    const desired = FONTS[t.font]
    const key = t.font + '|' + t.weight
    if (cache[key]) continue
    let style = await tryLoad(desired.family, t.weight)
    if (style) {
      if (style !== t.weight) aliases.push(desired.family + ' ' + t.weight + ' ≈ ' + desired.family + ' ' + style)
      cache[key] = { family: desired.family, style }
      continue
    }
    if (t.weight !== 'Regular') {
      const reg = await tryLoad(desired.family, 'Regular')
      if (reg) { substitutions.push(desired.family + ' ' + t.weight + ' → ' + desired.family + ' ' + reg); cache[key] = { family: desired.family, style: reg }; continue }
    }
    const fb = desired.fallback
    let fbStyle = (await tryLoad(fb, t.weight)) || (await tryLoad(fb, 'Regular'))
    if (!fbStyle) { fbStyle = 'Regular'; try { await figma.loadFontAsync({ family: fb, style: 'Regular' }) } catch (_e) { /* Inter preloaded */ } }
    substitutions.push(desired.family + ' ' + t.weight + ' → ' + fb + ' ' + fbStyle)
    cache[key] = { family: fb, style: fbStyle }
  }
  return {
    resolve: (role, weight) => cache[role + '|' + weight] || cache[role + '|Regular'] || { family: 'Inter', style: 'Regular' },
    substitutions,
    aliases,
    availableSet: has,
  }
}

// ── paint helper ───────────────────────────────────────────────────────────
/** @param {string} value */
function solidPaint(value) {
  const c = parseColor(value)
  const p = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b } }
  if (c.a < 1) /** @type {any} */ (p).opacity = c.a
  return p
}

// ── foundation upserts (unchanged semantics from rev1) ─────────────────────
function upsertCollection(specEntry, live, meta) {
  let col = live.collections[specEntry.key]
  if (!col) { col = figma.variables.createVariableCollection(specEntry.name); live.collections[specEntry.key] = col }
  else if (col.name !== specEntry.name) col.name = specEntry.name
  try { if (col.modes[0] && col.modes[0].name !== specEntry.modeName) col.renameMode(col.defaultModeId, specEntry.modeName) } catch (_e) { /* best-effort */ }
  tag(col, { assetKey: specEntry.key, kind: C.KIND.COLLECTION, hash: specEntry.hash, runId: meta.runId })
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
  es.effects = [{ type: 'DROP_SHADOW', color: { r: e.color[0], g: e.color[1], b: e.color[2], a: e.color[3] }, offset: { x: e.offset.x, y: e.offset.y }, radius: e.radius, spread: e.spread, visible: true, blendMode: 'NORMAL' }]
  tag(es, { assetKey: e.key, kind: C.KIND.EFFECT_STYLE, hash: e.hash, runId })
  return es
}

// ── sections ───────────────────────────────────────────────────────────────
/** @param {any} sectionSpec @param {any} live @param {'section'|'section2'} slot @param {string} runId @param {{x:number,y:number,w:number,h:number}} box */
function ensureSectionSlot(sectionSpec, live, slot, runId, box) {
  let section = live[slot]
  if (!section) {
    const sec = /** @type {any} */ (figma.createSection())
    let maxX = 0
    for (const ch of figma.currentPage.children) maxX = Math.max(maxX, ch.x + ch.width)
    sec.x = box.x ?? maxX + 400
    sec.y = box.y
    try { sec.resizeWithoutConstraints(box.w, box.h) } catch (_e) { try { sec.resize(box.w, box.h) } catch (_e2) { /* ignore */ } }
    section = sec
    live[slot] = sec
  }
  section.name = sectionSpec.name
  tag(section, { assetKey: sectionSpec.key, kind: C.KIND.SECTION, hash: sectionSpec.hash, runId })
  return section
}

// ── blueprint renderer ─────────────────────────────────────────────────────
/**
 * Render a NodeSpec tree into Figma nodes. Returns { node, roles } where roles
 * maps role → created node (for overrides + property bindings).
 * @param {any} spec @param {any} ctx { fonts, paintByToken, iconDefault }
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
      // blueprints may declare a deliberately-empty label (IconButton); anything
      // undefined/null/non-string still fails closed with full context.
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
      if (ctx.iconDefault) {
        try { node = ctx.iconDefault.createInstance() } catch (_e) { node = null }
      }
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

    // paints via bound styles (fall back to raw token value)
    const styleFor = (tok) => (tok ? ctx.paintByToken[tok] : null)
    if (s.fill !== undefined && s.type !== 'iconSlot') {
      if (s.fill === null) node.fills = []
      else {
        const st = styleFor(s.fill)
        if (st) { try { await node.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } }
      }
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
    if (s.hidden) node.visible = false

    for (const c of s.children || []) await build(c, node)

    // sizing AFTER children/parenting (FILL requires an auto-layout parent)
    if (parent && s.grow === 'fill') { try { node.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ } }
    if (s.minH != null) { try { node.minHeight = s.minH } catch (_e) { /* ignore */ } }
    if (s.minW != null) { try { node.minWidth = s.minW } catch (_e) { /* ignore */ } }
    if (s.type === 'frame' && (s.w != null || s.h != null)) {
      // explicit dimensions on a frame: pin the sized axis to FIXED, then resize both.
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

/**
 * Apply one override list ({role, set:{...}}) to rendered roles.
 * @param {Record<string, any>} roles @param {any[]} overrides @param {any} ctx
 */
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

/** Mirror a rendered tree for RTL: reverse every horizontal frame's children + right-align text. @param {any} node */
function mirrorRtl(node) {
  if (node.type === 'FRAME' || node.type === 'COMPONENT') {
    if (node.layoutMode === 'HORIZONTAL') {
      const kids = [...node.children]
      for (let i = kids.length - 1; i >= 0; i--) node.appendChild(kids[i])
    }
  }
  if (node.type === 'TEXT') { try { node.textAlignHorizontal = 'RIGHT' } catch (_e) { /* ignore */ } }
  for (const c of node.children || []) mirrorRtl(c)
}

/** presetOpts derived from a variant combo (size/shape/mark/density/collapse axes). @param {any} fam @param {Record<string,string>} combo */
function presetOptsFor(fam, combo) {
  const o = { ...(fam.presetOpts || {}) }
  if (fam.sizeAxis && combo.Size) o.size = combo.Size
  if (fam.shapeAxis && combo.Shape) o.shape = combo.Shape
  if (fam.markAxis && combo.Mark) o.mark = combo.Mark
  if (fam.densityAxis && combo.Density) o.compact = combo.Density === 'Compact'
  if (fam.collapseAxis && combo.State) o.collapsed = combo.State === 'Collapsed'
  return o
}

/** Default tone override for an axis value (StateDot/dot accents). @param {string} value */
function toneOverridesFor(value) {
  const tok = TONE_TOKEN[value]
  if (!tok) return []
  return [{ role: 'StateDot', set: { fill: tok } }, { role: 'RowDot1', set: { fill: tok } }]
}

// ── family builder (FINAL fidelity) ────────────────────────────────────────
const { variantCombos } = require('components')

/**
 * @param {any} fam spec family (blueprint contract)
 * @param {any} live
 * @param {any} ctx { section, paintByToken, textStyleByName, effectByName, fonts, runId, iconDefault }
 */
async function upsertFamily(fam, live, ctx) {
  // Preserve ORIGIN run across rebuilds (rollback isolation across revisions).
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

    // root paints
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

    // per-axis overrides: family valueOverrides > STATE presets > tone defaults
    for (const axisProp of Object.keys(combo)) {
      const value = combo[axisProp]
      if (axisProp === 'Direction') continue
      const famOv = fam.valueOverrides && fam.valueOverrides[axisProp] && fam.valueOverrides[axisProp][value]
      if (famOv) await applyOverrides(roles, famOv, ctx)
      else if (axisProp === 'State') await applyOverrides(roles, STATE_PRESETS[value] || [], ctx)
      else await applyOverrides(roles, toneOverridesFor(value), ctx)
      // State presets ALSO apply under family override presence for base semantics
      if (famOv && axisProp === 'State' && STATE_PRESETS[value] && STATE_PRESETS[value].length) {
        await applyOverrides(roles, STATE_PRESETS[value].filter((o2) => !famOv.some((f2) => f2.role === o2.role)), ctx)
      }
    }
    // Card-style elevation axis binds the matching effect style
    if (fam.elevationAxis && combo.Elevation && ctx.effectByName['Elevation/' + combo.Elevation]) {
      try { await comp.setEffectStyleIdAsync(ctx.effectByName['Elevation/' + combo.Elevation].id) } catch (_e) { /* ignore */ }
    }
    if (fam.elevation && ctx.effectByName[fam.elevation]) {
      try { await comp.setEffectStyleIdAsync(ctx.effectByName[fam.elevation].id) } catch (_e) { /* ignore */ }
    }
    if (combo.Direction === 'RTL') mirrorRtl(comp)

    variantComponents.push(comp)
    rendered.push({ comp, roles, combo })
  }

  // Combine into a set (single-combo families keep the lone component)
  let set
  if (variantComponents.length > 1) {
    try {
      set = figma.combineAsVariants(variantComponents, ctx.section)
    } catch (_e) {
      for (let i = 1; i < variantComponents.length; i++) { try { variantComponents[i].remove() } catch (_e2) { /* ignore */ } }
      set = variantComponents[0]
    }
  } else {
    set = variantComponents[0]
  }
  set.name = fam.name
  set.description = fam.description + (fam.maps ? '\nMaps to ' + fam.maps : '') + '\nA11y: ' + fam.a11y
  try { /** @type {any} */ (set).annotations = [{ label: fam.a11y }] } catch (_e) { /* best-effort */ }
  try {
    set.layoutMode = 'HORIZONTAL'
    set.itemSpacing = 24
    ;/** @type {any} */ (set).layoutWrap = 'WRAP'
    set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 24
    ;/** @type {any} */ (set).maxWidth = 1600
  } catch (_e) { /* lone component */ }

  // Component properties bound to layers
  /** @type {Record<string, string>} propName → full property id */
  const propIds = {}
  let propsAdded = 0
  const canProps = typeof set.addComponentProperty === 'function'
  if (canProps) {
    for (const tp of fam.text || []) {
      try { propIds[tp.name] = set.addComponentProperty(tp.name, 'TEXT', ''); propsAdded++ } catch (_e) { /* ignore */ }
    }
    for (const bp of fam.bools || []) {
      // default mirrors the base blueprint's layer visibility (a Hint hidden by
      // default gets default=false), keeping property defaults honest.
      const baseLayer = rendered[0] && rendered[0].roles[bp.role]
      const def = baseLayer ? baseLayer.visible !== false : true
      try { propIds[bp.name] = set.addComponentProperty(bp.name, 'BOOLEAN', def); propsAdded++ } catch (_e) { /* ignore */ }
    }
    for (const sp of fam.swaps || []) {
      if (!ctx.iconDefault) continue
      try { propIds[sp.name] = set.addComponentProperty(sp.name, 'INSTANCE_SWAP', ctx.iconDefault.id); propsAdded++ } catch (_e) { /* ignore */ }
    }
    // bind refs on every variant's layers
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

// ── variant lookup + assemblies ────────────────────────────────────────────
/** Find the component inside a set matching a combo. @param {any} set @param {Record<string,string>} combo */
function findVariant(set, combo) {
  if (!set) return null
  if (set.type === 'COMPONENT') return set
  const want = Object.keys(combo).map((k) => k + '=' + combo[k]).join(', ')
  const kids = (set.children || []).filter((c) => c.type === 'COMPONENT')
  // exact name match first, then subset match (every requested pair present)
  let hit = kids.find((c) => c.name === want)
  if (hit) return hit
  const pairs = Object.keys(combo).map((k) => k + '=' + combo[k])
  hit = kids.find((c) => pairs.every((p2) => c.name.includes(p2)))
  return hit || kids[0] || null
}

/** Full text-property id map of a set (for skipped families). @param {any} set */
function textPropIdsOf(set) {
  /** @type {Record<string, string>} */
  const out = {}
  try {
    const defs = set.componentPropertyDefinitions || {}
    for (const full of Object.keys(defs)) {
      const base = full.split('#')[0]
      out[base] = full
    }
  } catch (_e) { /* ignore */ }
  return out
}

/**
 * Build one native reference assembly from component instances.
 * @param {any} asm spec assembly
 * @param {any} live
 * @param {any} ctx { section2, fonts, paintByToken, textStyleByName, runId }
 * @returns {Promise<{ node:any, instances:{family:string, componentId:string}[], adopted:boolean }>}
 */
async function upsertAssembly(asm, live, ctx) {
  const existing = live.assemblies[asm.key]
  let originRunId = ctx.runId
  let frame = null
  let adopted = false
  if (existing) {
    try { const prior = existing.getSharedPluginData(NS, K.RUN_ID); if (prior && prior.length) originRunId = prior } catch (_e) { /* ignore */ }
    try { existing.remove() } catch (_e) { /* ignore */ }
    delete live.assemblies[asm.key]
  } else {
    // ORPHAN ADOPTION (repairs the run-ms7vkx9n-1 partial state IN PLACE):
    // that run's set_characters failure threw BEFORE tag(), leaving exactly-
    // named, unmanaged partial frames inside the managed section. Adopt the
    // single exact-name unmanaged FRAME child, clear its partial content and
    // rebuild into the SAME node (id preserved). Two matches = fail closed.
    const children = (/** @type {any} */ (ctx.section2).children || []).map((c) => ({ id: c.id, name: c.name, type: c.type, managed: isManaged(c), node: c }))
    const pick = pickAdoptable(children, asm.name)
    if (pick.ambiguous.length) throw new Error('adoption ambiguity for ' + asm.key + ': multiple unmanaged frames named "' + asm.name + '" [' + pick.ambiguous.join(', ') + '] — resolve manually before Apply')
    if (pick.id) {
      const hit = children.find((c) => c.id === pick.id)
      frame = hit && hit.node
      if (frame) {
        adopted = true
        for (const ch of [...(frame.children || [])]) { try { ch.remove() } catch (_e) { /* ignore */ } }
      }
    }
  }

  if (!frame) frame = figma.createFrame()
  frame.name = asm.name
  frame.layoutMode = 'VERTICAL'
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'FIXED'
  frame.itemSpacing = 24
  frame.paddingLeft = frame.paddingRight = asm.context === 'mobile' ? 16 : 48
  frame.paddingTop = frame.paddingBottom = asm.context === 'mobile' ? 24 : 48
  frame.resize(asm.width, 100)
  const bg = ctx.paintByToken['Color/Background/Base']
  if (bg) { try { await frame.setFillStyleIdAsync(bg.id) } catch (_e) { /* ignore */ } }
  ctx.section2.appendChild(frame)

  /** @type {{family:string, componentId:string}[]} */
  const instancesUsed = []

  /** @param {any} item @param {any} parent */
  const place = async (item, parent) => {
    if ('heading' in item) {
      // item.heading is a PRE-LOCALIZED string (locale-strings.js). The
      // run-ms7vkx9n-1 defect read `.fa/.en` off this string → undefined →
      // Figma rejected set_characters. Assign the string itself, defensively.
      const t = figma.createText()
      const displayStyle = !item.style || item.style.startsWith('Display') || item.style.startsWith('Heading')
      t.fontName = ctx.fonts.resolve(displayStyle ? 'display' : 'body', displayStyle ? 'Bold' : 'Regular')
      setChars(t, item.heading, { assemblyKey: asm.key, role: 'Heading(' + (item.style || 'Heading/L') + ')', locale: asm.locale })
      parent.appendChild(t)
      const ramp = ctx.textStyleByName[item.style || 'Heading/L']
      if (ramp) { try { await t.setTextStyleIdAsync(ramp.id) } catch (_e) { /* ignore */ } }
      const fillStyle = ctx.paintByToken[item.style === 'Body/M' ? 'Color/Text/Secondary' : 'Color/Text/Primary']
      if (fillStyle) { try { await t.setFillStyleIdAsync(fillStyle.id) } catch (_e) { /* ignore */ } }
      t.textAutoResize = 'HEIGHT'
      try { t.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ }
      if (asm.rtl) { try { t.textAlignHorizontal = 'RIGHT' } catch (_e) { /* ignore */ } }
      return
    }
    if (item.row) {
      const row = figma.createFrame()
      row.name = 'Row'
      row.layoutMode = 'HORIZONTAL'
      row.primaryAxisSizingMode = 'AUTO'
      row.counterAxisSizingMode = 'AUTO'
      row.itemSpacing = 16
      row.fills = []
      parent.appendChild(row)
      const items = asm.rtl ? [...item.row].reverse() : item.row
      for (const sub of items) await place(sub, row)
      return
    }
    // component instance
    const famKey = 'componentSet:' + item.family
    const set = live.componentSets[famKey]
    if (!set) return
    const combo = { ...(item.variant || {}) }
    // Direction axis participation
    const specFam = ctx.familyByKey[famKey]
    if (specFam && specFam.dirAxis) combo.Direction = asm.rtl ? 'RTL' : 'LTR'
    const variant = findVariant(set, combo)
    if (!variant) return
    let inst
    try { inst = variant.createInstance() } catch (_e) { return }
    parent.appendChild(inst)
    instancesUsed.push({ family: item.family, componentId: variant.id })
    // text props — same defensive contract as characters (no undefined/null/empty)
    const props = item.props || {}
    const ids = textPropIdsOf(set)
    /** @type {Record<string, string>} */
    const setProps = {}
    for (const name of Object.keys(props)) {
      const v = props[name]
      const p = textProblem(v)
      if (p) throw charactersError(v, { assemblyKey: asm.key, role: item.family + '.' + name, locale: asm.locale })
      if (ids[name]) setProps[ids[name]] = /** @type {string} */ (v)
    }
    if (Object.keys(setProps).length) { try { inst.setProperties(setProps) } catch (_e) { /* ignore */ } }
  }

  for (const item of asm.items) await place(item, frame)

  tag(frame, { assetKey: asm.key, kind: C.KIND.ASSEMBLY, hash: asm.hash, runId: originRunId })
  // DE assemblies have no original Figma reference — mark them as generated.
  frame.setSharedPluginData(NS, 'originalRef', asm.originalRef || '')
  frame.setSharedPluginData(NS, 'newlyGenerated', asm.newlyGenerated ? '1' : '')
  live.assemblies[asm.key] = frame
  return { node: frame, instances: instancesUsed, adopted }
}

// ── layout inside sections ─────────────────────────────────────────────────
function layoutSets(sets, section) {
  const COLS = 2
  const CW = 1700
  const CH = 900
  const PAD = 60
  sets.forEach((s, i) => {
    if (!s) return
    try { s.x = section.x + PAD + (i % COLS) * CW; s.y = section.y + 80 + Math.floor(i / COLS) * CH } catch (_e) { /* ignore */ }
  })
}
function layoutAssemblies(nodes, section) {
  const PAD = 60
  let yDesk = 80
  let yMob = 80
  for (const n of nodes) {
    if (!n) continue
    try {
      if (n.width > 800) { n.x = section.x + PAD; n.y = section.y + yDesk; yDesk += n.height + 120 }
      else { n.x = section.x + PAD + 1360; n.y = section.y + yMob; yMob += n.height + 120 }
    } catch (_e) { /* ignore */ }
  }
  try { /** @type {any} */ (section).resizeWithoutConstraints(1900, Math.max(yDesk, yMob) + 120) } catch (_e) { /* ignore */ }
}

// ── top-level operations ───────────────────────────────────────────────────
/**
 * @param {{ dryRun?: boolean, allowFontFallback?: boolean, _specForTest?: any }} [options]
 *   _specForTest is a TEST-ONLY hook (never set by the UI): it lets the test
 *   suite inject a corrupted spec and prove the fail-closed gates fire before
 *   any mutation. Production paths always build the real spec.
 */
async function run(options) {
  const dryRun = !!(options && options.dryRun)
  const allowFontFallback = !!(options && options.allowFontFallback)
  const spec = (options && options._specForTest) || buildSpec()
  // FAIL-CLOSED TEXT PREFLIGHT — validate every string that will reach
  // TextNode.characters / instance text props BEFORE touching the file or
  // generating a runId (added after run-ms7vkx9n-1).
  const textValidation = validateAssemblyText(spec)
  const live = await buildLiveIndex()
  const plan = computePlan(spec, live.index)
  const ambiguities = detectAmbiguity(live.observations)

  // font gate assessment (read-only)
  const availableFonts = await figma.listAvailableFontsAsync()
  const availableSet = new Set(availableFonts.map((f) => f.fontName.family + ' ' + f.fontName.style))
  const fontGate = assessFontAvailability(availableSet)

  if (dryRun) {
    return {
      ok: ambiguities.length === 0 && textValidation.ok,
      mode: 'dry-run',
      counts: spec.counts,
      plan,
      ambiguities,
      textValidation,
      fontGate: { canonicalPresent: fontGate.canonicalPresent, missing: fontGate.missing, wouldBlockApply: !fontGate.canonicalPresent && !allowFontFallback },
      manifestPresent: !!live.section,
    }
  }

  // FAIL CLOSED — no mutation (and no runId) on invalid text, ambiguity or
  // missing canonical fonts.
  if (!textValidation.ok) {
    return { ok: false, mode: 'apply', blocked: 'TEXT_VALIDATION_FAILED', issues: textValidation.issues, counts: spec.counts }
  }
  if (ambiguities.length) {
    return { ok: false, mode: 'apply', blocked: 'AMBIGUOUS_OWNERSHIP', ambiguities, counts: spec.counts }
  }
  if (!fontGate.canonicalPresent && !allowFontFallback) {
    return {
      ok: false, mode: 'apply', blocked: 'FONTS_MISSING',
      missingFonts: fontGate.missing,
      guidance: 'Install the canonical desktop fonts (see docs/design/phase-87-closure/font-installation-manifest.md) or explicitly enable the documented fallback.',
      counts: spec.counts,
    }
  }

  const runId = newRunId()
  const errors = []
  const fonts = await resolveFonts(spec.textStyles)
  const opByKey = {}
  for (const op of plan.ops) opByKey[op.key] = op

  try {
    // sections
    ensureSectionSlot(spec.section, live, 'section', runId, { x: undefined, y: 0, w: 3600, h: 12000 })
    // foundation
    for (const col of spec.collections) upsertCollection(col, live, { runId })
    for (const v of spec.variables) { try { upsertVariable(v, live, runId) } catch (e) { errors.push('variable ' + v.key + ': ' + e.message) } }
    const paintByToken = {}
    for (const p of spec.paintStyles) { try { const ps = upsertPaintStyle(p, live, runId); paintByToken[p.name] = ps } catch (e) { errors.push('paintStyle ' + p.key + ': ' + e.message) } }
    const textStyleByName = {}
    for (const t of spec.textStyles) { try { const ts = upsertTextStyle(t, live, fonts, runId); textStyleByName[t.name] = ts } catch (e) { errors.push('textStyle ' + t.key + ': ' + e.message) } }
    const effectByName = {}
    for (const e of spec.effectStyles) { try { const es = upsertEffectStyle(e, live, runId); effectByName[e.name] = es } catch (er) { errors.push('effectStyle ' + e.key + ': ' + er.message) } }

    // families — Icon FIRST (instance-swap default target), then the rest.
    const famOrder = [...spec.families].sort((a, b) => (a.key === 'componentSet:icon' ? -1 : b.key === 'componentSet:icon' ? 1 : 0))
    const ctx = { section: live.section, paintByToken, textStyleByName, effectByName, fonts, runId, iconDefault: null, familyByKey: {} }
    for (const f of spec.families) ctx.familyByKey[f.key] = f
    const builtSets = []
    const fidelity = []
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
    layoutSets(builtSets, live.section)

    // assemblies — second managed section, instances only.
    ensureSectionSlot(spec.section2, live, 'section2', runId, { x: (live.section ? live.section.x + 3800 : undefined), y: 0, w: 1900, h: 12000 })
    const ctx2 = { section2: live.section2, fonts, paintByToken, textStyleByName, runId, familyByKey: ctx.familyByKey }
    const asmNodes = []
    /** @type {any[]} */
    const mapping = []
    for (const asm of spec.assemblies) {
      const op = opByKey[asm.key]
      if (op && op.action === 'skip' && live.assemblies[asm.key]) { asmNodes.push(live.assemblies[asm.key]); continue }
      try {
        const r = await upsertAssembly(asm, live, ctx2)
        asmNodes.push(r.node)
        mapping.push({ originalRef: asm.originalRef, assembly: asm.key, nodeId: r.node.id, adopted: !!r.adopted, instances: r.instances })
      } catch (e) { errors.push('assembly ' + asm.key + ': ' + e.message); asmNodes.push(null) }
    }
    layoutAssemblies(asmNodes, live.section2)

    await writeManifest(live, runId, spec, plan, mapping)

    return {
      ok: errors.length === 0,
      mode: 'apply',
      runId,
      counts: spec.counts,
      plan,
      applied: { create: plan.summary.create, update: plan.summary.update, skip: plan.summary.skip },
      fontSubstitutions: fonts.substitutions,
      fontAliases: fonts.aliases,
      fontFallbackExplicitlyAllowed: allowFontFallback && !fontGate.canonicalPresent,
      assemblies: mapping,
      fidelity,
      errors,
      recovery: 'If this Apply was interrupted, RERUN Apply: per-asset hashes converge (stale assets update, finished ones skip).',
    }
  } catch (e) {
    return { ok: false, mode: 'apply', runId, error: e.message, errors, recovery: 'Rerun Apply to converge, or Rollback(runId) to remove assets first created by this run.' }
  }
}

async function verify() {
  const spec = buildSpec()
  const live = await buildLiveIndex()
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
  let referenceFrames = 0
  for (const ch of figma.currentPage.children) if (!isManaged(ch)) referenceFrames++
  return {
    ok: missing.length === 0 && drifted.length === 0 && ambiguities.length === 0,
    present: present.length,
    missing,
    drifted,
    ambiguities,
    referenceFramesPreserved: referenceFrames,
    total: spec.assets.length,
  }
}

/** @param {{ runId?: string|null }} [options] */
async function rollback(options) {
  const filterRun = options && options.runId ? options.runId : null
  const removed = { variables: 0, collections: 0, paintStyles: 0, textStyles: 0, effectStyles: 0, componentSets: 0, assemblies: 0, manifest: 0, sections: 0 }
  const errors = []
  const notes = []

  const inScope = (obj) => isManaged(obj) && (!filterRun || obj.getSharedPluginData(NS, K.RUN_ID) === filterRun)

  for (const ch of [...figma.currentPage.children]) {
    if (ch.type === 'SECTION') {
      for (const sub of [...(/** @type {any} */ (ch).children || [])]) {
        if (!inScope(sub)) continue
        const kind = sub.getSharedPluginData(NS, K.ASSET_KIND)
        try {
          sub.remove()
          if (kind === C.KIND.MANIFEST) removed.manifest++
          else if (kind === C.KIND.ASSEMBLY) removed.assemblies++
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
  // sections last — ONLY when empty (cascade can never delete out-of-scope/user nodes)
  for (const ch of [...figma.currentPage.children]) {
    if (ch.type === 'SECTION' && inScope(ch)) {
      const remaining = (/** @type {any} */ (ch).children || []).length
      if (remaining === 0) { try { ch.remove(); removed.sections++ } catch (e) { errors.push(e.message) } }
      else notes.push('section "' + ch.name + '" kept: ' + remaining + ' out-of-scope/user child(ren) remain')
    }
  }
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
  const add = (obj) => {
    if (!obj) return
    try { const t = readTag(obj); if (t.assetKey) idx[t.assetKey] = { id: obj.id, hash: t.hash, kind: t.kind } } catch (_e) { /* ignore */ }
  }
  const groups = [live.collections, live.variables, live.styles.paint, live.styles.text, live.styles.effect, live.componentSets, live.assemblies]
  for (const g of groups) for (const k of Object.keys(g || {})) add(g[k])
  add(live.section)
  add(live.section2)
  return idx
}

async function writeManifest(live, runId, spec, plan, mapping) {
  const section = live.section
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
  const payload = { pluginVersion: C.PLUGIN_VERSION, lastRunId: runId, counts: spec.counts, summary: plan.summary, index, referenceMapping: mapping || [] }
  writeChunked(node, 'manifest', JSON.stringify(payload))
  node.setSharedPluginData(NS, K.MANAGED, '1')
  node.setSharedPluginData(NS, K.ASSET_KIND, C.KIND.MANIFEST)
  node.setSharedPluginData(NS, K.ASSET_KEY, 'manifest:node')
  const priorRun = node.getSharedPluginData(NS, K.RUN_ID)
  node.setSharedPluginData(NS, K.RUN_ID, priorRun && priorRun.length ? priorRun : runId)
}

module.exports = { run, verify, rollback, buildLiveIndex }

  };
  __modules["main"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Plugin entry point (runs in Figma's main thread). Shows the UI and routes its
 * messages to the executor. No network; all work is local to the open file.
 */

const C = require('constants')
const { buildSpec } = require('spec')
const { renderPlanText } = require('plan')
const starter = require('starter')
const exec = require('figma-exec')

figma.showUI(__html__, { width: 480, height: 660, title: C.PLUGIN_NAME })

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
        post('meta', {
          name: C.PLUGIN_NAME,
          version: C.PLUGIN_VERSION,
          counts: spec.counts,
          supported: starter.STARTER_SUPPORTED,
          deferred: starter.STARTER_DEFERRED,
          fileEdit: starter.FILE_EDIT_REQUIREMENT,
        })
        break
      }
      case 'dry-run': {
        const res = await exec.run({ dryRun: true, allowFontFallback: !!m.allowFontFallback })
        post('dry-run', Object.assign({}, res, { text: renderPlanText(res.plan) }))
        break
      }
      case 'apply': {
        const res = await exec.run({ dryRun: false, allowFontFallback: !!m.allowFontFallback })
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

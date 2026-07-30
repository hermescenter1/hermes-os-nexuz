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

/** Local variable collection names created by this plugin. */
const COLLECTIONS = Object.freeze({
  COLORS: 'Hermes · Semantic Colors',
  SPACING: 'Hermes · Spacing',
  RADIUS: 'Hermes · Radius',
  SIZING: 'Hermes · Sizing',
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
  SECTION: 'section',
  MANIFEST: 'manifest',
})

module.exports = { PLUGIN_VERSION, PLUGIN_NAME, NAMESPACE, KEYS, MANIFEST_NODE_NAME, SECTION_NAME, COLLECTIONS, KIND }

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

module.exports = { COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SHADOW_TOKENS, TEXT_STYLES, FONTS, parseColor }

  };
  __modules["components"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Declarative registry of the component families the plugin generates natively
 * as Figma Component Sets with Variants + Component Properties + Auto Layout.
 *
 * The three category lists are grounded in the real Hermes design system:
 *   - 23 PRIMITIVES  ⟵ src/components/ds/*.tsx  (each `maps` to its source file)
 *   - 13 CORE        ⟵ the documented "missing as ds/ primitives" core families
 *   - 7  INDUSTRIAL  ⟵ the documented industrial component families
 *
 * FIDELITY NOTE (honest scope): each family is generated as a REAL component set
 * — auto-layout, token-bound fills/borders, an applied text style, a primary
 * variant axis and component properties (text + an RTL boolean where text-bearing).
 * They are foundation-fidelity scaffolds bound to the native variables/styles,
 * intended to be refined toward the React components — NOT pixel-final replicas.
 * Deeper per-variant visual matrices are recorded as follow-up, not simulated.
 *
 * @typedef {Object} Family
 * @property {string} key       stable kebab identity (drives assetKey — do not rename casually)
 * @property {string} name      Figma component-set name
 * @property {'primitive'|'core'|'industrial'} category
 * @property {string|null} maps repo source file this family maps to, or null (planned)
 * @property {{prop:string, values:string[]}} variant primary variant axis
 * @property {string[]} [text]  TEXT component properties
 * @property {string[]} [bool]  BOOLEAN component properties (besides the RTL prop)
 * @property {boolean} rtl      add an "RTL" boolean component property (text-bearing families)
 * @property {string} description short description + a11y intent (written to component.description)
 */

/** Maps a variant VALUE keyword to a semantic color token for meaningful fills. */
const TONE_TOKEN = Object.freeze({
  Primary: 'Color/Brand/Primary', Brand: 'Color/Brand/Primary', Decision: 'Color/Reasoning/Decision',
  Secondary: 'Color/Surface/Interactive', Ghost: 'Color/Surface/Primary', Neutral: 'Color/Text/Muted',
  Success: 'Color/Status/Success', Healthy: 'Color/Status/Success', Running: 'Color/Status/Success', On: 'Color/Status/Success',
  Warning: 'Color/Status/Warning', Missing: 'Color/Reasoning/Missing', Maintenance: 'Color/Status/Warning', Idle: 'Color/Status/Warning',
  Danger: 'Color/Status/Danger', Fault: 'Color/Status/Danger', Down: 'Color/Status/Danger', Contradiction: 'Color/Reasoning/Contradiction',
  Information: 'Color/Status/Information', Info: 'Color/Status/Information', Offline: 'Color/Text/Disabled',
  Evidence: 'Color/Reasoning/Evidence', Hypothesis: 'Color/Reasoning/Hypothesis',
  High: 'Color/Status/Success', Medium: 'Color/Status/Warning', Low: 'Color/Status/Danger',
})

/** @type {ReadonlyArray<Family>} */
const PRIMITIVES = [
  { key: 'alert', name: 'Alert', category: 'primitive', maps: 'src/components/ds/Alert.tsx', variant: { prop: 'Tone', values: ['Info', 'Success', 'Warning', 'Danger'] }, text: ['Title', 'Message'], bool: ['Dismissible'], rtl: true, description: 'Inline alert banner. Tone maps to status colors; icon + text must meet 4.5:1 on the tinted surface.' },
  { key: 'badge', name: 'Badge', category: 'primitive', maps: 'src/components/ds/Badge.tsx', variant: { prop: 'Tone', values: ['Neutral', 'Brand', 'Success', 'Warning', 'Danger'] }, text: ['Label'], rtl: true, description: 'Compact status/label chip. Non-interactive; never the sole carrier of meaning (pair with text).' },
  { key: 'button', name: 'Button', category: 'primitive', maps: 'src/components/ds/Button.tsx', variant: { prop: 'Variant', values: ['Primary', 'Secondary', 'Ghost', 'Danger'] }, text: ['Label'], bool: ['Disabled'], rtl: true, description: 'Primary action control. On-brand text is dark (brand-on-brand); focus uses focus-ring + halo.' },
  { key: 'card', name: 'Card', category: 'primitive', maps: 'src/components/ds/Card.tsx', variant: { prop: 'Elevation', values: ['E1', 'E2', 'E3'] }, text: ['Title'], rtl: true, description: 'Surface container. Elevation maps to the E1–E3 effect styles; body sits on surface-primary.' },
  { key: 'checkbox', name: 'Checkbox', category: 'primitive', maps: 'src/components/ds/Checkbox.tsx', variant: { prop: 'State', values: ['Unchecked', 'Checked', 'Indeterminate', 'Disabled'] }, text: ['Label'], rtl: true, description: 'Boolean input. Checked uses brand-primary; disabled uses text-disabled and is non-focusable.' },
  { key: 'dialog', name: 'Dialog', category: 'primitive', maps: 'src/components/ds/Dialog.tsx', variant: { prop: 'Size', values: ['S', 'M', 'L'] }, text: ['Title'], rtl: true, description: 'Modal dialog on glass overlay (E4). Requires a labelled title and a focus trap in code.' },
  { key: 'drawer', name: 'Drawer', category: 'primitive', maps: 'src/components/ds/Drawer.tsx', variant: { prop: 'Side', values: ['Start', 'End'] }, text: ['Title'], rtl: true, description: 'Edge panel. Side is logical (Start/End) so it mirrors correctly under RTL.' },
  { key: 'empty-state', name: 'EmptyState', category: 'primitive', maps: 'src/components/ds/EmptyState.tsx', variant: { prop: 'Tone', values: ['Neutral', 'Brand'] }, text: ['Title', 'Description'], rtl: true, description: 'Zero-data placeholder with guidance. Must offer a next action.' },
  { key: 'error-state', name: 'ErrorState', category: 'primitive', maps: 'src/components/ds/ErrorState.tsx', variant: { prop: 'Tone', values: ['Danger', 'Warning'] }, text: ['Title', 'Description'], rtl: true, description: 'Recoverable error surface with a retry affordance.' },
  { key: 'form-field', name: 'FormField', category: 'primitive', maps: 'src/components/ds/FormField.tsx', variant: { prop: 'State', values: ['Default', 'Focused', 'Error', 'Disabled'] }, text: ['Label', 'Hint'], rtl: true, description: 'Label + control + hint/error wrapper. Error text uses status-danger and is programmatically associated in code.' },
  { key: 'icon-button', name: 'IconButton', category: 'primitive', maps: 'src/components/ds/IconButton.tsx', variant: { prop: 'Variant', values: ['Primary', 'Secondary', 'Ghost'] }, bool: ['Disabled'], rtl: false, description: 'Icon-only action. Requires an accessible name (aria-label) in code; 24px min target.' },
  { key: 'input', name: 'Input', category: 'primitive', maps: 'src/components/ds/Input.tsx', variant: { prop: 'State', values: ['Default', 'Focused', 'Error', 'Disabled'] }, text: ['Placeholder'], rtl: true, description: 'Single-line text input on surface-interactive; focus shows border-active + focus ring.' },
  { key: 'insight-card', name: 'InsightCard', category: 'primitive', maps: 'src/components/ds/InsightCard.tsx', variant: { prop: 'Tone', values: ['Evidence', 'Hypothesis', 'Decision'] }, text: ['Title', 'Value'], rtl: true, description: 'Reasoning insight card. Tone maps to the reasoning semantic layer.' },
  { key: 'kpi-card', name: 'KpiCard', category: 'primitive', maps: 'src/components/ds/KpiCard.tsx', variant: { prop: 'Trend', values: ['Up', 'Down', 'Flat'] }, text: ['Label', 'Value'], rtl: true, description: 'Single-metric KPI. Trend colour is supportive only; the value carries meaning.' },
  { key: 'radio', name: 'Radio', category: 'primitive', maps: 'src/components/ds/Radio.tsx', variant: { prop: 'State', values: ['Unselected', 'Selected', 'Disabled'] }, text: ['Label'], rtl: true, description: 'Single-choice input within a named group.' },
  { key: 'skeleton', name: 'Skeleton', category: 'primitive', maps: 'src/components/ds/Skeleton.tsx', variant: { prop: 'Shape', values: ['Line', 'Block', 'Circle'] }, rtl: false, description: 'Loading placeholder. Decorative; must be aria-hidden and paired with a status message.' },
  { key: 'spinner', name: 'Spinner', category: 'primitive', maps: 'src/components/ds/Spinner.tsx', variant: { prop: 'Size', values: ['S', 'M', 'L'] }, rtl: false, description: 'Indeterminate progress. Needs an accessible busy/label in code.' },
  { key: 'status-indicator', name: 'StatusIndicator', category: 'primitive', maps: 'src/components/ds/StatusIndicator.tsx', variant: { prop: 'Status', values: ['Success', 'Warning', 'Danger', 'Information', 'Neutral'] }, text: ['Label'], rtl: true, description: 'Dot + label status. Colour is never the only signal — the label is required.' },
  { key: 'switch', name: 'Switch', category: 'primitive', maps: 'src/components/ds/Switch.tsx', variant: { prop: 'State', values: ['Off', 'On', 'Disabled'] }, text: ['Label'], rtl: true, description: 'Binary toggle. On uses brand-primary; state is exposed via role=switch in code.' },
  { key: 'tabs', name: 'Tabs', category: 'primitive', maps: 'src/components/ds/Tabs.tsx', variant: { prop: 'State', values: ['Default', 'Active'] }, text: ['Label'], rtl: true, description: 'Single tab item. Active uses border-active underline; roving tabindex in code.' },
  { key: 'technical-value', name: 'TechnicalValue', category: 'primitive', maps: 'src/components/ds/TechnicalValue.tsx', variant: { prop: 'Tone', values: ['Default', 'Success', 'Warning', 'Danger'] }, text: ['Value', 'Unit'], rtl: false, description: 'Monospace measured value + unit. Uses the Technical/Mono text style; LTR numerals even under RTL.' },
  { key: 'textarea', name: 'Textarea', category: 'primitive', maps: 'src/components/ds/Textarea.tsx', variant: { prop: 'State', values: ['Default', 'Focused', 'Error', 'Disabled'] }, text: ['Placeholder'], rtl: true, description: 'Multi-line text input; same focus/error semantics as Input.' },
  { key: 'tooltip', name: 'Tooltip', category: 'primitive', maps: 'src/components/ds/Tooltip.tsx', variant: { prop: 'Side', values: ['Top', 'Bottom', 'Start', 'End'] }, text: ['Content'], rtl: true, description: 'Transient label on elevated surface. Never the sole source of essential info.' },
]

/** @type {ReadonlyArray<Family>} */
const CORE = [
  { key: 'link', name: 'Link', category: 'core', maps: null, variant: { prop: 'State', values: ['Default', 'Hover', 'Visited'] }, text: ['Label'], rtl: true, description: 'Text hyperlink. Underline on hover/focus; colour alone is insufficient.' },
  { key: 'select', name: 'Select', category: 'core', maps: null, variant: { prop: 'State', values: ['Default', 'Open', 'Disabled'] }, text: ['Value'], rtl: true, description: 'Single-select control with a listbox popover.' },
  { key: 'search', name: 'Search', category: 'core', maps: null, variant: { prop: 'State', values: ['Default', 'Focused'] }, text: ['Placeholder'], rtl: true, description: 'Search input with leading icon and clear affordance.' },
  { key: 'dropdown', name: 'Dropdown', category: 'core', maps: null, variant: { prop: 'State', values: ['Closed', 'Open'] }, text: ['Label'], rtl: true, description: 'Menu trigger + menu on elevated surface.' },
  { key: 'accordion', name: 'Accordion', category: 'core', maps: null, variant: { prop: 'State', values: ['Collapsed', 'Expanded'] }, text: ['Title'], rtl: true, description: 'Disclosure section; header is a button with aria-expanded in code.' },
  { key: 'toast', name: 'Toast', category: 'core', maps: null, variant: { prop: 'Tone', values: ['Info', 'Success', 'Warning', 'Danger'] }, text: ['Message'], rtl: true, description: 'Transient notification on E3. Announced via a live region in code.' },
  { key: 'data-table', name: 'DataTable', category: 'core', maps: null, variant: { prop: 'Density', values: ['Comfortable', 'Compact'] }, text: ['Header'], rtl: true, description: 'Header + row scaffold with sortable columns.' },
  { key: 'pagination', name: 'Pagination', category: 'core', maps: null, variant: { prop: 'State', values: ['Default'] }, bool: ['HasPrev', 'HasNext'], rtl: true, description: 'Page navigator with prev/next and page markers.' },
  { key: 'breadcrumb', name: 'Breadcrumb', category: 'core', maps: null, variant: { prop: 'State', values: ['Default'] }, text: ['Label'], rtl: true, description: 'Hierarchical trail; separators mirror under RTL.' },
  { key: 'sidebar', name: 'Sidebar', category: 'core', maps: null, variant: { prop: 'State', values: ['Expanded', 'Collapsed'] }, rtl: true, description: 'App navigation rail. Logical start edge; collapses to icons.' },
  { key: 'top-nav', name: 'TopNav', category: 'core', maps: null, variant: { prop: 'State', values: ['Default'] }, rtl: true, description: 'Top application bar with brand, search and user menu slots.' },
  { key: 'language-selector', name: 'LanguageSelector', category: 'core', maps: null, variant: { prop: 'Locale', values: ['FA', 'EN', 'DE'] }, rtl: true, description: 'Locale switcher. FA sets document direction RTL; EN/DE LTR.' },
  { key: 'user-menu', name: 'UserMenu', category: 'core', maps: null, variant: { prop: 'State', values: ['Closed', 'Open'] }, text: ['Name'], rtl: true, description: 'Account menu trigger + popover.' },
]

/** @type {ReadonlyArray<Family>} */
const INDUSTRIAL = [
  { key: 'industrial-signal-tile', name: 'IndustrialSignalTile', category: 'industrial', maps: null, variant: { prop: 'Status', values: ['Healthy', 'Warning', 'Fault', 'Offline'] }, text: ['Tag', 'Value', 'Unit'], rtl: false, description: 'Live signal tile (tag/value/unit). Status colour supports, never replaces, the textual state; values stay LTR.' },
  { key: 'fault-hypothesis-card', name: 'FaultHypothesisCard', category: 'industrial', maps: null, variant: { prop: 'Confidence', values: ['High', 'Medium', 'Low'] }, text: ['Hypothesis'], rtl: true, description: 'Diagnostic hypothesis with an explicit confidence level; uses the reasoning layer.' },
  { key: 'evidence-item', name: 'EvidenceItem', category: 'industrial', maps: null, variant: { prop: 'Kind', values: ['Evidence', 'Contradiction', 'Missing'] }, text: ['Label'], rtl: true, description: 'Single evidence row. Missing evidence pairs with a dashed treatment.' },
  { key: 'confidence-indicator', name: 'ConfidenceIndicator', category: 'industrial', maps: null, variant: { prop: 'Level', values: ['High', 'Medium', 'Low'] }, text: ['Label'], rtl: true, description: 'Explicit uncertainty indicator; numeric confidence is stated, never implied by colour alone.' },
  { key: 'safe-action-panel', name: 'SafeActionPanel', category: 'industrial', maps: null, variant: { prop: 'State', values: ['Ready', 'Blocked', 'Executed'] }, text: ['Action'], rtl: true, description: 'Human-decision safe-action panel with interlock state; Blocked disables execution.' },
  { key: 'timeline', name: 'Timeline', category: 'industrial', maps: null, variant: { prop: 'State', values: ['Default'] }, text: ['Label'], rtl: true, description: 'Event timeline row with timestamp and marker.' },
  { key: 'asset-status-block', name: 'AssetStatusBlock', category: 'industrial', maps: null, variant: { prop: 'Status', values: ['Running', 'Idle', 'Down', 'Maintenance'] }, text: ['Asset'], rtl: true, description: 'Asset health summary block; status is labelled and colour-supported.' },
]

/** @type {ReadonlyArray<Family>} */
const FAMILIES = [...PRIMITIVES, ...CORE, ...INDUSTRIAL]

module.exports = { PRIMITIVES, CORE, INDUSTRIAL, FAMILIES, TONE_TOKEN }

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

const { COLLECTIONS, KIND } = require('constants')
const { COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SHADOW_TOKENS, TEXT_STYLES } = require('tokens')
const { FAMILIES } = require('components')
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
 * @returns {{
 *   collections: any[], variables: any[], paintStyles: any[], textStyles: any[],
 *   effectStyles: any[], families: any[], section: any, assets: any[],
 *   counts: Record<string, number>
 * }}
 */
function buildSpec() {
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
    description: t.usage + ' · Managed by Hermes Design System Builder',
  }))

  // ── Effect styles ────────────────────────────────────────────────────────
  const effectStyles = SHADOW_TOKENS.map((s) => ({
    key: 'effectStyle:' + s.name, kind: KIND.EFFECT_STYLE, name: s.name,
    offset: s.offset, radius: s.radius, spread: s.spread, color: s.color,
    description: s.usage + ' · css: ' + s.cssVar + ' · Managed by Hermes Design System Builder',
  }))

  // ── Component families (one component SET each) ──────────────────────────
  const families = FAMILIES.map((f) => ({
    key: 'componentSet:' + f.key, kind: KIND.COMPONENT_SET, name: f.name,
    category: f.category, maps: f.maps, variantProp: f.variant.prop, variants: f.variant.values,
    text: f.text || [], bool: f.bool || [], rtl: !!f.rtl, description: f.description,
  }))

  const section = { key: 'section:generated', kind: KIND.SECTION, name: require('constants').SECTION_NAME }

  // ── Flatten in canonical apply order + attach content hashes ─────────────
  /** @type {any[]} */
  const assets = [section, ...collections, ...variables, ...paintStyles, ...textStyles, ...effectStyles, ...families]
  for (const a of assets) a.hash = hashAsset(hashPayload(a))

  const componentCount = families.reduce((n, f) => n + f.variants.length, 0)
  const counts = {
    collections: collections.length,
    variables: variables.length,
    paintStyles: paintStyles.length,
    textStyles: textStyles.length,
    effectStyles: effectStyles.length,
    families: families.length,
    components: componentCount,
    total: assets.length,
  }

  return { collections, variables, paintStyles, textStyles, effectStyles, families, section, assets, counts }
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

module.exports = { computePlan, renderPlanText }

  };
  __modules["figma-exec"] = function (module, exports, require) {
// @ts-check
'use strict'
/**
 * Figma executor — the ONLY part that touches the `figma` global. Runs inside
 * Figma Desktop. Implements Dry Run, Apply, Verify and Rollback on top of the
 * pure spec/plan.
 *
 * Safety invariants:
 *  - Every asset it creates is tagged in the `hermesDSB` shared-plugin-data
 *    namespace with a stable assetKey + content hash + runId.
 *  - Idempotency + rollback key off those markers (a LIVE scan of the file is
 *    the source of truth), so a rerun never duplicates and rollback removes
 *    ONLY plugin-created assets — the 34 reference frames (unmarked) are never
 *    read for mutation and never deleted.
 *  - Components are isolated inside one managed Section, away from (0,0).
 */

const C = require('constants')
const { buildSpec } = require('spec')
const { computePlan } = require('plan')
const { parseColor, FONTS } = require('tokens')
const { TONE_TOKEN } = require('components')

const NS = C.NAMESPACE
const K = C.KEYS

// ── shared-plugin-data tagging ─────────────────────────────────────────────
/**
 * Tag an asset as managed. RUN_ID records the run that FIRST created the asset
 * and is preserved across reruns/updates, so a runId-filtered rollback removes
 * exactly the assets that run created (not ones a later run merely re-touched).
 * @param {any} obj node/style/variable/collection
 * @param {{assetKey:string, kind:string, hash:string, runId:string}} t
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
/** @param {any} obj @returns {boolean} */
function isManaged(obj) {
  try { return obj.getSharedPluginData(NS, K.MANAGED) === '1' } catch (_e) { return false }
}
/** @param {any} obj @returns {{assetKey:string, kind:string, hash:string, runId:string}} */
function readTag(obj) {
  return {
    assetKey: obj.getSharedPluginData(NS, K.ASSET_KEY),
    kind: obj.getSharedPluginData(NS, K.ASSET_KIND),
    hash: obj.getSharedPluginData(NS, K.CONTENT_HASH),
    runId: obj.getSharedPluginData(NS, K.RUN_ID),
  }
}

// ── run id (deterministic identity does NOT depend on this) ────────────────
let _runSeq = 0
/** @returns {string} */
function newRunId() {
  _runSeq += 1
  // Date is available in a real plugin (unlike use_figma). Only used for grouping.
  return 'run-' + Date.now().toString(36) + '-' + _runSeq
}

// ── LIVE index: scan the file for our markers (source of truth) ────────────
/**
 * @returns {Promise<{ index: Record<string, {id:string, hash:string, kind:string}>,
 *   styles: {paint: Record<string,any>, text: Record<string,any>, effect: Record<string,any>},
 *   variables: Record<string, any>, collections: Record<string, any>,
 *   section: any|null, componentSets: Record<string, any> }>}
 */
async function buildLiveIndex() {
  /** @type {Record<string, {id:string, hash:string, kind:string}>} */
  const index = {}
  const paint = {}
  const text = {}
  const effect = {}
  const variables = {}
  const collections = {}
  const componentSets = {}
  let section = null

  const cols = await figma.variables.getLocalVariableCollectionsAsync()
  for (const c of cols) if (isManaged(c)) { const t = readTag(c); index[t.assetKey] = { id: c.id, hash: t.hash, kind: t.kind }; collections[t.assetKey] = c }

  const vars = await figma.variables.getLocalVariablesAsync()
  for (const v of vars) if (isManaged(v)) { const t = readTag(v); index[t.assetKey] = { id: v.id, hash: t.hash, kind: t.kind }; variables[t.assetKey] = v }

  for (const ps of await figma.getLocalPaintStylesAsync()) if (isManaged(ps)) { const t = readTag(ps); index[t.assetKey] = { id: ps.id, hash: t.hash, kind: t.kind }; paint[t.assetKey] = ps }
  for (const ts of await figma.getLocalTextStylesAsync()) if (isManaged(ts)) { const t = readTag(ts); index[t.assetKey] = { id: ts.id, hash: t.hash, kind: t.kind }; text[t.assetKey] = ts }
  for (const es of await figma.getLocalEffectStylesAsync()) if (isManaged(es)) { const t = readTag(es); index[t.assetKey] = { id: es.id, hash: t.hash, kind: t.kind }; effect[t.assetKey] = es }

  // The manifest node and any unkeyed managed node are intentionally NOT indexed
  // (they are bookkeeping, not plannable assets — otherwise they'd be flagged as
  // perpetual prune candidates and break the all-SKIP-on-rerun invariant).
  /** @param {any} node */
  const indexManaged = (node) => {
    const t = readTag(node)
    if (t.kind === C.KIND.MANIFEST || !t.assetKey) return
    index[t.assetKey] = { id: node.id, hash: t.hash, kind: t.kind }
    if (t.kind === C.KIND.COMPONENT_SET) componentSets[t.assetKey] = node
    if (t.kind === C.KIND.SECTION) section = node
  }
  for (const child of figma.currentPage.children) {
    if (isManaged(child)) indexManaged(child)
    if (child.type === 'SECTION') {
      if (isManaged(child) && readTag(child).kind === C.KIND.SECTION) section = child
      for (const sub of /** @type {any} */ (child).children || []) {
        if (isManaged(sub)) indexManaged(sub)
      }
    }
  }
  return { index, styles: { paint, text, effect }, variables, collections, section, componentSets }
}

// ── font resolution with transparent fallback ──────────────────────────────
/**
 * Loads every font the type ramp needs, falling back to Inter when the product
 * font is not installed, and records each substitution honestly.
 * @param {ReadonlyArray<any>} textStyleSpecs
 * @returns {Promise<{ resolve: (role:string, weight:string) => {family:string, style:string}, substitutions: string[] }>}
 */
async function resolveFonts(textStyleSpecs) {
  const available = await figma.listAvailableFontsAsync()
  const has = new Set(available.map((f) => f.fontName.family + ' ' + f.fontName.style))
  /** @type {string[]} */
  const substitutions = []
  /** @type {Record<string, {family:string, style:string}>} */
  const cache = {}

  /** @param {string} family @param {string} style */
  const tryLoad = async (family, style) => {
    if (!has.has(family + ' ' + style)) return false
    try { await figma.loadFontAsync({ family, style }); return true } catch (_e) { return false }
  }

  for (const t of textStyleSpecs) {
    const role = t.font // 'display' | 'body' | 'mono'
    const desired = FONTS[role]
    const key = role + '|' + t.weight
    if (cache[key]) continue
    let family = desired.family
    let style = t.weight
    let ok = await tryLoad(family, style)
    if (!ok && t.weight !== 'Regular' && (await tryLoad(family, 'Regular'))) {
      // Weight downgrade within the same family — record it honestly too.
      substitutions.push(family + ' ' + t.weight + ' → ' + family + ' Regular')
      style = 'Regular'
      ok = true
    }
    if (!ok) {
      // Fall back to Inter with the closest available weight.
      const fb = desired.fallback
      const fbStyle = ['Bold', 'Semi Bold', 'Medium', 'Regular'].find((w) => has.has(fb + ' ' + w)) || 'Regular'
      await figma.loadFontAsync({ family: fb, style: fbStyle })
      substitutions.push(family + ' ' + t.weight + ' → ' + fb + ' ' + fbStyle)
      family = fb; style = fbStyle
    }
    cache[key] = { family, style }
  }
  return {
    resolve: (role, weight) => cache[role + '|' + weight] || cache[role + '|Regular'] || { family: 'Inter', style: 'Regular' },
    substitutions,
  }
}

// ── small paint helpers ────────────────────────────────────────────────────
/** @param {string} value @returns {any} solid paint */
function solidPaint(value) {
  const c = parseColor(value)
  const p = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b } }
  if (c.a < 1) /** @type {any} */ (p).opacity = c.a
  return p
}

// ── creators (idempotent: reuse live object when present) ──────────────────
/**
 * @param {any} specEntry
 * @param {any} live
 * @param {{assetKey:string, hash:string, runId:string}} meta
 * @returns {any} collection
 */
function upsertCollection(specEntry, live, meta) {
  let col = live.collections[specEntry.key]
  if (!col) {
    col = figma.variables.createVariableCollection(specEntry.name)
    live.collections[specEntry.key] = col
  } else if (col.name !== specEntry.name) {
    col.name = specEntry.name
  }
  try { if (col.modes[0] && col.modes[0].name !== specEntry.modeName) col.renameMode(col.defaultModeId, specEntry.modeName) } catch (_e) { /* mode rename best-effort */ }
  tag(col, { assetKey: specEntry.key, kind: C.KIND.COLLECTION, hash: specEntry.hash, runId: meta.runId })
  return col
}

/**
 * @param {any} v spec variable
 * @param {any} live
 * @param {string} runId
 * @returns {any} variable
 */
function upsertVariable(v, live, runId) {
  const col = live.collections[v.collectionKey]
  if (!col) throw new Error('collection missing for ' + v.key)
  let variable = live.variables[v.key]
  if (!variable) {
    variable = figma.variables.createVariable(v.name, col, v.resolvedType)
    live.variables[v.key] = variable
  } else if (variable.name !== v.name) {
    variable.name = v.name
  }
  try { variable.scopes = v.scopes } catch (_e) { /* invalid scope ignored */ }
  variable.description = v.description
  const modeId = col.defaultModeId
  if (v.resolvedType === 'COLOR') variable.setValueForMode(modeId, parseColor(v.value))
  else variable.setValueForMode(modeId, v.floatValue)
  tag(variable, { assetKey: v.key, kind: C.KIND.VARIABLE, hash: v.hash, runId })
  return variable
}

/**
 * @param {any} p spec paintStyle
 * @param {any} live
 * @param {string} runId
 * @returns {any} paint style
 */
function upsertPaintStyle(p, live, runId) {
  let ps = live.styles.paint[p.key]
  if (!ps) { ps = figma.createPaintStyle(); live.styles.paint[p.key] = ps }
  ps.name = p.name
  ps.description = p.description
  let paint = solidPaint(p.value)
  const variable = live.variables[p.variableKey]
  if (variable) {
    try { paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable) } catch (_e) { /* keep raw */ }
  }
  ps.paints = [paint]
  tag(ps, { assetKey: p.key, kind: C.KIND.PAINT_STYLE, hash: p.hash, runId })
  return ps
}

/**
 * @param {any} t spec textStyle
 * @param {any} live
 * @param {{resolve:Function}} fonts
 * @param {string} runId
 */
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

/**
 * @param {any} e spec effectStyle
 * @param {any} live
 * @param {string} runId
 */
function upsertEffectStyle(e, live, runId) {
  let es = live.styles.effect[e.key]
  if (!es) { es = figma.createEffectStyle(); live.styles.effect[e.key] = es }
  es.name = e.name
  es.description = e.description
  es.effects = [{
    type: 'DROP_SHADOW',
    color: { r: e.color[0], g: e.color[1], b: e.color[2], a: e.color[3] },
    offset: { x: e.offset.x, y: e.offset.y },
    radius: e.radius,
    spread: e.spread,
    visible: true,
    blendMode: 'NORMAL',
  }]
  tag(es, { assetKey: e.key, kind: C.KIND.EFFECT_STYLE, hash: e.hash, runId })
  return es
}

// ── section + component family builder ─────────────────────────────────────
/**
 * @param {any} sectionSpec
 * @param {any} live
 * @param {string} runId
 */
function ensureSection(sectionSpec, live, runId) {
  let section = live.section
  if (!section) {
    const sec = /** @type {any} */ (figma.createSection())
    // Position to the right of everything already on the page (never over (0,0)).
    let maxX = 0
    for (const ch of figma.currentPage.children) maxX = Math.max(maxX, ch.x + ch.width)
    sec.x = maxX + 400
    sec.y = 0
    try { sec.resizeWithoutConstraints(2400, 1600) } catch (_e) { try { sec.resize(2400, 1600) } catch (_e2) { /* ignore */ } }
    section = sec
    live.section = sec
  }
  section.name = sectionSpec.name
  tag(section, { assetKey: sectionSpec.key, kind: C.KIND.SECTION, hash: sectionSpec.hash, runId })
  return section
}

/**
 * Build (or rebuild) one component SET for a family: a variant component per
 * value, auto-layout, token-bound fills via paint styles, an applied text style
 * label, then combineAsVariants + component properties.
 * @param {any} fam spec family
 * @param {any} live
 * @param {any} ctx { section, paintByToken, textStyleByName, effectByName, fonts, runId }
 * @returns {Promise<{ set:any, fidelity:string }>}
 */
async function upsertFamily(fam, live, ctx) {
  // Remove a stale managed set with the same key so rebuild stays idempotent.
  const existing = live.componentSets[fam.key]
  if (existing) { try { existing.remove() } catch (_e) { /* ignore */ } delete live.componentSets[fam.key] }

  const surfaceStyle = ctx.paintByToken['Color/Surface/Primary']
  const borderStyle = ctx.paintByToken['Color/Border/Default']
  const titleStyle = ctx.textStyleByName['Title/S'] || null

  /** @param {any} node @param {string} method @param {string} id */
  const applyStyle = async (node, method, id) => { try { await node[method](id) } catch (_e) { /* style apply best-effort */ } }

  /** @type {any[]} */
  const variantComponents = []
  for (const value of fam.variants) {
    const comp = figma.createComponent()
    comp.name = fam.variantProp + '=' + value
    comp.layoutMode = 'VERTICAL'
    comp.primaryAxisSizingMode = 'AUTO'
    comp.counterAxisSizingMode = 'AUTO'
    comp.itemSpacing = 8
    comp.paddingLeft = 16; comp.paddingRight = 16; comp.paddingTop = 12; comp.paddingBottom = 12
    comp.cornerRadius = 8
    comp.strokes = [solidPaint('#203743')]
    comp.strokeWeight = 1
    ctx.section.appendChild(comp)
    if (surfaceStyle) await applyStyle(comp, 'setFillStyleIdAsync', surfaceStyle.id)
    if (borderStyle) await applyStyle(comp, 'setStrokeStyleIdAsync', borderStyle.id)

    // Family title
    const title = figma.createText()
    title.fontName = ctx.fonts.resolve('body', 'Semi Bold')
    title.characters = fam.name
    comp.appendChild(title)
    if (titleStyle) await applyStyle(title, 'setTextStyleIdAsync', titleStyle.id)
    const primaryText = ctx.paintByToken['Color/Text/Primary']
    if (primaryText) await applyStyle(title, 'setFillStyleIdAsync', primaryText.id)

    // Variant value chip, tone-coloured when the value maps to a semantic token
    const chip = figma.createText()
    chip.fontName = ctx.fonts.resolve('body', 'Medium')
    chip.characters = fam.variantProp + ': ' + value
    comp.appendChild(chip)
    const toneToken = TONE_TOKEN[value]
    const toneStyle = toneToken ? ctx.paintByToken[toneToken] : ctx.paintByToken['Color/Text/Secondary']
    if (toneStyle) await applyStyle(chip, 'setFillStyleIdAsync', toneStyle.id)

    variantComponents.push(comp)
  }

  // Combine into a variant set inside the section
  let set
  try {
    set = figma.combineAsVariants(variantComponents, ctx.section)
  } catch (_e) {
    // Fallback: keep the first component as the asset and remove the rest so no
    // untagged orphan components are left behind (they would escape rollback).
    for (let i = 1; i < variantComponents.length; i++) { try { variantComponents[i].remove() } catch (_e2) { /* ignore */ } }
    set = variantComponents[0]
  }
  set.name = fam.name
  set.description = fam.description + (fam.maps ? '\nMaps to ' + fam.maps : '')
  // Best-effort NATIVE accessibility annotation (in addition to the description).
  try { /** @type {any} */ (set).annotations = [{ label: fam.description }] } catch (_e) { /* annotations best-effort */ }
  try {
    set.layoutMode = 'HORIZONTAL'
    set.itemSpacing = 16
    set.paddingLeft = 16; set.paddingRight = 16; set.paddingTop = 16; set.paddingBottom = 16
  } catch (_e) { /* single component has no set layout */ }

  // Component properties: TEXT props + an RTL boolean (definitions; layer binding is a follow-up)
  let propsAdded = 0
  try {
    for (const tp of fam.text || []) { set.addComponentProperty(tp, 'TEXT', ''); propsAdded++ }
  } catch (_e) { /* property add best-effort */ }
  try {
    for (const bp of fam.bool || []) { set.addComponentProperty(bp, 'BOOLEAN', false); propsAdded++ }
  } catch (_e) { /* ignore */ }
  if (fam.rtl) { try { set.addComponentProperty('RTL', 'BOOLEAN', false); propsAdded++ } catch (_e) { /* ignore */ } }

  tag(set, { assetKey: fam.key, kind: C.KIND.COMPONENT_SET, hash: fam.hash, runId: ctx.runId })
  live.componentSets[fam.key] = set
  return { set, fidelity: 'foundation-scaffold (' + fam.variants.length + ' variants, ' + propsAdded + ' props)' }
}

// ── grid layout for component sets inside the section ──────────────────────
/** @param {any[]} sets @param {any} section */
function layoutSets(sets, section) {
  const COLS = 6
  const CW = 360
  const CH = 240
  const PAD = 40
  sets.forEach((s, i) => {
    if (!s) return
    const col = i % COLS
    const row = Math.floor(i / COLS)
    try { s.x = section.x + PAD + col * CW; s.y = section.y + 80 + row * CH } catch (_e) { /* ignore */ }
  })
}

// ── top-level operations ───────────────────────────────────────────────────
/**
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<any>}
 */
async function run(options) {
  const dryRun = !!(options && options.dryRun)
  const spec = buildSpec()
  const live = await buildLiveIndex()
  const plan = computePlan(spec, live.index)

  if (dryRun) {
    return { ok: true, mode: 'dry-run', counts: spec.counts, plan, manifestPresent: !!live.section }
  }

  const runId = newRunId()
  const errors = []
  const fonts = await resolveFonts(spec.textStyles)

  // Map ops by key so the family loop can honour skip (and preserve node IDs).
  const opByKey = {}
  for (const op of plan.ops) opByKey[op.key] = op

  try {
    // section
    ensureSection(spec.section, live, runId)
    // collections
    for (const col of spec.collections) upsertCollection(col, live, { assetKey: col.key, hash: col.hash, runId })
    // variables
    for (const v of spec.variables) { try { upsertVariable(v, live, runId) } catch (e) { errors.push('variable ' + v.key + ': ' + e.message) } }
    // paint styles (bind to variables)
    const paintByToken = {}
    for (const p of spec.paintStyles) { try { const ps = upsertPaintStyle(p, live, runId); paintByToken[p.name] = ps } catch (e) { errors.push('paintStyle ' + p.key + ': ' + e.message) } }
    // text styles
    const textStyleByName = {}
    for (const t of spec.textStyles) { try { const ts = upsertTextStyle(t, live, fonts, runId); textStyleByName[t.name] = ts } catch (e) { errors.push('textStyle ' + t.key + ': ' + e.message) } }
    // effect styles
    const effectByName = {}
    for (const e of spec.effectStyles) { try { const es = upsertEffectStyle(e, live, runId); effectByName[e.name] = es } catch (er) { errors.push('effectStyle ' + e.key + ': ' + er.message) } }

    // component families — rebuild only when changed; skip preserves node IDs.
    const ctx = { section: live.section, paintByToken, textStyleByName, effectByName, fonts, runId }
    const builtSets = []
    const fidelity = []
    for (const fam of spec.families) {
      const op = opByKey[fam.key]
      if (op && op.action === 'skip' && live.componentSets[fam.key]) {
        builtSets.push(live.componentSets[fam.key])
        fidelity.push({ family: fam.name, fidelity: 'unchanged (skipped, id preserved)' })
        continue
      }
      try { const r = await upsertFamily(fam, live, ctx); builtSets.push(r.set); fidelity.push({ family: fam.name, fidelity: r.fidelity }) }
      catch (e) { errors.push('family ' + fam.key + ': ' + e.message); builtSets.push(null) }
    }
    layoutSets(builtSets, live.section)

    // record run on manifest node
    await writeManifest(live, runId, spec, plan)

    return {
      ok: errors.length === 0,
      mode: 'apply',
      runId,
      counts: spec.counts,
      plan,
      applied: { create: plan.summary.create, update: plan.summary.update, skip: plan.summary.skip },
      fontSubstitutions: fonts.substitutions,
      fidelity,
      errors,
    }
  } catch (e) {
    return { ok: false, mode: 'apply', runId, error: e.message, errors }
  }
}

/**
 * VERIFY: confirm every spec asset exists and its recorded hash matches.
 * @returns {Promise<any>}
 */
async function verify() {
  const spec = buildSpec()
  const live = await buildLiveIndex()
  const present = []
  const missing = []
  const drifted = []
  for (const a of spec.assets) {
    const e = live.index[a.key]
    if (!e) { missing.push({ key: a.key, kind: a.kind, name: a.name }); continue }
    if (e.hash !== a.hash) drifted.push({ key: a.key, kind: a.kind, name: a.name, recorded: e.hash, expected: a.hash })
    else present.push(a.key)
  }
  // Reference-frame guard: how many top-level frames exist that are NOT managed.
  let referenceFrames = 0
  for (const ch of figma.currentPage.children) if (!isManaged(ch)) referenceFrames++
  return {
    ok: missing.length === 0 && drifted.length === 0,
    present: present.length,
    missing,
    drifted,
    referenceFramesPreserved: referenceFrames,
    total: spec.assets.length,
  }
}

/**
 * ROLLBACK: remove plugin-created assets. When runId is given, only assets from
 * that run are removed. Never touches anything without the managed marker.
 * @param {{ runId?: string|null }} [options]
 * @returns {Promise<any>}
 */
async function rollback(options) {
  const filterRun = options && options.runId ? options.runId : null
  const removed = { variables: 0, collections: 0, paintStyles: 0, textStyles: 0, effectStyles: 0, componentSets: 0, manifest: 0, section: 0 }
  const errors = []
  const notes = []

  /** @param {any} obj @returns {boolean} */
  const inScope = (obj) => isManaged(obj) && (!filterRun || obj.getSharedPluginData(NS, K.RUN_ID) === filterRun)

  // Order: components → styles → variables → collections → section (dependency-safe).
  for (const ch of [...figma.currentPage.children]) {
    if (ch.type === 'SECTION') {
      for (const sub of [...(/** @type {any} */ (ch).children || [])]) {
        if (!inScope(sub)) continue
        const kind = sub.getSharedPluginData(NS, K.ASSET_KIND)
        try { sub.remove(); if (kind === C.KIND.MANIFEST) removed.manifest++; else removed.componentSets++ } catch (e) { errors.push(e.message) }
      }
    }
  }
  for (const ps of await figma.getLocalPaintStylesAsync()) if (inScope(ps)) { try { ps.remove(); removed.paintStyles++ } catch (e) { errors.push(e.message) } }
  for (const ts of await figma.getLocalTextStylesAsync()) if (inScope(ts)) { try { ts.remove(); removed.textStyles++ } catch (e) { errors.push(e.message) } }
  for (const es of await figma.getLocalEffectStylesAsync()) if (inScope(es)) { try { es.remove(); removed.effectStyles++ } catch (e) { errors.push(e.message) } }
  for (const v of await figma.variables.getLocalVariablesAsync()) if (inScope(v)) { try { v.remove(); removed.variables++ } catch (e) { errors.push(e.message) } }
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) if (inScope(c)) { try { c.remove(); removed.collections++ } catch (e) { errors.push(e.message) } }
  // Remove the managed section last — ONLY when it is now empty, so the section's
  // cascading delete can never take out-of-scope managed nodes (other runs) or any
  // unmanaged content a user may have dragged inside it.
  for (const ch of [...figma.currentPage.children]) {
    if (ch.type === 'SECTION' && inScope(ch)) {
      const remaining = (/** @type {any} */ (ch).children || []).length
      if (remaining === 0) { try { ch.remove(); removed.section++ } catch (e) { errors.push(e.message) } }
      else notes.push('section kept: ' + remaining + ' out-of-scope/user child(ren) remain')
    }
  }
  return { ok: errors.length === 0, scope: filterRun || 'all-managed', removed, notes, errors }
}

// ── manifest node (audit / run history; idempotency uses live markers) ─────
const CHUNK = 60000
/** @param {any} node @param {string} base @param {string} str */
function writeChunked(node, base, str) {
  const n = Math.max(1, Math.ceil(str.length / CHUNK))
  node.setSharedPluginData(NS, base + ':count', String(n))
  for (let i = 0; i < n; i++) node.setSharedPluginData(NS, base + ':' + i, str.slice(i * CHUNK, (i + 1) * CHUNK))
}

/**
 * Rebuild the authoritative assetKey -> {id, hash, kind} index from the live
 * objects touched THIS run (buildLiveIndex only saw pre-existing assets, so on a
 * fresh file it starts empty — read the ids/tags back off what we created).
 * @param {any} live
 * @returns {Record<string, {id:string, hash:string, kind:string}>}
 */
function rebuildIndexFromLive(live) {
  /** @type {Record<string, {id:string, hash:string, kind:string}>} */
  const idx = {}
  /** @param {any} obj */
  const add = (obj) => {
    if (!obj) return
    try { const t = readTag(obj); if (t.assetKey) idx[t.assetKey] = { id: obj.id, hash: t.hash, kind: t.kind } } catch (_e) { /* ignore */ }
  }
  const groups = [live.collections, live.variables, live.styles.paint, live.styles.text, live.styles.effect, live.componentSets]
  for (const g of groups) for (const k of Object.keys(g || {})) add(g[k])
  add(live.section)
  return idx
}

/**
 * @param {any} live
 * @param {string} runId
 * @param {any} spec
 * @param {any} plan
 */
async function writeManifest(live, runId, spec, plan) {
  const section = live.section
  if (!section) return
  let node = section.children.find((/** @type {any} */ n) => n.getSharedPluginData(NS, K.ASSET_KIND) === C.KIND.MANIFEST)
  if (!node) {
    node = figma.createFrame()
    node.name = C.MANIFEST_NODE_NAME
    node.resize(24, 24)
    node.visible = false
    section.appendChild(node)
  }
  const index = rebuildIndexFromLive(live)
  const payload = { pluginVersion: C.PLUGIN_VERSION, lastRunId: runId, counts: spec.counts, summary: plan.summary, index }
  writeChunked(node, 'manifest', JSON.stringify(payload))
  node.setSharedPluginData(NS, K.MANAGED, '1')
  node.setSharedPluginData(NS, K.ASSET_KIND, C.KIND.MANIFEST)
  // Reserved assetKey so the node is never re-planned as a prune orphan.
  node.setSharedPluginData(NS, K.ASSET_KEY, 'manifest:node')
  node.setSharedPluginData(NS, K.RUN_ID, runId)
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
        const res = await exec.run({ dryRun: true })
        post('dry-run', Object.assign({}, res, { text: renderPlanText(res.plan) }))
        break
      }
      case 'apply': {
        const res = await exec.run({ dryRun: false })
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

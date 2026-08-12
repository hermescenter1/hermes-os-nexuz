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

const DNA = require('./dna-tokens')
const { PAGES } = require('./dna-structure')
const { FAMILIES, variantCombos, variantName, assertVariantBudget, assertLocaleIsNeverAVariant } = require('./dna-components')

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
 * Recursively canonical JSON. `JSON.stringify(value, Object.keys(value).sort())`
 * is not sufficient: its replacer array applies at every depth and silently
 * drops nested keys that do not also exist at the root. Component axes, locale
 * defaults and nested geometry are identity-bearing and must never disappear.
 *
 * @param {any} value
 * @returns {string}
 */
function canonicalStringify(value) {
  const seen = new Set()

  /** @param {any} input @returns {string|undefined} */
  const encode = (input) => {
    if (input && typeof input.toJSON === 'function') input = input.toJSON()
    if (input === null) return 'null'
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input)
    if (typeof input === 'number') return Number.isFinite(input) ? JSON.stringify(input) : 'null'
    if (typeof input === 'bigint') throw new TypeError('BigInt cannot be canonicalised as JSON')
    if (typeof input === 'undefined' || typeof input === 'function' || typeof input === 'symbol') return undefined

    if (seen.has(input)) throw new TypeError('Cannot canonicalise a circular structure')
    seen.add(input)
    let encoded
    if (Array.isArray(input)) {
      encoded = '[' + input.map((item) => encode(item) ?? 'null').join(',') + ']'
    } else {
      const entries = []
      for (const key of Object.keys(input).sort()) {
        const item = encode(input[key])
        if (item !== undefined) entries.push(JSON.stringify(key) + ':' + item)
      }
      encoded = '{' + entries.join(',') + '}'
    }
    seen.delete(input)
    return encoded
  }

  const result = encode(value)
  if (result === undefined) throw new TypeError('Root value is not representable as canonical JSON')
  return result
}

/**
 * FNV-1a over the canonical JSON of an asset's identity payload. Deterministic
 * across runs and platforms — this is what makes re-running the plugin a
 * surgical UPDATE of only changed assets rather than a duplicate-everything
 * disaster.
 * @param {any} payload
 * @returns {string}
 */
function hashAsset(payload) {
  const s = canonicalStringify(payload)
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
 * @returns {{pages:any[], sections:any[], collections:any[], variables:any[], paintStyles:any[], effectStyles:any[], componentSets:any[], docs:any[], assets:any[], counts:Record<string,number>}}
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
      key: 'componentSet:' + f.key, familyKey: f.key, kind: 'componentSet', name: f.name,
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

module.exports = { buildDnaSpec, COLLECTIONS, SCOPES, MODE, slug, canonicalStringify, hashAsset }

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

const { KIND, REVISIONS, PAGES, SECTIONS } = require('./constants')
const { COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SHADOW_TOKENS, GLASS_TOKENS, TEXT_STYLES } = require('./tokens')
const { FAMILIES, variantCombos } = require('./components')
const { buildScreens } = require('./screens')
const { buildColorSwatchesSpec, buildTypeRampSpec, buildScaleSpec, buildElevationSpec } = require('./docs')
const { modeStrategy } = require('./starter')
const { slug, hashAsset } = require('./util')

const MODE = modeStrategy().modeName // 'Value'

const COLLECTIONS = require('./constants').COLLECTIONS

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

// @ts-check
'use strict'
/**
 * buildSpec() — the deterministic, pure declaration of EVERY native asset the
 * plugin will create, in canonical apply order (foundation before components;
 * collections before their variables; variables before the paint styles that
 * bind them). No `figma` here — this is the single source the Dry Run reports
 * and the Apply executor consumes.
 */

const { COLLECTIONS, KIND, REVISIONS, SECTION2_NAME } = require('./constants')
const { COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, SHADOW_TOKENS, TEXT_STYLES } = require('./tokens')
const { FAMILIES, variantCombos } = require('./components')
const { buildAssemblies } = require('./assemblies')
const { modeStrategy } = require('./starter')
const { slug, hashAsset } = require('./util')

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

  const section = { key: 'section:generated', kind: KIND.SECTION, name: require('./constants').SECTION_NAME }
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

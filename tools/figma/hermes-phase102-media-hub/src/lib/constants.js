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

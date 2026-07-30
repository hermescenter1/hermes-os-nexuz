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
  assembly: 1, // native reference assemblies revision
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

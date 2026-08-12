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

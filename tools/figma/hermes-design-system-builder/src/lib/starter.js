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

// @ts-check
'use strict'
/**
 * THE PHASE 104 ASSET CONTRACT — fail-closed.
 *
 * Why this file exists: a Dry Run was performed against the WRONG plugin (the
 * Phase 87 `Hermes Design System Builder`, id com.hermesnovin.design-system-builder,
 * which produces 173 assets including 8 text styles and 36 reference assemblies —
 * things this plugin has no code to create). The numbers looked plausible, and
 * nothing in the UI made it obvious which plugin was actually running.
 *
 * From now on the plugin refuses to Dry Run or Apply unless the computed spec
 * matches this contract EXACTLY. If a genuine design change alters a count, the
 * contract must be edited deliberately, in the same commit, with the reason
 * recorded — that is the point. It is never to be nudged to make a run go green.
 *
 * PLUGIN_IDENTITY is asserted against manifest.json at build time, so a mismatched
 * or swapped manifest cannot silently ship.
 */

const PLUGIN_IDENTITY = Object.freeze({
  name: 'Hermes Phase 104 Visual System',
  id: 'com.hermesnovin.phase104-visual-system',
})

/**
 * Expected asset counts. These are the owner-stated Phase 104 expectation and the
 * spec produces them exactly — neither side was adjusted to fit the other.
 */
const EXPECTED = Object.freeze({
  pages: 3,
  sections: 23,
  collections: 6,
  variables: 102,
  paintStyles: 43,
  effectStyles: 4,
  componentSets: 24,
  componentVariants: 226,
  appliableTotal: 205,
  docsDeclaredNotAppliable: 4,
})

/**
 * Counts that must be ZERO. These are the Phase 87 fingerprints: if any of them is
 * non-zero, the wrong plugin is running, full stop.
 */
const MUST_BE_ABSENT = Object.freeze(['textStyles', 'assemblies', 'families', 'components'])

/**
 * @param {Record<string, number>} counts
 * @returns {{ok: boolean, mismatches: string[], absent: string[]}}
 */
function checkContract(counts) {
  /** @type {string[]} */ const mismatches = []
  /** @type {string[]} */ const absent = []

  for (const [k, want] of Object.entries(EXPECTED)) {
    const got = counts[k]
    if (got !== want) mismatches.push(k + ': expected ' + want + ', got ' + (got === undefined ? 'undefined' : got))
  }
  for (const k of MUST_BE_ABSENT) {
    if (counts[k]) absent.push(k + '=' + counts[k] + ' (this is a Phase 87 asset kind — wrong plugin)')
  }
  return { ok: mismatches.length === 0 && absent.length === 0, mismatches, absent }
}

/**
 * Fail-closed gate. Throws with an actionable message rather than proceeding.
 * @param {Record<string, number>} counts
 * @param {string} [where]
 */
function assertContract(counts, where) {
  const r = checkContract(counts)
  if (r.ok) return true
  const lines = ['PHASE 104 ASSET CONTRACT VIOLATED' + (where ? ' during ' + where : '') + '.']
  if (r.absent.length) {
    lines.push('')
    lines.push('WRONG PLUGIN DETECTED — these asset kinds belong to the Phase 87 builder:')
    for (const a of r.absent) lines.push('  - ' + a)
    lines.push('')
    lines.push('You are running "Hermes Design System Builder"')
    lines.push('(com.hermesnovin.design-system-builder), NOT this plugin.')
    lines.push('Remove it from Plugins > Development and re-import from:')
    lines.push('  E:\\hermes-os-phase104\\tools\\figma\\hermes-phase104-visual-system\\manifest.json')
  }
  if (r.mismatches.length) {
    lines.push('')
    lines.push('Count mismatches:')
    for (const m of r.mismatches) lines.push('  - ' + m)
    lines.push('')
    lines.push('If a design change legitimately altered a count, edit EXPECTED in')
    lines.push('src/lib/contract.js deliberately and record why. Never nudge it to pass.')
  }
  throw new Error(lines.join('\n'))
}

module.exports = { PLUGIN_IDENTITY, EXPECTED, MUST_BE_ABSENT, checkContract, assertContract }

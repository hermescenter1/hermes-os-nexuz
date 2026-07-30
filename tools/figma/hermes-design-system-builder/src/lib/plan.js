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

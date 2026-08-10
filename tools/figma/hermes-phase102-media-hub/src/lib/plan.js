// @ts-check
'use strict'
/**
 * computePlan() — the deterministic, idempotent planner. Given the spec and
 * the index of assets a previous run recorded (from a LIVE scan of
 * shared-plugin-data markers), it decides for each asset: CREATE (new),
 * UPDATE (spec hash changed) or SKIP (unchanged), and flags PRUNE candidates
 * (recorded before but no longer in the spec). Pure — no `figma`.
 *
 * This is exactly what Dry Run reports; Apply then executes the same ops
 * against the file, one STAGE at a time (see figma-exec.js `run({stage})`),
 * which is what makes the build incremental and resumable: rerunning a stage
 * that partially completed only touches assets whose hash actually changed.
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

  /** @type {any[]} */
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
  lines.push('  screens to materialise: ' + plan.counts.screens)
  return lines.join('\n')
}

/**
 * Pure model of rollback scoping: given an index of managed assets carrying
 * the run that FIRST created each one, return the assetKeys a rollback would
 * remove. `runId` null/undefined = "all managed".
 * @param {Record<string, {runId?: string}>} index
 * @param {string|null} [runId]
 * @returns {string[]} assetKeys in scope, sorted
 */
function runScope(index, runId) {
  const keys = []
  for (const k of Object.keys(index || {})) {
    const e = index[k]
    if (!e) continue
    if (!runId || e.runId === runId) keys.push(k)
  }
  return keys.sort()
}

/**
 * Detect ownership ambiguity: two live managed objects claiming the SAME
 * assetKey. Apply must FAIL CLOSED on any ambiguity instead of guessing which
 * node to update. Pure: takes [{assetKey, id, kind}] observations in scan order.
 * @param {{assetKey:string, id:string, kind?:string}[]} observations
 * @returns {{assetKey:string, ids:string[]}[]} ambiguities (empty = safe)
 */
function detectAmbiguity(observations) {
  /** @type {Record<string, Set<string>>} */
  const seen = {}
  for (const o of observations || []) {
    if (!o || !o.assetKey) continue
    if (!seen[o.assetKey]) seen[o.assetKey] = new Set()
    seen[o.assetKey].add(o.id)
  }
  const out = []
  for (const k of Object.keys(seen)) if (seen[k].size > 1) out.push({ assetKey: k, ids: [...seen[k]].sort() })
  return out.sort((a, b) => (a.assetKey < b.assetKey ? -1 : 1))
}

/**
 * Filter a plan's ops to just the kinds relevant to one build STAGE, so Apply
 * can run incrementally: 'foundations' (collections/variables/paint/text/
 * effect styles + doc specimens), 'components' (component sets), 'screens'
 * (screen frames). 'all' returns every op, in spec order.
 * @param {'foundations'|'components'|'screens'|'all'} stage
 */
function stageKinds(stage) {
  if (stage === 'foundations') return new Set(['section', 'collection', 'variable', 'paintStyle', 'textStyle', 'effectStyle', 'doc'])
  if (stage === 'components') return new Set(['section', 'componentSet'])
  if (stage === 'screens') return new Set(['section', 'screen'])
  return null // 'all'
}

module.exports = { computePlan, renderPlanText, runScope, detectAmbiguity, stageKinds }

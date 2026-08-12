// @ts-check
'use strict'
/**
 * Plugin entry point (runs in Figma's main thread). Shows the UI and routes
 * its messages to the executor. No network; all work is local to the open
 * file. Apply is STAGED (foundations / components / screens / all) so a run
 * is incremental and resumable — see figma-exec.js `run({ stage })`.
 */

const C = require('./lib/constants')
const { buildSpec } = require('./lib/spec')
const { renderPlanText } = require('./lib/plan')
const starter = require('./lib/starter')
const exec = require('./lib/figma-exec')

figma.showUI(__html__, { width: 520, height: 720, title: C.PLUGIN_NAME })

/** @param {string} type @param {any} payload */
function post(type, payload) {
  figma.ui.postMessage({ type, payload })
}

figma.ui.onmessage = async (msg) => {
  const m = /** @type {any} */ (msg)
  try {
    switch (m && m.type) {
      case 'init': {
        const spec = buildSpec()
        const pagePlan = exec.checkPagePlan()
        post('meta', {
          name: C.PLUGIN_NAME,
          version: C.PLUGIN_VERSION,
          counts: spec.counts,
          pages: C.PAGE_NAMES,
          pagePlan,
          supported: starter.STARTER_SUPPORTED,
          deferred: starter.STARTER_DEFERRED,
          fileEdit: starter.FILE_EDIT_REQUIREMENT,
        })
        break
      }
      case 'dry-run': {
        const res = await exec.run({ dryRun: true, stage: m.stage || 'all' })
        post('dry-run', Object.assign({}, res, { text: renderPlanText(res.plan) }))
        break
      }
      case 'apply': {
        post('progress', { message: 'Applying stage "' + (m.stage || 'all') + '"…' })
        const res = await exec.run({ dryRun: false, stage: m.stage || 'all' })
        post('apply', res)
        break
      }
      case 'verify': {
        const res = await exec.verify()
        post('verify', res)
        break
      }
      case 'rollback': {
        const res = await exec.rollback({ runId: m.runId || null })
        post('rollback', res)
        break
      }
      case 'close':
        figma.closePlugin()
        break
      default:
        post('error', { message: 'Unknown message: ' + (m && m.type) })
    }
  } catch (e) {
    post('error', { message: (e && e.message) || String(e) })
  }
}

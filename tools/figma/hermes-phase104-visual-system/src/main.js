// @ts-check
'use strict'
/**
 * Plugin entry — Hermes Phase 104 Visual System.
 *
 * Three controls, all reversible, none destructive by default:
 *   Dry Run  — enumerate exactly what Apply would create/update/skip. No writes.
 *   Apply    — create or update the Phase 104 structure, tokens and components.
 *   Rollback — delete exactly the assets this plugin owns, and nothing else.
 *
 * FAIL-CLOSED IDENTITY GATE. Every Dry Run and every Apply first asserts the asset
 * contract. If the computed spec does not match Phase 104 exactly — or if any
 * Phase 87 asset kind appears — the run aborts before touching the file and the
 * UI says which plugin is actually loaded. This exists because a Dry Run was once
 * performed against the Phase 87 builder by mistake and the numbers looked
 * plausible enough to be believed.
 *
 * No network. Nothing leaves the file.
 */

const { applyDna, rollbackDna, scanExisting } = require('./lib/dna-exec')
const { buildDnaSpec } = require('./lib/dna-spec')
const { assertContract, PLUGIN_IDENTITY } = require('./lib/contract')
const FINGERPRINT = require('fingerprint') // synthetic module injected by build.mjs

figma.showUI(__html__, { width: 480, height: 640, themeColors: true })

/** @param {any} msg */
const post = (msg) => figma.ui.postMessage(msg)

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'init') {
      const spec = buildDnaSpec()
      const existing = await scanExisting()
      post({
        type: 'ready',
        fingerprint: FINGERPRINT,
        identity: PLUGIN_IDENTITY,
        counts: spec.counts,
        ownedInFile: Object.keys(existing).length,
        fileName: figma.root.name,
        pageCount: figma.root.children.length,
      })
      return
    }

    if (msg.type === 'dry-run' || msg.type === 'apply') {
      // Fail closed BEFORE any write.
      const spec = buildDnaSpec()
      assertContract(spec.counts, msg.type === 'apply' ? 'Apply' : 'Dry Run')

      const r = await applyDna({ dryRun: msg.type === 'dry-run' })
      post({ type: 'result', mode: msg.type === 'apply' ? 'Apply' : 'Dry Run', result: r, fingerprint: FINGERPRINT })
      return
    }

    if (msg.type === 'rollback') {
      const r = await rollbackDna()
      post({
        type: 'result', mode: 'Rollback', fingerprint: FINGERPRINT,
        result: { created: [], updated: [], skipped: [], errors: r.errors, removed: r.removed },
      })
      return
    }

    if (msg.type === 'close') figma.closePlugin()
  } catch (e) {
    post({ type: 'error', message: String(e && e.message ? e.message : e), fingerprint: FINGERPRINT })
  }
}

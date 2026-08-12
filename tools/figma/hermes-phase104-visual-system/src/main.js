// @ts-check
'use strict'
/**
 * Plugin entry — Hermes Phase 104 Visual System.
 *
 * Four controls, all scoped to this plugin, none destructive by default:
 *   Dry Run  — enumerate exactly what Apply would create/update/skip. No writes.
 *   Apply    — create or update the Phase 104 structure, tokens and components.
 *   Verify   — prove every expected managed asset is present and current.
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

const { applyDna, verifyDna, rollbackDna, scanExisting } = require('./lib/dna-exec')
const { buildDnaSpec } = require('./lib/dna-spec')
const { assertContract, PLUGIN_IDENTITY } = require('./lib/contract')
const FINGERPRINT = require('fingerprint') // synthetic module injected by build.mjs

let applyPermit = null

function fingerprintKey() {
  return [FINGERPRINT.pluginId, FINGERPRINT.headSha, FINGERPRINT.sourcesSha].join('|')
}

function assertRuntimeIdentity(where) {
  if (FINGERPRINT.plugin !== PLUGIN_IDENTITY.name || FINGERPRINT.pluginId !== PLUGIN_IDENTITY.id) {
    throw new Error('WRONG PLUGIN IDENTITY during ' + where + ' — remove and re-import the Phase 104 manifest.')
  }
  assertContract(FINGERPRINT.buildCounts || {}, where + ' build fingerprint')
  if (FINGERPRINT.dirty || !/^[0-9a-f]{40}$/.test(String(FINGERPRINT.headSha || '')) ||
      !/^[0-9a-f]{64}$/.test(String(FINGERPRINT.sourcesSha || ''))) {
    throw new Error('UNTRUSTED BUILD FINGERPRINT during ' + where +
      ' — clean-build the plugin; dirty/UNKNOWN builds cannot Dry Run, Apply or Verify.')
  }
}

figma.showUI(__html__, { width: 480, height: 640, themeColors: true })

/** @param {any} msg */
const post = (msg) => figma.ui.postMessage(msg)

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'init') {
      assertRuntimeIdentity('Init')
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

    if (msg.type === 'dry-run') {
      assertRuntimeIdentity('Dry Run')
      const spec = buildDnaSpec()
      assertContract(spec.counts, 'Dry Run')
      const r = await applyDna({ dryRun: true })
      applyPermit = r.errors.length === 0
        ? { fingerprint: fingerprintKey(), stateSignature: r.stateSignature }
        : null
      post({ type: 'result', mode: 'Dry Run', result: r, fingerprint: FINGERPRINT, applyPermitted: !!applyPermit })
      return
    }

    if (msg.type === 'apply') {
      assertRuntimeIdentity('Apply')
      if (!applyPermit || applyPermit.fingerprint !== fingerprintKey()) {
        throw new Error('APPLY BLOCKED — run a clean Dry Run on this exact build first.')
      }
      // Re-preview immediately before the first write. If the document changed
      // since Dry Run, the permit is invalid and must never be reused.
      const preview = await applyDna({ dryRun: true })
      if (preview.errors.length || preview.stateSignature !== applyPermit.stateSignature) {
        applyPermit = null
        throw new Error('APPLY BLOCKED — the Figma file changed after Dry Run; run Dry Run again.')
      }
      applyPermit = null
      const r = await applyDna({ dryRun: false })
      post({ type: 'result', mode: 'Apply', result: r, fingerprint: FINGERPRINT, applyPermitted: false })
      return
    }

    if (msg.type === 'verify') {
      assertRuntimeIdentity('Verify')
      const r = await verifyDna()
      post({ type: 'verify-result', mode: 'Verify', result: r, fingerprint: FINGERPRINT })
      return
    }

    if (msg.type === 'rollback') {
      applyPermit = null
      const r = await rollbackDna()
      post({
        type: 'result', mode: 'Rollback', fingerprint: FINGERPRINT,
        result: {
          created: [], updated: [], skipped: [], errors: r.errors, removed: r.removed,
          restored: r.restored, retained: r.retained,
        },
      })
      return
    }

    if (msg.type === 'close') figma.closePlugin()
  } catch (e) {
    applyPermit = null
    post({ type: 'error', message: String(e && e.message ? e.message : e), fingerprint: FINGERPRINT })
  }
}

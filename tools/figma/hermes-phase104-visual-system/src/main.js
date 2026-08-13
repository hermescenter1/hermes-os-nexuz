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
 * FAIL-CLOSED SINGLE-OPERATION LOCK. `figma.ui.onmessage` is async, so without a
 * lock a second message delivered while an operation is suspended on an `await`
 * runs its executor CONCURRENTLY against the same document. Apply performs
 * hundreds of interleaved writes across many awaits; a Verify — or a second
 * Apply — landing inside that window reads and writes a half-built file, and the
 * Apply that owns the write can be left partially completed. There is
 * deliberately NO queue: a message arriving while an operation runs is REJECTED
 * with OPERATION_IN_PROGRESS, never deferred, because running it later is the
 * same hazard moved in time. The lock is released in a `finally`, so a throwing
 * operation can never wedge the plugin shut.
 *
 * No network. Nothing leaves the file.
 */

const { applyDna, verifyDna, rollbackDna, scanExisting } = require('./lib/dna-exec')
const { buildDnaSpec } = require('./lib/dna-spec')
const { assertContract, PLUGIN_IDENTITY } = require('./lib/contract')
const FINGERPRINT = require('fingerprint') // synthetic module injected by build.mjs

let applyPermit = null

/**
 * The single-operation lock. Null when idle; `{type, operationId}` while an
 * operation owns the document. Every message type that reads or writes the file
 * is locked — `init` included, because its scan races an in-flight Apply exactly
 * as Verify does.
 * @type {{type:string, operationId:string|null}|null}
 */
let activeOperation = null

const LOCKED_MESSAGE_TYPES = ['init', 'dry-run', 'apply', 'verify', 'rollback']

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

/**
 * The operation bodies. Reached ONLY through the lock below — never call these
 * directly, or the single-operation guarantee is gone.
 * @param {string} type
 * @param {string|null} operationId
 */
async function runOperation(type, operationId) {
  if (type === 'init') {
    assertRuntimeIdentity('Init')
    const spec = buildDnaSpec()
    const existing = await scanExisting()
    post({
      type: 'ready',
      operationId,
      fingerprint: FINGERPRINT,
      identity: PLUGIN_IDENTITY,
      counts: spec.counts,
      ownedInFile: Object.keys(existing).length,
      fileName: figma.root.name,
      pageCount: figma.root.children.length,
    })
    return
  }

  if (type === 'dry-run') {
    assertRuntimeIdentity('Dry Run')
    const spec = buildDnaSpec()
    assertContract(spec.counts, 'Dry Run')
    const r = await applyDna({ dryRun: true })
    applyPermit = r.errors.length === 0
      ? { fingerprint: fingerprintKey(), stateSignature: r.stateSignature }
      : null
    post({
      type: 'result', mode: 'Dry Run', operationId, result: r,
      fingerprint: FINGERPRINT, applyPermitted: !!applyPermit,
    })
    return
  }

  if (type === 'apply') {
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
    post({
      type: 'result', mode: 'Apply', operationId, result: r,
      fingerprint: FINGERPRINT, applyPermitted: false,
    })
    return
  }

  if (type === 'verify') {
    assertRuntimeIdentity('Verify')
    const r = await verifyDna()
    post({ type: 'verify-result', mode: 'Verify', operationId, result: r, fingerprint: FINGERPRINT })
    return
  }

  if (type === 'rollback') {
    applyPermit = null
    const r = await rollbackDna()
    post({
      type: 'result', mode: 'Rollback', operationId, fingerprint: FINGERPRINT,
      result: {
        created: [], updated: [], skipped: [], errors: r.errors, removed: r.removed,
        restored: r.restored, retained: r.retained,
      },
    })
  }
}

figma.ui.onmessage = async (msg) => {
  const type = msg && msg.type ? String(msg.type) : ''
  const operationId = msg && msg.operationId != null ? String(msg.operationId) : null

  // Closing is the operator's own escape hatch and is never blocked.
  if (type === 'close') { figma.closePlugin(); return }
  if (LOCKED_MESSAGE_TYPES.indexOf(type) < 0) return

  if (activeOperation) {
    // Rejected, NOT queued, and the executor is never reached. The rejection
    // carries the rejected message's own operationId so the UI can tell it apart
    // from the result of the operation that is still running.
    post({
      type: 'error',
      code: 'OPERATION_IN_PROGRESS',
      operationId,
      rejectedType: type,
      activeType: activeOperation.type,
      message: 'OPERATION_IN_PROGRESS — "' + activeOperation.type + '" is still running. ' +
        '"' + type + '" was refused so it cannot run concurrently against the same file. ' +
        'Wait for the running operation to report completion, then try again.',
      fingerprint: FINGERPRINT,
    })
    return
  }

  activeOperation = { type, operationId }
  try {
    await runOperation(type, operationId)
  } catch (e) {
    applyPermit = null
    post({
      type: 'error', operationId, rejectedType: type,
      message: String(e && e.message ? e.message : e), fingerprint: FINGERPRINT,
    })
  } finally {
    activeOperation = null
  }
}

#!/usr/bin/env node
// @ts-check
// Deliberately not named *.test.mjs: the repository-wide runner is Vitest,
// while this dependency-free package intentionally uses Node's native runner.
//
// These tests execute the SHIPPED sources — src/main.js through a CommonJS
// shim, src/ui.html's script through node:vm — so a mutation applied to those
// files really changes behaviour here rather than merely failing a text match.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const { buildDnaSpec } = require('../src/lib/dna-spec.js')
const { PLUGIN_IDENTITY } = require('../src/lib/contract.js')

const MAIN_SOURCE_URL = new URL('../src/main.js', import.meta.url)
const UI_SOURCE_URL = new URL('../src/ui.html', import.meta.url)

/** Line endings normalised so a CRLF checkout cannot silence a mutation gate. */
const readSource = (url) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n')

const COUNTS = buildDnaSpec().counts
const HEAD_SHA = 'a'.repeat(40)
const SOURCES_SHA = 'b'.repeat(64)

// ── src/main.js harness ─────────────────────────────────────────────────────

function buildFingerprint() {
  return {
    plugin: PLUGIN_IDENTITY.name,
    pluginId: PLUGIN_IDENTITY.id,
    headSha: HEAD_SHA,
    headShaShort: HEAD_SHA.slice(0, 12),
    sourcesSha: SOURCES_SHA,
    sourcesShaShort: SOURCES_SHA.slice(0, 12),
    branch: 'test',
    dirty: false,
    buildCounts: COUNTS,
  }
}

function dryRunResult() {
  return {
    dryRun: true,
    created: [],
    updated: [],
    skipped: [],
    errors: [],
    fontSubstitutions: [],
    counts: COUNTS,
    stateSignature: 'state-signature-1',
    componentSetScan: { local: 0, fromTreeWalk: 0, fromDirectApi: 0, owned: 0, unclaimed: 0 },
    unclaimedComponentSets: [],
  }
}

/**
 * An instrumented stand-in for the executor module. Every entry point counts its
 * calls, so "did the second message reach an executor?" is answered by a number
 * rather than by inspecting a log line.
 */
function execStub(overrides = {}) {
  const calls = { applyDna: [], verifyDna: 0, rollbackDna: 0, scanExisting: 0 }
  return {
    calls,
    async scanExisting() { calls.scanExisting += 1; return {} },
    async applyDna(opts) {
      calls.applyDna.push(opts)
      if (overrides.applyDna) return overrides.applyDna(opts, dryRunResult())
      return dryRunResult()
    },
    async verifyDna() {
      calls.verifyDna += 1
      return {
        ok: true, verified: [], missing: [], drifted: [], duplicates: [], unexpected: [],
        errors: [], counts: COUNTS, stateSignature: 'state-signature-1',
        componentSetScan: { local: 0, fromTreeWalk: 0, fromDirectApi: 0, owned: 0, unclaimed: 0 },
      }
    },
    async rollbackDna() {
      calls.rollbackDna += 1
      return { removed: [], restored: [], retained: [], errors: [] }
    },
  }
}

function loadMain(source, exec) {
  const realRequire = createRequire(MAIN_SOURCE_URL)
  const posted = []
  const previousFigma = globalThis.figma
  const previousHtml = globalThis.__html__
  const closed = { count: 0 }
  globalThis.figma = {
    showUI() {},
    ui: { postMessage(message) { posted.push(message) }, onmessage: null },
    root: { name: 'fixture file', children: [] },
    closePlugin() { closed.count += 1 },
  }
  globalThis.__html__ = '<html></html>'
  const restore = () => { globalThis.figma = previousFigma; globalThis.__html__ = previousHtml }
  try {
    const shim = (id) => {
      if (id === 'fingerprint') return buildFingerprint()
      if (id === './lib/dna-exec') return exec
      return realRequire(id)
    }
    const loaded = { exports: {} }
    Function('require', 'module', 'exports', source)(shim, loaded, loaded.exports)
    return { onmessage: globalThis.figma.ui.onmessage, posted, closed, restore }
  } catch (e) {
    restore()
    throw e
  }
}

const lastPosted = (env) => env.posted[env.posted.length - 1]

// ── src/ui.html harness ─────────────────────────────────────────────────────

function uiScript(source) {
  const match = source.match(/<script>([\s\S]*?)<\/script>/)
  assert.ok(match, 'src/ui.html must carry exactly one inline script')
  return match[1]
}

function loadUi(script) {
  const ids = ['ctx', 'fp', 'c-total', 'c-variants', 'c-owned', 'dry', 'apply', 'verify', 'rollback', 'out']
  const elements = {}
  for (const id of ids) {
    elements[id] = { id, disabled: false, title: '', textContent: '', innerHTML: '', onclick: null, dataset: {} }
  }
  elements.fp.dataset.fingerprint = JSON.stringify({
    plugin: PLUGIN_IDENTITY.name,
    pluginId: PLUGIN_IDENTITY.id,
    headSha: HEAD_SHA,
    headShaShort: HEAD_SHA.slice(0, 12),
    branch: 'test',
    dirty: false,
    sourcesSha: SOURCES_SHA,
    sourcesShaShort: SOURCES_SHA.slice(0, 12),
    expectedTotal: COUNTS.appliableTotal,
  })
  const posted = []
  const context = vm.createContext({
    document: { getElementById: (id) => elements[id] },
    parent: { postMessage: (message) => posted.push(message) },
    confirm: () => true,
  })
  vm.runInContext(script, context)

  const deliver = (message) => context.onmessage({ data: { pluginMessage: message } })
  const sent = () => posted.map((entry) => entry.pluginMessage)
  const disabledState = () => ({
    dry: elements.dry.disabled,
    apply: elements.apply.disabled,
    verify: elements.verify.disabled,
    rollback: elements.rollback.disabled,
  })
  const settle = () => {
    // The panel opens by scanning the file; answer that init so the fixture
    // reaches the idle state a user actually sees.
    const pending = sent().filter((message) => message.type === 'init').pop()
    deliver({
      type: 'ready',
      operationId: pending.operationId,
      fingerprint: { pluginId: PLUGIN_IDENTITY.id, headSha: HEAD_SHA, sourcesSha: SOURCES_SHA },
      counts: COUNTS,
      ownedInFile: 181,
      fileName: 'fixture file',
      pageCount: 3,
    })
  }
  return { elements, posted, sent, deliver, disabledState, settle }
}

// ── runtime lock ────────────────────────────────────────────────────────────

test('a Verify delivered while Apply is suspended is refused and never reaches the executor', async () => {
  let releaseApply
  let signalApplyStarted
  const applyHang = new Promise((resolve) => { releaseApply = resolve })
  const applyStarted = new Promise((resolve) => { signalApplyStarted = resolve })
  const exec = execStub({
    applyDna: async (opts, dry) => {
      if (opts && opts.dryRun) return dry
      signalApplyStarted()
      await applyHang
      return Object.assign(dry, { dryRun: false })
    },
  })
  const env = loadMain(readSource(MAIN_SOURCE_URL), exec)
  try {
    await env.onmessage({ type: 'dry-run', operationId: 'op-1' })
    assert.equal(lastPosted(env).applyPermitted, true, 'the Dry Run must issue the Apply permit')

    const applying = env.onmessage({ type: 'apply', operationId: 'op-2' })
    await applyStarted

    await env.onmessage({ type: 'verify', operationId: 'op-3' })
    assert.equal(exec.calls.verifyDna, 0, 'Verify must never enter the executor while Apply owns the file')
    const refusal = lastPosted(env)
    assert.equal(refusal.type, 'error')
    assert.equal(refusal.code, 'OPERATION_IN_PROGRESS')
    assert.equal(refusal.operationId, 'op-3')
    assert.equal(refusal.rejectedType, 'verify')
    assert.equal(refusal.activeType, 'apply')

    releaseApply()
    await applying
    const applyResult = lastPosted(env)
    assert.equal(applyResult.mode, 'Apply')
    assert.equal(applyResult.operationId, 'op-2')

    // The lock was released, so the panel is usable again.
    await env.onmessage({ type: 'verify', operationId: 'op-4' })
    assert.equal(exec.calls.verifyDna, 1)
  } finally {
    env.restore()
  }
})

test('removing the runtime lock lets the concurrent Verify run against a half-applied file', async () => {
  const source = readSource(MAIN_SOURCE_URL)
  const lockStart = source.indexOf('  if (activeOperation) {')
  const lockEnd = source.indexOf('  activeOperation = { type, operationId }')
  assert.ok(lockStart > 0, 'main.js must own a single-operation lock')
  assert.ok(lockEnd > lockStart, 'the lock must be claimed straight after the refusal branch')
  assert.equal(source.split('  if (activeOperation) {').length - 1, 1)
  assert.equal(source.split('  activeOperation = { type, operationId }').length - 1, 1)

  let releaseApply
  let signalApplyStarted
  const applyHang = new Promise((resolve) => { releaseApply = resolve })
  const applyStarted = new Promise((resolve) => { signalApplyStarted = resolve })
  const exec = execStub({
    applyDna: async (opts, dry) => {
      if (opts && opts.dryRun) return dry
      signalApplyStarted()
      await applyHang
      return Object.assign(dry, { dryRun: false })
    },
  })
  const mutant = loadMain(source.replace(source.slice(lockStart, lockEnd), ''), exec)
  try {
    await mutant.onmessage({ type: 'dry-run', operationId: 'op-1' })
    const applying = mutant.onmessage({ type: 'apply', operationId: 'op-2' })
    await applyStarted
    await mutant.onmessage({ type: 'verify', operationId: 'op-3' })
    assert.equal(exec.calls.verifyDna, 1,
      'without the lock the concurrent Verify runs inside Apply — this is the regression being pinned')
    releaseApply()
    await applying
  } finally {
    mutant.restore()
  }
})

test('a second Apply arriving during the first is refused, not queued', async () => {
  let releaseApply
  let signalApplyStarted
  const applyHang = new Promise((resolve) => { releaseApply = resolve })
  const applyStarted = new Promise((resolve) => { signalApplyStarted = resolve })
  const exec = execStub({
    applyDna: async (opts, dry) => {
      if (opts && opts.dryRun) return dry
      signalApplyStarted()
      await applyHang
      return Object.assign(dry, { dryRun: false })
    },
  })
  const env = loadMain(readSource(MAIN_SOURCE_URL), exec)
  try {
    await env.onmessage({ type: 'dry-run', operationId: 'op-1' })
    const applying = env.onmessage({ type: 'apply', operationId: 'op-2' })
    await applyStarted
    const writesBefore = exec.calls.applyDna.filter((opts) => !opts.dryRun).length

    await env.onmessage({ type: 'apply', operationId: 'op-3' })
    assert.equal(lastPosted(env).code, 'OPERATION_IN_PROGRESS')
    assert.equal(exec.calls.applyDna.filter((opts) => !opts.dryRun).length, writesBefore,
      'the refused Apply must not start a second write pass')

    releaseApply()
    await applying
    // Nothing was queued: the refused Apply is gone, not deferred.
    assert.equal(exec.calls.applyDna.filter((opts) => !opts.dryRun).length, writesBefore)
  } finally {
    env.restore()
  }
})

test('a throwing Apply releases the lock in finally so the panel is not wedged shut', async () => {
  const source = readSource(MAIN_SOURCE_URL)
  const releaseGate = '  } finally {\n    activeOperation = null\n  }'
  assert.equal(source.split(releaseGate).length - 1, 1, 'the lock must be released in exactly one finally')

  const failing = () => execStub({
    applyDna: async (opts, dry) => {
      if (opts && opts.dryRun) return dry
      throw new Error('EXECUTOR EXPLODED')
    },
  })

  const env = loadMain(source, failing())
  try {
    await env.onmessage({ type: 'dry-run', operationId: 'op-1' })
    await env.onmessage({ type: 'apply', operationId: 'op-2' })
    const failure = lastPosted(env)
    assert.equal(failure.type, 'error')
    assert.equal(failure.message, 'EXECUTOR EXPLODED')
    assert.notEqual(failure.code, 'OPERATION_IN_PROGRESS')

    await env.onmessage({ type: 'dry-run', operationId: 'op-3' })
    assert.equal(lastPosted(env).mode, 'Dry Run', 'the next Dry Run must be accepted after a failed Apply')
  } finally {
    env.restore()
  }

  const mutant = loadMain(source.replace(releaseGate, '  }'), failing())
  try {
    await mutant.onmessage({ type: 'dry-run', operationId: 'op-1' })
    await mutant.onmessage({ type: 'apply', operationId: 'op-2' })
    await mutant.onmessage({ type: 'dry-run', operationId: 'op-3' })
    assert.equal(lastPosted(mutant).code, 'OPERATION_IN_PROGRESS',
      'without the finally, one failed Apply locks the plugin permanently')
  } finally {
    mutant.restore()
  }
})

test('the Apply permit still requires a clean Dry Run on this fingerprint and state signature', async () => {
  const exec = execStub()
  const env = loadMain(readSource(MAIN_SOURCE_URL), exec)
  try {
    await env.onmessage({ type: 'apply', operationId: 'op-1' })
    assert.match(lastPosted(env).message, /APPLY BLOCKED — run a clean Dry Run/)
    assert.equal(exec.calls.applyDna.length, 0, 'an unpermitted Apply must not call the executor at all')
  } finally {
    env.restore()
  }

  let signature = 'state-signature-1'
  const drifting = execStub({
    applyDna: async (opts, dry) => Object.assign(dry, { dryRun: !!(opts && opts.dryRun), stateSignature: signature }),
  })
  const drifted = loadMain(readSource(MAIN_SOURCE_URL), drifting)
  try {
    await drifted.onmessage({ type: 'dry-run', operationId: 'op-1' })
    signature = 'state-signature-2' // the file changed underneath the permit
    await drifted.onmessage({ type: 'apply', operationId: 'op-2' })
    assert.match(lastPosted(drifted).message, /APPLY BLOCKED — the Figma file changed after Dry Run/)
    assert.equal(drifting.calls.applyDna.filter((opts) => !opts.dryRun).length, 0)
  } finally {
    drifted.restore()
  }
})

// ── UI busy gate ────────────────────────────────────────────────────────────

test('every operational button is disabled while an operation is in flight', () => {
  const ui = loadUi(uiScript(readSource(UI_SOURCE_URL)))
  ui.settle()
  assert.deepEqual(ui.disabledState(), { dry: false, apply: true, verify: false, rollback: false },
    'idle: Apply alone stays shut until a clean Dry Run')

  ui.elements.dry.onclick()
  assert.deepEqual(ui.disabledState(), { dry: true, apply: true, verify: true, rollback: true },
    'busy: all four controls must be disabled')
})

test('removing the UI busy gate re-opens the double-submit hole', () => {
  const script = uiScript(readSource(UI_SOURCE_URL))
  const busyGate = [
    '    if (state.busy) return null',
    "    operationSequence += 1",
    "    var operationId = 'op-' + operationSequence",
    '    state.busy = { id: operationId, type: type }',
    '    refreshControls()',
  ].join('\n')
  assert.equal(script.split(busyGate).length - 1, 1, 'the panel must own exactly one busy gate')

  const mutantScript = script.replace(busyGate, [
    "    operationSequence += 1",
    "    var operationId = 'op-' + operationSequence",
  ].join('\n'))
  const mutant = loadUi(mutantScript)
  mutant.settle()
  mutant.elements.dry.onclick()
  assert.deepEqual(mutant.disabledState(), { dry: false, apply: true, verify: false, rollback: false },
    'without the busy gate the controls stay live during an operation')
})

test('a double-click on Apply sends exactly one message', () => {
  const ui = loadUi(uiScript(readSource(UI_SOURCE_URL)))
  ui.settle()

  const dryId = ui.sent().filter((message) => message.type === 'dry-run').pop()
  assert.equal(dryId, undefined)
  ui.elements.dry.onclick()
  const dryOperation = ui.sent().pop()
  ui.deliver({
    type: 'result', mode: 'Dry Run', operationId: dryOperation.operationId, applyPermitted: true,
    result: { created: [], updated: [], skipped: [], errors: [], counts: COUNTS },
  })
  ui.settle()
  assert.equal(ui.elements.apply.disabled, false, 'a clean Dry Run must unlock Apply')

  const before = ui.sent().filter((message) => message.type === 'apply').length
  ui.elements.apply.onclick()
  ui.elements.apply.onclick()
  ui.elements.apply.onclick()
  assert.equal(ui.sent().filter((message) => message.type === 'apply').length - before, 1,
    'only the first click may reach the runtime')
})

test('Apply shows the explicit do-not-close progress text', () => {
  const ui = loadUi(uiScript(readSource(UI_SOURCE_URL)))
  ui.settle()
  ui.elements.dry.onclick()
  const dryOperation = ui.sent().pop()
  ui.deliver({
    type: 'result', mode: 'Dry Run', operationId: dryOperation.operationId, applyPermitted: true,
    result: { created: [], updated: [], skipped: [], errors: [], counts: COUNTS },
  })
  ui.settle()

  ui.elements.apply.onclick()
  assert.equal(ui.elements.out.textContent,
    'Applying 24 Component Sets / 226 variants…\nDo not close the plugin until completion is reported.')
})

test('a complete Apply result enables Verify but never re-enables Apply without a new Dry Run', () => {
  const ui = loadUi(uiScript(readSource(UI_SOURCE_URL)))
  ui.settle()
  ui.elements.dry.onclick()
  ui.deliver({
    type: 'result', mode: 'Dry Run', operationId: ui.sent().pop().operationId, applyPermitted: true,
    result: { created: [], updated: [], skipped: [], errors: [], counts: COUNTS },
  })
  ui.settle()

  ui.elements.apply.onclick()
  const applyOperation = ui.sent().pop()
  assert.equal(ui.elements.verify.disabled, true, 'Verify stays shut for the whole of Apply')

  ui.deliver({
    type: 'result', mode: 'Apply', operationId: applyOperation.operationId, applyPermitted: false,
    result: { created: [], updated: [], skipped: [], errors: [], counts: COUNTS },
  })
  ui.settle()
  assert.equal(ui.elements.verify.disabled, false, 'a clean Apply result unlocks Verify')
  assert.equal(ui.elements.apply.disabled, true, 'Apply needs a fresh Dry Run permit every time')
})

test('an Apply that reports errors leaves Verify shut until a fresh Dry Run', () => {
  const ui = loadUi(uiScript(readSource(UI_SOURCE_URL)))
  ui.settle()
  ui.elements.dry.onclick()
  ui.deliver({
    type: 'result', mode: 'Dry Run', operationId: ui.sent().pop().operationId, applyPermitted: true,
    result: { created: [], updated: [], skipped: [], errors: [], counts: COUNTS },
  })
  ui.settle()

  ui.elements.apply.onclick()
  ui.deliver({
    type: 'result', mode: 'Apply', operationId: ui.sent().pop().operationId, applyPermitted: false,
    result: { created: [], updated: [], skipped: [], errors: ['componentSet Hermes/Button: boom'], counts: COUNTS },
  })
  ui.settle()
  assert.equal(ui.elements.verify.disabled, true, 'an incomplete Apply must not present itself as verifiable')
  assert.equal(ui.elements.dry.disabled, false, 'Dry Run remains the way back')
})

test('a stale or foreign operation id never releases the busy state', () => {
  const ui = loadUi(uiScript(readSource(UI_SOURCE_URL)))
  ui.settle()
  ui.elements.dry.onclick()
  const running = ui.sent().pop()

  ui.deliver({
    type: 'result', mode: 'Dry Run', operationId: 'op-from-a-previous-run', applyPermitted: true,
    result: { created: [], updated: [], skipped: [], errors: [], counts: COUNTS },
  })
  assert.deepEqual(ui.disabledState(), { dry: true, apply: true, verify: true, rollback: true },
    'a foreign result must not unlock the panel')

  ui.deliver({
    type: 'error', code: 'OPERATION_IN_PROGRESS', operationId: 'op-refused',
    rejectedType: 'verify', activeType: 'dry-run', message: 'OPERATION_IN_PROGRESS — refused',
  })
  assert.deepEqual(ui.disabledState(), { dry: true, apply: true, verify: true, rollback: true },
    'a refusal notice must not unlock the panel either')

  ui.deliver({
    type: 'result', mode: 'Dry Run', operationId: running.operationId, applyPermitted: true,
    result: { created: [], updated: [], skipped: [], errors: [], counts: COUNTS },
  })
  ui.settle()
  assert.equal(ui.elements.dry.disabled, false, 'the operation that was actually in flight releases it')
})

#!/usr/bin/env node
// @ts-check
// Deliberately not named *.test.mjs: the repository-wide runner is Vitest,
// while this dependency-free package intentionally uses Node's native runner.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  stripComments,
  findInExecutableCode,
  checkSharedPluginDataCalls,
} from './lib/code-scan.mjs'

const forbidden = (source) => findInExecutableCode(source, 'hermesDSB')

test('forbidden Phase 87 namespace is detected in executable strings and calls', () => {
  assert.equal(forbidden("getSharedPluginData('hermesDSB', 'k')").length, 1)
  assert.equal(forbidden('const ns = "hermesDSB"').length, 1)
  assert.equal(forbidden('const s = "a // not a comment hermesDSB"').length, 1)
  assert.equal(forbidden('const r = /hermesDSB\\/value/g').length, 1)
  assert.equal(forbidden('const t = `prefix ${"hermesDSB"}`').length, 1)
})

test('forbidden Phase 87 namespace inside comments is ignored', () => {
  assert.deepEqual(forbidden('// hermesDSB is the old namespace'), [])
  assert.deepEqual(forbidden('/* hermesDSB */'), [])
  assert.deepEqual(forbidden("// don't touch hermesDSB\nconst ok = true"), [])
  assert.deepEqual(forbidden('const t = `value ${/* hermesDSB */ NAMESPACE}`'), [])
})

test('comment stripping preserves line numbers and comment-like literal content', () => {
  const source = [
    '// first line',
    'const division = total / count',
    'const regex = /[/]\\/\\* hermesDSB/',
    '/* block',
    '   comment */ const actual = "hermesDSB"',
  ].join('\n')
  const stripped = stripComments(source)
  assert.equal(stripped.split('\n').length, source.split('\n').length)
  assert.match(stripped, /total \/ count/)
  assert.match(stripped, /hermesDSB/)
  assert.deepEqual(forbidden(source).map((h) => h.line), [3, 5])
})

test('shared-plugin-data calls must use NAMESPACE directly', () => {
  const good = [
    "node.getSharedPluginData(NAMESPACE, 'assetKey')",
    "node.setSharedPluginData(NAMESPACE, 'assetKey', key)",
    "// node.setSharedPluginData('hermesDSB', 'k', 'v')",
  ].join('\n')
  assert.deepEqual(checkSharedPluginDataCalls(good), [])

  const bad = [
    "node.getSharedPluginData('hermesP104', 'assetKey')",
    "node.setSharedPluginData(ns, 'assetKey', key)",
  ].join('\n')
  assert.deepEqual(checkSharedPluginDataCalls(bad).map((v) => [v.line, v.method, v.argument]), [
    [1, 'getSharedPluginData', "'hermesP104'"],
    [2, 'setSharedPluginData', 'ns'],
  ])
})

test('scanner mutation controls fail in both directions', () => {
  const production = "node.getSharedPluginData(NAMESPACE, 'k') // hermesDSB explanation"
  assert.deepEqual(checkSharedPluginDataCalls(production), [])
  assert.deepEqual(forbidden(production), [])

  const namespaceMutation = production.replace('NAMESPACE', "'hermesDSB'")
  assert.equal(checkSharedPluginDataCalls(namespaceMutation).length, 1)
  assert.equal(forbidden(namespaceMutation).length, 1)

  const commentMutation = production.replace('// hermesDSB explanation', 'const legacy = "hermesDSB"')
  assert.equal(forbidden(commentMutation).length, 1)
})

#!/usr/bin/env node
// @ts-check

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { findInExecutableCode } from './lib/code-scan.mjs'

const require = createRequire(import.meta.url)
const { scanManagedAssets, planPages, rollbackDna, NAMESPACE } = require('../src/lib/dna-exec.js')

let nodeSequence = 0

function managed(key, children = []) {
  const data = { managed: '1', assetKey: key, contentHash: 'hash-' + key }
  return {
    id: 'id-' + key + '-' + (++nodeSequence),
    name: key,
    children,
    getSharedPluginData(namespace, field) { return namespace === NAMESPACE ? data[field] || '' : '' },
    setSharedPluginData(namespace, field, value) { if (namespace === NAMESPACE) data[field] = value },
  }
}

const unowned = (id) => ({ id, name: id, children: [], getSharedPluginData() { return '' } })

function fakeFigma(pages, extras = {}) {
  const root = { children: pages }
  const link = (parent, children) => {
    for (const child of children || []) {
      child.parent = parent
      child.remove = function () {
        const at = this.parent.children.indexOf(this)
        if (at >= 0) this.parent.children.splice(at, 1)
      }
      link(child, child.children)
    }
  }
  link(root, pages)
  return {
    root,
    variables: {
      async getLocalVariableCollectionsAsync() { return extras.collections || [] },
      async getLocalVariablesAsync() { return extras.variables || [] },
    },
    async getLocalPaintStylesAsync() { return extras.paintStyles || [] },
    async getLocalEffectStylesAsync() { return extras.effectStyles || [] },
  }
}

test('managed discovery is recursive and rejects duplicate asset keys fail-closed', async () => {
  const previous = globalThis.figma
  try {
    const componentSet = managed('componentSet:deep')
    const section = managed('section:host', [componentSet])
    globalThis.figma = fakeFigma([managed('page:foundation', [section])])
    const clean = await scanManagedAssets()
    assert.equal(clean.index['componentSet:deep'], componentSet)

    const duplicate = managed('componentSet:deep')
    globalThis.figma = fakeFigma([managed('page:foundation', [section, duplicate])])
    await assert.rejects(() => scanManagedAssets(), /DUPLICATE MANAGED ASSETS.*componentSet:deep x2/)
    const reportable = await scanManagedAssets({ allowDuplicates: true })
    assert.equal(reportable.duplicates[0].count, 2)
  } finally {
    globalThis.figma = previous
  }
})

test('Dry Run and Apply share one collision-free page allocation plan', () => {
  const first = unowned('live-1')
  const taggedThird = managed('page:third')
  const livePages = [first, taggedThird]
  const pages = [
    { key: 'page:first', name: 'First', hash: 'a' },
    { key: 'page:second', name: 'Second', hash: 'b' },
    { key: 'page:third', name: 'Third', hash: 'hash-page:third' },
  ]
  const plan = planPages(pages, { 'page:third': taggedThird }, livePages)
  assert.equal(plan[0].node, first)
  assert.equal(plan[1].node, null)
  assert.equal(plan[2].node, taggedThird)
  assert.equal(new Set(plan.filter((p) => p.node).map((p) => p.node)).size, 2)
})

test('Rollback restores reused pages and retains containers with user content', async () => {
  const previous = globalThis.figma
  try {
    const userNode = unowned('owner-content')
    const section = managed('section:host', [userNode])
    const page = managed('page:foundation', [section])
    page.name = '01 — Foundations & Components'
    page.backgrounds = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }]
    page.setSharedPluginData(NAMESPACE, 'pageCreated', '0')
    page.setSharedPluginData(NAMESPACE, 'pageOriginal', JSON.stringify({
      name: 'Owner page',
      backgrounds: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
    }))
    globalThis.figma = {
      ...fakeFigma([page]),
      async loadAllPagesAsync() {},
    }
    const result = await rollbackDna()
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.restored, ['page:foundation'])
    assert.deepEqual(result.retained, ['section:host (contains non-plugin content)'])
    assert.equal(page.name, 'Owner page')
    assert.equal(section.getSharedPluginData(NAMESPACE, 'managed'), '')
    assert.equal(page.getSharedPluginData(NAMESPACE, 'managed'), '')
    assert.equal(section.children[0], userNode)
  } finally {
    globalThis.figma = previous
  }
})

test('runtime code contains server-side Dry Run permit, re-preview and Verify gates', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(main, /let applyPermit = null/)
  assert.match(main, /preview\.stateSignature !== applyPermit\.stateSignature/)
  assert.match(main, /assertRuntimeIdentity\('Apply'\)/)
  assert.match(main, /msg\.type === 'verify'/)
  assert.equal(findInExecutableCode(main, "applyDna({ dryRun: true })").length, 2,
    'Dry Run and the immediate pre-Apply re-preview must both execute')
})

test('verify builds before testing the generated bundle', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts.verify, 'npm run audit && npm run build && npm run test')
})

test('fingerprint follows executable inputs and ignores generated dist commits', () => {
  const build = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8')
  assert.match(build, /const BUILD_INPUT_FILES = \[/)
  for (const input of ['build.mjs', 'manifest.json', 'scripts/lib/code-scan.mjs', 'src/ui.html']) {
    assert.ok(build.includes("'" + input + "'"), input + ' must contribute to source identity')
  }
  assert.match(build, /git\(\['log', '-1', '--format=%H', '--', \.\.\.BUILD_INPUT_FILES\]/)
  assert.match(build, /git\(\['status', '--porcelain', '--untracked-files=all', '--', \.\.\.BUILD_INPUT_FILES\]/)
  assert.equal(build.includes("status --porcelain --untracked-files=all -- .'"), false)
})

test('component replacement builds and tags the new set before removing the previous set', () => {
  const source = readFileSync(new URL('../src/lib/dna-exec.js', import.meta.url), 'utf8')
  const buildAt = source.indexOf('await buildComponentSet(cs, fonts.resolved)')
  const tagAt = source.indexOf('tag(built.set, cs.key, cs.hash)', buildAt)
  const removeAt = source.indexOf('prev.remove()', tagAt)
  assert.ok(buildAt >= 0 && tagAt > buildAt && removeAt > tagAt)
  assert.equal(source.includes('node.x = section.x + c.x'), false, 'Section children must use parent-relative coordinates')
  assert.equal(source.includes("addComponentProperty(s, 'INSTANCE_SWAP', '')"), false,
    'INSTANCE_SWAP properties must never use an empty, non-functional default')
  assert.match(source, /componentPropertyReferences = \{ mainComponent: propertyId \}/)
  assert.match(source, /componentPropertyReferences = \{ visible: pid \}/)
})

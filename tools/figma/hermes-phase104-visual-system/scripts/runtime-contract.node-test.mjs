#!/usr/bin/env node
// @ts-check
// Deliberately not named *.test.mjs: the repository-wide runner is Vitest,
// while this dependency-free package intentionally uses Node's native runner.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { findInExecutableCode } from './lib/code-scan.mjs'

const require = createRequire(import.meta.url)
const { scanManagedAssets, applyDna, planPages, rollbackDna, NAMESPACE } = require('../src/lib/dna-exec.js')
const { buildDnaSpec } = require('../src/lib/dna-spec.js')

const EXEC_SOURCE_URL = new URL('../src/lib/dna-exec.js', import.meta.url)

/**
 * Read a source file for the mutation gates with line endings normalised.
 * A Windows checkout (core.autocrlf) delivers CRLF, which would make every
 * multi-line needle below miss and silently turn these controls into no-ops.
 */
const readSource = (url) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n')

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

/** A managed node that Figma reports as a Component Set. */
function managedComponentSet(key, { name, id, children = [] } = {}) {
  const node = managed(key, children)
  node.type = 'COMPONENT_SET'
  if (name) node.name = name
  if (id) node.id = id
  return node
}

/**
 * A Component Set that exists in the file but carries NO ownership metadata —
 * the shape an owner-authored (or orphaned) set has. Every write attempt is
 * recorded so a test can prove the plugin never adopts one.
 */
function unclaimedComponentSet(name) {
  const writes = []
  return {
    id: 'unclaimed-' + (++nodeSequence),
    name,
    type: 'COMPONENT_SET',
    children: [],
    writes,
    getSharedPluginData() { return '' },
    setSharedPluginData(namespace, field, value) { writes.push([namespace, field, value].join('/')) },
  }
}

const unowned = (id) => ({ id, name: id, children: [], getSharedPluginData() { return '' } })

function readonlyChildren(items) {
  return Object.freeze({
    length: items.length,
    *[Symbol.iterator]() { yield * items },
  })
}

/**
 * A children collection with `length` and index access but NO Symbol.iterator —
 * the shape that made the document walk report "no children" one level below a
 * Section and lose all 24 tagged Component Sets without raising anything.
 */
function arrayLikeChildren(items) {
  const collection = { length: items.length }
  items.forEach((item, index) => { collection[index] = item })
  return Object.freeze(collection)
}

/** Materialise any of the three children shapes, for the fixtures' own linking. */
function fixtureChildren(collection) {
  if (!collection) return []
  if (Array.isArray(collection)) return collection.slice()
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection)
  const out = []
  for (let index = 0; index < (collection.length || 0); index++) out.push(collection[index])
  return out
}

function fakeFigma(pages, extras = {}) {
  const root = { children: pages }
  const link = (parent, children) => {
    for (const child of fixtureChildren(children)) {
      child.parent = parent
      child.remove = function () {
        const at = this.parent.children.indexOf(this)
        if (at >= 0) this.parent.children.splice(at, 1)
      }
      link(child, child.children)
    }
  }
  link(root, pages)
  const figma = {
    root,
    variables: {
      async getLocalVariableCollectionsAsync() { return extras.collections || [] },
      async getLocalVariablesAsync() { return extras.variables || [] },
    },
    async getLocalPaintStylesAsync() { return extras.paintStyles || [] },
    async getLocalEffectStylesAsync() { return extras.effectStyles || [] },
    async loadAllPagesAsync() {},
  }
  // Only present when the fixture explicitly models the direct enumeration API,
  // so the runtime-probe fallback stays exercised everywhere else.
  if (extras.localComponentSets) {
    figma.getLocalComponentSetsAsync = async () => extras.localComponentSets
  }
  return figma
}

function dynamicPageFigma() {
  let loaded = false
  let loadCalls = 0
  let childrenReads = 0
  const componentSet = managed('componentSet:dynamic')
  const section = managed('section:dynamic', [componentSet])
  const page = managed('page:dynamic')
  Object.defineProperty(page, 'children', {
    configurable: true,
    get() {
      childrenReads++
      if (!loaded) {
        throw new Error("Cannot access property `children` on a page that has not been explicitly loaded")
      }
      return [section]
    },
  })
  return {
    componentSet,
    figma: {
      root: { children: [page] },
      variables: {
        async getLocalVariableCollectionsAsync() { return [] },
        async getLocalVariablesAsync() { return [] },
      },
      async getLocalPaintStylesAsync() { return [] },
      async getLocalEffectStylesAsync() { return [] },
      async loadAllPagesAsync() {
        loadCalls++
        await Promise.resolve()
        loaded = true
      },
    },
    loadCalls: () => loadCalls,
    childrenReads: () => childrenReads,
  }
}

function loadDnaExecFromSource(source) {
  const sourceRequire = createRequire(new URL('../src/lib/dna-exec.js', import.meta.url))
  const loadedModule = { exports: {} }
  Function('require', 'module', 'exports', source)(sourceRequire, loadedModule, loadedModule.exports)
  return loadedModule.exports
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

test('dynamic-page discovery loads and awaits every page before reading children', async () => {
  const previous = globalThis.figma
  try {
    const source = readSource(EXEC_SOURCE_URL)
    const loadGate = '  await ensureAllPagesLoaded()\n'
    assert.equal(source.split(loadGate).length - 1, 1, 'the shared scanner must own exactly one page-load gate')

    const mutant = loadDnaExecFromSource(source.replace(loadGate, ''))
    const mutantEnv = dynamicPageFigma()
    globalThis.figma = mutantEnv.figma
    await assert.rejects(
      () => mutant.scanManagedAssets(),
      /page that has not been explicitly loaded/,
      'removing the load-before-traverse gate must reproduce the Figma Desktop failure',
    )
    assert.equal(mutantEnv.loadCalls(), 0)

    const fixedEnv = dynamicPageFigma()
    globalThis.figma = fixedEnv.figma
    const scan = await scanManagedAssets()
    assert.equal(fixedEnv.loadCalls(), 1)
    assert.ok(fixedEnv.childrenReads() > 0)
    assert.equal(scan.index['componentSet:dynamic'], fixedEnv.componentSet)
  } finally {
    globalThis.figma = previous
  }
})

// The single pinned shape gate every children read goes through. Both historical
// mutants below are derived from it, so deleting or narrowing it turns red.
const SHAPE_GATE = [
  '  if (!collection) return []',
  '  if (Array.isArray(collection)) return collection.slice()',
  "  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection)",
  '  const length = collection.length',
  "  if (typeof length !== 'number' || !isFinite(length) || length <= 0) return []",
  '  /** @type {any[]} */ const nodes = []',
  '  for (let index = 0; index < length; index++) nodes.push(collection[index])',
  '  return nodes',
].join('\n')

const ARRAY_ONLY_MUTANT = '  if (!Array.isArray(collection)) return []\n  return collection'
const ITERABLE_ONLY_MUTANT =
  "  if (!collection || typeof collection[Symbol.iterator] !== 'function') return []\n  return Array.from(collection)"

test('the children reader owns exactly one shape gate', () => {
  const source = readSource(EXEC_SOURCE_URL)
  assert.equal(source.split(SHAPE_GATE).length - 1, 1,
    'every children read must go through one shared, mutable-in-one-place shape gate')
})

test('managed discovery traverses iterable Figma child collections that are not Arrays', async () => {
  const previous = globalThis.figma
  try {
    const source = readSource(EXEC_SOURCE_URL)
    const mutant = loadDnaExecFromSource(source.replace(SHAPE_GATE, ARRAY_ONLY_MUTANT))
    const componentSet = managedComponentSet('componentSet:readonly-children')
    const section = managed('section:readonly-host')
    section.children = readonlyChildren([componentSet])
    globalThis.figma = fakeFigma([managed('page:foundation', [section])])

    const missed = await mutant.scanManagedAssets()
    assert.equal(missed.index['componentSet:readonly-children'], undefined,
      'the original Array-only scanner must reproduce the missing Component Sets')

    const found = await scanManagedAssets()
    assert.equal(found.index['componentSet:readonly-children'], componentSet,
      'the fixed scanner must discover a nested Component Set through an iterable ChildrenMixin')
  } finally {
    globalThis.figma = previous
  }
})

test('managed discovery traverses array-like child collections that are not iterable', async () => {
  const previous = globalThis.figma
  try {
    const source = readSource(EXEC_SOURCE_URL)
    const mutant = loadDnaExecFromSource(source.replace(SHAPE_GATE, ITERABLE_ONLY_MUTANT))
    const componentSet = managedComponentSet('componentSet:array-like-children')
    const section = managed('section:array-like-host')
    section.children = arrayLikeChildren([componentSet])
    assert.equal(typeof section.children[Symbol.iterator], 'undefined',
      'the fixture must model a collection Figma exposes without an iterator')

    globalThis.figma = fakeFigma([managed('page:foundation', [section])])
    const missed = await mutant.scanManagedAssets()
    assert.equal(missed.index['componentSet:array-like-children'], undefined,
      'the iterable-only scanner must still lose the Component Set — that was the surviving bug')

    globalThis.figma = fakeFigma([managed('page:foundation', [section])])
    const found = await scanManagedAssets()
    assert.equal(found.index['componentSet:array-like-children'], componentSet,
      'the fixed scanner must materialise a length/index collection')
  } finally {
    globalThis.figma = previous
  }
})

test('Component Sets invisible to the document walk are found by direct API enumeration', async () => {
  const previous = globalThis.figma
  try {
    const source = readSource(EXEC_SOURCE_URL)
    const directGate = '  for (const set of await enumerateLocalComponentSets(enumerationErrors)) walk(set, false)\n'
    assert.equal(source.split(directGate).length - 1, 1,
      'the scanner must own exactly one direct Component Set enumeration')

    // The walk is deliberately blind: the Section reports no children at all.
    const buildFile = () => {
      const componentSet = managedComponentSet('componentSet:direct-only')
      const section = managed('section:blind-host')
      section.children = []
      return {
        componentSet,
        figma: fakeFigma([managed('page:foundation', [section])], { localComponentSets: [componentSet] }),
      }
    }

    const mutantFile = buildFile()
    globalThis.figma = mutantFile.figma
    const mutant = loadDnaExecFromSource(source.replace(directGate, ''))
    const missed = await mutant.scanManagedAssets()
    assert.equal(missed.index['componentSet:direct-only'], undefined,
      'removing direct enumeration must reproduce a Component Set the walk cannot reach')

    const fixedFile = buildFile()
    globalThis.figma = fixedFile.figma
    const found = await scanManagedAssets()
    assert.equal(found.index['componentSet:direct-only'], fixedFile.componentSet)
    assert.equal(found.componentSetsFromTreeWalk, 0)
    assert.equal(found.componentSetsFromDirectApi, 1)
  } finally {
    globalThis.figma = previous
  }
})

test('a Component Set seen by both discovery paths is counted exactly once', async () => {
  const previous = globalThis.figma
  try {
    const componentSet = managedComponentSet('componentSet:both-paths')
    const section = managed('section:host', [componentSet])
    globalThis.figma = fakeFigma([managed('page:foundation', [section])],
      { localComponentSets: [componentSet] })

    const scan = await scanManagedAssets()
    assert.deepEqual(scan.duplicates, [], 'seeing one node twice must never look like a duplicate')
    assert.equal(scan.groups['componentSet:both-paths'].length, 1)
    assert.equal(scan.componentSets.length, 1)
    assert.equal(scan.componentSetsFromTreeWalk, 1)
    assert.equal(scan.componentSetsFromDirectApi, 0)
  } finally {
    globalThis.figma = previous
  }
})

test('de-duplication keys off node.id, not object identity', async () => {
  const previous = globalThis.figma
  try {
    // Figma may hand the same node back as two distinct wrappers; node.id is the
    // stable identity that must collapse them.
    const inTree = managedComponentSet('componentSet:same-id', { id: 'figma:1:42' })
    const fromApi = managedComponentSet('componentSet:same-id', { id: 'figma:1:42' })
    assert.notEqual(inTree, fromApi)
    globalThis.figma = fakeFigma([managed('page:foundation', [managed('section:host', [inTree])])],
      { localComponentSets: [fromApi] })

    const scan = await scanManagedAssets()
    assert.deepEqual(scan.duplicates, [])
    assert.equal(scan.componentSets.length, 1)
    assert.equal(scan.index['componentSet:same-id'], inTree)
  } finally {
    globalThis.figma = previous
  }
})

test('two different nodes sharing one assetKey stay a fail-closed duplicate', async () => {
  const previous = globalThis.figma
  try {
    const inTree = managedComponentSet('componentSet:twin', { id: 'figma:1:10' })
    const elsewhere = managedComponentSet('componentSet:twin', { id: 'figma:1:11' })
    globalThis.figma = fakeFigma([managed('page:foundation', [managed('section:host', [inTree])])],
      { localComponentSets: [elsewhere] })

    await assert.rejects(() => scanManagedAssets(), /DUPLICATE MANAGED ASSETS.*componentSet:twin x2/,
      'a real duplicate must never be collapsed by the de-duplication that merges the two paths')

    const reportable = await scanManagedAssets({ allowDuplicates: true })
    assert.equal(reportable.duplicates[0].count, 2)
    assert.equal(reportable.componentSets.length, 2)
  } finally {
    globalThis.figma = previous
  }
})

test('an unclaimed same-named Component Set blocks Apply and is never adopted', async () => {
  const previous = globalThis.figma
  try {
    const spec = buildDnaSpec()
    const target = spec.componentSets[0]
    const twin = unclaimedComponentSet(target.name)
    globalThis.figma = fakeFigma([unowned('live-page')], { localComponentSets: [twin] })

    const dry = await applyDna({ dryRun: true })
    const collision = dry.errors.filter((message) => message.startsWith('UNCLAIMED_COMPONENT_SET_COLLISION:'))
    assert.equal(collision.length, 1, 'Dry Run must name the collision explicitly')
    assert.match(collision[0], new RegExp('id ' + twin.id))
    assert.match(collision[0], /metadata: absent/)
    assert.deepEqual(dry.unclaimedComponentSets, [{
      key: target.key, name: target.name, id: twin.id, ownership: 'absent',
    }])
    assert.equal(dry.componentSetScan.unclaimed, 1)
    assert.equal(dry.componentSetScan.owned, 0)
    assert.deepEqual(twin.writes, [], 'a matching name is not ownership — nothing may be tagged or adopted')

    await assert.rejects(() => applyDna({ dryRun: false }), /APPLY BLOCKED/,
      'Apply must refuse rather than create a second copy')
    assert.deepEqual(twin.writes, [])
  } finally {
    globalThis.figma = previous
  }
})

test('a differently named local Component Set is not treated as a collision', async () => {
  const previous = globalThis.figma
  try {
    const stranger = unclaimedComponentSet('Owner/Unrelated Set')
    globalThis.figma = fakeFigma([unowned('live-page')], { localComponentSets: [stranger] })

    const dry = await applyDna({ dryRun: true })
    assert.deepEqual(dry.errors, [], 'only a canonical-name match may block Apply')
    assert.deepEqual(dry.unclaimedComponentSets, [])
    assert.equal(dry.componentSetScan.local, 1)
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

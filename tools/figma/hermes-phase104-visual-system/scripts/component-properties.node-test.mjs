#!/usr/bin/env node
// @ts-check
// Deliberately not named *.test.mjs: the repository-wide runner is Vitest,
// while this dependency-free package intentionally uses Node's native runner.
//
// These tests run a REAL Apply — the shipped applyDna against an in-memory
// Figma double — rather than grepping the executor. The double enforces the one
// constraint that cost Apply all 24 Component Sets: componentPropertyReferences
// may only be set on a node that is ALREADY inside a ComponentNode. Figma calls
// such a node a "symbol sublayer"; anything else is rejected.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { buildDnaSpec } = require('../src/lib/dna-spec.js')

const EXEC_SOURCE_URL = new URL('../src/lib/dna-exec.js', import.meta.url)

/** Line endings normalised so a CRLF checkout cannot silence a mutation gate. */
const readSource = (url) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n')

const SUBLAYER_ERROR = 'Can only set component property references on symbol sublayer'

/** The Boolean properties the owner's failing Apply named, family by family. */
const REQUIRED_BOOLEANS = [
  ['Hermes/Rail', 'Show labels'],
  ['Hermes/Button', 'Leading icon'],
  ['Hermes/Button', 'Trailing icon'],
  ['Hermes/Table', 'Header'],
  ['Hermes/Table', 'Selection'],
]

// ── in-memory Figma double ──────────────────────────────────────────────────

function createDouble({ failBindingFor = null } = {}) {
  let sequence = 0
  /** @type {any[]} */ const allNodes = []

  function baseNode(type) {
    const pluginData = {}
    const node = {
      id: 'node-' + (++sequence),
      type,
      name: '',
      parent: null,
      removed: false,
      children: [],
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      getSharedPluginData(namespace, key) {
        return (pluginData[namespace] && pluginData[namespace][key]) || ''
      },
      setSharedPluginData(namespace, key, value) {
        ;(pluginData[namespace] || (pluginData[namespace] = {}))[key] = value
      },
      appendChild(child) { detach(child); child.parent = node; node.children.push(child) },
      insertChild(index, child) { detach(child); child.parent = node; node.children.splice(index, 0, child) },
      remove() { detach(node); node.removed = true },
      resize(w, h) { node.width = w; node.height = h },
      resizeWithoutConstraints(w, h) { node.width = w; node.height = h },
    }
    allNodes.push(node)
    return node
  }

  function detach(node) {
    if (!node.parent) return
    const at = node.parent.children.indexOf(node)
    if (at >= 0) node.parent.children.splice(at, 1)
    node.parent = null
  }

  /**
   * The constraint under test. A node accepts component property references
   * ONLY while it sits inside a ComponentNode.
   */
  function withPropertyReferenceGuard(node) {
    let references = null
    Object.defineProperty(node, 'componentPropertyReferences', {
      configurable: true,
      get() { return references },
      set(value) {
        if (!node.parent || node.parent.type !== 'COMPONENT') throw new Error(SUBLAYER_ERROR)
        if (failBindingFor && node.name === failBindingFor) {
          throw new Error('SIMULATED BINDING REJECTION for ' + node.name)
        }
        references = value
      },
    })
    return node
  }

  const root = baseNode('DOCUMENT')
  root.name = 'Phase 104 fixture'

  /** @type {any[]} */ const paintStyles = []
  /** @type {any[]} */ const effectStyles = []
  /** @type {any[]} */ const collections = []
  /** @type {any[]} */ const variables = []

  const fontFamilies = ['Estedad', 'Vazirmatn', 'Roboto Mono', 'Inter']
  const fontStyles = ['Regular', 'Medium', 'Semi Bold', 'Bold']

  const figma = {
    root,
    currentPage: null,
    async listAvailableFontsAsync() {
      const fonts = []
      for (const family of fontFamilies) for (const style of fontStyles) fonts.push({ fontName: { family, style } })
      return fonts
    },
    async loadFontAsync() {},
    async setCurrentPageAsync(page) { figma.currentPage = page },
    createPage() {
      const page = baseNode('PAGE')
      root.appendChild(page)
      if (!figma.currentPage) figma.currentPage = page
      return page
    },
    createSection() { return baseNode('SECTION') },
    createComponent() {
      const component = baseNode('COMPONENT')
      component.createInstance = () => withPropertyReferenceGuard(baseNode('INSTANCE'))
      return component
    },
    createEllipse() { return baseNode('ELLIPSE') },
    createText() { return withPropertyReferenceGuard(baseNode('TEXT')) },
    createPaintStyle() { const style = baseNode('PAINT_STYLE'); paintStyles.push(style); return style },
    createEffectStyle() { const style = baseNode('EFFECT_STYLE'); effectStyles.push(style); return style },
    combineAsVariants(components, parent) {
      const set = baseNode('COMPONENT_SET')
      const definitions = {}
      set.componentPropertyDefinitions = definitions
      set.addComponentProperty = (name, propertyType, defaultValue) => {
        const propertyId = name + '#' + (++sequence) + ':0'
        definitions[propertyId] = { type: propertyType, defaultValue }
        return propertyId
      }
      parent.appendChild(set)
      for (const component of components) set.appendChild(component)
      return set
    },
    variables: {
      async getLocalVariableCollectionsAsync() { return collections.slice() },
      async getLocalVariablesAsync() { return variables.slice() },
      createVariableCollection(name) {
        const collection = baseNode('VARIABLE_COLLECTION')
        collection.name = name
        collection.modes = [{ modeId: 'mode-' + collection.id, name: 'Value' }]
        collection.renameMode = (modeId, modeName) => { collection.modes[0].name = modeName }
        collections.push(collection)
        return collection
      },
      createVariable(name, collection, resolvedType) {
        const variable = baseNode('VARIABLE')
        variable.name = name
        variable.resolvedType = resolvedType
        variable.valuesByMode = {}
        variable.codeSyntax = {}
        variable.setValueForMode = (modeId, value) => { variable.valuesByMode[modeId] = value }
        variable.setVariableCodeSyntax = (platform, value) => { variable.codeSyntax[platform] = value }
        variable.getVariableCodeSyntax = (platform) => variable.codeSyntax[platform]
        variables.push(variable)
        return variable
      },
      setBoundVariableForPaint(paint, field, variable) {
        return Object.assign({}, paint, { boundVariables: { [field]: { id: variable.id } } })
      },
    },
    async getLocalPaintStylesAsync() { return paintStyles.slice() },
    async getLocalEffectStylesAsync() { return effectStyles.slice() },
  }

  const walk = (node, visit) => { visit(node); for (const child of node.children) walk(child, visit) }
  const liveNodesOfType = (type) => {
    const found = []
    walk(root, (node) => { if (node.type === type) found.push(node) })
    return found
  }

  return { figma, allNodes, liveNodesOfType }
}

function loadExecFromSource(source) {
  const sourceRequire = createRequire(EXEC_SOURCE_URL)
  const loadedModule = { exports: {} }
  Function('require', 'module', 'exports', source)(sourceRequire, loadedModule, loadedModule.exports)
  return loadedModule.exports
}

async function runApply(source, options) {
  const double = createDouble(options)
  const previous = globalThis.figma
  globalThis.figma = double.figma
  try {
    const exec = loadExecFromSource(source)
    const result = await exec.applyDna({ dryRun: false })
    return { result, double }
  } finally {
    globalThis.figma = previous
  }
}

/** Every marker of `booleanName` inside `set`, with the reference it carries. */
function booleanMarkers(set, booleanName) {
  const variants = set.children.filter((child) => child.type === 'COMPONENT')
  return variants.map((variant) => variant.children.find(
    (child) => child.type === 'TEXT' && child.name === booleanName))
}

function booleanPropertyId(set, booleanName) {
  const entry = Object.entries(set.componentPropertyDefinitions || {}).find(
    ([key, definition]) => key.split('#')[0] === booleanName && definition.type === 'BOOLEAN')
  return entry ? entry[0] : null
}

// ── the ordering fix ────────────────────────────────────────────────────────

const ORDERING_GATE = [
  '        comp.appendChild(marker)',
  '        try {',
  '          marker.componentPropertyReferences = { visible: pid }',
  '        } catch (bindError) {',
  '          // Leave nothing half-bound behind; the throw hands the failure to the',
  '          // existing fail-closed path, which discards the whole set.',
  '          try { marker.remove() } catch (cleanupError) {}',
  '          throw bindError',
  '        }',
].join('\n')

const HISTORICAL_ORDERING = [
  '        marker.componentPropertyReferences = { visible: pid }',
  '        comp.appendChild(marker)',
].join('\n')

test('the Boolean marker is appended before it is bound, in exactly one place', () => {
  const source = readSource(EXEC_SOURCE_URL)
  assert.equal(source.split(ORDERING_GATE).length - 1, 1,
    'the Boolean binding must own exactly one append-then-bind ordering')
  const appendAt = source.indexOf('        comp.appendChild(marker)')
  const bindAt = source.indexOf('          marker.componentPropertyReferences = { visible: pid }')
  assert.ok(appendAt > 0 && bindAt > appendAt, 'append must precede the binding')
})

test('a real Apply binds every declared Boolean property to its own set property id', async () => {
  const spec = buildDnaSpec()
  const { result, double } = await runApply(readSource(EXEC_SOURCE_URL))

  assert.deepEqual(result.errors, [], 'a correctly ordered Apply must complete without errors')
  assert.equal(result.created.length, spec.counts.appliableTotal,
    'every appliable asset must be created on a fresh file')

  const sets = double.liveNodesOfType('COMPONENT_SET')
  assert.equal(sets.length, spec.counts.componentSets)
  assert.equal(double.liveNodesOfType('COMPONENT').length, spec.counts.componentVariants)

  const byName = Object.fromEntries(sets.map((set) => [set.name, set]))
  const declared = spec.componentSets.filter((cs) => (cs.bools || []).length)
  assert.ok(declared.length > 0)

  const bound = []
  for (const cs of declared) {
    const set = byName[cs.name]
    assert.ok(set, cs.name + ' must exist')
    for (const booleanName of cs.bools) {
      const propertyId = booleanPropertyId(set, booleanName)
      assert.ok(propertyId, cs.name + ' must declare the BOOLEAN property ' + booleanName)

      const markers = booleanMarkers(set, booleanName)
      assert.equal(markers.length, cs.variantCount,
        cs.name + '/' + booleanName + ' must carry one marker per variant')
      for (const marker of markers) {
        assert.ok(marker, cs.name + '/' + booleanName + ' is missing a marker')
        assert.equal(marker.parent.type, 'COMPONENT', 'the marker must live inside the ComponentNode')
        assert.deepEqual(marker.componentPropertyReferences, { visible: propertyId },
          cs.name + '/' + booleanName + ' must reference ITS OWN set property id')
      }
      bound.push([cs.name, booleanName])
    }
  }

  for (const required of REQUIRED_BOOLEANS) {
    assert.ok(bound.some((entry) => entry[0] === required[0] && entry[1] === required[1]),
      required.join('/') + ' must be bound')
  }
})

test('the historical bind-before-append ordering reproduces the sublayer failure exactly', async () => {
  const source = readSource(EXEC_SOURCE_URL)
  const { result, double } = await runApply(source.replace(ORDERING_GATE, HISTORICAL_ORDERING))

  // One error per affected FAMILY: buildComponentSet joins that family's failing
  // Boolean properties into a single thrown message.
  assert.equal(result.errors.length, 3,
    'Rail, Button and Table each raise one componentSet error — the owner saw errors: 3')
  for (const message of result.errors) assert.match(message, new RegExp(SUBLAYER_ERROR))
  for (const family of ['Hermes/Rail', 'Hermes/Button', 'Hermes/Table']) {
    assert.ok(result.errors.some((message) => message.indexOf(family) >= 0), family + ' must be named')
  }
  for (const required of REQUIRED_BOOLEANS) {
    assert.ok(result.errors.some((message) => message.indexOf('BOOLEAN ' + required[1] + ':') >= 0),
      required.join('/') + ' must be reported')
  }

  // And the fail-closed cleanup leaves NOTHING behind — exactly what the owner
  // observed: errors: 3 with "component sets in file: 0".
  assert.equal(double.liveNodesOfType('COMPONENT_SET').length, 0)
  assert.equal(double.liveNodesOfType('COMPONENT').length, 0)
  assert.equal(result.created.filter((label) => label.indexOf('componentSet:') === 0).length, 0)
})

test('a Boolean binding rejection discards the marker and the whole set under construction', async () => {
  const source = readSource(EXEC_SOURCE_URL)
  const { result, double } = await runApply(source, { failBindingFor: 'Header' })

  assert.ok(result.errors.length > 0, 'a rejected binding must never be swallowed')
  assert.ok(result.errors.some((message) => /componentSet Hermes\/Table: BOOLEAN Header:/.test(message)),
    'the failure must be reported against the property that raised it')
  assert.ok(result.errors.some((message) => /SIMULATED BINDING REJECTION/.test(message)))

  assert.equal(double.liveNodesOfType('COMPONENT_SET').length, 0,
    'no Component Set may survive a property-binding failure')
  assert.equal(double.liveNodesOfType('COMPONENT').length, 0)

  const strayMarkers = double.allNodes.filter(
    (node) => node.type === 'TEXT' && node.name === 'Header' && node.parent)
  assert.deepEqual(strayMarkers, [], 'the marker that failed to bind must be removed, not orphaned in the tree')
})

test('no Boolean property is silently skipped, downgraded or dropped', () => {
  const source = readSource(EXEC_SOURCE_URL)
  const spec = buildDnaSpec()

  // Every declared Boolean still reaches addComponentProperty, and a failure is
  // pushed onto propertyErrors rather than continued past.
  assert.match(source, /for \(const b of \(cs\.bools \|\| \[\]\)\) \{/)
  assert.match(source, /set\.addComponentProperty\(b, 'BOOLEAN', true\)/)
  assert.match(source, /propertyErrors\.push\('BOOLEAN ' \+ b \+ ': '/)
  assert.equal(source.indexOf('continue // boolean'), -1)

  const declared = spec.componentSets.flatMap((cs) => (cs.bools || []).map((name) => cs.name + '/' + name))
  assert.deepEqual(declared.sort(), [
    'Hermes/Button/Leading icon',
    'Hermes/Button/Trailing icon',
    'Hermes/Rail/Show labels',
    'Hermes/Table/Header',
    'Hermes/Table/Pagination',
    'Hermes/Table/Selection',
  ], 'the declared Boolean set is pinned — none may be removed to make Apply pass')
})

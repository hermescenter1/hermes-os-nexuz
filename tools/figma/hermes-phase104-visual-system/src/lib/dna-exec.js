// @ts-check
'use strict'
/**
 * The only module in this plugin that touches the `figma` global.
 *
 * Everything it creates is tagged in the `hermesP104` shared-plugin-data
 * namespace so that:
 *   - re-running is idempotent (find by assetKey, update in place, never duplicate);
 *   - rollback deletes exactly what this plugin made and nothing else;
 *   - the Phase 87 builder's assets (namespace `hermesDSB`) are NEVER touched.
 *
 * That namespace separation is load-bearing: Phase 87 is an owner-applied artifact
 * with recorded 173/173 evidence and must not be corruptible even by accident.
 */

const { buildDnaSpec, hashAsset } = require('./dna-spec')
const { assertContract } = require('./contract')
const { parseColor } = require('./contrast')
const DNA = require('./dna-tokens')
const { PRESETS, variantGeometry } = require('./dna-components')

const NAMESPACE = 'hermesP104'
const K_MANAGED = 'managed'
const K_ASSET_KEY = 'assetKey'
const K_HASH = 'contentHash'
const K_PAGE_CREATED = 'pageCreated'
const K_PAGE_ORIGINAL = 'pageOriginal'

/** @param {string} v */
const rgb = (v) => { const c = parseColor(v); return { r: c.r, g: c.g, b: c.b } }
/** @param {string} v */
const opacityOf = (v) => parseColor(v).a
/** @param {string} v @returns {SolidPaint} */
const solid = (v) => ({ type: 'SOLID', color: rgb(v), opacity: opacityOf(v) })

function tag(node, assetKey, hash) {
  if (!node || typeof node.setSharedPluginData !== 'function') return
  node.setSharedPluginData(NAMESPACE, K_MANAGED, '1')
  node.setSharedPluginData(NAMESPACE, K_ASSET_KEY, assetKey)
  node.setSharedPluginData(NAMESPACE, K_HASH, hash)
}
function readKey(node) {
  if (!node || typeof node.getSharedPluginData !== 'function') return null
  if (node.getSharedPluginData(NAMESPACE, K_MANAGED) !== '1') return null
  return node.getSharedPluginData(NAMESPACE, K_ASSET_KEY) || null
}

function readHash(node) {
  if (!node || typeof node.getSharedPluginData !== 'function') return ''
  return node.getSharedPluginData(NAMESPACE, K_HASH) || ''
}

function clearTag(node) {
  if (!node || typeof node.setSharedPluginData !== 'function') return
  for (const key of [K_MANAGED, K_ASSET_KEY, K_HASH, K_PAGE_CREATED, K_PAGE_ORIGINAL]) {
    node.setSharedPluginData(NAMESPACE, key, '')
  }
}

/** @param {any} node @param {any} asset */
const isCurrent = (node, asset) => !!node && readHash(node) === asset.hash

// ── fonts ───────────────────────────────────────────────────────────────────

const FONT_PLAN = [
  { role: 'display', family: 'Estedad', fallback: 'Inter' },
  { role: 'body', family: 'Vazirmatn', fallback: 'Inter' },
  { role: 'mono', family: 'Roboto Mono', fallback: 'Inter' },
]
const WEIGHTS = ['Regular', 'Medium', 'Semi Bold', 'Bold']
const WEIGHT_ALIASES = {
  'Semi Bold': ['Semi Bold', 'SemiBold', 'Demi Bold', 'DemiBold'],
  Regular: ['Regular', 'Normal', 'Book'],
  Medium: ['Medium'],
  Bold: ['Bold'],
}

/**
 * Resolve and load the type ramp. Returns the resolved map plus any substitutions,
 * which are REPORTED rather than silently swallowed.
 */
async function loadFonts() {
  const available = new Set((await figma.listAvailableFontsAsync()).map((f) => f.fontName.family + '|' + f.fontName.style))
  /** @type {Record<string, {family:string, style:string}>} */
  const resolved = {}
  /** @type {string[]} */
  const substitutions = []

  for (const p of FONT_PLAN) {
    for (const w of WEIGHTS) {
      const aliases = WEIGHT_ALIASES[w] || [w]
      let hit = null
      for (const a of aliases) if (available.has(p.family + '|' + a)) { hit = { family: p.family, style: a }; break }
      if (!hit) {
        for (const a of aliases) if (available.has(p.fallback + '|' + a)) { hit = { family: p.fallback, style: a }; break }
        if (hit) substitutions.push(p.family + ' ' + w + ' -> ' + hit.family + ' ' + hit.style)
      }
      if (!hit) hit = { family: 'Inter', style: 'Regular' }
      resolved[p.role + '/' + w] = hit
    }
  }
  const uniq = new Map()
  for (const f of Object.values(resolved)) uniq.set(f.family + '|' + f.style, f)
  for (const f of uniq.values()) {
    try { await figma.loadFontAsync(f) } catch (e) { /* reported via substitutions */ }
  }
  return { resolved, substitutions }
}

// ── variant → paint resolution ──────────────────────────────────────────────

/** Map a variant combo onto DNA colours. Pure lookup — no invented values. */
function resolveStyle(family, combo) {
  const glass = DNA.GLASS.tiers.find((t) => t.tier === family.glass)
  let fill = glass ? glass.fill : 'rgba(12, 23, 32, 0.0)'
  let stroke = glass ? glass.border : DNA.EDGE.structural.value
  let text = '#EDF7FA'
  let accent = null

  if (combo.Status) {
    const s = DNA.INDUSTRIAL_STATES.find((x) => x.key === String(combo.Status).toLowerCase().replace(/\s/g, ''))
      || DNA.INDUSTRIAL_STATES.find((x) => x.label.en === combo.Status)
    if (s) { accent = s.fill; text = s.text; stroke = s.fill; fill = 'rgba(12, 23, 32, 0.55)' }
  }
  if (combo.Tier) {
    const map = { Observed: 'observation', Evidence: 'evidence', Hypothesis: 'hypothesis', Candidate: 'rootCauseCandidate', Conflict: 'contradiction', NoData: 'missing', Simulated: 'simulationResult', Proposed: 'recommendation', Approved: 'engineerApproval' }
    const r = DNA.REASONING_LADDER.find((x) => x.key === map[combo.Tier])
    if (r) { accent = r.color; text = r.text; stroke = r.color; fill = 'rgba(12, 23, 32, 0.55)' }
  }
  if (combo.Severity) {
    const s = DNA.INDUSTRIAL_STATES.find((x) => x.label.en.toLowerCase() === String(combo.Severity).toLowerCase())
      || DNA.INDUSTRIAL_STATES.find((x) => x.key === String(combo.Severity).toLowerCase())
    if (s) { accent = s.fill; stroke = s.fill }
  }
  if (combo.Intent === 'Primary') { fill = DNA.BEACON.core.value; text = DNA.BEACON.onBeacon.value; stroke = DNA.BEACON.core.value }
  if (combo.Intent === 'Secondary') { fill = 'rgba(21, 42, 54, 1)'; stroke = DNA.EDGE.structural.value }
  if (combo.Intent === 'Tertiary') { fill = 'rgba(12, 23, 32, 0)'; stroke = 'rgba(12, 23, 32, 0)'; text = DNA.BEACON.core.value }
  if (combo.Intent === 'Destructive') { fill = 'rgba(240, 93, 104, 0.12)'; stroke = '#F05D68'; text = '#FF7C86' }

  if (combo.State === 'Disabled') { text = '#495C68'; stroke = '#203743' }
  if (combo.State === 'Focus' || combo.State === 'Selected') stroke = DNA.EDGE.active.value
  if (combo.State === 'Error') stroke = '#F05D68'

  return { fill, stroke, text, accent }
}

/** Dashed stroke for every non-verified reasoning tier and dashed-outline state. */
function isDashed(family, combo) {
  if (combo.Tier) {
    const map = { Hypothesis: 1, Candidate: 1, NoData: 1, Simulated: 1 }
    return !!map[combo.Tier]
  }
  if (combo.Status) {
    const s = DNA.INDUSTRIAL_STATES.find((x) => x.label.en === combo.Status || x.key === String(combo.Status).toLowerCase())
    return !!(s && s.outline === 'dashed')
  }
  return false
}

// ── discovery ───────────────────────────────────────────────────────────────

/** @param {any} node @param {Record<string, any[]>} groups @param {string[]} malformed */
function collectManaged(node, groups, malformed) {
  if (!node || typeof node.getSharedPluginData !== 'function') return
  const managed = node.getSharedPluginData(NAMESPACE, K_MANAGED)
  const key = node.getSharedPluginData(NAMESPACE, K_ASSET_KEY)
  if (managed === '1' && !key) malformed.push(String(node.id || node.name || 'unknown node'))
  if (managed === '1' && key) (groups[key] || (groups[key] = [])).push(node)
}

/**
 * Materialise a Figma readonly collection into a real Array.
 *
 * `ChildrenMixin.children` is neither guaranteed to be an Array nor guaranteed
 * to be iterable, and the shapes differ between node types in the same document.
 * All three must be handled, because treating an unrecognised shape as "empty"
 * truncates the document walk SILENTLY — no exception, just a short answer:
 *
 *   1. a real Array                    — how PageNode.children presented itself;
 *   2. a non-Array iterable            — a frozen collection exposing Symbol.iterator;
 *   3. an array-like WITHOUT Symbol.iterator, carrying only `length` and indices.
 *
 * Shape 3 is what cost Phase 104 all 24 Component Sets. Pages and their direct
 * Section children were discovered normally, then the walk found "no children"
 * one level further down, so the correctly tagged Component Sets nested inside
 * every Section were never visited and a second Apply would have created 24
 * duplicates. `Array.from` handles shape 3 perfectly well — it was the iterable
 * GUARD in front of it that rejected the collection before it ever ran.
 *
 * @param {any} collection
 * @returns {any[]}
 */
function materialiseNodes(collection) {
  if (!collection) return []
  if (Array.isArray(collection)) return collection.slice()
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection)
  const length = collection.length
  if (typeof length !== 'number' || !isFinite(length) || length <= 0) return []
  /** @type {any[]} */ const nodes = []
  for (let index = 0; index < length; index++) nodes.push(collection[index])
  return nodes
}

/**
 * @param {any} node
 * @returns {any[]}
 */
function childNodes(node) {
  return materialiseNodes(node && node.children)
}

/**
 * Stable de-duplication identity.
 *
 * A node can now be reached twice — once through the document walk and once
 * through direct API enumeration — and must be counted exactly ONCE. `node.id`
 * is Figma's own stable identity, so it is what makes the two paths converge.
 * The node object itself is the fallback, which is what keeps two genuinely
 * different nodes distinct: two DIFFERENT nodes carrying the SAME assetKey stay
 * a real duplicate and must still fail closed, never be collapsed into one.
 *
 * @param {any} node
 */
function nodeIdentity(node) {
  const id = node && node.id
  return typeof id === 'string' && id ? 'figma-node-id:' + id : node
}

/**
 * Describe what this plugin's namespace says about a node's ownership, WITHOUT
 * changing anything. Shared plugin data is the only ownership authority there
 * is; a matching name proves nothing and is never treated as ownership.
 *
 * @param {any} node
 * @returns {string}
 */
function describeOwnership(node) {
  if (!node || typeof node.getSharedPluginData !== 'function') return 'unreadable'
  const managed = node.getSharedPluginData(NAMESPACE, K_MANAGED)
  const key = node.getSharedPluginData(NAMESPACE, K_ASSET_KEY)
  if (managed === '1' && key) return 'owned:' + key
  if (managed === '1') return 'managed-flag-without-assetKey'
  if (key) return 'assetKey-without-managed-flag'
  return 'absent'
}

async function ensureAllPagesLoaded() {
  if (typeof figma.loadAllPagesAsync === 'function') await figma.loadAllPagesAsync()
}

/**
 * Enumerate every local Component Set through the Figma API itself rather than
 * inferring the set from a recursive `children` walk.
 *
 * A recursive walk reaches a node only if EVERY ancestor exposes a `children`
 * collection in a shape the walker consumes. That single assumption is what lost
 * the 24 Phase 104 Component Sets, and hardening the walker alone would leave the
 * discovery of the most duplication-prone asset kind resting on it again. Asking
 * the API directly removes the dependency on document shape entirely.
 *
 * Sources are tried in order of directness and MERGED, never short-circuited, so
 * a partial source cannot hide a node. A source missing from this runtime is
 * skipped; a source that throws is reported, so discovery can never silently
 * degrade back into "found nothing" a second time.
 *
 * @param {string[]} enumerationErrors mutated with any source-level failure
 * @returns {Promise<any[]>}
 */
async function enumerateLocalComponentSets(enumerationErrors) {
  /** @type {any[]} */ const found = []
  const seen = new Set()
  const sources = [
    ['figma.getLocalComponentSetsAsync', () => (typeof figma.getLocalComponentSetsAsync === 'function'
      ? figma.getLocalComponentSetsAsync() : null)],
    ['figma.root.findAllWithCriteria', () => (figma.root && typeof figma.root.findAllWithCriteria === 'function'
      ? figma.root.findAllWithCriteria({ types: ['COMPONENT_SET'] }) : null)],
    ['figma.root.findAll', () => (figma.root && typeof figma.root.findAll === 'function'
      ? figma.root.findAll((node) => !!node && node.type === 'COMPONENT_SET') : null)],
  ]
  for (const [label, run] of sources) {
    let nodes = null
    try { nodes = await run() }
    catch (e) { enumerationErrors.push(label + ': ' + String(e && e.message ? e.message : e)); continue }
    for (const node of materialiseNodes(nodes)) {
      if (!node || node.type !== 'COMPONENT_SET') continue
      const identity = nodeIdentity(node)
      if (seen.has(identity)) continue
      seen.add(identity)
      found.push(node)
    }
  }
  return found
}

/**
 * Scan every managed asset. Discovery runs on TWO independent paths — the
 * recursive document walk and direct Component Set enumeration — and the results
 * are merged on stable node identity, so a node seen twice is counted once while
 * two distinct nodes sharing one assetKey remain a fail-closed duplicate.
 *
 * @param {{allowDuplicates?:boolean}} [opts]
 */
async function scanManagedAssets(opts) {
  // The manifest uses documentAccess: "dynamic-page". Reading PageNode.children
  // before explicitly loading every page throws in Figma Desktop, including on
  // the init-only scan that runs before Dry Run. Keep this guarantee inside the
  // shared scanner so every caller is safe and no new entry point can forget it.
  await ensureAllPagesLoaded()
  /** @type {Record<string, any[]>} */ const groups = {}
  /** @type {string[]} */ const malformed = []
  /** @type {string[]} */ const enumerationErrors = []
  /** @type {any[]} */ const componentSets = []
  const seen = new Set()
  let componentSetsFromTreeWalk = 0
  let componentSetsFromDirectApi = 0

  /** @param {any} node @param {boolean} viaTreeWalk */
  const visit = (node, viaTreeWalk) => {
    if (!node) return false
    const identity = nodeIdentity(node)
    if (seen.has(identity)) return false
    seen.add(identity)
    collectManaged(node, groups, malformed)
    if (node.type === 'COMPONENT_SET') {
      componentSets.push(node)
      if (viaTreeWalk) componentSetsFromTreeWalk += 1
      else componentSetsFromDirectApi += 1
    }
    return true
  }
  /** @param {any} node @param {boolean} viaTreeWalk */
  const walk = (node, viaTreeWalk) => {
    if (!visit(node, viaTreeWalk)) return
    for (const child of childNodes(node)) walk(child, viaTreeWalk)
  }

  // Every collection crossing the API boundary goes through the same shape gate:
  // a collection this code cannot consume must never read as "empty".
  for (const c of materialiseNodes(await figma.variables.getLocalVariableCollectionsAsync())) visit(c, true)
  for (const v of materialiseNodes(await figma.variables.getLocalVariablesAsync())) visit(v, true)
  for (const s of materialiseNodes(await figma.getLocalPaintStylesAsync())) visit(s, true)
  for (const s of materialiseNodes(await figma.getLocalEffectStylesAsync())) visit(s, true)
  for (const page of materialiseNodes(figma.root.children)) walk(page, true)
  for (const set of await enumerateLocalComponentSets(enumerationErrors)) walk(set, false)

  if (malformed.length) {
    throw new Error('PHASE 104 MANAGED-ASSET CORRUPTION — managed node(s) have no assetKey: ' + malformed.join(', '))
  }

  const duplicates = Object.entries(groups)
    .filter(([, nodes]) => nodes.length > 1)
    .map(([key, nodes]) => ({ key, count: nodes.length, nodes }))
  if (duplicates.length && !(opts && opts.allowDuplicates)) {
    throw new Error('PHASE 104 DUPLICATE MANAGED ASSETS — Rollback before Apply: ' +
      duplicates.map((d) => d.key + ' x' + d.count).join(', '))
  }

  /** @type {Record<string, any>} */ const index = {}
  for (const [key, nodes] of Object.entries(groups)) index[key] = nodes[0]
  return {
    index,
    groups,
    duplicates,
    componentSets,
    componentSetsFromTreeWalk,
    componentSetsFromDirectApi,
    enumerationErrors,
  }
}

/**
 * Defence in depth against creating a second copy of something that is already
 * in the file.
 *
 * If an expected Component Set is absent from the managed index while a local
 * Component Set already carries its canonical name, Apply would create a twin.
 * That is reported as a hard, named error and NOTHING is adopted: a name is not
 * ownership, and silently tagging an owner-authored node would be worse than the
 * duplicate it prevents. Adoption is an owner decision, taken with the reported
 * id/name/metadata in hand.
 *
 * @param {any} spec
 * @param {Record<string, any>} existing
 * @param {any[]} localComponentSets
 */
function unclaimedComponentSetCollisions(spec, existing, localComponentSets) {
  /** @type {Record<string, any[]>} */ const unclaimedByName = {}
  for (const node of localComponentSets) {
    if (readKey(node)) continue
    const name = typeof node.name === 'string' ? node.name : ''
    if (!name) continue
    ;(unclaimedByName[name] || (unclaimedByName[name] = [])).push(node)
  }
  /** @type {{key:string, name:string, id:string, ownership:string}[]} */ const collisions = []
  for (const cs of spec.componentSets) {
    if (existing[cs.key]) continue
    for (const node of unclaimedByName[cs.name] || []) {
      collisions.push({
        key: cs.key,
        name: cs.name,
        id: String((node && node.id) || 'unknown-id'),
        ownership: describeOwnership(node),
      })
    }
  }
  return collisions
}

async function scanExisting() {
  return (await scanManagedAssets()).index
}

/**
 * Use the same page allocation for Dry Run and Apply. Tagged pages win; remaining
 * spec pages reuse each unclaimed live page in order, then create only what is
 * genuinely missing.
 * @param {any[]} pages @param {Record<string, any>} existing @param {any[]} livePages
 */
function planPages(pages, existing, livePages) {
  // Reserve every explicitly tagged page before allocating untagged live pages;
  // otherwise an earlier spec page can steal the page owned by a later key.
  const used = new Set(pages.map((page) => existing[page.key]).filter(Boolean))
  return pages.map((page, desiredIndex) => {
    let node = existing[page.key] || null
    if (!node) {
      node = livePages.find((candidate) => !used.has(candidate)) || null
      if (node) used.add(node)
    }
    return {
      asset: page,
      node,
      created: !node,
      managed: !!(node && readKey(node) === page.key),
      desiredIndex,
      orderMatches: !!node && livePages.indexOf(node) === desiredIndex,
    }
  })
}

/** @param {Record<string, any>} existing @param {any[]} livePages */
function stateSignature(existing, livePages) {
  const owned = Object.keys(existing).sort().map((key) => ({
    key,
    id: String(existing[key].id || ''),
    hash: readHash(existing[key]),
  }))
  const shape = (node) => ({
    id: String(node.id || ''),
    type: String(node.type || ''),
    name: String(node.name || ''),
    x: typeof node.x === 'number' ? node.x : null,
    y: typeof node.y === 'number' ? node.y : null,
    width: typeof node.width === 'number' ? node.width : null,
    height: typeof node.height === 'number' ? node.height : null,
    characters: typeof node.characters === 'string' ? node.characters : null,
    children: childNodes(node).map(shape),
  })
  const pages = livePages.map(shape)
  return hashAsset({ owned, pages })
}

// ── apply ───────────────────────────────────────────────────────────────────

/**
 * @param {{dryRun?: boolean}} [opts]
 */
async function applyDna(opts) {
  const dryRun = !!(opts && opts.dryRun)
  const spec = buildDnaSpec()

  // Defence in depth: main.js already gates, but the executor refuses to touch
  // the file on its own account if the spec is not Phase 104.
  assertContract(spec.counts, dryRun ? 'Dry Run' : 'Apply')

  const scan = await scanManagedAssets()
  const existing = scan.index
  const livePages = materialiseNodes(figma.root.children)
  const pagePlan = planPages(spec.pages, existing, livePages)

  const unclaimedComponentSets = unclaimedComponentSetCollisions(spec, existing, scan.componentSets)
  const result = {
    dryRun,
    created: /** @type {string[]} */ ([]),
    updated: /** @type {string[]} */ ([]),
    skipped: /** @type {string[]} */ ([]),
    errors: /** @type {string[]} */ ([]),
    fontSubstitutions: /** @type {string[]} */ ([]),
    counts: spec.counts,
    stateSignature: stateSignature(existing, livePages),
    // Reported so a run can prove WHICH discovery path saw each Component Set,
    // instead of leaving "0 found" indistinguishable from "0 exist".
    componentSetScan: {
      local: scan.componentSets.length,
      fromTreeWalk: scan.componentSetsFromTreeWalk,
      fromDirectApi: scan.componentSetsFromDirectApi,
      owned: scan.componentSets.filter((node) => !!readKey(node)).length,
      unclaimed: scan.componentSets.filter((node) => !readKey(node)).length,
    },
    unclaimedComponentSets,
  }
  const expectedKeys = new Set(spec.assets.map((asset) => asset.key))
  const unexpectedOwned = Object.keys(existing).filter((key) => !expectedKeys.has(key)).sort()
  for (const key of unexpectedOwned) result.errors.push('unexpected managed asset: ' + key + ' — Rollback before Apply')
  for (const message of scan.enumerationErrors) {
    result.errors.push('COMPONENT_SET_ENUMERATION_FAILED: ' + message +
      ' — discovery is incomplete, so Apply could duplicate an existing set.')
  }
  for (const collision of unclaimedComponentSets) {
    result.errors.push('UNCLAIMED_COMPONENT_SET_COLLISION: ' + collision.key +
      ' — a local Component Set named "' + collision.name + '" (id ' + collision.id + ', ' +
      NAMESPACE + ' metadata: ' + collision.ownership + ') already exists and is NOT owned by this plugin.' +
      ' Apply is blocked so no second copy can be created. Adoption requires explicit owner authorisation.')
  }

  if (dryRun) {
    for (const planned of pagePlan) {
      const a = planned.asset
      const label = a.kind + ':' + a.name
      if (planned.created) result.created.push(label)
      else if (planned.managed && isCurrent(planned.node, a) && planned.orderMatches) result.skipped.push(label)
      else result.updated.push(label)
    }
    for (const a of spec.assets.filter((asset) => asset.kind !== 'page')) {
      const prev = existing[a.key]
      const label = a.kind + ':' + a.name
      if (!prev) result.created.push(label)
      else if (isCurrent(prev, a)) result.skipped.push(label)
      else result.updated.push(label)
    }
    return result
  }

  if (result.errors.length) {
    throw new Error('APPLY BLOCKED — Phase 104 pre-Apply checks failed. Run Dry Run for the full report:\n  - ' +
      result.errors.join('\n  - '))
  }

  const fonts = await loadFonts()
  result.fontSubstitutions = fonts.substitutions

  // ── 1. Pages — reuse the three the Starter plan allows, never create a 4th ──
  /** @type {Record<string, any>} */
  const pageByKey = {}
  for (const planned of pagePlan) {
    const p = planned.asset
    let node = planned.node
    if (!node) {
      try {
        node = figma.createPage()
        node.setSharedPluginData(NAMESPACE, K_PAGE_CREATED, '1')
      } catch (e) { result.errors.push('page ' + p.name + ': ' + String(e.message || e)); continue }
      result.created.push('page:' + p.name)
    } else if (planned.managed && isCurrent(node, p) && planned.orderMatches) {
      result.skipped.push('page:' + p.name)
      pageByKey[p.key] = node
      continue
    } else {
      if (!planned.managed && typeof node.setSharedPluginData === 'function') {
        try {
          node.setSharedPluginData(NAMESPACE, K_PAGE_CREATED, '0')
          node.setSharedPluginData(NAMESPACE, K_PAGE_ORIGINAL, JSON.stringify({ name: node.name, backgrounds: node.backgrounds }))
        } catch (e) {
          result.errors.push('page snapshot ' + p.name + ': ' + String(e && e.message ? e.message : e))
          continue
        }
      }
      result.updated.push('page:' + p.name)
    }
    node.name = p.name
    node.backgrounds = [solid('#040A0F')]
    tag(node, p.key, p.hash)
    pageByKey[p.key] = node
  }
  spec.pages.forEach((p, i) => { const n = pageByKey[p.key]; if (n && figma.root.children[i] !== n) figma.root.insertChild(i, n) })

  // ── 2. Sections ────────────────────────────────────────────────────────────
  /** @type {Record<string, any>} */
  const sectionByName = {}
  for (const s of spec.sections) {
    const page = pageByKey[s.pageKey]
    if (!page) continue
    try {
      let node = existing[s.key]
      if (!node) {
        node = figma.createSection()
        page.appendChild(node)
        result.created.push('section:' + s.name)
      } else if (isCurrent(node, s) && node.parent === page) {
        result.skipped.push('section:' + s.name)
        sectionByName[s.name] = node
        continue
      } else {
        if (node.parent !== page) page.appendChild(node)
        result.updated.push('section:' + s.name)
      }
      node.name = s.name
      node.resizeWithoutConstraints(s.w, s.h)
      node.x = s.x
      node.y = s.y
      node.fills = [solid('#071018')]
      tag(node, s.key, s.hash)
      sectionByName[s.name] = node
    } catch (e) {
      result.errors.push('section ' + s.name + ': ' + String(e.message || e))
    }
  }

  // ── 3. Collections ─────────────────────────────────────────────────────────
  /** @type {Record<string, any>} */
  const colByKey = {}
  for (const c of spec.collections) {
    try {
      let node = existing[c.key]
      if (!node) { node = figma.variables.createVariableCollection(c.name); result.created.push('collection:' + c.name) }
      else if (isCurrent(node, c)) {
        result.skipped.push('collection:' + c.name)
        colByKey[c.key] = node
        continue
      } else { result.updated.push('collection:' + c.name) }
      node.name = c.name
      // Starter caps collections at ONE mode. We name it and never call addMode.
      try { node.renameMode(node.modes[0].modeId, c.modeName) } catch (e) { /* already named */ }
      tag(node, c.key, c.hash)
      colByKey[c.key] = node
    } catch (e) { result.errors.push('collection ' + c.name + ': ' + String(e.message || e)) }
  }

  // ── 4. Variables ───────────────────────────────────────────────────────────
  /** @type {Record<string, any>} */
  const varByKey = {}
  for (const v of spec.variables) {
    const collection = colByKey[v.collectionKey]
    if (!collection) { result.errors.push('missing collection for ' + v.name); continue }
    try {
      let node = existing[v.key]
      if (!node) { node = figma.variables.createVariable(v.name, collection, v.resolvedType); result.created.push('variable:' + v.name) }
      else if (isCurrent(node, v)) {
        result.skipped.push('variable:' + v.name)
        varByKey[v.key] = node
        continue
      } else { result.updated.push('variable:' + v.name) }
      node.name = v.name
      const modeId = collection.modes[0].modeId
      if (v.resolvedType === 'COLOR') { const c = parseColor(v.value); node.setValueForMode(modeId, { r: c.r, g: c.g, b: c.b, a: c.a }) }
      else node.setValueForMode(modeId, v.floatValue)
      node.scopes = v.scopes
      node.description = v.description
      if (v.codeSyntax && v.codeSyntax.WEB) { try { node.setVariableCodeSyntax('WEB', v.codeSyntax.WEB) } catch (e) {} }
      tag(node, v.key, v.hash)
      varByKey[v.key] = node
    } catch (e) { result.errors.push('variable ' + v.name + ': ' + String(e.message || e)) }
  }

  // ── 5. Paint styles bound to their variables ───────────────────────────────
  for (const p of spec.paintStyles) {
    try {
      let node = existing[p.key]
      if (!node) { node = figma.createPaintStyle(); result.created.push('paintStyle:' + p.name) }
      else if (isCurrent(node, p)) { result.skipped.push('paintStyle:' + p.name); continue }
      else result.updated.push('paintStyle:' + p.name)
      node.name = p.name
      let paint = solid(p.value)
      const variable = varByKey[p.variableKey]
      if (variable) paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable)
      node.paints = [paint]
      node.description = p.description
      tag(node, p.key, p.hash)
    } catch (e) { result.errors.push('paintStyle ' + p.name + ': ' + String(e.message || e)) }
  }

  // ── 6. Effect styles ───────────────────────────────────────────────────────
  for (const s of spec.effectStyles) {
    try {
      let node = existing[s.key]
      if (!node) { node = figma.createEffectStyle(); result.created.push('effectStyle:' + s.name) }
      else if (isCurrent(node, s)) { result.skipped.push('effectStyle:' + s.name); continue }
      else result.updated.push('effectStyle:' + s.name)
      node.name = s.name
      node.effects = [{ type: 'DROP_SHADOW', color: { r: s.color[0], g: s.color[1], b: s.color[2], a: s.color[3] }, offset: s.offset, radius: s.radius, spread: s.spread, visible: true, blendMode: 'NORMAL' }]
      node.description = s.description
      tag(node, s.key, s.hash)
    } catch (e) { result.errors.push('effectStyle ' + s.name + ': ' + String(e.message || e)) }
  }

  // ── 7. Component sets ──────────────────────────────────────────────────────
  const foundationsPage = pageByKey['page:foundations']
  if (foundationsPage) await figma.setCurrentPageAsync(foundationsPage)
  /** @type {Record<string, {x:number,y:number}>} */
  const layoutCursor = {}
  /** @type {Record<string, {set:any,components:any[],combos:Record<string,string>[]}>} */
  const availableSets = {}
  /** @type {{cs:any,built:any,prev:any}[]} */
  const pendingSets = []

  for (const cs of spec.componentSets) {
    let built = null
    try {
      const prev = existing[cs.key]
      if (prev && isCurrent(prev, cs)) {
        result.skipped.push('componentSet:' + cs.name + ' (' + cs.variantCount + ' variants)')
        availableSets[cs.familyKey] = {
          set: prev,
          components: childNodes(prev).filter((node) => node.type === 'COMPONENT'),
          combos: [],
        }
        continue
      }
      const host = sectionByName[cs.sectionName]
      if (!host) throw new Error('missing host section ' + cs.sectionName)
      built = await buildComponentSet(cs, fonts.resolved)
      host.appendChild(built.set)
      if (prev) {
        built.set.x = prev.x
        built.set.y = prev.y
      } else {
        layoutInSection(built.set, host, cs.sectionName, layoutCursor)
      }
      if (built.propertyErrors.length) throw new Error(built.propertyErrors.join('; '))
      availableSets[cs.familyKey] = built
      pendingSets.push({ cs, built, prev })
    } catch (e) {
      if (built && !pendingSets.some((pending) => pending.built === built)) {
        try { built.set.remove() } catch (cleanupError) {}
      }
      result.errors.push('componentSet ' + cs.name + ': ' + String(e && e.message ? e.message : e))
    }
  }

  if (!result.errors.length) {
    try {
      for (const pending of pendingSets) wireSwapProperties(pending.cs, pending.built, availableSets)
    } catch (e) {
      result.errors.push('component properties: ' + String(e && e.message ? e.message : e))
    }
  }

  if (result.errors.length) {
    for (const pending of pendingSets) { try { pending.built.set.remove() } catch (cleanupError) {} }
    return result
  }

  for (const { cs, built, prev } of pendingSets) {
    tag(built.set, cs.key, cs.hash)
    if (prev) {
      try { prev.remove() }
      catch (e) {
        try { built.set.remove() } catch (cleanupError) {}
        result.errors.push('componentSet ' + cs.name + ': could not replace the previous managed set safely: ' +
          String(e && e.message ? e.message : e))
        continue
      }
    }
    result[prev ? 'updated' : 'created'].push('componentSet:' + cs.name + ' (' + cs.variantCount + ' variants)')
  }

  return result
}

/**
 * Read-only integrity check for the exact Phase 104 contract. Stored hashes prove
 * which canonical spec version last managed an asset; structural checks catch
 * wrong parents, renamed nodes and variant-count drift. Duplicates are reported,
 * never collapsed into a false PASS.
 */
async function verifyDna() {
  const spec = buildDnaSpec()
  assertContract(spec.counts, 'Verify')
  const scan = await scanManagedAssets({ allowDuplicates: true })
  const expected = Object.fromEntries(spec.assets.map((asset) => [asset.key, asset]))
  const missing = []
  const drifted = []
  const verified = []
  const unexpected = Object.keys(scan.groups).filter((key) => !expected[key]).sort()
  const duplicates = scan.duplicates.map((d) => d.key + ' x' + d.count)

  for (const asset of spec.assets) {
    const nodes = scan.groups[asset.key] || []
    if (!nodes.length) { missing.push(asset.kind + ':' + asset.name); continue }
    const node = nodes[0]
    const reasons = []
    if (readHash(node) !== asset.hash) reasons.push('contentHash')
    if (typeof node.name === 'string' && node.name !== asset.name) reasons.push('name')
    if (asset.kind === 'page' && figma.root.children.indexOf(node) !== spec.pages.indexOf(asset)) reasons.push('page-order')
    if (asset.kind === 'section' && (!node.parent || readKey(node.parent) !== asset.pageKey)) reasons.push('parent-page')
    if (asset.kind === 'section' &&
        (node.x !== asset.x || node.y !== asset.y || node.width !== asset.w || node.height !== asset.h)) reasons.push('section-geometry')
    if (asset.kind === 'componentSet') {
      if (!node.parent || node.parent.name !== asset.sectionName) reasons.push('parent-section')
      const variants = childNodes(node).filter((child) => child.type === 'COMPONENT')
      if (variants.length !== asset.variantCount) reasons.push('variant-count:' + variants.length + '/' + asset.variantCount)
      else if (JSON.stringify(variants.map((child) => child.name).sort()) !== JSON.stringify(asset.variants.slice().sort())) reasons.push('variant-names')
      const definitions = Object.entries(node.componentPropertyDefinitions || {})
      const hasDefinition = (name, type) => definitions.some(([key, definition]) =>
        (key === name || key.split('#')[0] === name) && definition && definition.type === type)
      for (const property of (asset.text || [])) {
        if (!hasDefinition(property.name, 'TEXT')) reasons.push('TEXT-property:' + property.name)
        else if (variants.some((variant) => !childNodes(variant).some((child) => child.name === property.name &&
          child.componentPropertyReferences && child.componentPropertyReferences.characters))) reasons.push('TEXT-binding:' + property.name)
      }
      for (const property of (asset.bools || [])) {
        if (!hasDefinition(property, 'BOOLEAN')) reasons.push('BOOLEAN-property:' + property)
        else if (variants.some((variant) => !childNodes(variant).some((child) => child.name === property &&
          child.componentPropertyReferences && child.componentPropertyReferences.visible))) reasons.push('BOOLEAN-binding:' + property)
      }
      for (const property of (asset.swaps || [])) {
        if (!hasDefinition(property.name, 'INSTANCE_SWAP')) reasons.push('SWAP-property:' + property.name)
        else if (variants.some((variant) => !childNodes(variant).some((child) => child.name === property.name &&
          child.componentPropertyReferences && child.componentPropertyReferences.mainComponent))) reasons.push('SWAP-binding:' + property.name)
      }
    }
    if (asset.kind === 'collection') {
      if (!Array.isArray(node.modes) || node.modes.length !== 1 || node.modes[0].name !== asset.modeName) reasons.push('single-mode')
    }
    if (asset.kind === 'variable') {
      if (node.resolvedType !== asset.resolvedType) reasons.push('resolved-type')
      if (JSON.stringify((node.scopes || []).slice().sort()) !== JSON.stringify(asset.scopes.slice().sort())) reasons.push('scopes')
      if (node.description !== asset.description) reasons.push('description')
      if (asset.codeSyntax && asset.codeSyntax.WEB && typeof node.getVariableCodeSyntax === 'function' &&
          node.getVariableCodeSyntax('WEB') !== asset.codeSyntax.WEB) reasons.push('web-code-syntax')
    }
    if ((asset.kind === 'paintStyle' || asset.kind === 'effectStyle') && node.description !== asset.description) reasons.push('description')
    if (reasons.length) drifted.push(asset.kind + ':' + asset.name + ' [' + reasons.join(', ') + ']')
    else verified.push(asset.kind + ':' + asset.name)
  }

  const errors = []
  if (missing.length) errors.push('missing=' + missing.length)
  if (drifted.length) errors.push('drifted=' + drifted.length)
  if (duplicates.length) errors.push('duplicates=' + duplicates.length)
  if (unexpected.length) errors.push('unexpected=' + unexpected.length)
  // A discovery source that failed makes "missing" unprovable rather than false.
  for (const message of scan.enumerationErrors) errors.push('componentSetEnumeration: ' + message)
  return {
    ok: errors.length === 0,
    verified,
    missing,
    drifted,
    duplicates,
    unexpected,
    errors,
    counts: spec.counts,
    componentSetScan: {
      local: scan.componentSets.length,
      fromTreeWalk: scan.componentSetsFromTreeWalk,
      fromDirectApi: scan.componentSetsFromDirectApi,
      owned: scan.componentSets.filter((node) => !!readKey(node)).length,
      unclaimed: scan.componentSets.filter((node) => !readKey(node)).length,
    },
    stateSignature: stateSignature(scan.index, materialiseNodes(figma.root.children)),
  }
}

/** Simple stacking layout so sets never pile up at (0,0). */
function layoutInSection(node, section, sectionName, cursor) {
  if (!section) return
  const c = cursor[sectionName] || { x: 80, y: 140 }
  // Children of a Section use parent-relative coordinates. Adding section.x/y
  // double-offsets every set when the Section itself is not at the origin.
  node.x = c.x
  node.y = c.y
  c.y += node.height + 120
  if (c.y > section.height - 200) { c.y = 140; c.x += 1600 }
  cursor[sectionName] = c
}

/**
 * Build one component set: every variant as a COMPONENT with real auto-layout,
 * combined via combineAsVariants, then given TEXT / BOOLEAN / INSTANCE_SWAP
 * component properties. TEXT properties are the locale mechanism.
 */
async function buildComponentSet(cs, fonts) {
  const preset = PRESETS[cs.preset] || PRESETS.control
  const axisNames = Object.keys(cs.axes)
  /** @type {any[]} */
  const components = []

  /** @type {Record<string,string>[]} */
  let combos = [{}]
  for (const n of axisNames) {
    const next = []
    for (const b of combos) for (const v of cs.axes[n]) next.push({ ...b, [n]: v })
    combos = next
  }

  const family = { glass: cs.glass }

  for (const combo of combos) {
    const style = resolveStyle(family, combo)
    const comp = figma.createComponent()
    comp.name = axisNames.map((k) => k + '=' + combo[k]).join(', ')
    comp.layoutMode = preset.layout
    comp.primaryAxisSizingMode = 'AUTO'
    comp.counterAxisSizingMode = 'AUTO'
    comp.paddingLeft = preset.padX
    comp.paddingRight = preset.padX
    comp.paddingTop = preset.padY
    comp.paddingBottom = preset.padY
    comp.itemSpacing = preset.gap
    comp.counterAxisAlignItems = preset.align === 'CENTER' ? 'CENTER' : 'MIN'
    comp.cornerRadius = preset.radius
    comp.fills = style.fill ? [solid(style.fill)] : []
    comp.strokes = style.stroke ? [solid(style.stroke)] : []
    comp.strokeWeight = 1
    if (isDashed(family, combo)) comp.dashPattern = [4, 3]
    // RTL is expressed structurally, by reversing the auto-layout axis.
    if (combo.Direction === 'RTL' && preset.layout === 'HORIZONTAL') comp.itemReverseZIndex = false
    if (combo.Direction === 'RTL') comp.name = comp.name // direction handled by child order below

    // status/accent dot — the non-colour cue lives with it
    if (style.accent) {
      const dot = figma.createEllipse()
      dot.resize(8, 8)
      dot.fills = [solid(style.accent)]
      dot.name = 'Indicator'
      comp.appendChild(dot)
      dot.layoutSizingHorizontal = 'FIXED'
      dot.layoutSizingVertical = 'FIXED'
    }

    // text parts — these become the locale-bearing component properties
    const textParts = (cs.text && cs.text.length ? cs.text : [{ name: 'Label', default: { en: cs.name.split('/').pop() } }])
    for (const t of textParts) {
      const tn = figma.createText()
      const f = fonts['body/Medium'] || { family: 'Inter', style: 'Medium' }
      tn.fontName = f
      tn.fontSize = 13
      tn.characters = String((t.default && (t.default.en || '')) || t.name)
      tn.fills = [solid(style.text)]
      tn.name = t.name
      comp.appendChild(tn)
    }

    if (combo.Direction === 'RTL') {
      // mirror child order so the leading element sits on the right
      const kids = comp.children.slice().reverse()
      kids.forEach((k, i) => comp.insertChild(i, k))
    }

    const geometry = variantGeometry(cs.familyKey, combo)
    if (geometry) {
      if (preset.layout === 'HORIZONTAL') comp.primaryAxisSizingMode = 'FIXED'
      else comp.counterAxisSizingMode = 'FIXED'
      comp.resize(geometry.width, Math.max(comp.height, 1))
    }

    if (preset.height && preset.layout === 'HORIZONTAL') {
      comp.counterAxisSizingMode = 'FIXED'
      comp.resize(Math.max(comp.width, 1), preset.height)
    }

    components.push(comp)
  }

  const set = figma.combineAsVariants(components, figma.currentPage)
  set.name = cs.name
  set.description = cs.description
  set.layoutMode = 'HORIZONTAL'
  set.primaryAxisSizingMode = 'AUTO'
  set.counterAxisSizingMode = 'AUTO'
  set.itemSpacing = 24
  set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 24
  set.counterAxisAlignItems = 'CENTER'
  set.fills = [solid('rgba(12, 23, 32, 0.35)')]
  set.strokes = [solid(DNA.EDGE.hairline.value)]
  set.cornerRadius = 12

  // ── component properties ────────────────────────────────────────────────
  /** @type {Record<string,string>} */
  const propIds = {}
  /** @type {string[]} */
  const propertyErrors = []
  for (const t of (cs.text || [])) {
    try {
      propIds[t.name] = set.addComponentProperty(t.name, 'TEXT', String((t.default && t.default.en) || ''))
    } catch (e) { propertyErrors.push('TEXT ' + t.name + ': ' + String(e && e.message ? e.message : e)) }
  }
  for (const b of (cs.bools || [])) {
    try {
      const pid = set.addComponentProperty(b, 'BOOLEAN', true)
      for (const comp of components) {
        const marker = figma.createText()
        marker.fontName = fonts['body/Regular'] || { family: 'Inter', style: 'Regular' }
        marker.fontSize = 10
        marker.characters = b
        marker.fills = [solid('#A9BAC6')]
        marker.name = b
        // A node becomes a component sublayer only once it is INSIDE the
        // ComponentNode. Binding first fails with "Can only set component
        // property references on symbol sublayer" — which is what cost Apply all
        // 24 sets: three families raised it, and the fail-closed cleanup then
        // correctly removed every set that had been built. Append, then bind.
        comp.appendChild(marker)
        try {
          marker.componentPropertyReferences = { visible: pid }
        } catch (bindError) {
          // Leave nothing half-bound behind; the throw hands the failure to the
          // existing fail-closed path, which discards the whole set.
          try { marker.remove() } catch (cleanupError) {}
          throw bindError
        }
      }
    } catch (e) { propertyErrors.push('BOOLEAN ' + b + ': ' + String(e && e.message ? e.message : e)) }
  }

  // bind each variant's text nodes to the TEXT properties
  for (const comp of components) {
    for (const child of comp.children) {
      if (child.type !== 'TEXT') continue
      const pid = propIds[child.name]
      if (pid) {
        try { child.componentPropertyReferences = { characters: pid } }
        catch (e) { propertyErrors.push('TEXT binding ' + child.name + ': ' + String(e && e.message ? e.message : e)) }
      }
    }
  }

  return { set, components, combos, propertyErrors }
}

/**
 * Wire INSTANCE_SWAP properties only after every target set exists. This avoids
 * empty-string defaults and makes each property control a real nested instance.
 * @param {any} cs
 * @param {{set:any,components:any[],combos:Record<string,string>[]}} built
 * @param {Record<string,{set:any,components:any[],combos:Record<string,string>[]}>} availableSets
 */
function wireSwapProperties(cs, built, availableSets) {
  for (const swap of (cs.swaps || [])) {
    const targetSet = availableSets[swap.target]
    const target = targetSet && targetSet.components[0]
    if (!target || typeof target.createInstance !== 'function') {
      throw new Error(cs.name + ' swap "' + swap.name + '" has no usable target family ' + swap.target)
    }
    const propertyId = built.set.addComponentProperty(swap.name, 'INSTANCE_SWAP', target.id)
    for (let i = 0; i < built.components.length; i++) {
      const instance = target.createInstance()
      instance.name = swap.name
      if (built.combos[i] && built.combos[i].Direction === 'RTL') built.components[i].insertChild(0, instance)
      else built.components[i].appendChild(instance)
      instance.componentPropertyReferences = { mainComponent: propertyId }
    }
  }
}

/**
 * Delete EXACTLY the assets this plugin owns. Keys off the live namespace scan,
 * never off a name prefix — a prefix match could delete owner-authored nodes.
 * Pages are renamed rather than deleted (the Starter plan needs all three).
 */
async function rollbackDna() {
  const removed = /** @type {string[]} */ ([])
  const restored = /** @type {string[]} */ ([])
  const retained = /** @type {string[]} */ ([])
  const errors = /** @type {string[]} */ ([])
  const scan = await scanManagedAssets({ allowDuplicates: true })
  const rank = (k) => (k.startsWith('componentSet:') ? 0
    : k.startsWith('paintStyle:') || k.startsWith('effectStyle:') ? 1
      : k.startsWith('variable:') ? 2
        : k.startsWith('section:') ? 3
          : k.startsWith('collection:') ? 4
            : k.startsWith('page:') ? 5 : 4)
  const entries = Object.entries(scan.groups)
    .flatMap(([key, nodes]) => nodes.map((node) => ({ key, node })))
    .sort((a, b) => rank(a.key) - rank(b.key))

  for (const { key, node } of entries) {
    try {
      if (key.startsWith('section:') && childNodes(node).length) {
        clearTag(node)
        retained.push(key + ' (contains non-plugin content)')
        continue
      }
      if (key.startsWith('page:')) {
        const created = node.getSharedPluginData(NAMESPACE, K_PAGE_CREATED) === '1'
        if (created) {
          if (Array.isArray(node.children) && node.children.length === 0 && figma.root.children.length > 1) {
            node.remove()
            removed.push(key)
          } else {
            clearTag(node)
            retained.push(key + ' (page retained because it contains content or is the last page)')
          }
          continue
        }
        const raw = node.getSharedPluginData(NAMESPACE, K_PAGE_ORIGINAL)
        if (!raw) throw new Error('reused page has no original-state snapshot')
        const original = JSON.parse(raw)
        node.name = original.name
        node.backgrounds = original.backgrounds
        clearTag(node)
        restored.push(key)
        continue
      }
      node.remove()
      removed.push(key)
    } catch (e) { errors.push(key + ': ' + String(e && e.message ? e.message : e)) }
  }
  return { removed, restored, retained, errors }
}

module.exports = {
  applyDna,
  verifyDna,
  rollbackDna,
  scanExisting,
  scanManagedAssets,
  enumerateLocalComponentSets,
  unclaimedComponentSetCollisions,
  materialiseNodes,
  nodeIdentity,
  planPages,
  stateSignature,
  resolveStyle,
  isDashed,
  NAMESPACE,
}

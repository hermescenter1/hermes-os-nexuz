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

const { buildDnaSpec } = require('./dna-spec')
const { assertContract } = require('./contract')
const { parseColor } = require('./contrast')
const DNA = require('./dna-tokens')
const { PRESETS } = require('./dna-components')

const NAMESPACE = 'hermesP104'
const K_MANAGED = 'managed'
const K_ASSET_KEY = 'assetKey'
const K_HASH = 'contentHash'

/** @param {string} v */
const rgb = (v) => { const c = parseColor(v); return { r: c.r, g: c.g, b: c.b } }
/** @param {string} v */
const opacityOf = (v) => parseColor(v).a
/** @param {string} v */
const solid = (v) => ({ type: 'SOLID', color: rgb(v), opacity: opacityOf(v) })

function tag(node, assetKey, hash) {
  if (!node || typeof node.setSharedPluginData !== 'function') return
  node.setSharedPluginData(NAMESPACE, K_MANAGED, '1')
  node.setSharedPluginData(NAMESPACE, K_ASSET_KEY, assetKey)
  node.setSharedPluginData(NAMESPACE, K_HASH, hash)
}
function readKey(node) {
  if (!node || typeof node.getSharedPluginData !== 'function') return null
  return node.getSharedPluginData(NAMESPACE, K_ASSET_KEY) || null
}

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

async function scanExisting() {
  /** @type {Record<string, any>} */
  const index = {}
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) { const k = readKey(c); if (k) index[k] = c }
  for (const v of await figma.variables.getLocalVariablesAsync()) { const k = readKey(v); if (k) index[k] = v }
  for (const s of await figma.getLocalPaintStylesAsync()) { const k = readKey(s); if (k) index[k] = s }
  for (const s of await figma.getLocalEffectStylesAsync()) { const k = readKey(s); if (k) index[k] = s }
  for (const p of figma.root.children) {
    const k = readKey(p)
    if (k) index[k] = p
    for (const n of p.children) { const nk = readKey(n); if (nk) index[nk] = n }
  }
  return index
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

  if (typeof figma.loadAllPagesAsync === 'function') await figma.loadAllPagesAsync()
  const existing = await scanExisting()

  const result = {
    dryRun,
    created: /** @type {string[]} */ ([]),
    updated: /** @type {string[]} */ ([]),
    skipped: /** @type {string[]} */ ([]),
    errors: /** @type {string[]} */ ([]),
    fontSubstitutions: /** @type {string[]} */ ([]),
    counts: spec.counts,
  }

  if (dryRun) {
    for (const a of spec.assets) {
      const prev = existing[a.key]
      const label = a.kind + ':' + a.name
      if (!prev) result.created.push(label)
      else if (prev.getSharedPluginData && prev.getSharedPluginData(NAMESPACE, K_HASH) !== a.hash) result.updated.push(label)
      else result.skipped.push(label)
    }
    return result
  }

  const fonts = await loadFonts()
  result.fontSubstitutions = fonts.substitutions

  // ── 1. Pages — reuse the three the Starter plan allows, never create a 4th ──
  /** @type {Record<string, any>} */
  const pageByKey = {}
  const livePages = figma.root.children.slice()
  spec.pages.forEach((p, i) => {
    let node = existing[p.key] || livePages[i]
    if (!node) {
      try { node = figma.createPage() } catch (e) { result.errors.push('page ' + p.name + ': ' + String(e.message || e)); return }
      result.created.push('page:' + p.name)
    } else {
      result.updated.push('page:' + p.name)
    }
    node.name = p.name
    node.backgrounds = [solid('#040A0F')]
    tag(node, p.key, p.hash)
    pageByKey[p.key] = node
  })
  spec.pages.forEach((p, i) => { const n = pageByKey[p.key]; if (n) figma.root.insertChild(i, n) })

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
      else { result.skipped.push('collection:' + c.name) }
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
      else { result.updated.push('variable:' + v.name) }
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

  for (const cs of spec.componentSets) {
    try {
      const prev = existing[cs.key]
      if (prev) { try { prev.remove() } catch (e) {} } // rebuild in place — variants cannot be edited piecemeal
      const built = await buildComponentSet(cs, fonts.resolved)
      const host = sectionByName[cs.sectionName]
      if (host) host.appendChild(built.set)
      layoutInSection(built.set, host, cs.sectionName)
      tag(built.set, cs.key, cs.hash)
      result[prev ? 'updated' : 'created'].push('componentSet:' + cs.name + ' (' + cs.variantCount + ' variants)')
    } catch (e) {
      result.errors.push('componentSet ' + cs.name + ': ' + String(e && e.message ? e.message : e))
    }
  }

  return result
}

/** Simple stacking layout so sets never pile up at (0,0). */
const _cursor = {}
function layoutInSection(node, section, sectionName) {
  if (!section) return
  const c = _cursor[sectionName] || { x: 80, y: 140 }
  node.x = section.x + c.x
  node.y = section.y + c.y
  c.y += node.height + 120
  if (c.y > section.height - 200) { c.y = 140; c.x += 1600 }
  _cursor[sectionName] = c
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
  for (const t of (cs.text || [])) {
    try {
      propIds[t.name] = set.addComponentProperty(t.name, 'TEXT', String((t.default && t.default.en) || ''))
    } catch (e) { /* duplicate name */ }
  }
  for (const b of (cs.bools || [])) {
    try { set.addComponentProperty(b, 'BOOLEAN', true) } catch (e) {}
  }
  for (const s of (cs.swaps || [])) {
    try { set.addComponentProperty(s, 'INSTANCE_SWAP', '') } catch (e) {}
  }

  // bind each variant's text nodes to the TEXT properties
  for (const comp of components) {
    for (const child of comp.children) {
      if (child.type !== 'TEXT') continue
      const pid = propIds[child.name]
      if (pid) { try { child.componentPropertyReferences = { characters: pid } } catch (e) {} }
    }
  }

  return { set, components }
}

/**
 * Delete EXACTLY the assets this plugin owns. Keys off the live namespace scan,
 * never off a name prefix — a prefix match could delete owner-authored nodes.
 * Pages are renamed rather than deleted (the Starter plan needs all three).
 */
async function rollbackDna() {
  const removed = /** @type {string[]} */ ([])
  const errors = /** @type {string[]} */ ([])
  if (typeof figma.loadAllPagesAsync === 'function') await figma.loadAllPagesAsync()
  const index = await scanExisting()
  const rank = (k) => (k.startsWith('componentSet:') ? 0 : k.startsWith('variable:') ? 1 : k.startsWith('section:') ? 2 : k.startsWith('collection:') ? 3 : k.startsWith('page:') ? 5 : 4)
  for (const key of Object.keys(index).sort((a, b) => rank(a) - rank(b))) {
    if (key.startsWith('page:')) continue // never delete a page — Starter allows only 3
    try { index[key].remove(); removed.push(key) }
    catch (e) { errors.push(key + ': ' + String(e && e.message ? e.message : e)) }
  }
  return { removed, errors }
}

module.exports = { applyDna, rollbackDna, scanExisting, resolveStyle, isDashed, NAMESPACE }

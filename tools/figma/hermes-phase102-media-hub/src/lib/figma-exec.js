// @ts-check
'use strict'
/**
 * Figma executor — the ONLY module that touches the `figma` global. Builds
 * the 3-page Phase 102 file (01 Foundations / 02 Components / 03 Screens) in
 * INCREMENTAL, RESUMABLE stages, idempotently (create/update/skip keyed off
 * shared-plugin-data markers — a rerun never duplicates).
 *
 * Safety invariants:
 *  - Every created asset is tagged in the `hermesP102` shared-plugin-data
 *    namespace (assetKey + kind + content hash + FIRST-creation runId).
 *  - FAIL CLOSED before any mutation on: (a) invalid/empty text anywhere in
 *    the Screens spec, (b) a page plan that would exceed the Starter 3-page
 *    cap, (c) ambiguous ownership (duplicate assetKey markers).
 *  - Fonts NEVER block Apply — resolveFontPlan (tokens.js) always resolves to
 *    something loadable and reports substitutions; graceful fallback per the
 *    task brief, not a hard gate.
 *  - RTL mirroring respects rtl.js PROTECTED_LTR_ROLES: the player timeline,
 *    any progress/watch meter and timestamp labels are never reordered or
 *    right-aligned, even while everything around them mirrors.
 *  - Interrupted Apply recovery = RERUN the same stage (or "All"): per-asset
 *    hashes converge; nothing is duplicated.
 */

const C = require('./constants')
const { buildSpec } = require('./spec')
const { computePlan, detectAmbiguity, stageKinds } = require('./plan')
const { planPages } = require('./pages')
const { parseColor, resolveFontPlan, FONTS } = require('./tokens')
const { PRESETS } = require('./presets')
const { variantCombos } = require('./components')
const { validateScreenText, textProblem, charactersError } = require('./validate')
const { isProtectedRole } = require('./rtl')

const NS = C.NAMESPACE
const K = C.KEYS

// ── shared-plugin-data tagging ─────────────────────────────────────────────
/** @param {any} obj @param {{assetKey:string, kind:string, hash:string, runId:string}} t */
function tag(obj, t) {
  obj.setSharedPluginData(NS, K.MANAGED, '1')
  obj.setSharedPluginData(NS, K.ASSET_KEY, t.assetKey)
  obj.setSharedPluginData(NS, K.ASSET_KIND, t.kind)
  obj.setSharedPluginData(NS, K.CONTENT_HASH, t.hash)
  const priorRun = obj.getSharedPluginData(NS, K.RUN_ID)
  obj.setSharedPluginData(NS, K.RUN_ID, priorRun && priorRun.length ? priorRun : t.runId)
  obj.setSharedPluginData(NS, K.PLUGIN_VERSION, C.PLUGIN_VERSION)
}
/** @param {any} obj */
function isManaged(obj) {
  try { return obj.getSharedPluginData(NS, K.MANAGED) === '1' } catch (_e) { return false }
}
/** @param {any} obj */
function readTag(obj) {
  return {
    assetKey: obj.getSharedPluginData(NS, K.ASSET_KEY),
    kind: obj.getSharedPluginData(NS, K.ASSET_KIND),
    hash: obj.getSharedPluginData(NS, K.CONTENT_HASH),
    runId: obj.getSharedPluginData(NS, K.RUN_ID),
  }
}

let _runSeq = 0
function newRunId() {
  _runSeq += 1
  return 'run-' + Date.now().toString(36) + '-' + _runSeq
}

// ── pages (Starter 3-page cap) ──────────────────────────────────────────────
/** Pure pre-check, safe to call before any mutation. */
function checkPagePlan() {
  const existingNames = figma.root.children.map((p) => p.name)
  return planPages(existingNames, [...C.PAGE_NAMES])
}
/** Executes a (previously validated) page plan. Mutates: rename/create pages. */
function applyPagePlan(plan) {
  /** @type {Record<string, any>} */
  const pagesByName = {}
  for (const act of plan.actions) {
    if (act.action === 'reuse') {
      pagesByName[act.name] = figma.root.children[/** @type {number} */ (act.idx)]
    } else if (act.action === 'rename') {
      const pg = figma.root.children[/** @type {number} */ (act.idx)]
      pg.name = act.name
      pagesByName[act.name] = pg
    } else if (act.action === 'create') {
      const pg = figma.createPage()
      pg.name = act.name
      pagesByName[act.name] = pg
    }
  }
  return pagesByName
}

// ── LIVE index (source of truth) across the 3 managed pages ────────────────
/** @param {Record<string, any>} pagesByName */
async function buildLiveIndex(pagesByName) {
  /** @type {Record<string, {id:string, hash:string, kind:string, runId:string}>} */
  const index = {}
  const paint = {}
  const text = {}
  const effect = {}
  const variables = {}
  const collections = {}
  const componentSets = {}
  const docs = {}
  const screens = {}
  /** @type {{assetKey:string, id:string, kind:string}[]} */
  const observations = []
  /** @type {Record<string, any>} */
  const sections = {}

  /** @param {any} obj @param {Record<string, any>|null} bucket */
  const note = (obj, bucket) => {
    const t = readTag(obj)
    if (t.kind === C.KIND.MANIFEST || !t.assetKey) return
    observations.push({ assetKey: t.assetKey, id: obj.id, kind: t.kind })
    index[t.assetKey] = { id: obj.id, hash: t.hash, kind: t.kind, runId: t.runId }
    if (bucket) bucket[t.assetKey] = obj
  }

  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) if (isManaged(c)) note(c, collections)
  for (const v of await figma.variables.getLocalVariablesAsync()) if (isManaged(v)) note(v, variables)
  for (const ps of await figma.getLocalPaintStylesAsync()) if (isManaged(ps)) note(ps, paint)
  for (const ts of await figma.getLocalTextStylesAsync()) if (isManaged(ts)) note(ts, text)
  for (const es of await figma.getLocalEffectStylesAsync()) if (isManaged(es)) note(es, effect)

  /** @param {any} page @param {Record<string, any>} contentBucket */
  const scanPage = (page, contentBucket) => {
    if (!page) return
    for (const child of page.children) {
      if (isManaged(child)) {
        const t = readTag(child)
        if (t.kind === C.KIND.SECTION) {
          observations.push({ assetKey: t.assetKey, id: child.id, kind: t.kind })
          index[t.assetKey] = { id: child.id, hash: t.hash, kind: t.kind, runId: t.runId }
          sections[t.assetKey] = child
          for (const sub of child.children || []) {
            if (!isManaged(sub)) continue
            note(sub, contentBucket)
          }
        } else {
          note(child, contentBucket)
        }
      }
    }
  }
  scanPage(pagesByName[C.PAGES.FOUNDATIONS], docs)
  scanPage(pagesByName[C.PAGES.COMPONENTS], componentSets)
  scanPage(pagesByName[C.PAGES.SCREENS], screens)

  return { index, observations, styles: { paint, text, effect }, variables, collections, docs, componentSets, screens, sections }
}

// ── font resolution (never blocks — graceful fallback) ─────────────────────
/** @param {ReadonlyArray<{font:string, weight:string}>} textStyleSpecs @param {{display:{family:string,fallback:string}, body:{family:string,fallback:string}, mono:{family:string,fallback:string}}} FONTS */
async function resolveFonts(textStyleSpecs, FONTS) {
  const available = await figma.listAvailableFontsAsync()
  const has = new Set(available.map((f) => f.fontName.family + ' ' + f.fontName.style))
  const substitutions = []
  /** @type {Record<string, {family:string, style:string}>} */
  const cache = {}
  for (const t of textStyleSpecs) {
    const desired = FONTS[t.font]
    const key = t.font + '|' + t.weight
    if (cache[key]) continue
    const plan = resolveFontPlan(desired.family, t.weight, has)
    try { await figma.loadFontAsync({ family: plan.family, style: plan.style }) } catch (_e) { /* Inter is always preloaded */ }
    cache[key] = { family: plan.family, style: plan.style }
    if (plan.substituted) substitutions.push(plan.note)
  }
  return { resolve: (role, weight) => cache[role + '|' + weight] || cache[role + '|Regular'] || { family: 'Inter', style: 'Regular' }, substitutions }
}

// ── paint helper ───────────────────────────────────────────────────────────
/** @param {string} value */
function solidPaint(value) {
  const c = parseColor(value)
  const p = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b } }
  if (c.a < 1) /** @type {any} */ (p).opacity = c.a
  return p
}

// ── foundation upserts ──────────────────────────────────────────────────────
function upsertCollection(specEntry, live, runId) {
  let col = live.collections[specEntry.key]
  if (!col) { col = figma.variables.createVariableCollection(specEntry.name); live.collections[specEntry.key] = col }
  else if (col.name !== specEntry.name) col.name = specEntry.name
  try { if (col.modes[0] && col.modes[0].name !== specEntry.modeName) col.renameMode(col.defaultModeId, specEntry.modeName) } catch (_e) { /* best-effort */ }
  tag(col, { assetKey: specEntry.key, kind: C.KIND.COLLECTION, hash: specEntry.hash, runId })
  return col
}
function upsertVariable(v, live, runId) {
  const col = live.collections[v.collectionKey]
  if (!col) throw new Error('collection missing for ' + v.key)
  let variable = live.variables[v.key]
  if (!variable) { variable = figma.variables.createVariable(v.name, col, v.resolvedType); live.variables[v.key] = variable }
  else if (variable.name !== v.name) variable.name = v.name
  try { variable.scopes = v.scopes } catch (_e) { /* ignore */ }
  variable.description = v.description
  const modeId = col.defaultModeId
  if (v.resolvedType === 'COLOR') variable.setValueForMode(modeId, parseColor(v.value))
  else variable.setValueForMode(modeId, v.floatValue)
  tag(variable, { assetKey: v.key, kind: C.KIND.VARIABLE, hash: v.hash, runId })
  return variable
}
function upsertPaintStyle(p, live, runId) {
  let ps = live.styles.paint[p.key]
  if (!ps) { ps = figma.createPaintStyle(); live.styles.paint[p.key] = ps }
  ps.name = p.name
  ps.description = p.description
  let paint = /** @type {any} */ (solidPaint(p.value))
  const variable = live.variables[p.variableKey]
  if (variable) { try { paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable) } catch (_e) { /* raw */ } }
  ps.paints = [paint]
  tag(ps, { assetKey: p.key, kind: C.KIND.PAINT_STYLE, hash: p.hash, runId })
  return ps
}
function upsertTextStyle(t, live, fonts, runId) {
  let ts = live.styles.text[t.key]
  if (!ts) { ts = figma.createTextStyle(); live.styles.text[t.key] = ts }
  ts.name = t.name
  ts.description = t.description
  ts.fontName = fonts.resolve(t.font, t.weight)
  ts.fontSize = t.size
  ts.lineHeight = { unit: 'PIXELS', value: t.line }
  ts.letterSpacing = { unit: 'PIXELS', value: t.tracking }
  tag(ts, { assetKey: t.key, kind: C.KIND.TEXT_STYLE, hash: t.hash, runId })
  return ts
}
function upsertEffectStyle(e, live, runId) {
  let es = live.styles.effect[e.key]
  if (!es) { es = figma.createEffectStyle(); live.styles.effect[e.key] = es }
  es.name = e.name
  es.description = e.description
  /** @type {any[]} */
  const effects = []
  if (e.glass) effects.push({ type: 'BACKGROUND_BLUR', radius: e.blurRadius, visible: true })
  effects.push({ type: 'DROP_SHADOW', color: { r: e.color[0], g: e.color[1], b: e.color[2], a: e.color[3] }, offset: { x: e.offset.x, y: e.offset.y }, radius: e.radius, spread: e.spread, visible: true, blendMode: 'NORMAL' })
  es.effects = effects
  tag(es, { assetKey: e.key, kind: C.KIND.EFFECT_STYLE, hash: e.hash, runId })
  return es
}

// ── sections (one per managed page) ─────────────────────────────────────────
/** @param {any} sectionSpec @param {any} live @param {any} page @param {string} runId */
function ensureSection(sectionSpec, live, page, runId) {
  let section = live.sections[sectionSpec.key]
  if (!section) {
    const sec = /** @type {any} */ (figma.createSection())
    sec.x = 0
    sec.y = 0
    try { sec.resizeWithoutConstraints(3600, 6000) } catch (_e) { /* ignore */ }
    page.appendChild(sec)
    section = sec
    live.sections[sectionSpec.key] = sec
  } else if (section.parent !== page) {
    page.appendChild(section) // idempotent re-parent, e.g. after a page rename swap
  }
  section.name = sectionSpec.name
  tag(section, { assetKey: sectionSpec.key, kind: C.KIND.SECTION, hash: sectionSpec.hash, runId })
  return section
}

// ── blueprint renderer (shared by components AND doc specimens) ────────────
/**
 * Render a NodeSpec tree into Figma nodes. Returns { node, roles }.
 * @param {any} spec @param {any} ctx { fonts, paintByToken, textStyleByName, effectByName, iconDefault }
 */
async function renderNode(spec, ctx) {
  /** @type {Record<string, any>} */
  const roles = {}

  /** @param {any} s @param {any|null} parent */
  const build = async (s, parent) => {
    let node
    if (s.type === 'text') {
      node = figma.createText()
      node.fontName = ctx.fonts.resolve('body', 'Regular')
      setChars(node, s.text != null ? s.text : '', { role: s.role }, { allowEmpty: true })
    } else if (s.type === 'ellipse') {
      node = figma.createEllipse()
      node.resize(s.w || 10, s.h || 10)
    } else if (s.type === 'rect') {
      node = figma.createRectangle()
      node.resize(s.w || 10, s.h || 10)
      if (s.radius != null) node.cornerRadius = s.radius
      if (s.rotation) { try { node.rotation = s.rotation } catch (_e) { /* ignore */ } }
    } else if (s.type === 'iconSlot') {
      if (ctx.iconDefault) { try { node = ctx.iconDefault.createInstance() } catch (_e) { node = null } }
      if (!node) { node = figma.createEllipse(); node.resize(s.w || 16, s.h || 16) }
    } else {
      node = figma.createFrame()
      node.layoutMode = s.row ? 'HORIZONTAL' : 'VERTICAL'
      node.primaryAxisSizingMode = 'AUTO'
      node.counterAxisSizingMode = 'AUTO'
      node.itemSpacing = s.gap ?? 0
      node.paddingLeft = node.paddingRight = s.padX ?? 0
      node.paddingTop = node.paddingBottom = s.padY ?? 0
      if (s.center) node.counterAxisAlignItems = 'CENTER'
      if (s.radius != null) node.cornerRadius = s.radius
      node.fills = []
    }
    node.name = s.role
    if (parent) parent.appendChild(node)

    const styleFor = (tok) => (tok ? ctx.paintByToken[tok] : null)
    if (s.fill !== undefined && s.type !== 'iconSlot') {
      if (s.fill === null) node.fills = []
      else { const st = styleFor(s.fill); if (st) { try { await node.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } } }
    }
    if (s.stroke !== undefined && s.stroke !== null) {
      const st = styleFor(s.stroke)
      node.strokes = [solidPaint('#203743')]
      node.strokeWeight = s.strokeW ?? 1
      if (st) { try { await node.setStrokeStyleIdAsync(st.id) } catch (_e) { /* ignore */ } }
    }
    if (s.type === 'text') {
      const ramp = ctx.textStyleByName[s.textStyle]
      if (ramp) { try { await node.setTextStyleIdAsync(ramp.id) } catch (_e) { /* ignore */ } }
      const tf = styleFor(s.textFill)
      if (tf) { try { await node.setFillStyleIdAsync(tf.id) } catch (_e) { /* ignore */ } }
      if (s.maxW) { node.textAutoResize = 'HEIGHT'; node.resize(s.maxW, node.height) }
    }
    if (s.effectStyle && ctx.effectByName[s.effectStyle]) { try { await node.setEffectStyleIdAsync(ctx.effectByName[s.effectStyle].id) } catch (_e) { /* ignore */ } }
    if (s.hidden) node.visible = false

    for (const c of s.children || []) await build(c, node)

    if (parent && s.grow === 'fill') { try { node.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ } }
    if (s.minH != null) { try { node.minHeight = s.minH } catch (_e) { /* ignore */ } }
    if (s.minW != null) { try { node.minWidth = s.minW } catch (_e) { /* ignore */ } }
    if (s.type === 'frame' && (s.w != null || s.h != null)) {
      try {
        if (s.w != null) { if (s.row) node.primaryAxisSizingMode = 'FIXED'; else node.counterAxisSizingMode = 'FIXED' }
        if (s.h != null) { if (s.row) node.counterAxisSizingMode = 'FIXED'; else node.primaryAxisSizingMode = 'FIXED' }
        node.resize(s.w != null ? s.w : node.width, s.h != null ? s.h : node.height)
      } catch (_e) { /* ignore */ }
    }

    roles[s.role] = node
    return node
  }

  const node = await build(spec, null)
  return { node, roles }
}

/** DEFENSIVE characters assignment — never assigns a non-string/undefined/null; throws with full context otherwise. */
function setChars(node, value, ctxInfo, opts) {
  const p = textProblem(value)
  if (p && !(opts && opts.allowEmpty && (p === 'empty string' || p === 'whitespace-only string'))) {
    throw charactersError(value, ctxInfo)
  }
  node.characters = value
}

/** Apply one override list ({role, set:{...}}) to rendered roles. */
async function applyOverrides(roles, overrides, ctx) {
  for (const o of overrides || []) {
    const node = o.role === 'root' ? roles.root : roles[o.role]
    if (!node) continue
    const s = o.set || {}
    const styleFor = (tok) => (tok ? ctx.paintByToken[tok] : null)
    if (s.fill !== undefined) {
      if (s.fill === null) node.fills = []
      else { const st = styleFor(s.fill); if (st) { try { await node.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } } }
    }
    if (s.stroke !== undefined) {
      if (s.stroke === null) { node.strokes = [] } else {
        const st = styleFor(s.stroke)
        if (!node.strokes || !node.strokes.length) node.strokes = [solidPaint('#203743')]
        if (st) { try { await node.setStrokeStyleIdAsync(st.id) } catch (_e) { /* ignore */ } }
      }
    }
    if (s.strokeW != null) node.strokeWeight = s.strokeW
    if (s.textFill) { const st = styleFor(s.textFill); if (st && node.type === 'TEXT') { try { await node.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } } }
    if (s.opacity != null) node.opacity = s.opacity
    if (s.hidden !== undefined) node.visible = !s.hidden
    if (s.text !== undefined && node.type === 'TEXT') { setChars(node, s.text, { role: o.role }) }
    if (s.w != null) { try { node.resize(s.w, node.height) } catch (_e) { /* ignore */ } }
    if (s.minW != null) { try { node.minWidth = s.minW } catch (_e) { /* ignore */ } }
  }
}

/**
 * Mirror a rendered tree for RTL: reverse every horizontal frame's children +
 * right-align text — EXCEPT any subtree rooted at a PROTECTED_LTR_ROLES role
 * (rtl.js), which is left completely untouched (see the CRITICAL player-
 * timeline requirement in the task brief).
 * @param {any} node
 */
function mirrorRtl(node) {
  if (isProtectedRole(node.name)) return
  if (node.type === 'FRAME' || node.type === 'COMPONENT') {
    if (node.layoutMode === 'HORIZONTAL') {
      const kids = [...node.children]
      for (let i = kids.length - 1; i >= 0; i--) node.appendChild(kids[i])
    }
  }
  if (node.type === 'TEXT') { try { node.textAlignHorizontal = 'RIGHT' } catch (_e) { /* ignore */ } }
  for (const c of node.children || []) mirrorRtl(c)
}

/** Default tone/dot override — Phase 102 families always supply explicit
 *  per-value overrides (components.js), so this is a documented safe no-op
 *  fallback rather than a guessed colour. */
function toneOverridesFor() { return [] }

// ── doc specimens (Foundations page) ────────────────────────────────────────
async function upsertDoc(docSpec, live, ctx, runId) {
  const existing = live.docs[docSpec.key]
  let originRunId = runId
  if (existing) {
    try { const prior = existing.getSharedPluginData(NS, K.RUN_ID); if (prior && prior.length) originRunId = prior } catch (_e) { /* ignore */ }
    try { existing.remove() } catch (_e) { /* ignore */ }
    delete live.docs[docSpec.key]
  }
  const r = await renderNode(docSpec.spec, ctx)
  r.node.name = docSpec.name
  ctx.section.appendChild(r.node)
  tag(r.node, { assetKey: docSpec.key, kind: C.KIND.DOC, hash: docSpec.hash, runId: originRunId })
  live.docs[docSpec.key] = r.node
  return r.node
}

// ── component family builder ────────────────────────────────────────────────
const STATE_PRESETS = require('./presets').STATE_PRESETS

/** @param {any} fam @param {Record<string,string>} combo */
function presetOptsFor(fam, combo) {
  const o = { ...(fam.presetOpts || {}) }
  if (fam.shapeAxis && combo.Shape) o.shape = combo.Shape
  if (fam.markAxis && combo.Mark) o.mark = combo.Mark
  return o
}

/** Find the component inside a set matching a combo. @param {any} set @param {Record<string,string>} combo */
function findVariant(set, combo) {
  if (!set) return null
  if (set.type === 'COMPONENT') return set
  const want = Object.keys(combo).map((k) => k + '=' + combo[k]).join(', ')
  const kids = (set.children || []).filter((c) => c.type === 'COMPONENT')
  let hit = kids.find((c) => c.name === want)
  if (hit) return hit
  const pairs = Object.keys(combo).map((k) => k + '=' + combo[k])
  hit = kids.find((c) => pairs.every((p2) => c.name.includes(p2)))
  return hit || kids[0] || null
}

/** Full text-property id map of a set. @param {any} set */
function textPropIdsOf(set) {
  /** @type {Record<string, string>} */
  const out = {}
  try {
    const defs = set.componentPropertyDefinitions || {}
    for (const full of Object.keys(defs)) out[full.split('#')[0]] = full
  } catch (_e) { /* ignore */ }
  return out
}

/**
 * @param {any} fam @param {any} live @param {any} ctx
 */
async function upsertFamily(fam, live, ctx) {
  const existing = live.componentSets[fam.key]
  let originRunId = ctx.runId
  if (existing) {
    try { const prior = existing.getSharedPluginData(NS, K.RUN_ID); if (prior && prior.length) originRunId = prior } catch (_e) { /* ignore */ }
    try { existing.remove() } catch (_e) { /* ignore */ }
    delete live.componentSets[fam.key]
  }

  const combos = variantCombos(fam)
  /** @type {any[]} */
  const variantComponents = []
  /** @type {{comp:any, roles:Record<string,any>, combo:Record<string,string>}[]} */
  const rendered = []

  for (const combo of combos) {
    const spec = PRESETS[fam.preset](presetOptsFor(fam, combo))
    const comp = figma.createComponent()
    comp.name = Object.keys(combo).map((k) => k + '=' + combo[k]).join(', ')
    comp.layoutMode = spec.row ? 'HORIZONTAL' : 'VERTICAL'
    comp.primaryAxisSizingMode = 'AUTO'
    comp.counterAxisSizingMode = 'AUTO'
    comp.itemSpacing = spec.gap ?? 0
    comp.paddingLeft = comp.paddingRight = spec.padX ?? 0
    comp.paddingTop = comp.paddingBottom = spec.padY ?? 0
    if (spec.center) comp.counterAxisAlignItems = 'CENTER'
    if (spec.radius != null) comp.cornerRadius = spec.radius
    comp.fills = []
    ctx.section.appendChild(comp)

    const roles = { root: comp }
    const styleFor = (tok) => (tok ? ctx.paintByToken[tok] : null)
    if (spec.fill) { const st = styleFor(spec.fill); if (st) { try { await comp.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } } }
    if (spec.stroke) {
      comp.strokes = [solidPaint('#203743')]
      comp.strokeWeight = spec.strokeW ?? 1
      const st = styleFor(spec.stroke)
      if (st) { try { await comp.setStrokeStyleIdAsync(st.id) } catch (_e) { /* ignore */ } }
    }
    if (spec.minH != null) { try { comp.minHeight = spec.minH } catch (_e) { /* ignore */ } }
    if (spec.minW != null) { try { comp.minWidth = spec.minW } catch (_e) { /* ignore */ } }

    for (const child of spec.children || []) {
      const r = await renderNode(child, ctx)
      comp.appendChild(r.node)
      Object.assign(roles, r.roles)
      if (child.grow === 'fill') { try { r.node.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ } }
    }
    if (fam.hideLabel && roles.Label) { try { roles.Label.visible = false } catch (_e) { /* ignore */ } }

    for (const axisProp of Object.keys(combo)) {
      const value = combo[axisProp]
      if (axisProp === 'Direction') continue
      const famOv = fam.valueOverrides && fam.valueOverrides[axisProp] && fam.valueOverrides[axisProp][value]
      if (famOv) await applyOverrides(roles, famOv, ctx)
      else if (axisProp === 'State') await applyOverrides(roles, STATE_PRESETS[value] || [], ctx)
      else await applyOverrides(roles, toneOverridesFor(), ctx)
      if (famOv && axisProp === 'State' && STATE_PRESETS[value] && STATE_PRESETS[value].length) {
        await applyOverrides(roles, STATE_PRESETS[value].filter((o2) => !famOv.some((f2) => f2.role === o2.role)), ctx)
      }
    }
    if (fam.elevation && ctx.effectByName[fam.elevation]) {
      try { await comp.setEffectStyleIdAsync(ctx.effectByName[fam.elevation].id) } catch (_e) { /* ignore */ }
    }
    if (combo.Direction === 'RTL') mirrorRtl(comp)

    variantComponents.push(comp)
    rendered.push({ comp, roles, combo })
  }

  let set
  if (variantComponents.length > 1) {
    try { set = figma.combineAsVariants(variantComponents, ctx.section) }
    catch (_e) { for (let i = 1; i < variantComponents.length; i++) { try { variantComponents[i].remove() } catch (_e2) { /* ignore */ } } set = variantComponents[0] }
  } else {
    set = variantComponents[0]
  }
  set.name = fam.name
  set.description = fam.description + (fam.maps ? '\nMaps to ' + fam.maps : '') + '\nA11y: ' + fam.a11y
  try {
    set.layoutMode = 'HORIZONTAL'
    set.itemSpacing = 24
    ;/** @type {any} */ (set).layoutWrap = 'WRAP'
    set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 24
  } catch (_e) { /* lone component */ }

  /** @type {Record<string, string>} */
  const propIds = {}
  let propsAdded = 0
  const canProps = typeof set.addComponentProperty === 'function'
  if (canProps) {
    for (const tp of fam.text || []) { try { propIds[tp.name] = set.addComponentProperty(tp.name, 'TEXT', ''); propsAdded++ } catch (_e) { /* ignore */ } }
    for (const bp of fam.bools || []) {
      const baseLayer = rendered[0] && rendered[0].roles[bp.role]
      const def = baseLayer ? baseLayer.visible !== false : true
      try { propIds[bp.name] = set.addComponentProperty(bp.name, 'BOOLEAN', def); propsAdded++ } catch (_e) { /* ignore */ }
    }
    for (const sp of fam.swaps || []) {
      if (!ctx.iconDefault) continue
      try { propIds[sp.name] = set.addComponentProperty(sp.name, 'INSTANCE_SWAP', ctx.iconDefault.id); propsAdded++ } catch (_e) { /* ignore */ }
    }
    for (const r of rendered) {
      for (const tp of fam.text || []) {
        const layer = r.roles[tp.role]
        if (layer && propIds[tp.name] && layer.type === 'TEXT') { try { layer.componentPropertyReferences = { characters: propIds[tp.name] } } catch (_e) { /* ignore */ } }
      }
      for (const bp of fam.bools || []) {
        const layer = r.roles[bp.role]
        if (layer && propIds[bp.name]) { try { layer.componentPropertyReferences = { visible: propIds[bp.name] } } catch (_e) { /* ignore */ } }
      }
      for (const sp of fam.swaps || []) {
        const layer = r.roles[sp.role]
        if (layer && propIds[sp.name] && layer.type === 'INSTANCE') { try { layer.componentPropertyReferences = { mainComponent: propIds[sp.name] } } catch (_e) { /* ignore */ } }
      }
    }
  }

  tag(set, { assetKey: fam.key, kind: C.KIND.COMPONENT_SET, hash: fam.hash, runId: originRunId })
  live.componentSets[fam.key] = set
  return { set, propIds, fidelity: 'rev' + fam.rev + ' (' + combos.length + ' variants, ' + propsAdded + ' props)' }
}

// ── screen builder (Screens page) ───────────────────────────────────────────
/**
 * @param {any} scr spec screen @param {any} live @param {any} ctx { section, fonts, paintByToken, textStyleByName, runId, familyByKey, unresolved }
 */
async function upsertScreen(scr, live, ctx) {
  const existing = live.screens[scr.key]
  let originRunId = ctx.runId
  let frame
  if (existing) {
    try { const prior = existing.getSharedPluginData(NS, K.RUN_ID); if (prior && prior.length) originRunId = prior } catch (_e) { /* ignore */ }
    for (const ch of [...(existing.children || [])]) { try { ch.remove() } catch (_e) { /* ignore */ } }
    frame = existing
  } else {
    frame = figma.createFrame()
    ctx.section.appendChild(frame)
  }
  frame.name = scr.name
  frame.layoutMode = 'VERTICAL'
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'FIXED'
  frame.itemSpacing = 24
  const pad = scr.breakpoint === 'mobile' ? 20 : scr.breakpoint === 'tablet' ? 32 : 48
  frame.paddingLeft = frame.paddingRight = pad
  frame.paddingTop = frame.paddingBottom = pad
  frame.resize(scr.width, 100)
  const bg = ctx.paintByToken['Color/Background/Base']
  if (bg) { try { await frame.setFillStyleIdAsync(bg.id) } catch (_e) { /* ignore */ } }

  /** @param {any} item @param {any} parent */
  const place = async (item, parent) => {
    if (item.row) {
      const row = figma.createFrame()
      row.name = 'Row'
      row.layoutMode = 'HORIZONTAL'
      row.primaryAxisSizingMode = 'AUTO'
      row.counterAxisSizingMode = 'AUTO'
      row.itemSpacing = 16
      row.fills = []
      parent.appendChild(row)
      const items = scr.rtl ? [...item.row].reverse() : item.row
      for (const sub of items) await place(sub, row)
      return
    }
    if (item.col) {
      const col = figma.createFrame()
      col.name = 'Col'
      col.layoutMode = 'VERTICAL'
      col.primaryAxisSizingMode = 'AUTO'
      col.counterAxisSizingMode = 'AUTO'
      col.itemSpacing = 12
      col.fills = []
      parent.appendChild(col)
      for (const sub of item.col) await place(sub, col) // vertical order never mirrors
      return
    }
    if ('heading' in item) {
      const t = figma.createText()
      const displayStyle = !item.style || item.style.startsWith('Display') || item.style.startsWith('Heading')
      t.fontName = ctx.fonts.resolve(displayStyle ? 'display' : 'body', displayStyle ? 'Bold' : 'Regular')
      setChars(t, item.heading, { screenKey: scr.key, role: 'Heading(' + (item.style || 'Heading/L') + ')', locale: scr.locale })
      parent.appendChild(t)
      const ramp = ctx.textStyleByName[item.style || 'Heading/L']
      if (ramp) { try { await t.setTextStyleIdAsync(ramp.id) } catch (_e) { /* ignore */ } }
      const fillStyle = ctx.paintByToken[item.style === 'Body/M' ? 'Color/Text/Secondary' : 'Color/Text/Primary']
      if (fillStyle) { try { await t.setFillStyleIdAsync(fillStyle.id) } catch (_e) { /* ignore */ } }
      t.textAutoResize = 'HEIGHT'
      try { t.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ }
      if (scr.rtl) { try { t.textAlignHorizontal = 'RIGHT' } catch (_e) { /* ignore */ } }
      return
    }
    // component instance
    const famKey = 'componentSet:' + item.family
    const set = live.componentSets[famKey]
    if (!set) { ctx.unresolved.push(scr.key + ' → ' + item.family + ' (run the Components stage first)'); return }
    const combo = { ...(item.variant || {}) }
    const specFam = ctx.familyByKey[famKey]
    if (specFam && specFam.dirAxis) combo.Direction = item.D
    const variant = findVariant(set, combo)
    if (!variant) { ctx.unresolved.push(scr.key + ' → ' + item.family + ' variant ' + JSON.stringify(combo) + ' not found'); return }
    let inst
    try { inst = variant.createInstance() } catch (_e) { return }
    parent.appendChild(inst)
    const props = item.props || {}
    const ids = textPropIdsOf(set)
    /** @type {Record<string, string>} */
    const setProps = {}
    for (const name of Object.keys(props)) {
      const v = props[name]
      const p = textProblem(v)
      if (p) throw charactersError(v, { screenKey: scr.key, role: item.family + '.' + name, locale: scr.locale })
      if (ids[name]) setProps[ids[name]] = v
    }
    if (Object.keys(setProps).length) { try { inst.setProperties(setProps) } catch (_e) { /* ignore */ } }
  }

  for (const item of scr.items) await place(item, frame)

  tag(frame, { assetKey: scr.key, kind: C.KIND.SCREEN, hash: scr.hash, runId: originRunId })
  live.screens[scr.key] = frame
  return frame
}

// ── layout helpers ───────────────────────────────────────────────────────────
function layoutSets(sets, section) {
  const COLS = 2, CW = 1700, CH = 900, PAD = 60
  sets.forEach((s, i) => { if (!s) return; try { s.x = section.x + PAD + (i % COLS) * CW; s.y = section.y + 80 + Math.floor(i / COLS) * CH } catch (_e) { /* ignore */ } })
}
function layoutDocs(nodes, section) {
  let y = 80
  for (const n of nodes) { if (!n) continue; try { n.x = section.x + 60; n.y = section.y + y; y += n.height + 80 } catch (_e) { /* ignore */ } }
}
function layoutScreens(nodes, section) {
  const byType = {}
  for (const n of nodes) { if (!n) continue; const t = n.getSharedPluginData ? n.getSharedPluginData(NS, K.ASSET_KEY).split(':')[1] : 'x'; (byType[t] = byType[t] || []).push(n) }
  const PAD = 80
  let rowY = 0
  for (const t of Object.keys(byType).sort()) {
    let x = 0
    let maxH = 0
    for (const n of byType[t]) {
      try { n.x = section.x + PAD + x; n.y = section.y + PAD + rowY; x += n.width + 100; maxH = Math.max(maxH, n.height) } catch (_e) { /* ignore */ }
    }
    rowY += maxH + 140
  }
}

// ── top-level operations ────────────────────────────────────────────────────
/**
 * @param {{ stage?: 'all'|'foundations'|'components'|'screens', dryRun?: boolean, _specForTest?: any }} [options]
 *   _specForTest is a TEST-ONLY hook (never set by the UI).
 */
async function run(options) {
  const stage = (options && options.stage) || 'all'
  const dryRun = !!(options && options.dryRun)
  const spec = (options && options._specForTest) || buildSpec()

  // FAIL-CLOSED PREFLIGHT — pure checks, before any mutation.
  const textValidation = validateScreenText(spec)
  const pagePlan = checkPagePlan()

  if (dryRun) {
    const wantKinds = stageKinds(stage)
    const opsForStage = wantKinds ? spec.assets.filter((a) => wantKinds.has(a.kind)) : spec.assets
    const plan = computePlan({ assets: opsForStage, counts: spec.counts }, {})
    return {
      ok: textValidation.ok && pagePlan.ok,
      mode: 'dry-run', stage,
      counts: spec.counts,
      plan,
      textValidation,
      pagePlan,
    }
  }

  if (!textValidation.ok) return { ok: false, mode: 'apply', stage, blocked: 'TEXT_VALIDATION_FAILED', issues: textValidation.issues, counts: spec.counts }
  if (!pagePlan.ok) return { ok: false, mode: 'apply', stage, blocked: 'PAGE_CAP_EXCEEDED', reason: pagePlan.blocked, counts: spec.counts }

  const runId = newRunId()
  const errors = []
  const unresolved = []

  try {
    // NOTE on ordering: page rename/create is the one mutation that happens
    // BEFORE the ambiguity gate below, because ambiguity can only be observed
    // by scanning the 3 managed pages' contents, and those pages must exist
    // first. This is deliberately narrow (idempotent, reversible, and cannot
    // itself create a duplicate managed marker) — every higher-risk mutation
    // (variables, styles, components, screens) still happens strictly after
    // the ambiguity check.
    const pagesByName = applyPagePlan(pagePlan)
    const live = await buildLiveIndex(pagesByName)
    const ambiguities = detectAmbiguity(live.observations)
    if (ambiguities.length) return { ok: false, mode: 'apply', stage, runId, blocked: 'AMBIGUOUS_OWNERSHIP', ambiguities, counts: spec.counts }

    const fullPlan = computePlan(spec, live.index)

    // sections (idempotent; cheap; always ensured)
    ensureSection(spec.sectionFoundations, live, pagesByName[C.PAGES.FOUNDATIONS], runId)
    ensureSection(spec.sectionComponents, live, pagesByName[C.PAGES.COMPONENTS], runId)
    ensureSection(spec.sectionScreens, live, pagesByName[C.PAGES.SCREENS], runId)

    // foundation styles — ALWAYS ensured first (cheap; every later stage depends on them).
    for (const col of spec.collections) upsertCollection(col, live, runId)
    for (const v of spec.variables) { try { upsertVariable(v, live, runId) } catch (e) { errors.push('variable ' + v.key + ': ' + e.message) } }
    const paintByToken = {}
    for (const p of spec.paintStyles) { try { const ps = upsertPaintStyle(p, live, runId); paintByToken[p.name] = ps } catch (e) { errors.push('paintStyle ' + p.key + ': ' + e.message) } }
    const fonts = await resolveFonts(spec.textStyles, FONTS)
    const textStyleByName = {}
    for (const t of spec.textStyles) { try { const ts = upsertTextStyle(t, live, fonts, runId); textStyleByName[t.name] = ts } catch (e) { errors.push('textStyle ' + t.key + ': ' + e.message) } }
    const effectByName = {}
    for (const e of spec.effectStyles) { try { const es = upsertEffectStyle(e, live, runId); effectByName[e.name] = es } catch (er) { errors.push('effectStyle ' + e.key + ': ' + er.message) } }

    const opByKey = {}
    for (const op of fullPlan.ops) opByKey[op.key] = op

    // ── Foundations doc specimens ──
    const docNodes = []
    if (stage === 'all' || stage === 'foundations') {
      const ctxDoc = { section: live.sections['section:foundations'], paintByToken, textStyleByName, effectByName, fonts, iconDefault: null }
      for (const d of spec.docs) {
        const op = opByKey[d.key]
        if (op && op.action === 'skip' && live.docs[d.key]) { docNodes.push(live.docs[d.key]); continue }
        try { docNodes.push(await upsertDoc(d, live, ctxDoc, runId)) } catch (e) { errors.push('doc ' + d.key + ': ' + e.message) }
      }
      layoutDocs(docNodes, live.sections['section:foundations'])
    }

    // ── Components ──
    const builtSets = []
    const fidelity = []
    if (stage === 'all' || stage === 'components') {
      // Icon FIRST — it is the INSTANCE_SWAP default target for every other
      // family's icon slots (PlayPauseIcon, LeadIcon, FavouriteButton Icon…).
      const famOrder = [...spec.families].sort((a, b) => (a.key === 'componentSet:icon' ? -1 : b.key === 'componentSet:icon' ? 1 : 0))
      const ctx = { section: live.sections['section:components'], paintByToken, textStyleByName, effectByName, fonts, runId, iconDefault: null }
      for (const fam of famOrder) {
        const op = opByKey[fam.key]
        if (op && op.action === 'skip' && live.componentSets[fam.key]) {
          builtSets.push(live.componentSets[fam.key])
          fidelity.push({ family: fam.name, fidelity: 'unchanged (skipped, id preserved)' })
        } else {
          try {
            const r = await upsertFamily(fam, live, ctx)
            builtSets.push(r.set)
            fidelity.push({ family: fam.name, fidelity: r.fidelity })
          } catch (e) { errors.push('family ' + fam.key + ': ' + e.message); builtSets.push(null) }
        }
        if (fam.key === 'componentSet:icon') {
          const iconSet = live.componentSets['componentSet:icon']
          ctx.iconDefault = findVariant(iconSet, { Mark: 'Dot' })
        }
      }
      layoutSets(builtSets, live.sections['section:components'])
    }

    // ── Screens ──
    const screenNodes = []
    if (stage === 'all' || stage === 'screens') {
      const familyByKey = {}
      for (const f of spec.families) familyByKey[f.key] = f
      const ctxScreen = { section: live.sections['section:screens'], fonts, paintByToken, textStyleByName, runId, familyByKey, unresolved }
      for (const scr of spec.screens) {
        const op = opByKey[scr.key]
        if (op && op.action === 'skip' && live.screens[scr.key]) { screenNodes.push(live.screens[scr.key]); continue }
        try { screenNodes.push(await upsertScreen(scr, live, ctxScreen)) } catch (e) { errors.push('screen ' + scr.key + ': ' + e.message) }
      }
      layoutScreens(screenNodes, live.sections['section:screens'])
    }

    await writeManifest(live, runId, spec, fullPlan, pagePlan)

    const wantKinds = stageKinds(stage)
    const stageOps = wantKinds ? fullPlan.ops.filter((o) => wantKinds.has(o.kind)) : fullPlan.ops
    const stageSummary = { create: 0, update: 0, skip: 0 }
    for (const o of stageOps) if (stageSummary[o.action] !== undefined) stageSummary[o.action]++

    return {
      ok: errors.length === 0,
      mode: 'apply', stage, runId,
      counts: spec.counts,
      pageActions: pagePlan.actions,
      applied: stageSummary,
      fontSubstitutions: fonts.substitutions,
      fidelity,
      unresolved,
      errors,
      recovery: 'If this Apply was interrupted, RERUN the same stage (or "All"): per-asset hashes converge (stale assets update, finished ones skip).',
    }
  } catch (e) {
    return { ok: false, mode: 'apply', stage, runId, error: e.message, errors, recovery: 'Rerun the stage to converge, or Rollback(runId) to remove assets first created by this run.' }
  }
}

async function verify() {
  const spec = buildSpec()
  const existingNames = figma.root.children.map((p) => p.name)
  /** @type {Record<string, any>} */
  const pagesByName = {}
  for (const name of C.PAGE_NAMES) pagesByName[name] = figma.root.children.find((p) => p.name === name) || null
  const live = await buildLiveIndex(pagesByName)
  const ambiguities = detectAmbiguity(live.observations)
  const present = []
  const missing = []
  const drifted = []
  for (const a of spec.assets) {
    const e = live.index[a.key]
    if (!e) { missing.push({ key: a.key, kind: a.kind, name: a.name }); continue }
    if (e.hash !== a.hash) drifted.push({ key: a.key, kind: a.kind, name: a.name, recorded: e.hash, expected: a.hash })
    else present.push(a.key)
  }
  return {
    ok: missing.length === 0 && drifted.length === 0 && ambiguities.length === 0,
    present: present.length,
    missing,
    drifted,
    ambiguities,
    pagesFound: C.PAGE_NAMES.filter((n) => !!pagesByName[n]).length,
    pagesExpected: C.PAGE_NAMES.length,
    existingPageNames: existingNames,
    total: spec.assets.length,
  }
}

/** @param {{ runId?: string|null }} [options] */
async function rollback(options) {
  const filterRun = options && options.runId ? options.runId : null
  const removed = { variables: 0, collections: 0, paintStyles: 0, textStyles: 0, effectStyles: 0, componentSets: 0, docs: 0, screens: 0, manifest: 0, sections: 0 }
  const errors = []
  const notes = []
  const inScope = (obj) => isManaged(obj) && (!filterRun || obj.getSharedPluginData(NS, K.RUN_ID) === filterRun)

  for (const page of figma.root.children) {
    for (const ch of [...page.children]) {
      if (ch.type !== 'SECTION') continue
      for (const sub of [...(/** @type {any} */ (ch).children || [])]) {
        if (!inScope(sub)) continue
        const kind = sub.getSharedPluginData(NS, K.ASSET_KIND)
        try {
          sub.remove()
          if (kind === C.KIND.MANIFEST) removed.manifest++
          else if (kind === C.KIND.DOC) removed.docs++
          else if (kind === C.KIND.SCREEN) removed.screens++
          else removed.componentSets++
        } catch (e) { errors.push(e.message) }
      }
    }
  }
  for (const ps of await figma.getLocalPaintStylesAsync()) if (inScope(ps)) { try { ps.remove(); removed.paintStyles++ } catch (e) { errors.push(e.message) } }
  for (const ts of await figma.getLocalTextStylesAsync()) if (inScope(ts)) { try { ts.remove(); removed.textStyles++ } catch (e) { errors.push(e.message) } }
  for (const es of await figma.getLocalEffectStylesAsync()) if (inScope(es)) { try { es.remove(); removed.effectStyles++ } catch (e) { errors.push(e.message) } }
  for (const v of await figma.variables.getLocalVariablesAsync()) if (inScope(v)) { try { v.remove(); removed.variables++ } catch (e) { errors.push(e.message) } }
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) if (inScope(c)) { try { c.remove(); removed.collections++ } catch (e) { errors.push(e.message) } }
  for (const page of figma.root.children) {
    for (const ch of [...page.children]) {
      if (ch.type === 'SECTION' && inScope(ch)) {
        const remaining = (/** @type {any} */ (ch).children || []).length
        if (remaining === 0) { try { ch.remove(); removed.sections++ } catch (e) { errors.push(e.message) } }
        else notes.push('section "' + ch.name + '" kept: ' + remaining + ' out-of-scope/user child(ren) remain')
      }
    }
  }
  notes.push('Pages themselves (01 Foundations / 02 Components / 03 Screens) are NEVER deleted or renamed back by rollback — only the managed content inside their sections. Renaming pages back is a manual, explicit owner action.')
  return { ok: errors.length === 0, scope: filterRun || 'all-managed', removed, notes, errors }
}

// ── manifest node (audit copy; live markers are the source of truth) ───────
const CHUNK = 60000
function writeChunked(node, base, str) {
  const n = Math.max(1, Math.ceil(str.length / CHUNK))
  node.setSharedPluginData(NS, base + ':count', String(n))
  for (let i = 0; i < n; i++) node.setSharedPluginData(NS, base + ':' + i, str.slice(i * CHUNK, (i + 1) * CHUNK))
}
function rebuildIndexFromLive(live) {
  /** @type {Record<string, {id:string, hash:string, kind:string}>} */
  const idx = {}
  const add = (obj) => { if (!obj) return; try { const t = readTag(obj); if (t.assetKey) idx[t.assetKey] = { id: obj.id, hash: t.hash, kind: t.kind } } catch (_e) { /* ignore */ } }
  const groups = [live.collections, live.variables, live.styles.paint, live.styles.text, live.styles.effect, live.docs, live.componentSets, live.screens]
  for (const g of groups) for (const k of Object.keys(g || {})) add(g[k])
  for (const k of Object.keys(live.sections || {})) add(live.sections[k])
  return idx
}
async function writeManifest(live, runId, spec, plan, pagePlan) {
  const section = live.sections['section:foundations']
  if (!section) return
  let node = section.children.find((n) => n.getSharedPluginData(NS, K.ASSET_KIND) === C.KIND.MANIFEST)
  if (!node) {
    node = figma.createFrame()
    node.name = C.MANIFEST_NODE_NAME
    node.resize(24, 24)
    node.visible = false
    section.appendChild(node)
  }
  const index = rebuildIndexFromLive(live)
  const payload = { pluginVersion: C.PLUGIN_VERSION, lastRunId: runId, counts: spec.counts, summary: plan.summary, pageActions: pagePlan.actions, index }
  writeChunked(node, 'manifest', JSON.stringify(payload))
  node.setSharedPluginData(NS, K.MANAGED, '1')
  node.setSharedPluginData(NS, K.ASSET_KIND, C.KIND.MANIFEST)
  node.setSharedPluginData(NS, K.ASSET_KEY, 'manifest:node')
  const priorRun = node.getSharedPluginData(NS, K.RUN_ID)
  node.setSharedPluginData(NS, K.RUN_ID, priorRun && priorRun.length ? priorRun : runId)
}

module.exports = { run, verify, rollback, buildLiveIndex, checkPagePlan }

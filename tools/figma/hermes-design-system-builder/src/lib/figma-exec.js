// @ts-check
'use strict'
/**
 * Figma executor — the ONLY module that touches the `figma` global. Implements
 * Dry Run, Apply, Verify and Rollback for the FINAL production-fidelity
 * revision: full component anatomy/states/properties, native reference
 * assemblies, fail-closed safety gates.
 *
 * Safety invariants:
 *  - Every created asset is tagged in the `hermesDSB` shared-plugin-data
 *    namespace (assetKey + kind + content hash + FIRST-creation runId).
 *  - Idempotency + rollback key off a LIVE marker scan; a rerun never
 *    duplicates; rollback removes ONLY plugin-created assets; the 34 unmanaged
 *    reference frames are never read-for-mutation and never deleted.
 *  - FAIL CLOSED before any mutation on (a) ambiguous ownership (duplicate
 *    assetKey markers) and (b) missing canonical fonts without an explicit,
 *    documented owner opt-in to fallback.
 *  - Interrupted Apply recovery = RERUN: per-asset hashes converge (documented
 *    transactional limitation: no snapshot restore of pre-update content).
 */

const C = require('./constants')
const { buildSpec } = require('./spec')
const { computePlan, detectAmbiguity } = require('./plan')
const { parseColor, FONTS, WEIGHT_ALIASES, assessFontAvailability } = require('./tokens')
const { TONE_TOKEN } = require('./components')
const { PRESETS, STATE_PRESETS } = require('./presets')
const { validateAssemblyText, textProblem, charactersError, pickAdoptable } = require('./validate')

/**
 * DEFENSIVE characters assignment. Never assigns unless the value is a real
 * string; never stringifies undefined/null; never substitutes placeholders —
 * throws a structured error carrying the full text context instead.
 * Empty strings are allowed ONLY when a blueprint explicitly declares them
 * (e.g. IconButton's hidden label) via opts.allowEmpty.
 * @param {any} node TEXT node
 * @param {unknown} value
 * @param {{assemblyKey?:string, role?:string, locale?:string}} ctxInfo
 * @param {{allowEmpty?:boolean}} [opts]
 */
function setChars(node, value, ctxInfo, opts) {
  const p = textProblem(value)
  if (p && !(opts && opts.allowEmpty && (p === 'empty string' || p === 'whitespace-only string'))) {
    throw charactersError(value, ctxInfo)
  }
  node.characters = /** @type {string} */ (value)
}

const NS = C.NAMESPACE
const K = C.KEYS

// ── shared-plugin-data tagging ─────────────────────────────────────────────
/**
 * Tag an asset as managed. RUN_ID records the run that FIRST created the asset
 * and is preserved across reruns/updates, so a runId-filtered rollback removes
 * exactly the assets that run created.
 * @param {any} obj @param {{assetKey:string, kind:string, hash:string, runId:string}} t
 */
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

// ── LIVE index (source of truth) + ambiguity observations ──────────────────
async function buildLiveIndex() {
  /** @type {Record<string, {id:string, hash:string, kind:string, runId:string}>} */
  const index = {}
  const paint = {}
  const text = {}
  const effect = {}
  const variables = {}
  const collections = {}
  const componentSets = {}
  const assemblies = {}
  /** @type {{assetKey:string, id:string, kind:string}[]} */
  const observations = []
  let section = null
  let section2 = null

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

  for (const child of figma.currentPage.children) {
    if (isManaged(child)) {
      const t = readTag(child)
      if (t.kind === C.KIND.SECTION) {
        observations.push({ assetKey: t.assetKey, id: child.id, kind: t.kind })
        index[t.assetKey] = { id: child.id, hash: t.hash, kind: t.kind, runId: t.runId }
        if (t.assetKey === 'section:assemblies') section2 = child
        else section = child
      } else {
        note(child, t.kind === C.KIND.COMPONENT_SET ? componentSets : t.kind === C.KIND.ASSEMBLY ? assemblies : null)
      }
    }
    if (child.type === 'SECTION') {
      for (const sub of /** @type {any} */ (child).children || []) {
        if (!isManaged(sub)) continue
        const t = readTag(sub)
        note(sub, t.kind === C.KIND.COMPONENT_SET ? componentSets : t.kind === C.KIND.ASSEMBLY ? assemblies : null)
      }
    }
  }
  return { index, observations, styles: { paint, text, effect }, variables, collections, componentSets, assemblies, section, section2 }
}

// ── font resolution (aliases → downgrade → fallback; gate is separate) ─────
async function resolveFonts(textStyleSpecs) {
  const available = await figma.listAvailableFontsAsync()
  const has = new Set(available.map((f) => f.fontName.family + ' ' + f.fontName.style))
  const substitutions = []
  const aliases = []
  /** @type {Record<string, {family:string, style:string}>} */
  const cache = {}

  /** @param {string} family @param {string} weight */
  const tryLoad = async (family, weight) => {
    for (const style of WEIGHT_ALIASES[weight] || [weight]) {
      if (!has.has(family + ' ' + style)) continue
      try { await figma.loadFontAsync({ family, style }); return style } catch (_e) { /* next alias */ }
    }
    return null
  }

  for (const t of textStyleSpecs) {
    const desired = FONTS[t.font]
    const key = t.font + '|' + t.weight
    if (cache[key]) continue
    let style = await tryLoad(desired.family, t.weight)
    if (style) {
      if (style !== t.weight) aliases.push(desired.family + ' ' + t.weight + ' ≈ ' + desired.family + ' ' + style)
      cache[key] = { family: desired.family, style }
      continue
    }
    if (t.weight !== 'Regular') {
      const reg = await tryLoad(desired.family, 'Regular')
      if (reg) { substitutions.push(desired.family + ' ' + t.weight + ' → ' + desired.family + ' ' + reg); cache[key] = { family: desired.family, style: reg }; continue }
    }
    const fb = desired.fallback
    let fbStyle = (await tryLoad(fb, t.weight)) || (await tryLoad(fb, 'Regular'))
    if (!fbStyle) { fbStyle = 'Regular'; try { await figma.loadFontAsync({ family: fb, style: 'Regular' }) } catch (_e) { /* Inter preloaded */ } }
    substitutions.push(desired.family + ' ' + t.weight + ' → ' + fb + ' ' + fbStyle)
    cache[key] = { family: fb, style: fbStyle }
  }
  return {
    resolve: (role, weight) => cache[role + '|' + weight] || cache[role + '|Regular'] || { family: 'Inter', style: 'Regular' },
    substitutions,
    aliases,
    availableSet: has,
  }
}

// ── paint helper ───────────────────────────────────────────────────────────
/** @param {string} value */
function solidPaint(value) {
  const c = parseColor(value)
  const p = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b } }
  if (c.a < 1) /** @type {any} */ (p).opacity = c.a
  return p
}

// ── foundation upserts (unchanged semantics from rev1) ─────────────────────
function upsertCollection(specEntry, live, meta) {
  let col = live.collections[specEntry.key]
  if (!col) { col = figma.variables.createVariableCollection(specEntry.name); live.collections[specEntry.key] = col }
  else if (col.name !== specEntry.name) col.name = specEntry.name
  try { if (col.modes[0] && col.modes[0].name !== specEntry.modeName) col.renameMode(col.defaultModeId, specEntry.modeName) } catch (_e) { /* best-effort */ }
  tag(col, { assetKey: specEntry.key, kind: C.KIND.COLLECTION, hash: specEntry.hash, runId: meta.runId })
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
  es.effects = [{ type: 'DROP_SHADOW', color: { r: e.color[0], g: e.color[1], b: e.color[2], a: e.color[3] }, offset: { x: e.offset.x, y: e.offset.y }, radius: e.radius, spread: e.spread, visible: true, blendMode: 'NORMAL' }]
  tag(es, { assetKey: e.key, kind: C.KIND.EFFECT_STYLE, hash: e.hash, runId })
  return es
}

// ── sections ───────────────────────────────────────────────────────────────
/** @param {any} sectionSpec @param {any} live @param {'section'|'section2'} slot @param {string} runId @param {{x:number,y:number,w:number,h:number}} box */
function ensureSectionSlot(sectionSpec, live, slot, runId, box) {
  let section = live[slot]
  if (!section) {
    const sec = /** @type {any} */ (figma.createSection())
    let maxX = 0
    for (const ch of figma.currentPage.children) maxX = Math.max(maxX, ch.x + ch.width)
    sec.x = box.x ?? maxX + 400
    sec.y = box.y
    try { sec.resizeWithoutConstraints(box.w, box.h) } catch (_e) { try { sec.resize(box.w, box.h) } catch (_e2) { /* ignore */ } }
    section = sec
    live[slot] = sec
  }
  section.name = sectionSpec.name
  tag(section, { assetKey: sectionSpec.key, kind: C.KIND.SECTION, hash: sectionSpec.hash, runId })
  return section
}

// ── blueprint renderer ─────────────────────────────────────────────────────
/**
 * Render a NodeSpec tree into Figma nodes. Returns { node, roles } where roles
 * maps role → created node (for overrides + property bindings).
 * @param {any} spec @param {any} ctx { fonts, paintByToken, iconDefault }
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
      // blueprints may declare a deliberately-empty label (IconButton); anything
      // undefined/null/non-string still fails closed with full context.
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
      if (ctx.iconDefault) {
        try { node = ctx.iconDefault.createInstance() } catch (_e) { node = null }
      }
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

    // paints via bound styles (fall back to raw token value)
    const styleFor = (tok) => (tok ? ctx.paintByToken[tok] : null)
    if (s.fill !== undefined && s.type !== 'iconSlot') {
      if (s.fill === null) node.fills = []
      else {
        const st = styleFor(s.fill)
        if (st) { try { await node.setFillStyleIdAsync(st.id) } catch (_e) { /* ignore */ } }
      }
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
    if (s.hidden) node.visible = false

    for (const c of s.children || []) await build(c, node)

    // sizing AFTER children/parenting (FILL requires an auto-layout parent)
    if (parent && s.grow === 'fill') { try { node.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ } }
    if (s.minH != null) { try { node.minHeight = s.minH } catch (_e) { /* ignore */ } }
    if (s.minW != null) { try { node.minWidth = s.minW } catch (_e) { /* ignore */ } }
    if (s.type === 'frame' && (s.w != null || s.h != null)) {
      // explicit dimensions on a frame: pin the sized axis to FIXED, then resize both.
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

/**
 * Apply one override list ({role, set:{...}}) to rendered roles.
 * @param {Record<string, any>} roles @param {any[]} overrides @param {any} ctx
 */
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

/** Mirror a rendered tree for RTL: reverse every horizontal frame's children + right-align text. @param {any} node */
function mirrorRtl(node) {
  if (node.type === 'FRAME' || node.type === 'COMPONENT') {
    if (node.layoutMode === 'HORIZONTAL') {
      const kids = [...node.children]
      for (let i = kids.length - 1; i >= 0; i--) node.appendChild(kids[i])
    }
  }
  if (node.type === 'TEXT') { try { node.textAlignHorizontal = 'RIGHT' } catch (_e) { /* ignore */ } }
  for (const c of node.children || []) mirrorRtl(c)
}

/** presetOpts derived from a variant combo (size/shape/mark/density/collapse axes). @param {any} fam @param {Record<string,string>} combo */
function presetOptsFor(fam, combo) {
  const o = { ...(fam.presetOpts || {}) }
  if (fam.sizeAxis && combo.Size) o.size = combo.Size
  if (fam.shapeAxis && combo.Shape) o.shape = combo.Shape
  if (fam.markAxis && combo.Mark) o.mark = combo.Mark
  if (fam.densityAxis && combo.Density) o.compact = combo.Density === 'Compact'
  if (fam.collapseAxis && combo.State) o.collapsed = combo.State === 'Collapsed'
  return o
}

/** Default tone override for an axis value (StateDot/dot accents). @param {string} value */
function toneOverridesFor(value) {
  const tok = TONE_TOKEN[value]
  if (!tok) return []
  return [{ role: 'StateDot', set: { fill: tok } }, { role: 'RowDot1', set: { fill: tok } }]
}

// ── family builder (FINAL fidelity) ────────────────────────────────────────
const { variantCombos } = require('./components')

/**
 * @param {any} fam spec family (blueprint contract)
 * @param {any} live
 * @param {any} ctx { section, paintByToken, textStyleByName, effectByName, fonts, runId, iconDefault }
 */
async function upsertFamily(fam, live, ctx) {
  // Preserve ORIGIN run across rebuilds (rollback isolation across revisions).
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

    // root paints
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

    // per-axis overrides: family valueOverrides > STATE presets > tone defaults
    for (const axisProp of Object.keys(combo)) {
      const value = combo[axisProp]
      if (axisProp === 'Direction') continue
      const famOv = fam.valueOverrides && fam.valueOverrides[axisProp] && fam.valueOverrides[axisProp][value]
      if (famOv) await applyOverrides(roles, famOv, ctx)
      else if (axisProp === 'State') await applyOverrides(roles, STATE_PRESETS[value] || [], ctx)
      else await applyOverrides(roles, toneOverridesFor(value), ctx)
      // State presets ALSO apply under family override presence for base semantics
      if (famOv && axisProp === 'State' && STATE_PRESETS[value] && STATE_PRESETS[value].length) {
        await applyOverrides(roles, STATE_PRESETS[value].filter((o2) => !famOv.some((f2) => f2.role === o2.role)), ctx)
      }
    }
    // Card-style elevation axis binds the matching effect style
    if (fam.elevationAxis && combo.Elevation && ctx.effectByName['Elevation/' + combo.Elevation]) {
      try { await comp.setEffectStyleIdAsync(ctx.effectByName['Elevation/' + combo.Elevation].id) } catch (_e) { /* ignore */ }
    }
    if (fam.elevation && ctx.effectByName[fam.elevation]) {
      try { await comp.setEffectStyleIdAsync(ctx.effectByName[fam.elevation].id) } catch (_e) { /* ignore */ }
    }
    if (combo.Direction === 'RTL') mirrorRtl(comp)

    variantComponents.push(comp)
    rendered.push({ comp, roles, combo })
  }

  // Combine into a set (single-combo families keep the lone component)
  let set
  if (variantComponents.length > 1) {
    try {
      set = figma.combineAsVariants(variantComponents, ctx.section)
    } catch (_e) {
      for (let i = 1; i < variantComponents.length; i++) { try { variantComponents[i].remove() } catch (_e2) { /* ignore */ } }
      set = variantComponents[0]
    }
  } else {
    set = variantComponents[0]
  }
  set.name = fam.name
  set.description = fam.description + (fam.maps ? '\nMaps to ' + fam.maps : '') + '\nA11y: ' + fam.a11y
  try { /** @type {any} */ (set).annotations = [{ label: fam.a11y }] } catch (_e) { /* best-effort */ }
  try {
    set.layoutMode = 'HORIZONTAL'
    set.itemSpacing = 24
    ;/** @type {any} */ (set).layoutWrap = 'WRAP'
    set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 24
    ;/** @type {any} */ (set).maxWidth = 1600
  } catch (_e) { /* lone component */ }

  // Component properties bound to layers
  /** @type {Record<string, string>} propName → full property id */
  const propIds = {}
  let propsAdded = 0
  const canProps = typeof set.addComponentProperty === 'function'
  if (canProps) {
    for (const tp of fam.text || []) {
      try { propIds[tp.name] = set.addComponentProperty(tp.name, 'TEXT', ''); propsAdded++ } catch (_e) { /* ignore */ }
    }
    for (const bp of fam.bools || []) {
      // default mirrors the base blueprint's layer visibility (a Hint hidden by
      // default gets default=false), keeping property defaults honest.
      const baseLayer = rendered[0] && rendered[0].roles[bp.role]
      const def = baseLayer ? baseLayer.visible !== false : true
      try { propIds[bp.name] = set.addComponentProperty(bp.name, 'BOOLEAN', def); propsAdded++ } catch (_e) { /* ignore */ }
    }
    for (const sp of fam.swaps || []) {
      if (!ctx.iconDefault) continue
      try { propIds[sp.name] = set.addComponentProperty(sp.name, 'INSTANCE_SWAP', ctx.iconDefault.id); propsAdded++ } catch (_e) { /* ignore */ }
    }
    // bind refs on every variant's layers
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

// ── variant lookup + assemblies ────────────────────────────────────────────
/** Find the component inside a set matching a combo. @param {any} set @param {Record<string,string>} combo */
function findVariant(set, combo) {
  if (!set) return null
  if (set.type === 'COMPONENT') return set
  const want = Object.keys(combo).map((k) => k + '=' + combo[k]).join(', ')
  const kids = (set.children || []).filter((c) => c.type === 'COMPONENT')
  // exact name match first, then subset match (every requested pair present)
  let hit = kids.find((c) => c.name === want)
  if (hit) return hit
  const pairs = Object.keys(combo).map((k) => k + '=' + combo[k])
  hit = kids.find((c) => pairs.every((p2) => c.name.includes(p2)))
  return hit || kids[0] || null
}

/** Full text-property id map of a set (for skipped families). @param {any} set */
function textPropIdsOf(set) {
  /** @type {Record<string, string>} */
  const out = {}
  try {
    const defs = set.componentPropertyDefinitions || {}
    for (const full of Object.keys(defs)) {
      const base = full.split('#')[0]
      out[base] = full
    }
  } catch (_e) { /* ignore */ }
  return out
}

/**
 * Build one native reference assembly from component instances.
 * @param {any} asm spec assembly
 * @param {any} live
 * @param {any} ctx { section2, fonts, paintByToken, textStyleByName, runId }
 * @returns {Promise<{ node:any, instances:{family:string, componentId:string}[], adopted:boolean }>}
 */
async function upsertAssembly(asm, live, ctx) {
  const existing = live.assemblies[asm.key]
  let originRunId = ctx.runId
  let frame = null
  let adopted = false
  if (existing) {
    try { const prior = existing.getSharedPluginData(NS, K.RUN_ID); if (prior && prior.length) originRunId = prior } catch (_e) { /* ignore */ }
    try { existing.remove() } catch (_e) { /* ignore */ }
    delete live.assemblies[asm.key]
  } else {
    // ORPHAN ADOPTION (repairs the run-ms7vkx9n-1 partial state IN PLACE):
    // that run's set_characters failure threw BEFORE tag(), leaving exactly-
    // named, unmanaged partial frames inside the managed section. Adopt the
    // single exact-name unmanaged FRAME child, clear its partial content and
    // rebuild into the SAME node (id preserved). Two matches = fail closed.
    const children = (/** @type {any} */ (ctx.section2).children || []).map((c) => ({ id: c.id, name: c.name, type: c.type, managed: isManaged(c), node: c }))
    const pick = pickAdoptable(children, asm.name)
    if (pick.ambiguous.length) throw new Error('adoption ambiguity for ' + asm.key + ': multiple unmanaged frames named "' + asm.name + '" [' + pick.ambiguous.join(', ') + '] — resolve manually before Apply')
    if (pick.id) {
      const hit = children.find((c) => c.id === pick.id)
      frame = hit && hit.node
      if (frame) {
        adopted = true
        for (const ch of [...(frame.children || [])]) { try { ch.remove() } catch (_e) { /* ignore */ } }
      }
    }
  }

  if (!frame) frame = figma.createFrame()
  frame.name = asm.name
  frame.layoutMode = 'VERTICAL'
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'FIXED'
  frame.itemSpacing = 24
  frame.paddingLeft = frame.paddingRight = asm.context === 'mobile' ? 16 : 48
  frame.paddingTop = frame.paddingBottom = asm.context === 'mobile' ? 24 : 48
  frame.resize(asm.width, 100)
  const bg = ctx.paintByToken['Color/Background/Base']
  if (bg) { try { await frame.setFillStyleIdAsync(bg.id) } catch (_e) { /* ignore */ } }
  ctx.section2.appendChild(frame)

  /** @type {{family:string, componentId:string}[]} */
  const instancesUsed = []

  /** @param {any} item @param {any} parent */
  const place = async (item, parent) => {
    if ('heading' in item) {
      // item.heading is a PRE-LOCALIZED string (locale-strings.js). The
      // run-ms7vkx9n-1 defect read `.fa/.en` off this string → undefined →
      // Figma rejected set_characters. Assign the string itself, defensively.
      const t = figma.createText()
      const displayStyle = !item.style || item.style.startsWith('Display') || item.style.startsWith('Heading')
      t.fontName = ctx.fonts.resolve(displayStyle ? 'display' : 'body', displayStyle ? 'Bold' : 'Regular')
      setChars(t, item.heading, { assemblyKey: asm.key, role: 'Heading(' + (item.style || 'Heading/L') + ')', locale: asm.locale })
      parent.appendChild(t)
      const ramp = ctx.textStyleByName[item.style || 'Heading/L']
      if (ramp) { try { await t.setTextStyleIdAsync(ramp.id) } catch (_e) { /* ignore */ } }
      const fillStyle = ctx.paintByToken[item.style === 'Body/M' ? 'Color/Text/Secondary' : 'Color/Text/Primary']
      if (fillStyle) { try { await t.setFillStyleIdAsync(fillStyle.id) } catch (_e) { /* ignore */ } }
      t.textAutoResize = 'HEIGHT'
      try { t.layoutSizingHorizontal = 'FILL' } catch (_e) { /* ignore */ }
      if (asm.rtl) { try { t.textAlignHorizontal = 'RIGHT' } catch (_e) { /* ignore */ } }
      return
    }
    if (item.row) {
      const row = figma.createFrame()
      row.name = 'Row'
      row.layoutMode = 'HORIZONTAL'
      row.primaryAxisSizingMode = 'AUTO'
      row.counterAxisSizingMode = 'AUTO'
      row.itemSpacing = 16
      row.fills = []
      parent.appendChild(row)
      const items = asm.rtl ? [...item.row].reverse() : item.row
      for (const sub of items) await place(sub, row)
      return
    }
    // component instance
    const famKey = 'componentSet:' + item.family
    const set = live.componentSets[famKey]
    if (!set) return
    const combo = { ...(item.variant || {}) }
    // Direction axis participation
    const specFam = ctx.familyByKey[famKey]
    if (specFam && specFam.dirAxis) combo.Direction = asm.rtl ? 'RTL' : 'LTR'
    const variant = findVariant(set, combo)
    if (!variant) return
    let inst
    try { inst = variant.createInstance() } catch (_e) { return }
    parent.appendChild(inst)
    instancesUsed.push({ family: item.family, componentId: variant.id })
    // text props — same defensive contract as characters (no undefined/null/empty)
    const props = item.props || {}
    const ids = textPropIdsOf(set)
    /** @type {Record<string, string>} */
    const setProps = {}
    for (const name of Object.keys(props)) {
      const v = props[name]
      const p = textProblem(v)
      if (p) throw charactersError(v, { assemblyKey: asm.key, role: item.family + '.' + name, locale: asm.locale })
      if (ids[name]) setProps[ids[name]] = /** @type {string} */ (v)
    }
    if (Object.keys(setProps).length) { try { inst.setProperties(setProps) } catch (_e) { /* ignore */ } }
  }

  for (const item of asm.items) await place(item, frame)

  tag(frame, { assetKey: asm.key, kind: C.KIND.ASSEMBLY, hash: asm.hash, runId: originRunId })
  // DE assemblies have no original Figma reference — mark them as generated.
  frame.setSharedPluginData(NS, 'originalRef', asm.originalRef || '')
  frame.setSharedPluginData(NS, 'newlyGenerated', asm.newlyGenerated ? '1' : '')
  live.assemblies[asm.key] = frame
  return { node: frame, instances: instancesUsed, adopted }
}

// ── layout inside sections ─────────────────────────────────────────────────
function layoutSets(sets, section) {
  const COLS = 2
  const CW = 1700
  const CH = 900
  const PAD = 60
  sets.forEach((s, i) => {
    if (!s) return
    try { s.x = section.x + PAD + (i % COLS) * CW; s.y = section.y + 80 + Math.floor(i / COLS) * CH } catch (_e) { /* ignore */ }
  })
}
function layoutAssemblies(nodes, section) {
  const PAD = 60
  let yDesk = 80
  let yMob = 80
  for (const n of nodes) {
    if (!n) continue
    try {
      if (n.width > 800) { n.x = section.x + PAD; n.y = section.y + yDesk; yDesk += n.height + 120 }
      else { n.x = section.x + PAD + 1360; n.y = section.y + yMob; yMob += n.height + 120 }
    } catch (_e) { /* ignore */ }
  }
  try { /** @type {any} */ (section).resizeWithoutConstraints(1900, Math.max(yDesk, yMob) + 120) } catch (_e) { /* ignore */ }
}

// ── top-level operations ───────────────────────────────────────────────────
/**
 * @param {{ dryRun?: boolean, allowFontFallback?: boolean, _specForTest?: any }} [options]
 *   _specForTest is a TEST-ONLY hook (never set by the UI): it lets the test
 *   suite inject a corrupted spec and prove the fail-closed gates fire before
 *   any mutation. Production paths always build the real spec.
 */
async function run(options) {
  const dryRun = !!(options && options.dryRun)
  const allowFontFallback = !!(options && options.allowFontFallback)
  const spec = (options && options._specForTest) || buildSpec()
  // FAIL-CLOSED TEXT PREFLIGHT — validate every string that will reach
  // TextNode.characters / instance text props BEFORE touching the file or
  // generating a runId (added after run-ms7vkx9n-1).
  const textValidation = validateAssemblyText(spec)
  const live = await buildLiveIndex()
  const plan = computePlan(spec, live.index)
  const ambiguities = detectAmbiguity(live.observations)

  // font gate assessment (read-only)
  const availableFonts = await figma.listAvailableFontsAsync()
  const availableSet = new Set(availableFonts.map((f) => f.fontName.family + ' ' + f.fontName.style))
  const fontGate = assessFontAvailability(availableSet)

  if (dryRun) {
    return {
      ok: ambiguities.length === 0 && textValidation.ok,
      mode: 'dry-run',
      counts: spec.counts,
      plan,
      ambiguities,
      textValidation,
      fontGate: { canonicalPresent: fontGate.canonicalPresent, missing: fontGate.missing, wouldBlockApply: !fontGate.canonicalPresent && !allowFontFallback },
      manifestPresent: !!live.section,
    }
  }

  // FAIL CLOSED — no mutation (and no runId) on invalid text, ambiguity or
  // missing canonical fonts.
  if (!textValidation.ok) {
    return { ok: false, mode: 'apply', blocked: 'TEXT_VALIDATION_FAILED', issues: textValidation.issues, counts: spec.counts }
  }
  if (ambiguities.length) {
    return { ok: false, mode: 'apply', blocked: 'AMBIGUOUS_OWNERSHIP', ambiguities, counts: spec.counts }
  }
  if (!fontGate.canonicalPresent && !allowFontFallback) {
    return {
      ok: false, mode: 'apply', blocked: 'FONTS_MISSING',
      missingFonts: fontGate.missing,
      guidance: 'Install the canonical desktop fonts (see docs/design/phase-87-closure/font-installation-manifest.md) or explicitly enable the documented fallback.',
      counts: spec.counts,
    }
  }

  const runId = newRunId()
  const errors = []
  const fonts = await resolveFonts(spec.textStyles)
  const opByKey = {}
  for (const op of plan.ops) opByKey[op.key] = op

  try {
    // sections
    ensureSectionSlot(spec.section, live, 'section', runId, { x: undefined, y: 0, w: 3600, h: 12000 })
    // foundation
    for (const col of spec.collections) upsertCollection(col, live, { runId })
    for (const v of spec.variables) { try { upsertVariable(v, live, runId) } catch (e) { errors.push('variable ' + v.key + ': ' + e.message) } }
    const paintByToken = {}
    for (const p of spec.paintStyles) { try { const ps = upsertPaintStyle(p, live, runId); paintByToken[p.name] = ps } catch (e) { errors.push('paintStyle ' + p.key + ': ' + e.message) } }
    const textStyleByName = {}
    for (const t of spec.textStyles) { try { const ts = upsertTextStyle(t, live, fonts, runId); textStyleByName[t.name] = ts } catch (e) { errors.push('textStyle ' + t.key + ': ' + e.message) } }
    const effectByName = {}
    for (const e of spec.effectStyles) { try { const es = upsertEffectStyle(e, live, runId); effectByName[e.name] = es } catch (er) { errors.push('effectStyle ' + e.key + ': ' + er.message) } }

    // families — Icon FIRST (instance-swap default target), then the rest.
    const famOrder = [...spec.families].sort((a, b) => (a.key === 'componentSet:icon' ? -1 : b.key === 'componentSet:icon' ? 1 : 0))
    const ctx = { section: live.section, paintByToken, textStyleByName, effectByName, fonts, runId, iconDefault: null, familyByKey: {} }
    for (const f of spec.families) ctx.familyByKey[f.key] = f
    const builtSets = []
    const fidelity = []
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
    layoutSets(builtSets, live.section)

    // assemblies — second managed section, instances only.
    ensureSectionSlot(spec.section2, live, 'section2', runId, { x: (live.section ? live.section.x + 3800 : undefined), y: 0, w: 1900, h: 12000 })
    const ctx2 = { section2: live.section2, fonts, paintByToken, textStyleByName, runId, familyByKey: ctx.familyByKey }
    const asmNodes = []
    /** @type {any[]} */
    const mapping = []
    for (const asm of spec.assemblies) {
      const op = opByKey[asm.key]
      if (op && op.action === 'skip' && live.assemblies[asm.key]) { asmNodes.push(live.assemblies[asm.key]); continue }
      try {
        const r = await upsertAssembly(asm, live, ctx2)
        asmNodes.push(r.node)
        mapping.push({ originalRef: asm.originalRef, assembly: asm.key, nodeId: r.node.id, adopted: !!r.adopted, instances: r.instances })
      } catch (e) { errors.push('assembly ' + asm.key + ': ' + e.message); asmNodes.push(null) }
    }
    layoutAssemblies(asmNodes, live.section2)

    await writeManifest(live, runId, spec, plan, mapping)

    return {
      ok: errors.length === 0,
      mode: 'apply',
      runId,
      counts: spec.counts,
      plan,
      applied: { create: plan.summary.create, update: plan.summary.update, skip: plan.summary.skip },
      fontSubstitutions: fonts.substitutions,
      fontAliases: fonts.aliases,
      fontFallbackExplicitlyAllowed: allowFontFallback && !fontGate.canonicalPresent,
      assemblies: mapping,
      fidelity,
      errors,
      recovery: 'If this Apply was interrupted, RERUN Apply: per-asset hashes converge (stale assets update, finished ones skip).',
    }
  } catch (e) {
    return { ok: false, mode: 'apply', runId, error: e.message, errors, recovery: 'Rerun Apply to converge, or Rollback(runId) to remove assets first created by this run.' }
  }
}

async function verify() {
  const spec = buildSpec()
  const live = await buildLiveIndex()
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
  let referenceFrames = 0
  for (const ch of figma.currentPage.children) if (!isManaged(ch)) referenceFrames++
  return {
    ok: missing.length === 0 && drifted.length === 0 && ambiguities.length === 0,
    present: present.length,
    missing,
    drifted,
    ambiguities,
    referenceFramesPreserved: referenceFrames,
    total: spec.assets.length,
  }
}

/** @param {{ runId?: string|null }} [options] */
async function rollback(options) {
  const filterRun = options && options.runId ? options.runId : null
  const removed = { variables: 0, collections: 0, paintStyles: 0, textStyles: 0, effectStyles: 0, componentSets: 0, assemblies: 0, manifest: 0, sections: 0 }
  const errors = []
  const notes = []

  const inScope = (obj) => isManaged(obj) && (!filterRun || obj.getSharedPluginData(NS, K.RUN_ID) === filterRun)

  for (const ch of [...figma.currentPage.children]) {
    if (ch.type === 'SECTION') {
      for (const sub of [...(/** @type {any} */ (ch).children || [])]) {
        if (!inScope(sub)) continue
        const kind = sub.getSharedPluginData(NS, K.ASSET_KIND)
        try {
          sub.remove()
          if (kind === C.KIND.MANIFEST) removed.manifest++
          else if (kind === C.KIND.ASSEMBLY) removed.assemblies++
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
  // sections last — ONLY when empty (cascade can never delete out-of-scope/user nodes)
  for (const ch of [...figma.currentPage.children]) {
    if (ch.type === 'SECTION' && inScope(ch)) {
      const remaining = (/** @type {any} */ (ch).children || []).length
      if (remaining === 0) { try { ch.remove(); removed.sections++ } catch (e) { errors.push(e.message) } }
      else notes.push('section "' + ch.name + '" kept: ' + remaining + ' out-of-scope/user child(ren) remain')
    }
  }
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
  const add = (obj) => {
    if (!obj) return
    try { const t = readTag(obj); if (t.assetKey) idx[t.assetKey] = { id: obj.id, hash: t.hash, kind: t.kind } } catch (_e) { /* ignore */ }
  }
  const groups = [live.collections, live.variables, live.styles.paint, live.styles.text, live.styles.effect, live.componentSets, live.assemblies]
  for (const g of groups) for (const k of Object.keys(g || {})) add(g[k])
  add(live.section)
  add(live.section2)
  return idx
}

async function writeManifest(live, runId, spec, plan, mapping) {
  const section = live.section
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
  const payload = { pluginVersion: C.PLUGIN_VERSION, lastRunId: runId, counts: spec.counts, summary: plan.summary, index, referenceMapping: mapping || [] }
  writeChunked(node, 'manifest', JSON.stringify(payload))
  node.setSharedPluginData(NS, K.MANAGED, '1')
  node.setSharedPluginData(NS, K.ASSET_KIND, C.KIND.MANIFEST)
  node.setSharedPluginData(NS, K.ASSET_KEY, 'manifest:node')
  const priorRun = node.getSharedPluginData(NS, K.RUN_ID)
  node.setSharedPluginData(NS, K.RUN_ID, priorRun && priorRun.length ? priorRun : runId)
}

module.exports = { run, verify, rollback, buildLiveIndex }

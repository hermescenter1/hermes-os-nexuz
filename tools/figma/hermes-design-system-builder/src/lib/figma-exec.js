// @ts-check
'use strict'
/**
 * Figma executor — the ONLY part that touches the `figma` global. Runs inside
 * Figma Desktop. Implements Dry Run, Apply, Verify and Rollback on top of the
 * pure spec/plan.
 *
 * Safety invariants:
 *  - Every asset it creates is tagged in the `hermesDSB` shared-plugin-data
 *    namespace with a stable assetKey + content hash + runId.
 *  - Idempotency + rollback key off those markers (a LIVE scan of the file is
 *    the source of truth), so a rerun never duplicates and rollback removes
 *    ONLY plugin-created assets — the 34 reference frames (unmarked) are never
 *    read for mutation and never deleted.
 *  - Components are isolated inside one managed Section, away from (0,0).
 */

const C = require('./constants')
const { buildSpec } = require('./spec')
const { computePlan } = require('./plan')
const { parseColor, FONTS } = require('./tokens')
const { TONE_TOKEN } = require('./components')

const NS = C.NAMESPACE
const K = C.KEYS

// ── shared-plugin-data tagging ─────────────────────────────────────────────
/**
 * Tag an asset as managed. RUN_ID records the run that FIRST created the asset
 * and is preserved across reruns/updates, so a runId-filtered rollback removes
 * exactly the assets that run created (not ones a later run merely re-touched).
 * @param {any} obj node/style/variable/collection
 * @param {{assetKey:string, kind:string, hash:string, runId:string}} t
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
/** @param {any} obj @returns {boolean} */
function isManaged(obj) {
  try { return obj.getSharedPluginData(NS, K.MANAGED) === '1' } catch (_e) { return false }
}
/** @param {any} obj @returns {{assetKey:string, kind:string, hash:string, runId:string}} */
function readTag(obj) {
  return {
    assetKey: obj.getSharedPluginData(NS, K.ASSET_KEY),
    kind: obj.getSharedPluginData(NS, K.ASSET_KIND),
    hash: obj.getSharedPluginData(NS, K.CONTENT_HASH),
    runId: obj.getSharedPluginData(NS, K.RUN_ID),
  }
}

// ── run id (deterministic identity does NOT depend on this) ────────────────
let _runSeq = 0
/** @returns {string} */
function newRunId() {
  _runSeq += 1
  // Date is available in a real plugin (unlike use_figma). Only used for grouping.
  return 'run-' + Date.now().toString(36) + '-' + _runSeq
}

// ── LIVE index: scan the file for our markers (source of truth) ────────────
/**
 * @returns {Promise<{ index: Record<string, {id:string, hash:string, kind:string}>,
 *   styles: {paint: Record<string,any>, text: Record<string,any>, effect: Record<string,any>},
 *   variables: Record<string, any>, collections: Record<string, any>,
 *   section: any|null, componentSets: Record<string, any> }>}
 */
async function buildLiveIndex() {
  /** @type {Record<string, {id:string, hash:string, kind:string}>} */
  const index = {}
  const paint = {}
  const text = {}
  const effect = {}
  const variables = {}
  const collections = {}
  const componentSets = {}
  let section = null

  const cols = await figma.variables.getLocalVariableCollectionsAsync()
  for (const c of cols) if (isManaged(c)) { const t = readTag(c); index[t.assetKey] = { id: c.id, hash: t.hash, kind: t.kind }; collections[t.assetKey] = c }

  const vars = await figma.variables.getLocalVariablesAsync()
  for (const v of vars) if (isManaged(v)) { const t = readTag(v); index[t.assetKey] = { id: v.id, hash: t.hash, kind: t.kind }; variables[t.assetKey] = v }

  for (const ps of await figma.getLocalPaintStylesAsync()) if (isManaged(ps)) { const t = readTag(ps); index[t.assetKey] = { id: ps.id, hash: t.hash, kind: t.kind }; paint[t.assetKey] = ps }
  for (const ts of await figma.getLocalTextStylesAsync()) if (isManaged(ts)) { const t = readTag(ts); index[t.assetKey] = { id: ts.id, hash: t.hash, kind: t.kind }; text[t.assetKey] = ts }
  for (const es of await figma.getLocalEffectStylesAsync()) if (isManaged(es)) { const t = readTag(es); index[t.assetKey] = { id: es.id, hash: t.hash, kind: t.kind }; effect[t.assetKey] = es }

  // The manifest node and any unkeyed managed node are intentionally NOT indexed
  // (they are bookkeeping, not plannable assets — otherwise they'd be flagged as
  // perpetual prune candidates and break the all-SKIP-on-rerun invariant).
  /** @param {any} node */
  const indexManaged = (node) => {
    const t = readTag(node)
    if (t.kind === C.KIND.MANIFEST || !t.assetKey) return
    index[t.assetKey] = { id: node.id, hash: t.hash, kind: t.kind }
    if (t.kind === C.KIND.COMPONENT_SET) componentSets[t.assetKey] = node
    if (t.kind === C.KIND.SECTION) section = node
  }
  for (const child of figma.currentPage.children) {
    if (isManaged(child)) indexManaged(child)
    if (child.type === 'SECTION') {
      if (isManaged(child) && readTag(child).kind === C.KIND.SECTION) section = child
      for (const sub of /** @type {any} */ (child).children || []) {
        if (isManaged(sub)) indexManaged(sub)
      }
    }
  }
  return { index, styles: { paint, text, effect }, variables, collections, section, componentSets }
}

// ── font resolution with transparent fallback ──────────────────────────────
/**
 * Loads every font the type ramp needs, falling back to Inter when the product
 * font is not installed, and records each substitution honestly.
 * @param {ReadonlyArray<any>} textStyleSpecs
 * @returns {Promise<{ resolve: (role:string, weight:string) => {family:string, style:string}, substitutions: string[] }>}
 */
async function resolveFonts(textStyleSpecs) {
  const available = await figma.listAvailableFontsAsync()
  const has = new Set(available.map((f) => f.fontName.family + ' ' + f.fontName.style))
  /** @type {string[]} */
  const substitutions = []
  /** @type {Record<string, {family:string, style:string}>} */
  const cache = {}

  /** @param {string} family @param {string} style */
  const tryLoad = async (family, style) => {
    if (!has.has(family + ' ' + style)) return false
    try { await figma.loadFontAsync({ family, style }); return true } catch (_e) { return false }
  }

  for (const t of textStyleSpecs) {
    const role = t.font // 'display' | 'body' | 'mono'
    const desired = FONTS[role]
    const key = role + '|' + t.weight
    if (cache[key]) continue
    let family = desired.family
    let style = t.weight
    let ok = await tryLoad(family, style)
    if (!ok && t.weight !== 'Regular' && (await tryLoad(family, 'Regular'))) {
      // Weight downgrade within the same family — record it honestly too.
      substitutions.push(family + ' ' + t.weight + ' → ' + family + ' Regular')
      style = 'Regular'
      ok = true
    }
    if (!ok) {
      // Fall back to Inter with the closest available weight.
      const fb = desired.fallback
      const fbStyle = ['Bold', 'Semi Bold', 'Medium', 'Regular'].find((w) => has.has(fb + ' ' + w)) || 'Regular'
      await figma.loadFontAsync({ family: fb, style: fbStyle })
      substitutions.push(family + ' ' + t.weight + ' → ' + fb + ' ' + fbStyle)
      family = fb; style = fbStyle
    }
    cache[key] = { family, style }
  }
  return {
    resolve: (role, weight) => cache[role + '|' + weight] || cache[role + '|Regular'] || { family: 'Inter', style: 'Regular' },
    substitutions,
  }
}

// ── small paint helpers ────────────────────────────────────────────────────
/** @param {string} value @returns {any} solid paint */
function solidPaint(value) {
  const c = parseColor(value)
  const p = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b } }
  if (c.a < 1) /** @type {any} */ (p).opacity = c.a
  return p
}

// ── creators (idempotent: reuse live object when present) ──────────────────
/**
 * @param {any} specEntry
 * @param {any} live
 * @param {{assetKey:string, hash:string, runId:string}} meta
 * @returns {any} collection
 */
function upsertCollection(specEntry, live, meta) {
  let col = live.collections[specEntry.key]
  if (!col) {
    col = figma.variables.createVariableCollection(specEntry.name)
    live.collections[specEntry.key] = col
  } else if (col.name !== specEntry.name) {
    col.name = specEntry.name
  }
  try { if (col.modes[0] && col.modes[0].name !== specEntry.modeName) col.renameMode(col.defaultModeId, specEntry.modeName) } catch (_e) { /* mode rename best-effort */ }
  tag(col, { assetKey: specEntry.key, kind: C.KIND.COLLECTION, hash: specEntry.hash, runId: meta.runId })
  return col
}

/**
 * @param {any} v spec variable
 * @param {any} live
 * @param {string} runId
 * @returns {any} variable
 */
function upsertVariable(v, live, runId) {
  const col = live.collections[v.collectionKey]
  if (!col) throw new Error('collection missing for ' + v.key)
  let variable = live.variables[v.key]
  if (!variable) {
    variable = figma.variables.createVariable(v.name, col, v.resolvedType)
    live.variables[v.key] = variable
  } else if (variable.name !== v.name) {
    variable.name = v.name
  }
  try { variable.scopes = v.scopes } catch (_e) { /* invalid scope ignored */ }
  variable.description = v.description
  const modeId = col.defaultModeId
  if (v.resolvedType === 'COLOR') variable.setValueForMode(modeId, parseColor(v.value))
  else variable.setValueForMode(modeId, v.floatValue)
  tag(variable, { assetKey: v.key, kind: C.KIND.VARIABLE, hash: v.hash, runId })
  return variable
}

/**
 * @param {any} p spec paintStyle
 * @param {any} live
 * @param {string} runId
 * @returns {any} paint style
 */
function upsertPaintStyle(p, live, runId) {
  let ps = live.styles.paint[p.key]
  if (!ps) { ps = figma.createPaintStyle(); live.styles.paint[p.key] = ps }
  ps.name = p.name
  ps.description = p.description
  let paint = solidPaint(p.value)
  const variable = live.variables[p.variableKey]
  if (variable) {
    try { paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable) } catch (_e) { /* keep raw */ }
  }
  ps.paints = [paint]
  tag(ps, { assetKey: p.key, kind: C.KIND.PAINT_STYLE, hash: p.hash, runId })
  return ps
}

/**
 * @param {any} t spec textStyle
 * @param {any} live
 * @param {{resolve:Function}} fonts
 * @param {string} runId
 */
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

/**
 * @param {any} e spec effectStyle
 * @param {any} live
 * @param {string} runId
 */
function upsertEffectStyle(e, live, runId) {
  let es = live.styles.effect[e.key]
  if (!es) { es = figma.createEffectStyle(); live.styles.effect[e.key] = es }
  es.name = e.name
  es.description = e.description
  es.effects = [{
    type: 'DROP_SHADOW',
    color: { r: e.color[0], g: e.color[1], b: e.color[2], a: e.color[3] },
    offset: { x: e.offset.x, y: e.offset.y },
    radius: e.radius,
    spread: e.spread,
    visible: true,
    blendMode: 'NORMAL',
  }]
  tag(es, { assetKey: e.key, kind: C.KIND.EFFECT_STYLE, hash: e.hash, runId })
  return es
}

// ── section + component family builder ─────────────────────────────────────
/**
 * @param {any} sectionSpec
 * @param {any} live
 * @param {string} runId
 */
function ensureSection(sectionSpec, live, runId) {
  let section = live.section
  if (!section) {
    const sec = /** @type {any} */ (figma.createSection())
    // Position to the right of everything already on the page (never over (0,0)).
    let maxX = 0
    for (const ch of figma.currentPage.children) maxX = Math.max(maxX, ch.x + ch.width)
    sec.x = maxX + 400
    sec.y = 0
    try { sec.resizeWithoutConstraints(2400, 1600) } catch (_e) { try { sec.resize(2400, 1600) } catch (_e2) { /* ignore */ } }
    section = sec
    live.section = sec
  }
  section.name = sectionSpec.name
  tag(section, { assetKey: sectionSpec.key, kind: C.KIND.SECTION, hash: sectionSpec.hash, runId })
  return section
}

/**
 * Build (or rebuild) one component SET for a family: a variant component per
 * value, auto-layout, token-bound fills via paint styles, an applied text style
 * label, then combineAsVariants + component properties.
 * @param {any} fam spec family
 * @param {any} live
 * @param {any} ctx { section, paintByToken, textStyleByName, effectByName, fonts, runId }
 * @returns {Promise<{ set:any, fidelity:string }>}
 */
async function upsertFamily(fam, live, ctx) {
  // Remove a stale managed set with the same key so rebuild stays idempotent.
  const existing = live.componentSets[fam.key]
  if (existing) { try { existing.remove() } catch (_e) { /* ignore */ } delete live.componentSets[fam.key] }

  const surfaceStyle = ctx.paintByToken['Color/Surface/Primary']
  const borderStyle = ctx.paintByToken['Color/Border/Default']
  const titleStyle = ctx.textStyleByName['Title/S'] || null

  /** @param {any} node @param {string} method @param {string} id */
  const applyStyle = async (node, method, id) => { try { await node[method](id) } catch (_e) { /* style apply best-effort */ } }

  /** @type {any[]} */
  const variantComponents = []
  for (const value of fam.variants) {
    const comp = figma.createComponent()
    comp.name = fam.variantProp + '=' + value
    comp.layoutMode = 'VERTICAL'
    comp.primaryAxisSizingMode = 'AUTO'
    comp.counterAxisSizingMode = 'AUTO'
    comp.itemSpacing = 8
    comp.paddingLeft = 16; comp.paddingRight = 16; comp.paddingTop = 12; comp.paddingBottom = 12
    comp.cornerRadius = 8
    comp.strokes = [solidPaint('#203743')]
    comp.strokeWeight = 1
    ctx.section.appendChild(comp)
    if (surfaceStyle) await applyStyle(comp, 'setFillStyleIdAsync', surfaceStyle.id)
    if (borderStyle) await applyStyle(comp, 'setStrokeStyleIdAsync', borderStyle.id)

    // Family title
    const title = figma.createText()
    title.fontName = ctx.fonts.resolve('body', 'Semi Bold')
    title.characters = fam.name
    comp.appendChild(title)
    if (titleStyle) await applyStyle(title, 'setTextStyleIdAsync', titleStyle.id)
    const primaryText = ctx.paintByToken['Color/Text/Primary']
    if (primaryText) await applyStyle(title, 'setFillStyleIdAsync', primaryText.id)

    // Variant value chip, tone-coloured when the value maps to a semantic token
    const chip = figma.createText()
    chip.fontName = ctx.fonts.resolve('body', 'Medium')
    chip.characters = fam.variantProp + ': ' + value
    comp.appendChild(chip)
    const toneToken = TONE_TOKEN[value]
    const toneStyle = toneToken ? ctx.paintByToken[toneToken] : ctx.paintByToken['Color/Text/Secondary']
    if (toneStyle) await applyStyle(chip, 'setFillStyleIdAsync', toneStyle.id)

    variantComponents.push(comp)
  }

  // Combine into a variant set inside the section
  let set
  try {
    set = figma.combineAsVariants(variantComponents, ctx.section)
  } catch (_e) {
    // Fallback: keep the first component as the asset and remove the rest so no
    // untagged orphan components are left behind (they would escape rollback).
    for (let i = 1; i < variantComponents.length; i++) { try { variantComponents[i].remove() } catch (_e2) { /* ignore */ } }
    set = variantComponents[0]
  }
  set.name = fam.name
  set.description = fam.description + (fam.maps ? '\nMaps to ' + fam.maps : '')
  // Best-effort NATIVE accessibility annotation (in addition to the description).
  try { /** @type {any} */ (set).annotations = [{ label: fam.description }] } catch (_e) { /* annotations best-effort */ }
  try {
    set.layoutMode = 'HORIZONTAL'
    set.itemSpacing = 16
    set.paddingLeft = 16; set.paddingRight = 16; set.paddingTop = 16; set.paddingBottom = 16
  } catch (_e) { /* single component has no set layout */ }

  // Component properties: TEXT props + an RTL boolean (definitions; layer binding is a follow-up)
  let propsAdded = 0
  try {
    for (const tp of fam.text || []) { set.addComponentProperty(tp, 'TEXT', ''); propsAdded++ }
  } catch (_e) { /* property add best-effort */ }
  try {
    for (const bp of fam.bool || []) { set.addComponentProperty(bp, 'BOOLEAN', false); propsAdded++ }
  } catch (_e) { /* ignore */ }
  if (fam.rtl) { try { set.addComponentProperty('RTL', 'BOOLEAN', false); propsAdded++ } catch (_e) { /* ignore */ } }

  tag(set, { assetKey: fam.key, kind: C.KIND.COMPONENT_SET, hash: fam.hash, runId: ctx.runId })
  live.componentSets[fam.key] = set
  return { set, fidelity: 'foundation-scaffold (' + fam.variants.length + ' variants, ' + propsAdded + ' props)' }
}

// ── grid layout for component sets inside the section ──────────────────────
/** @param {any[]} sets @param {any} section */
function layoutSets(sets, section) {
  const COLS = 6
  const CW = 360
  const CH = 240
  const PAD = 40
  sets.forEach((s, i) => {
    if (!s) return
    const col = i % COLS
    const row = Math.floor(i / COLS)
    try { s.x = section.x + PAD + col * CW; s.y = section.y + 80 + row * CH } catch (_e) { /* ignore */ }
  })
}

// ── top-level operations ───────────────────────────────────────────────────
/**
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<any>}
 */
async function run(options) {
  const dryRun = !!(options && options.dryRun)
  const spec = buildSpec()
  const live = await buildLiveIndex()
  const plan = computePlan(spec, live.index)

  if (dryRun) {
    return { ok: true, mode: 'dry-run', counts: spec.counts, plan, manifestPresent: !!live.section }
  }

  const runId = newRunId()
  const errors = []
  const fonts = await resolveFonts(spec.textStyles)

  // Map ops by key so the family loop can honour skip (and preserve node IDs).
  const opByKey = {}
  for (const op of plan.ops) opByKey[op.key] = op

  try {
    // section
    ensureSection(spec.section, live, runId)
    // collections
    for (const col of spec.collections) upsertCollection(col, live, { assetKey: col.key, hash: col.hash, runId })
    // variables
    for (const v of spec.variables) { try { upsertVariable(v, live, runId) } catch (e) { errors.push('variable ' + v.key + ': ' + e.message) } }
    // paint styles (bind to variables)
    const paintByToken = {}
    for (const p of spec.paintStyles) { try { const ps = upsertPaintStyle(p, live, runId); paintByToken[p.name] = ps } catch (e) { errors.push('paintStyle ' + p.key + ': ' + e.message) } }
    // text styles
    const textStyleByName = {}
    for (const t of spec.textStyles) { try { const ts = upsertTextStyle(t, live, fonts, runId); textStyleByName[t.name] = ts } catch (e) { errors.push('textStyle ' + t.key + ': ' + e.message) } }
    // effect styles
    const effectByName = {}
    for (const e of spec.effectStyles) { try { const es = upsertEffectStyle(e, live, runId); effectByName[e.name] = es } catch (er) { errors.push('effectStyle ' + e.key + ': ' + er.message) } }

    // component families — rebuild only when changed; skip preserves node IDs.
    const ctx = { section: live.section, paintByToken, textStyleByName, effectByName, fonts, runId }
    const builtSets = []
    const fidelity = []
    for (const fam of spec.families) {
      const op = opByKey[fam.key]
      if (op && op.action === 'skip' && live.componentSets[fam.key]) {
        builtSets.push(live.componentSets[fam.key])
        fidelity.push({ family: fam.name, fidelity: 'unchanged (skipped, id preserved)' })
        continue
      }
      try { const r = await upsertFamily(fam, live, ctx); builtSets.push(r.set); fidelity.push({ family: fam.name, fidelity: r.fidelity }) }
      catch (e) { errors.push('family ' + fam.key + ': ' + e.message); builtSets.push(null) }
    }
    layoutSets(builtSets, live.section)

    // record run on manifest node
    await writeManifest(live, runId, spec, plan)

    return {
      ok: errors.length === 0,
      mode: 'apply',
      runId,
      counts: spec.counts,
      plan,
      applied: { create: plan.summary.create, update: plan.summary.update, skip: plan.summary.skip },
      fontSubstitutions: fonts.substitutions,
      fidelity,
      errors,
    }
  } catch (e) {
    return { ok: false, mode: 'apply', runId, error: e.message, errors }
  }
}

/**
 * VERIFY: confirm every spec asset exists and its recorded hash matches.
 * @returns {Promise<any>}
 */
async function verify() {
  const spec = buildSpec()
  const live = await buildLiveIndex()
  const present = []
  const missing = []
  const drifted = []
  for (const a of spec.assets) {
    const e = live.index[a.key]
    if (!e) { missing.push({ key: a.key, kind: a.kind, name: a.name }); continue }
    if (e.hash !== a.hash) drifted.push({ key: a.key, kind: a.kind, name: a.name, recorded: e.hash, expected: a.hash })
    else present.push(a.key)
  }
  // Reference-frame guard: how many top-level frames exist that are NOT managed.
  let referenceFrames = 0
  for (const ch of figma.currentPage.children) if (!isManaged(ch)) referenceFrames++
  return {
    ok: missing.length === 0 && drifted.length === 0,
    present: present.length,
    missing,
    drifted,
    referenceFramesPreserved: referenceFrames,
    total: spec.assets.length,
  }
}

/**
 * ROLLBACK: remove plugin-created assets. When runId is given, only assets from
 * that run are removed. Never touches anything without the managed marker.
 * @param {{ runId?: string|null }} [options]
 * @returns {Promise<any>}
 */
async function rollback(options) {
  const filterRun = options && options.runId ? options.runId : null
  const removed = { variables: 0, collections: 0, paintStyles: 0, textStyles: 0, effectStyles: 0, componentSets: 0, manifest: 0, section: 0 }
  const errors = []
  const notes = []

  /** @param {any} obj @returns {boolean} */
  const inScope = (obj) => isManaged(obj) && (!filterRun || obj.getSharedPluginData(NS, K.RUN_ID) === filterRun)

  // Order: components → styles → variables → collections → section (dependency-safe).
  for (const ch of [...figma.currentPage.children]) {
    if (ch.type === 'SECTION') {
      for (const sub of [...(/** @type {any} */ (ch).children || [])]) {
        if (!inScope(sub)) continue
        const kind = sub.getSharedPluginData(NS, K.ASSET_KIND)
        try { sub.remove(); if (kind === C.KIND.MANIFEST) removed.manifest++; else removed.componentSets++ } catch (e) { errors.push(e.message) }
      }
    }
  }
  for (const ps of await figma.getLocalPaintStylesAsync()) if (inScope(ps)) { try { ps.remove(); removed.paintStyles++ } catch (e) { errors.push(e.message) } }
  for (const ts of await figma.getLocalTextStylesAsync()) if (inScope(ts)) { try { ts.remove(); removed.textStyles++ } catch (e) { errors.push(e.message) } }
  for (const es of await figma.getLocalEffectStylesAsync()) if (inScope(es)) { try { es.remove(); removed.effectStyles++ } catch (e) { errors.push(e.message) } }
  for (const v of await figma.variables.getLocalVariablesAsync()) if (inScope(v)) { try { v.remove(); removed.variables++ } catch (e) { errors.push(e.message) } }
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) if (inScope(c)) { try { c.remove(); removed.collections++ } catch (e) { errors.push(e.message) } }
  // Remove the managed section last — ONLY when it is now empty, so the section's
  // cascading delete can never take out-of-scope managed nodes (other runs) or any
  // unmanaged content a user may have dragged inside it.
  for (const ch of [...figma.currentPage.children]) {
    if (ch.type === 'SECTION' && inScope(ch)) {
      const remaining = (/** @type {any} */ (ch).children || []).length
      if (remaining === 0) { try { ch.remove(); removed.section++ } catch (e) { errors.push(e.message) } }
      else notes.push('section kept: ' + remaining + ' out-of-scope/user child(ren) remain')
    }
  }
  return { ok: errors.length === 0, scope: filterRun || 'all-managed', removed, notes, errors }
}

// ── manifest node (audit / run history; idempotency uses live markers) ─────
const CHUNK = 60000
/** @param {any} node @param {string} base @param {string} str */
function writeChunked(node, base, str) {
  const n = Math.max(1, Math.ceil(str.length / CHUNK))
  node.setSharedPluginData(NS, base + ':count', String(n))
  for (let i = 0; i < n; i++) node.setSharedPluginData(NS, base + ':' + i, str.slice(i * CHUNK, (i + 1) * CHUNK))
}

/**
 * Rebuild the authoritative assetKey -> {id, hash, kind} index from the live
 * objects touched THIS run (buildLiveIndex only saw pre-existing assets, so on a
 * fresh file it starts empty — read the ids/tags back off what we created).
 * @param {any} live
 * @returns {Record<string, {id:string, hash:string, kind:string}>}
 */
function rebuildIndexFromLive(live) {
  /** @type {Record<string, {id:string, hash:string, kind:string}>} */
  const idx = {}
  /** @param {any} obj */
  const add = (obj) => {
    if (!obj) return
    try { const t = readTag(obj); if (t.assetKey) idx[t.assetKey] = { id: obj.id, hash: t.hash, kind: t.kind } } catch (_e) { /* ignore */ }
  }
  const groups = [live.collections, live.variables, live.styles.paint, live.styles.text, live.styles.effect, live.componentSets]
  for (const g of groups) for (const k of Object.keys(g || {})) add(g[k])
  add(live.section)
  return idx
}

/**
 * @param {any} live
 * @param {string} runId
 * @param {any} spec
 * @param {any} plan
 */
async function writeManifest(live, runId, spec, plan) {
  const section = live.section
  if (!section) return
  let node = section.children.find((/** @type {any} */ n) => n.getSharedPluginData(NS, K.ASSET_KIND) === C.KIND.MANIFEST)
  if (!node) {
    node = figma.createFrame()
    node.name = C.MANIFEST_NODE_NAME
    node.resize(24, 24)
    node.visible = false
    section.appendChild(node)
  }
  const index = rebuildIndexFromLive(live)
  const payload = { pluginVersion: C.PLUGIN_VERSION, lastRunId: runId, counts: spec.counts, summary: plan.summary, index }
  writeChunked(node, 'manifest', JSON.stringify(payload))
  node.setSharedPluginData(NS, K.MANAGED, '1')
  node.setSharedPluginData(NS, K.ASSET_KIND, C.KIND.MANIFEST)
  // Reserved assetKey so the node is never re-planned as a prune orphan.
  node.setSharedPluginData(NS, K.ASSET_KEY, 'manifest:node')
  node.setSharedPluginData(NS, K.RUN_ID, runId)
}

module.exports = { run, verify, rollback, buildLiveIndex }

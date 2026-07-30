import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

// The plugin's runtime modules are CommonJS (so the same files load both in
// Figma's classic-script sandbox and here). Load them via createRequire.
const require = createRequire(import.meta.url)
const { buildSpec } = require('../src/lib/spec.js')
const { computePlan, renderPlanText } = require('../src/lib/plan.js')
const { COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, TEXT_STYLES, SHADOW_TOKENS, parseColor } = require('../src/lib/tokens.js')
const { PRIMITIVES, CORE, INDUSTRIAL, FAMILIES } = require('../src/lib/components.js')
const starter = require('../src/lib/starter.js')
const { hashAsset, slug } = require('../src/lib/util.js')

describe('spec is deterministic', () => {
  it('produces identical assets (key + content hash) across calls', () => {
    const a = buildSpec().assets.map((x) => x.key + ':' + x.hash)
    const b = buildSpec().assets.map((x) => x.key + ':' + x.hash)
    expect(a).toEqual(b)
  })

  it('has no duplicate asset keys', () => {
    const keys = buildSpec().assets.map((x) => x.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('token-contract coverage + counts', () => {
  const spec = buildSpec()

  it('mirrors every token-contract color as a native variable', () => {
    const names = new Set(spec.variables.filter((v) => v.resolvedType === 'COLOR').map((v) => v.name))
    for (const t of COLOR_TOKENS) expect(names.has(t.figma), t.figma).toBe(true)
  })

  it('creates one bound paint style per color, referencing an existing variable', () => {
    expect(spec.paintStyles.length).toBe(COLOR_TOKENS.length)
    const varKeys = new Set(spec.variables.map((v) => v.key))
    for (const p of spec.paintStyles) expect(varKeys.has(p.variableKey), p.key).toBe(true)
  })

  it('counts foundations exactly', () => {
    expect(spec.counts.collections).toBe(4)
    expect(spec.counts.variables).toBe(COLOR_TOKENS.length + SPACE_TOKENS.length + RADIUS_TOKENS.length + SIZE_TOKENS.length)
    expect(spec.counts.textStyles).toBe(TEXT_STYLES.length)
    expect(spec.counts.effectStyles).toBe(SHADOW_TOKENS.length)
  })
})

describe('component registry', () => {
  it('has 23 primitives, 13 core, 7 industrial (43 families)', () => {
    expect(PRIMITIVES.length).toBe(23)
    expect(CORE.length).toBe(13)
    expect(INDUSTRIAL.length).toBe(7)
    expect(FAMILIES.length).toBe(43)
    expect(buildSpec().counts.families).toBe(43)
  })

  it('maps every primitive to a real ds source file', () => {
    for (const p of PRIMITIVES) expect(p.maps, p.name).toMatch(/^src\/components\/ds\/.+\.tsx$/)
  })

  it('materialises at least one component per family', () => {
    for (const f of FAMILIES) expect(f.variant.values.length, f.name).toBeGreaterThan(0)
    expect(buildSpec().counts.components).toBeGreaterThanOrEqual(43)
  })
})

describe('plan is idempotent', () => {
  it('fresh file → all create', () => {
    const spec = buildSpec()
    const plan = computePlan(spec, {})
    expect(plan.summary.create).toBe(spec.assets.length)
    expect(plan.summary.skip).toBe(0)
    expect(plan.summary.update).toBe(0)
  })

  it('rerun with a matching index → all skip (never duplicates)', () => {
    const spec = buildSpec()
    const index = {}
    for (const a of spec.assets) index[a.key] = { id: 'id:' + a.key, hash: a.hash, kind: a.kind }
    const plan = computePlan(buildSpec(), index)
    expect(plan.summary.skip).toBe(spec.assets.length)
    expect(plan.summary.create).toBe(0)
  })

  it('changed asset → exactly one update', () => {
    const spec = buildSpec()
    const index = {}
    for (const a of spec.assets) index[a.key] = { id: 'id:' + a.key, hash: a.hash, kind: a.kind }
    const target = spec.variables[0].key
    index[target] = { ...index[target], hash: 'deadbeef' }
    const plan = computePlan(buildSpec(), index)
    expect(plan.summary.update).toBe(1)
    expect(plan.ops.find((o) => o.key === target).action).toBe('update')
  })

  it('orphan in index → flagged for prune (not silently kept)', () => {
    const spec = buildSpec()
    const index = { 'variable:ghost:Color/X': { id: 'g1', hash: 'h', kind: 'variable' } }
    const plan = computePlan(buildSpec(), index)
    expect(plan.summary.prune).toBe(1)
    expect(plan.prune[0].key).toBe('variable:ghost:Color/X')
  })
})

describe('Starter capability gating is honest', () => {
  it('uses a single default mode on Starter', () => {
    expect(starter.modeStrategy().multiMode).toBe(false)
    expect(starter.modeStrategy().modeName).toBe('Value')
  })

  it('defers multi-mode and library publishing with the exact code', () => {
    const codes = starter.STARTER_DEFERRED.map((d) => d.code)
    expect(codes.every((c) => c === 'DEFERRED_REQUIRES_FIGMA_PROFESSIONAL')).toBe(true)
    expect(starter.STARTER_DEFERRED.some((d) => /mode/i.test(d.capability))).toBe(true)
    expect(starter.STARTER_DEFERRED.some((d) => /librar/i.test(d.capability))).toBe(true)
  })

  it('surfaces the file edit-access requirement (View seat cannot write)', () => {
    expect(starter.FILE_EDIT_REQUIREMENT.requirement).toMatch(/can edit/i)
  })
})

describe('pure utils', () => {
  it('hash is order-independent', () => {
    expect(hashAsset({ a: 1, b: 2 })).toBe(hashAsset({ b: 2, a: 1 }))
    expect(hashAsset({ a: 1 })).not.toBe(hashAsset({ a: 2 }))
  })

  it('slug normalises names', () => {
    expect(slug('Hermes · Semantic Colors')).toBe('hermes-semantic-colors')
  })

  it('parseColor handles hex and rgba', () => {
    expect(parseColor('#071018')).toEqual({ r: 7 / 255, g: 16 / 255, b: 24 / 255, a: 1 })
    const c = parseColor('rgba(12, 23, 32, 0.78)')
    expect(c.a).toBeCloseTo(0.78)
    expect(c.r).toBeCloseTo(12 / 255)
  })

  it('renderPlanText summarises the plan', () => {
    const txt = renderPlanText(computePlan(buildSpec(), {}))
    expect(txt).toContain('PLAN:')
    expect(txt).toContain('component sets')
  })
})

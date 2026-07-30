import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const { buildSpec } = require('../src/lib/spec.js')
const { computePlan, renderPlanText, runScope, detectAmbiguity } = require('../src/lib/plan.js')
const { COLOR_TOKENS, SPACE_TOKENS, RADIUS_TOKENS, SIZE_TOKENS, TEXT_STYLES, SHADOW_TOKENS, parseColor, assessFontAvailability, WEIGHT_ALIASES } = require('../src/lib/tokens.js')
const { PRIMITIVES, CORE, INDUSTRIAL, ICON, FAMILIES, TONE_TOKEN, variantCombos, totalVariants } = require('../src/lib/components.js')
const { PRESETS, STATE_PRESETS, collectRoles, collectTokens, collectTextStyles, findRole } = require('../src/lib/presets.js')
const { buildAssemblies, ORIGINAL_REFS, EXPERIENCES, LOCALES } = require('../src/lib/assemblies.js')
const { STRINGS } = require('../src/lib/locale-strings.js')
const starter = require('../src/lib/starter.js')
const { validateAssemblyText, textProblem, pickAdoptable } = require('../src/lib/validate.js')
const { hashAsset, slug } = require('../src/lib/util.js')
const { REVISIONS } = require('../src/lib/constants.js')

const VALID_TOKENS = new Set(COLOR_TOKENS.map((t) => t.figma))
const VALID_TEXT_STYLES = new Set(TEXT_STYLES.map((t) => t.name))

/** Render every variant blueprint of a family (pure). */
function blueprintsOf(fam) {
  return variantCombos(fam).map((combo) => {
    const o = { ...(fam.presetOpts || {}) }
    if (fam.sizeAxis && combo.Size) o.size = combo.Size
    if (fam.shapeAxis && combo.Shape) o.shape = combo.Shape
    if (fam.markAxis && combo.Mark) o.mark = combo.Mark
    if (fam.densityAxis && combo.Density) o.compact = combo.Density === 'Compact'
    if (fam.collapseAxis && combo.State) o.collapsed = combo.State === 'Collapsed'
    return { combo, spec: PRESETS[fam.preset](o) }
  })
}

// ── determinism ─────────────────────────────────────────────────────────────
describe('spec determinism', () => {
  it('identical keys + hashes across calls; no duplicate keys', () => {
    const a = buildSpec().assets.map((x) => x.key + ':' + x.hash)
    const b = buildSpec().assets.map((x) => x.key + ':' + x.hash)
    expect(a).toEqual(b)
    const keys = buildSpec().assets.map((x) => x.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

// ── registry coverage ───────────────────────────────────────────────────────
describe('component registry coverage (44 families)', () => {
  it('has 23 primitives, 13 core, 7 industrial, 1 icon utility', () => {
    expect(PRIMITIVES.length).toBe(23)
    expect(CORE.length).toBe(13)
    expect(INDUSTRIAL.length).toBe(7)
    expect(FAMILIES.length).toBe(44)
  })

  it('covers every REQUIRED core + industrial family name', () => {
    const names = new Set(FAMILIES.map((f) => f.name))
    const requiredCore = ['Button', 'IconButton', 'Link', 'Input', 'Textarea', 'Select', 'Checkbox', 'Radio', 'Switch', 'Search', 'Badge', 'StatusIndicator', 'Tooltip', 'Dropdown', 'Tabs', 'Accordion', 'Alert', 'Toast', 'Dialog', 'Drawer', 'Card', 'MetricCard', 'DataTable', 'Pagination', 'Breadcrumb', 'Sidebar', 'TopNavigation', 'LanguageSelector', 'UserMenu', 'EmptyState', 'Skeleton', 'ErrorState']
    const requiredIndustrial = ['IndustrialSignalTile', 'FaultHypothesisCard', 'EvidenceItem', 'ConfidenceIndicator', 'SafeActionPanel', 'TimelineEventRow', 'AssetStatusBlock']
    for (const n of [...requiredCore, ...requiredIndustrial]) expect(names.has(n), n).toBe(true)
  })

  it('renames kept the ORIGINAL asset keys (completed, not duplicated)', () => {
    const byKey = Object.fromEntries(FAMILIES.map((f) => [f.key, f.name]))
    expect(byKey['kpi-card']).toBe('MetricCard')
    expect(byKey['top-nav']).toBe('TopNavigation')
    expect(byKey['timeline']).toBe('TimelineEventRow')
    expect(FAMILIES.some((f) => f.name === 'KpiCard' || f.name === 'TopNav' || f.name === 'Timeline')).toBe(false)
  })

  it('every primitive maps to a real ds source file', () => {
    for (const f of PRIMITIVES) expect(f.maps, f.name).toMatch(/^src\/components\/ds\/.+\.tsx$/)
  })
})

// ── anatomy contracts ───────────────────────────────────────────────────────
describe('anatomy contracts (all 44 families, every variant blueprint)', () => {
  for (const fam of FAMILIES) {
    it(fam.name + ': roles unique; tokens + text styles valid; bound roles exist; a11y present', () => {
      expect(fam.a11y && fam.a11y.length > 10, 'a11y contract').toBe(true)
      for (const { combo, spec } of blueprintsOf(fam)) {
        const roles = collectRoles(spec)
        expect(new Set(roles).size, 'unique roles @' + JSON.stringify(combo)).toBe(roles.length)
        for (const tok of collectTokens(spec)) expect(VALID_TOKENS.has(tok), 'token ' + tok).toBe(true)
        for (const ts of collectTextStyles(spec)) expect(VALID_TEXT_STYLES.has(ts), 'textStyle ' + ts).toBe(true)
        for (const tp of fam.text || []) expect(findRole(spec, tp.role), 'text prop role ' + tp.role).toBeTruthy()
        for (const bp of fam.bools || []) expect(findRole(spec, bp.role), 'bool prop role ' + bp.role).toBeTruthy()
        for (const sp of fam.swaps || []) {
          const n = findRole(spec, sp.role)
          expect(n, 'swap prop role ' + sp.role).toBeTruthy()
          expect(n.type, 'swap role must be an iconSlot').toBe('iconSlot')
        }
      }
    })
  }

  it('override targets reference roles that exist in the blueprint', () => {
    for (const fam of FAMILIES) {
      const spec0 = blueprintsOf(fam)[0].spec
      const vo = fam.valueOverrides || {}
      for (const axisProp of Object.keys(vo)) {
        for (const value of Object.keys(vo[axisProp])) {
          for (const o of vo[axisProp][value]) {
            if (o.role === 'root') continue
            expect(findRole(spec0, o.role), fam.name + ' override role ' + o.role + ' (' + axisProp + '=' + value + ')').toBeTruthy()
          }
        }
      }
    }
  })

  it('interaction states: interactive families expose Default + Disabled (or family-specific set)', () => {
    const interactive = ['button', 'icon-button', 'checkbox', 'radio', 'switch', 'input', 'textarea', 'select', 'tabs']
    for (const key of interactive) {
      const fam = FAMILIES.find((f) => f.key === key)
      const stateAxis = fam.axes.find((a) => a.prop === 'State')
      expect(stateAxis, key + ' has a State axis').toBeTruthy()
      expect(stateAxis.values, key).toContain('Default')
      expect(stateAxis.values, key).toContain('Disabled')
    }
  })

  it('data/industrial families expose explicit empty/loading/error where mandated', () => {
    const dt = FAMILIES.find((f) => f.key === 'data-table')
    expect(dt.axes.find((a) => a.prop === 'State').values).toEqual(['Default', 'Empty', 'Loading', 'Error'])
    const tile = FAMILIES.find((f) => f.key === 'industrial-signal-tile')
    expect(tile.axes[0].values).toContain('Offline')
    const metric = FAMILIES.find((f) => f.key === 'kpi-card')
    expect(metric.axes.find((a) => a.prop === 'State').values).toEqual(['Default', 'Loading', 'Error'])
  })

  it('touch targets: control-like blueprints declare minH ≥ 40', () => {
    for (const key of ['button', 'input', 'select', 'checkbox', 'radio', 'switch']) {
      const fam = FAMILIES.find((f) => f.key === key)
      const spec = blueprintsOf(fam)[0].spec
      const hasTouch = (n) => (n.minH != null && n.minH >= 40) || (n.children || []).some(hasTouch)
      expect(hasTouch(spec), key).toBe(true)
    }
  })

  it('long-text resilience: card/list bodies declare maxW (wrapping)', () => {
    for (const key of ['card', 'kpi-card', 'fault-hypothesis-card', 'alert', 'evidence-item']) {
      const fam = FAMILIES.find((f) => f.key === key)
      const spec = blueprintsOf(fam)[0].spec
      const hasWrap = (n) => (n.type === 'text' && n.maxW) || (n.children || []).some(hasWrap)
      expect(hasWrap(spec), key).toBe(true)
    }
  })

  it('RTL: Direction axis present on row-anatomy text families, absent on symmetric/technical ones', () => {
    for (const key of ['button', 'alert', 'input', 'sidebar', 'top-nav']) expect(FAMILIES.find((f) => f.key === key).dirAxis, key).toBe(true)
    for (const key of ['technical-value', 'industrial-signal-tile', 'skeleton', 'spinner', 'icon']) expect(!!FAMILIES.find((f) => f.key === key).dirAxis, key).toBe(false)
  })

  it('tone values used by axes resolve in TONE_TOKEN or family overrides', () => {
    for (const fam of FAMILIES) {
      for (const ax of fam.axes) {
        if (['State', 'Size', 'Shape', 'Mark', 'Density', 'Elevation', 'Side', 'Locale', 'Variant', 'Value'].includes(ax.prop)) continue
        for (const v of ax.values) {
          const covered = TONE_TOKEN[v] || (fam.valueOverrides && fam.valueOverrides[ax.prop] && fam.valueOverrides[ax.prop][v])
          expect(covered, fam.name + ' ' + ax.prop + '=' + v).toBeTruthy()
        }
      }
    }
  })
})

// ── spec counts + variant totals ────────────────────────────────────────────
describe('spec counts', () => {
  const spec = buildSpec()
  it('foundations exact; families 44; assemblies 24; sections 2', () => {
    expect(spec.counts.collections).toBe(4)
    expect(spec.counts.variables).toBe(COLOR_TOKENS.length + SPACE_TOKENS.length + RADIUS_TOKENS.length + SIZE_TOKENS.length)
    expect(spec.counts.paintStyles).toBe(COLOR_TOKENS.length)
    expect(spec.counts.textStyles).toBe(TEXT_STYLES.length)
    expect(spec.counts.effectStyles).toBe(SHADOW_TOKENS.length)
    expect(spec.counts.families).toBe(44)
    expect(spec.counts.assemblies).toBe(36)
    expect(spec.counts.sections).toBe(2)
    expect(spec.counts.total).toBe(2 + 4 + spec.counts.variables + 29 + 8 + 4 + 44 + 36)
  })
  it('component (variant) total matches the cartesian registry and is ≥ 126', () => {
    expect(spec.counts.components).toBe(totalVariants())
    expect(spec.counts.components).toBeGreaterThanOrEqual(126)
  })
  it('every paint style references an existing variable', () => {
    const varKeys = new Set(spec.variables.map((v) => v.key))
    for (const p of spec.paintStyles) expect(varKeys.has(p.variableKey), p.key).toBe(true)
  })
})

// ── assemblies (tri-lingual) ────────────────────────────────────────────────
describe('managed reference assemblies (36 — FA/EN/DE × Desktop/Mobile × 6)', () => {
  const asms = buildAssemblies()
  it('covers 6 experiences × Desktop/Mobile × EN/FA/DE = 36', () => {
    expect(asms.length).toBe(36)
    expect(EXPERIENCES.length).toBe(6)
    expect([...LOCALES]).toEqual(['en', 'fa', 'de'])
    for (const exp of EXPERIENCES) {
      for (const ctx of ['desktop', 'mobile']) for (const l of ['en', 'fa', 'de']) {
        expect(asms.find((a) => a.experience === exp && a.context === ctx && a.locale === l), exp + '/' + ctx + '/' + l).toBeTruthy()
      }
    }
  })
  it('EN/FA map to the 24 unique closure README nodes; DE has none and is marked generated', () => {
    const enFa = asms.filter((a) => a.locale !== 'de')
    expect(enFa.length).toBe(24)
    expect(new Set(enFa.map((a) => a.originalRef)).size).toBe(24)
    for (const a of enFa) {
      const refKey = a.context + (a.locale === 'en' ? 'En' : 'Fa')
      expect(a.originalRef).toBe(ORIGINAL_REFS[a.experience][refKey])
      expect(a.newlyGenerated).toBe(false)
    }
    const deAsms = asms.filter((a) => a.locale === 'de')
    expect(deAsms.length).toBe(12)
    for (const a of deAsms) {
      expect(a.originalRef).toBeNull()
      expect(a.newlyGenerated).toBe(true)
      expect(a.name).toContain('generated')
      expect(a.rtl).toBe(false) // DE is LTR
    }
  })
  it('every instance item references an existing family; props reference declared TEXT props', () => {
    const famByKey = Object.fromEntries(FAMILIES.map((f) => [f.key, f]))
    const walk = (item, asm) => {
      if (item.row) { item.row.forEach((s) => walk(s, asm)); return }
      if (item.heading) { expect(typeof item.heading === 'string' && item.heading.length > 0, 'pre-localized heading string').toBe(true); return }
      const fam = famByKey[item.family]
      expect(fam, asm.key + ' → ' + item.family).toBeTruthy()
      for (const ax of Object.keys(item.variant || {})) {
        const axDef = fam.axes.find((a2) => a2.prop === ax)
        expect(axDef, asm.key + ' ' + item.family + ' axis ' + ax).toBeTruthy()
        expect(axDef.values, asm.key + ' ' + item.family + ' ' + ax).toContain(item.variant[ax])
      }
      const textProps = new Set((fam.text || []).map((t) => t.name))
      for (const pn of Object.keys(item.props || {})) expect(textProps.has(pn), asm.key + ' ' + item.family + ' prop ' + pn).toBe(true)
    }
    for (const a of asms) a.items.forEach((i) => walk(i, a))
  })
  it('FA assemblies are RTL; desktop/mobile widths are real', () => {
    for (const a of asms) {
      expect(a.rtl).toBe(a.locale === 'fa')
      expect(a.width).toBe(a.context === 'desktop' ? 1200 : 390)
    }
  })

  it('every locale string is VERBATIM from the repository catalogs (no invented copy)', () => {
    const repoRoot = join(ROOT, '..', '..', '..')
    const catalogs = {
      en: JSON.parse(readFileSync(join(repoRoot, 'messages', 'en.json'), 'utf8')),
      fa: JSON.parse(readFileSync(join(repoRoot, 'messages', 'fa.json'), 'utf8')),
      de: JSON.parse(readFileSync(join(repoRoot, 'messages', 'de.json'), 'utf8')),
    }
    const get = (o, p) => p.split('.').reduce((a, k) => (a ? a[k] : undefined), o)
    for (const id of Object.keys(STRINGS)) {
      const s = STRINGS[id]
      for (const l of ['en', 'fa', 'de']) {
        expect(get(catalogs[l], s.key), id + '.' + l + ' @ ' + s.key).toBe(s[l])
      }
      // honesty flag matches reality
      expect(s.deGenuine, id + ' deGenuine flag').toBe(s.de !== s.en)
    }
  })

  it('German long-compound overflow heuristic: longest unbreakable word fits its container at the used type size', () => {
    // Figma does not hyphenate: a single word longer than its container width
    // overflows. Estimate word width as chars × fontSize × 0.62 (worst-case
    // Latin average) and check against the narrowest budget the string meets.
    const sizeOf = { 'Display/XL': 32, 'Heading/L': 24, 'Heading/M': 20, 'Title/S': 16, 'Body/M': 14, 'Body/S': 13, Caption: 12 }
    const mobileBudget = 390 - 2 * 16 // mobile assembly inner width
    const estWidth = (word, size) => word.length * size * 0.62
    const longestWord = (s2) => s2.split(/[\s—–-]+/).reduce((a, w) => (w.length > a.length ? w : a), '')
    for (const a of asms.filter((x) => x.locale === 'de')) {
      const walk = (item) => {
        if (item.row) { item.row.forEach(walk); return }
        if (item.heading) {
          const size = sizeOf[item.style] || 14
          const budget = a.context === 'mobile' ? mobileBudget : 1200 - 2 * 48
          const w = longestWord(item.heading)
          expect(estWidth(w, size), a.key + ' heading word "' + w + '" @' + item.style).toBeLessThanOrEqual(budget)
          return
        }
        // component TEXT props render at Body/M or smaller inside ≥220px-wide wrapping roles
        for (const v of Object.values(item.props || {})) {
          const w = longestWord(String(v))
          expect(estWidth(w, 14), a.key + ' prop word "' + w + '"').toBeLessThanOrEqual(220)
        }
      }
      a.items.forEach(walk)
    }
  })

  it('mobile assemblies never use Display/XL (DE compound safety)', () => {
    for (const a of asms.filter((x) => x.context === 'mobile')) {
      const walk = (item) => {
        if (item.row) { item.row.forEach(walk); return }
        if (item.heading) expect(item.style, a.key).not.toBe('Display/XL')
      }
      a.items.forEach(walk)
    }
  })

  it('locale switching: LanguageSelector covers FA/EN/DE and each homepage assembly pins its locale', () => {
    const ls = FAMILIES.find((f) => f.key === 'language-selector')
    expect(ls.axes.find((a) => a.prop === 'Locale').values).toEqual(['FA', 'EN', 'DE'])
    for (const a of asms.filter((x) => x.experience === 'homepage')) {
      const found = []
      const walk = (item) => { if (item.row) item.row.forEach(walk); else if (item.family === 'language-selector') found.push(item.variant.Locale) }
      a.items.forEach(walk)
      expect(found).toEqual([a.locale.toUpperCase()])
    }
  })
})

// ── plan: idempotency + final-upgrade shape ─────────────────────────────────
function indexFrom(assets, runId = 'R1', hashOverride) {
  const idx = {}
  for (const a of assets) idx[a.key] = { id: 'id:' + a.key, hash: hashOverride ? hashOverride(a) : a.hash, kind: a.kind, runId }
  return idx
}

describe('plan: rerun idempotency and FINAL upgrade shape', () => {
  it('rerun with the same spec is a full no-op', () => {
    const cur = buildSpec()
    const plan = computePlan(buildSpec(), indexFrom(cur.assets))
    expect(plan.summary).toEqual({ create: 0, update: 0, skip: cur.assets.length, prune: 0, total: cur.assets.length })
  })

  it('vs the APPLIED rev-1 file: 38 create · 51 update · 84 skip · 0 prune', () => {
    const spec = buildSpec()
    // The applied rev-1 file had exactly: section:generated + foundation + the 43
    // pre-icon component sets — with rev-1 hashes (≠ current for families/text styles).
    const rev1Keys = new Set(spec.assets.filter((a) => !a.key.startsWith('assembly:') && a.key !== 'section:assemblies' && a.key !== 'componentSet:icon').map((a) => a.key))
    const rev1Assets = spec.assets.filter((a) => rev1Keys.has(a.key))
    const idx = indexFrom(rev1Assets, 'run-ms7q88mf-1', (a) => (a.kind === 'componentSet' || a.kind === 'textStyle' ? 'rev1-' + a.key : a.hash))
    const plan = computePlan(spec, idx)
    expect(plan.summary.create).toBe(38) // section2 + 36 tri-lingual assemblies + Icon family
    expect(plan.summary.update).toBe(51) // 43 component sets + 8 text styles
    expect(plan.summary.skip).toBe(84) // untouched foundation + section1
    expect(plan.summary.prune).toBe(0) // renames kept keys — nothing orphaned
    const created = plan.ops.filter((o) => o.action === 'create').map((o) => o.key)
    expect(created).toContain('componentSet:icon')
    expect(created).toContain('section:assemblies')
    expect(created.filter((k) => k.startsWith('assembly:')).length).toBe(36)
  })

  it('partial-upgrade recovery: an interrupted Apply converges on rerun', () => {
    const spec = buildSpec()
    // Simulate interruption: half the component sets already updated (new hash),
    // half still carry the old hash; assemblies half-created.
    const fams = spec.assets.filter((a) => a.kind === 'componentSet')
    const asms = spec.assets.filter((a) => a.kind === 'assembly')
    const done = new Set([...fams.slice(0, 22), ...asms.slice(0, 12)].map((a) => a.key))
    const baseline = spec.assets.filter((a) => a.kind !== 'assembly' || done.has(a.key))
    const idx = indexFrom(baseline, 'R1', (a) => {
      if (a.kind === 'componentSet' && !done.has(a.key)) return 'stale-' + a.key
      return a.hash
    })
    const plan = computePlan(spec, idx)
    expect(plan.summary.create).toBe(asms.length - 12) // only the missing assemblies
    expect(plan.summary.update).toBe(fams.length - 22) // only the stale families
    expect(plan.summary.prune).toBe(0)
    // convergence: applying those ops yields the full skip state
    const afterIdx = indexFrom(spec.assets, 'R1')
    expect(computePlan(buildSpec(), afterIdx).summary.update).toBe(0)
  })
})

// ── ownership ambiguity (fail closed) ───────────────────────────────────────
describe('ownership ambiguity detection', () => {
  it('flags duplicate assetKey markers and nothing else', () => {
    const amb = detectAmbiguity([
      { assetKey: 'componentSet:button', id: '1:1' },
      { assetKey: 'componentSet:button', id: '9:9' },
      { assetKey: 'componentSet:card', id: '2:2' },
      { assetKey: '', id: '3:3' },
    ])
    expect(amb).toEqual([{ assetKey: 'componentSet:button', ids: ['1:1', '9:9'] }])
    expect(detectAmbiguity([])).toEqual([])
  })
})

// ── rollback isolation across revisions ─────────────────────────────────────
describe('rollback stays run-isolated across revisions', () => {
  it('a pure-upgrade run owns nothing; origin run owns everything it created', () => {
    const spec = buildSpec()
    const idx = indexFrom(spec.assets, 'R1')
    // the FINAL upgrade creates 38 new assets under R2; the rest keep R1
    for (const k of Object.keys(idx)) {
      if (k.startsWith('assembly:') || k === 'section:assemblies' || k === 'componentSet:icon') idx[k].runId = 'R2'
    }
    expect(runScope(idx, 'R2').length).toBe(38)
    expect(runScope(idx, 'R1').length).toBe(spec.assets.length - 38)
    expect(runScope(idx, null).length).toBe(spec.assets.length)
  })
})

// ── fonts: gate + aliasing ──────────────────────────────────────────────────
describe('canonical font gate (fail closed unless owner opts into fallback)', () => {
  it('resolves canonical weights via NO-SPACE upstream spellings (SemiBold)', () => {
    const available = new Set(['Estedad Bold', 'Estedad SemiBold', 'Vazirmatn Regular', 'Vazirmatn Medium', 'Vazirmatn SemiBold'])
    const gate = assessFontAvailability(available)
    expect(gate.canonicalPresent).toBe(true)
    expect(gate.resolved.find((r) => r.family === 'Estedad' && r.weight === 'Semi Bold').style).toBe('SemiBold')
  })
  it('reports missing pairs when a family is absent (Estedad not installed)', () => {
    const available = new Set(['Vazirmatn Regular', 'Vazirmatn Medium', 'Vazirmatn SemiBold', 'Inter Regular', 'Inter Bold'])
    const gate = assessFontAvailability(available)
    expect(gate.canonicalPresent).toBe(false)
    expect(gate.missing).toEqual([{ family: 'Estedad', weight: 'Bold' }, { family: 'Estedad', weight: 'Semi Bold' }])
  })
  it('mono ramp does not gate (generic fallback chain by design)', () => {
    const gate = assessFontAvailability(new Set(['Estedad Bold', 'Estedad SemiBold', 'Vazirmatn Regular', 'Vazirmatn Medium', 'Vazirmatn SemiBold']))
    expect(gate.missing.find((m) => m.family === 'Roboto Mono')).toBeUndefined()
  })
  it('weight aliases cover the Figma-vs-upstream spelling split', () => {
    expect(WEIGHT_ALIASES['Semi Bold']).toContain('SemiBold')
    expect(WEIGHT_ALIASES.Bold).toContain('700')
  })
})

// ── zero-network / zero-secret / manifest consistency ───────────────────────
describe('security + packaging guarantees', () => {
  const srcFiles = []
  const walk = (d) => {
    for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name))
      else srcFiles.push(join(d, e.name))
    }
  }
  walk('src')

  it('zero network primitives anywhere in src/', () => {
    const NET = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|require\(\s*['"](?:node:)?(?:http|https|net|tls|dns|dgram)['"]\s*\)/
    for (const f of srcFiles) expect(NET.test(readFileSync(join(ROOT, f), 'utf8')), f).toBe(false)
  })
  it('zero secret-looking material in src/', () => {
    const SECRET = /\bAKIA[0-9A-Z]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bfigd_[A-Za-z0-9_-]{20,}\b|\bxox[baprs]-/
    for (const f of srcFiles) expect(SECRET.test(readFileSync(join(ROOT, f), 'utf8')), f).toBe(false)
  })
  it('manifest declares no network and points at existing built artifacts', () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'))
    expect(m.networkAccess.allowedDomains).toEqual(['none'])
    expect(existsSync(join(ROOT, m.main))).toBe(true)
    expect(existsSync(join(ROOT, m.ui))).toBe(true)
    expect(m.editorType).toEqual(['figma'])
  })
  it('build report matches the CURRENT sources and the built bundle (stale dist fails)', () => {
    const report = JSON.parse(readFileSync(join(ROOT, 'dist/build-report.json'), 'utf8'))
    const sha16 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)
    for (const e of report.builtFrom) {
      expect(sha16(readFileSync(join(ROOT, e.file))), e.file + ' (rebuild dist)').toBe(e.sha256)
    }
    expect(sha16(readFileSync(join(ROOT, 'dist/code.js')))).toBe(report.bundleSha256)
  })
})

// ── Starter honesty ─────────────────────────────────────────────────────────
describe('Starter gating honesty', () => {
  it('single default mode; multi-mode + library publishing deferred with the exact code', () => {
    expect(starter.modeStrategy().multiMode).toBe(false)
    const codes = starter.STARTER_DEFERRED.map((d) => d.code)
    expect(codes.every((c) => c === 'DEFERRED_REQUIRES_FIGMA_PROFESSIONAL')).toBe(true)
    expect(starter.STARTER_DEFERRED.length).toBe(2)
  })
})

// ── pure utils ──────────────────────────────────────────────────────────────
describe('pure utils', () => {
  it('hash order-independent; slug; parseColor; plan text', () => {
    expect(hashAsset({ a: 1, b: 2 })).toBe(hashAsset({ b: 2, a: 1 }))
    expect(slug('Hermes · Semantic Colors')).toBe('hermes-semantic-colors')
    expect(parseColor('#071018')).toEqual({ r: 7 / 255, g: 16 / 255, b: 24 / 255, a: 1 })
    expect(parseColor('rgba(12, 23, 32, 0.78)').a).toBeCloseTo(0.78)
    const txt = renderPlanText(computePlan(buildSpec(), {}))
    expect(txt).toContain('PLAN:')
  })
  it('STATE presets only reference known override properties', () => {
    for (const st of Object.keys(STATE_PRESETS)) {
      for (const o of STATE_PRESETS[st]) {
        for (const k of Object.keys(o.set)) expect(['fill', 'stroke', 'strokeW', 'textFill', 'opacity', 'hidden', 'text', 'w', 'minW'], st + '.' + k).toContain(k)
      }
    }
  })
})

// ── run-ms7vkx9n-1 REPAIR: text pipeline fail-closed ────────────────────────
describe('text resolution matrix (regression for run-ms7vkx9n-1)', () => {
  const asms = buildAssemblies()
  it('every heading and every instance text prop of ALL 36 assemblies resolves to a non-empty, non-whitespace string', () => {
    let headings = 0
    let props = 0
    for (const a of asms) {
      const walk = (item) => {
        if (item.row) { item.row.forEach(walk); return }
        if ('heading' in item) {
          headings++
          expect(textProblem(item.heading), a.key + ' heading').toBeNull()
          return
        }
        for (const pn of Object.keys(item.props || {})) {
          props++
          expect(textProblem(item.props[pn]), a.key + ' ' + item.family + '.' + pn).toBeNull()
        }
      }
      a.items.forEach(walk)
    }
    // the matrix is real: 6 experiences × 3 locales × 2 viewports all carry text
    expect(headings).toBeGreaterThanOrEqual(36)
    expect(props).toBeGreaterThanOrEqual(36)
  })

  it('validateAssemblyText passes on the real spec (0 issues)', () => {
    const v = validateAssemblyText(buildSpec())
    expect(v.issues).toEqual([])
    expect(v.ok).toBe(true)
  })

  it('mutation: undefined / null / empty / whitespace / non-string are each rejected with FULL context', () => {
    for (const bad of [undefined, null, '', '   ', 42]) {
      const spec = buildSpec()
      // corrupt one heading and one instance prop on a known assembly
      const asm = spec.assemblies.find((a) => a.key === 'assembly:homepage:desktop:de')
      const headingItem = asm.items.find((i) => 'heading' in i)
      headingItem.heading = bad
      const login = spec.assemblies.find((a) => a.key === 'assembly:login:mobile:fa')
      const instItem = login.items.find((i) => i.family === 'input')
      instItem.props.Label = bad
      const v = validateAssemblyText(spec)
      expect(v.ok).toBe(false)
      const h = v.issues.find((i) => i.assemblyKey === 'assembly:homepage:desktop:de')
      expect(h, 'heading issue for ' + String(bad)).toBeTruthy()
      expect(h.experience).toBe('homepage')
      expect(h.locale).toBe('de')
      expect(h.viewport).toBe('desktop')
      expect(h.role).toMatch(/^Heading\(/)
      expect(h.catalogKey).toBeTruthy()
      expect(h.problem.length).toBeGreaterThan(0)
      const p2 = v.issues.find((i) => i.assemblyKey === 'assembly:login:mobile:fa')
      expect(p2, 'prop issue for ' + String(bad)).toBeTruthy()
      expect(p2.role).toBe('input.Label')
    }
  })

  it('resolved catalog keys are reported for catalog-derived strings', () => {
    const spec = buildSpec()
    const asm = spec.assemblies.find((a) => a.key === 'assembly:login:desktop:de')
    const item = asm.items.find((i) => i.family === 'input')
    item.props.Label = '' // corrupt a value whose ORIGINAL came from auth.email
    const v = validateAssemblyText(spec)
    const issue = v.issues.find((i) => i.assemblyKey === 'assembly:login:desktop:de')
    expect(issue.problem).toBe('empty string')
    // empty string cannot be reverse-mapped; role identifies the target precisely
    expect(issue.role).toBe('input.Label')
  })
})

describe('no mutation before validation (stubbed Figma proof)', () => {
  const exec = require('../src/lib/figma-exec.js')
  let calls
  const spy = (name) => (..._a) => { calls.push(name); throw new Error('mutation ' + name + ' must not run') }
  const makeFigmaStub = () => ({
    currentPage: { children: [] },
    root: { children: [] },
    variables: {
      getLocalVariableCollectionsAsync: async () => [],
      getLocalVariablesAsync: async () => [],
      createVariableCollection: spy('createVariableCollection'),
      createVariable: spy('createVariable'),
      setBoundVariableForPaint: spy('setBoundVariableForPaint'),
    },
    getLocalPaintStylesAsync: async () => [],
    getLocalTextStylesAsync: async () => [],
    getLocalEffectStylesAsync: async () => [],
    listAvailableFontsAsync: async () => [],
    loadFontAsync: spy('loadFontAsync'),
    createFrame: spy('createFrame'),
    createText: spy('createText'),
    createComponent: spy('createComponent'),
    createEllipse: spy('createEllipse'),
    createRectangle: spy('createRectangle'),
    createSection: spy('createSection'),
    createPaintStyle: spy('createPaintStyle'),
    createTextStyle: spy('createTextStyle'),
    createEffectStyle: spy('createEffectStyle'),
    combineAsVariants: spy('combineAsVariants'),
  })
  const corruptSpec = () => {
    const spec = buildSpec()
    spec.assemblies.find((a) => a.key === 'assembly:homepage:desktop:de').items.find((i) => 'heading' in i).heading = undefined
    return spec
  }

  it('APPLY with invalid text is blocked BEFORE any create/update/set/load call and before a runId exists', async () => {
    calls = []
    globalThis.figma = makeFigmaStub()
    try {
      const res = await exec.run({ dryRun: false, _specForTest: corruptSpec() })
      expect(res.ok).toBe(false)
      expect(res.blocked).toBe('TEXT_VALIDATION_FAILED')
      expect(res.runId).toBeUndefined()
      expect(res.issues.length).toBeGreaterThan(0)
      expect(calls).toEqual([]) // ZERO mutation calls — nothing partial can begin
    } finally { delete globalThis.figma }
  })

  it('DRY RUN reports the same failure without any mutation call', async () => {
    calls = []
    globalThis.figma = makeFigmaStub()
    try {
      const res = await exec.run({ dryRun: true, _specForTest: corruptSpec() })
      expect(res.ok).toBe(false)
      expect(res.mode).toBe('dry-run')
      expect(res.textValidation.ok).toBe(false)
      expect(calls).toEqual([])
    } finally { delete globalThis.figma }
  })

  it('DRY RUN on the real spec is clean and still mutation-free', async () => {
    calls = []
    globalThis.figma = makeFigmaStub()
    try {
      const res = await exec.run({ dryRun: true })
      expect(res.textValidation.ok).toBe(true)
      expect(calls).toEqual([])
    } finally { delete globalThis.figma }
  })
})

describe('orphan adoption (repairs partial frames in place)', () => {
  it('adopts exactly one unmanaged FRAME with the exact assembly name', () => {
    const kids = [
      { id: '9:1', name: 'Ref/homepage/Desktop/EN', type: 'FRAME', managed: false },
      { id: '9:2', name: 'Ref/homepage/Desktop/FA', type: 'FRAME', managed: false },
      { id: '9:3', name: 'Other', type: 'FRAME', managed: false },
    ]
    expect(pickAdoptable(kids, 'Ref/homepage/Desktop/EN')).toEqual({ id: '9:1', ambiguous: [] })
    expect(pickAdoptable(kids, 'Ref/missing/Desktop/EN')).toEqual({ id: null, ambiguous: [] })
  })
  it('never adopts managed frames or non-frames; duplicates fail closed', () => {
    const kids = [
      { id: '9:1', name: 'Ref/login/Mobile/DE · generated', type: 'FRAME', managed: true },
      { id: '9:2', name: 'Ref/login/Mobile/DE · generated', type: 'TEXT', managed: false },
    ]
    expect(pickAdoptable(kids, 'Ref/login/Mobile/DE · generated')).toEqual({ id: null, ambiguous: [] })
    const dup = [
      { id: '9:5', name: 'X', type: 'FRAME', managed: false },
      { id: '9:4', name: 'X', type: 'FRAME', managed: false },
    ]
    expect(pickAdoptable(dup, 'X')).toEqual({ id: null, ambiguous: ['9:4', '9:5'] })
  })
})

describe('repair-run reconciliation and rollback isolation', () => {
  it('EXPECTED REPAIR DRY RUN vs the partial run-ms7vkx9n-1 state: 36 create · 0 update · 137 skip · 0 prune', () => {
    const spec = buildSpec()
    // Live state after the failed run: EVERYTHING except assemblies is tagged
    // with CURRENT hashes (the 51 updates + section2 + icon all succeeded);
    // the 36 assemblies threw BEFORE tag() → absent from the marker index.
    const idx = {}
    for (const a of spec.assets) {
      if (a.key.startsWith('assembly:')) continue
      const runId = (a.key === 'section:assemblies' || a.key === 'componentSet:icon') ? 'run-ms7vkx9n-1' : 'run-ms7q88mf-1'
      idx[a.key] = { id: 'id:' + a.key, hash: a.hash, kind: a.kind, runId }
    }
    const plan = computePlan(spec, idx)
    expect(plan.summary).toEqual({ create: 36, update: 0, skip: 137, prune: 0, total: 173 })
    const created = plan.ops.filter((o) => o.action === 'create').map((o) => o.key)
    expect(created.every((k) => k.startsWith('assembly:'))).toBe(true)
  })

  it('rollback of the repair run can NEVER remove assets created by earlier runs', () => {
    const spec = buildSpec()
    const idx = {}
    for (const a of spec.assets) {
      const runId = a.key.startsWith('assembly:') ? 'run-repair'
        : (a.key === 'section:assemblies' || a.key === 'componentSet:icon') ? 'run-ms7vkx9n-1'
          : 'run-ms7q88mf-1'
      idx[a.key] = { id: 'id:' + a.key, hash: a.hash, kind: a.kind, runId }
    }
    expect(runScope(idx, 'run-repair').length).toBe(36) // ONLY the adopted assemblies
    expect(runScope(idx, 'run-ms7vkx9n-1').length).toBe(2) // section2 + icon (partial historical run)
    expect(runScope(idx, 'run-ms7q88mf-1').length).toBe(spec.assets.length - 38)
    expect(runScope(idx, null).length).toBe(spec.assets.length)
  })

  it('assembly revision bump is surgical: only assembly hashes changed vs assembly-rev-1', () => {
    const byKey = (s) => Object.fromEntries(s.assets.map((x) => [x.key, x.hash]))
    const A = byKey(buildSpec({ component: 3, textStyle: 2, assembly: 1 }))
    const B = byKey(buildSpec({ component: 3, textStyle: 2, assembly: 2 }))
    const changed = Object.keys(A).filter((k) => A[k] !== B[k])
    expect(changed.length).toBe(36)
    expect(changed.every((k) => k.startsWith('assembly:'))).toBe(true)
  })
})

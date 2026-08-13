#!/usr/bin/env node
// @ts-check
/**
 * Phase 104 DNA policy tests.
 *
 * Plain `node:assert` + `node:test` so it runs with zero config and zero deps,
 * independently of the repository's vitest setup. These assert the DESIGN RULES,
 * not the implementation: the things that would silently rot if someone edited a
 * token without understanding why it was that value.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findInExecutableCode, checkSharedPluginDataCalls } from './lib/code-scan.mjs'

const require = createRequire(import.meta.url)
const { assertContract, checkContract, PLUGIN_IDENTITY } = require('../src/lib/contract.js')
const DNA = require('../src/lib/dna-tokens.js')
const { contrast } = require('../src/lib/contrast.js')
const { buildDnaSpec, SCOPES, canonicalStringify, hashAsset } = require('../src/lib/dna-spec.js')
const { FAMILIES, variantCombos, variantGeometry, assertVariantBudget, assertLocaleIsNeverAVariant } = require('../src/lib/dna-components.js')
const { STARTER_UNAVAILABLE } = require('../src/lib/dna-structure.js')

const LIGHTEST = DNA.BASE_SURFACES.surfaceInteractive
const TEXT_AA = 4.5
const UI_AA = 3.0
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

function loadDnaSpecFromSource(source) {
  const sourceRequire = createRequire(new URL('../src/lib/dna-spec.js', import.meta.url))
  const loadedModule = { exports: {} }
  Function('require', 'module', 'exports', source)(sourceRequire, loadedModule, loadedModule.exports)
  return loadedModule.exports
}

function scriptFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? scriptFiles(path) : [path]
  })
}

test('Node test entrypoints cannot collide with the repository Vitest glob', () => {
  const nodeTests = scriptFiles(SCRIPT_DIR)
    .filter((path) => /\.[cm]?js$/.test(path))
    .filter((path) => /from ['"]node:test['"]/.test(readFileSync(path, 'utf8')))
  const names = nodeTests.map((path) => basename(path)).sort()
  assert.deepEqual(names, [
    'code-scan.node-test.mjs',
    'runtime-contract.node-test.mjs',
    'test-dna.mjs',
  ])
  assert.deepEqual(names.filter((name) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name)), [],
    'node:test files must not be collected by the repository-wide Vitest runner')

  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  for (const name of names) assert.ok(pkg.scripts.test.includes('scripts/' + name), name + ' must run explicitly')
})

/** Values already shipped by the canonical Phase 87B layer. */
const CANONICAL = new Set([
  '#040a0f', '#071018', '#0c1720', '#11212c', '#152a36',
  '#16d9e3', '#8bf4f8', '#0795a5', '#3b82f6',
  '#edf7fa', '#a9bac6', '#708694', '#8496a6', '#495c68',
  '#203743', '#21c9d5',
  '#38d996', '#f5b942', '#f05d68', '#54a6ff', '#8b7cff',
])

test('every industrial state text passes WCAG AA on the lightest surface', () => {
  for (const s of DNA.INDUSTRIAL_STATES) {
    const r = contrast(s.text, LIGHTEST)
    assert.ok(r >= TEXT_AA, `${s.key} text ${s.text} = ${r.toFixed(2)}:1, need ${TEXT_AA}`)
  }
})

test('every industrial state indicator passes SC 1.4.11 non-text contrast', () => {
  for (const s of DNA.INDUSTRIAL_STATES) {
    const r = contrast(s.fill, LIGHTEST)
    assert.ok(r >= UI_AA, `${s.key} indicator ${s.fill} = ${r.toFixed(2)}:1, need ${UI_AA}`)
  }
})

test('UNKNOWN is separated from HEALTHY on all three channels', () => {
  const unknown = DNA.INDUSTRIAL_STATES.find((s) => s.key === 'unknown')
  const healthy = DNA.INDUSTRIAL_STATES.find((s) => s.key === 'healthy')
  assert.notEqual(unknown.fill, healthy.fill, 'hue must differ')
  assert.notEqual(unknown.glyph, healthy.glyph, 'glyph must differ')
  assert.notEqual(unknown.outline, healthy.outline, 'outline must differ')
})

test('severity ranks are unique, contiguous and ordered', () => {
  const ranks = DNA.INDUSTRIAL_STATES.map((s) => s.rank)
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'ranks must be listed in order')
  assert.equal(new Set(ranks).size, ranks.length, 'ranks must be unique')
  assert.deepEqual(ranks, ranks.map((_, i) => i), 'ranks must be contiguous from 0')
})

test('no industrial state depends on colour alone', () => {
  const seen = new Set()
  for (const s of DNA.INDUSTRIAL_STATES) {
    const cue = s.glyph + '|' + s.outline
    assert.ok(!seen.has(cue), `${s.key} reuses the non-colour cue "${cue}"`)
    seen.add(cue)
  }
})

test('an AI hypothesis never carries a verified look', () => {
  for (const r of DNA.REASONING_LADDER) {
    if (['hypothesis', 'rootCauseCandidate', 'simulationResult', 'missing'].includes(r.key)) {
      assert.equal(r.verifiedLook, false, `${r.key} must not look verified`)
      assert.equal(r.border, 'dashed', `${r.key} must carry a dashed border`)
    }
  }
})

test('every reasoning tier has a readable text partner', () => {
  for (const r of DNA.REASONING_LADDER) {
    const ratio = contrast(r.text, LIGHTEST)
    assert.ok(ratio >= TEXT_AA, `${r.key} text ${r.text} = ${ratio.toFixed(2)}:1`)
  }
})

test('every non-canonical value is justified in NEW_HUES', () => {
  const justified = new Set(DNA.NEW_HUES.map((h) => h.value.toLowerCase()))
  const collect = []
  for (const s of DNA.INDUSTRIAL_STATES) collect.push([s.key + '.fill', s.fill], [s.key + '.text', s.text])
  for (const r of DNA.REASONING_LADDER) collect.push([r.key + '.color', r.color], [r.key + '.text', r.text])
  for (const [label, v] of collect) {
    const lv = String(v).toLowerCase()
    assert.ok(CANONICAL.has(lv) || justified.has(lv), `${label} = ${v} is neither canonical nor justified in NEW_HUES`)
  }
})

test('the shipped glass lift ladder is preserved exactly', () => {
  // components.test.ts:154-165 pins soft(-2) < card(-3) < elevated(-5) < interactive(-6) < hero(-8)
  const byTier = Object.fromEntries(DNA.GLASS.tiers.map((t) => [t.tier, t.lift]))
  assert.equal(byTier.soft, -2)
  assert.equal(byTier.card, -3)
  assert.equal(byTier.elevated, -5)
  assert.equal(byTier.interactive, -6)
  assert.equal(byTier.hero, -8)
  assert.equal(DNA.GLASS.interactiveScale, 1.012, 'scale is pinned to exactly 1.012')
})

test('glass fill alpha never drops below the Horizon legibility floor', () => {
  for (const t of DNA.GLASS.tiers) {
    if (t.tier === 'soft') continue // soft is app-only, never over Horizon
    const alpha = Number(String(t.fill).match(/,\s*([\d.]+)\s*\)$/)[1])
    assert.ok(alpha >= DNA.GLASS.minFillAlphaOverHorizon,
      `${t.tier} alpha ${alpha} < floor ${DNA.GLASS.minFillAlphaOverHorizon}`)
  }
})

test('Horizon is forbidden on every dense-data surface', () => {
  const overlap = DNA.HORIZON_PERMITTED_SURFACES.filter((s) => DNA.HORIZON_FORBIDDEN_SURFACES.includes(s))
  assert.deepEqual(overlap, [], 'a surface cannot be both permitted and forbidden')
  for (const s of ['command-center', 'industrial-brain', 'live-operations', 'alarm-center']) {
    assert.ok(DNA.HORIZON_FORBIDDEN_SURFACES.includes(s), `${s} must forbid Horizon`)
  }
  assert.equal(DNA.HORIZON.vignetteRequired, true)
  assert.ok(DNA.HORIZON.emberBandMaxHeightRatio <= 0.25, 'the warm band must stay a band, not a wash')
})

test('edge illumination never becomes a glow', () => {
  assert.equal(DNA.EDGE.illumination.outerGlowPermitted, false)
  assert.ok(/rgba\(139, 244, 248, 0\.00\)$/.test(DNA.EDGE.illumination.to), 'must fade fully to transparent')
})

test('motion stays inside the restrained band and honours reduced-motion', () => {
  for (const c of DNA.MOTION.choreography) {
    assert.ok(c.duration >= 120 && c.duration <= 240, `${c.key} ${c.duration}ms outside the 120-240ms band`)
  }
  assert.equal(DNA.MOTION.reducedMotion.respected, true)
  assert.equal(DNA.MOTION.reducedMotion.maxDuration, 0)
  for (const banned of ['float', 'parallax', 'bounce', 'ripple']) {
    assert.ok(DNA.MOTION.prohibited.includes(banned), `${banned} must be prohibited`)
  }
})

test('every interactive target meets WCAG 2.2 SC 2.5.8', () => {
  assert.ok(DNA.MIN_TARGET_PX >= 24, 'SC 2.5.8 minimum is 24px; Hermes targets 44')
  assert.ok(DNA.RAIL.itemSize >= DNA.MIN_TARGET_PX)
  assert.ok(DNA.COMMAND.height >= DNA.MIN_TARGET_PX)
  assert.ok(DNA.COMMAND.heightMobile >= DNA.MIN_TARGET_PX)
})

test('the Triad is exactly three, with three distinct intents', () => {
  assert.equal(DNA.TRIAD.count, 3)
  assert.equal(DNA.TRIAD.intents.length, 3)
  assert.equal(new Set(DNA.TRIAD.intents.map((i) => i.key)).size, 3)
})

// ── spec-builder invariants ────────────────────────────────────────────────

test('the spec is deterministic across builds', () => {
  const a = buildDnaSpec()
  const b = buildDnaSpec()
  assert.deepEqual(a.counts, b.counts)
  assert.deepEqual(a.assets.map((x) => x.key + ':' + x.hash), b.assets.map((x) => x.key + ':' + x.hash))
})

test('Variable descriptions survive Figma leading-whitespace normalisation byte-for-byte', () => {
  const source = readFileSync(new URL('../src/lib/dna-spec.js', import.meta.url), 'utf8')
  const filterGate = '    .filter(Boolean)\n    .join(\' · \')'
  assert.equal(source.split(filterGate).length - 1, 1,
    'canonical descriptions must own exactly one empty-fragment filter')

  const invalid = (spec) => spec.variables
    .filter((variable) => variable.description !== variable.description.trimStart())
    .map((variable) => variable.name)
    .sort()

  const mutant = loadDnaSpecFromSource(source.replace(filterGate,
    '    .filter(() => true)\n    .join(\' · \')'))
  assert.deepEqual(invalid(mutant.buildDnaSpec()), [
    'Command/width mobile',
    'Command/width tablet',
    'Motion/choreography/alarmAcknowledge',
    'Motion/choreography/panelTransition',
    'Motion/choreography/progressiveDisclosure',
    'Motion/choreography/workspaceNavigation',
    'Triad/card height',
    'Triad/card width',
    'Triad/gap',
  ], 'removing canonical empty-fragment filtering must reproduce all nine Figma description drifts')

  const fixed = buildDnaSpec()
  assert.deepEqual(invalid(fixed), [])
  const byName = Object.fromEntries(fixed.variables.map((variable) => [variable.name, variable.description]))
  assert.equal(byName['Command/width tablet'], 'Managed by Hermes Phase 104 Visual System')
  assert.equal(byName['Motion/choreography/panelTransition'],
    'easing: standard · Managed by Hermes Phase 104 Visual System')
})

test('canonical asset identity is recursively order-independent', () => {
  const a = { key: 'component', axes: { State: ['Default', 'Focus'], Breakpoint: ['Desktop'] } }
  const b = { axes: { Breakpoint: ['Desktop'], State: ['Default', 'Focus'] }, key: 'component' }
  assert.equal(canonicalStringify(a), canonicalStringify(b))
  assert.equal(hashAsset(a), hashAsset(b))
})

test('nested component identity changes cannot collide with the previous hash', () => {
  const base = {
    key: 'componentSet:button',
    axes: { State: ['Default', 'Focus'] },
    text: [{ name: 'Label', default: { en: 'Start', fa: 'شروع', de: 'Starten' } }],
    geometry: { padding: { x: 16, y: 10 } },
  }
  const mutations = [
    { ...base, axes: { State: ['Default', 'Focus', 'Disabled'] } },
    { ...base, text: [{ ...base.text[0], default: { ...base.text[0].default, de: 'Los' } }] },
    { ...base, geometry: { padding: { ...base.geometry.padding, x: 20 } } },
  ]
  for (const mutation of mutations) assert.notEqual(hashAsset(mutation), hashAsset(base))
})

test('every asset key is unique', () => {
  const spec = buildDnaSpec()
  const keys = spec.assets.map((a) => a.key)
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
  assert.deepEqual([...new Set(dupes)], [], 'duplicate asset keys would overwrite each other on Apply')
})

test('no variable is left on ALL_SCOPES', () => {
  const spec = buildDnaSpec()
  const all = new Set(Object.values(SCOPES).flat())
  for (const v of spec.variables) {
    assert.ok(Array.isArray(v.scopes) && v.scopes.length > 0, `${v.name} has no scopes`)
    for (const s of v.scopes) assert.ok(all.has(s), `${v.name} has unknown scope ${s}`)
  }
})

test('every collection declares exactly one mode (Starter-plan limit)', () => {
  const spec = buildDnaSpec()
  for (const c of spec.collections) {
    assert.equal(c.modeName, 'Value', `${c.name} must use the single Value mode`)
  }
})

test('variables that map to a shipped CSS var carry var()-wrapped WEB code syntax', () => {
  const spec = buildDnaSpec()
  for (const v of spec.variables) {
    const web = v.codeSyntax && v.codeSyntax.WEB
    if (web) assert.ok(/^var\(--[a-z0-9-]+\)$/.test(web), `${v.name} WEB syntax "${web}" must be var()-wrapped`)
  }
})

test('the spec produces a non-trivial asset set', () => {
  const spec = buildDnaSpec()
  assert.ok(spec.counts.collections >= 6)
  assert.ok(spec.counts.variables >= 80)
  assert.ok(spec.counts.paintStyles >= 40)
  assert.equal(spec.counts.effectStyles, 4)
})

test('Dry Run never promises anything Apply cannot deliver', () => {
  // Anything declared in `assets` MUST be something the executor can create.
  const spec = buildDnaSpec()
  const appliableKinds = new Set(['page', 'section', 'collection', 'variable', 'paintStyle', 'effectStyle', 'componentSet'])
  for (const a of spec.assets) {
    assert.ok(appliableKinds.has(a.kind), `asset kind "${a.kind}" (${a.name}) is in the apply list but the executor cannot create it`)
  }
  assert.equal(spec.assets.length, spec.counts.appliableTotal)
  for (const d of spec.docs) assert.equal(d.appliable, false)
})

// ── owner-directed file structure ──────────────────────────────────────────

test('the file is exactly three pages, with the owner-directed names', () => {
  const spec = buildDnaSpec()
  assert.equal(spec.pages.length, 3, 'the Starter plan caps a file at 3 pages')
  assert.deepEqual(spec.pages.map((p) => p.name), [
    '01 — Foundations & Components',
    '02 — Hermes Product Screens',
    '03 — Responsive, Prototypes & Handoff',
  ])
})

test('no taxonomy category was dropped to fit the page cap', () => {
  const spec = buildDnaSpec()
  // 23 sections, numbered 00..22 with no gaps — the cap costs organisation, never coverage.
  assert.equal(spec.sections.length, 23)
  const numbers = spec.sections.map((s) => Number(s.name.slice(0, 2)))
  assert.deepEqual(numbers, numbers.map((_, i) => i), 'section numbers must be contiguous 00..22')
})

test('the approved-references section exists and is left empty for the owner', () => {
  const spec = buildDnaSpec()
  const s = spec.sections.find((x) => x.name === '00 — Approved Visual References')
  assert.ok(s, 'the approved mockups need a home before they arrive')
  assert.equal(s.awaitingOwnerAssets, true,
    'this section must be flagged as awaiting real owner assets so nothing invented is ever placed in it')
})

test('Phase 101–103 section names match the merged product phases', () => {
  const spec = buildDnaSpec()
  assert.deepEqual(spec.sections.filter((x) => /^1[5-7]/.test(x.name)).map((x) => x.name), [
    '15 — Phase 101 Industrial Engineering',
    '16 — Phase 102 Media & Video Hub',
    '17 — Phase 103 Live Voice Intelligence',
  ])
  assert.deepEqual(spec.sections.filter((x) => x.speculative), [],
    'merged Phase 101–103 product areas must not be labelled speculative')
})

// ── the anti-duplication contract ──────────────────────────────────────────

test('locale is a TEXT property and never a variant axis', () => {
  assert.equal(assertLocaleIsNeverAVariant(), true)
})

test('the locale guard matches exactly, and does not false-positive on real axes', () => {
  // "Intent" contains "en"; a substring test would wrongly reject it.
  const spec = buildDnaSpec()
  const button = spec.componentSets.find((c) => c.name === 'Hermes/Button')
  assert.ok(Object.keys(button.axes).includes('Intent'), 'Intent is a legitimate axis and must survive the guard')
})

test('no component set exceeds the 30-variant budget', () => {
  assert.equal(assertVariantBudget(30), true)
  const spec = buildDnaSpec()
  for (const cs of spec.componentSets) {
    assert.ok(cs.variantCount <= 30, `${cs.name} has ${cs.variantCount} variants`)
  }
})

test('direction is a variant only where layout actually mirrors', () => {
  const spec = buildDnaSpec()
  const withDirection = spec.componentSets.filter((c) => Object.keys(c.axes).includes('Direction')).map((c) => c.name)
  // Leaf components inherit direction from their auto-layout parent, so only
  // layout-bearing families may carry the axis. Anything else is duplication.
  assert.deepEqual(withDirection.sort(), [
    'Hermes/Breadcrumb', 'Hermes/Shell', 'Hermes/Telemetry Row',
  ].sort())
})

test('every breakpoint the phase must cover is represented', () => {
  const spec = buildDnaSpec()
  const bpSets = spec.componentSets.filter((c) => c.axes.Breakpoint)
  assert.ok(bpSets.length >= 8, 'breakpoint coverage must not be reduced')
  for (const cs of bpSets) {
    assert.deepEqual(cs.axes.Breakpoint, ['Desktop', 'Tablet', 'Mobile'], `${cs.name} must cover 1440/768/390`)
  }
})

test('every Breakpoint axis changes concrete component geometry', () => {
  for (const family of FAMILIES.filter((item) => item.axes.Breakpoint)) {
    const widths = family.axes.Breakpoint.map((breakpoint) =>
      variantGeometry(family.key, { Breakpoint: breakpoint, State: family.axes.State ? family.axes.State[0] : '' }).width)
    assert.ok(new Set(widths).size >= 2, `${family.name} declares Breakpoint but does not materially resize`)
  }
  assert.deepEqual(['Desktop', 'Tablet', 'Mobile'].map((Breakpoint) =>
    variantGeometry('command', { Breakpoint }).width), [720, 640, 342])
})

test('every instance-swap declaration targets a real component family', () => {
  const keys = new Set(FAMILIES.map((family) => family.key))
  for (const family of FAMILIES) {
    for (const swap of (family.swaps || [])) {
      assert.ok(swap.name && keys.has(swap.target), `${family.name} has an unresolved swap target`)
    }
  }
})

test('every locale-bearing component exposes tri-lingual defaults', () => {
  const spec = buildDnaSpec()
  for (const cs of spec.componentSets) {
    for (const t of cs.text) {
      for (const loc of ['en', 'fa', 'de']) {
        assert.ok(Object.prototype.hasOwnProperty.call(t.default, loc),
          `${cs.name} property "${t.name}" is missing a ${loc} default`)
      }
    }
  }
})

test('the ten industrial states and nine reasoning tiers are all reachable as variants', () => {
  const spec = buildDnaSpec()
  const state = spec.componentSets.find((c) => c.name === 'Hermes/Industrial State')
  assert.equal(state.axes.Status.length, 10)
  const chip = spec.componentSets.find((c) => c.name === 'Hermes/Reasoning Chip')
  assert.equal(chip.axes.Tier.length, 9)
})

test('Starter capabilities that do not exist are never claimed', () => {
  const codes = STARTER_UNAVAILABLE.map((s) => s.code)
  for (const c of ['NO_MODES', 'NO_LIBRARY_PUBLISH', 'MAX_3_PAGES']) {
    assert.ok(codes.includes(c), `${c} must be declared unavailable`)
  }
  for (const s of STARTER_UNAVAILABLE) {
    assert.ok(s.substitute && s.substitute.length > 20, `${s.code} must state what is used instead`)
  }
})

// ── contract + build-integrity gates ───────────────────────────────────────
// These exist because a Dry Run was once run against the Phase 87 builder by
// mistake (173 assets, 8 text styles, 36 assemblies) and the numbers looked
// plausible enough to be believed.

test('the spec satisfies the Phase 104 asset contract exactly', () => {
  const spec = buildDnaSpec()
  assert.equal(assertContract(spec.counts, 'test'), true)
})

test('the contract fails closed on the Phase 87 fingerprint', () => {
  // The exact shape the owner saw in the wrong Dry Run.
  const phase87 = {
    collections: 4, variables: 46, paintStyles: 29, textStyles: 8, effectStyles: 4,
    families: 44, components: 352, assemblies: 36, sections: 2, total: 173,
  }
  const r = checkContract(phase87)
  assert.equal(r.ok, false)
  assert.ok(r.absent.some((a) => a.startsWith('textStyles=8')), 'must name textStyles as a Phase 87 kind')
  assert.ok(r.absent.some((a) => a.startsWith('assemblies=36')), 'must name assemblies as a Phase 87 kind')
  assert.throws(() => assertContract(phase87, 'test'), /WRONG PLUGIN DETECTED/)
})

test('the contract fails closed on any single count drifting', () => {
  const spec = buildDnaSpec()
  for (const key of ['pages', 'sections', 'collections', 'variables', 'componentSets', 'componentVariants', 'appliableTotal']) {
    const drifted = { ...spec.counts, [key]: spec.counts[key] + 1 }
    assert.throws(() => assertContract(drifted, 'test'), new RegExp(key),
      `a drift in ${key} must abort the run`)
  }
})

test('the built bundle carries a fingerprint and matches its report', () => {
  const code = readFileSync(new URL('../dist/code.js', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../dist/ui.html', import.meta.url), 'utf8')
  const report = JSON.parse(readFileSync(new URL('../dist/build-report.json', import.meta.url), 'utf8'))

  assert.ok(code.includes('__modules["fingerprint"]'), 'the bundle must carry the injected fingerprint module')
  assert.ok(!ui.includes('__BUILD_FINGERPRINT__'), 'the UI placeholder must be substituted at build time')
  assert.ok(ui.includes('data-fingerprint='), 'the UI must render a fingerprint')

  assert.equal(createHash('sha256').update(code).digest('hex'), report.sha256.code, 'dist/code.js does not match its build report — rebuild')
  assert.equal(createHash('sha256').update(ui).digest('hex'), report.sha256.ui, 'dist/ui.html does not match its build report — rebuild')
  assert.equal(report.contract, 'PASS')
  assert.equal(report.pluginId, 'com.hermesnovin.phase104-visual-system')
})

test('the bundle physically cannot create Phase 87 asset kinds', () => {
  const code = readFileSync(new URL('../dist/code.js', import.meta.url), 'utf8')
  // Comments are documentation, not executable capability. Strings and regular
  // expressions remain executable data and are therefore still detected.
  assert.deepEqual(findInExecutableCode(code, 'createTextStyle'), [], 'Phase 104 creates no text styles')
  assert.deepEqual(findInExecutableCode(code, 'buildAssemblies'), [], 'Phase 104 creates no reference assemblies')
  assert.deepEqual(findInExecutableCode(code, 'hermesDSB'), [], 'Phase 104 must never touch the Phase 87 namespace')
  assert.deepEqual(checkSharedPluginDataCalls(code), [], 'all shared-plugin-data calls must use NAMESPACE directly')
})

test('the manifest points at the freshly built bundle and matches the contract identity', () => {
  const manifestRaw = readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')
  const manifest = JSON.parse(manifestRaw)
  const report = JSON.parse(readFileSync(new URL('../dist/build-report.json', import.meta.url), 'utf8'))
  assert.equal(manifest.name, PLUGIN_IDENTITY.name)
  assert.equal(manifest.id, PLUGIN_IDENTITY.id)
  assert.equal(manifest.main, 'dist/code.js')
  assert.equal(manifest.ui, 'dist/ui.html')
  assert.equal(createHash('sha256').update(manifestRaw).digest('hex'), report.sha256.manifest)
})

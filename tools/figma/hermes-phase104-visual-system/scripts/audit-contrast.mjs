#!/usr/bin/env node
// @ts-check
/**
 * Phase 104 DNA accessibility audit.
 *
 * Computes real WCAG 2.2 ratios for every Hermes Design DNA colour decision and
 * prints a verdict table. Exits non-zero on any FAIL so it can gate CI.
 *
 * Thresholds:
 *   - state/reasoning TEXT              >= 4.5:1  (SC 1.4.3, normal text)
 *   - state indicators & borders (UI)   >= 3.0:1  (SC 1.4.11 non-text contrast)
 *   - body text over every Glass tier   >= 4.5:1  where the tier is composited
 *                                        over the WORST-CASE backdrop it can sit on
 */

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const { contrast, composite, r2 } = require('../src/lib/contrast.js')
const DNA = require('../src/lib/dna-tokens.js')

const TEXT_AA = 4.5
const UI_AA = 3.0

/**
 * Every colour value already shipped by the canonical Phase 87B layer
 * (src/app/globals.css + src/components/ds/token-contract.ts). A DNA value that
 * appears here is an ALIAS, not a new hue, and needs no NEW_HUES justification.
 */
const CANONICAL_VALUES = new Set([
  '#040a0f', '#071018', '#0c1720', '#11212c', '#152a36',
  '#16d9e3', '#8bf4f8', '#0795a5', '#3b82f6',
  '#edf7fa', '#a9bac6', '#708694', '#8496a6', '#495c68',
  '#203743', '#21c9d5',
  '#38d996', '#f5b942', '#f05d68', '#54a6ff',
  '#8b7cff',
])

let failures = 0
const rows = []

/** @param {string} group @param {string} item @param {number} ratio @param {number} need @param {string} against */
function check(group, item, ratio, need, against) {
  const pass = ratio >= need
  if (!pass) failures++
  rows.push({ group, item, against, ratio: r2(ratio), need, verdict: pass ? 'PASS' : 'FAIL' })
  return pass
}

// The lightest canonical surface is the worst case for a light-on-dark system.
const LIGHTEST = DNA.BASE_SURFACES.surfaceInteractive // #152A36
const BASE = DNA.BASE_SURFACES.backgroundBase // #071018

console.log('\n=== HERMES DESIGN DNA — CONTRAST AUDIT ===')
console.log('worst-case surface: ' + LIGHTEST + '  (--color-surface-interactive)\n')

// ── 1. Industrial state ladder ──────────────────────────────────────────────
for (const s of DNA.INDUSTRIAL_STATES) {
  check('state.text', s.key, contrast(s.text, LIGHTEST), TEXT_AA, LIGHTEST)
  check('state.indicator', s.key, contrast(s.fill, LIGHTEST), UI_AA, LIGHTEST)
}

// ── 2. Reasoning ladder ─────────────────────────────────────────────────────
for (const r of DNA.REASONING_LADDER) {
  check('reasoning.text', r.key, contrast(r.text, LIGHTEST), TEXT_AA, LIGHTEST)
  check('reasoning.indicator', r.key, contrast(r.color, LIGHTEST), UI_AA, LIGHTEST)
}

// ── 3. Glass tiers: does primary text survive on each tier? ─────────────────
// Worst case for a translucent tier is the LIGHTEST thing it can be composited
// over. On Horizon that is the ember core; in-app it is surface-interactive.
const TEXT_PRIMARY = '#EDF7FA'
const TEXT_SECONDARY = '#A9BAC6'
const TEXT_MUTED = '#708694'
const HORIZON_WORST = '#6B3A22' // Horizon Ember Core — the lightest Horizon stop

for (const t of DNA.GLASS.tiers) {
  const overApp = composite(t.fill, LIGHTEST)
  const overHorizon = composite(t.fill, HORIZON_WORST)
  check('glass.textPrimary/app', t.tier, contrast(TEXT_PRIMARY, overApp), TEXT_AA, overApp)
  check('glass.textPrimary/horizon', t.tier, contrast(TEXT_PRIMARY, overHorizon), TEXT_AA, overHorizon)
  check('glass.textSecondary/app', t.tier, contrast(TEXT_SECONDARY, overApp), TEXT_AA, overApp)
  check('glass.edge/app', t.tier, contrast(composite(t.border, overApp), overApp), 1.0, overApp)
}

// ── 4. Beacon on the surfaces it lands on ───────────────────────────────────
check('beacon.core', 'on base', contrast(DNA.BEACON.core.value, BASE), UI_AA, BASE)
check('beacon.core', 'on lightest', contrast(DNA.BEACON.core.value, LIGHTEST), UI_AA, LIGHTEST)
check('beacon.onBeacon', 'dark-on-cyan', contrast(DNA.BEACON.onBeacon.value, DNA.BEACON.core.value), TEXT_AA, DNA.BEACON.core.value)

// ── 5. Edge tokens as non-text UI boundaries ────────────────────────────────
check('edge.active', 'on base', contrast(DNA.EDGE.active.value, BASE), UI_AA, BASE)
check('edge.hairline', 'composited on base', contrast(composite(DNA.EDGE.hairline.value, BASE), BASE), 1.0, BASE)

// ── 6. Muted text is NOT allowed to be sold as body text on light surfaces ──
const mutedOnLightest = contrast(TEXT_MUTED, LIGHTEST)
rows.push({
  group: 'guard', item: 'text-muted is metadata-only', against: LIGHTEST,
  ratio: r2(mutedOnLightest), need: TEXT_AA,
  verdict: mutedOnLightest >= TEXT_AA ? 'PASS(unexpected)' : 'EXPECTED-FAIL',
})

// ── report ──────────────────────────────────────────────────────────────────
const w = (s, n) => String(s).padEnd(n)
console.log(w('GROUP', 30) + w('ITEM', 24) + w('RATIO', 9) + w('NEED', 7) + 'VERDICT')
console.log('-'.repeat(80))
for (const r of rows) {
  console.log(w(r.group, 30) + w(r.item, 24) + w(r.ratio + ':1', 9) + w(r.need + ':1', 7) + r.verdict)
}
console.log('-'.repeat(80))
console.log('checks: ' + rows.length + '   failures: ' + failures)

// New-hue justification completeness
const undocumented = []
for (const s of DNA.INDUSTRIAL_STATES) {
  for (const v of [s.fill, s.text]) {
    const isAlias = DNA.INDUSTRIAL_STATES.some((x) => x.alias && x.fill === v)
    const known = DNA.NEW_HUES.some((h) => h.value.toLowerCase() === String(v).toLowerCase())
    const canonical = Object.values(DNA.BASE_SURFACES).includes(v)
    if (!known && !canonical && !isAlias && !CANONICAL_VALUES.has(String(v).toLowerCase())) undocumented.push(s.key + ':' + v)
  }
}
if (undocumented.length) {
  console.log('\nUNDOCUMENTED VALUES (must be in NEW_HUES or alias a canonical token):')
  for (const u of undocumented) console.log('  - ' + u)
  failures += undocumented.length
}

process.exit(failures > 0 ? 1 : 0)

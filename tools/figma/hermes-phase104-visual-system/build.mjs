// Build + package the Hermes Phase 104 Visual System plugin.
//
// The Figma plugin sandbox loads a single classic script (no ES modules), so this
// bundles the CommonJS source modules into one self-contained dist/code.js using a
// tiny inlined CommonJS runtime. With --dry-run it also executes the PURE spec in
// Node (no `figma`) and prints exactly what an in-Figma Dry Run would enumerate.
//
// THREE BUILD-TIME GATES, all fail-closed:
//   1. manifest identity must match contract.PLUGIN_IDENTITY
//   2. the computed spec must satisfy contract.EXPECTED exactly
//   3. a visible BUILD FINGERPRINT (git HEAD + source hash) is injected into the
//      bundle and the UI, so it is impossible to run a plugin without knowing
//      precisely which build it is.
//
// Uses only Node built-ins — no third-party bundler, no new dependencies.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { findInExecutableCode, checkSharedPluginDataCalls } from './scripts/lib/code-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const SRC = join(__dirname, 'src')
const DIST = join(__dirname, 'dist')

const MODULES = [
  ['contrast', 'lib/contrast.js'],
  ['contract', 'lib/contract.js'],
  ['dna-tokens', 'lib/dna-tokens.js'],
  ['dna-structure', 'lib/dna-structure.js'],
  ['dna-components', 'lib/dna-components.js'],
  ['dna-spec', 'lib/dna-spec.js'],
  ['dna-exec', 'lib/dna-exec.js'],
  ['main', 'main.js'],
]

// These are every file whose bytes can affect the packaged plugin or the gates
// that decide whether packaging is allowed. Generated dist/ files are excluded:
// a packaging-only commit must rebuild to the exact same bytes and fingerprint.
const BUILD_INPUT_FILES = [
  'build.mjs',
  'manifest.json',
  'scripts/lib/code-scan.mjs',
  'src/ui.html',
  ...MODULES.map(([, rel]) => 'src/' + rel),
]

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const short = (s) => s.slice(0, 12)
const FORBIDDEN_EXECUTABLE_TOKENS = ['createTextStyle', 'buildAssemblies', 'hermesDSB']

function assertExecutableSafety(sources) {
  const failures = []
  for (const source of sources) {
    for (const needle of FORBIDDEN_EXECUTABLE_TOKENS) {
      for (const hit of findInExecutableCode(source.body, needle)) {
        failures.push(source.rel + ':' + hit.line + ' executable token ' + needle)
      }
    }
    for (const violation of checkSharedPluginDataCalls(source.body)) {
      failures.push(source.rel + ':' + violation.line + ' ' + violation.method +
        ' first argument must be NAMESPACE, got ' + violation.argument)
    }
  }
  if (failures.length) {
    console.error('BUILD FAILED — executable-code safety gate rejected the source:')
    for (const failure of failures) console.error('  - ' + failure)
    process.exit(1)
  }
}

function rewriteRequires(body) {
  return body.replace(/require\(\s*['"](?:\.{1,2}\/)+(?:lib\/)?([\w-]+)(?:\.js)?['"]\s*\)/g, "require('$1')")
}

function git(args, fallback) {
  try { return execFileSync('git', args, { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch (e) { return fallback }
}

function buildFingerprint(inputs) {
  // A generated-dist commit cannot contain its own SHA. Pin the latest commit
  // that touched an actual build input instead, so a packaging-only commit is
  // byte-for-byte reproducible and still identifies the exact executable source.
  const headSha = git(['log', '-1', '--format=%H', '--', ...BUILD_INPUT_FILES], 'UNKNOWN')
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], 'UNKNOWN')
  const status = git(['status', '--porcelain', '--untracked-files=all', '--', ...BUILD_INPUT_FILES], '')
  const dirty = status.length > 0
  const sourcesSha = sha256(inputs.map((input) => input.file + ':' + sha256(input.body)).join('\n'))
  return {
    plugin: 'Hermes Phase 104 Visual System',
    pluginId: 'com.hermesnovin.phase104-visual-system',
    headSha,
    headShaShort: short(headSha),
    branch,
    dirty,
    sourcesSha,
    sourcesShaShort: short(sourcesSha),
  }
}

function bundle(sources, fingerprint, counts) {
  const parts = []
  parts.push('/* Hermes Phase 104 Visual System — generated bundle.')
  parts.push('   Do not edit dist/ by hand; edit src/ and run `npm run build`.')
  parts.push('   HEAD ' + fingerprint.headSha + (fingerprint.dirty ? ' (dirty)' : '') + '  sources ' + fingerprint.sourcesSha + ' */')
  parts.push('(function () {')
  parts.push('  "use strict";')
  parts.push('  var __modules = {}, __cache = {};')
  parts.push('  function require(id) {')
  parts.push('    if (__cache[id]) return __cache[id].exports;')
  parts.push('    var m = { exports: {} }; __cache[id] = m;')
  parts.push('    __modules[id](m, m.exports, require);')
  parts.push('    return m.exports;')
  parts.push('  }')
  // synthetic module: the fingerprint, baked in at build time
  parts.push('  __modules["fingerprint"] = function (module, exports, require) {')
  parts.push('    module.exports = ' + JSON.stringify({ ...fingerprint, buildCounts: counts }, null, 2))
  parts.push('  };')
  for (const s of sources) {
    parts.push(`  __modules[${JSON.stringify(s.id)}] = function (module, exports, require) {`)
    parts.push(rewriteRequires(s.body))
    parts.push('  };')
  }
  parts.push("  require('main');")
  parts.push('})();')
  parts.push('')
  return parts.join('\n')
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  mkdirSync(DIST, { recursive: true })

  const sources = MODULES.map(([id, rel]) => ({ id, rel, body: readFileSync(join(SRC, rel), 'utf8') }))
  const inputs = BUILD_INPUT_FILES.map((file) => ({ file, body: readFileSync(join(__dirname, file), 'utf8') }))

  // ── GATE 1: manifest identity ────────────────────────────────────────────
  const { PLUGIN_IDENTITY, assertContract } = require('./src/lib/contract.js')
  const manifestRaw = readFileSync(join(__dirname, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestRaw)
  if (manifest.name !== PLUGIN_IDENTITY.name || manifest.id !== PLUGIN_IDENTITY.id) {
    console.error('BUILD FAILED — manifest identity does not match the contract.')
    console.error('  manifest.json : ' + manifest.name + ' / ' + manifest.id)
    console.error('  contract.js   : ' + PLUGIN_IDENTITY.name + ' / ' + PLUGIN_IDENTITY.id)
    process.exit(1)
  }
  if (manifest.main !== 'dist/code.js' || manifest.ui !== 'dist/ui.html') {
    console.error('BUILD FAILED — manifest must point at dist/code.js and dist/ui.html.')
    process.exit(1)
  }

  // ── GATE 2: asset contract ───────────────────────────────────────────────
  const { buildDnaSpec } = require('./src/lib/dna-spec.js')
  const spec = buildDnaSpec()
  assertContract(spec.counts, 'build') // throws, fail-closed
  assertExecutableSafety(sources)

  // ── GATE 3: fingerprint ──────────────────────────────────────────────────
  const fingerprint = buildFingerprint(inputs)
  const code = bundle(sources, fingerprint, spec.counts)
  writeFileSync(join(DIST, 'code.js'), code, 'utf8')

  // UI carries the fingerprint as a data attribute the panel renders verbatim.
  const uiSrc = readFileSync(join(SRC, 'ui.html'), 'utf8')
  const ui = uiSrc.replace('__BUILD_FINGERPRINT__', JSON.stringify({
    headShaShort: fingerprint.headShaShort,
    headSha: fingerprint.headSha,
    branch: fingerprint.branch,
    dirty: fingerprint.dirty,
    sourcesShaShort: fingerprint.sourcesShaShort,
    sourcesSha: fingerprint.sourcesSha,
    plugin: fingerprint.plugin,
    pluginId: fingerprint.pluginId,
    expectedTotal: spec.counts.appliableTotal,
  }).replace(/"/g, '&quot;'))
  writeFileSync(join(DIST, 'ui.html'), ui, 'utf8')

  const bundleSha = sha256(readFileSync(join(DIST, 'code.js')))
  const uiSha = sha256(readFileSync(join(DIST, 'ui.html')))
  const manifestSha = sha256(manifestRaw)

  const report = {
    plugin: fingerprint.plugin,
    pluginId: fingerprint.pluginId,
    fingerprint,
    manifestPath: 'manifest.json',
    sha256: { manifest: manifestSha, code: bundleSha, ui: uiSha },
    builtFrom: inputs.map((input) => ({ file: input.file, sha256: sha256(input.body) })),
    sourceCommitSemantics: 'Latest commit touching a build input; generated dist-only commits do not change it.',
    counts: spec.counts,
    contract: 'PASS',
    starterConstraints: {
      maxPagesPerFile: 3,
      maxModesPerCollection: 1,
      libraryPublishing: false,
      note: 'Proven by direct probe. All 23 taxonomy categories are carried as Sections; theme/breakpoint modes are impossible and are expressed as component variants.',
    },
  }
  writeFileSync(join(DIST, 'build-report.json'), JSON.stringify(report, null, 2), 'utf8')

  console.log('BUILD OK — ' + fingerprint.plugin)
  console.log('  id           : ' + fingerprint.pluginId)
  console.log('  branch/HEAD  : ' + fingerprint.branch + ' @ ' + fingerprint.headShaShort + (fingerprint.dirty ? ' (dirty)' : ''))
  console.log('  sources sha  : ' + fingerprint.sourcesShaShort)
  console.log('  manifest path: ' + join(__dirname, report.manifestPath))
  console.log('  sha256 manifest: ' + manifestSha)
  console.log('  sha256 code.js : ' + bundleSha)
  console.log('  sha256 ui.html : ' + uiSha)
  console.log('  contract     : PASS (' + spec.counts.appliableTotal + ' appliable assets)')
  console.log('  counts       : ' + JSON.stringify(spec.counts))

  if (dryRun) {
    console.log('\n-- DRY RUN (pure spec, fresh file) ------------------------')
    const byKind = {}
    for (const a of spec.assets) byKind[a.kind] = (byKind[a.kind] || 0) + 1
    for (const [k, n] of Object.entries(byKind)) console.log('  create ' + String(n).padStart(4) + '  ' + k)

    console.log('\n  pages (Starter cap = 3):')
    for (const p of spec.pages) {
      const secs = spec.sections.filter((s) => s.pageKey === p.key)
      console.log('    - ' + p.name + '  (' + secs.length + ' sections)')
      for (const s of secs) {
        const flag = s.awaitingOwnerAssets ? '   [AWAITING OWNER ASSETS]' : s.speculative ? '   [SPECULATIVE]' : ''
        console.log('        · ' + s.name + flag)
      }
    }
    console.log('\n  collections (single-mode — Starter has no modes):')
    for (const c of spec.collections) {
      const n = spec.variables.filter((v) => v.collectionKey === c.key).length
      console.log('    - ' + c.name + '  (' + n + ' variables, mode "' + c.modeName + '")')
    }
    console.log('\n  component sets (locale = TEXT property, never a variant):')
    for (const cs of spec.componentSets) {
      console.log('    - ' + cs.name.padEnd(34) + cs.variantCount + ' variants  [' +
        Object.keys(cs.axes).join(' x ') + ']  text props: ' + (cs.text.length || 0))
    }
    console.log('\n  total component variants: ' + spec.counts.componentVariants)
    console.log('\n  asset kinds that must be ABSENT (Phase 87 fingerprints): textStyles, assemblies, families, components')
  }
}

main()

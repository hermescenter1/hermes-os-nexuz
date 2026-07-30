// Build + package the Hermes Design System Builder plugin.
//
// The Figma plugin sandbox loads a single classic script (no ES modules), so
// this script bundles the CommonJS source modules into one self-contained
// dist/code.js using a tiny inlined CommonJS runtime. It also copies the UI and
// writes an auditable build report. With --dry-run it additionally executes the
// PURE spec/plan in Node (no `figma`) and prints exactly what an in-Figma Dry
// Run would enumerate.
//
// Uses only Node built-ins — no third-party bundler, no new dependencies.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const SRC = join(__dirname, 'src')
const DIST = join(__dirname, 'dist')

// Module registration order (id = basename). The runtime require() is lazy, so
// order only needs every module registered before the 'main' entry runs.
const MODULES = [
  ['constants', 'lib/constants.js'],
  ['util', 'lib/util.js'],
  ['tokens', 'lib/tokens.js'],
  ['presets', 'lib/presets.js'],
  ['components', 'lib/components.js'],
  ['locale-strings', 'lib/locale-strings.js'],
  ['assemblies', 'lib/assemblies.js'],
  ['starter', 'lib/starter.js'],
  ['spec', 'lib/spec.js'],
  ['plan', 'lib/plan.js'],
  ['figma-exec', 'lib/figma-exec.js'],
  ['main', 'main.js'],
]

/** Rewrite every relative require(...) to its bare basename id used by the runtime. */
function rewriteRequires(body) {
  return body.replace(/require\(\s*['"](?:\.{1,2}\/)+(?:lib\/)?([\w-]+)(?:\.js)?['"]\s*\)/g, "require('$1')")
}

function bundle() {
  const parts = []
  parts.push('/* Hermes Design System Builder — generated bundle. Do not edit dist/ by hand; edit src/ and run `npm run build`. */')
  parts.push('(function () {')
  parts.push('  "use strict";')
  parts.push('  var __modules = {}, __cache = {};')
  parts.push('  function require(id) {')
  parts.push('    if (__cache[id]) return __cache[id].exports;')
  parts.push('    var m = { exports: {} }; __cache[id] = m;')
  parts.push('    __modules[id](m, m.exports, require);')
  parts.push('    return m.exports;')
  parts.push('  }')
  for (const [id, rel] of MODULES) {
    const raw = readFileSync(join(SRC, rel), 'utf8')
    const body = rewriteRequires(raw)
    parts.push(`  __modules[${JSON.stringify(id)}] = function (module, exports, require) {`)
    parts.push(body)
    parts.push('  };')
  }
  parts.push("  require('main');")
  parts.push('})();')
  parts.push('')
  return parts.join('\n')
}

function sha(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 16)
}

function main() {
  const dryRun = process.argv.includes('--dry-run')

  mkdirSync(DIST, { recursive: true })
  const code = bundle()
  writeFileSync(join(DIST, 'code.js'), code, 'utf8')
  copyFileSync(join(SRC, 'ui.html'), join(DIST, 'ui.html'))

  // Compute spec counts / hashes for the audit report (pure — no figma).
  const { buildSpec } = require('./src/lib/spec.js')
  const { computePlan, renderPlanText } = require('./src/lib/plan.js')
  const starter = require('./src/lib/starter.js')
  const spec = buildSpec()
  const plan = computePlan(spec, {}) // empty index == fresh file == all "create"

  const report = {
    plugin: 'Hermes Design System Builder',
    builtFrom: MODULES.map(([id, rel]) => ({ id, file: 'src/' + rel, sha256: sha(readFileSync(join(SRC, rel), 'utf8')) })),
    bundleSha256: sha(code),
    uiSha256: sha(readFileSync(join(SRC, 'ui.html'), 'utf8')),
    counts: spec.counts,
    planFresh: plan.summary,
    starterSupported: starter.STARTER_SUPPORTED.map((s) => s.capability),
    starterDeferred: starter.STARTER_DEFERRED.map((d) => ({ capability: d.capability, code: d.code })),
  }
  writeFileSync(join(DIST, 'build-report.json'), JSON.stringify(report, null, 2), 'utf8')

  console.log('✔ built dist/code.js (' + code.length + ' bytes, sha ' + report.bundleSha256 + ')')
  console.log('✔ built dist/ui.html')
  console.log('✔ wrote dist/build-report.json')
  console.log('  assets: ' + JSON.stringify(spec.counts))

  if (dryRun) {
    console.log('\n── DRY RUN (pure plan, fresh file) ─────────────────────────')
    console.log(renderPlanText(plan))
    console.log('\nStarter-supported: ' + report.starterSupported.length + ' capabilities')
    console.log('Starter-deferred:  ' + report.starterDeferred.map((d) => d.capability + ' [' + d.code + ']').join(' | '))
  }
}

main()

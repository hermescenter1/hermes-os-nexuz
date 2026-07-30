// @ts-check
'use strict'
/**
 * PURE fail-closed validators for the text pipeline and orphan adoption.
 *
 * Added after run-ms7vkx9n-1 ("Applied with issues"): the tri-lingual rewrite
 * changed assembly headings to pre-localized strings, but the renderer still
 * read `heading.fa/.en` — assigning `undefined` to TextNode.characters, which
 * Figma rejects (`set_characters: Required value missing`). The throw happened
 * BEFORE the assembly was tagged, leaving 36 partially-built, unmanaged frames.
 *
 * validateAssemblyText() re-derives EVERY string that will ever reach
 * `characters` or `setProperties` for the 36 assemblies and rejects anything
 * that is not a non-empty, non-whitespace JavaScript string — with full
 * context (assembly key, experience, locale, viewport, text role, source
 * catalog key). The executor calls it BEFORE generating a runId or invoking
 * any Figma mutation API; Dry Run surfaces the same result.
 */

const { STRINGS } = require('./locale-strings')

/**
 * Reverse map: exact string value per locale → source catalog key (for error
 * context). Values are distinct in practice; collisions keep the first key.
 * @returns {Record<string, Record<string, string>>} locale → value → catalog key
 */
function buildReverseCatalog() {
  /** @type {Record<string, Record<string, string>>} */
  const rev = { en: {}, fa: {}, de: {} }
  for (const id of Object.keys(STRINGS)) {
    const s = STRINGS[id]
    for (const l of ['en', 'fa', 'de']) {
      if (rev[l][s[l]] === undefined) rev[l][s[l]] = s.key
    }
  }
  return rev
}

/**
 * @param {unknown} v
 * @returns {string|null} problem description, or null when valid
 */
function textProblem(v) {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (typeof v !== 'string') return 'non-string (' + typeof v + ')'
  if (v.length === 0) return 'empty string'
  if (v.trim().length === 0) return 'whitespace-only string'
  return null
}

/**
 * Validate every text value of every assembly in the spec.
 * @param {{ assemblies: any[] }} spec
 * @returns {{ ok: boolean, issues: {assemblyKey:string, experience:string, locale:string, viewport:string, role:string, catalogKey:string, problem:string, value:unknown}[] }}
 */
function validateAssemblyText(spec) {
  const rev = buildReverseCatalog()
  /** @type {any[]} */
  const issues = []

  // STRINGS integrity first (missing locale keys / unresolved values)
  for (const id of Object.keys(STRINGS)) {
    const s = STRINGS[id]
    for (const l of ['en', 'fa', 'de']) {
      const p = textProblem(s[l])
      if (p) issues.push({ assemblyKey: '(catalog)', experience: '-', locale: l, viewport: '-', role: id, catalogKey: s.key, problem: 'catalog value ' + p, value: s[l] })
    }
  }

  for (const asm of spec.assemblies || []) {
    /** @param {any} item */
    const walk = (item) => {
      if (item.row) { item.row.forEach(walk); return }
      if ('heading' in item) {
        const p = textProblem(item.heading)
        if (p) {
          issues.push({
            assemblyKey: asm.key, experience: asm.experience, locale: asm.locale,
            viewport: asm.context, role: 'Heading(' + (item.style || 'Heading/L') + ')',
            catalogKey: typeof item.heading === 'string' ? (rev[asm.locale] && rev[asm.locale][item.heading]) || 'composed/literal' : 'unresolved',
            problem: p, value: item.heading,
          })
        }
        return
      }
      for (const propName of Object.keys(item.props || {})) {
        const v = item.props[propName]
        const p = textProblem(v)
        if (p) {
          issues.push({
            assemblyKey: asm.key, experience: asm.experience, locale: asm.locale,
            viewport: asm.context, role: item.family + '.' + propName,
            catalogKey: typeof v === 'string' ? (rev[asm.locale] && rev[asm.locale][v]) || 'literal' : 'unresolved',
            problem: p, value: v,
          })
        }
      }
    }
    for (const item of asm.items || []) walk(item)
  }

  return { ok: issues.length === 0, issues }
}

/**
 * Structured error for a defensive characters assignment.
 * @param {unknown} value @param {{assemblyKey?:string, role?:string, locale?:string}} ctx
 */
function charactersError(value, ctx) {
  const c = ctx || {}
  return new Error(
    'set_characters blocked: value is ' + (textProblem(value) || 'invalid') +
    ' [assembly=' + (c.assemblyKey || '-') + ' role=' + (c.role || '-') + ' locale=' + (c.locale || '-') + ']'
  )
}

/**
 * Orphan adoption picker (repairs run-ms7vkx9n-1 debris IN PLACE, preserving
 * node ids). Given the direct children of the managed assemblies section,
 * select the single unmanaged FRAME whose name exactly matches the assembly
 * name. ≥2 matches = ambiguity (fail closed). Managed frames never match.
 * @param {{id:string, name:string, type:string, managed:boolean}[]} children
 * @param {string} wantedName
 * @returns {{ id: string|null, ambiguous: string[] }}
 */
function pickAdoptable(children, wantedName) {
  const matches = (children || []).filter((c) => c && c.type === 'FRAME' && !c.managed && c.name === wantedName)
  if (matches.length > 1) return { id: null, ambiguous: matches.map((m) => m.id).sort() }
  return { id: matches.length === 1 ? matches[0].id : null, ambiguous: [] }
}

module.exports = { validateAssemblyText, textProblem, charactersError, pickAdoptable, buildReverseCatalog }

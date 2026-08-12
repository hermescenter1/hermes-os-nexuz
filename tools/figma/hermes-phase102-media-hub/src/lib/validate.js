// @ts-check
'use strict'
/**
 * PURE fail-closed validator for every string that will ever reach
 * `TextNode.characters` or `instance.setProperties(...)` when building the
 * Screens page. Mirrors the proven pattern from the Phase 87 design-system
 * plugin (`validate.js`, added after that plugin's real run-ms7vkx9n-1
 * incident where an undefined heading crashed a partially-built run).
 *
 * The executor calls this BEFORE generating a runId or invoking any Figma
 * mutation API; Dry Run surfaces the same result, so an invalid string is
 * caught with full context (screen key, breakpoint, locale, text role)
 * instead of throwing mid-build and leaving partial, unmanaged nodes.
 */

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
 * Validate every text value of every screen in the spec.
 * @param {{ screens: any[] }} spec
 * @returns {{ ok: boolean, issues: {screenKey:string, screenType:string, locale:string, breakpoint:string, role:string, problem:string, value:unknown}[] }}
 */
function validateScreenText(spec) {
  /** @type {any[]} */
  const issues = []

  for (const scr of spec.screens || []) {
    /** @param {any} item */
    const walk = (item) => {
      if (item.row) { item.row.forEach(walk); return }
      if ('heading' in item) {
        const p = textProblem(item.heading)
        if (p) {
          issues.push({
            screenKey: scr.key, screenType: scr.screenType, locale: scr.locale,
            breakpoint: scr.breakpoint, role: 'Heading(' + (item.style || 'Heading/L') + ')',
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
            screenKey: scr.key, screenType: scr.screenType, locale: scr.locale,
            breakpoint: scr.breakpoint, role: item.family + '.' + propName,
            problem: p, value: v,
          })
        }
      }
    }
    for (const item of scr.items || []) walk(item)
  }

  return { ok: issues.length === 0, issues }
}

/**
 * Structured error for a defensive characters assignment.
 * @param {unknown} value @param {{screenKey?:string, role?:string, locale?:string}} ctx
 */
function charactersError(value, ctx) {
  const c = ctx || {}
  return new Error(
    'set_characters blocked: value is ' + (textProblem(value) || 'invalid') +
    ' [screen=' + (c.screenKey || '-') + ' role=' + (c.role || '-') + ' locale=' + (c.locale || '-') + ']'
  )
}

module.exports = { textProblem, charactersError, validateScreenText }

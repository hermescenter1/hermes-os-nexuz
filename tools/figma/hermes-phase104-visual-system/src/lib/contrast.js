// @ts-check
'use strict'
/**
 * Pure WCAG 2.2 contrast maths for the Phase 104 DNA layer.
 *
 * Deliberately standalone (no `figma`, no repo imports) so it can run in the
 * plugin sandbox, in Node tests and in CI identically. The algorithm mirrors
 * src/app/__tests__/text-contrast-a11y.test.ts so the two agree by construction.
 */

/**
 * @param {string} input hex (#rgb/#rrggbb) or rgb()/rgba()
 * @returns {{r:number,g:number,b:number,a:number}} channels 0..1
 */
function parseColor(input) {
  const s = String(input).trim()
  if (s[0] === '#') {
    let hex = s.slice(1)
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    if (hex.length !== 6) throw new Error('Bad hex color: ' + input)
    const num = parseInt(hex, 16)
    if (Number.isNaN(num)) throw new Error('Bad hex color: ' + input)
    return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255, a: 1 }
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/i)
  if (!m) throw new Error('Unsupported color format: ' + input)
  const parts = m[1].split(',').map((p) => p.trim())
  if (parts.length < 3) throw new Error('Bad rgb color: ' + input)
  const r = Number(parts[0]) / 255
  const g = Number(parts[1]) / 255
  const b = Number(parts[2]) / 255
  const a = parts.length >= 4 ? Number(parts[3]) : 1
  if ([r, g, b, a].some((n) => Number.isNaN(n))) throw new Error('Bad rgb color: ' + input)
  return { r, g, b, a }
}

/** sRGB channel → linear. @param {number} c @returns {number} */
function toLinear(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Relative luminance of an OPAQUE color. @param {string} color @returns {number} */
function luminance(color) {
  const { r, g, b } = parseColor(color)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * Composite a (possibly translucent) foreground over an opaque background,
 * returning the resulting opaque color. Needed because Hermes Glass surfaces are
 * translucent — measuring text against the glass *token* rather than against the
 * composited result would overstate contrast.
 * @param {string} fg @param {string} bg @returns {string}
 */
function composite(fg, bg) {
  const f = parseColor(fg)
  const b = parseColor(bg)
  const a = f.a
  const r = Math.round((f.r * a + b.r * (1 - a)) * 255)
  const g = Math.round((f.g * a + b.g * (1 - a)) * 255)
  const bl = Math.round((f.b * a + b.b * (1 - a)) * 255)
  return 'rgb(' + r + ', ' + g + ', ' + bl + ')'
}

/**
 * WCAG contrast ratio. Translucent inputs are composited over `over` first.
 * @param {string} fg @param {string} bg @param {string} [over] opaque backdrop for translucent inputs
 * @returns {number}
 */
function contrast(fg, bg, over) {
  const backdrop = over || '#000000'
  const f = parseColor(fg).a < 1 ? composite(fg, backdrop) : fg
  const b = parseColor(bg).a < 1 ? composite(bg, backdrop) : bg
  const l1 = luminance(f)
  const l2 = luminance(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

/** @param {number} n @returns {number} rounded to 2dp */
function r2(n) {
  return Math.round(n * 100) / 100
}

module.exports = { parseColor, toLinear, luminance, composite, contrast, r2 }

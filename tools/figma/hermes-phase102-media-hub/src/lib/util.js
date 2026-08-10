// @ts-check
'use strict'
/** Pure, deterministic helpers. No `figma`, no Date, no Math.random. */

/**
 * @param {string} s
 * @returns {string} kebab slug
 */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Deterministic JSON with recursively sorted object keys, so a hash of the same
 * logical value is stable regardless of key insertion order.
 * @param {unknown} v
 * @returns {string}
 */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const obj = /** @type {Record<string, unknown>} */ (v)
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

/**
 * FNV-1a 32-bit hash → 8-char hex. Deterministic; used for content hashes so
 * reruns can tell "unchanged" (skip) from "changed" (update).
 * @param {string} str
 * @returns {string}
 */
function fnv1a(str) {
  let h = 0x811c9dc5 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return ('0000000' + h.toString(16)).slice(-8)
}

/**
 * Content hash of an asset payload (order-independent).
 * @param {unknown} payload
 * @returns {string}
 */
function hashAsset(payload) {
  return fnv1a(stableStringify(payload))
}

module.exports = { slug, stableStringify, fnv1a, hashAsset }

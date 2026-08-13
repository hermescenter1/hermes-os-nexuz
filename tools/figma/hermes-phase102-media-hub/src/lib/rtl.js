// @ts-check
'use strict'
/**
 * PURE RTL mirroring rules — the single source of truth for how a component's
 * anatomy tree mirrors under Direction=RTL, shared by:
 *   - the pure test suite (walks NodeSpec trees from presets.js, no `figma`)
 *   - figma-exec.js's real `mirrorRtl()` (walks the actual rendered nodes,
 *     matching by role/name using the SAME protected-role set)
 *
 * THE CRITICAL RULE (task brief): time always flows left-to-right, even inside
 * an RTL layout. The player's seek bar/timeline must stay LTR while the
 * surrounding controls (play/pause, volume, captions, fullscreen) mirror
 * normally. Getting this backwards is the classic bug.
 *
 * Mechanism: any NodeSpec role in PROTECTED_LTR_ROLES is treated as an OPAQUE
 * LTR-locked subtree during mirroring — its own children are never reordered
 * and text inside it is never right-aligned — but the node itself still
 * participates normally as a child of its parent (so if the parent row
 * reverses, the whole protected block still moves to the mirrored side, which
 * is correct: the BLOCK mirrors, its INTERNAL time-flow does not).
 */

/**
 * Roles that represent time-based / numeric-technical content and must never
 * be internally mirrored: the player timeline, any progress/watch meter, and
 * the timestamp/remaining-time labels that flank them.
 */
const PROTECTED_LTR_ROLES = new Set([
  'Timeline', 'Scrubber', 'Track', 'Fill', 'Playhead',
  'Meter', 'MeterTrack', 'MeterFill',
  'TimeElapsed', 'TimeRemaining', 'Trail', 'Duration', 'Timestamp', 'DurationBadge',
])

/** @param {string} role */
function isProtectedRole(role) {
  return PROTECTED_LTR_ROLES.has(role)
}

/**
 * Pure mirror-plan over a NodeSpec tree (the same trees `PRESETS[...]`
 * returns). Never touches `figma`. Returns exactly what an RTL build WOULD do:
 * which horizontal frames get their children reversed, which text roles get
 * right-aligned, and which subtrees are skipped (protected, LTR-locked).
 * @param {any} spec NodeSpec root
 * @returns {{ reversedFrames: string[], rightAlignedText: string[], skippedSubtrees: string[] }}
 */
function computeMirrorPlan(spec) {
  /** @type {string[]} */
  const reversedFrames = []
  /** @type {string[]} */
  const rightAlignedText = []
  /** @type {string[]} */
  const skippedSubtrees = []

  /** @param {any} n */
  const walk = (n) => {
    if (!n) return
    if (isProtectedRole(n.role)) { skippedSubtrees.push(n.role); return } // opaque — do not descend
    if (n.type === 'frame' && n.row) reversedFrames.push(n.role)
    if (n.type === 'text') rightAlignedText.push(n.role)
    for (const c of n.children || []) walk(c)
  }
  walk(spec)
  return { reversedFrames, rightAlignedText, skippedSubtrees }
}

/**
 * Whether a family blueprint contains at least one protected (LTR-locked)
 * subtree — used by component tests to assert PlayerControlBar / meter-bearing
 * families actually exercise the protection, and that unrelated families do
 * not spuriously trip it.
 * @param {any} spec
 * @returns {boolean}
 */
function hasProtectedSubtree(spec) {
  return computeMirrorPlan(spec).skippedSubtrees.length > 0
}

module.exports = { PROTECTED_LTR_ROLES, isProtectedRole, computeMirrorPlan, hasProtectedSubtree }

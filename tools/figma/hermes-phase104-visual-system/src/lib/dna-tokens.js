// @ts-check
'use strict'
/**
 * HERMES DESIGN DNA — Phase 104 token layer.
 *
 * This module is ADDITIVE on top of the Phase 87B canonical token layer. It does
 * not restate, replace or renumber anything already enforced by
 * `src/components/ds/token-contract.ts`; it declares the *new* semantic layer
 * Phase 104 introduces, and it declares — explicitly and by name — which existing
 * canonical tokens each Hermes DNA signature ALIASES.
 *
 * Two hard rules govern every entry below.
 *
 *   1. NO NEW BASE HUE WITHOUT A REASON. The approved brand system
 *      (docs/design/phase-87a/03-brand-system.md) fixes Obsidian #071018 as the
 *      product base and forbids neon/cyberpunk treatment. Every DNA signature is
 *      therefore expressed as an ALIAS of an existing canonical token wherever a
 *      canonical token already carries the meaning. Genuinely new values are
 *      listed in NEW_HUES and each one carries a written justification.
 *
 *   2. COLOR IS NEVER THE ONLY CHANNEL. Every industrial state carries a
 *      non-color cue (glyph + outline treatment) so severity survives greyscale,
 *      color-vision deficiency and monochrome print. WCAG 2.2 SC 1.4.1.
 *
 * Contrast figures in this file are COMPUTED, never asserted by hand — see
 * `contrast.js` and the `dna-contrast` test.
 */

/** The canonical surfaces every DNA foreground token is measured against. */
const BASE_SURFACES = Object.freeze({
  backgroundDeep: '#040A0F', // --color-background-deep
  backgroundBase: '#071018', // --color-background-base  (Hermes Obsidian)
  surfacePrimary: '#0C1720', // --color-surface-primary
  surfaceElevated: '#11212C', // --color-surface-elevated
  surfaceInteractive: '#152A36', // --color-surface-interactive  ← lightest, worst case
})

/**
 * Genuinely NEW values Phase 104 introduces, with justification. Everything not
 * in this list is an alias of an already-shipped canonical token.
 *
 * @type {ReadonlyArray<{value:string, name:string, why:string}>}
 */
const NEW_HUES = [
  {
    value: '#E03144',
    name: 'Safety Red Urgent',
    why: 'CRITICAL must outrank ALARM. --color-status-danger (#F05D68) is already spent on ALARM and reads as a soft salmon; a fully saturated pure red is required for the top of the severity ladder. Measured 3.31:1 on the lightest surface — passes SC 1.4.11 for indicators. NOT text-legible: use critical.text.',
  },
  {
    value: '#FF8A94',
    name: 'Safety Red Text',
    why: 'The readable partner of Safety Red Urgent (6.58:1). Carries CRITICAL at text-legible luminance wherever the state name is rendered as type.',
  },
  {
    value: '#93AEC8',
    name: 'Maintenance Steel Text',
    why: 'Readable partner of Maintenance Steel (6.45:1). Maintenance Steel is deliberately recessive and measures only 3.51:1 — fine as an indicator, below AA as text.',
  },
  {
    value: '#6B7F8D',
    name: 'Offline Slate',
    why: 'OFFLINE is a real operational state, not a disabled control, so it may not borrow --color-text-disabled (#495C68 = 2.13:1, below SC 1.4.11). Offline Slate measures 3.56:1 and is a full luminance step below the UNKNOWN grey so the two never collapse.',
  },
  {
    value: '#7FB0FF',
    name: 'Evidence Azure Text',
    why: 'Readable partner of --color-reasoning-evidence (#3B82F6 = 4.03:1, below AA as text). Keeps the canonical azure as the indicator/border while type stays legible at 6.75:1.',
  },
  {
    value: '#A99BFF',
    name: 'Hypothesis Violet Text',
    why: 'Readable partner of --color-reasoning-hypothesis (#8B7CFF = 4.54:1 — passing but with almost no margin). Lifts hypothesis type to 6.23:1 so it survives any future surface change.',
  },
  {
    value: '#FF7C86',
    name: 'Contradiction Text',
    why: 'Readable partner of --color-reasoning-contradiction (#F05D68 = 4.57:1, same razor-thin margin). 5.99:1.',
  },
  {
    value: '#C9B06A',
    name: 'Industrial Brass',
    why: 'DEGRADED is operationally distinct from WARNING — it means "still running, below nominal", not "act now". Reusing --color-status-warning would erase that distinction on every asset tile. Brass sits deliberately between success green and warning amber.',
  },
  {
    value: '#5F7E9E',
    name: 'Maintenance Steel',
    why: 'MAINTENANCE is a planned, non-fault state and must not read as an alert or as informational telemetry. Deliberately desaturated so it recedes; distinct from the vivid --color-status-information (#54A6FF).',
  },
  {
    value: '#6B3A22',
    name: 'Horizon Ember Core',
    why: 'The single warm value in the entire system. Confined to the Hermes Horizon atmosphere layer at low opacity behind a vignette; never a content color, never a text color, never used on a data surface.',
  },
  {
    value: '#34201C',
    name: 'Horizon Ember Fade',
    why: 'The mid stop that carries Ember Core back into Obsidian without a visible banding edge.',
  },
]

/**
 * ── SIGNATURE 1 · HERMES HORIZON ────────────────────────────────────────────
 * The cinematic industrial atmosphere layer.
 *
 * POLICY (enforced by `dna-policy` test, not merely documented):
 *   - Permitted ONLY on: Login, Workspace Home, and full-bleed command surfaces.
 *   - FORBIDDEN behind any dense engineering data — tables, trends, telemetry
 *     rows, alarm lists, editors. `HORIZON_FORBIDDEN_SURFACES` is the machine list.
 *   - No text may sit directly on Horizon. Text sits on a Hermes Glass surface
 *     that is composited over it. This is what keeps the atmosphere from ever
 *     costing legibility.
 *   - Total warm coverage is capped: the ember band may not exceed 22% of frame
 *     height, and the vignette is mandatory.
 */
const HORIZON = Object.freeze({
  /** Vertical gradient stops, top (0) → bottom (1). */
  stops: Object.freeze([
    { at: 0.0, value: '#03070B', role: 'void', note: 'above the horizon — near-black, holds the UI chrome' },
    { at: 0.42, value: '#071018', role: 'obsidian', note: 'the canonical base — continuity anchor with the rest of the product' },
    { at: 0.68, value: '#0E1A24', role: 'haze', note: 'steel atmospheric band' },
    { at: 0.84, value: '#34201C', role: 'emberFade', note: 'warm transition — no visible banding edge' },
    { at: 0.93, value: '#6B3A22', role: 'emberCore', note: 'the sun band — the ONLY warm value in Hermes' },
    { at: 1.0, value: '#040A0F', role: 'ground', note: 'plant silhouette / ground plane resolves back to Obsidian Deep' },
  ]),
  /** Mandatory overlays composited on top of the gradient, in order. */
  overlays: Object.freeze([
    { role: 'iceCounterLight', value: 'rgba(139, 244, 248, 0.06)', note: 'cold counter-light from the top-left — keeps the frame industrial, not romantic' },
    { role: 'haze', value: 'rgba(169, 186, 198, 0.05)', note: 'particulate atmosphere' },
    { role: 'vignette', value: 'rgba(4, 10, 15, 0.72)', note: 'MANDATORY — pins attention to the centre and protects contrast at the edges' },
  ]),
  /** Hard geometry limits. */
  emberBandMaxHeightRatio: 0.22,
  vignetteRequired: true,
})

/** Surfaces on which the Horizon layer is machine-forbidden. */
const HORIZON_FORBIDDEN_SURFACES = Object.freeze([
  'command-center', 'industrial-brain', 'live-operations', 'asset-detail',
  'connectivity', 'reports', 'alarm-center', 'administration',
  'media-analytics', 'automation-studio',
])

/** Surfaces on which the Horizon layer is permitted. */
const HORIZON_PERMITTED_SURFACES = Object.freeze(['login', 'workspace-home', 'video-watch'])

/**
 * ── SIGNATURE 2 · HERMES DEEP NAVY ──────────────────────────────────────────
 * The stable operational workspace. Pure alias layer — introduces NO new value.
 * "Deep navy" is the *name* of the existing Obsidian family, not a new colour.
 */
const DEEP_NAVY = Object.freeze({
  workspace: { alias: '--color-background-base', value: '#071018' },
  void: { alias: '--color-background-deep', value: '#040A0F' },
  panel: { alias: '--color-surface-primary', value: '#0C1720' },
  panelRaised: { alias: '--color-surface-elevated', value: '#11212C' },
  panelInteractive: { alias: '--color-surface-interactive', value: '#152A36' },
})

/**
 * ── SIGNATURE 3 · HERMES GLASS ──────────────────────────────────────────────
 * Controlled, restrained translucency. Phase 104's real job here was to CLOSE
 * the largest known inconsistency in the system: the shipped `.ds-glass-*`
 * family was hard-coded rgba() and read from no token. Phase 104-C tokenised it
 * 1:1, and this correction aligns the values below with what actually renders,
 * so the design source and the product no longer disagree.
 */
const GLASS = Object.freeze({
  /**
   * OWNER DECISION (Phase 104 correction). These tiers previously carried an
   * aspirational specification that did not match what the product renders —
   * translucent fills behind a backdrop blur on every tier. The owner has ruled
   * the shipped, restrained operational rendering CANONICAL:
   *
   *   - operational cards stay FILLED and high-legibility (alpha 0.94–0.96);
   *   - blur is reserved for hero and overlay contexts, never ordinary
   *     operational cards, because blur samples nothing on a solid dark shell
   *     and only costs compositing time on dense dashboards;
   *   - `interactive` shares the card surface recipe and keeps its own distinct
   *     interaction behaviour — a deeper lift (-6) and the 1.012 scale.
   *
   * The values below are therefore read FROM the product (globals.css) rather
   * than prescribed to it, and the divergence is closed rather than tracked.
   * `fill` is the top stop of each tier's fill gradient, which is the value the
   * Figma variable represents; the second stop lives only in CSS.
   */
  tiers: Object.freeze([
    { tier: 'soft', fill: 'rgba(12, 23, 32, 0.72)', border: 'rgba(139, 244, 248, 0.07)', blur: 0, lift: -2, replaces: '.ds-glass-soft' },
    { tier: 'card', fill: 'rgba(17, 33, 44, 0.94)', border: 'rgba(139, 244, 248, 0.10)', blur: 0, lift: -3, replaces: '.ds-glass-card' },
    { tier: 'interactive', fill: 'rgba(17, 33, 44, 0.94)', border: 'rgba(139, 244, 248, 0.10)', blur: 0, lift: -6, replaces: '.ds-glass-interactive' },
    { tier: 'elevated', fill: 'rgba(20, 38, 50, 0.96)', border: 'rgba(139, 244, 248, 0.14)', blur: 0, lift: -5, replaces: '.ds-glass-elevated' },
    { tier: 'hero', fill: 'rgba(20, 38, 50, 0.88)', border: 'rgba(139, 244, 248, 0.16)', blur: 18, lift: -8, replaces: '.ds-glass-hero' },
  ]),
  /**
   * The shipped lift ordering is MACHINE-PINNED by
   * src/components/ds/__tests__/components.test.ts:154-165 as a strict ladder
   * soft(-2) < card(-3) < elevated(-5) < interactive(-6) < hero(-8), and scale()
   * is pinned to exactly ["scale(1.012)"]. Phase 104 preserves both exactly.
   */
  liftLadder: Object.freeze(['soft', 'card', 'elevated', 'interactive', 'hero']),
  interactiveScale: 1.012,
  /** Opacity floor — below this, text contrast over Horizon is not guaranteed. */
  minFillAlphaOverHorizon: 0.72,
})

/**
 * ── SIGNATURE 4 · HERMES EDGE ───────────────────────────────────────────────
 * Fine steel/ice borders with extremely restrained edge illumination.
 */
const EDGE = Object.freeze({
  structural: { alias: '--color-border-default', value: '#203743', width: 1, note: 'non-interactive separation' },
  hairline: { alias: '--color-surface-glass-border', value: 'rgba(139, 244, 248, 0.10)', width: 1, note: 'the 1px ice line on every glass surface' },
  active: { alias: '--color-border-active', value: '#21C9D5', width: 1, note: 'selected / active boundary' },
  danger: { alias: '--color-border-danger', value: '#F05D68', width: 1 },
  /**
   * Edge illumination is a LINEAR TOP HIGHLIGHT, not a glow. It is a 1px inner
   * line fading over the first 40% of the surface height. Outer glow, bloom and
   * box-shadow spread in a brand colour are all prohibited — 03-brand-system.md:320
   * retired `.glow-*`, `.text-glow*` and `.landing-scanlines` and Phase 104 does
   * not reinstate them under a new name.
   */
  illumination: Object.freeze({
    from: 'rgba(139, 244, 248, 0.14)',
    to: 'rgba(139, 244, 248, 0.00)',
    spanRatio: 0.4,
    outerGlowPermitted: false,
  }),
})

/**
 * ── SIGNATURE 5 · HERMES BEACON ─────────────────────────────────────────────
 * The focused ice-blue highlight for command focus, intelligence and selected
 * operational state. Pure alias layer — no new value. Beacon is a FOCUS device,
 * never decoration: it may appear at most once per view as the primary beacon.
 */
const BEACON = Object.freeze({
  core: { alias: '--color-brand-primary', value: '#16D9E3' },
  rise: { alias: '--color-brand-primary-hover', value: '#8BF4F8' },
  deep: { alias: '--color-brand-primary-pressed', value: '#0795A5' },
  halo: { alias: '--color-selection', value: 'rgba(22, 217, 227, 0.28)' },
  rim: { alias: '--color-brand-border', value: 'rgba(22, 217, 227, 0.24)' },
  wash: { alias: '--color-brand-subtle', value: 'rgba(22, 217, 227, 0.10)' },
  onBeacon: { alias: '--color-brand-on-brand', value: '#071018', note: 'white-on-cyan is prohibited' },
  maxPrimaryPerView: 1,
})

/**
 * ── SIGNATURE 6 · HERMES RAIL ───────────────────────────────────────────────
 * The minimal persistent navigation rail. Phase 104 narrows the Phase 87A
 * 264/64 sidebar into a true RAIL: icon-only by default, label-on-hover, with an
 * optional expanded drawer. Widths are tokens, not magic numbers.
 */
const RAIL = Object.freeze({
  widthRail: 72, // icon-only resting state — the Hermes signature
  widthExpanded: 264, // drawer state (matches the Phase 87A spec so nav code is unchanged)
  widthTablet: 72,
  mobile: 'bottom-sheet', // the rail becomes a bottom sheet below 768
  itemSize: 44, // ≥44px — WCAG 2.2 SC 2.5.8 target size
  itemGap: 6,
  iconSize: 20,
  activeIndicatorWidth: 2, // inline-start beacon bar on the active item
  surface: { alias: '--color-surface-primary', value: '#0C1720' },
  edge: { alias: '--color-border-default', value: '#203743' },
})

/**
 * ── SIGNATURE 7 · HERMES COMMAND ────────────────────────────────────────────
 * The large AI command/search interaction — the most recognisable Hermes element.
 * Rendered as a single wide Glass field with a Beacon focus ring and a leading
 * Hermes Brain mark. Deliberately larger than any other control in the product.
 */
const COMMAND = Object.freeze({
  widthDesktop: 720,
  widthTablet: 640,
  widthMobile: 342,
  height: 64,
  heightMobile: 56,
  radius: 16, // --radius-xl
  glassTier: 'elevated',
  focusRing: { alias: '--color-focus-ring', value: '#16D9E3', width: 2, offset: 2 },
  placeholderTone: { alias: '--color-text-muted', value: '#708694' },
  markSize: 24,
  /** The palette that opens beneath it. */
  paletteWidth: 720,
  paletteMaxHeight: 480,
  paletteGlassTier: 'hero',
  paletteGroups: Object.freeze(['Navigate', 'Actions', 'Entities', 'Evidence', 'Help']),
})

/**
 * ── SIGNATURE 8 · HERMES TRIAD ──────────────────────────────────────────────
 * The three primary Workspace cards and their interaction grammar. The Triad is
 * a fixed composition, not a generic card grid: exactly three, equal weight,
 * each carrying one intent.
 */
const TRIAD = Object.freeze({
  count: 3,
  cardWidthDesktop: 384,
  cardHeightDesktop: 260,
  gap: 24,
  glassTier: 'interactive',
  radius: 20, // --radius-2xl
  stackBelow: 768, // becomes a vertical stack on tablet and below
  intents: Object.freeze([
    { key: 'operate', mark: 'live-operations', note: 'what is happening in the plant right now' },
    { key: 'understand', mark: 'hermes-brain', note: 'what the evidence says and what is uncertain' },
    { key: 'act', mark: 'command', note: 'the engineering action queue awaiting a human decision' },
  ]),
})

/**
 * ── INDUSTRIAL STATE LADDER ─────────────────────────────────────────────────
 * Ten operational states. `fill` is the indicator/border colour; `text` is the
 * readable partner used whenever the state name is rendered as type. Every entry
 * carries a non-colour `glyph` and `outline` so severity never depends on hue.
 *
 * ORDER IS SEVERITY ORDER and is asserted by test — `unknown` deliberately sits
 * apart from `healthy` at both ends of the scale so the two can never be confused.
 */
const INDUSTRIAL_STATES = Object.freeze([
  { key: 'healthy', rank: 0, fill: '#38D996', text: '#38D996', alias: '--color-status-success', glyph: 'dot-solid', outline: 'solid', label: { en: 'Healthy', fa: 'سالم', de: 'Fehlerfrei' } },
  { key: 'degraded', rank: 1, fill: '#C9B06A', text: '#C9B06A', alias: null, glyph: 'dot-half', outline: 'solid', label: { en: 'Degraded', fa: 'افت‌کرده', de: 'Eingeschränkt' } },
  { key: 'warning', rank: 2, fill: '#F5B942', text: '#F5B942', alias: '--color-status-warning', glyph: 'triangle', outline: 'solid', label: { en: 'Warning', fa: 'هشدار', de: 'Warnung' } },
  { key: 'alarm', rank: 3, fill: '#F05D68', text: '#F05D68', alias: '--color-status-danger', glyph: 'square-pulse', outline: 'solid', label: { en: 'Alarm', fa: 'آلارم', de: 'Alarm' } },
  { key: 'critical', rank: 4, fill: '#E03144', text: '#FF8A94', alias: null, glyph: 'cross-double', outline: 'double', label: { en: 'Critical', fa: 'بحرانی', de: 'Kritisch' } },
  { key: 'maintenance', rank: 5, fill: '#5F7E9E', text: '#93AEC8', alias: null, glyph: 'wrench', outline: 'solid', label: { en: 'Maintenance', fa: 'تعمیرات', de: 'Wartung' } },
  { key: 'simulation', rank: 6, fill: '#8B7CFF', text: '#A99BFF', alias: '--color-reasoning-hypothesis', glyph: 'diamond', outline: 'dashed', label: { en: 'Simulation', fa: 'شبیه‌سازی', de: 'Simulation' } },
  {
    key: 'stale', rank: 7, fill: '#708694', text: '#8496A6', alias: '--color-text-muted',
    glyph: 'clock-dashed', outline: 'dashed',
    label: { en: 'Stale data', fa: 'دادهٔ کهنه', de: 'Veraltete Daten' },
    // STALE is a DATA-QUALITY MODIFIER, not a device state. It renders over the
    // last-known state: that state's colour desaturated to 40% plus a dashed
    // ring and a clock glyph. The `fill` above is only the fallback used when no
    // prior state exists. Modelling it as a modifier is what keeps the three
    // grey-family states (stale / offline / unknown) from collapsing into each other.
    modifier: true,
    appliesOver: 'lastKnownState',
    desaturateTo: 0.4,
  },
  { key: 'offline', rank: 8, fill: '#6B7F8D', text: '#8496A6', alias: null, glyph: 'dot-hollow', outline: 'solid', label: { en: 'Offline', fa: 'آفلاین', de: 'Offline' } },
  { key: 'unknown', rank: 9, fill: '#8496A6', text: '#8496A6', alias: '--color-text-metadata', glyph: 'question', outline: 'dashed', label: { en: 'Unknown', fa: 'نامعلوم', de: 'Unbekannt' } },
])

/**
 * ── REASONING LADDER (Industrial Brain) ─────────────────────────────────────
 * An AI hypothesis must NEVER look like a verified plant fact. The visual
 * separation is carried by three independent channels at once: colour, border
 * style, and a mandatory provenance chip. `verifiedLook` is the machine flag the
 * Brain surfaces assert against.
 */
const REASONING_LADDER = Object.freeze([
  { key: 'observation', color: '#EDF7FA', text: '#EDF7FA', alias: '--color-text-primary', border: 'solid', chip: 'OBSERVED', verifiedLook: true, note: 'measured plant data — the only tier allowed to look like fact' },
  { key: 'evidence', color: '#3B82F6', text: '#7FB0FF', alias: '--color-reasoning-evidence', border: 'solid', chip: 'EVIDENCE', verifiedLook: true, note: 'traceable to a source record; lineage must be inspectable' },
  { key: 'hypothesis', color: '#8B7CFF', text: '#A99BFF', alias: '--color-reasoning-hypothesis', border: 'dashed', chip: 'HYPOTHESIS', verifiedLook: false, note: 'model inference — dashed border is mandatory' },
  { key: 'rootCauseCandidate', color: '#8B7CFF', text: '#A99BFF', alias: '--color-reasoning-hypothesis', border: 'dashed', chip: 'CANDIDATE', verifiedLook: false, note: 'ranked candidate, still unproven' },
  { key: 'contradiction', color: '#F05D68', text: '#FF7C86', alias: '--color-reasoning-contradiction', border: 'solid', chip: 'CONFLICT', verifiedLook: true, note: 'evidence that conflicts with the selected hypothesis' },
  { key: 'missing', color: '#F5B942', text: '#F5B942', alias: '--color-reasoning-missing', border: 'dashed', chip: 'NO DATA', verifiedLook: false, note: 'absent evidence — never rendered as zero' },
  { key: 'simulationResult', color: '#8B7CFF', text: '#A99BFF', alias: '--color-reasoning-hypothesis', border: 'dashed', chip: 'SIMULATED', verifiedLook: false, note: 'not plant data' },
  { key: 'recommendation', color: '#16D9E3', text: '#16D9E3', alias: '--color-reasoning-decision', border: 'solid', chip: 'PROPOSED', verifiedLook: false, note: 'proposed action, pending engineer approval' },
  { key: 'engineerApproval', color: '#38D996', text: '#38D996', alias: '--color-status-success', border: 'solid', chip: 'APPROVED', verifiedLook: true, note: 'a human took responsibility — the only tier that closes the loop' },
])

/**
 * ── MOTION ──────────────────────────────────────────────────────────────────
 * Restrained, causal motion in the 120–240ms band. Values reuse the shipped
 * --motion-* tokens; Phase 104 adds only the named CHOREOGRAPHIES.
 */
const MOTION = Object.freeze({
  durations: Object.freeze({ instant: 60, fast: 140, standard: 200, slow: 300 }),
  easing: Object.freeze({
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)', // --motion-ease
    exit: 'cubic-bezier(0.16, 1, 0.3, 1)', // --motion-ease-out
  }),
  choreography: Object.freeze([
    { key: 'commandFocus', duration: 140, easing: 'standard', note: 'field widens + beacon ring resolves' },
    { key: 'panelTransition', duration: 200, easing: 'standard' },
    { key: 'progressiveDisclosure', duration: 200, easing: 'standard' },
    { key: 'signalStateTransition', duration: 140, easing: 'standard', note: 'never animates the VALUE, only the state colour' },
    { key: 'reasoningReveal', duration: 240, easing: 'exit', note: 'evidence lineage unfolds top-down so causality reads' },
    { key: 'alarmAcknowledge', duration: 200, easing: 'standard' },
    { key: 'workspaceNavigation', duration: 200, easing: 'exit' },
  ]),
  /** Prohibited outright. */
  prohibited: Object.freeze(['float', 'pulse-glow', 'parallax', 'bounce', 'ripple', 'confetti', 'rotate-3d']),
  reducedMotion: Object.freeze({
    respected: true,
    fallback: 'opacity-only',
    maxDuration: 0,
    note: 'Under prefers-reduced-motion every choreography collapses to an instant state change. The alarm pulse becomes a static double outline so severity is never lost.',
  }),
})

/** Responsive breakpoints Phase 104 designs and validates against. */
const BREAKPOINTS = Object.freeze({
  desktop: { width: 1440, height: 1024 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
})

/** Minimum interactive target, WCAG 2.2 SC 2.5.8. */
const MIN_TARGET_PX = 44

module.exports = {
  BASE_SURFACES,
  NEW_HUES,
  HORIZON,
  HORIZON_FORBIDDEN_SURFACES,
  HORIZON_PERMITTED_SURFACES,
  DEEP_NAVY,
  GLASS,
  EDGE,
  BEACON,
  RAIL,
  COMMAND,
  TRIAD,
  INDUSTRIAL_STATES,
  REASONING_LADDER,
  MOTION,
  BREAKPOINTS,
  MIN_TARGET_PX,
}

/**
 * PHASE 104-C — Hermes DNA signature contract.
 *
 * Phase 104-A bridged the eleven new HUES. This contract bridges the eight
 * SIGNATURES — Horizon, Deep Navy, Glass, Edge, Beacon, Rail, Command, Triad —
 * from the design-side machine source into values and policies the product can
 * be held to.
 *
 * A signature is not a colour. Most of what makes one recognisable is geometry
 * and policy: how wide the rail rests, that Beacon appears at most once per
 * view, that Horizon is forbidden behind dense engineering data. Those are the
 * parts that rot silently, because nothing in a colour contract can see them.
 * Every one of them is derived from `dna-tokens.js` here and asserted by
 * `__tests__/phase104-signature-contract.test.ts`.
 *
 * ── THE GLASS DIVERGENCE IS DECLARED, NOT RESOLVED ──
 * `GLASS.tiers` in the machine source is a specification, and it does not match
 * what ships. The spec's soft tier is rgba(12,23,32,0.55) behind a 10px blur;
 * the shipped soft tier is rgba(12,23,32,0.72) with a sheen gradient and no
 * blur at all, because the 87L.1 filled-glass system deliberately dropped
 * backdrop-filter on the app tiers — blur has nothing to sample on a solid dark
 * shell and only costs compositing time on dense dashboards.
 *
 * Phase 104-C tokenises the SHIPPED values byte for byte. Adopting the spec
 * numbers would change how every card in the product renders, which is a visual
 * decision for the owner and not something to smuggle in under the word
 * "migration". `SHIPPED_GLASS_TIERS` below pins what ships, the test asserts the
 * two genuinely differ, and the divergence is listed as an open owner decision
 * rather than quietly closed in either direction.
 */

import {
  BEACON,
  COMMAND,
  GLASS,
  HORIZON,
  HORIZON_FORBIDDEN_SURFACES,
  HORIZON_PERMITTED_SURFACES,
  MIN_TARGET_PX,
  RAIL,
  TRIAD,
} from "../../../tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js";

/** The eight signatures Phase 104 is required to ship. */
export type SignatureKey =
  | "horizon"
  | "deep-navy"
  | "glass"
  | "edge"
  | "beacon"
  | "rail"
  | "command"
  | "triad";

export interface SignatureEntry {
  key: SignatureKey;
  /** Human name as used in the specification and in Figma. */
  name: string;
  /**
   * CSS custom properties this signature owns in `globals.css`. Aliases of
   * Phase 87B tokens are included — Edge and Beacon are naming layers, and a
   * naming layer that is not actually declared is not a signature.
   */
  cssVars: readonly string[];
  /** What the signature is for. */
  usage: string;
  /** What it must never be used for. */
  restriction: string;
}

/**
 * The shipped Glass tiers, pinned. These are the exact literals the 87L.1 rules
 * carried before Phase 104-C moved them into variables; the test asserts the
 * variables still hold them, which is what makes the tokenisation provably 1:1
 * rather than a redesign wearing its name.
 */
export const SHIPPED_GLASS_TIERS = [
  {
    tier: "soft",
    fill: "rgba(12, 23, 32, 0.72)",
    border: "rgba(139, 244, 248, 0.07)",
    fillVar: "--glass-soft-fill",
    borderVar: "--glass-soft-border",
    blurs: false,
  },
  {
    tier: "card",
    fill: "rgba(17, 33, 44, 0.94)",
    border: "rgba(139, 244, 248, 0.10)",
    fillVar: "--glass-card-fill-from",
    borderVar: "--glass-card-border",
    blurs: false,
  },
  {
    tier: "elevated",
    fill: "rgba(20, 38, 50, 0.96)",
    border: "rgba(139, 244, 248, 0.14)",
    fillVar: "--glass-elevated-fill-from",
    borderVar: "--glass-elevated-border",
    blurs: false,
  },
  {
    tier: "hero",
    fill: "rgba(20, 38, 50, 0.88)",
    border: "rgba(139, 244, 248, 0.16)",
    fillVar: "--glass-hero-fill-from",
    borderVar: "--glass-hero-border",
    blurs: true,
  },
] as const;

/**
 * Geometry derived from the machine source. Nothing here is typed by hand — the
 * numbers are read from the DNA so a spec change cannot leave the CSS behind.
 */
export const SIGNATURE_GEOMETRY = {
  rail: {
    width: RAIL.widthRail,
    widthExpanded: RAIL.widthExpanded,
    itemSize: RAIL.itemSize,
    itemGap: RAIL.itemGap,
    iconSize: RAIL.iconSize,
    indicatorWidth: RAIL.activeIndicatorWidth,
  },
  command: {
    width: COMMAND.widthDesktop,
    widthTablet: COMMAND.widthTablet,
    widthMobile: COMMAND.widthMobile,
    height: COMMAND.height,
    heightMobile: COMMAND.heightMobile,
    markSize: COMMAND.markSize,
    paletteMaxHeight: COMMAND.paletteMaxHeight,
    paletteGroups: COMMAND.paletteGroups,
  },
  triad: {
    count: TRIAD.count,
    cardWidth: TRIAD.cardWidthDesktop,
    cardHeight: TRIAD.cardHeightDesktop,
    gap: TRIAD.gap,
    stackBelow: TRIAD.stackBelow,
    intents: TRIAD.intents.map((i) => i.key),
  },
  glass: {
    liftLadder: GLASS.liftLadder,
    interactiveScale: GLASS.interactiveScale,
  },
  beacon: {
    maxPrimaryPerView: BEACON.maxPrimaryPerView,
  },
  minTargetPx: MIN_TARGET_PX,
} as const;

/**
 * Horizon's surface policy, straight from the machine source. This is the part
 * of the signature most likely to be violated by accident: Horizon is
 * atmospheric and looks good in a screenshot, which is exactly why it must not
 * end up behind a telemetry table.
 */
export const HORIZON_POLICY = {
  permitted: HORIZON_PERMITTED_SURFACES,
  forbidden: HORIZON_FORBIDDEN_SURFACES,
  emberBandMaxHeightRatio: HORIZON.emberBandMaxHeightRatio,
  vignetteRequired: HORIZON.vignetteRequired,
} as const;

export const SIGNATURE_CONTRACT: readonly SignatureEntry[] = [
  {
    key: "horizon",
    name: "Hermes Horizon",
    cssVars: ["--color-horizon-ember-fade", "--color-horizon-ember-core"],
    usage:
      "The cinematic industrial atmosphere layer, permitted only on login, workspace-home and video-watch.",
    restriction:
      "Forbidden behind dense engineering data. No text or control sits directly on Horizon — content sits on a Glass tier composited over it. Never a foreground, status or chart colour.",
  },
  {
    key: "deep-navy",
    name: "Hermes Deep Navy",
    cssVars: [
      "--color-background-base",
      "--color-background-deep",
      "--color-surface-primary",
      "--color-surface-elevated",
      "--color-surface-interactive",
    ],
    usage:
      "The stable operational workspace — 70% of every screen. A pure alias layer over the Phase 87B surfaces.",
    restriction:
      "Introduces no new value. Deep Navy is the NAME of the shipped Obsidian family, not a second palette; adding a sixth surface here would fork the elevation model.",
  },
  {
    key: "glass",
    name: "Hermes Glass",
    cssVars: [
      "--glass-soft-fill",
      "--glass-soft-border",
      "--glass-card-fill-from",
      "--glass-card-border",
      "--glass-elevated-fill-from",
      "--glass-elevated-border",
      "--glass-hero-fill-from",
      "--glass-hero-border",
      "--glass-hero-backdrop",
    ],
    usage:
      "Controlled translucency in five tiers. Builds hierarchy: a view where every panel shares one opacity has no hierarchy at all.",
    restriction:
      "Only the hero tier blurs — the app tiers sit on a solid dark shell where blur samples nothing and only costs compositing time. Glass never goes on everything.",
  },
  {
    key: "edge",
    name: "Hermes Edge",
    cssVars: [
      "--edge-structural",
      "--edge-hairline",
      "--edge-active",
      "--edge-danger",
      "--edge-width",
      "--edge-illumination-from",
      "--edge-illumination-to",
      "--edge-illumination-span",
    ],
    usage:
      "Fine steel/ice borders and a restrained linear top highlight for edge illumination.",
    restriction:
      "Outer glow, bloom and coloured box-shadow spread are prohibited. The retired .glow-*, .text-glow* and .landing-scanlines utilities are not reinstated under a new name.",
  },
  {
    key: "beacon",
    name: "Hermes Beacon",
    cssVars: [
      "--beacon-core",
      "--beacon-rise",
      "--beacon-deep",
      "--beacon-halo",
      "--beacon-rim",
      "--beacon-wash",
      "--beacon-on",
      "--beacon-ring-width",
      "--beacon-ring-offset",
    ],
    usage:
      "The focused ice-blue highlight for command focus, intelligence and selected operational state.",
    restriction:
      "A focus device, never decoration: at most one primary Beacon per view. White text on Beacon cyan is prohibited — use --beacon-on.",
  },
  {
    key: "rail",
    name: "Hermes Rail",
    cssVars: [
      "--rail-width",
      "--rail-width-expanded",
      "--rail-item-size",
      "--rail-item-gap",
      "--rail-icon-size",
      "--rail-indicator-width",
      "--rail-surface",
      "--rail-edge",
    ],
    usage:
      "The minimal persistent navigation rail: icon-only at rest, label on hover, optional expanded drawer, bottom sheet on mobile.",
    restriction:
      "The active indicator sits on the inline start so it mirrors correctly in RTL. Labels must be reachable by keyboard focus, not hover alone.",
  },
  {
    key: "command",
    name: "Hermes Command",
    cssVars: [
      "--command-width",
      "--command-width-tablet",
      "--command-width-mobile",
      "--command-height",
      "--command-height-mobile",
      "--command-radius",
      "--command-mark-size",
      "--command-palette-max-height",
    ],
    usage:
      "The large AI command/search interaction — deliberately larger than any other control in the product.",
    restriction:
      "Keyboard traversal, Escape, focus return and screen-reader naming are part of the signature, not extras. A Command that cannot be closed from the keyboard is not this signature.",
  },
  {
    key: "triad",
    name: "Hermes Triad",
    cssVars: [
      "--triad-card-width",
      "--triad-card-height",
      "--triad-gap",
      "--triad-radius",
    ],
    usage:
      "The three primary Workspace cards — operate, understand, act — as a fixed composition.",
    restriction:
      "Exactly three, equal weight, one intent each. A fourth card added to fill a layout row destroys the composition.",
  },
];

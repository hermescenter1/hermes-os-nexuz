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
 * ── THE GLASS DIVERGENCE IS NOW CLOSED, BY OWNER DECISION ──
 * `GLASS.tiers` in the machine source used to be an aspirational specification
 * that did not match what ships — translucent fills behind a backdrop blur on
 * every tier. Phase 104-C tokenised the SHIPPED values and recorded the conflict
 * rather than picking a side, because adopting the spec numbers would have
 * changed how every card in the product renders.
 *
 * The owner has ruled: the restrained operational rendering is CANONICAL.
 * Operational cards stay filled and high-legibility; blur is reserved for hero
 * and overlay contexts; `interactive` shares the card surface recipe while
 * keeping its own deeper lift and the 1.012 scale. The machine source has been
 * updated to agree with the product, so the design source and the running
 * system no longer disagree, and the test now asserts they MATCH.
 *
 * ── COMPLETENESS IS THE PARITY PROPERTY ──
 * An earlier revision owned only nine of the twenty-six Glass variables.
 * External review set `--glass-card-fill-to` to magenta and all 93 assertions
 * still passed. `GLASS_VARIABLE_CONTRACT` below is complete, and the gate
 * requires SET EQUALITY with the active declarations parsed from the CSS, so an
 * added, removed, renamed or unowned variable fails — not merely a drifting one.
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
 * EVERY Glass variable the product declares, with its exact shipped value.
 *
 * This map is COMPLETE by contract, and completeness is the point. An earlier
 * revision owned only the nine variables named in the `glass` signature's
 * `cssVars`, which left seventeen — every sheen stop, inner highlight, drop
 * shadow and second fill stop — outside the gate. External review proved the
 * hole by setting `--glass-card-fill-to` to magenta: all 93 assertions still
 * passed while every card in the product would have rendered with a magenta
 * gradient. A parity gate that covers a subset of a family is not a parity gate.
 *
 * The companion test enumerates the ACTIVE `--glass-*` declarations from the
 * parsed CSS and requires set equality with these keys, so a variable that is
 * added, removed, renamed or left unowned fails, not merely one that drifts.
 */
export const GLASS_VARIABLE_CONTRACT: Readonly<Record<string, string>> =
  Object.freeze({
    // soft
    "--glass-soft-fill": "rgba(12, 23, 32, 0.72)",
    "--glass-soft-sheen-from": "rgba(237, 247, 250, 0.03)",
    "--glass-soft-border": "rgba(139, 244, 248, 0.07)",
    "--glass-soft-inner": "rgba(237, 247, 250, 0.05)",
    // card (shared by the interactive tier, which differs only in interaction)
    "--glass-card-fill-from": "rgba(17, 33, 44, 0.94)",
    "--glass-card-fill-to": "rgba(12, 23, 32, 0.90)",
    "--glass-card-sheen-from": "rgba(237, 247, 250, 0.05)",
    "--glass-card-sheen-mid": "rgba(237, 247, 250, 0.015)",
    "--glass-card-border": "rgba(139, 244, 248, 0.10)",
    "--glass-card-inner": "rgba(237, 247, 250, 0.07)",
    "--glass-card-drop": "0 2px 10px rgba(0, 0, 0, 0.28)",
    // elevated
    "--glass-elevated-fill-from": "rgba(20, 38, 50, 0.96)",
    "--glass-elevated-fill-to": "rgba(12, 23, 32, 0.92)",
    "--glass-elevated-sheen-from": "rgba(237, 247, 250, 0.07)",
    "--glass-elevated-sheen-mid": "rgba(237, 247, 250, 0.02)",
    "--glass-elevated-border": "rgba(139, 244, 248, 0.14)",
    "--glass-elevated-inner": "rgba(237, 247, 250, 0.09)",
    "--glass-elevated-drop": "0 8px 24px rgba(0, 0, 0, 0.40)",
    // hero — the only tier permitted to blur
    "--glass-hero-fill-from": "rgba(20, 38, 50, 0.88)",
    "--glass-hero-fill-to": "rgba(7, 16, 24, 0.82)",
    "--glass-hero-sheen-from": "rgba(237, 247, 250, 0.08)",
    "--glass-hero-sheen-mid": "rgba(237, 247, 250, 0.02)",
    "--glass-hero-border": "rgba(139, 244, 248, 0.16)",
    "--glass-hero-inner": "rgba(237, 247, 250, 0.10)",
    "--glass-hero-drop": "0 16px 48px rgba(0, 0, 0, 0.45)",
    "--glass-hero-backdrop": "blur(18px) saturate(1.25)",
  });

/**
 * The shipped Glass tiers. Values are looked up from `GLASS_VARIABLE_CONTRACT`
 * rather than restated, so there is exactly one place a Glass value is written
 * down. `blurs` is the tier-level policy the owner ruled canonical: blur is
 * reserved for hero and overlay contexts, never ordinary operational cards.
 */
export const SHIPPED_GLASS_TIERS = [
  { tier: "soft", fillVar: "--glass-soft-fill", borderVar: "--glass-soft-border", blurs: false },
  { tier: "card", fillVar: "--glass-card-fill-from", borderVar: "--glass-card-border", blurs: false },
  { tier: "elevated", fillVar: "--glass-elevated-fill-from", borderVar: "--glass-elevated-border", blurs: false },
  { tier: "hero", fillVar: "--glass-hero-fill-from", borderVar: "--glass-hero-border", blurs: true },
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
    // EVERY Glass variable, derived from the complete map above. Listing a
    // hand-picked subset here is precisely how seventeen variables ended up
    // ungated, so the list is no longer written by hand.
    cssVars: Object.keys(GLASS_VARIABLE_CONTRACT),
    usage:
      "Controlled, restrained translucency in five tiers. Builds hierarchy: a view where every panel shares one opacity has no hierarchy at all.",
    restriction:
      "Only the hero tier blurs — operational cards stay filled and high-legibility because blur samples nothing on a solid dark shell and only costs compositing time. Glass never goes on everything.",
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

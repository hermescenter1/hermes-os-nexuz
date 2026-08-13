/**
 * PHASE 104 — Hermes Design DNA product token contract (machine-derived).
 *
 * WHAT THIS IS
 * ------------
 * Phase 104 introduced eleven genuinely new colour values (`NEW_HUES`) in the
 * design-side machine source. Until this contract existed those values lived
 * ONLY in the Figma executor under `tools/` — the shipped product could not use
 * them, and nothing stopped the two layers from drifting apart. This file is the
 * bridge: it maps each of the eleven new hues onto exactly one CSS custom
 * property in `src/app/globals.css` and exactly one Tailwind key in
 * `tailwind.config.ts`, and it derives every value STRUCTURALLY from the machine
 * source rather than restating it.
 *
 * NO HEX LITERAL APPEARS BELOW. That is enforced, not merely intended:
 * `__tests__/phase104-token-contract.test.ts` greps this file's own source for a
 * six-digit hex and fails if one is found. A copied literal is exactly the drift
 * this contract exists to prevent, so copying one must break the build.
 *
 * RELATIONSHIP TO THE PHASE 87 CONTRACT
 * -------------------------------------
 * `token-contract.ts` is NOT touched by Phase 104 and must not be. It is pinned
 * to a different Figma file ("Hermes OS – Design System", node 12:4) and records
 * the Phase 87B canonical layer. Folding Phase 104 into it would assert a
 * traceability that does not exist — those eleven values were never in node 12:4.
 * The two contracts are additive siblings: Phase 87 owns the canonical layer,
 * Phase 104 owns the new semantic layer stacked on top of it.
 *
 * WHAT THIS INCREMENT DELIBERATELY DOES NOT DO
 * -------------------------------------------
 * It adds no component, no utility class and no visual change. After this change
 * the tokens are *available* and *gated*; nothing consumes them yet. Adoption is
 * a separate, independently revertible increment.
 *
 * ACCESSIBILITY CLASSIFICATION IS PART OF THE CONTRACT
 * ----------------------------------------------------
 * Each entry declares `textLegible` and `indicatorSafe`. These are ASSERTIONS
 * the test computes against every canonical surface — including the negative
 * ones.
 *
 * The negative claim is EXISTENTIAL, and stating it any stronger would be
 * false. Two of the three indicator-only values do clear 4.5:1 on the darkest
 * surfaces (`state-offline` measures 4.78 and 4.6 there, `state-maintenance`
 * 4.7 and 4.53); only `state-critical` is below 4.5:1 on all five. So the rule
 * this contract encodes is:
 *
 *   Indicator-only tokens are not universally text-safe across all canonical
 *   surfaces; failure on any supported surface prohibits their use as a general
 *   text token.
 *
 * `textLegible: false` therefore means "NOT safe as normal text on every
 * canonical surface", and the test asserts the value falls below 4.5:1 on at
 * least one of them. A component cannot pick its backdrop out of that set at
 * will, so a token that fails anywhere cannot be a general text token anywhere.
 *
 * Horizon is the one place the universal form is true and is asserted as such:
 * both ember values fall below even the 3:1 non-text threshold on EVERY surface
 * (max 2.14), which is what makes "never a foreground" checkable rather than
 * advisory.
 */

import {
  BASE_SURFACES,
  HORIZON,
  INDUSTRIAL_STATES,
  NEW_HUES,
  REASONING_LADDER,
} from "../../../tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js";

/** Provenance of every value in this file. */
export const PHASE104_DNA_SOURCE = {
  /** The Phase 104 Figma file the design side was executed into. */
  figmaFile: "QcJcRaBv1NMrgb4pMshEVB",
  /** The machine source this contract derives from, repo-relative. */
  machineSource:
    "tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js",
  /** The `main` commit this product integration was built on. */
  integrationBase: "b9424f3483aa0653dfeb014bef3d26fbae975bda",
  /** The written specification these values were approved against. */
  specification: "docs/design/phase-104/01-hermes-design-dna.md",
} as const;

/**
 * The canonical opaque surfaces every Phase 104 foreground is measured against,
 * taken from the machine source so the product and the Figma executor can never
 * disagree about what "worst case" means.
 */
export const PHASE104_BASE_SURFACES = BASE_SURFACES;

/**
 * How a token is allowed to be used.
 *  - `text`       readable type: the state/reasoning name rendered as words.
 *  - `indicator`  dots, bars, borders, chart marks — non-text UI (SC 1.4.11).
 *  - `atmosphere` background gradient stops only. Never a foreground, ever.
 */
export type Phase104TokenRole = "text" | "indicator" | "atmosphere";

export interface Phase104TokenEntry {
  /** Stable identifier used by the tests and the integration document. */
  key: string;
  /** Where the value comes from in the machine source — human-readable path. */
  dnaPath: string;
  /** CSS custom property declared in `src/app/globals.css`. */
  cssVar: string;
  /** Tailwind key under `theme.extend.colors`. */
  tailwind: string;
  role: Phase104TokenRole;
  /** Resolved from the machine source. Never typed by hand. */
  value: string;
  /** What the token is for. */
  usage: string;
  /** What the token must NOT be used for. */
  restriction: string;
  /**
   * Declared to clear 4.5:1 (WCAG 2.2 SC 1.4.3, normal text) on EVERY canonical
   * surface. `false` means NOT universally text-safe — the value falls below the
   * threshold on at least one canonical surface, which is asserted, and which
   * disqualifies it as a general text token even where it happens to pass.
   */
  textLegible: boolean;
  /**
   * Declared to clear 3:1 (SC 1.4.11, non-text contrast) on EVERY canonical
   * surface. `false` means the value is atmosphere-only.
   */
  indicatorSafe: boolean;
}

/** Lower-cased set of the eleven values Phase 104 is allowed to introduce. */
const NEW_HUE_VALUES: ReadonlySet<string> = new Set(
  NEW_HUES.map((h) => h.value.toLowerCase()),
);

/**
 * Fail closed. A mapped value that is not one of the eleven declared new hues is
 * a value nobody justified, audited or applied to Figma — it must never reach
 * `globals.css` through this contract, so resolution throws at module load.
 */
function fromNewHues(dnaPath: string, value: string | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Phase 104 token contract: ${dnaPath} did not resolve to a value in ` +
        `${PHASE104_DNA_SOURCE.machineSource}. The machine source changed shape.`,
    );
  }
  if (!NEW_HUE_VALUES.has(value.toLowerCase())) {
    throw new Error(
      `Phase 104 token contract: ${dnaPath} resolved to ${value}, which is not ` +
        `declared in NEW_HUES. Every value this contract publishes must carry a ` +
        `written justification in ${PHASE104_DNA_SOURCE.machineSource}.`,
    );
  }
  return value;
}

/** Structural lookup into the industrial state ladder. */
function stateValue(key: string, field: "fill" | "text"): string {
  const entry = INDUSTRIAL_STATES.find((s) => s.key === key);
  return fromNewHues(`INDUSTRIAL_STATES[${key}].${field}`, entry?.[field]);
}

/** Structural lookup into the reasoning ladder. */
function reasoningText(key: string): string {
  const entry = REASONING_LADDER.find((r) => r.key === key);
  return fromNewHues(`REASONING_LADDER[${key}].text`, entry?.text);
}

/** Structural lookup into the Horizon gradient stops. */
function horizonStop(role: string): string {
  const stop = HORIZON.stops.find((s) => s.role === role);
  return fromNewHues(`HORIZON.stops[${role}].value`, stop?.value);
}

/**
 * The eleven Phase 104 product tokens — one per entry in `NEW_HUES`, no more and
 * no fewer. One-to-one coverage is asserted by the companion test.
 */
export const PHASE104_TOKEN_CONTRACT: readonly Phase104TokenEntry[] = [
  // ── Industrial state ladder ───────────────────────────────────────────────
  {
    key: "state-degraded",
    dnaPath: "INDUSTRIAL_STATES[degraded].fill",
    cssVar: "--color-state-degraded",
    tailwind: "state-degraded",
    role: "indicator",
    value: stateValue("degraded", "fill"),
    usage:
      "DEGRADED — the asset is still running but below nominal. Industrial Brass sits deliberately between success green and warning amber.",
    restriction:
      "Not a substitute for WARNING. DEGRADED means 'below nominal', WARNING means 'act now'; collapsing them erases an operational distinction on every asset tile.",
    textLegible: true,
    indicatorSafe: true,
  },
  {
    key: "state-critical",
    dnaPath: "INDUSTRIAL_STATES[critical].fill",
    cssVar: "--color-state-critical",
    tailwind: "state-critical",
    role: "indicator",
    value: stateValue("critical", "fill"),
    usage:
      "CRITICAL indicator — the top of the severity ladder, which must visibly outrank ALARM. Dots, bars, borders and chart marks only.",
    restriction:
      "Not universally text-safe: it is below 4.5:1 on all five canonical surfaces, so render the word 'Critical' in --color-state-critical-text instead. Always pair with the non-colour cue (double outline + cross glyph).",
    textLegible: false,
    indicatorSafe: true,
  },
  {
    key: "state-critical-text",
    dnaPath: "INDUSTRIAL_STATES[critical].text",
    cssVar: "--color-state-critical-text",
    tailwind: "state-critical-text",
    role: "text",
    value: stateValue("critical", "text"),
    usage:
      "The readable partner of CRITICAL — used wherever the state name is rendered as type.",
    restriction:
      "Not the indicator colour. A dot or bar drawn in this lighter tint would read as less severe than ALARM.",
    textLegible: true,
    indicatorSafe: true,
  },
  {
    key: "state-maintenance",
    dnaPath: "INDUSTRIAL_STATES[maintenance].fill",
    cssVar: "--color-state-maintenance",
    tailwind: "state-maintenance",
    role: "indicator",
    value: stateValue("maintenance", "fill"),
    usage:
      "MAINTENANCE indicator — a planned, non-fault state. Deliberately desaturated so it recedes rather than alerting.",
    restriction:
      "Not universally text-safe: it clears 4.5:1 only on the two darkest canonical surfaces and fails on the other three, so use --color-state-maintenance-text for type. Must not read as --color-status-information: maintenance is not telemetry.",
    textLegible: false,
    indicatorSafe: true,
  },
  {
    key: "state-maintenance-text",
    dnaPath: "INDUSTRIAL_STATES[maintenance].text",
    cssVar: "--color-state-maintenance-text",
    tailwind: "state-maintenance-text",
    role: "text",
    value: stateValue("maintenance", "text"),
    usage: "The readable partner of MAINTENANCE for the state name as type.",
    restriction:
      "Not the indicator colour — it is a full luminance step brighter and would break the recessive intent of the state.",
    textLegible: true,
    indicatorSafe: true,
  },
  {
    key: "state-offline",
    dnaPath: "INDUSTRIAL_STATES[offline].fill",
    cssVar: "--color-state-offline",
    tailwind: "state-offline",
    role: "indicator",
    value: stateValue("offline", "fill"),
    usage:
      "OFFLINE indicator — a real operational state (the device is not reachable), one luminance step below the UNKNOWN grey so the two never collapse.",
    restriction:
      "Not universally text-safe: it clears 4.5:1 only on the two darkest canonical surfaces and fails on the other three, so the state name uses --color-text-metadata. May NOT borrow --color-text-disabled: OFFLINE is a plant condition, not a disabled control, and the disabled token sits below SC 1.4.11.",
    textLegible: false,
    indicatorSafe: true,
  },

  // ── Reasoning ladder (Industrial Brain) ───────────────────────────────────
  {
    key: "reasoning-evidence-text",
    dnaPath: "REASONING_LADDER[evidence].text",
    cssVar: "--color-reasoning-evidence-text",
    tailwind: "reasoning-evidence-text",
    role: "text",
    value: reasoningText("evidence"),
    usage:
      "EVIDENCE rendered as type. The canonical --color-reasoning-evidence stays the indicator/border; this keeps the words legible.",
    restriction:
      "Does not change what EVIDENCE means. It may only carry text for a claim that is genuinely traceable to a source record.",
    textLegible: true,
    indicatorSafe: true,
  },
  {
    key: "reasoning-hypothesis-text",
    dnaPath: "REASONING_LADDER[hypothesis].text",
    cssVar: "--color-reasoning-hypothesis-text",
    tailwind: "reasoning-hypothesis-text",
    role: "text",
    value: reasoningText("hypothesis"),
    usage:
      "HYPOTHESIS / candidate / simulation result rendered as type, lifted clear of the razor-thin margin the canonical violet carries.",
    restriction:
      "Colour alone must never separate a hypothesis from a fact. The mandatory dashed border and provenance chip are not optional and are not replaced by this token.",
    textLegible: true,
    indicatorSafe: true,
  },
  {
    key: "reasoning-contradiction-text",
    dnaPath: "REASONING_LADDER[contradiction].text",
    cssVar: "--color-reasoning-contradiction-text",
    tailwind: "reasoning-contradiction-text",
    role: "text",
    value: reasoningText("contradiction"),
    usage:
      "CONFLICT rendered as type — evidence that contradicts the selected hypothesis.",
    restriction:
      "Not an alarm colour. A contradiction is an epistemic state, not a plant severity, and must not be styled as one.",
    textLegible: true,
    indicatorSafe: true,
  },

  // ── Horizon atmosphere (background gradient stops only) ───────────────────
  {
    key: "horizon-ember-fade",
    dnaPath: "HORIZON.stops[emberFade].value",
    cssVar: "--color-horizon-ember-fade",
    tailwind: "horizon-ember-fade",
    role: "atmosphere",
    value: horizonStop("emberFade"),
    usage:
      "The mid gradient stop that carries the ember band back into Obsidian without a visible banding edge.",
    restriction:
      "PROHIBITED as a foreground: never text, never an icon, never a border, never a data-surface fill. Permitted only inside the Horizon gradient, which itself is permitted only on the Horizon surfaces and never behind dense engineering data.",
    textLegible: false,
    indicatorSafe: false,
  },
  {
    key: "horizon-ember-core",
    dnaPath: "HORIZON.stops[emberCore].value",
    cssVar: "--color-horizon-ember-core",
    tailwind: "horizon-ember-core",
    role: "atmosphere",
    value: horizonStop("emberCore"),
    usage:
      "The sun band — the single warm value in the entire system, capped by the ember-band height ratio and always behind the mandatory vignette.",
    restriction:
      "PROHIBITED as a foreground, exactly as ember fade. Text never sits directly on Horizon; it sits on a Hermes Glass surface composited over it.",
    textLegible: false,
    indicatorSafe: false,
  },
];

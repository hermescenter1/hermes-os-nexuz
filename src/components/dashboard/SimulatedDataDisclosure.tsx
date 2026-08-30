/**
 * PHASE 109-B0 — structural disclosure for the main Executive Dashboard.
 *
 * Before B0 this screen rendered synthetic OEE, alarms, PLC scan times and
 * SCADA latency with no disclosure of its own: the only marker was a small
 * badge in the page header, which does not travel with the values, does not
 * appear in a cropped screenshot, and says nothing to a screen-reader user
 * reading an individual number. The Industrial Dashboard's hard-coded
 * "Simulated" labels are a different screen and never covered this one.
 *
 * Five layers are implemented here and consumed by DashboardClient:
 *
 *   1. `SimulatedModeChip`      — a persistent, high-contrast mode chip that
 *                                 stays visible while the operational surface
 *                                 scrolls, exposed to assistive technology as a
 *                                 status.
 *   2. `SimulatedWatermark`     — a visible, repeated SIMULATED DATA watermark
 *                                 laid over the operational surface, so a
 *                                 screenshot of any region carries the stamp.
 *   3. `SimulatedValue`         — wraps one operational value and puts the
 *                                 simulated marker into that value's own
 *                                 ACCESSIBLE NAME, not merely next to it.
 *   4. `SimulatedStatus` /      — a snapshot-derived STATE or a graphical
 *      `SimulatedBar`             representation. Correction round 2: a bare
 *                                 coloured dot and a bare progress bar carried
 *                                 no accessible meaning at all, so neither the
 *                                 state nor its disclosure reached a
 *                                 screen-reader user, and the state was legible
 *                                 only by hue. Both now carry a shape, a
 *                                 localized word and the marker.
 *   5. `SimulatedProvenanceNote` — the frame's structural provenance rendered
 *                                 as text.
 *
 * Colour is never the disclosure. Every layer carries words.
 *
 * SNAPSHOT PATHS. Every element that renders something derived from the frame's
 * snapshot also carries `data-hermes-snapshot-path`, naming the leaf it came
 * from (`lines[0].id`, `temperature[0].tag`, …). That turns the disclosure gate
 * from "everything already tagged is tagged" — which is true by construction —
 * into an inventory the test can compare against an expected SET, so an output
 * that is never wrapped is a missing path rather than an invisible omission.
 */

import type { ReactNode } from "react";
import type {
  DashboardSnapshot,
  DeviceStatus,
  HealthStatus,
  LineStatus,
} from "@/lib/services/types";

/** Stable hooks for the disclosure gates; also used by the browser evidence run. */
export const SIMULATED_MODE_ATTR = "data-hermes-simulated-mode";
export const SIMULATED_CHIP_ATTR = "data-hermes-simulated-chip";
export const SIMULATED_WATERMARK_ATTR = "data-hermes-simulated-watermark";
export const OPERATIONAL_VALUE_ATTR = "data-hermes-operational-value";
export const SNAPSHOT_PATH_ATTR = "data-hermes-snapshot-path";

/**
 * Persistent mode chip. `role="status"` puts it in the accessibility tree with
 * its own accessible name, so a disclosure gate can read it from computed
 * semantics rather than from raw page text.
 */
export function SimulatedModeChip({
  label,
  detail,
}: {
  /** e.g. "Simulated data" — the mode itself, never a colour. */
  label: string;
  /** Short qualifier, e.g. "no plant is connected". */
  detail: string;
}) {
  return (
    <div className="hermes-sim-chip-bar" {...{ [SIMULATED_MODE_ATTR]: "SIMULATED" }}>
      <p className="hermes-sim-chip" role="status" {...{ [SIMULATED_CHIP_ATTR]: "true" }}>
        <span aria-hidden="true" className="hermes-sim-chip__glyph">
          ▲
        </span>
        <span className="hermes-sim-chip__label">{label}</span>
        <span className="hermes-sim-chip__detail">{detail}</span>
      </p>
    </div>
  );
}

/**
 * Visible watermark tiled across the operational surface.
 *
 * Hidden from assistive technology on purpose: layer 3 already puts the marker
 * into every value's accessible name, and repeating the same phrase in the
 * accessibility tree would bury the operational content. Its job is to survive a
 * screenshot, and it does that visually.
 *
 * COVERAGE IS THE POINT, and it is measured rather than guessed. A tile row is
 * about 136px (an 88px tile plus the 3rem row gap). The rendered surface runs
 * 3,800px at 1440 to 6,000px at 320, where a tile occupies its own row — so the
 * worst case needs roughly 44 rows, and the widest case roughly 30 rows of four.
 * MEASURED, then corrected: 140 covered every cell except Persian at 390px, where
 * two tiles share a row and the reach halved to 59% of a 9,026px surface. 320
 * clears the worst case with margin; the surface clips the surplus, so
 * over-provisioning is free.
 * The first version shipped 24, which covered only the top ~800px and left the
 * KPI band, the alarm summary and the control systems column unstamped.
 */
export function SimulatedWatermark({ label, tiles = 320 }: { label: string; tiles?: number }) {
  return (
    <div
      className="hermes-sim-watermark"
      aria-hidden="true"
      {...{ [SIMULATED_WATERMARK_ATTR]: label }}
    >
      {Array.from({ length: tiles }, (_, i) => (
        <span key={i} className="hermes-sim-watermark__tile">
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * One operational value, with the simulated marker inside its own accessible
 * name.
 *
 * The marker is visually hidden but PRESENT in the accessibility tree — it is
 * `sr-only`, not `aria-hidden` and not `display:none` — so a computed
 * accessible name for this element ends with the marker in every locale. That
 * is what the disclosure gate reads.
 */
export function SimulatedValue({
  children,
  marker,
  path,
  className,
  dir,
  as: Tag = "span",
}: {
  children: ReactNode;
  /** Localized marker, e.g. "simulated value". */
  marker: string;
  /** The snapshot leaf this value came from, e.g. `lines[0].throughput`. */
  path?: string;
  className?: string;
  dir?: "ltr" | "rtl" | "auto";
  as?: "span" | "p" | "div" | "li";
}) {
  return (
    <Tag
      className={className}
      dir={dir}
      {...{ [OPERATIONAL_VALUE_ATTR]: "simulated", [SNAPSHOT_PATH_ATTR]: path }}
    >
      {children}
      <span className="sr-only">{" "}{marker}</span>
    </Tag>
  );
}

/**
 * A snapshot-derived STATE.
 *
 * This replaces a bare `aria-hidden` coloured dot, which failed twice over: the
 * state was carried by hue alone, and it reached the accessibility tree not at
 * all — so neither the value nor its disclosure existed for a screen-reader
 * user. The glyph is the shape channel (distinguishable in greyscale and in
 * print), the visually-hidden text is the word channel, and the marker travels
 * with both.
 */
/**
 * PHASE 104-I.D / D.0-R3 — the accepted status/tone TYPE discipline, ported.
 *
 * Phase 104-I.D2 split one `Record<string, string>` into per-domain records
 * keyed by closed unions, because the single record served lifecycle status AND
 * risk-trend direction at once: the literal `"down"` mapped to the SUCCESS
 * accent, which is correct for falling risk and dangerously wrong for a device
 * that is down. Keyed by `string`, both readings type-checked.
 *
 * That discipline is re-established here, on the component newer main actually
 * uses. `StatusDot` is NOT restored — it carried state by hue alone and was
 * `aria-hidden`, and removing it was deliberate. What is ported is the typing,
 * not the component.
 *
 * The tone vocabulary is not invented: `signal | muted | warn | danger` are the
 * accepted values read off the Phase 104 tables, and the class strings they map
 * to are the accepted ones. A caller now names a SEMANTIC tone and cannot pass
 * an arbitrary class, so tone is no longer a free string arriving from a lookup
 * that might have missed.
 */
export type StatusTone = "signal" | "muted" | "warn" | "danger";

/** The single place a tone becomes a colour. */
export const STATUS_TONE_CLASS = {
  signal: "text-signal",
  muted: "text-muted",
  warn: "text-warn",
  danger: "text-danger",
} satisfies Record<StatusTone, string>;

/**
 * Every status value this component can be asked to render — the union of the
 * three snapshot domains that actually reach it.
 *
 * `risk.trend` is deliberately NOT a member. It is a direction, not a lifecycle
 * state, it never reaches `SimulatedStatus`, and folding it in here is exactly
 * how the two meanings of `"down"` collided in the first place.
 */
export type SimulatedStatusValue = LineStatus | DeviceStatus | HealthStatus;

/**
 * The shape channel. `satisfies` keeps the literal glyph types while making the
 * record exhaustive over the union: adding a status without a glyph fails the
 * build instead of silently falling back to a generic dot.
 */
export const STATUS_GLYPH = {
  running: "▶",
  online: "●",
  ok: "●",
  idle: "◌",
  warning: "▲",
  degraded: "▲",
  fault: "■",
  offline: "■",
} satisfies Record<SimulatedStatusValue, string>;

/** Direction of the RISK score, taken from the snapshot rather than restated. */
export type RiskTrend = DashboardSnapshot["risk"]["trend"];

/**
 * Status tone, split by semantic domain.
 *
 * Each domain is keyed by its own closed union and valued by the closed tone
 * union, so a status can only be coloured by the meaning it actually has, every
 * key is exhaustive, and a new member of any union fails the build instead of
 * silently rendering unstyled.
 *
 * The tables live here rather than in the consumer because the tone vocabulary,
 * the glyph table and the mappings are one contract: splitting them across
 * modules is how a status came to have a glyph but no tone.
 */
export const LINE_TONE: Record<LineStatus, StatusTone> = {
  running: "signal",
  idle: "muted",
  fault: "danger",
};

export const DEVICE_TONE: Record<DeviceStatus, StatusTone> = {
  online: "signal",
  offline: "danger",
  fault: "danger",
};

export const HEALTH_TONE: Record<HealthStatus, StatusTone> = {
  ok: "signal",
  warning: "warn",
  degraded: "warn",
};

/** Falling risk is the good outcome, which is why this is its own domain. */
export const RISK_TREND_TONE: Record<RiskTrend, StatusTone> = {
  up: "danger",
  down: "signal",
  flat: "muted",
};

export function SimulatedStatus({
  status,
  label,
  marker,
  path,
  tone,
}: {
  /**
   * The snapshot enum, used to choose the shape.
   *
   * UNTRUSTED_RUNTIME_STATUS never reaches this prop: `validateDashboardFrame`
   * checks every status against its closed union and REJECTS the whole frame
   * fail-closed, so what arrives here is TYPE_SAFE_INTERNAL_STATUS. That is why
   * there is no generic-dot fallback below — a valid status without a glyph is
   * now a build failure rather than an invisible one.
   */
  status: SimulatedStatusValue;
  /** The LOCALIZED status word. */
  label: string;
  marker: string;
  path: string;
  /** Semantic tone, not a class name. */
  tone: StatusTone;
}) {
  return (
    <span
      className={`hermes-sim-status ${STATUS_TONE_CLASS[tone]}`}
      {...{ [OPERATIONAL_VALUE_ATTR]: "simulated", [SNAPSHOT_PATH_ATTR]: path }}
    >
      <span aria-hidden="true" className="hermes-sim-status__glyph">
        {STATUS_GLYPH[status]}
      </span>
      <span className="sr-only">{label} {marker}</span>
    </span>
  );
}

/**
 * A snapshot-derived proportion drawn as a bar.
 *
 * `role="img"` with an `aria-label` gives the graphic a single accessible name
 * instead of leaving it as an unlabelled decorative div — the same treatment a
 * chart needs. The label is composed by the caller from copy that is already
 * localized, and it ends with the marker.
 */
export function SimulatedBar({
  fillPct,
  background,
  label,
  path,
  trackClassName = "h-1 rounded bg-line",
  fillClassName = "h-1 rounded",
}: {
  fillPct: number;
  background: string;
  /** Already-localized description INCLUDING the simulated marker. */
  label: string;
  path: string;
  trackClassName?: string;
  fillClassName?: string;
}) {
  return (
    <div
      className={trackClassName}
      role="img"
      aria-label={label}
      {...{ [OPERATIONAL_VALUE_ATTR]: "simulated", [SNAPSHOT_PATH_ATTR]: path }}
    >
      <div
        className={fillClassName}
        style={{ inlineSize: `${Math.max(0, Math.min(fillPct, 100))}%`, background }}
      />
    </div>
  );
}

export interface SimulatedProvenanceNoteProps {
  title: string;
  /** Scenario / source identity — recognisably synthetic. */
  scenarioLabel: string;
  scenarioValue: string;
  classificationLabel: string;
  classificationValue: string;
  connectionLabel: string;
  connectionValue: string;
  qualityLabel: string;
  qualityValue: string;
  acquisitionLabel: string;
  acquisitionValue: string;
  receivedLabel: string;
  receivedValue: string;
  adapterLabel: string;
  adapterValue: string;
  body: string;
}

/**
 * The frame's provenance, rendered. Every field here comes from the classified
 * frame itself, so the screen cannot display provenance the data does not
 * carry.
 */
export function SimulatedProvenanceNote(props: SimulatedProvenanceNoteProps) {
  const rows: [string, string, ("ltr" | undefined)][] = [
    [props.scenarioLabel, props.scenarioValue, undefined],
    [props.classificationLabel, props.classificationValue, "ltr"],
    [props.connectionLabel, props.connectionValue, "ltr"],
    [props.qualityLabel, props.qualityValue, "ltr"],
    [props.acquisitionLabel, props.acquisitionValue, "ltr"],
    [props.receivedLabel, props.receivedValue, "ltr"],
    [props.adapterLabel, props.adapterValue, "ltr"],
  ];
  return (
    <section className="hermes-sim-provenance" aria-label={props.title}>
      <p className="type-eyebrow mb-2">{props.title}</p>
      <p className="font-body text-xs leading-relaxed text-muted mb-3">{props.body}</p>
      <dl className="hermes-sim-provenance__grid">
        {rows.map(([label, value, d]) => (
          <div key={label} className="hermes-sim-provenance__row">
            <dt className="kpi-label">{label}</dt>
            <dd className="font-mono text-[0.7rem] text-ink" dir={d}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

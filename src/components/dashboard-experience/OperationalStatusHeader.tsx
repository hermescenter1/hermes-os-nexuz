import { cn } from "@/components/ds";
import { POSTURE_TONE, type DashboardPosture } from "./severity";

// PHASE 87F — operational status header. Shows the derived operational posture
// (from real severity counts), a concise summary, active-lines context, and a
// truthful last-updated line. NO fake "real-time" label: the source is
// simulated telemetry and the note says so; freshness is the real snapshot ts.

export interface OperationalStatusHeaderProps {
  posture: DashboardPosture;
  postureLabel: string;
  summaryTitle: string;
  summaryNote: string;
  linesLabel: string;
  lastUpdatedLabel: string;
  lastUpdatedValue: string; // pre-formatted, LTR
  autoNote: string;
  /**
   * PHASE 109-B0 — optional, visually hidden marker appended to the values
   * derived from the operational snapshot (posture, active lines, freshness),
   * so each carries the marker in its OWN accessible name. Consumers rendering
   * real data omit it and render exactly as before.
   */
  valueMarker?: string;
  /** Snapshot-path prefix, e.g. "command". Emitted only alongside valueMarker. */
  pathPrefix?: string;
}

export function OperationalStatusHeader(props: OperationalStatusHeaderProps) {
  const tone = POSTURE_TONE[props.posture];
  const mark = props.valueMarker ? <span className="sr-only"> {props.valueMarker}</span> : null;
  const markAttr = props.valueMarker ? "simulated" : undefined;
  const p = (leaf: string) =>
    props.valueMarker && props.pathPrefix ? `${props.pathPrefix}.${leaf}` : undefined;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border bg-surface-primary p-4 md:flex-row md:items-center md:justify-between",
        tone.ring,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 flex items-center gap-2">
          <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 rounded-full", tone.dot)} />
        </span>
        <div>
          <p className="flex items-center gap-2 text-body-compact font-semibold">
            <span className="text-text-muted">{props.summaryTitle}</span>
            <span className={tone.text} dir="auto" data-hermes-operational-value={markAttr} data-hermes-snapshot-path={p("posture")}>· {props.postureLabel}{mark}</span>
          </p>
          <p
            className="mt-0.5 text-caption text-text-secondary"
            dir="auto"
            data-hermes-operational-value={markAttr}
            data-hermes-snapshot-path={p("summaryNote")}
          >
            {props.summaryNote}
            {mark}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1 md:items-end">
        <p className="text-caption font-medium text-text-secondary" dir="auto" data-hermes-operational-value={markAttr} data-hermes-snapshot-path={p("activeLines")}>{props.linesLabel}{mark}</p>
        <p className="text-caption text-text-muted">
          {props.lastUpdatedLabel}{" "}
          <span dir="ltr" className="tabular-nums" data-hermes-operational-value={markAttr} data-hermes-snapshot-path={p("lastUpdated")}>{props.lastUpdatedValue}{mark}</span>
        </p>
        <p className="text-caption text-text-muted" dir="auto">{props.autoNote}</p>
      </div>
    </div>
  );
}

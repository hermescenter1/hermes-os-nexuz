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
}

export function OperationalStatusHeader(props: OperationalStatusHeaderProps) {
  const tone = POSTURE_TONE[props.posture];
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
            <span className={tone.text} dir="auto">· {props.postureLabel}</span>
          </p>
          <p className="mt-0.5 text-caption text-text-secondary" dir="auto">{props.summaryNote}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1 md:items-end">
        <p className="text-caption font-medium text-text-secondary" dir="auto">{props.linesLabel}</p>
        <p className="text-caption text-text-muted">
          {props.lastUpdatedLabel}{" "}
          <span dir="ltr" className="tabular-nums">{props.lastUpdatedValue}</span>
        </p>
        <p className="text-caption text-text-muted" dir="auto">{props.autoNote}</p>
      </div>
    </div>
  );
}

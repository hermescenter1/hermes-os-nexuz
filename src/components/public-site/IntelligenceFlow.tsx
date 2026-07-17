import { cn } from "@/components/ds";

// PHASE 87D — the explainable pipeline row (evidence → … → safe action) and
// the safe-action gate sequence. An ordered list carries the sequence in DOM
// order; the arrows are purely decorative (aria-hidden) and flip under RTL so
// the flow always reads in the writing direction (Figma FA handoff: «←»).

export interface IntelligenceFlowStage {
  key: string;
  label: string;
  /** Visually emphasized stage (e.g. Safe Action Path / Human Approval). */
  emphasis?: boolean;
}

export interface IntelligenceFlowProps {
  stages: readonly IntelligenceFlowStage[];
  /** "chips" renders bordered stage chips (safe-action gates); "text" the plain pipeline row. */
  appearance?: "text" | "chips";
  className?: string;
}

export function IntelligenceFlow({ stages, appearance = "text", className }: IntelligenceFlowProps) {
  return (
    <ol className={cn("flex flex-wrap items-center gap-y-3", className)}>
      {stages.map((stage, index) => (
        <li key={stage.key} className="flex items-center">
          {index > 0 ? (
            <span aria-hidden="true" className="mx-2.5 text-text-muted rtl:-scale-x-100 md:mx-3.5">
              →
            </span>
          ) : null}
          <span
            className={cn(
              appearance === "chips" && "rounded-xs border px-3 py-1.5",
              appearance === "chips" &&
                (stage.emphasis
                  ? "border-brand-border bg-brand-subtle"
                  : "border-border-default bg-surface-primary"),
              "text-label",
              stage.emphasis ? "font-bold text-brand-primary" : "font-semibold text-text-secondary",
            )}
            dir="auto"
          >
            {stage.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

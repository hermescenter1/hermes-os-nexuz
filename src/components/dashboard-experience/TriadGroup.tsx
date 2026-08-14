import type { ReactNode } from "react";
import { cn } from "@/components/ds";

// PHASE 104-D2 — Hermes Triad, the Workspace Home decision hierarchy.
//
// Three intents, fixed, in decision order: what is happening (operate), what
// the evidence says (understand), what a human may safely do next (act). This
// is deliberately NOT a generic card grid — the count is part of the
// composition, so the intent union has exactly three members and a fourth
// cannot be added without changing this type and failing the 104-D2 gate.
//
// The group is a presentational wrapper. It fetches nothing, decides nothing
// and adds no capability: every child is existing Dashboard content that was
// already rendered from the already-authorized telemetry snapshot.

/** The three Hermes Triad intents. Adding a fourth is a contract change. */
export type TriadIntent = "operate" | "understand" | "act";

export interface TriadGroupProps {
  intent: TriadIntent;
  /**
   * Region id. The heading becomes `${id}-title`, matching the convention
   * `DashboardSection` established, so landmarks that were already addressable
   * as `section[aria-labelledby="attention-title"]` keep working. Defaults to
   * the intent when a group has no pre-existing anchor.
   */
  id?: string;
  /** The group's visible heading — an existing, already-translated label. */
  title: string;
  /**
   * Marks the intent that currently needs a decision. At most one group in the
   * Triad may carry it, matching the Beacon's "one primary per view" rule.
   * Purely additive emphasis: it never replaces a textual or structural state
   * channel, because colour may not be the only channel.
   */
  beacon?: boolean;
  /** Short, non-heading context line. Optional. */
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function TriadGroup({
  intent,
  id,
  title,
  beacon = false,
  note,
  children,
  className,
}: TriadGroupProps) {
  const headingId = `${id ?? `triad-${intent}`}-title`;
  return (
    <section
      aria-labelledby={headingId}
      data-hermes-signature="triad-group"
      data-triad-intent={intent}
      data-beacon={beacon ? "true" : undefined}
      className={cn("hermes-triad-group flex flex-col gap-3 p-4", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="text-title font-semibold text-text-primary">
          {title}
        </h2>
        {/* The Beacon's textual partner. The bar on the group's inline start is
            the geometric channel; this word is the one screen readers and
            greyscale users get. Colour is never carrying this alone. */}
        {beacon ? (
          <span className="shrink-0 text-label-compact font-semibold text-brand-primary">
            {note}
          </span>
        ) : null}
      </div>
      {!beacon && note ? (
        <p className="text-body-compact text-text-secondary">{note}</p>
      ) : null}
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * The canonical intent order. Exported so the composition and the gate read the
 * same source rather than agreeing by coincidence.
 */
export const TRIAD_INTENTS: readonly TriadIntent[] = ["operate", "understand", "act"];

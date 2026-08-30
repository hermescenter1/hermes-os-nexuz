/**
 * PHASE 104-I.D2 — Provenance + freshness.
 *
 * Answers, in the surface itself, the three questions the data contract demands
 * of every number on screen: where it came from, when it was computed, and
 * whether the user may act on it. Freshness of `unknown` prints as unknown —
 * there is no code path here that turns an unparseable timestamp into a
 * plausible age.
 */
import type { Freshness } from "./alarm-state";

export function ProvenanceFooter({
  sourceLabel,
  builtLabel,
  freshness,
  freshLabel,
  staleLabel,
  unknownLabel,
  readOnlyLabel,
}: {
  sourceLabel:   string;
  /** Formatted build time, or null when `builtAt` could not be parsed. */
  builtLabel:    string | null;
  freshness:     Freshness;
  freshLabel:    string;
  staleLabel:    string;
  unknownLabel:  string;
  readOnlyLabel: string;
}) {
  const state =
    freshness.kind === "stale" ? staleLabel
    : freshness.kind === "unknown" ? unknownLabel
    : freshLabel;

  const tone =
    freshness.kind === "stale" ? "text-warn"
    : freshness.kind === "unknown" ? "text-metadata"
    : "text-muted";

  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
      <span className="kpi-label text-metadata">{sourceLabel}</span>
      <span className={`kpi-label ${tone}`}>{state}</span>
      {builtLabel !== null && (
        <time className="font-mono text-caption text-metadata" dir="ltr">
          {builtLabel}
        </time>
      )}
      <span className="kpi-label text-metadata">{readOnlyLabel}</span>
    </footer>
  );
}

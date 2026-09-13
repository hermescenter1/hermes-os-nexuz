/**
 * PHASE 109-C-UI.3 — the connectivity badge.
 *
 * A SERVER component. There is no state, no effect and no timer here, and that
 * is deliberate: a control room that animates permanently trains the eye to
 * ignore it, and a badge that polls would make the page open network traffic it
 * has no data to justify.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Every badge carries its own text, and the
 * reason sits beside it. An operator reading this on a sunlit panel, or with a
 * colour vision deficiency, gets the same information as everyone else.
 */

import type { ConnectivityVerdict, ConnectivityState } from "@/lib/scada-control-room/contract";

/**
 * Ice-blue for healthy, amber for degraded, red for disconnected, slate for
 * unknown. Unknown is deliberately NOT amber: "we cannot see" and "it is
 * struggling" are different messages and must not share a colour.
 */
const TONE: Record<ConnectivityState, string> = {
  CONNECTED: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  DEGRADED: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  NOT_CONNECTED: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  UNKNOWN: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

/** A filled, half-filled, hollow or dashed ring — shape, not just colour. */
const GLYPH: Record<ConnectivityState, string> = {
  CONNECTED: "●",
  DEGRADED: "◐",
  NOT_CONNECTED: "○",
  UNKNOWN: "◌",
};

export function ConnectivityBadge({
  verdict,
  label,
}: {
  verdict: ConnectivityVerdict;
  /** Already translated by the caller; this component holds no strings. */
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${TONE[verdict.state]}`}
      // The glyph is decorative; the text beside it is the accessible name.
      data-state={verdict.state}
      data-reason={verdict.reason}
    >
      <span aria-hidden="true">{GLYPH[verdict.state]}</span>
      {label}
    </span>
  );
}

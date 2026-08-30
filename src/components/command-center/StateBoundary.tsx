/**
 * PHASE 104-I.D2 — the honest-state primitive.
 *
 * Every non-data outcome an authenticated surface can reach renders through
 * here, so "the request failed" can never be styled like "everything is fine".
 * `tone` is a closed union: there is deliberately NO tone that paints an
 * unknown or failed state in the success accent.
 */
import type { ReactNode } from "react";

export type StateTone = "neutral" | "warning" | "danger";

const TONE_BORDER: Record<StateTone, string> = {
  neutral: "border-line",
  warning: "border-warn/30",
  danger:  "border-danger/30",
};

const TONE_TITLE: Record<StateTone, string> = {
  neutral: "text-ink",
  warning: "text-warn",
  danger:  "text-danger",
};

/**
 * Gate A.1 §6 — a failure must not be announced as a polite status.
 *
 * `role="status"` with `aria-live="polite"` queues behind whatever the screen
 * reader is already saying. That is right for "loading" and for "no alarms
 * derived": calm, expected outcomes. It is wrong for "the alarm feed is
 * unreadable and alarm state is UNKNOWN", which is the moment a reader most
 * needs to be interrupted. Those states announce assertively.
 *
 * Derived from `tone` rather than passed separately, so a caller cannot dress a
 * failure in danger colours and still have it announced politely.
 */
const TONE_ROLE: Record<StateTone, "status" | "alert"> = {
  neutral: "status",
  warning: "alert",
  danger:  "alert",
};

const TONE_LIVE: Record<StateTone, "polite" | "assertive"> = {
  neutral: "polite",
  warning: "assertive",
  danger:  "assertive",
};

/** Severity marker for the panel head. Never the affirmative accent. */
const TONE_DOT: Record<StateTone, string> = {
  neutral: "bg-muted/60",
  warning: "bg-warn",
  danger:  "bg-danger",
};

export function StateBoundary({
  tone = "neutral",
  title,
  body,
  detail,
  action,
  busy = false,
}: {
  tone?:   StateTone;
  title:   string;
  body?:   string;
  /** Machine-facing context (status code, filter name). Never invented. */
  detail?: string;
  action?: ReactNode;
  busy?:   boolean;
}) {
  return (
    /*
      Gate A.1 §3C — an outage is not a banner stretched across 1920px.
      Full-bleed, the status, the explanation, the request line and the action
      drifted so far apart that the panel read as empty space with words in the
      corners. Capping it at a reading measure and giving the parts a deliberate
      order makes the sequence legible: WHAT happened, WHAT it means, WHICH
      request, WHAT to do. The cap is on the panel, not the page, so the surface
      still aligns with the content column above it.
    */
    <div
      className={`w-full max-w-2xl rounded-xl border ${TONE_BORDER[tone]} bg-surface p-5 sm:p-6`}
      role={TONE_ROLE[tone]}
      aria-live={TONE_LIVE[tone]}
      aria-busy={busy || undefined}
    >
      <div className="flex items-start gap-3">
        {/* A tone marker, not decoration: it is the first thing scanned, and it
            is aria-hidden because the tone is already carried by role/live. */}
        {tone !== "neutral" && (
          <span
            aria-hidden="true"
            className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`}
          />
        )}
        <div className="min-w-0 flex-1">
          {/*
            NOT `type-panel-title`: that component class hard-sets
            `color: var(--muted)`, which silently beats the tone utility and made
            every state title render the same neutral grey — a failed read then
            looked exactly like a calm one.
          */}
          <p className={`font-body text-sm font-semibold uppercase tracking-wide ${TONE_TITLE[tone]}`}>
            {title}
          </p>
          {body && <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>}
        </div>
      </div>

      {/* Error attribution sits in its own register — monospace, LTR, visually
          subordinate — so it never competes with the human explanation. */}
      {detail && (
        <p
          className="mt-4 overflow-x-auto rounded border border-line bg-bg px-3 py-2 font-mono text-caption text-metadata"
          dir="ltr"
        >
          {detail}
        </p>
      )}

      {action && <div className="mt-5 border-t border-line pt-4">{action}</div>}
    </div>
  );
}

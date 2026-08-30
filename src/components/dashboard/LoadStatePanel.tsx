/**
 * The panel a dashboard route shows when it has no data to show.
 *
 * Presentational only. It receives strings the caller has ALREADY resolved from
 * its own next-intl namespace, so translation stays where it belongs and this
 * component never guesses which catalogue a route speaks. That also keeps it
 * usable by `multiSite` and `knowledgeGraph` without either borrowing the
 * other's keys.
 *
 * It exists because five routes needed the identical honest-state treatment and
 * duplicating ~30 lines of panel markup five times would have been worse than
 * one small shared component. It is deliberately NOT a generic UI primitive:
 * it lives under `components/dashboard` and knows only about load states.
 */
import type { ReactNode } from "react";

export type LoadStateTone = "neutral" | "warning" | "danger";

const TONE_RING: Record<LoadStateTone, string> = {
  neutral: "border-white/10",
  warning: "border-amber-500/30",
  danger: "border-red-500/30",
};
const TONE_TEXT: Record<LoadStateTone, string> = {
  neutral: "text-white/60",
  warning: "text-amber-300",
  danger: "text-red-300",
};

export function LoadStatePanel({
  title,
  hint,
  tone = "neutral",
  action,
  testId,
}: {
  title: string;
  hint?: string;
  tone?: LoadStateTone;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      // A stable hook for the verifier, so a route's state can be asserted
      // without matching translated text.
      data-phase104-load-state={testId ?? "state"}
      className={`rounded-lg border ${TONE_RING[tone]} bg-white/[0.02] px-5 py-6`}
    >
      <p className={`text-sm font-medium ${TONE_TEXT[tone]}`}>{title}</p>
      {hint ? (
        // `min-w-0` so a long German hint cannot push the panel past its column.
        <p className="mt-2 min-w-0 text-sm leading-relaxed text-white/45">{hint}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

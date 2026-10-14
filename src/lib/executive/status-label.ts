/**
 * Executive Management Center — which status WORD a reader is shown.
 *
 * Pure, and in `lib` rather than beside the component, for two reasons: the
 * rule is a statement about honesty rather than about markup, and it can then
 * be tested without a DOM — the jsdom render suites are the slowest and least
 * reliable part of this repository's test run.
 *
 * THE DEFECT THIS EXISTS FOR. `executive.status.OPERATIONAL` reads "Live". On
 * the live screen that is true. On a FROZEN report it is false: the figures
 * are a snapshot of a finished day. Observed in production on 2026-10-14,
 * where the 2026-10-13 report — stamped `exec-report-2`, a day old — carried a
 * "Live" badge on its decisions panel.
 *
 * Only OPERATIONAL needs the distinction. EMPTY, FORBIDDEN, UNAVAILABLE and
 * NO_SOURCE describe the ANSWER, and an answer does not become a different
 * answer by being recorded.
 */
import type { SectionStatus } from "./contract";

/** The translation key for a section status, given whether this is an archive. */
export function statusLabelKey(status: SectionStatus, frozen: boolean): string {
  return frozen && status === "OPERATIONAL"
    ? "status.OPERATIONAL_RECORDED"
    : `status.${status}`;
}

/**
 * Executive Management Center — the nightly report contract.
 *
 * PURE. No I/O. It defines what a stored report IS, so the generator, the
 * reader and the UI cannot disagree about it.
 *
 * A report is a SNAPSHOT, not a view. The distinction is the whole point:
 *
 *   · the numbers are computed once, over a window that has finished, and are
 *     never recomputed on read — so a report opened in March still says what it
 *     said in October, even though the rows behind it have moved on;
 *   · it carries the zone and cutoff its day was cut with, so a later change to
 *     the product's reporting zone cannot retroactively change which hours it
 *     covered;
 *   · it carries the calculation version, so two reports produced by different
 *     code are visibly not comparable;
 *   · it carries its own source coverage, so a section that was refused or
 *     unavailable that night is attributable, rather than looking like a quiet
 *     zero forever.
 */

import type { ExecutiveSummary } from "../summary";
import type { SectionStatus } from "../contract";

/**
 * The deterministic calculation version.
 *
 * BUMP THIS whenever a figure's definition changes — a different window rule, a
 * different predicate, a new metric that shifts an existing one. Two reports
 * with different values here were produced by different code and must not be
 * read as a trend.
 *
 * It is NOT the product version and NOT the schema version. It changes only
 * when the arithmetic does.
 */
// exec-report-2 (slice G3): the snapshot gained the customers section, which
// the organization had no tenant-scoped source for before. A report carrying
// exec-report-1 has no customer figures at all; that is a different
// calculation, so comparing the two as a trend would be wrong.
export const CALC_VERSION = "exec-report-2";

/** The first version of any night. A correction is this + 1, never an edit. */
export const FIRST_VERSION = 1;

/** Which sections answered that night, and why the others did not. */
export interface SectionCoverage {
  readonly section: string;
  readonly status: SectionStatus;
  /** i18n key naming the refusal. Null only when the section answered. */
  readonly reasonKey: string | null;
}

/**
 * Everything a stored report carries besides its snapshot.
 *
 * Every time field is an ISO instant; every day field is a label in `timeZone`.
 * Keeping those two kinds apart is what prevents the off-by-one-day class of
 * bug that a nightly report cannot recover from, because the day is part of its
 * identity.
 */
export interface ReportEnvelope {
  readonly organizationId: string;
  /** YYYY-MM-DD, read in `timeZone`. */
  readonly businessDate: string;
  readonly version: number;
  readonly timeZone: string;
  readonly dayCutoffMinutes: number;
  /** Inclusive start / exclusive end of the covered day, as instants. */
  readonly periodStartIso: string;
  readonly periodEndIso: string;
  readonly generatedAtIso: string;
  /** The newest moment the data reflects. Never later than `generatedAtIso`. */
  readonly dataCutoffIso: string;
  readonly calcVersion: string;
  readonly coverage: readonly SectionCoverage[];
  /** Null until a notification has been claimed and sent exactly once. */
  readonly notifiedAtIso: string | null;
  /** Set only on a correction. */
  readonly supersedesVersion: number | null;
  readonly regeneratedBy: string | null;
  readonly regenerationReason: string | null;
}

/** A stored report: its envelope plus the frozen summary it froze. */
export interface StoredReport extends ReportEnvelope {
  readonly snapshot: ExecutiveSummary;
}

/** One row of the archive listing. Carries no snapshot — the list stays cheap. */
export type ReportListEntry = ReportEnvelope;

/**
 * The outcome of asking for a night to be reported.
 *
 * `ALREADY_REPORTED` is a SUCCESS, not an error. A worker that runs twice, or
 * two replicas that run at once, must converge on one report rather than
 * producing a second one or failing loudly — the unique key decides, and the
 * loser lands here.
 */
export type GenerationOutcome =
  | { readonly kind: "CREATED"; readonly report: StoredReport }
  | { readonly kind: "ALREADY_REPORTED"; readonly report: StoredReport }
  | { readonly kind: "CORRECTED"; readonly report: StoredReport }
  | { readonly kind: "SKIPPED_NOT_FINISHED"; readonly businessDate: string }
  | { readonly kind: "FAILED"; readonly reasonKey: string };

/** Derive the coverage record from a summary. Pure, so it is testable alone. */
export function coverageOf(summary: ExecutiveSummary): SectionCoverage[] {
  const sections: Array<[string, { status: SectionStatus; reasonKey: string | null }]> = [
    ["operations", summary.sections.operations],
    ["financial", summary.sections.financial],
    ["industrial", summary.sections.industrial],
    ["customers", summary.sections.customers],
    ["actions", summary.actions],
  ];
  return sections.map(([section, s]) => ({
    section,
    status: s.status,
    reasonKey: s.reasonKey,
  }));
}

/**
 * True when every section that was asked for actually answered.
 *
 * A report with incomplete coverage is still a valid report — it is simply
 * honest about what it could not see, and the UI says so rather than presenting
 * a partial night as a whole one.
 */
export function coverageIsComplete(coverage: readonly SectionCoverage[]): boolean {
  return coverage.every(c => c.status === "OPERATIONAL" || c.status === "EMPTY");
}

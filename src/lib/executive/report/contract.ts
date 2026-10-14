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
import type { ExecutiveSection, SectionStatus } from "../contract";
import type { PriorityConfig, PriorityList } from "../priorities";

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
// exec-report-3: the report gained a FROZEN priority list for the day after
// the reported day. A report carrying exec-report-2 or earlier has none at
// all, and a reader must not infer "there was nothing to do" from its absence.
// exec-report-2 (slice G3): the snapshot gained the customers section, which
// the organization had no tenant-scoped source for before. A report carrying
// exec-report-1 has no customer figures at all; that is a different
// calculation, so comparing the two as a trend would be wrong.
export const CALC_VERSION = "exec-report-3";

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

/**
 * The priority list a nightly pass froze, and everything a reader needs in
 * order to know what it is a list OF.
 *
 * WHAT THIS IS NOT. It is not the ranking as it stood at the data cutoff. The
 * sources have no history: `ErpTask.status`, `.priority` and `.dueDate`, and
 * `Party.nextActionAt`, are mutable columns with no trail, so the state at an
 * earlier instant cannot be reconstructed from them — a date filter returns
 * TODAY's rows filtered by date, which is a different thing wearing the same
 * shape. Freezing the list when it is computed is therefore the only honest
 * record, and `observedAtIso` says exactly when that was.
 */
export interface FrozenPriorities {
  /** The day the REPORT is about. */
  readonly reportBusinessDate: string;
  /** The day the list is FOR: the day after the reported day, never the day
   *  after the pass happened to run. */
  readonly targetBusinessDate: string;
  readonly timeZone: string;
  /** End of the target day, as an instant. */
  readonly targetEndIso: string;
  /**
   * When the ROWS WERE READ. Deliberately separate from the envelope's
   * `generatedAtIso`: the record's creation time is not the data's
   * observation time, and a correction written days later would make the two
   * differ by days.
   */
  readonly observedAtIso: string;
  /** Which ranking rules produced this ordering (`PRIORITY_RULES_VERSION`). */
  readonly rulesVersion: string;
  /** The thresholds in force, so the reasons can be read back literally. */
  readonly config: PriorityConfig;
  /**
   * True when the target day had ALREADY ENDED by `observedAtIso` — a late
   * pass. Such a list is a record of what was outstanding, never a
   * recommendation for tomorrow, and the surface must say so.
   */
  readonly late: boolean;
  /** The list itself, with every item's tier, rule and reason. */
  readonly list: ExecutiveSection<PriorityList>;
  /**
   * Stated in the data, not only in a document: this list was observed, not
   * reconstructed. Any future mechanism that CAN reconstruct a cutoff state
   * must use a different value here rather than silently reuse this one.
   */
  readonly basis: "OBSERVED_AT_GENERATION";
}

/** A stored report: its envelope plus the frozen summary it froze. */
export interface StoredReport extends ReportEnvelope {
  readonly snapshot: ExecutiveSummary;
  /**
   * Null for every report written before `exec-report-3`, and for a pass that
   * could not read the priority sources. Absence means "not recorded", never
   * "nothing was due".
   */
  readonly priorities: FrozenPriorities | null;
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
 * What a report's coverage actually says, in three parts rather than a boolean.
 *
 * THE DEFECT THIS REPLACES. `coverageIsComplete` was
 * `every(OPERATIONAL || EMPTY)`, so every other status counted as "did not
 * answer" — and the archive printed "1 section did not answer" for the
 * 2026-10-13 report whose plants section was `FORBIDDEN` with reason
 * `noSites`. Nothing failed to answer there: the question was never asked,
 * because the reader (or, for the nightly pass, the organization) has no site
 * granted. Reporting a permission or configuration boundary as a failure of
 * the system is wrong twice over — it invents an outage, and it hides the real
 * one when there is one.
 *
 * The three parts, from the five section statuses:
 *
 *   answered   OPERATIONAL, EMPTY      the section was asked and replied
 *   notAsked   FORBIDDEN, NO_SOURCE    by policy, by grant, or because this
 *                                      product has no such source at all
 *   failed     UNAVAILABLE             a source was asked and could not be read
 *
 * A report is COMPLETE when nothing failed. `notAsked` sections do not make a
 * report partial, because a report cannot be more complete than the reader's
 * own access — but they are still counted and shown, so "nothing to report"
 * is never confused with "nothing you may see".
 */
export interface CoverageVerdict {
  readonly answered: number;
  readonly notAsked: number;
  readonly failed: number;
  /** No source failed. Says nothing about how much was asked. */
  readonly complete: boolean;
}

export function coverageVerdict(coverage: readonly SectionCoverage[]): CoverageVerdict {
  let answered = 0;
  let notAsked = 0;
  let failed = 0;
  for (const c of coverage) {
    if (c.status === "OPERATIONAL" || c.status === "EMPTY") answered += 1;
    else if (c.status === "UNAVAILABLE") failed += 1;
    else notAsked += 1;
  }
  return { answered, notAsked, failed, complete: failed === 0 };
}

/**
 * True when no source FAILED.
 *
 * Kept as the name the rest of the code already uses, with the meaning
 * corrected: a refused section no longer makes a night "incomplete".
 */
export function coverageIsComplete(coverage: readonly SectionCoverage[]): boolean {
  return coverageVerdict(coverage).complete;
}

/**
 * Executive Management Center — what a report's coverage is allowed to claim.
 *
 * Found in production on 2026-10-14: the archive row for the 2026-10-13 report
 * read "1 section did not answer", while the report itself said, inside its
 * plants section, that no site is granted to the reader. Nothing had failed to
 * answer. The question was never asked.
 *
 * `coverageIsComplete` was `every(OPERATIONAL || EMPTY)`, which folded four
 * different outcomes into "did not answer". That is wrong twice over: it
 * invents an outage where there is a permission boundary, and when a source
 * really does fail it says the same thing, so the reader cannot tell the two
 * apart — which is the one job the line has.
 *
 * These tests pin the three-way classification and, deliberately, assert the
 * SHAPE of the old defect so it cannot come back.
 */
import { describe, expect, it } from "vitest";
import { coverageIsComplete, coverageVerdict } from "../contract";
import type { SectionCoverage } from "../contract";

const row = (section: string, status: SectionCoverage["status"], reasonKey: string | null = null): SectionCoverage =>
  ({ section, status, reasonKey }) as SectionCoverage;

/** The exact shape the 2026-10-13 report had in production. */
const PRODUCTION_2026_10_13: readonly SectionCoverage[] = [
  row("operations", "EMPTY", "executive.reasons.noRows"),
  row("financial", "EMPTY", "executive.reasons.noRows"),
  row("industrial", "FORBIDDEN", "executive.reasons.noSites"),
  row("customers", "EMPTY", "executive.reasons.noRows"),
  row("actions", "OPERATIONAL"),
];

describe("coverage — a boundary is not an outage", () => {
  it("counts the production report as complete, with one section not asked", () => {
    const v = coverageVerdict(PRODUCTION_2026_10_13);
    expect(v).toEqual({ answered: 4, notAsked: 1, failed: 0, complete: true });
    // The line the archive prints is driven by `failed`, so this report no
    // longer claims a section failed to answer.
    expect(coverageIsComplete(PRODUCTION_2026_10_13)).toBe(true);
  });

  it("is NOT complete when a source actually failed", () => {
    const withOutage = [...PRODUCTION_2026_10_13.slice(0, 4), row("actions", "UNAVAILABLE", "executive.reasons.sourceUnavailable")];
    const v = coverageVerdict(withOutage);
    expect(v).toEqual({ answered: 3, notAsked: 1, failed: 1, complete: false });
    expect(coverageIsComplete(withOutage)).toBe(false);
  });

  it("separates the two causes instead of adding them together", () => {
    // The old implementation returned 2 "missing" for this and could not say
    // which of them was the system's fault.
    const mixed = [
      row("operations", "FORBIDDEN", "executive.reasons.forbiddenOperations"),
      row("financial", "UNAVAILABLE", "executive.reasons.sourceUnavailable"),
      row("industrial", "OPERATIONAL"),
      row("customers", "NO_SOURCE", "executive.reasons.noLedger"),
      row("actions", "EMPTY", "executive.reasons.noRows"),
    ];
    expect(coverageVerdict(mixed)).toEqual({ answered: 2, notAsked: 2, failed: 1, complete: false });
  });

  it("treats NO_SOURCE as not asked, because a source that does not exist cannot fail", () => {
    const noSource = [row("customers", "NO_SOURCE", "executive.reasons.noLedger")];
    expect(coverageVerdict(noSource)).toEqual({ answered: 0, notAsked: 1, failed: 0, complete: true });
  });

  it("calls an all-answered report complete with nothing unasked", () => {
    const all = (["operations", "financial", "industrial", "customers", "actions"] as const).map(s =>
      row(s, "OPERATIONAL"),
    );
    expect(coverageVerdict(all)).toEqual({ answered: 5, notAsked: 0, failed: 0, complete: true });
  });

  it("does not regress to the old rule: FORBIDDEN alone must not make a report incomplete", () => {
    // This is the defect itself, written as a test. If somebody reinstates
    // `every(OPERATIONAL || EMPTY)`, this is the case that fails.
    const onlyRefused = [row("industrial", "FORBIDDEN", "executive.reasons.noSites")];
    expect(coverageIsComplete(onlyRefused)).toBe(true);
    expect(coverageVerdict(onlyRefused).failed).toBe(0);
  });

  it("counts an empty coverage list as complete rather than throwing", () => {
    expect(coverageVerdict([])).toEqual({ answered: 0, notAsked: 0, failed: 0, complete: true });
  });
});

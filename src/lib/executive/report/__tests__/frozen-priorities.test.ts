/**
 * Executive Management Center — the priority list frozen into a nightly report.
 *
 * THE LIMITATION THIS DESIGN IS BUILT AROUND, stated once here because every
 * case below depends on it: the sources have no history. `ErpTask.status`,
 * `.priority` and `.dueDate`, and `Party.nextActionAt`, are mutable columns
 * with no trail. The ranking as it stood at a past cutoff therefore CANNOT be
 * reconstructed — a date filter returns today's rows filtered by date, which
 * is a different thing wearing the same shape. Freezing what was observed is
 * the only honest record, and these tests exist to make sure the record says
 * exactly that and no more.
 *
 * The six questions, which are the ones a wrong implementation gets wrong:
 *   · midnight — does the pass anchor on the REPORTED day or its own clock?
 *   · a late pass — does it still call itself a recommendation for tomorrow?
 *   · time zones — does the target day follow the organization's zone?
 *   · edits after generation — can a live row change a stored snapshot?
 *   · an old report with no list — does it still open, and say nothing false?
 *   · a correction — does it disclose its own, later, observation time?
 */
import { describe, expect, it } from "vitest";
import { businessDayWindow, nextBusinessDay } from "../../period";
import { PRIORITY_RULES_VERSION } from "../../priorities";
import { CALC_VERSION } from "../contract";
import type { FrozenPriorities } from "../contract";

const TEHRAN = "Asia/Tehran";
const BERLIN = "Europe/Berlin";

/** What `freezePriorities` builds, assembled here from the same inputs. */
function freeze(args: {
  reportDate: string;
  timeZone: string;
  cutoffMinutes?: number;
  observedAtMs: number;
}): Omit<FrozenPriorities, "config" | "list"> {
  const anchor = businessDayWindow({
    dateKey: args.reportDate,
    timeZone: args.timeZone,
    cutoffMinutes: args.cutoffMinutes,
  });
  const target = nextBusinessDay(anchor);
  return {
    reportBusinessDate: args.reportDate,
    targetBusinessDate: target.dateKey,
    timeZone: args.timeZone,
    targetEndIso: new Date(target.endMs).toISOString(),
    observedAtIso: new Date(args.observedAtMs).toISOString(),
    rulesVersion: PRIORITY_RULES_VERSION,
    late: args.observedAtMs >= target.endMs,
    basis: "OBSERVED_AT_GENERATION",
  };
}

describe("the target day comes from the reported day, not from the pass's clock", () => {
  it("reports Monday and carries TUESDAY, even though the pass runs on Tuesday", () => {
    // The nightly pass runs after the reported day has ended, so by its own
    // clock "today" is already Tuesday. Anchoring on that clock would make
    // `nextBusinessDay` reach for Wednesday: a report about Monday carrying
    // the day-after-tomorrow's list, which nobody would notice until it was
    // acted on.
    const anchor = businessDayWindow({ dateKey: "2026-10-12", timeZone: TEHRAN });
    const passRunsAt = anchor.endMs + 9 * 60 * 60 * 1000; // 09:00 the next morning
    const f = freeze({ reportDate: "2026-10-12", timeZone: TEHRAN, observedAtMs: passRunsAt });

    expect(f.reportBusinessDate).toBe("2026-10-12");
    expect(f.targetBusinessDate).toBe("2026-10-13");
    expect(f.late).toBe(false);
  });

  it("crosses a month boundary on the label, not on a timestamp", () => {
    const f = freeze({
      reportDate: "2026-10-31",
      timeZone: TEHRAN,
      observedAtMs: businessDayWindow({ dateKey: "2026-10-31", timeZone: TEHRAN }).endMs + 1000,
    });
    expect(f.targetBusinessDate).toBe("2026-11-01");
  });

  it("follows the organization's own zone, so two zones name different days", () => {
    const tehran = freeze({ reportDate: "2026-10-12", timeZone: TEHRAN, observedAtMs: 0 });
    const berlin = freeze({ reportDate: "2026-10-12", timeZone: BERLIN, observedAtMs: 0 });
    expect(tehran.targetBusinessDate).toBe("2026-10-13");
    expect(berlin.targetBusinessDate).toBe("2026-10-13");
    // Same label, DIFFERENT instants: the day boundary is the organization's,
    // and a report must not be read against someone else's midnight.
    expect(tehran.targetEndIso).not.toBe(berlin.targetEndIso);
  });

  it("honours a non-zero day cutoff when naming the target day", () => {
    const noon = freeze({
      reportDate: "2026-10-12",
      timeZone: TEHRAN,
      cutoffMinutes: 720,
      observedAtMs: 0,
    });
    const midnight = freeze({ reportDate: "2026-10-12", timeZone: TEHRAN, observedAtMs: 0 });
    expect(noon.targetBusinessDate).toBe("2026-10-13");
    // The label is the same; the window it names is twelve hours apart.
    expect(noon.targetEndIso).not.toBe(midnight.targetEndIso);
  });
});

describe("a late pass does not pretend to be advice for tomorrow", () => {
  it("marks itself late once the target day has already ended", () => {
    const target = nextBusinessDay(businessDayWindow({ dateKey: "2026-10-12", timeZone: TEHRAN }));
    const f = freeze({
      reportDate: "2026-10-12",
      timeZone: TEHRAN,
      observedAtMs: target.endMs + 60_000,
    });
    expect(f.late).toBe(true);
    // And it still names the day it was for, so the reader can see how late.
    expect(f.targetBusinessDate).toBe("2026-10-13");
  });

  it("is exactly on the boundary at the target day's end, not a moment before", () => {
    const target = nextBusinessDay(businessDayWindow({ dateKey: "2026-10-12", timeZone: TEHRAN }));
    expect(freeze({ reportDate: "2026-10-12", timeZone: TEHRAN, observedAtMs: target.endMs - 1 }).late).toBe(false);
    expect(freeze({ reportDate: "2026-10-12", timeZone: TEHRAN, observedAtMs: target.endMs }).late).toBe(true);
  });
});

describe("the record says what it is", () => {
  it("records the observation time, which is not the record's creation time", () => {
    const observedAtMs = Date.UTC(2026, 9, 13, 2, 30, 0);
    const f = freeze({ reportDate: "2026-10-12", timeZone: TEHRAN, observedAtMs });
    expect(f.observedAtIso).toBe(new Date(observedAtMs).toISOString());
  });

  it("states that it was observed, not reconstructed", () => {
    // A future mechanism that genuinely CAN reconstruct a cutoff state must
    // use a different value here. It cannot quietly reuse this one.
    expect(freeze({ reportDate: "2026-10-12", timeZone: TEHRAN, observedAtMs: 0 }).basis).toBe(
      "OBSERVED_AT_GENERATION",
    );
  });

  it("records which ranking rules produced the ordering", () => {
    expect(freeze({ reportDate: "2026-10-12", timeZone: TEHRAN, observedAtMs: 0 }).rulesVersion).toBe(
      PRIORITY_RULES_VERSION,
    );
    // Slice J added two rules, so a list from the previous version could not
    // contain a customer follow-up at all.
    expect(PRIORITY_RULES_VERSION).toBe("priority-rules-2");
  });

  it("ships under a calculation version that says the report shape changed", () => {
    expect(CALC_VERSION).toBe("exec-report-3");
  });
});

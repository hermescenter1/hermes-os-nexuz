/**
 * Executive Management Center — business-day boundaries.
 *
 * The defect these tests exist to prevent is the one a dashboard cannot
 * self-diagnose: a day cut in the wrong zone. A nightly report keyed by the
 * wrong date is wrong forever, because the date is part of its unique key.
 *
 * `Asia/Tehran` is the product default and has observed no DST since 2022, so it
 * proves the ordinary case. `Europe/Berlin` is a locale this product ships and
 * does observe DST, so it proves the two cases a fixed 24-hour step gets wrong:
 * a 23-hour day and a 25-hour day. Verified instants (ICU, this runtime):
 *
 *   Berlin 2026-03-29 00:00 local = 2026-03-28T23:00Z   (CET,  +01:00)
 *   Berlin 2026-03-30 00:00 local = 2026-03-29T22:00Z   (CEST, +02:00)  -> 23 h
 *   Berlin 2026-10-25 00:00 local = 2026-10-24T22:00Z   (CEST, +02:00)
 *   Berlin 2026-10-26 00:00 local = 2026-10-25T23:00Z   (CET,  +01:00)  -> 25 h
 *   Berlin local 02:30 on 2026-03-29 does not exist
 *   Berlin local 02:30 on 2026-10-25 occurs twice: 00:30Z and 01:30Z
 */
import { describe, it, expect } from "vitest";
import {
  assertTimeZone,
  businessDateKey,
  businessDayOf,
  businessDayWindow,
  instantOfWallClock,
  isExecutiveRange,
  offsetMsAt,
  parseBusinessDateKey,
  previousBusinessDay,
  resolveRange,
  wallClockAt,
} from "../period";

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("zone plumbing", () => {
  it("refuses an unknown zone instead of silently using UTC", () => {
    expect(() => assertTimeZone("Mars/Olympus_Mons")).toThrow(RangeError);
    expect(() => assertTimeZone("Asia/Tehran")).not.toThrow();
  });

  it("reads the wall clock in the requested zone, not the server's", () => {
    // 2026-10-09T20:30Z is exactly midnight on the 10th in Tehran (+03:30).
    expect(wallClockAt(Date.parse("2026-10-09T20:30:00Z"), "Asia/Tehran")).toEqual({
      year: 2026,
      month: 10,
      day: 10,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it("reports the zone offset in force at an instant, including across a DST change", () => {
    expect(offsetMsAt(Date.parse("2026-07-01T12:00:00Z"), "Asia/Tehran")).toBe(3.5 * HOUR);
    expect(offsetMsAt(Date.parse("2026-01-15T12:00:00Z"), "Europe/Berlin")).toBe(1 * HOUR);
    expect(offsetMsAt(Date.parse("2026-07-15T12:00:00Z"), "Europe/Berlin")).toBe(2 * HOUR);
  });
});

describe("business date keys", () => {
  it("round-trips YYYY-MM-DD and pads single digits", () => {
    expect(businessDateKey({ year: 2026, month: 3, day: 9 })).toBe("2026-03-09");
    expect(parseBusinessDateKey("2026-03-09")).toEqual({ year: 2026, month: 3, day: 9 });
  });

  it("throws rather than guessing a malformed key", () => {
    for (const bad of ["2026-3-9", "26-03-09", "2026/03/09", "2026-13-01", "2026-01-00", ""]) {
      expect(() => parseBusinessDateKey(bad), bad).toThrow(RangeError);
    }
  });
});

describe("instantOfWallClock — DST gaps and repeats are stated, not guessed", () => {
  it("resolves an ordinary reading exactly", () => {
    const r = instantOfWallClock(
      { year: 2026, month: 10, day: 10, hour: 0, minute: 0, second: 0 },
      "Asia/Tehran",
    );
    expect(iso(r.utcMs)).toBe("2026-10-09T20:30:00.000Z");
    expect(r.wallClockExact).toBe(true);
  });

  it("reports a spring-forward gap as NOT exact and lands after the jump", () => {
    const r = instantOfWallClock(
      { year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 },
      "Europe/Berlin",
    );
    expect(r.wallClockExact).toBe(false);
    // 02:30 never happens; the resolved instant renders as 03:30 local.
    expect(wallClockAt(r.utcMs, "Europe/Berlin")).toMatchObject({ hour: 3, minute: 30 });
  });

  it("picks the EARLIER of two fall-back candidates, deterministically", () => {
    const r = instantOfWallClock(
      { year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 },
      "Europe/Berlin",
    );
    expect(r.wallClockExact).toBe(true);
    expect(iso(r.utcMs)).toBe("2026-10-25T00:30:00.000Z");
    // The later candidate exists too; choosing it would double-count an hour.
    expect(wallClockAt(Date.parse("2026-10-25T01:30:00Z"), "Europe/Berlin")).toMatchObject({
      hour: 2,
      minute: 30,
    });
  });
});

describe("businessDayWindow — a DST day is 23 or 25 hours, never 24", () => {
  it("cuts an ordinary Tehran day at local midnight", () => {
    const w = businessDayWindow({ dateKey: "2026-10-10", timeZone: "Asia/Tehran" });
    expect(iso(w.startMs)).toBe("2026-10-09T20:30:00.000Z");
    expect(iso(w.endMs)).toBe("2026-10-10T20:30:00.000Z");
    expect(w.endMs - w.startMs).toBe(24 * HOUR);
    expect(w.wallClockExact).toBe(true);
  });

  it("produces a 23-hour window on the spring-forward day", () => {
    const w = businessDayWindow({ dateKey: "2026-03-29", timeZone: "Europe/Berlin" });
    expect(iso(w.startMs)).toBe("2026-03-28T23:00:00.000Z");
    expect(iso(w.endMs)).toBe("2026-03-29T22:00:00.000Z");
    expect(w.endMs - w.startMs).toBe(23 * HOUR);
  });

  it("produces a 25-hour window on the fall-back day", () => {
    const w = businessDayWindow({ dateKey: "2026-10-25", timeZone: "Europe/Berlin" });
    expect(iso(w.startMs)).toBe("2026-10-24T22:00:00.000Z");
    expect(iso(w.endMs)).toBe("2026-10-25T23:00:00.000Z");
    expect(w.endMs - w.startMs).toBe(25 * HOUR);
  });

  it("leaves no gap and no overlap between consecutive days across a transition", () => {
    const before = businessDayWindow({ dateKey: "2026-03-28", timeZone: "Europe/Berlin" });
    const dst = businessDayWindow({ dateKey: "2026-03-29", timeZone: "Europe/Berlin" });
    const after = businessDayWindow({ dateKey: "2026-03-30", timeZone: "Europe/Berlin" });
    expect(before.endMs).toBe(dst.startMs);
    expect(dst.endMs).toBe(after.startMs);
  });

  it("honours a non-midnight cutoff", () => {
    const w = businessDayWindow({ dateKey: "2026-10-10", timeZone: "Asia/Tehran", cutoffMinutes: 6 * 60 });
    expect(wallClockAt(w.startMs, "Asia/Tehran")).toMatchObject({ day: 10, hour: 6, minute: 0 });
    expect(wallClockAt(w.endMs, "Asia/Tehran")).toMatchObject({ day: 11, hour: 6, minute: 0 });
  });

  it("rolls over month and year boundaries", () => {
    const dec31 = businessDayWindow({ dateKey: "2026-12-31", timeZone: "Asia/Tehran" });
    expect(wallClockAt(dec31.endMs, "Asia/Tehran")).toMatchObject({ year: 2027, month: 1, day: 1 });
    const feb28 = businessDayWindow({ dateKey: "2028-02-28", timeZone: "Asia/Tehran" });
    expect(wallClockAt(feb28.endMs, "Asia/Tehran")).toMatchObject({ month: 2, day: 29 });
  });
});

describe("businessDayOf — the day an instant belongs to", () => {
  it("places an instant inside its own day at a midnight cutoff", () => {
    const w = businessDayOf({ nowMs: Date.parse("2026-10-10T08:00:00Z"), timeZone: "Asia/Tehran" });
    expect(w.dateKey).toBe("2026-10-10");
  });

  it("assigns a pre-cutoff instant to the PREVIOUS business day", () => {
    // 03:00 local on the 10th, with a 06:00 cutoff, is still the 9th's business day.
    const w = businessDayOf({
      nowMs: Date.parse("2026-10-09T23:30:00Z"), // 03:00 on the 10th in Tehran
      timeZone: "Asia/Tehran",
      cutoffMinutes: 6 * 60,
    });
    expect(wallClockAt(Date.parse("2026-10-09T23:30:00Z"), "Asia/Tehran")).toMatchObject({ day: 10, hour: 3 });
    expect(w.dateKey).toBe("2026-10-09");
  });

  it("does not shift the day for a server in another zone", () => {
    // 21:00Z on the 9th is already 00:30 on the 10th in Tehran. A server-local
    // midnight cut would file it under the 9th.
    const w = businessDayOf({ nowMs: Date.parse("2026-10-09T21:00:00Z"), timeZone: "Asia/Tehran" });
    expect(w.dateKey).toBe("2026-10-10");
  });
});

describe("previousBusinessDay", () => {
  it("steps back one calendar day in the zone", () => {
    const today = businessDayWindow({ dateKey: "2026-10-10", timeZone: "Asia/Tehran" });
    expect(previousBusinessDay(today).dateKey).toBe("2026-10-09");
  });

  it("steps back correctly off a 23-hour day", () => {
    const after = businessDayWindow({ dateKey: "2026-03-30", timeZone: "Europe/Berlin" });
    const dst = previousBusinessDay(after);
    expect(dst.dateKey).toBe("2026-03-29");
    expect(dst.endMs - dst.startMs).toBe(23 * HOUR);
    expect(previousBusinessDay(dst).dateKey).toBe("2026-03-28");
  });

  it("steps back across a month boundary", () => {
    const first = businessDayWindow({ dateKey: "2026-11-01", timeZone: "Asia/Tehran" });
    expect(previousBusinessDay(first).dateKey).toBe("2026-10-31");
  });

  /*
    REGRESSION. The first implementation stepped back one hour from the window's
    start and re-read the wall clock. At a midnight cutoff that lands on 23:00
    the previous date and looks right; at a 06:00 cutoff it lands on 05:00 the
    SAME date, so the function returned the day it was given — the nightly
    report then compared a day against itself. These cases fail against that
    implementation and pass against the calendar arithmetic that replaced it.
  */
  it("steps back a real day at a NON-MIDNIGHT cutoff", () => {
    const day = businessDayWindow({ dateKey: "2026-10-11", timeZone: "Europe/Berlin", cutoffMinutes: 6 * 60 });
    const previous = previousBusinessDay(day);
    expect(previous.dateKey).toBe("2026-10-10");
    // And it keeps the cutoff rather than silently reverting to midnight.
    expect(previous.cutoffMinutes).toBe(6 * 60);
    expect(wallClockAt(previous.startMs, "Europe/Berlin")).toMatchObject({ day: 10, hour: 6 });
    expect(previous.endMs).toBe(day.startMs);
  });

  it("carries its own cutoff, so a caller need not re-supply it", () => {
    const day = businessDayWindow({ dateKey: "2026-10-11", timeZone: "Asia/Tehran", cutoffMinutes: 90 });
    expect(day.cutoffMinutes).toBe(90);
    expect(previousBusinessDay(day).cutoffMinutes).toBe(90);
  });

  it("steps back across a month boundary at a non-midnight cutoff too", () => {
    const first = businessDayWindow({ dateKey: "2026-11-01", timeZone: "Asia/Tehran", cutoffMinutes: 8 * 60 });
    expect(previousBusinessDay(first).dateKey).toBe("2026-10-31");
  });

  it("steps back across a leap day", () => {
    const mar1 = businessDayWindow({ dateKey: "2028-03-01", timeZone: "Asia/Tehran", cutoffMinutes: 5 * 60 });
    expect(previousBusinessDay(mar1).dateKey).toBe("2028-02-29");
  });
});

describe("resolveRange — the baseline is complete, the current window is not", () => {
  const NOW = Date.parse("2026-10-10T08:00:00Z"); // 11:30 local in Tehran

  it("only accepts the fixed range set", () => {
    expect(isExecutiveRange("today")).toBe(true);
    expect(isExecutiveRange("last7Days")).toBe(true);
    expect(isExecutiveRange("last30Days")).toBe(true);
    for (const bad of ["lastYear", "", "7d", 7, null, undefined]) {
      expect(isExecutiveRange(bad), String(bad)).toBe(false);
    }
  });

  it("marks the live window incomplete and the baseline complete", () => {
    const r = resolveRange({ range: "today", nowMs: NOW, timeZone: "Asia/Tehran" });
    expect(r.current.complete).toBe(false);
    expect(r.baseline.complete).toBe(true);
    // The live window ends NOW, not at the end of the day.
    expect(r.currentEndMs).toBe(NOW);
    expect(iso(r.currentStartMs)).toBe("2026-10-09T20:30:00.000Z");
  });

  it("abuts the baseline exactly to the start of the current window", () => {
    const r = resolveRange({ range: "today", nowMs: NOW, timeZone: "Asia/Tehran" });
    expect(r.baselineEndMs).toBe(r.currentStartMs);
    expect(iso(r.baselineStartMs)).toBe("2026-10-08T20:30:00.000Z");
  });

  it("spans whole business days for a 7-day range and a 7-day baseline before it", () => {
    const r = resolveRange({ range: "last7Days", nowMs: NOW, timeZone: "Asia/Tehran" });
    // Current window starts 6 days before today's start.
    expect(iso(r.currentStartMs)).toBe("2026-10-03T20:30:00.000Z");
    expect(r.baselineEndMs).toBe(r.currentStartMs);
    expect(iso(r.baselineStartMs)).toBe("2026-09-26T20:30:00.000Z");
    expect(r.baselineEndMs - r.baselineStartMs).toBe(7 * 24 * HOUR);
  });

  it("keeps the baseline a whole number of business days across a DST transition", () => {
    // 2026-10-26 in Berlin; the baseline covers the 25th, which is 25 hours.
    const r = resolveRange({
      range: "today",
      nowMs: Date.parse("2026-10-26T10:00:00Z"),
      timeZone: "Europe/Berlin",
    });
    expect(iso(r.currentStartMs)).toBe("2026-10-25T23:00:00.000Z");
    expect(iso(r.baselineStartMs)).toBe("2026-10-24T22:00:00.000Z");
    expect(r.baselineEndMs - r.baselineStartMs).toBe(25 * HOUR);
  });

  it("carries the requested zone into both descriptors", () => {
    const r = resolveRange({ range: "last30Days", nowMs: NOW, timeZone: "Europe/Berlin" });
    expect(r.current.timeZone).toBe("Europe/Berlin");
    expect(r.baseline.timeZone).toBe("Europe/Berlin");
  });

  it("refuses an unknown zone", () => {
    expect(() => resolveRange({ range: "today", nowMs: NOW, timeZone: "Nowhere/Nothing" })).toThrow(RangeError);
  });
});

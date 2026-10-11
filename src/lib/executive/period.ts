/**
 * Executive Management Center — time windows.
 *
 * PURE. No I/O, no `Date.now()` of its own: every entry point takes `nowMs`, so
 * a window is a function of its inputs and a test can place the clock anywhere,
 * including on a DST transition.
 *
 * WHY THIS IS NOT `new Date().setHours(0,0,0,0)`
 * ----------------------------------------------
 * That expression resolves midnight in the SERVER's zone. This dashboard reports
 * a business day to a manager in Tehran, and its nightly report is keyed by that
 * day, so a server in UTC would cut the day 3.5 hours early and file the last
 * hours of Monday under Sunday — permanently, in the report's unique key.
 *
 * Day boundaries are therefore resolved in an explicit IANA zone through
 * `Intl.DateTimeFormat`, which carries the tz database the runtime ships. Two
 * consequences are handled rather than assumed:
 *
 *   · SPRING FORWARD — the requested local wall time may not exist (02:30 on a
 *     night that jumps 02:00 to 03:00). There is no instant to return, so the
 *     boundary resolves to the first instant that does exist after the gap and
 *     reports `wallClockExact: false`.
 *   · FALL BACK — the requested local wall time may occur twice. The EARLIER
 *     instant is chosen, deterministically, so a day is never counted twice and
 *     the choice is stated rather than incidental.
 *
 * Iran has not observed DST since 2022, so `Asia/Tehran` exercises neither path
 * today. `Europe/Berlin` does, this product ships a German locale, and a
 * boundary rule that is only correct for one zone is a latent defect.
 */

import type { PeriodDescriptor } from "./contract";

/** Minutes past local midnight at which a business day is cut. */
export const DEFAULT_DAY_CUTOFF_MINUTES = 0;

/** The zone the product reports business days in when a tenant has not chosen one. */
export const DEFAULT_TIME_ZONE = "Asia/Tehran";

export interface ZonedWallClock {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = PART_FORMATTERS.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  PART_FORMATTERS.set(timeZone, made);
  return made;
}

/**
 * Throws for an unknown zone rather than silently falling back to UTC, because
 * a dashboard that quietly reports the wrong day is worse than one that refuses.
 */
export function assertTimeZone(timeZone: string): void {
  try {
    formatterFor(timeZone).format(0);
  } catch {
    throw new RangeError(`unsupported time zone: ${timeZone}`);
  }
}

/** The wall-clock reading in `timeZone` at the given instant. */
export function wallClockAt(utcMs: number, timeZone: string): ZonedWallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find(p => p.type === type);
    return found ? Number(found.value) : 0;
  };
  // `hour12: false` renders midnight as 24 in some ICU versions; normalise it.
  const hour = pick("hour") % 24;
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour,
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** The zone's UTC offset in milliseconds at the given instant. */
export function offsetMsAt(utcMs: number, timeZone: string): number {
  const w = wallClockAt(utcMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Millisecond component is not formatted, so compare on the second.
  return asUtc - (utcMs - (utcMs % 1000));
}

export interface InstantResolution {
  readonly utcMs: number;
  /**
   * False when the requested wall time does not exist in this zone (a DST gap),
   * in which case `utcMs` is the first instant after the gap.
   */
  readonly wallClockExact: boolean;
}

/**
 * The instant at which a wall-clock reading occurs in `timeZone`.
 *
 * WHY THE OFFSETS ARE PROBED A DAY EITHER SIDE, NOT AT THE GUESS ITSELF
 * ---------------------------------------------------------------------
 * The obvious implementation — guess with the offset in force at the naive
 * instant, then correct once and accept when the two probes agree — silently
 * returns the WRONG instant on a fall-back night. There, 02:30 local happens
 * twice, and both probes land on the post-transition offset, so they agree and
 * the function returns the LATER of the two instants while reporting it as
 * exact. The hour before the transition is then attributed to the next day, and
 * an hour of records is counted twice. This was caught by
 * `period.test.ts > picks the EARLIER of two fall-back candidates`, which fails
 * against that implementation.
 *
 * Probing one day BEFORE and one day AFTER the requested reading brackets any
 * transition that could occur at it, and yields every offset that could apply:
 *
 *   · both offsets equal        -> one instant, unambiguous;
 *   · both candidates render back to the requested reading -> the reading is
 *     repeated (fall back). The EARLIER instant is chosen, deterministically,
 *     so a window never swallows the same hour twice;
 *   · neither candidate renders back -> the reading does not exist (spring
 *     forward). The pre-transition offset is applied, which lands on the first
 *     instant AFTER the gap, and `wallClockExact` is false.
 */
export function instantOfWallClock(w: ZonedWallClock, timeZone: string): InstantResolution {
  assertTimeZone(timeZone);
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);

  const offsetBefore = offsetMsAt(naive - 86_400_000, timeZone);
  const offsetAfter = offsetMsAt(naive + 86_400_000, timeZone);

  const candidates = [naive - offsetBefore, naive - offsetAfter].filter(ms =>
    sameWallClock(wallClockAt(ms, timeZone), w),
  );

  if (candidates.length > 0) {
    return { utcMs: Math.min(...candidates), wallClockExact: true };
  }

  // A spring-forward gap: applying the pre-transition offset steps past it.
  return { utcMs: naive - offsetBefore, wallClockExact: false };
}

function sameWallClock(a: ZonedWallClock, b: ZonedWallClock): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

/** `YYYY-MM-DD` for a wall-clock reading. The nightly report's date key. */
export function businessDateKey(w: Pick<ZonedWallClock, "year" | "month" | "day">): string {
  const mm = String(w.month).padStart(2, "0");
  const dd = String(w.day).padStart(2, "0");
  return `${w.year}-${mm}-${dd}`;
}

/** Parses `YYYY-MM-DD`. Throws on anything else — never guesses a date. */
export function parseBusinessDateKey(key: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new RangeError(`invalid business date key: ${key}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`invalid business date key: ${key}`);
  }
  return { year, month, day };
}

export interface BusinessDayWindow {
  /** Inclusive start instant. */
  readonly startMs: number;
  /** Exclusive end instant — the next day's cutoff. */
  readonly endMs: number;
  /** `YYYY-MM-DD` of the day this window represents, in `timeZone`. */
  readonly dateKey: string;
  readonly timeZone: string;
  /** False when a DST gap moved either boundary off its requested wall time. */
  readonly wallClockExact: boolean;
}

/**
 * The window of one business day, cut at `cutoffMinutes` past local midnight.
 *
 * The end boundary is resolved independently rather than by adding 24 hours: a
 * DST day is 23 or 25 hours long, and adding a fixed 86 400 000 ms would overlap
 * or skip an hour of records twice a year.
 */
export function businessDayWindow(args: {
  dateKey: string;
  timeZone: string;
  cutoffMinutes?: number;
}): BusinessDayWindow {
  const { dateKey, timeZone } = args;
  const cutoff = args.cutoffMinutes ?? DEFAULT_DAY_CUTOFF_MINUTES;
  assertTimeZone(timeZone);

  const { year, month, day } = parseBusinessDateKey(dateKey);
  const hour = Math.floor(cutoff / 60);
  const minute = cutoff % 60;

  const start = instantOfWallClock({ year, month, day, hour, minute, second: 0 }, timeZone);

  // The next calendar day in the SAME zone, obtained by stepping a whole day
  // from the start instant and re-reading the wall clock, so month and year
  // rollovers and leap days need no arithmetic here.
  const nextDayProbe = wallClockAt(start.utcMs + 86_400_000 + 3_600_000, timeZone);
  const end = instantOfWallClock(
    { year: nextDayProbe.year, month: nextDayProbe.month, day: nextDayProbe.day, hour, minute, second: 0 },
    timeZone,
  );

  return {
    startMs: start.utcMs,
    endMs: end.utcMs,
    dateKey,
    timeZone,
    wallClockExact: start.wallClockExact && end.wallClockExact,
  };
}

/** The business day that the given instant falls in. */
export function businessDayOf(args: {
  nowMs: number;
  timeZone: string;
  cutoffMinutes?: number;
}): BusinessDayWindow {
  const cutoff = args.cutoffMinutes ?? DEFAULT_DAY_CUTOFF_MINUTES;
  const w = wallClockAt(args.nowMs, args.timeZone);
  const minutesIntoDay = w.hour * 60 + w.minute;

  // Before the cutoff the instant still belongs to the PREVIOUS business day.
  const anchorMs = minutesIntoDay < cutoff ? args.nowMs - 86_400_000 : args.nowMs;
  const anchor = wallClockAt(anchorMs, args.timeZone);

  return businessDayWindow({
    dateKey: businessDateKey(anchor),
    timeZone: args.timeZone,
    cutoffMinutes: cutoff,
  });
}

/** The business day immediately before the given one. */
export function previousBusinessDay(window: BusinessDayWindow, cutoffMinutes?: number): BusinessDayWindow {
  // Step back from the window's own start by a whole day plus an hour of slack,
  // then re-read the wall clock, so a 23-hour DST day cannot land on the wrong date.
  const probe = wallClockAt(window.startMs - 3_600_000, window.timeZone);
  return businessDayWindow({
    dateKey: businessDateKey(probe),
    timeZone: window.timeZone,
    cutoffMinutes: cutoffMinutes ?? DEFAULT_DAY_CUTOFF_MINUTES,
  });
}

/* ── Dashboard ranges ──────────────────────────────────────────────────────── */

/** The ranges a manager may select. Fixed set — never a client-supplied span. */
export const EXECUTIVE_RANGES = ["today", "last7Days", "last30Days"] as const;
export type ExecutiveRange = (typeof EXECUTIVE_RANGES)[number];

export function isExecutiveRange(value: unknown): value is ExecutiveRange {
  return typeof value === "string" && (EXECUTIVE_RANGES as readonly string[]).includes(value);
}

const RANGE_DAYS: Record<ExecutiveRange, number> = {
  today: 1,
  last7Days: 7,
  last30Days: 30,
};

export interface ResolvedRange {
  readonly range: ExecutiveRange;
  /** The window currently being reported. Ends at `nowMs`, so it is incomplete. */
  readonly current: PeriodDescriptor;
  /** The immediately preceding window of equal length. Complete by construction. */
  readonly baseline: PeriodDescriptor;
  readonly currentStartMs: number;
  readonly currentEndMs: number;
  readonly baselineStartMs: number;
  readonly baselineEndMs: number;
}

function descriptor(startMs: number, endMs: number, timeZone: string, complete: boolean): PeriodDescriptor {
  return {
    fromIso: new Date(startMs).toISOString(),
    toIso: new Date(endMs).toISOString(),
    timeZone,
    complete,
  };
}

/**
 * Resolve a selected range into a current window and a comparable baseline.
 *
 * The current window runs from the start of its first business day to `nowMs` —
 * it is explicitly INCOMPLETE, which is the honest description of a live
 * dashboard and is what `computeDelta` needs in order to refuse a false trend.
 *
 * The baseline is the same number of business days immediately before it, ending
 * at the current window's start. It is complete, so a comparison against it is
 * defined. The two windows are built from business-day boundaries rather than
 * fixed multiples of 24 hours, so a DST transition inside either one does not
 * shift it.
 */
export function resolveRange(args: {
  range: ExecutiveRange;
  nowMs: number;
  timeZone?: string;
  cutoffMinutes?: number;
}): ResolvedRange {
  const timeZone = args.timeZone ?? DEFAULT_TIME_ZONE;
  const cutoff = args.cutoffMinutes ?? DEFAULT_DAY_CUTOFF_MINUTES;
  assertTimeZone(timeZone);

  const days = RANGE_DAYS[args.range];
  const today = businessDayOf({ nowMs: args.nowMs, timeZone, cutoffMinutes: cutoff });

  // Walk back (days - 1) business days to find the window's first day.
  let firstDay = today;
  for (let i = 1; i < days; i++) firstDay = previousBusinessDay(firstDay, cutoff);

  const currentStartMs = firstDay.startMs;
  const currentEndMs = args.nowMs;

  // The baseline is the same count of business days ending where the current
  // window starts.
  let baselineFirst = previousBusinessDay(firstDay, cutoff);
  const baselineEndMs = currentStartMs;
  for (let i = 1; i < days; i++) baselineFirst = previousBusinessDay(baselineFirst, cutoff);
  const baselineStartMs = baselineFirst.startMs;

  return {
    range: args.range,
    current: descriptor(currentStartMs, currentEndMs, timeZone, false),
    baseline: descriptor(baselineStartMs, baselineEndMs, timeZone, true),
    currentStartMs,
    currentEndMs,
    baselineStartMs,
    baselineEndMs,
  };
}

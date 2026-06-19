/**
 * Time period helpers — Phase 37.
 * Single source of date logic for all analytics services.
 * All period arithmetic is here; no other file should compute date windows.
 */

export type AnalyticsPeriod =
  | "lastHour"
  | "last24Hours"
  | "last7Days"
  | "last30Days"
  | "customRange";

export const MAX_CUSTOM_RANGE_DAYS = 90;

export interface PeriodRange {
  from: Date;
  to:   Date;
}

export interface BucketStrategy {
  bucketMs:   number;   // bucket width in milliseconds
  label:      string;   // e.g. "1 minute" — for debugging/logging
  maxPoints:  number;   // theoretical max returned points
}

// Bucket sizes per period to keep returned point count bounded.
const BUCKET_STRATEGIES: Record<Exclude<AnalyticsPeriod, "customRange">, BucketStrategy> = {
  lastHour:    { bucketMs: 60_000,        label: "1 minute",  maxPoints: 60  },
  last24Hours: { bucketMs: 1_800_000,     label: "30 minutes", maxPoints: 48 },
  last7Days:   { bucketMs: 14_400_000,    label: "4 hours",   maxPoints: 42  },
  last30Days:  { bucketMs: 86_400_000,    label: "1 day",     maxPoints: 30  },
};

export function getPeriodRange(
  period:      AnalyticsPeriod,
  customFrom?: string | Date,
  customTo?:   string | Date,
): PeriodRange {
  const now = new Date();

  if (period !== "customRange") {
    const offsets: Record<Exclude<AnalyticsPeriod, "customRange">, number> = {
      lastHour:    3_600_000,
      last24Hours: 86_400_000,
      last7Days:   7  * 86_400_000,
      last30Days:  30 * 86_400_000,
    };
    return { from: new Date(now.getTime() - offsets[period]), to: now };
  }

  // customRange: validate and cap
  if (!customFrom || !customTo) {
    throw new Error("customRange requires both from and to parameters");
  }
  const from = new Date(customFrom);
  const to   = new Date(customTo);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error("customRange: from and to must be valid ISO dates");
  }
  if (from >= to) {
    throw new Error("customRange: from must be before to");
  }
  const spanDays = (to.getTime() - from.getTime()) / 86_400_000;
  if (spanDays > MAX_CUSTOM_RANGE_DAYS) {
    throw new Error(`customRange: maximum span is ${MAX_CUSTOM_RANGE_DAYS} days`);
  }
  return { from, to };
}

export function getBucketStrategy(period: AnalyticsPeriod, range: PeriodRange): BucketStrategy {
  if (period !== "customRange") return BUCKET_STRATEGIES[period];

  // For customRange, pick bucket by span
  const spanDays = (range.to.getTime() - range.from.getTime()) / 86_400_000;
  if (spanDays <= 1)  return { bucketMs: 1_800_000,  label: "30 minutes", maxPoints: 48  };
  if (spanDays <= 7)  return { bucketMs: 14_400_000, label: "4 hours",    maxPoints: 42  };
  return                     { bucketMs: 86_400_000, label: "1 day",      maxPoints: 90  };
}

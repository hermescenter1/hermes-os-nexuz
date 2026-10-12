/**
 * Executive Management Center — reporting configuration.
 *
 * PURE apart from reading `process.env`. It deliberately does NOT import the
 * auth chain, Prisma or anything from `./scope`, so the aggregation layer can
 * depend on it without dragging `next/headers` into a server-only module graph.
 *
 * The reporting zone is read from the ENVIRONMENT, never from the request. A
 * client-chosen zone would let a reader move the business-day boundary and so
 * change which records a figure covers — the figure would still be "real" and
 * still be wrong. There is no per-organization zone column in the schema today;
 * a tenant that needs its own zone is a schema change, recorded as a follow-up
 * rather than faked with a cookie.
 */

import { DEFAULT_DAY_CUTOFF_MINUTES, DEFAULT_TIME_ZONE, assertTimeZone } from "./period";

export interface ReportingZone {
  readonly timeZone: string;
  readonly dayCutoffMinutes: number;
  /**
   * False when a configured value was rejected. The product default is used, and
   * the dashboard RAISES A DATA-QUALITY WARNING: a misconfigured zone silently
   * cutting the day somewhere else is exactly the defect `period.ts` exists to
   * prevent, so it must be visible rather than absorbed.
   */
  readonly configuredValid: boolean;
}

export function resolveReportingZone(env: NodeJS.ProcessEnv = process.env): ReportingZone {
  const rawZone = env.HERMES_EXECUTIVE_TIME_ZONE?.trim();
  const rawCutoff = env.HERMES_EXECUTIVE_DAY_CUTOFF_MINUTES?.trim();

  let timeZone = DEFAULT_TIME_ZONE;
  let configuredValid = true;

  if (rawZone) {
    try {
      assertTimeZone(rawZone);
      timeZone = rawZone;
    } catch {
      configuredValid = false;
    }
  }

  let dayCutoffMinutes = DEFAULT_DAY_CUTOFF_MINUTES;
  if (rawCutoff) {
    const parsed = Number(rawCutoff);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed < 24 * 60) {
      dayCutoffMinutes = parsed;
    } else {
      configuredValid = false;
    }
  }

  return { timeZone, dayCutoffMinutes, configuredValid };
}

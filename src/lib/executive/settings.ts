/**
 * Executive Management Center — one organization's reporting settings.
 *
 * WHAT IS CONFIGURABLE
 * --------------------
 *   · the reporting time zone (IANA name);
 *   · the business-day cutoff, in minutes after local midnight;
 *   · the four priority thresholds (`PriorityConfig`).
 *
 * WHERE THE VALUES COME FROM, IN ORDER
 * ------------------------------------
 *   1. the organization's `ExecutiveSettings` row, when one exists AND every
 *      value in it is still usable today;
 *   2. otherwise the environment (`HERMES_EXECUTIVE_TIME_ZONE`,
 *      `HERMES_EXECUTIVE_DAY_CUTOFF_MINUTES`) for the zone and cutoff, and the
 *      product defaults for the thresholds.
 *
 * A stored row that is NOT usable — a zone the runtime's tz database no longer
 * knows, a value outside the bounds — is never half-applied. The whole row is
 * set aside, the fallback is used, and `storedRowRejected` says so, so the
 * management view can raise the same data-quality warning it raises for a bad
 * environment value. A business day silently cut somewhere else is the one
 * failure this whole surface exists to prevent.
 *
 * WRITES
 * ------
 * `saveExecutiveSettings` validates, then writes inside ONE transaction:
 *   · a version-conditioned update (or a create for version 0), so two managers
 *     saving at once cannot silently overwrite each other — the second gets
 *     `CONFLICT` and re-reads;
 *   · an audit row with the before and after values, via the audit service's
 *     throwing variant, so a change is never committed without its audit.
 * The organization always comes from the server-resolved scope.
 */

import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEventOrThrow } from "@/lib/audit/audit-service";
import { resolveReportingZone } from "./config";
import { assertTimeZone } from "./period";
import {
  DEFAULT_PRIORITY_CONFIG,
  validatePriorityConfig,
  type PriorityConfig,
  type PriorityConfigProblem,
} from "./priorities";

/* ── Shapes ────────────────────────────────────────────────────────────────── */

export interface ExecutiveSettingsValues {
  readonly timeZone: string;
  readonly dayCutoffMinutes: number;
  readonly priority: PriorityConfig;
}

export type SettingsSource = "ORGANIZATION" | "DEFAULT";

export interface ResolvedExecutiveSettings {
  readonly values: ExecutiveSettingsValues;
  readonly source: SettingsSource;
  /** True when a stored row existed but was set aside as unusable. */
  readonly storedRowRejected: boolean;
  /** False when the ENVIRONMENT fallback itself was misconfigured. */
  readonly environmentValid: boolean;
  /** The row's concurrency token; 0 when no row exists. */
  readonly version: number;
  readonly updatedAtIso: string | null;
  readonly updatedBy: string | null;
}

export type SettingsProblem =
  | { readonly field: "timeZone"; readonly problem: "UNKNOWN_TIME_ZONE" | "NOT_A_STRING" }
  | { readonly field: "dayCutoffMinutes"; readonly problem: "NOT_AN_INTEGER" | "OUT_OF_RANGE" }
  | PriorityConfigProblem;

/* ── Validation (pure) ─────────────────────────────────────────────────────── */

export const MINUTES_PER_DAY = 24 * 60;

/** Every problem at once, so a form can show them together. Empty means valid. */
export function validateExecutiveSettings(values: ExecutiveSettingsValues): SettingsProblem[] {
  const problems: SettingsProblem[] = [];
  if (typeof values.timeZone !== "string" || values.timeZone.trim().length === 0) {
    problems.push({ field: "timeZone", problem: "NOT_A_STRING" });
  } else {
    try {
      assertTimeZone(values.timeZone);
    } catch {
      problems.push({ field: "timeZone", problem: "UNKNOWN_TIME_ZONE" });
    }
  }
  if (!Number.isInteger(values.dayCutoffMinutes)) {
    problems.push({ field: "dayCutoffMinutes", problem: "NOT_AN_INTEGER" });
  } else if (values.dayCutoffMinutes < 0 || values.dayCutoffMinutes >= MINUTES_PER_DAY) {
    problems.push({ field: "dayCutoffMinutes", problem: "OUT_OF_RANGE" });
  }
  problems.push(...validatePriorityConfig(values.priority));
  return problems;
}

/**
 * Parse an untrusted payload into values. Anything that is not exactly the
 * expected shape becomes a validation problem, never a coerced number: "7" is
 * not 7 here, because a form that sends strings is a bug worth surfacing.
 */
export function parseSettingsPayload(
  raw: unknown,
): { ok: true; values: ExecutiveSettingsValues; expectedVersion: number } | { ok: false; problems: SettingsProblem[] } | { ok: false; malformed: true } {
  if (raw === null || typeof raw !== "object") return { ok: false, malformed: true };
  const r = raw as Record<string, unknown>;
  const p = (r.priority !== null && typeof r.priority === "object" ? r.priority : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : Number.NaN);
  if (typeof r.expectedVersion !== "number" || !Number.isInteger(r.expectedVersion) || r.expectedVersion < 0) {
    return { ok: false, malformed: true };
  }
  const values: ExecutiveSettingsValues = {
    timeZone: typeof r.timeZone === "string" ? r.timeZone.trim() : (r.timeZone as string),
    dayCutoffMinutes: num(r.dayCutoffMinutes),
    priority: {
      approvalStaleDays: num(p.approvalStaleDays),
      approvalCriticalDays: num(p.approvalCriticalDays),
      alertAgeHours: num(p.alertAgeHours),
      maxItems: num(p.maxItems),
    },
  };
  const problems = validateExecutiveSettings(values);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, values, expectedVersion: r.expectedVersion };
}

/* ── Database seam ─────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

interface SettingsDelegate {
  findUnique(args: unknown): Promise<Row | null>;
  findMany(args: unknown): Promise<Row[]>;
  create(args: unknown): Promise<Row>;
  updateMany(args: unknown): Promise<{ count: number }>;
}

export interface SettingsDb {
  executiveSettings: SettingsDelegate;
  $transaction<T>(fn: (tx: SettingsDb & Record<string, unknown>) => Promise<T>): Promise<T>;
}

async function db(): Promise<SettingsDb | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;
  const d = prisma as unknown as SettingsDb;
  return d.executiveSettings ? d : null;
}

function rowToValues(row: Row): ExecutiveSettingsValues {
  const n = (v: unknown) => (typeof v === "number" ? v : Number.NaN);
  return {
    timeZone: typeof row.timeZone === "string" ? row.timeZone : "",
    dayCutoffMinutes: n(row.dayCutoffMinutes),
    priority: {
      approvalStaleDays: n(row.approvalStaleDays),
      approvalCriticalDays: n(row.approvalCriticalDays),
      alertAgeHours: n(row.alertAgeHours),
      maxItems: n(row.priorityMaxItems),
    },
  };
}

/** The fallback: environment zone and cutoff, product-default thresholds. */
export function defaultSettings(env: NodeJS.ProcessEnv = process.env): {
  values: ExecutiveSettingsValues;
  environmentValid: boolean;
} {
  const zone = resolveReportingZone(env);
  return {
    values: { timeZone: zone.timeZone, dayCutoffMinutes: zone.dayCutoffMinutes, priority: DEFAULT_PRIORITY_CONFIG },
    environmentValid: zone.configuredValid,
  };
}

/** Resolve one stored row (or none) into the values in force. Pure. */
export function resolveFromRow(row: Row | null, env: NodeJS.ProcessEnv = process.env): ResolvedExecutiveSettings {
  const fallback = defaultSettings(env);
  if (row === null) {
    return {
      values: fallback.values,
      source: "DEFAULT",
      storedRowRejected: false,
      environmentValid: fallback.environmentValid,
      version: 0,
      updatedAtIso: null,
      updatedBy: null,
    };
  }
  const values = rowToValues(row);
  const version = typeof row.version === "number" ? row.version : 0;
  const updatedAtIso = row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null;
  const updatedBy = typeof row.updatedBy === "string" ? row.updatedBy : null;
  if (validateExecutiveSettings(values).length > 0) {
    // Set aside as a WHOLE. Applying the valid half of a row would produce a
    // combination nobody chose.
    return {
      values: fallback.values,
      source: "DEFAULT",
      storedRowRejected: true,
      environmentValid: fallback.environmentValid,
      version,
      updatedAtIso,
      updatedBy,
    };
  }
  return {
    values,
    source: "ORGANIZATION",
    storedRowRejected: false,
    environmentValid: fallback.environmentValid,
    version,
    updatedAtIso,
    updatedBy,
  };
}

/**
 * The settings in force for one organization. A database that cannot be read
 * degrades to the fallback rather than failing the page; the caller learns it
 * from `source: "DEFAULT"`.
 */
export async function loadExecutiveSettings(
  organizationId: string,
  client?: SettingsDb | null,
): Promise<ResolvedExecutiveSettings> {
  const c = client === undefined ? await db() : client;
  if (!c) return resolveFromRow(null);
  try {
    const row = await c.executiveSettings.findUnique({ where: { organizationId } });
    return resolveFromRow(row);
  } catch {
    return resolveFromRow(null);
  }
}

/**
 * The settings in force for MANY organizations — one bounded query, for the
 * nightly worker, so a pass over fifty tenants is one read, not fifty.
 */
export async function loadExecutiveSettingsMany(
  organizationIds: readonly string[],
  client?: SettingsDb | null,
): Promise<Map<string, ResolvedExecutiveSettings>> {
  const out = new Map<string, ResolvedExecutiveSettings>();
  for (const id of organizationIds) out.set(id, resolveFromRow(null));
  if (organizationIds.length === 0) return out;
  const c = client === undefined ? await db() : client;
  if (!c) return out;
  try {
    const rows = await c.executiveSettings.findMany({
      where: { organizationId: { in: [...organizationIds] } },
      take: organizationIds.length,
    });
    for (const row of rows) {
      if (typeof row.organizationId === "string") out.set(row.organizationId, resolveFromRow(row));
    }
  } catch {
    // Already filled with the fallback.
  }
  return out;
}

/* ── Write ─────────────────────────────────────────────────────────────────── */

export type SaveOutcome =
  | { readonly kind: "SAVED"; readonly version: number }
  | { readonly kind: "CONFLICT"; readonly currentVersion: number }
  | { readonly kind: "INVALID"; readonly problems: SettingsProblem[] }
  | { readonly kind: "UNAVAILABLE" };

function auditShape(v: ExecutiveSettingsValues) {
  return {
    timeZone: v.timeZone,
    dayCutoffMinutes: v.dayCutoffMinutes,
    approvalStaleDays: v.priority.approvalStaleDays,
    approvalCriticalDays: v.priority.approvalCriticalDays,
    alertAgeHours: v.priority.alertAgeHours,
    priorityMaxItems: v.priority.maxItems,
  };
}

export async function saveExecutiveSettings(args: {
  organizationId: string;
  actorUserId: string;
  correlationId: string;
  values: ExecutiveSettingsValues;
  /** The version the actor read: 0 when no row existed. */
  expectedVersion: number;
  client?: SettingsDb | null;
}): Promise<SaveOutcome> {
  const problems = validateExecutiveSettings(args.values);
  if (problems.length > 0) return { kind: "INVALID", problems };

  const c = args.client === undefined ? await db() : args.client;
  if (!c) return { kind: "UNAVAILABLE" };

  const { organizationId, values } = args;
  const data = {
    timeZone: values.timeZone,
    dayCutoffMinutes: values.dayCutoffMinutes,
    approvalStaleDays: values.priority.approvalStaleDays,
    approvalCriticalDays: values.priority.approvalCriticalDays,
    alertAgeHours: values.priority.alertAgeHours,
    priorityMaxItems: values.priority.maxItems,
    updatedBy: args.actorUserId,
  };

  try {
    return await c.$transaction(async tx => {
      const before = await tx.executiveSettings.findUnique({ where: { organizationId } });
      const beforeVersion = before && typeof before.version === "number" ? before.version : 0;
      if (beforeVersion !== args.expectedVersion) {
        return { kind: "CONFLICT", currentVersion: beforeVersion } as const;
      }

      let version: number;
      if (before === null) {
        await tx.executiveSettings.create({ data: { organizationId, ...data, version: 1 } });
        version = 1;
      } else {
        // The version in the WHERE is what makes this safe under concurrency:
        // a second writer that read the same version updates zero rows.
        const updated = await tx.executiveSettings.updateMany({
          where: { organizationId, version: args.expectedVersion },
          data: { ...data, version: args.expectedVersion + 1 },
        });
        if (updated.count !== 1) return { kind: "CONFLICT", currentVersion: beforeVersion } as const;
        version = args.expectedVersion + 1;
      }

      await recordAuditEventOrThrow(
        {
          userId: args.actorUserId,
          organizationId,
          action: "executive.settings.update",
          entityType: "ExecutiveSettings",
          entityId: organizationId,
          outcome: "SUCCESS",
          correlationId: args.correlationId,
          metadata: {
            before: before === null ? null : auditShape(rowToValues(before)),
            after: auditShape(values),
            version,
          },
        },
        tx,
      );
      return { kind: "SAVED", version } as const;
    });
  } catch (err) {
    // Two first-time saves racing to CREATE: the loser hits the primary key.
    // That is a concurrency conflict, not an outage.
    const code = (err as { code?: unknown })?.code;
    if (code === "P2002") return { kind: "CONFLICT", currentVersion: 1 };
    return { kind: "UNAVAILABLE" };
  }
}

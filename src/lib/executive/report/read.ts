/**
 * Executive Management Center — reading the nightly report archive.
 *
 * Every read is scoped to ONE organization, taken from the resolved scope and
 * never from the request. A report id is not a capability here: the queries
 * match on `(organizationId, businessDate, version)` or on
 * `(organizationId, id)`, so a known id from another tenant resolves to
 * nothing rather than to someone else's night.
 *
 * Reads are BOUNDED. The archive list takes a page size with a hard ceiling and
 * never selects the snapshot, so listing a year of reports does not drag a
 * year of frozen summaries across the wire.
 */

import { getPrisma } from "@/lib/db/prisma";
import type { ExecutiveSummary } from "../summary";
import type {
  FrozenPriorities,
  ReportListEntry,
  SectionCoverage,
  StoredReport,
} from "./contract";

/** Hard ceiling on an archive page, whatever the caller asks for. */
export const MAX_ARCHIVE_PAGE = 60;
export const DEFAULT_ARCHIVE_PAGE = 30;

type Row = Record<string, unknown>;

interface ReportDelegate {
  findMany(args: unknown): Promise<Row[]>;
  findFirst(args: unknown): Promise<Row | null>;
  count(args: unknown): Promise<number>;
}

function delegateOf(client: unknown): ReportDelegate | null {
  const d = (client as Record<string, unknown> | null)?.executiveDailyReport;
  return d && typeof (d as ReportDelegate).findMany === "function" ? (d as ReportDelegate) : null;
}

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
const isoOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : iso(v);
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/** The envelope fields. Deliberately excludes the snapshot. */
const ENVELOPE_SELECT = {
  organizationId: true,
  businessDate: true,
  version: true,
  timeZone: true,
  dayCutoffMinutes: true,
  periodStart: true,
  periodEnd: true,
  generatedAt: true,
  dataCutoffAt: true,
  calcVersion: true,
  sourceCoverage: true,
  notifiedAt: true,
  supersedesVersion: true,
  regeneratedBy: true,
  regenerationReason: true,
} as const;

function toEnvelope(row: Row): ReportListEntry {
  return {
    organizationId: String(row.organizationId),
    businessDate: String(row.businessDate),
    version: Number(row.version),
    timeZone: String(row.timeZone),
    dayCutoffMinutes: Number(row.dayCutoffMinutes ?? 0),
    periodStartIso: iso(row.periodStart),
    periodEndIso: iso(row.periodEnd),
    generatedAtIso: iso(row.generatedAt),
    dataCutoffIso: iso(row.dataCutoffAt),
    calcVersion: String(row.calcVersion),
    coverage: (row.sourceCoverage ?? []) as SectionCoverage[],
    notifiedAtIso: isoOrNull(row.notifiedAt),
    supersedesVersion: numOrNull(row.supersedesVersion),
    regeneratedBy: strOrNull(row.regeneratedBy),
    regenerationReason: strOrNull(row.regenerationReason),
  };
}

/**
 * The archive, newest night first and newest version first within a night.
 *
 * Superseded versions are returned too, on purpose: "what did we believe that
 * night, before the correction" is exactly the question an archive exists to
 * answer, and hiding v1 behind v2 would make a correction indistinguishable
 * from the original being wrong all along.
 */
export async function listReports(args: {
  organizationId: string;
  limit?: number;
}): Promise<ReportListEntry[]> {
  const reports = delegateOf(await getPrisma());
  if (!reports) return [];

  const take = Math.min(Math.max(1, args.limit ?? DEFAULT_ARCHIVE_PAGE), MAX_ARCHIVE_PAGE);
  try {
    const rows = await reports.findMany({
      where: { organizationId: args.organizationId },
      orderBy: [{ businessDate: "desc" }, { version: "desc" }],
      select: ENVELOPE_SELECT,
      take,
    });
    return rows.map(toEnvelope);
  } catch {
    // Never surface the driver message; an unreadable archive is an empty one
    // to the caller, and the UI distinguishes that from "no reports yet".
    return [];
  }
}

/**
 * One report, with its frozen snapshot.
 *
 * `version` omitted means the CURRENT version of that night — the highest, i.e.
 * the latest correction. A caller that wants the original asks for version 1.
 */
export async function getReport(args: {
  organizationId: string;
  businessDate: string;
  version?: number;
}): Promise<StoredReport | null> {
  const reports = delegateOf(await getPrisma());
  if (!reports) return null;

  try {
    const rows = await reports.findMany({
      where: {
        organizationId: args.organizationId,
        businessDate: args.businessDate,
        ...(args.version === undefined ? {} : { version: args.version }),
      },
      orderBy: { version: "desc" },
      take: 1,
    });
    const row = rows[0];
    if (!row) return null;
    return {
      ...toEnvelope(row),
      snapshot: row.snapshot as unknown as ExecutiveSummary,
      // Null for every report written before `exec-report-3`, and for a pass
      // that could not read the priority sources. The surface must render
      // that as "not recorded", never as "nothing was due".
      priorities: (row.prioritySnapshot ?? null) as FrozenPriorities | null,
    };
  } catch {
    return null;
  }
}

/** How many reports this organization has. Used to tell EMPTY from UNAVAILABLE. */
export async function countReports(organizationId: string): Promise<number | null> {
  const reports = delegateOf(await getPrisma());
  if (!reports) return null;
  try {
    return await reports.count({ where: { organizationId } });
  } catch {
    return null;
  }
}

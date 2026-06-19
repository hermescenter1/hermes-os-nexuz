import { getPrisma }    from "@/lib/db/prisma";
import type {
  TelemetryRecord,
  TelemetryReading,
  TelemetryValidationError,
  TelemetryQuality,
  MAX_TELEMETRY_BATCH,
} from "./types";
import { TAG_PATTERN, MAX_VALUE_JSON_BYTES, ALL_QUALITIES } from "./types";

type TelemetryModel = {
  findMany:    (a: unknown) => Promise<Record<string, unknown>[]>;
  create:      (a: unknown) => Promise<Record<string, unknown>>;
  createMany:  (a: unknown) => Promise<{ count: number }>;
  count:       (a: unknown) => Promise<number>;
};

function row(r: Record<string, unknown>): TelemetryRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    siteId:         r.siteId         as string,
    gatewayId:      r.gatewayId      as string,
    assetId:        (r.assetId       ?? null) as string | null,
    tag:            r.tag            as string,
    value:          r.value,
    numericValue:   (r.numericValue  ?? null) as number | null,
    quality:        r.quality        as TelemetryQuality,
    unit:           (r.unit          ?? null) as string | null,
    source:         r.source         as string,
    timestamp:      new Date(r.timestamp  as string).toISOString(),
    receivedAt:     new Date(r.receivedAt as string).toISOString(),
    sequenceId:     (r.sequenceId    ?? null) as string | null,
  };
}

export function validateReading(reading: unknown, index: number): TelemetryValidationError | null {
  const r = reading as Record<string, unknown>;
  if (!r.tag || typeof r.tag !== "string" || !TAG_PATTERN.test(r.tag as string)) {
    return { index, tag: String(r.tag ?? "(missing)"), error: "Invalid tag name" };
  }
  if (!r.timestamp || typeof r.timestamp !== "string") {
    return { index, tag: r.tag as string, error: "Missing timestamp" };
  }
  if (isNaN(Date.parse(r.timestamp as string))) {
    return { index, tag: r.tag as string, error: "Unparseable timestamp" };
  }
  if (!r.quality || !ALL_QUALITIES.includes(r.quality as TelemetryQuality)) {
    return { index, tag: r.tag as string, error: `Invalid quality: ${String(r.quality ?? "(missing)")}` };
  }
  const valueJson = JSON.stringify(r.value);
  if (valueJson.length > MAX_VALUE_JSON_BYTES) {
    return { index, tag: r.tag as string, error: "value JSON exceeds 4KB limit" };
  }
  return null;
}

export async function ingestTelemetry(params: {
  organizationId: string;
  siteId:         string;
  gatewayId:      string;
  readings:       TelemetryReading[];
}): Promise<{ count: number }> {
  const prisma = await getPrisma();
  if (!prisma) return { count: 0 };

  // receivedAt is always server-set — never read from the payload
  const now = new Date();

  const data = params.readings.map((r) => ({
    organizationId: params.organizationId,
    siteId:         params.siteId,
    gatewayId:      params.gatewayId,
    assetId:        r.assetId    ?? null,
    tag:            r.tag,
    value:          r.value      ?? null,
    numericValue:   r.numericValue ?? (typeof r.value === "number" ? r.value : null),
    quality:        r.quality,
    unit:           r.unit       ?? null,
    source:         r.source,
    timestamp:      new Date(r.timestamp),
    receivedAt:     now,
    sequenceId:     r.sequenceId ?? null,
  }));

  const result = await (prisma.telemetryRecord as unknown as TelemetryModel).createMany({
    data,
    skipDuplicates: false,
  });
  return { count: result.count };
}

export async function listTelemetry(organizationId: string, opts?: {
  gatewayId?: string;
  assetId?:   string;
  tag?:       string;
  limit?:     number;
}): Promise<TelemetryRecord[]> {
  const prisma = await getPrisma();
  if (!prisma) return [];
  const where: Record<string, unknown> = { organizationId };
  if (opts?.gatewayId) where.gatewayId = opts.gatewayId;
  if (opts?.assetId)   where.assetId   = opts.assetId;
  if (opts?.tag)       where.tag       = opts.tag;
  const rows = await (prisma.telemetryRecord as unknown as TelemetryModel).findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take:    Math.min(opts?.limit ?? 100, 500),
  });
  return rows.map(row);
}

export async function countTelemetry(organizationId: string): Promise<number> {
  const prisma = await getPrisma();
  if (!prisma) return 0;
  return (prisma.telemetryRecord as unknown as TelemetryModel).count({
    where: { organizationId },
  });
}

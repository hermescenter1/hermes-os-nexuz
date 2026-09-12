/**
 * PHASE 109-C-UI.3 — assembling the control-room view from records that exist.
 *
 * Every read here is tenant-scoped at the QUERY, never filtered afterwards, and
 * every site read is additionally narrowed to the caller's permitted sites. A
 * post-query filter would leave any future `take` or count describing rows the
 * caller may not see — the defect Phase 109-C-UI.2 closed on the alerts feed.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   * It opens no connection to a PLC, gateway or historian. The addresses it
 *     reads are documented in the schema as "never used to open a connection",
 *     and nothing here changes that.
 *   * It invents no value. When a table is empty the view says so through the
 *     contract's `unavailable` list; it never substitutes a zero, a placeholder
 *     series or a sample row.
 *   * It exposes no `apiKeyId`. That column binds a gateway to an API key and is
 *     read by the ingest path only; putting it on a screen would publish which
 *     credential to target.
 */

import { getPrisma } from "@/lib/db/prisma";
import {
  UNAVAILABLE_CAPABILITIES,
  UNAVAILABLE_PROVENANCE,
  deriveConnectivity,
  rollupConnectivity,
  type AlarmDefinitionView,
  type ControlRoomView,
  type GatewayView,
  type Provenance,
  type ProtocolReference,
  type SiteView,
  type StoredGatewayStatus,
} from "./contract";

type Model = {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
};

const modelOf = (db: unknown, name: string): Model | null =>
  ((db as Record<string, unknown>)?.[name] as Model) ?? null;

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** How many alarm definitions and protocol rows a single render may pull. */
export const ALARM_PAGE_SIZE = 50;
export const PROTOCOL_SCAN_LIMIT = 500;

/**
 * Build the view.
 *
 * `allowedSiteIds` is REQUIRED and fails closed on an empty array: a caller with
 * no permitted sites sees nothing, rather than everything. That asymmetry is the
 * whole tenant boundary, so it is the first branch in the function.
 */
export async function buildControlRoomView(args: {
  organizationId: string;
  allowedSiteIds: string[];
  /**
   * Whether the caller holds `view_engineering_project`. Defaults to FALSE:
   * a caller that forgets to say so gets the registry half only, never the
   * engineering half by accident.
   */
  engineeringPermitted?: boolean;
  nowMs?: number;
}): Promise<ControlRoomView> {
  const nowMs = args.nowMs ?? Date.now();
  const generatedAt = new Date(nowMs).toISOString();
  const engineeringPermitted = args.engineeringPermitted === true;
  const empty: ControlRoomView = {
    sites: [],
    protocols: [],
    alarmDefinitions: [],
    engineeringPermitted,
    alarmsTruncated: false,
    protocolsTruncated: false,
    unavailable: UNAVAILABLE_CAPABILITIES,
    generatedAt,
  };

  if (args.allowedSiteIds.length === 0) return empty;

  const db = await getPrisma();
  if (!db) return empty;

  const siteModel = modelOf(db, "industrialSite");
  const gatewayModel = modelOf(db, "industrialGateway");
  if (!siteModel || !gatewayModel) return empty;

  const siteRows = await siteModel.findMany({
    where: { organizationId: args.organizationId, id: { in: args.allowedSiteIds } },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
  if (siteRows.length === 0) return empty;

  const siteIds = siteRows.map((s) => String(s.id));

  /*
    BOTH predicates in the query. The organisation alone was the F-02 defect and
    the site list alone would cross tenants if two organisations ever shared a
    site id. `apiKeyId` is absent from the projection on purpose.
  */
  const gatewayRows = await gatewayModel.findMany({
    where: { organizationId: args.organizationId, siteId: { in: siteIds } },
    select: {
      id: true, name: true, gatewayId: true, siteId: true, version: true,
      status: true, lastSeenAt: true, revokedAt: true,
    },
    orderBy: { name: "asc" },
  });

  const gatewaysBySite = new Map<string, GatewayView[]>();
  for (const r of gatewayRows) {
    const lastSeenAt = iso(r.lastSeenAt);
    const connectivity = deriveConnectivity({
      storedStatus: (r.status as StoredGatewayStatus | null) ?? null,
      lastSeenAt,
      revokedAt: iso(r.revokedAt),
      nowMs,
    });
    const provenance: Provenance = lastSeenAt
      ? {
          // `lastSeenAt` is written by the server on heartbeat receipt, so the
          // observation is ours even though the heartbeat is the gateway's.
          source: "SERVER_OBSERVED",
          uncertainty: "DERIVED",
          observedAt: lastSeenAt,
          origin: "gateway.lastSeenAt",
        }
      : { ...UNAVAILABLE_PROVENANCE, origin: "gateway.lastSeenAt" };

    const view: GatewayView = {
      id: String(r.id),
      name: String(r.name),
      gatewayId: String(r.gatewayId),
      siteId: String(r.siteId),
      version: r.version === null || r.version === undefined ? null : String(r.version),
      connectivity,
      provenance,
    };
    const bucket = gatewaysBySite.get(view.siteId);
    if (bucket) bucket.push(view);
    else gatewaysBySite.set(view.siteId, [view]);
  }

  const sites: SiteView[] = siteRows.map((s) => {
    const id = String(s.id);
    const gateways = gatewaysBySite.get(id) ?? [];
    return {
      id,
      name: String(s.name),
      status: String(s.status),
      gateways,
      rollup: rollupConnectivity(gateways.map((g) => g.connectivity)),
    };
  });

  /*
    The engineering half is read ONLY with the permission that governs it.
    Without it the two reads are not issued at all — not issued-then-hidden —
    so nothing about a tenant's alarm export ever crosses the boundary.
  */
  const protocols = engineeringPermitted
    ? await readProtocolReferences(db, args.organizationId)
    : { rows: [] as ProtocolReference[], truncated: false };
  const alarms = engineeringPermitted
    ? await readAlarmDefinitions(db, args.organizationId)
    : { rows: [] as AlarmDefinitionView[], truncated: false };

  return {
    sites,
    protocols: protocols.rows,
    alarmDefinitions: alarms.rows,
    engineeringPermitted,
    alarmsTruncated: alarms.truncated,
    protocolsTruncated: protocols.truncated,
    unavailable: UNAVAILABLE_CAPABILITIES,
    generatedAt,
  };
}

/**
 * Protocol references, counted from declared network nodes.
 *
 * These come from an engineering export, so the count is of DECLARATIONS. Two
 * nodes declaring OPC UA does not mean two OPC UA sessions exist, and the view
 * model names the field `nodeCount` rather than anything that sounds live.
 *
 * `IndustrialNetworkNode` has no `siteId` — it hangs off `EngineeringProject` —
 * so this is scoped by organisation only, and the UI labels it as an
 * organisation-wide engineering summary rather than implying site scope.
 */
async function readProtocolReferences(
  db: unknown,
  organizationId: string,
): Promise<{ rows: ProtocolReference[]; truncated: boolean }> {
  const model = modelOf(db, "industrialNetworkNode");
  if (!model) return { rows: [], truncated: false };
  /*
    One row past the cap, so the view can say "more exist" without a second
    COUNT round trip. An explicit ORDER BY makes the window deterministic: with
    no ordering PostgreSQL may hand back a different 500 rows on each render,
    and a count that changes between two reloads of an unchanged table is not
    a count.
  */
  const rows = await model.findMany({
    where: { organizationId },
    select: { protocol: true },
    orderBy: { id: "asc" },
    take: PROTOCOL_SCAN_LIMIT + 1,
  });
  const truncated = rows.length > PROTOCOL_SCAN_LIMIT;
  const counts = new Map<string, number>();
  for (const r of rows.slice(0, PROTOCOL_SCAN_LIMIT)) {
    const p = String(r.protocol ?? "OTHER");
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return {
    rows: [...counts.entries()]
      .map(([protocol, nodeCount]) => ({ protocol, nodeCount }))
      .sort((a, b) => b.nodeCount - a.nodeCount || a.protocol.localeCompare(b.protocol)),
    truncated,
  };
}

/**
 * Alarm DEFINITIONS. Not events, and the name says so at every layer.
 *
 * `AlarmDefinition.conditionReference` is documented in the schema as a
 * reference to the condition expression in the export — "not an evaluator".
 * Nothing in this platform evaluates it, so nothing here can report an alarm as
 * active, and the screen renders these under a heading that says configured.
 */
async function readAlarmDefinitions(
  db: unknown,
  organizationId: string,
): Promise<{ rows: AlarmDefinitionView[]; truncated: boolean }> {
  const model = modelOf(db, "alarmDefinition");
  if (!model) return { rows: [], truncated: false };
  /*
    `severity` is a PostgreSQL enum declared INFO, LOW, MEDIUM, HIGH, CRITICAL,
    and PostgreSQL orders an enum by its declaration order. `asc` therefore
    put INFO first — and with a page cap, the rows that fell off the end were
    the CRITICAL ones. `desc` keeps the most severe definitions inside the
    window, and the truncation flag tells the reader when there are more.
  */
  const rows = await model.findMany({
    where: { organizationId },
    select: {
      id: true, code: true, severity: true, message: true,
      requiresAck: true, safetyClass: true, createdAt: true,
    },
    orderBy: [{ severity: "desc" }, { code: "asc" }],
    take: ALARM_PAGE_SIZE + 1,
  });
  const truncated = rows.length > ALARM_PAGE_SIZE;
  const page = rows.slice(0, ALARM_PAGE_SIZE);
  return { truncated, rows: page.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    severity: String(r.severity),
    message: r.message === null || r.message === undefined ? null : String(r.message),
    requiresAck: Boolean(r.requiresAck),
    safetyClass: String(r.safetyClass ?? "UNKNOWN"),
    provenance: {
      source: "ENGINEERING_IMPORT",
      // DECLARED, not MEASURED: this is what the project file said at design
      // time. It may not match the plant that is actually running.
      uncertainty: "DECLARED",
      observedAt: iso(r.createdAt),
      origin: "alarmDefinition.import",
    },
  })) };
}

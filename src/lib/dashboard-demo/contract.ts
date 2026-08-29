/**
 * PHASE 109-B0 — dashboard data provenance contract.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `/api/telemetry` used to serve plant-shaped values (OEE, alarms, PLC scan
 * times, SCADA latency) over an anonymous HTTP route with no tenant, no site,
 * no source identity, no acquisition semantics and no provenance. It was
 * retired in Phase 109-B0 — the defect was the product boundary, not merely the
 * missing authentication, so it was removed rather than authenticated in place.
 *
 * This module replaces it with a CONTRACT: nothing operational reaches the
 * dashboard unless it arrives inside a frame that says, structurally, what it
 * is and where it came from.
 *
 * FAIL CLOSED MEANS FAIL CLOSED
 * -----------------------------
 * An earlier revision of this file checked that fields were PRESENT and had the
 * right JavaScript type. That is not a contract — it accepted
 * `provenance.network: "INTERNET"`, a `DEMO_NO_TENANT` scope carrying a tenant
 * id, a demo frame claiming `source.kind: "DEVICE"`, and a descriptor that
 * agreed on classification while disagreeing about every identity beneath it.
 * Every one of those is now a distinct, typed rejection.
 *
 * Three rules govern everything below:
 *
 *   1. NOTHING IS DEFAULTED. A missing classification is
 *      `MISSING_CLASSIFICATION`, never `SIMULATED` and never `REAL`.
 *   2. AN ENUM MEMBER IS NOT AN IMPLEMENTATION. `LIVE_READ_ONLY` and
 *      `HISTORICAL_REPLAY` are documented futures; a frame claiming one is
 *      rejected today, because no code produces or verifies such a frame.
 *   3. EVERY REJECTION IS SPECIFIC. Unrelated malformed inputs never collapse
 *      into one catch-all code — a caller can tell a blank `labelKey` from a
 *      reversed timestamp pair from a descriptor whose adapter disagrees.
 *
 * TWO DISTINCT AXES — DO NOT CONFLATE
 * -----------------------------------
 *   1. RECORD CLASSIFICATION — how an individual record was produced.
 *   2. CONNECTION MODE       — how the product is attached to its source.
 *
 * NEITHER ENUM CONTAINS LIVE_CONTROL. Hermes OS does not write to a controller,
 * and no value may ever be added here that implies it does.
 */

import type { DashboardSnapshot } from "@/lib/services/types";

/* ── AXIS 1 · record classification ──────────────────────────────────────── */

/**
 * How a single telemetry record was produced. Immutable once assigned.
 *
 *  REAL      — measured on real equipment and acquired through a real source.
 *  SIMULATED — computed by Hermes. No plant, no device, no measurement.
 *  REPLAYED  — a previously recorded REAL record played back on a virtual clock.
 *  IMPORTED  — historical or measurement data ingested from a historian, a file
 *              or a source export.
 *
 * IMPORTED IS ABOUT MEASUREMENT HISTORY. It has nothing to do with
 * EngineeringImport, which is an engineering PROJECT export (a vendor project
 * archive). The two are unrelated domains that happen to share an English
 * word; conflating them would let a project archive masquerade as plant
 * measurement.
 */
export const TELEMETRY_RECORD_CLASSIFICATIONS = [
  "REAL",
  "SIMULATED",
  "REPLAYED",
  "IMPORTED",
] as const;
export type TelemetryRecordClassification =
  (typeof TELEMETRY_RECORD_CLASSIFICATIONS)[number];

/* ── AXIS 2 · connection mode ────────────────────────────────────────────── */

/**
 * How the product is attached to the source that produced the records.
 *
 *  SIMULATED         — no source exists. Values are computed locally.
 *  LIVE_READ_ONLY    — FUTURE. An authenticated read-only acquisition path.
 *  HISTORICAL_REPLAY — FUTURE. A recorded window played back on a virtual clock.
 *
 * There is deliberately no writing mode. Hermes OS reads; it does not command.
 */
export const TELEMETRY_CONNECTION_MODES = [
  "SIMULATED",
  "LIVE_READ_ONLY",
  "HISTORICAL_REPLAY",
] as const;
export type TelemetryConnectionMode =
  (typeof TELEMETRY_CONNECTION_MODES)[number];

/**
 * The connection modes this product actually IMPLEMENTS today.
 *
 * The gap between this list and the enum above is the whole point: a frame may
 * not claim a mode simply because the mode has a name. Adding a member here is
 * a deliberate act that must come with the code that produces and verifies such
 * a frame.
 */
export const IMPLEMENTED_CONNECTION_MODES = ["SIMULATED"] as const;

/* ── Quality / staleness ─────────────────────────────────────────────────── */

/**
 *  GOOD  — the value is usable as presented.
 *  BAD   — the source reported the value as invalid.
 *  STALE — the value is older than its expected refresh window.
 */
export const TELEMETRY_QUALITIES = ["GOOD", "BAD", "STALE"] as const;
export type TelemetryQuality = (typeof TELEMETRY_QUALITIES)[number];

/* ── Structural provenance ───────────────────────────────────────────────── */

export const PRODUCED_BY_VALUES = ["LOCAL_DEMO_ADAPTER"] as const;
export type ProducedBy = (typeof PRODUCED_BY_VALUES)[number];

export const PROVENANCE_NETWORKS = ["NONE"] as const;
export type ProvenanceNetwork = (typeof PROVENANCE_NETWORKS)[number];

/** Where the frame was produced, and whether it crossed a network boundary. */
export interface TelemetryProvenance {
  /** Stable identifier of the producing adapter. Non-empty after trim. */
  adapter: string;
  /** The phase that defined this adapter's behaviour. Non-empty after trim. */
  adapterVersion: string;
  /** Coarse producer class, for gates that must not parse adapter strings. */
  producedBy: ProducedBy;
  /**
   * Network boundaries crossed to produce this frame. `NONE` is the only
   * accepted value today, and it is checked as an exact string rather than as
   * "some string" — the whole safety claim of this module is that no boundary
   * was crossed.
   */
  network: ProvenanceNetwork;
}

/**
 * What produced the observations. In Phase 109-B0 the only permitted kind is a
 * clearly synthetic Hermes demo scenario. GATEWAY, DEVICE and HISTORIAN are
 * named here so the future shape is fixed, but no code may emit them until a
 * real, authenticated acquisition path exists — and `validateDashboardFrame`
 * rejects a frame that claims one.
 */
export const TELEMETRY_SOURCE_KINDS = [
  "DEMO_SCENARIO",
  "GATEWAY",
  "DEVICE",
  "HISTORIAN",
] as const;
export type TelemetrySourceKind = (typeof TELEMETRY_SOURCE_KINDS)[number];

/** Source kinds a SIMULATED connection may legitimately claim. */
export const SIMULATED_SOURCE_KINDS = ["DEMO_SCENARIO"] as const;

export interface TelemetrySourceIdentity {
  kind: TelemetrySourceKind;
  /** Recognisably synthetic for DEMO_SCENARIO. Never a real customer or plant. */
  id: string;
  /** Message-catalogue key for the human-readable scenario/source name. */
  labelKey: string;
}

export const TELEMETRY_SCOPE_KINDS = ["DEMO_NO_TENANT", "ORGANIZATION_SITE"] as const;
export type TelemetryScopeKind = (typeof TELEMETRY_SCOPE_KINDS)[number];

/**
 * Tenancy scope. These are the fields a future authenticated ingestion path
 * (Phase 109-D) must populate. They are declared NOW so that a frame can never
 * be silently unscoped: `DEMO_NO_TENANT` is an explicit statement that this
 * frame belongs to no organization and no plant site, not an absence of one —
 * and a `DEMO_NO_TENANT` frame carrying a tenant id is incoherent, not lenient.
 */
export interface TelemetryScope {
  organizationId: string | null;
  siteId: string | null;
  scopeKind: TelemetryScopeKind;
}

/* ── The frame ───────────────────────────────────────────────────────────── */

/** The only frame version this build produces or accepts. */
export const SUPPORTED_FRAME_VERSION = 1;

/**
 * A dashboard payload that carries its own classification. The operational
 * `snapshot` is deliberately nested: a caller cannot reach the numbers without
 * first holding the frame that classifies them.
 */
export interface ClassifiedDashboardFrame {
  frameVersion: typeof SUPPORTED_FRAME_VERSION;
  /** Immutable. Never defaulted, never inferred from an absent source. */
  classification: TelemetryRecordClassification;
  connectionMode: TelemetryConnectionMode;
  quality: TelemetryQuality;
  scope: TelemetryScope;
  source: TelemetrySourceIdentity;
  provenance: TelemetryProvenance;
  /** Virtual/acquisition time of the observation itself. */
  acquisitionTs: number;
  /** When this process produced or received the frame. Never before acquisition. */
  receivedTs: number;
  snapshot: DashboardSnapshot;
}

/**
 * The immutable descriptor the SERVER resolves and hands to the client surface.
 * The client cannot choose it, and there is no query parameter, toggle or
 * user-selectable transition that produces a different one.
 *
 * It carries `scope` so the frame's scope can be compared against something,
 * rather than being the one identity field nobody checks.
 */
export interface DashboardSourceDescriptor {
  classification: TelemetryRecordClassification;
  connectionMode: TelemetryConnectionMode;
  scope: TelemetryScope;
  source: TelemetrySourceIdentity;
  provenance: TelemetryProvenance;
  resolvedBy: "SERVER";
}

/* ── Rejection codes ─────────────────────────────────────────────────────── */

export type FrameRejectionReason =
  /* frame shell */
  | "MISSING_FRAME"
  | "MISSING_FRAME_VERSION"
  | "UNSUPPORTED_FRAME_VERSION"
  /* classification / mode / quality */
  | "MISSING_CLASSIFICATION"
  | "UNKNOWN_CLASSIFICATION"
  | "MISSING_CONNECTION_MODE"
  | "UNKNOWN_CONNECTION_MODE"
  | "UNIMPLEMENTED_CONNECTION_MODE"
  | "MISSING_QUALITY"
  | "UNKNOWN_QUALITY"
  /* scope */
  | "MISSING_SCOPE"
  | "MISSING_SCOPE_KIND"
  | "UNKNOWN_SCOPE_KIND"
  | "INCOHERENT_SCOPE"
  /* source */
  | "MISSING_SOURCE"
  | "MISSING_SOURCE_KIND"
  | "UNKNOWN_SOURCE_KIND"
  | "MISSING_SOURCE_ID"
  | "MISSING_SOURCE_LABEL_KEY"
  | "UNSUPPORTED_SOURCE_FOR_MODE"
  /* provenance */
  | "MISSING_PROVENANCE"
  | "MISSING_PROVENANCE_ADAPTER"
  | "MISSING_PROVENANCE_ADAPTER_VERSION"
  | "MISSING_PROVENANCE_PRODUCED_BY"
  | "UNKNOWN_PROVENANCE_PRODUCED_BY"
  | "MISSING_PROVENANCE_NETWORK"
  | "UNSUPPORTED_PROVENANCE_NETWORK"
  /* timestamps */
  | "MISSING_ACQUISITION_TS"
  | "MISSING_RECEIVED_TS"
  | "INVALID_TIMESTAMP"
  | "NEGATIVE_TIMESTAMP"
  | "TIMESTAMP_ORDER"
  | "SNAPSHOT_TIME_MISMATCH"
  /* snapshot */
  | "MISSING_SNAPSHOT"
  | "MALFORMED_SNAPSHOT"
  /* descriptor */
  | "INVALID_DESCRIPTOR"
  | "DESCRIPTOR_CLASSIFICATION_MISMATCH"
  | "DESCRIPTOR_MODE_MISMATCH"
  | "DESCRIPTOR_SCOPE_MISMATCH"
  | "DESCRIPTOR_SOURCE_KIND_MISMATCH"
  | "DESCRIPTOR_SOURCE_ID_MISMATCH"
  | "DESCRIPTOR_SOURCE_LABEL_KEY_MISMATCH"
  | "DESCRIPTOR_ADAPTER_MISMATCH"
  | "DESCRIPTOR_ADAPTER_VERSION_MISMATCH"
  | "DESCRIPTOR_PRODUCED_BY_MISMATCH"
  | "DESCRIPTOR_NETWORK_MISMATCH";

export type FrameValidation =
  | { ok: true; frame: ClassifiedDashboardFrame }
  | {
      ok: false;
      reason: FrameRejectionReason;
      /** For MALFORMED_SNAPSHOT: the dotted path of the offending leaf. */
      path?: string;
    };

/* ── primitive helpers ───────────────────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A usable identifier: a string with at least one non-whitespace character. */
const isFilledString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const oneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export function isTelemetryRecordClassification(
  value: unknown
): value is TelemetryRecordClassification {
  return oneOf(TELEMETRY_RECORD_CLASSIFICATIONS, value);
}
export function isTelemetryConnectionMode(
  value: unknown
): value is TelemetryConnectionMode {
  return oneOf(TELEMETRY_CONNECTION_MODES, value);
}
export function isTelemetryQuality(value: unknown): value is TelemetryQuality {
  return oneOf(TELEMETRY_QUALITIES, value);
}
export function isTelemetrySourceKind(value: unknown): value is TelemetrySourceKind {
  return oneOf(TELEMETRY_SOURCE_KINDS, value);
}
export function isTelemetryScopeKind(value: unknown): value is TelemetryScopeKind {
  return oneOf(TELEMETRY_SCOPE_KINDS, value);
}

/* ── snapshot structural validation ──────────────────────────────────────── */

const LINE_STATUSES = ["running", "idle", "fault"] as const;
const DEVICE_STATUSES = ["online", "offline", "fault"] as const;
const HEALTH_STATUSES = ["ok", "warning", "degraded"] as const;
const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const RISK_TRENDS = ["up", "down", "flat"] as const;

/**
 * `Spark` draws a polyline by dividing by `history.length - 1`. A single point
 * produces a division by zero and NaN geometry, and an empty array makes
 * `Math.min(...[])` return Infinity. Two points is therefore the structural
 * minimum for a renderable series, not a stylistic preference.
 */
export const MIN_SERIES_HISTORY = 2;

/**
 * Verify the minimum structure `DashboardClient` dereferences before it renders
 * anything. This is a RUNTIME guard, not a type assertion: the compiler cannot
 * stop a malformed object arriving through `unknown`, and the screen must not
 * crash mid-render or print NaN over a plant-shaped layout.
 *
 * Returns `null` when the snapshot is usable, or the dotted path of the first
 * offending leaf.
 */
export function findSnapshotStructureFault(snapshot: unknown): string | null {
  if (!isRecord(snapshot)) return "snapshot";
  const s = snapshot;

  if (!isFiniteNumber(s.ts)) return "ts";

  /* overview */
  if (!isRecord(s.overview)) return "overview";
  for (const k of [
    "oee",
    "availability",
    "performance",
    "quality",
    "activeLines",
    "totalLines",
  ]) {
    if (!isFiniteNumber(s.overview[k])) return `overview.${k}`;
  }

  /* lines */
  if (!Array.isArray(s.lines)) return "lines";
  for (let i = 0; i < s.lines.length; i++) {
    const l = s.lines[i];
    if (!isRecord(l)) return `lines[${i}]`;
    if (!isFilledString(l.id)) return `lines[${i}].id`;
    if (!oneOf(LINE_STATUSES, l.status)) return `lines[${i}].status`;
    if (!isFiniteNumber(l.throughput)) return `lines[${i}].throughput`;
    if (!isFiniteNumber(l.target)) return `lines[${i}].target`;
  }

  /* plc */
  if (!Array.isArray(s.plc)) return "plc";
  for (let i = 0; i < s.plc.length; i++) {
    const p = s.plc[i];
    if (!isRecord(p)) return `plc[${i}]`;
    if (!isFilledString(p.id)) return `plc[${i}].id`;
    if (!isFilledString(p.model)) return `plc[${i}].model`;
    if (!oneOf(DEVICE_STATUSES, p.status)) return `plc[${i}].status`;
    if (!isFiniteNumber(p.cycleMs)) return `plc[${i}].cycleMs`;
  }

  /* scada */
  if (!isRecord(s.scada)) return "scada";
  if (!Array.isArray(s.scada.servers)) return "scada.servers";
  for (let i = 0; i < s.scada.servers.length; i++) {
    const v = s.scada.servers[i];
    if (!isRecord(v)) return `scada.servers[${i}]`;
    if (!isFilledString(v.id)) return `scada.servers[${i}].id`;
    if (!oneOf(DEVICE_STATUSES, v.status)) return `scada.servers[${i}].status`;
    if (!isFiniteNumber(v.latencyMs)) return `scada.servers[${i}].latencyMs`;
  }
  if (!isFiniteNumber(s.scada.tagsPolled)) return "scada.tagsPolled";
  if (!isFiniteNumber(s.scada.updateRateMs)) return "scada.updateRateMs";

  /* network */
  if (!isRecord(s.network)) return "network";
  for (const k of ["devices", "online", "blockedEvents"]) {
    if (!isFiniteNumber(s.network[k])) return `network.${k}`;
  }
  if (!oneOf(HEALTH_STATUSES, s.network.ids)) return "network.ids";

  /* alarms */
  if (!isRecord(s.alarms)) return "alarms";
  if (!isRecord(s.alarms.counts)) return "alarms.counts";
  for (const sev of SEVERITIES) {
    if (!isFiniteNumber(s.alarms.counts[sev])) return `alarms.counts.${sev}`;
  }
  if (!Array.isArray(s.alarms.recent)) return "alarms.recent";
  for (let i = 0; i < s.alarms.recent.length; i++) {
    const a = s.alarms.recent[i];
    if (!isRecord(a)) return `alarms.recent[${i}]`;
    if (!isFilledString(a.id)) return `alarms.recent[${i}].id`;
    if (!oneOf(SEVERITIES, a.severity)) return `alarms.recent[${i}].severity`;
    if (!isFilledString(a.msgKey)) return `alarms.recent[${i}].msgKey`;
    if (!isFiniteNumber(a.ts)) return `alarms.recent[${i}].ts`;
  }

  /* metric series */
  for (const key of ["temperature", "pressure", "flow"] as const) {
    const list = s[key];
    if (!Array.isArray(list)) return key;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!isRecord(m)) return `${key}[${i}]`;
      if (!isFilledString(m.tag)) return `${key}[${i}].tag`;
      if (!isFilledString(m.unit)) return `${key}[${i}].unit`;
      for (const n of ["value", "min", "max"]) {
        if (!isFiniteNumber(m[n])) return `${key}[${i}].${n}`;
      }
      if (!Array.isArray(m.history)) return `${key}[${i}].history`;
      if (m.history.length < MIN_SERIES_HISTORY) return `${key}[${i}].history.length`;
      for (let h = 0; h < m.history.length; h++) {
        if (!isFiniteNumber(m.history[h])) return `${key}[${i}].history[${h}]`;
      }
    }
  }

  /* energy */
  if (!isRecord(s.energy)) return "energy";
  for (const k of ["nowKw", "todayKwh", "peakKw"]) {
    if (!isFiniteNumber(s.energy[k])) return `energy.${k}`;
  }
  if (!Array.isArray(s.energy.history)) return "energy.history";
  if (s.energy.history.length < MIN_SERIES_HISTORY) return "energy.history.length";
  for (let h = 0; h < s.energy.history.length; h++) {
    if (!isFiniteNumber(s.energy.history[h])) return `energy.history[${h}]`;
  }

  /* ai */
  if (!Array.isArray(s.ai)) return "ai";
  for (let i = 0; i < s.ai.length; i++) {
    const r = s.ai[i];
    if (!isRecord(r)) return `ai[${i}]`;
    if (!isFilledString(r.id)) return `ai[${i}].id`;
    if (!isFilledString(r.recKey)) return `ai[${i}].recKey`;
    if (!isFiniteNumber(r.confidence)) return `ai[${i}].confidence`;
  }

  /* maintenance */
  if (!Array.isArray(s.maintenance)) return "maintenance";
  for (let i = 0; i < s.maintenance.length; i++) {
    const m = s.maintenance[i];
    if (!isRecord(m)) return `maintenance[${i}]`;
    if (!isFilledString(m.id)) return `maintenance[${i}].id`;
    if (!isFilledString(m.assetKey)) return `maintenance[${i}].assetKey`;
    if (!isFiniteNumber(m.priority)) return `maintenance[${i}].priority`;
    if (!isFiniteNumber(m.dueDays)) return `maintenance[${i}].dueDays`;
    if (!oneOf(SEVERITIES, m.severity)) return `maintenance[${i}].severity`;
  }

  /* risk */
  if (!isRecord(s.risk)) return "risk";
  if (!isFiniteNumber(s.risk.score)) return "risk.score";
  if (!oneOf(RISK_TRENDS, s.risk.trend)) return "risk.trend";
  if (!Array.isArray(s.risk.factors)) return "risk.factors";
  for (let i = 0; i < s.risk.factors.length; i++) {
    const f = s.risk.factors[i];
    if (!isRecord(f)) return `risk.factors[${i}]`;
    if (!isFilledString(f.key)) return `risk.factors[${i}].key`;
    if (!isFiniteNumber(f.weight)) return `risk.factors[${i}].weight`;
  }

  return null;
}

/* ── scope / source / provenance validation ──────────────────────────────── */

type Fault = { reason: FrameRejectionReason; path?: string };

function validateScope(scope: unknown): Fault | null {
  if (!isRecord(scope)) return { reason: "MISSING_SCOPE" };
  if (!("organizationId" in scope) || !("siteId" in scope))
    return { reason: "MISSING_SCOPE" };
  if (!("scopeKind" in scope) || scope.scopeKind == null)
    return { reason: "MISSING_SCOPE_KIND" };
  if (!isTelemetryScopeKind(scope.scopeKind)) return { reason: "UNKNOWN_SCOPE_KIND" };

  const org = scope.organizationId;
  const site = scope.siteId;

  if (scope.scopeKind === "DEMO_NO_TENANT") {
    // "Belongs to no tenant" is a statement, and a statement can be false.
    if (org !== null || site !== null) return { reason: "INCOHERENT_SCOPE" };
    return null;
  }
  // ORGANIZATION_SITE: both identifiers must be real, not blank placeholders.
  if (!isFilledString(org) || !isFilledString(site))
    return { reason: "INCOHERENT_SCOPE" };
  return null;
}

function validateSource(source: unknown, mode: TelemetryConnectionMode): Fault | null {
  if (!isRecord(source)) return { reason: "MISSING_SOURCE" };
  if (!("kind" in source) || source.kind == null) return { reason: "MISSING_SOURCE_KIND" };
  if (!isTelemetrySourceKind(source.kind)) return { reason: "UNKNOWN_SOURCE_KIND" };
  if (!isFilledString(source.id)) return { reason: "MISSING_SOURCE_ID" };
  if (!isFilledString(source.labelKey)) return { reason: "MISSING_SOURCE_LABEL_KEY" };

  // A simulated connection has no device, no gateway and no historian to name.
  // Letting it claim one would be exactly the misrepresentation this phase
  // exists to remove.
  if (mode === "SIMULATED" && !oneOf(SIMULATED_SOURCE_KINDS, source.kind))
    return { reason: "UNSUPPORTED_SOURCE_FOR_MODE" };
  return null;
}

function validateProvenance(provenance: unknown): Fault | null {
  if (!isRecord(provenance)) return { reason: "MISSING_PROVENANCE" };
  if (!isFilledString(provenance.adapter))
    return { reason: "MISSING_PROVENANCE_ADAPTER" };
  if (!isFilledString(provenance.adapterVersion))
    return { reason: "MISSING_PROVENANCE_ADAPTER_VERSION" };
  if (!("producedBy" in provenance) || provenance.producedBy == null)
    return { reason: "MISSING_PROVENANCE_PRODUCED_BY" };
  if (!oneOf(PRODUCED_BY_VALUES, provenance.producedBy))
    return { reason: "UNKNOWN_PROVENANCE_PRODUCED_BY" };
  if (!("network" in provenance) || provenance.network == null)
    return { reason: "MISSING_PROVENANCE_NETWORK" };
  if (!oneOf(PROVENANCE_NETWORKS, provenance.network))
    return { reason: "UNSUPPORTED_PROVENANCE_NETWORK" };
  return null;
}

/* ── descriptor ──────────────────────────────────────────────────────────── */

/**
 * The server-resolved descriptor, validated against the COMPLETE coherence
 * matrix this build implements — not merely "the fields are strings".
 *
 * Future enum members stay documented above; they are not accepted here,
 * because accepting a combination no code produces would let a malformed or
 * hostile descriptor describe a plant connection that does not exist.
 */
export function isValidSourceDescriptor(
  value: unknown
): value is DashboardSourceDescriptor {
  if (!isRecord(value)) return false;
  if (value.resolvedBy !== "SERVER") return false;

  if (value.classification !== "SIMULATED") return false;
  if (value.connectionMode !== "SIMULATED") return false;

  if (validateScope(value.scope) !== null) return false;
  const scope = value.scope as TelemetryScope;
  if (scope.scopeKind !== "DEMO_NO_TENANT") return false;
  if (scope.organizationId !== null || scope.siteId !== null) return false;

  if (validateSource(value.source, "SIMULATED") !== null) return false;
  if ((value.source as TelemetrySourceIdentity).kind !== "DEMO_SCENARIO") return false;

  if (validateProvenance(value.provenance) !== null) return false;
  const prov = value.provenance as TelemetryProvenance;
  if (prov.producedBy !== "LOCAL_DEMO_ADAPTER") return false;
  if (prov.network !== "NONE") return false;

  return true;
}

/* ── the frame validator ─────────────────────────────────────────────────── */

/**
 * Structural gate for operational rendering.
 *
 * When `descriptor` is supplied the frame must agree with the server-resolved
 * identity in EVERY immutable field — classification, mode, the whole scope,
 * every source leaf and every provenance leaf. Agreeing on classification while
 * disagreeing about which adapter produced the data is not agreement.
 */
export function validateDashboardFrame(
  candidate: unknown,
  descriptor?: DashboardSourceDescriptor
): FrameValidation {
  if (!isRecord(candidate)) return { ok: false, reason: "MISSING_FRAME" };

  /* frame version */
  if (!("frameVersion" in candidate) || candidate.frameVersion == null)
    return { ok: false, reason: "MISSING_FRAME_VERSION" };
  if (candidate.frameVersion !== SUPPORTED_FRAME_VERSION)
    return { ok: false, reason: "UNSUPPORTED_FRAME_VERSION" };

  /* classification */
  if (!("classification" in candidate) || candidate.classification == null)
    return { ok: false, reason: "MISSING_CLASSIFICATION" };
  if (!isTelemetryRecordClassification(candidate.classification))
    return { ok: false, reason: "UNKNOWN_CLASSIFICATION" };

  /* connection mode */
  if (!("connectionMode" in candidate) || candidate.connectionMode == null)
    return { ok: false, reason: "MISSING_CONNECTION_MODE" };
  if (!isTelemetryConnectionMode(candidate.connectionMode))
    return { ok: false, reason: "UNKNOWN_CONNECTION_MODE" };
  if (!oneOf(IMPLEMENTED_CONNECTION_MODES, candidate.connectionMode))
    return { ok: false, reason: "UNIMPLEMENTED_CONNECTION_MODE" };
  const mode = candidate.connectionMode;

  /* quality */
  if (!("quality" in candidate) || candidate.quality == null)
    return { ok: false, reason: "MISSING_QUALITY" };
  if (!isTelemetryQuality(candidate.quality))
    return { ok: false, reason: "UNKNOWN_QUALITY" };

  /* scope / source / provenance */
  const scopeFault = validateScope(candidate.scope);
  if (scopeFault) return { ok: false, ...scopeFault };

  const sourceFault = validateSource(candidate.source, mode);
  if (sourceFault) return { ok: false, ...sourceFault };

  const provFault = validateProvenance(candidate.provenance);
  if (provFault) return { ok: false, ...provFault };

  /* timestamps */
  if (!("acquisitionTs" in candidate) || candidate.acquisitionTs == null)
    return { ok: false, reason: "MISSING_ACQUISITION_TS" };
  if (!("receivedTs" in candidate) || candidate.receivedTs == null)
    return { ok: false, reason: "MISSING_RECEIVED_TS" };
  if (!isFiniteNumber(candidate.acquisitionTs) || !isFiniteNumber(candidate.receivedTs))
    return { ok: false, reason: "INVALID_TIMESTAMP" };
  if (candidate.acquisitionTs < 0 || candidate.receivedTs < 0)
    return { ok: false, reason: "NEGATIVE_TIMESTAMP" };
  if (candidate.receivedTs < candidate.acquisitionTs)
    return { ok: false, reason: "TIMESTAMP_ORDER" };

  /* snapshot */
  if (!("snapshot" in candidate) || candidate.snapshot == null)
    return { ok: false, reason: "MISSING_SNAPSHOT" };
  if (!isRecord(candidate.snapshot)) return { ok: false, reason: "MISSING_SNAPSHOT" };
  const structureFault = findSnapshotStructureFault(candidate.snapshot);
  if (structureFault !== null)
    return { ok: false, reason: "MALFORMED_SNAPSHOT", path: structureFault };

  // The observation time the frame declares and the time the payload carries
  // must be the same instant. A frame whose envelope and body disagree about
  // when the data is from cannot be presented as either.
  if ((candidate.snapshot as { ts: number }).ts !== candidate.acquisitionTs)
    return { ok: false, reason: "SNAPSHOT_TIME_MISMATCH" };

  /* descriptor agreement — every immutable identity field */
  if (descriptor !== undefined) {
    if (!isValidSourceDescriptor(descriptor))
      return { ok: false, reason: "INVALID_DESCRIPTOR" };

    if (candidate.classification !== descriptor.classification)
      return { ok: false, reason: "DESCRIPTOR_CLASSIFICATION_MISMATCH" };
    if (candidate.connectionMode !== descriptor.connectionMode)
      return { ok: false, reason: "DESCRIPTOR_MODE_MISMATCH" };

    const scope = candidate.scope as TelemetryScope;
    if (
      scope.scopeKind !== descriptor.scope.scopeKind ||
      scope.organizationId !== descriptor.scope.organizationId ||
      scope.siteId !== descriptor.scope.siteId
    )
      return { ok: false, reason: "DESCRIPTOR_SCOPE_MISMATCH" };

    const src = candidate.source as TelemetrySourceIdentity;
    if (src.kind !== descriptor.source.kind)
      return { ok: false, reason: "DESCRIPTOR_SOURCE_KIND_MISMATCH" };
    if (src.id !== descriptor.source.id)
      return { ok: false, reason: "DESCRIPTOR_SOURCE_ID_MISMATCH" };
    if (src.labelKey !== descriptor.source.labelKey)
      return { ok: false, reason: "DESCRIPTOR_SOURCE_LABEL_KEY_MISMATCH" };

    const prov = candidate.provenance as TelemetryProvenance;
    if (prov.adapter !== descriptor.provenance.adapter)
      return { ok: false, reason: "DESCRIPTOR_ADAPTER_MISMATCH" };
    if (prov.adapterVersion !== descriptor.provenance.adapterVersion)
      return { ok: false, reason: "DESCRIPTOR_ADAPTER_VERSION_MISMATCH" };
    if (prov.producedBy !== descriptor.provenance.producedBy)
      return { ok: false, reason: "DESCRIPTOR_PRODUCED_BY_MISMATCH" };
    if (prov.network !== descriptor.provenance.network)
      return { ok: false, reason: "DESCRIPTOR_NETWORK_MISMATCH" };
  }

  return { ok: true, frame: candidate as unknown as ClassifiedDashboardFrame };
}

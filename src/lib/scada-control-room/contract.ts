/**
 * PHASE 109-C-UI.3 — the SCADA Control Room contract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE DISCOVERY FOUND, AND WHY THIS FILE LOOKS LIKE IT DOES
 * ─────────────────────────────────────────────────────────────────────────────
 * The brief asks for connection state in four values — CONNECTED, DEGRADED,
 * NOT_CONNECTED, UNKNOWN. The database does not store those. It stores
 * `IndustrialGatewayStatus = ONLINE | OFFLINE | DEGRADED | REVOKED`, and the
 * column has exactly TWO writers in the whole repository:
 *
 *   src/lib/industrial/gateways.ts  createGateway()         -> "OFFLINE" once
 *   src/lib/industrial/gateways.ts  touchGatewayHeartbeat() -> "ONLINE" always
 *
 * Nothing ever writes DEGRADED. Nothing ever writes OFFLINE again after the
 * first heartbeat. **A gateway that heartbeats once and then dies stays ONLINE
 * in the database forever.** Rendering that column as a live connection state
 * would therefore be inventing connectivity — the exact thing this phase is
 * forbidden to do.
 *
 * So the stored status is treated as what it actually is — the last state the
 * ingest path recorded — and liveness is DERIVED from `lastSeenAt`, which the
 * server sets and which cannot lie about the past. Every derived value carries
 * the input it came from, so a reader can always see why the screen says what
 * it says.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE OPENS A CONNECTION
 * ─────────────────────────────────────────────────────────────────────────────
 * This module is pure. It reads no database, no socket and no PLC. It maps
 * records the platform already holds into a screen vocabulary. That matters for
 * a control room: the page is a VIEW of engineering records and gateway
 * liveness, never a control path, and it cannot become one by accident.
 */

/* ── connectivity ──────────────────────────────────────────────────────────── */

/**
 * The screen vocabulary. Four values, closed.
 *
 * `UNKNOWN` is not a synonym for "offline" and the distinction is the whole
 * point: NOT_CONNECTED is a statement about the plant, UNKNOWN is a statement
 * about our own visibility. A control room that shows a confident NOT_CONNECTED
 * when the truth is "the database did not answer" has told the operator
 * something false about their equipment.
 */
export const CONNECTIVITY_STATES = Object.freeze([
  "CONNECTED",
  "DEGRADED",
  "NOT_CONNECTED",
  "UNKNOWN",
] as const);
export type ConnectivityState = (typeof CONNECTIVITY_STATES)[number];

/** The stored column, exactly as `IndustrialGatewayStatus` declares it. */
export type StoredGatewayStatus = "ONLINE" | "OFFLINE" | "DEGRADED" | "REVOKED";

/**
 * Freshness windows.
 *
 * The heartbeat route carries no documented interval, so these are a PRODUCT
 * decision rather than a measurement, and they are exported so a test can state
 * them and an operator can find them. Fifteen minutes to be considered live is
 * deliberately generous: a gateway on a poor link should read DEGRADED, not
 * NOT_CONNECTED, and the screen says which window a reading fell into.
 */
export const FRESH_WITHIN_MS = 15 * 60 * 1000;
export const STALE_AFTER_MS = 60 * 60 * 1000;

/** Why a connectivity state was chosen. Closed, and rendered to the operator. */
export const CONNECTIVITY_REASONS = Object.freeze([
  /** A heartbeat arrived inside the fresh window. */
  "HEARTBEAT_FRESH",
  /** A heartbeat arrived, but longer ago than the fresh window. */
  "HEARTBEAT_STALE",
  /** The last heartbeat is older than the stale window. */
  "HEARTBEAT_EXPIRED",
  /** The gateway has never reported. `lastSeenAt` is null. */
  "NEVER_REPORTED",
  /** Access was revoked deliberately. Not a fault. */
  "REVOKED",
  /** The stored column says DEGRADED. Today nothing writes it; honoured anyway. */
  "REPORTED_DEGRADED",
  /** We could not read the record. A statement about us, not about the plant. */
  "DATA_UNAVAILABLE",
] as const);
export type ConnectivityReason = (typeof CONNECTIVITY_REASONS)[number];

export interface ConnectivityVerdict {
  state: ConnectivityState;
  reason: ConnectivityReason;
  /** Milliseconds since the last heartbeat, or null when there has never been one. */
  ageMs: number | null;
  /** The column value this verdict was derived from, carried for provenance. */
  storedStatus: StoredGatewayStatus | null;
}

/**
 * Derive connectivity from what the server actually knows.
 *
 * Order matters and each branch is a deliberate ruling:
 *
 *   1. No record at all -> UNKNOWN. We are blind, and we say so.
 *   2. REVOKED -> NOT_CONNECTED, and the reason keeps it distinguishable from a
 *      fault. An operator must not chase a network problem that is an
 *      administrative decision.
 *   3. Never reported -> NOT_CONNECTED. A gateway created and never heard from
 *      has a real, knowable state.
 *   4. Then, and only then, freshness. The stored ONLINE is NOT consulted for
 *      the live verdict, because it is written once per heartbeat and never
 *      taken back; `lastSeenAt` carries the same fact without the stale claim.
 *   5. A stored DEGRADED is honoured if it ever appears, but it cannot promote a
 *      stale gateway to live.
 */
export function deriveConnectivity(input: {
  storedStatus: StoredGatewayStatus | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  nowMs: number;
  dataAvailable?: boolean;
}): ConnectivityVerdict {
  const { storedStatus, lastSeenAt, revokedAt, nowMs } = input;

  if (input.dataAvailable === false) {
    return { state: "UNKNOWN", reason: "DATA_UNAVAILABLE", ageMs: null, storedStatus: null };
  }

  if (revokedAt !== null || storedStatus === "REVOKED") {
    return { state: "NOT_CONNECTED", reason: "REVOKED", ageMs: null, storedStatus };
  }

  if (lastSeenAt === null) {
    return { state: "NOT_CONNECTED", reason: "NEVER_REPORTED", ageMs: null, storedStatus };
  }

  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen)) {
    // An unparseable timestamp is missing information, not a dead gateway.
    return { state: "UNKNOWN", reason: "DATA_UNAVAILABLE", ageMs: null, storedStatus };
  }

  // A clock skew that puts the heartbeat in the future is still a heartbeat;
  // clamping at zero keeps the age honest rather than negative.
  const ageMs = Math.max(0, nowMs - seen);

  if (ageMs > STALE_AFTER_MS) {
    return { state: "NOT_CONNECTED", reason: "HEARTBEAT_EXPIRED", ageMs, storedStatus };
  }
  if (ageMs > FRESH_WITHIN_MS) {
    return { state: "DEGRADED", reason: "HEARTBEAT_STALE", ageMs, storedStatus };
  }
  if (storedStatus === "DEGRADED") {
    return { state: "DEGRADED", reason: "REPORTED_DEGRADED", ageMs, storedStatus };
  }
  return { state: "CONNECTED", reason: "HEARTBEAT_FRESH", ageMs, storedStatus };
}

/* ── provenance ────────────────────────────────────────────────────────────── */

/**
 * Where a value on this screen came from.
 *
 * `ENGINEERING_IMPORT` is the one that stops the biggest lie. Alarm definitions
 * and network nodes are parsed out of a TIA/SCADA export: `AlarmDefinition`
 * carries `conditionReference`, documented in the schema as "Reference to the
 * condition expression in the export — not an evaluator". They are CONFIGURED
 * alarms, not firing ones, and the screen has to say so or it is inventing plant
 * events.
 */
export const PROVENANCE_SOURCES = Object.freeze([
  /** The server observed it: `lastSeenAt`, `receivedAt`. */
  "SERVER_OBSERVED",
  /** A gateway reported it and the server stored it verbatim. Untrusted clock. */
  "GATEWAY_REPORTED",
  /** Parsed from an engineering export. A declaration, never a live reading. */
  "ENGINEERING_IMPORT",
  /** Computed by this module from the fields above. */
  "DERIVED",
  /** There is no value. Not zero, not empty — absent. */
  "UNAVAILABLE",
] as const);
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

/** Certainty of a displayed value, so a screen can show doubt instead of hiding it. */
export const UNCERTAINTY_LEVELS = Object.freeze([
  /** Server-observed fact. */
  "MEASURED",
  /** Derived from measured facts by a rule stated in this file. */
  "DERIVED",
  /** Reported by equipment; correct only if the equipment is honest. */
  "REPORTED",
  /** A declaration from a design-time export; may not match the running plant. */
  "DECLARED",
  /** Nothing is known. */
  "UNKNOWN",
] as const);
export type UncertaintyLevel = (typeof UNCERTAINTY_LEVELS)[number];

export interface Provenance {
  source: ProvenanceSource;
  uncertainty: UncertaintyLevel;
  /** ISO 8601, or null when there is no timestamp to show. Never a fabricated now(). */
  observedAt: string | null;
  /** A short, non-revealing origin label, e.g. "gateway.lastSeenAt". */
  origin: string;
}

export const UNAVAILABLE_PROVENANCE: Provenance = Object.freeze({
  source: "UNAVAILABLE",
  uncertainty: "UNKNOWN",
  observedAt: null,
  origin: "none",
});

/* ── refusals ──────────────────────────────────────────────────────────────── */

/**
 * Every way this page can decline to render, as a closed set.
 *
 * A control room that fails open is worse than one that fails loudly: an empty
 * screen reads as "no alarms" to a tired operator at 3am. Each of these is
 * rendered as an explicit refusal with its own message.
 */
export const REFUSAL_CODES = Object.freeze([
  "AUTHENTICATION_REQUIRED",
  "ORGANIZATION_SCOPE_REQUIRED",
  "PERMISSION_REQUIRED",
  "NO_ACCESSIBLE_SITE",
  "BACKEND_UNAVAILABLE",
] as const);
export type RefusalCode = (typeof REFUSAL_CODES)[number];

/* ── the view model ────────────────────────────────────────────────────────── */

export interface GatewayView {
  id: string;
  name: string;
  /** The external hardware identifier. Shown because operators use it. */
  gatewayId: string;
  siteId: string;
  version: string | null;
  connectivity: ConnectivityVerdict;
  provenance: Provenance;
}

export interface ProtocolReference {
  /** `IndustrialProtocol`, as declared in the engineering export. */
  protocol: string;
  /** How many declared nodes use it. A count of records, never of live links. */
  nodeCount: number;
}

export interface AlarmDefinitionView {
  id: string;
  code: string;
  severity: string;
  message: string | null;
  requiresAck: boolean;
  safetyClass: string;
  provenance: Provenance;
}

export interface SiteView {
  id: string;
  name: string;
  status: string;
  gateways: GatewayView[];
  /** The worst connectivity across the site's gateways, or UNKNOWN with none. */
  rollup: ConnectivityVerdict;
}

export interface ControlRoomView {
  sites: SiteView[];
  protocols: ProtocolReference[];
  alarmDefinitions: AlarmDefinitionView[];
  /**
   * Whether the caller holds `view_engineering_project`. The alarm and protocol
   * panels render ENGINEERING records, which the permission matrix keeps
   * deliberately separate from the site/gateway registry. When this is false the
   * two reads are never issued and the panels say so, instead of rendering an
   * empty list that reads as "nothing configured".
   */
  engineeringPermitted: boolean;
  /**
   * True when the read hit its page cap, so rows exist that are NOT shown. The
   * screen prints this next to the panel; a capped table with no such note
   * reads as complete, and for alarms that means "the CRITICAL ones are all here".
   */
  alarmsTruncated: boolean;
  protocolsTruncated: boolean;
  /**
   * Absent capabilities, named. The screen renders each as an explicit
   * DATA_UNAVAILABLE panel rather than an empty box that reads as "all clear".
   */
  unavailable: readonly UnavailableCapability[];
  generatedAt: string;
}

/**
 * The enum vocabularies the alarm table renders. Listed here so the surface
 * can translate a KNOWN token and print an unknown one verbatim, instead of
 * either showing raw `SAFETY_CRITICAL` to a Persian operator or throwing on a
 * value a future migration adds.
 */
export const ALARM_SEVERITIES = Object.freeze(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const);
export const SAFETY_CLASSES = Object.freeze(
  ["NON_SAFETY", "SAFETY_RELATED", "SAFETY_CRITICAL", "UNKNOWN"] as const,
);
export const STORED_GATEWAY_STATUSES = Object.freeze(["ONLINE", "OFFLINE", "DEGRADED", "REVOKED"] as const);

/**
 * Capabilities the brief asks for that this platform has no real data for.
 *
 * Naming them in the contract — instead of quietly omitting the panels — is what
 * keeps the page honest. Each is rendered, each says DATA_UNAVAILABLE, and each
 * says why.
 */
export const UNAVAILABLE_CAPABILITIES = Object.freeze([
  /**
   * There is no production-line entity. `PRODUCTION_LINE` exists only as a value
   * of `RegistryAssetType`, so "lines" would be a filtered asset list dressed up
   * as a hierarchy the platform does not model.
   */
  "PRODUCTION_LINES",
  /**
   * `AlarmDefinition` is a design-time import with a `conditionReference` and no
   * evaluator. There is no firing-alarm or event table anywhere, so active
   * alarms cannot be shown at all.
   */
  "LIVE_ALARM_EVENTS",
  /**
   * No PLC diagnostic channel exists. `OtDeviceProfile` holds engineering
   * metadata — category, firmware, zone, safety class — and the network node
   * address is documented as "never used to open a connection".
   */
  "LIVE_PLC_DIAGNOSTICS",
] as const);
export type UnavailableCapability = (typeof UNAVAILABLE_CAPABILITIES)[number];

/**
 * The worst state across a set, for a site rollup.
 *
 * Worst-wins, and UNKNOWN does NOT outrank a known bad state: a site with one
 * dead gateway and one unreadable record is NOT_CONNECTED, because that is the
 * fact an operator must act on. With nothing at all to judge, the answer is
 * UNKNOWN rather than a reassuring CONNECTED.
 */
export function rollupConnectivity(verdicts: readonly ConnectivityVerdict[]): ConnectivityVerdict {
  if (verdicts.length === 0) {
    return { state: "UNKNOWN", reason: "DATA_UNAVAILABLE", ageMs: null, storedStatus: null };
  }
  const order: Record<ConnectivityState, number> = {
    NOT_CONNECTED: 0,
    DEGRADED: 1,
    UNKNOWN: 2,
    CONNECTED: 3,
  };
  return verdicts.reduce((worst, v) => (order[v.state] < order[worst.state] ? v : worst));
}

/* ── role narrowing ────────────────────────────────────────────────────────── */

/**
 * The organisation roles the industrial permission matrix actually understands.
 *
 * WHY THIS EXISTS. `resolveTenantContextFromServerSession` returns
 * `OrganizationRole` — the Prisma enum, FIFTEEN values wide, including
 * `HR_MANAGER`, `RECRUITER`, `ACADEMY_ADMIN` and `STUDENT`. `can()` accepts
 * `OrgRole`, which is SEVEN. The two vocabularies have drifted apart, and a
 * cast would paper over that: it would compile, and the reader would never learn
 * that a role exists which the matrix has no opinion about.
 *
 * So the narrowing is explicit and FAIL-CLOSED. A role outside this list yields
 * null, the caller refuses, and nobody is granted industrial access by an
 * omission in a permission table. The alternative — assuming an unknown role is
 * harmless — is how a recruiter ends up reading plant data.
 */
const INDUSTRIAL_ORG_ROLES = Object.freeze([
  "OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN", "MEMBER",
] as const);
export type IndustrialOrgRole = (typeof INDUSTRIAL_ORG_ROLES)[number];

/** Returns the role when the matrix knows it, and null otherwise. Never throws. */
export function narrowToOrgRole(role: string): IndustrialOrgRole | null {
  return (INDUSTRIAL_ORG_ROLES as readonly string[]).includes(role)
    ? (role as IndustrialOrgRole)
    : null;
}

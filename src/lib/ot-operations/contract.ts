// PHASE 94C1 — the client-side mirror of the verified OT list API contract.
//
// WHY THIS FILE EXISTS
// The browser must never send a query key or an enum value the server does not
// accept. `docs/OT_API_CONTRACT.md` is the authority; these constants restate it
// in a form the UI can build controls from, and a test pins them back to the
// server's own allow-lists so the two cannot drift apart.
//
// WHAT IS DELIBERATELY ABSENT
//   - a gateway `category` filter: EdgeGatewayProfile has no such column;
//   - a device `vendor` / `manufacturer` filter: no column backs it.
// Offering either would be a control that silently does nothing.
//
// This module is pure data. It imports nothing, runs on the server and in the
// browser alike, and holds no credential, endpoint secret or tenant value.

/* ── Gateways ───────────────────────────────────────────────────────────── */

export const GATEWAY_LIFECYCLES = [
  "REGISTERED",
  "ACTIVE",
  "STALE",
  "DISABLED",
  "REVOKED",
  "SIMULATOR",
] as const;
export type GatewayLifecycle = (typeof GATEWAY_LIFECYCLES)[number];

export const GATEWAY_CAPABILITIES = [
  "PROJECT_METADATA_IMPORT",
  "TAG_METADATA_IMPORT",
  "ALARM_METADATA_IMPORT",
  "NETWORK_METADATA_IMPORT",
  "READ_ONLY_TELEMETRY",
  "SIMULATION",
] as const;
export type GatewayCapability = (typeof GATEWAY_CAPABILITIES)[number];

/** Server allow-list. An unlisted value is silently replaced by the first. */
export const GATEWAY_SORT_FIELDS = ["createdAt", "updatedAt", "lifecycle"] as const;
export type GatewaySortField = (typeof GATEWAY_SORT_FIELDS)[number];

/* ── Devices ────────────────────────────────────────────────────────────── */

export const DEVICE_LIFECYCLES = [
  "PLANNED",
  "COMMISSIONING",
  "OPERATIONAL",
  "MAINTENANCE",
  "DECOMMISSIONED",
  "UNKNOWN",
] as const;
export type DeviceLifecycle = (typeof DEVICE_LIFECYCLES)[number];

export const DEVICE_CATEGORIES = [
  "PLC",
  "HMI",
  "SCADA_SERVER",
  "VFD",
  "MCC",
  "REMOTE_IO",
  "INDUSTRIAL_PC",
  "SAFETY_CONTROLLER",
  "NETWORK_SWITCH",
  "GATEWAY",
  "SENSOR_AGGREGATOR",
  "OTHER",
] as const;
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

export const DEVICE_SORT_FIELDS = ["createdAt", "updatedAt", "category"] as const;
export type DeviceSortField = (typeof DEVICE_SORT_FIELDS)[number];

/* ── Shared bounds ──────────────────────────────────────────────────────── */

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** The server clamps to 1..200; the UI offers a small, deliberate set. */
export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

/** The server refuses a longer term rather than truncating it. */
export const MAX_SEARCH_LENGTH = 120;

/** The shape the server requires of a site identifier. */
export const SITE_ID_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;

/**
 * The ONLY query keys either list endpoint reads.
 *
 * Anything else is ignored by the server, so sending it would let the interface
 * imply a narrowing that never happened.
 */
export const GATEWAY_QUERY_KEYS = [
  "lifecycle",
  "siteId",
  "capability",
  "search",
  "page",
  "pageSize",
  "sortBy",
  "sortDir",
] as const;

export const DEVICE_QUERY_KEYS = [
  "lifecycle",
  "siteId",
  "category",
  "search",
  "page",
  "pageSize",
  "sortBy",
  "sortDir",
] as const;

/* ── Response shapes (safe DTO subset the UI actually renders) ──────────── */

export interface GatewayRow {
  id: string;
  /** The related registry record's primary key — a SYSTEM identifier. */
  gatewayId: string;
  displayName: string;
  siteId: string | null;
  lifecycle: string;
  environment: string;
  capabilities: string[];
  softwareVersion: string | null;
  readOnlyMode: boolean;
  simulatorMode: boolean;
  disabled: boolean;
  /** Presence only — never the reference itself. */
  signingConfigured: boolean;
  /** When the most recent signed envelope was ACCEPTED. Null = never. */
  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DeviceRow {
  id: string;
  siteId: string | null;
  assetId: string | null;
  category: string;
  lifecycle: string;
  networkZone: string;
  safetyClass: string;
  firmwareVersion: string | null;
  productFamily: string | null;
  engineeringId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ListPage<T> {
  items: T[];
  /** Rows visible to THIS actor after filtering — never an org-wide total. */
  total: number;
  take: number;
  skip: number;
}

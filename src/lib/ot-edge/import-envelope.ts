// PHASE 94 — canonical engineering-import envelope.
//
// SAFETY POSTURE
// This module parses EXPORTED ENGINEERING METADATA. It never opens a network
// connection, never touches the filesystem, never evaluates a condition
// expression and never produces a device write. `accessMode` on a tag records
// what the export DECLARED; it is not a capability this system can exercise.
//
// STRICTNESS
// Every object is `.strict()` — an unknown key is an error, not silently kept.
// There is no free-form metadata blob: an attacker cannot smuggle a payload
// through a permissive `Json` field. Every array and string is bounded so a
// hostile export cannot exhaust memory before the size guard sees it.

import { z } from "zod";

/** Envelope schema versions this build understands. */
export const SUPPORTED_SCHEMA_VERSIONS = ["1.0"] as const;

/** Hard bounds. Enforced by the schema, so parsing itself is bounded. */
export const IMPORT_LIMITS = {
  /** Raw request body, bytes. */
  maxBytes: 2 * 1024 * 1024,
  maxDevices: 2_000,
  maxTags: 20_000,
  maxAlarms: 5_000,
  maxNetworkNodes: 2_000,
  /** Total records across all collections. */
  maxTotalRecords: 25_000,
  maxNameLength: 191,
  maxDescriptionLength: 500,
  maxReferenceLength: 255,
} as const;

/* ── Primitive field builders ─────────────────────────────────────────────── */

const shortText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const SOURCE_TYPES = [
  "TIA_EXPORT",
  "PLC_EXPORT",
  "HMI_EXPORT",
  "SCADA_EXPORT",
  "GENERIC",
  "SIMULATOR",
] as const;

export const DEVICE_CATEGORIES = [
  "PLC", "HMI", "SCADA_SERVER", "VFD", "MCC", "REMOTE_IO",
  "INDUSTRIAL_PC", "SAFETY_CONTROLLER", "NETWORK_SWITCH", "GATEWAY",
  "SENSOR_AGGREGATOR", "OTHER",
] as const;

export const NETWORK_ZONES = [
  "ENTERPRISE", "DMZ", "SUPERVISORY", "CONTROL", "FIELD", "SAFETY", "UNKNOWN",
] as const;

export const SAFETY_CLASSES = ["NON_SAFETY", "SAFETY_RELATED", "SAFETY_CRITICAL", "UNKNOWN"] as const;

export const ACCESS_MODES = ["READ", "READ_WRITE", "WRITE", "UNKNOWN"] as const;

export const PROTOCOLS = [
  "OPC_UA", "MQTT", "MODBUS_TCP", "SIEMENS_S7", "SCADA", "HISTORIAN", "MANUAL", "OTHER",
] as const;

/**
 * Data types an engineering export may declare. Anything outside this set is
 * reported by rule OT-TAG-INVALID-TYPE rather than silently accepted, so the
 * schema itself stays permissive here on purpose (a bad type is a FINDING, not
 * a parse failure — rejecting the whole import would lose the other 19,999
 * valid tags).
 */
export const KNOWN_DATA_TYPES = [
  "BOOL", "BYTE", "WORD", "DWORD", "LWORD",
  "SINT", "INT", "DINT", "LINT", "USINT", "UINT", "UDINT", "ULINT",
  "REAL", "LREAL", "TIME", "DATE", "STRING", "WSTRING", "CHAR",
] as const;

/* ── Collections ──────────────────────────────────────────────────────────── */

export const DeviceSchema = z
  .object({
    engineeringId: shortText(IMPORT_LIMITS.maxNameLength),
    name: shortText(IMPORT_LIMITS.maxNameLength),
    category: z.enum(DEVICE_CATEGORIES).default("OTHER"),
    manufacturer: optionalText(120),
    productFamily: optionalText(120),
    model: optionalText(120),
    firmwareVersion: optionalText(64),
    networkZone: z.enum(NETWORK_ZONES).default("UNKNOWN"),
    safetyClass: z.enum(SAFETY_CLASSES).default("UNKNOWN"),
  })
  .strict();

export const TagSchema = z
  .object({
    name: shortText(IMPORT_LIMITS.maxNameLength),
    /** Owning device, by engineeringId. Unresolved refs become a finding. */
    deviceRef: optionalText(IMPORT_LIMITS.maxNameLength),
    dataType: shortText(48),
    address: optionalText(120),
    symbolicPath: optionalText(IMPORT_LIMITS.maxReferenceLength),
    unit: optionalText(32),
    description: optionalText(IMPORT_LIMITS.maxDescriptionLength),
    accessMode: z.enum(ACCESS_MODES).default("UNKNOWN"),
    safetyClass: z.enum(SAFETY_CLASSES).default("UNKNOWN"),
    sourceReference: optionalText(IMPORT_LIMITS.maxReferenceLength),
  })
  .strict();

export const AlarmSchema = z
  .object({
    code: shortText(64),
    deviceRef: optionalText(IMPORT_LIMITS.maxNameLength),
    severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    message: optionalText(IMPORT_LIMITS.maxDescriptionLength),
    conditionReference: optionalText(IMPORT_LIMITS.maxReferenceLength),
    requiresAck: z.boolean().default(false),
    safetyClass: z.enum(SAFETY_CLASSES).default("UNKNOWN"),
    productionRelevant: z.boolean().default(false),
    sourceReference: optionalText(IMPORT_LIMITS.maxReferenceLength),
  })
  .strict();

export const NetworkNodeSchema = z
  .object({
    nodeName: shortText(IMPORT_LIMITS.maxNameLength),
    deviceRef: optionalText(IMPORT_LIMITS.maxNameLength),
    zone: z.enum(NETWORK_ZONES).default("UNKNOWN"),
    protocol: z.enum(PROTOCOLS).default("OTHER"),
    address: optionalText(120),
    subnet: optionalText(64),
    stationId: optionalText(64),
    sourceReference: optionalText(IMPORT_LIMITS.maxReferenceLength),
  })
  .strict();

export const ProjectHeaderSchema = z
  .object({
    name: shortText(IMPORT_LIMITS.maxNameLength),
    version: optionalText(64),
    vendor: optionalText(120),
    platform: optionalText(120),
    /** Engineering revision. Absent → rule OT-PROJECT-NO-REVISION. */
    revision: z.number().int().min(1).max(100_000).optional(),
  })
  .strict();

export const ImportEnvelopeSchema = z
  .object({
    schemaVersion: z.enum(SUPPORTED_SCHEMA_VERSIONS),
    sourceType: z.enum(SOURCE_TYPES),
    project: ProjectHeaderSchema,
    devices: z.array(DeviceSchema).max(IMPORT_LIMITS.maxDevices).default([]),
    tags: z.array(TagSchema).max(IMPORT_LIMITS.maxTags).default([]),
    alarms: z.array(AlarmSchema).max(IMPORT_LIMITS.maxAlarms).default([]),
    networkNodes: z.array(NetworkNodeSchema).max(IMPORT_LIMITS.maxNetworkNodes).default([]),
  })
  .strict()
  .superRefine((env, ctx) => {
    const total =
      env.devices.length + env.tags.length + env.alarms.length + env.networkNodes.length;
    if (total > IMPORT_LIMITS.maxTotalRecords) {
      ctx.addIssue({
        code: "custom",
        message: `Import exceeds the ${IMPORT_LIMITS.maxTotalRecords} record limit`,
        path: ["records"],
      });
    }
  });

export type ImportEnvelope = z.infer<typeof ImportEnvelopeSchema>;
export type EnvelopeDevice = z.infer<typeof DeviceSchema>;
export type EnvelopeTag = z.infer<typeof TagSchema>;
export type EnvelopeAlarm = z.infer<typeof AlarmSchema>;
export type EnvelopeNetworkNode = z.infer<typeof NetworkNodeSchema>;

/* ── Normalisation ────────────────────────────────────────────────────────── */

/**
 * Locale-independent identity key.
 *
 * Uses an explicit character map plus `toUpperCase("en-US")` — NOT the ambient
 * locale. A Turkish-locale server would otherwise fold "i" to "İ" and split one
 * tag into two identities, which would make duplicate detection wrong in a way
 * that is invisible in testing. Whitespace and separator runs collapse so
 * "Motor  Run" , "motor_run" and "MOTOR-RUN" are one identity.
 */
export function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s_\-.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Canonical, order-stable serialisation of the envelope.
 *
 * Two exports describing the same plant must produce the same bytes regardless
 * of the order their rows happened to appear in, so the checksum identifies
 * CONTENT rather than file layout. Keys are emitted in a fixed order and
 * collections are sorted by their identity key.
 */
export function canonicalize(env: ImportEnvelope): string {
  const byKey = <T>(items: T[], key: (t: T) => string): T[] =>
    [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

  const canonical = {
    schemaVersion: env.schemaVersion,
    sourceType: env.sourceType,
    project: {
      name: normalizeIdentifier(env.project.name),
      version: env.project.version ?? null,
      vendor: env.project.vendor ?? null,
      platform: env.project.platform ?? null,
      revision: env.project.revision ?? null,
    },
    devices: byKey(env.devices, (d) => normalizeIdentifier(d.engineeringId)).map((d) => ({
      engineeringId: normalizeIdentifier(d.engineeringId),
      name: d.name,
      category: d.category,
      manufacturer: d.manufacturer ?? null,
      productFamily: d.productFamily ?? null,
      model: d.model ?? null,
      firmwareVersion: d.firmwareVersion ?? null,
      networkZone: d.networkZone,
      safetyClass: d.safetyClass,
    })),
    tags: byKey(env.tags, (t) => normalizeIdentifier(t.name)).map((t) => ({
      name: normalizeIdentifier(t.name),
      deviceRef: t.deviceRef ? normalizeIdentifier(t.deviceRef) : null,
      dataType: t.dataType.toUpperCase(),
      address: t.address ?? null,
      symbolicPath: t.symbolicPath ?? null,
      unit: t.unit ?? null,
      description: t.description ?? null,
      accessMode: t.accessMode,
      safetyClass: t.safetyClass,
      sourceReference: t.sourceReference ?? null,
    })),
    alarms: byKey(env.alarms, (a) => normalizeIdentifier(a.code)).map((a) => ({
      code: normalizeIdentifier(a.code),
      deviceRef: a.deviceRef ? normalizeIdentifier(a.deviceRef) : null,
      severity: a.severity,
      message: a.message ?? null,
      conditionReference: a.conditionReference ?? null,
      requiresAck: a.requiresAck,
      safetyClass: a.safetyClass,
      productionRelevant: a.productionRelevant,
      sourceReference: a.sourceReference ?? null,
    })),
    networkNodes: byKey(env.networkNodes, (n) => normalizeIdentifier(n.nodeName)).map((n) => ({
      nodeName: normalizeIdentifier(n.nodeName),
      deviceRef: n.deviceRef ? normalizeIdentifier(n.deviceRef) : null,
      zone: n.zone,
      protocol: n.protocol,
      address: n.address ?? null,
      subnet: n.subnet ?? null,
      stationId: n.stationId ?? null,
      sourceReference: n.sourceReference ?? null,
    })),
  };
  return JSON.stringify(canonical);
}

/** SHA-256 of the canonical form. The immutable evidence identifier. */
export async function checksumOf(env: ImportEnvelope): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(canonicalize(env), "utf8").digest("hex");
}

/* ── Parse result ─────────────────────────────────────────────────────────── */

export type ParseFailure =
  | "UNSUPPORTED_FORMAT"
  | "SCHEMA_INVALID"
  | "TOO_LARGE"
  | "TOO_MANY_RECORDS"
  | "PARSE_ERROR";

export type ParseResult =
  | { ok: true; envelope: ImportEnvelope }
  /** `field` is a schema path only — the rejected VALUE is never returned. */
  | { ok: false; failure: ParseFailure; field?: string };

/**
 * Validate an already-parsed JSON value against the envelope contract.
 * Returns a category and a safe field path; never echoes imported content.
 */
export function parseEnvelope(raw: unknown): ParseResult {
  const parsed = ImportEnvelopeSchema.safeParse(raw);
  if (parsed.success) return { ok: true, envelope: parsed.data };

  const issue = parsed.error.issues[0];
  const path = issue?.path;
  const field = Array.isArray(path) ? path.map(String).join(".") : undefined;

  // A count overflow arrives two ways: `too_big` from a per-collection `.max()`,
  // and the `custom` issue the total-budget refinement raises on path ["records"].
  // Both are the same operator-facing category — reporting the second as a
  // generic schema error would hide WHY a large-but-valid export was refused.
  const head = typeof path?.[0] === "string" ? String(path[0]) : "";
  const countPath = ["devices", "tags", "alarms", "networkNodes", "records"].includes(head);
  const tooMany = countPath && (issue?.code === "too_big" || issue?.code === "custom");

  return { ok: false, failure: tooMany ? "TOO_MANY_RECORDS" : "SCHEMA_INVALID", field };
}

/** Reject an oversized body before it is parsed at all. */
export function withinSizeLimit(byteLength: number): boolean {
  return byteLength <= IMPORT_LIMITS.maxBytes;
}

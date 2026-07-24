// PHASE 94C2 — the client-side mirror of the OT WRITE contracts.
//
// WHY AN EXPLICIT MIRROR RATHER THAN REUSING THE READ DTO
// The read DTO and the write schema are different shapes, and the difference is
// the whole point: a DTO carries fields the server will REFUSE on the way back
// in (`id`, `siteId`, `createdAt`, `signingConfigured`, `lastSeenAt`). Every
// write schema is `.strict()`, so spreading a fetched record into a mutation is
// not a style problem — it is a guaranteed 422. Naming the writable fields here
// makes "what may be sent" a decision someone had to make, not a by-product of
// what happened to be fetched.
//
// THREE FACTS THIS FILE ENCODES, EACH VERIFIED AGAINST THE ROUTES
//
//   1. NO SITE IS EVER SUBMITTED. Neither write schema accepts `siteId`. A
//      gateway profile inherits the site of the `IndustrialGateway` it points
//      at; a device profile inherits the site of its `IndustrialAsset`. Site
//      *assignment* therefore does not exist as an operation, and offering it
//      would be a control that cannot work.
//
//   2. THE PARENT IDENTIFIER IS A PRIMARY KEY, NOT A SERIAL. `gatewayId` in the
//      create body is `IndustrialGateway.id`; `assetId` is `IndustrialAsset.id`.
//      Sending the human-facing hardware identifier instead yields a bare 422
//      with no field detail, so the picker must submit `record.id`.
//
//   3. LIFECYCLE IS UPDATE-ONLY FOR A GATEWAY. `POST /api/ot/gateways` has no
//      `lifecycle` field — a new profile starts REGISTERED by database default.
//      A device, by contrast, accepts `lifecycleState` on create.
//
// `signingKeyRef` is accepted by both gateway schemas and is deliberately NOT
// exposed here. It is a pointer to signing material; provisioning it is not a
// dashboard workflow, and a field for it would put credential plumbing in front
// of an operator who has no business editing it.

import {
  DEVICE_CATEGORIES,
  DEVICE_LIFECYCLES,
  GATEWAY_CAPABILITIES,
  GATEWAY_LIFECYCLES,
} from "./contract";

/* ── Enum allow-lists that only the write path needs ────────────────────── */

/**
 * `EdgeGatewayEnvironment` as the ROUTE accepts it.
 *
 * The Prisma enum also has `TEST`, but `CreateGateway`/`UpdateGateway` omit it,
 * so offering `TEST` would produce a guaranteed 422. The route is the contract.
 */
export const GATEWAY_ENVIRONMENTS = ["PRODUCTION", "STAGING", "LAB", "SIMULATION"] as const;
export type GatewayEnvironment = (typeof GATEWAY_ENVIRONMENTS)[number];

export const DEVICE_NETWORK_ZONES = [
  "ENTERPRISE",
  "DMZ",
  "SUPERVISORY",
  "CONTROL",
  "FIELD",
  "SAFETY",
  "UNKNOWN",
] as const;
export type DeviceNetworkZone = (typeof DEVICE_NETWORK_ZONES)[number];

export const DEVICE_SAFETY_CLASSES = ["NON_SAFETY", "SAFETY_RELATED", "SAFETY_CRITICAL", "UNKNOWN"] as const;
export type DeviceSafetyClass = (typeof DEVICE_SAFETY_CLASSES)[number];

/* ── Field bounds, copied from the route schemas ────────────────────────── */

export const WRITE_LIMITS = {
  /** `IndustrialGateway.id` / `IndustrialAsset.id`. */
  parentIdMax: 191,
  softwareVersionMax: 64,
  firmwareVersionMax: 64,
  productFamilyMax: 120,
  engineeringIdMax: 191,
  /** `z.array(...).max(16)` on the gateway capability list. */
  capabilitiesMax: 16,
} as const;

/**
 * The shape a parent identifier must take.
 *
 * Both are cuids, so anything carrying whitespace, quotes or separators is
 * malformed rather than merely wrong, and is refused before a request is made.
 */
export const PARENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;

/* ── The bodies that may be sent ────────────────────────────────────────── */

/**
 * `POST /api/ot/gateways`.
 *
 * Every optional field is genuinely omittable: the server applies a database
 * default. Sending `undefined` is not the same as sending `null` for the
 * nullable ones, which is why the builder below omits rather than nulls.
 */
export interface CreateGatewayBody {
  /** `IndustrialGateway.id` — a system identifier, never a serial number. */
  gatewayId: string;
  environment?: GatewayEnvironment;
  capabilities?: string[];
  softwareVersion?: string | null;
  readOnlyMode?: boolean;
  simulatorMode?: boolean;
}

/** `PATCH /api/ot/gateways/[id]`. No `gatewayId`: the parent link is immutable. */
export interface UpdateGatewayBody {
  environment?: GatewayEnvironment;
  capabilities?: string[];
  softwareVersion?: string | null;
  readOnlyMode?: boolean;
  simulatorMode?: boolean;
  lifecycle?: (typeof GATEWAY_LIFECYCLES)[number];
}

/** `POST /api/ot/devices`. */
export interface CreateDeviceBody {
  /** `IndustrialAsset.id`. The site is derived from it, never submitted. */
  assetId: string;
  category?: (typeof DEVICE_CATEGORIES)[number];
  /** WRITE name. The DTO reads this back as `lifecycle`. */
  lifecycleState?: (typeof DEVICE_LIFECYCLES)[number];
  networkZone?: DeviceNetworkZone;
  safetyClass?: DeviceSafetyClass;
  productFamily?: string | null;
  firmwareVersion?: string | null;
  engineeringId?: string | null;
}

/** `PATCH /api/ot/devices/[id]`. No `assetId`: the asset link is immutable. */
export type UpdateDeviceBody = Omit<CreateDeviceBody, "assetId">;

/**
 * Fields no OT mutation may ever carry.
 *
 * Asserted by a test against the payload builders below, so a future field
 * cannot be added by copying a DTO. Each entry is either server-owned, derived,
 * or credential-adjacent.
 */
export const FORBIDDEN_WRITE_FIELDS = Object.freeze([
  "id",
  "organizationId",
  "tenantId",
  "siteId",
  "ingestionId",
  "signingKeyRef",
  "signingConfigured",
  "secretRef",
  "credential",
  "token",
  "password",
  "privateKey",
  "nonce",
  "idempotencyKey",
  "lastSeenAt",
  "lastEnvelopeAt",
  "createdAt",
  "updatedAt",
  "displayName",
  "disabled",
  // Read-only DTO fields with no column behind them.
  "manufacturer",
  "model",
  "protocols",
  "lastImportSource",
] as const);

/* ── Draft state → request body ─────────────────────────────────────────── */

/**
 * What the forms hold while the operator types.
 *
 * Strings throughout, including for the booleans and enums, because that is
 * what a form control produces. Conversion happens once, in the builders below,
 * so no component invents its own coercion.
 */
export interface GatewayFormDraft {
  gatewayId: string;
  environment: string;
  capabilities: string[];
  softwareVersion: string;
  readOnlyMode: boolean;
  simulatorMode: boolean;
  lifecycle: string;
}

export interface DeviceFormDraft {
  assetId: string;
  category: string;
  lifecycleState: string;
  networkZone: string;
  safetyClass: string;
  productFamily: string;
  firmwareVersion: string;
  engineeringId: string;
}

export const EMPTY_GATEWAY_DRAFT: GatewayFormDraft = {
  gatewayId: "",
  environment: "",
  capabilities: [],
  softwareVersion: "",
  readOnlyMode: true,
  simulatorMode: false,
  lifecycle: "",
};

export const EMPTY_DEVICE_DRAFT: DeviceFormDraft = {
  assetId: "",
  category: "",
  lifecycleState: "",
  networkZone: "",
  safetyClass: "",
  productFamily: "",
  firmwareVersion: "",
  engineeringId: "",
};

const oneOf = <T extends string>(value: string, allowed: readonly T[]): T | undefined =>
  (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

/** Trim, then treat blank as "not provided" rather than as an empty string. */
const text = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/**
 * Build the create body for a gateway.
 *
 * EXPLICIT FIELD MAPPING, never a spread. Every key is named, so a field can
 * only reach the wire because someone wrote it here — and the enum values are
 * re-checked against the allow-list on the way out, so a tampered control
 * cannot smuggle a value the server would reject with no useful message.
 */
export function buildCreateGatewayBody(draft: GatewayFormDraft): CreateGatewayBody {
  const environment = oneOf(draft.environment, GATEWAY_ENVIRONMENTS);
  const capabilities = draft.capabilities.filter((value) =>
    (GATEWAY_CAPABILITIES as readonly string[]).includes(value),
  );
  const softwareVersion = text(draft.softwareVersion);

  return {
    gatewayId: draft.gatewayId.trim(),
    ...(environment ? { environment } : {}),
    // An empty selection is omitted, not sent as `[]`: `[]` would mean "declare
    // no capability", which is a different statement from "leave the default".
    ...(capabilities.length > 0 ? { capabilities } : {}),
    ...(softwareVersion === undefined ? {} : { softwareVersion }),
    readOnlyMode: draft.readOnlyMode,
    simulatorMode: draft.simulatorMode,
  };
}

/**
 * Build the update body for a gateway.
 *
 * Only fields the operator actually changed are sent. An unchanged field is
 * omitted so a concurrent edit by someone else is not silently reverted by a
 * value this form happened to load minutes ago.
 */
export function buildUpdateGatewayBody(
  draft: GatewayFormDraft,
  original: GatewayFormDraft,
): UpdateGatewayBody {
  const body: UpdateGatewayBody = {};

  const environment = oneOf(draft.environment, GATEWAY_ENVIRONMENTS);
  if (environment && environment !== original.environment) body.environment = environment;

  const capabilities = draft.capabilities.filter((value) =>
    (GATEWAY_CAPABILITIES as readonly string[]).includes(value),
  );
  if (!sameSet(capabilities, original.capabilities)) body.capabilities = capabilities;

  const softwareVersion = draft.softwareVersion.trim();
  if (softwareVersion !== original.softwareVersion.trim()) {
    // Cleared means "remove it", which the schema expresses as null.
    body.softwareVersion = softwareVersion === "" ? null : softwareVersion;
  }

  if (draft.readOnlyMode !== original.readOnlyMode) body.readOnlyMode = draft.readOnlyMode;
  if (draft.simulatorMode !== original.simulatorMode) body.simulatorMode = draft.simulatorMode;

  const lifecycle = oneOf(draft.lifecycle, GATEWAY_LIFECYCLES);
  if (lifecycle && lifecycle !== original.lifecycle) body.lifecycle = lifecycle;

  return body;
}

export function buildCreateDeviceBody(draft: DeviceFormDraft): CreateDeviceBody {
  const category = oneOf(draft.category, DEVICE_CATEGORIES);
  const lifecycleState = oneOf(draft.lifecycleState, DEVICE_LIFECYCLES);
  const networkZone = oneOf(draft.networkZone, DEVICE_NETWORK_ZONES);
  const safetyClass = oneOf(draft.safetyClass, DEVICE_SAFETY_CLASSES);
  const productFamily = text(draft.productFamily);
  const firmwareVersion = text(draft.firmwareVersion);
  const engineeringId = text(draft.engineeringId);

  return {
    assetId: draft.assetId.trim(),
    ...(category ? { category } : {}),
    ...(lifecycleState ? { lifecycleState } : {}),
    ...(networkZone ? { networkZone } : {}),
    ...(safetyClass ? { safetyClass } : {}),
    ...(productFamily === undefined ? {} : { productFamily }),
    ...(firmwareVersion === undefined ? {} : { firmwareVersion }),
    ...(engineeringId === undefined ? {} : { engineeringId }),
  };
}

export function buildUpdateDeviceBody(
  draft: DeviceFormDraft,
  original: DeviceFormDraft,
): UpdateDeviceBody {
  const body: UpdateDeviceBody = {};

  const category = oneOf(draft.category, DEVICE_CATEGORIES);
  if (category && category !== original.category) body.category = category;

  const lifecycleState = oneOf(draft.lifecycleState, DEVICE_LIFECYCLES);
  if (lifecycleState && lifecycleState !== original.lifecycleState) body.lifecycleState = lifecycleState;

  const networkZone = oneOf(draft.networkZone, DEVICE_NETWORK_ZONES);
  if (networkZone && networkZone !== original.networkZone) body.networkZone = networkZone;

  const safetyClass = oneOf(draft.safetyClass, DEVICE_SAFETY_CLASSES);
  if (safetyClass && safetyClass !== original.safetyClass) body.safetyClass = safetyClass;

  for (const field of ["productFamily", "firmwareVersion", "engineeringId"] as const) {
    const next = draft[field].trim();
    if (next !== original[field].trim()) body[field] = next === "" ? null : next;
  }

  return body;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

/* ── Client-side validation, mirroring the server bounds ────────────────── */

/**
 * Field keys a message can attach to.
 *
 * A server 422 carries no field detail, so client validation must mirror the
 * server's bounds exactly — otherwise the operator meets an unattributable
 * "the request payload is not valid" with no way to find the offending field.
 */
export type GatewayFieldError = "gatewayId" | "softwareVersion" | "capabilities";
export type DeviceFieldError =
  | "assetId"
  | "engineeringId"
  | "productFamily"
  | "firmwareVersion";

export function validateGatewayDraft(
  draft: GatewayFormDraft,
  mode: "create" | "edit",
): Partial<Record<GatewayFieldError, string>> {
  const errors: Partial<Record<GatewayFieldError, string>> = {};

  if (mode === "create") {
    const id = draft.gatewayId.trim();
    if (id === "") errors.gatewayId = "required";
    else if (!PARENT_ID_PATTERN.test(id)) errors.gatewayId = "malformed";
  }

  if (draft.softwareVersion.trim().length > WRITE_LIMITS.softwareVersionMax) {
    errors.softwareVersion = "tooLong";
  }
  if (draft.capabilities.length > WRITE_LIMITS.capabilitiesMax) {
    errors.capabilities = "tooMany";
  }
  return errors;
}

export function validateDeviceDraft(
  draft: DeviceFormDraft,
  mode: "create" | "edit",
): Partial<Record<DeviceFieldError, string>> {
  const errors: Partial<Record<DeviceFieldError, string>> = {};

  if (mode === "create") {
    const id = draft.assetId.trim();
    if (id === "") errors.assetId = "required";
    else if (!PARENT_ID_PATTERN.test(id)) errors.assetId = "malformed";
  }

  if (draft.engineeringId.trim().length > WRITE_LIMITS.engineeringIdMax) errors.engineeringId = "tooLong";
  if (draft.productFamily.trim().length > WRITE_LIMITS.productFamilyMax) errors.productFamily = "tooLong";
  if (draft.firmwareVersion.trim().length > WRITE_LIMITS.firmwareVersionMax) errors.firmwareVersion = "tooLong";

  return errors;
}

/* ── DTO → draft, for the edit forms ────────────────────────────────────── */

/**
 * Seed an edit form from a fetched record.
 *
 * Reads only the fields the update schema accepts. Everything else the DTO
 * carries — id, site, timestamps, signing state — is deliberately dropped here
 * rather than filtered later, so it cannot travel back to the server at all.
 */
export function gatewayDraftFromRecord(record: {
  environment: string;
  capabilities: string[];
  softwareVersion: string | null;
  readOnlyMode: boolean;
  simulatorMode: boolean;
  lifecycle: string;
}): GatewayFormDraft {
  return {
    // Immutable on update; kept blank so nothing can send it.
    gatewayId: "",
    environment: record.environment ?? "",
    capabilities: [...(record.capabilities ?? [])],
    softwareVersion: record.softwareVersion ?? "",
    readOnlyMode: record.readOnlyMode,
    simulatorMode: record.simulatorMode,
    lifecycle: record.lifecycle ?? "",
  };
}

export function deviceDraftFromRecord(record: {
  category: string;
  lifecycle: string;
  networkZone: string;
  safetyClass: string;
  productFamily: string | null;
  firmwareVersion: string | null;
  engineeringId: string | null;
}): DeviceFormDraft {
  return {
    assetId: "",
    category: record.category ?? "",
    // The DTO reads it back as `lifecycle`; the write name is `lifecycleState`.
    lifecycleState: record.lifecycle ?? "",
    networkZone: record.networkZone ?? "",
    safetyClass: record.safetyClass ?? "",
    productFamily: record.productFamily ?? "",
    firmwareVersion: record.firmwareVersion ?? "",
    engineeringId: record.engineeringId ?? "",
  };
}

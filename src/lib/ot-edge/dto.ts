// PHASE 94B3 — DTO mappers: the boundary between persisted rows and callers.
//
// WHY MAPPERS AND NOT `select`
// A Prisma `select` is a promise made at each call site; forget one field once
// and a secret reference or an internal column ships to a client. These mappers
// are total functions that BUILD the output object explicitly, so a column
// added to the schema later is invisible until someone deliberately maps it.
// That is the property the leakage tests assert.
//
// Nothing here reaches a database. Mapping is pure so it can be tested against
// deliberately over-populated fixtures containing fields that must NOT survive.

/** Fields that must never appear in any DTO, whatever the model gains later. */
export const FORBIDDEN_DTO_FIELDS = Object.freeze([
  "signingKeyRef",
  "signature",
  "nonce",
  "idempotencyKey",
  "secret",
  "sourcePayload",
  "rawPayload",
  "evidenceBody",
  "passwordHash",
] as const);

/** A loose row shape — adapters pass Prisma rows in without leaking the type. */
type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nstr = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const bool = (v: unknown): boolean => v === true;
const iso = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : typeof v === "string" && v ? v : null;
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export interface GatewayProfileDto {
  id: string;
  gatewayId: string;
  displayName: string;
  siteId: string | null;
  lifecycle: string;
  environment: string;
  softwareVersion: string | null;
  capabilities: string[];
  readOnlyMode: boolean;
  simulatorMode: boolean;
  disabled: boolean;
  /**
   * Whether a signing reference is registered — NOT the reference itself.
   * Operators need to know a gateway is provisioned; nobody needs the pointer.
   */
  signingConfigured: boolean;
  /**
   * PHASE 94B4.1 — the machine ingestion handle, present ONLY in the response
   * to creating a profile. It is an identifier, not a credential (the HMAC is
   * the credential), but it is still revealed once rather than on every read,
   * so a broad list response never becomes a directory of ingestion endpoints.
   */
  ingestionId?: string;
  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function toGatewayProfileDto(row: Row): GatewayProfileDto {
  return {
    id: str(row.id),
    gatewayId: str(row.gatewayId),
    displayName: str(row.displayName),
    siteId: nstr(row.siteId),
    lifecycle: str(row.lifecycle),
    environment: str(row.environment),
    softwareVersion: nstr(row.softwareVersion),
    capabilities: list(row.capabilities),
    readOnlyMode: bool(row.readOnlyMode),
    simulatorMode: bool(row.simulatorMode),
    disabled: bool(row.disabled),
    // PHASE 94B.1 — prefer the value the record already derived.
    //
    // `GatewayProfileRecord` carries `signingConfigured` as a boolean and
    // deliberately does NOT carry `signingKeyRef` (the reference must not cross
    // that boundary). Deriving it here from `row.signingKeyRef` alone therefore
    // reported `false` for every gateway on every route. The raw-row derivation
    // is kept as a fallback so a mapper fed a database row still answers
    // correctly, and the reference itself is still never emitted.
    signingConfigured:
      row.signingConfigured === true ||
      (typeof row.signingKeyRef === "string" && row.signingKeyRef.length > 0),
    // Included only when the caller passed a record that carries it — which is
    // exclusively the record returned by `createProfile`. List and detail
    // mappings never populate the field, so this cannot leak by default.
    ...(typeof row.ingestionId === "string" && row.ingestionId.length > 0
      ? { ingestionId: row.ingestionId }
      : {}),
    // PHASE 94B.1 — read the field the record actually carries.
    //
    // This previously read `row.lastSeenAt`, a key no `GatewayProfileRecord`
    // has: the persistence field is `lastEnvelopeAt` (ports.ts). Every route
    // therefore reported `null` for every gateway, including gateways that had
    // successfully submitted signed envelopes. The PUBLIC field name is
    // unchanged — only the source is corrected — and it stays null when no
    // envelope has ever been accepted. It is never synthesised from createdAt
    // or updatedAt: "never seen" and "seen" must remain distinguishable.
    lastSeenAt: iso(row.lastEnvelopeAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export interface OtDeviceProfileDto {
  id: string;
  siteId: string | null;
  assetId: string | null;
  category: string;
  manufacturer: string | null;
  productFamily: string | null;
  model: string | null;
  firmwareVersion: string | null;
  protocols: string[];
  lifecycle: string;
  engineeringId: string | null;
  networkZone: string;
  safetyClass: string;
  lastImportSource: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function toOtDeviceProfileDto(row: Row): OtDeviceProfileDto {
  return {
    id: str(row.id),
    siteId: nstr(row.siteId),
    assetId: nstr(row.assetId),
    category: str(row.category),
    manufacturer: nstr(row.manufacturer),
    productFamily: nstr(row.productFamily),
    model: nstr(row.model),
    firmwareVersion: nstr(row.firmwareVersion),
    protocols: list(row.protocols),
    // PHASE 94B.1 — the record's field is `lifecycleState`; the public DTO
    // field stays `lifecycle`. Reading `row.lifecycle` alone returned "" on
    // every device response, which this phase would have made visible: the new
    // `?lifecycle=` filter narrows correctly on the column, so the list would
    // have been filtered by a value the API reported as empty.
    lifecycle: str(row.lifecycleState ?? row.lifecycle),
    engineeringId: nstr(row.engineeringId),
    networkZone: str(row.networkZone),
    safetyClass: str(row.safetyClass),
    lastImportSource: nstr(row.lastImportSource),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export interface EngineeringImportDto {
  id: string;
  siteId: string | null;
  sourceType: string;
  sourceFilename: string | null;
  contentType: string;
  checksum: string;
  byteSize: number;
  status: string;
  recordCount: number;
  warningCount: number;
  errorCount: number;
  failureCategory: string | null;
  projectId: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export function toEngineeringImportDto(row: Row): EngineeringImportDto {
  return {
    id: str(row.id),
    siteId: nstr(row.siteId),
    sourceType: str(row.sourceType),
    sourceFilename: nstr(row.sourceFilename),
    contentType: str(row.contentType),
    checksum: str(row.checksum),
    byteSize: num(row.byteSize),
    status: str(row.status),
    recordCount: num(row.recordCount),
    warningCount: num(row.warningCount),
    errorCount: num(row.errorCount),
    failureCategory: nstr(row.failureCategory),
    projectId: nstr(row.projectId),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    // NOTE: idempotencyKey is deliberately absent. It is a reservation token;
    // echoing it would let one caller discover and collide with another's key.
  };
}

export interface EngineeringProjectSummaryDto {
  id: string;
  siteId: string | null;
  name: string;
  version: string | null;
  vendor: string | null;
  platform: string | null;
  sourceFormat: string;
  checksum: string;
  importState: string;
  analysisState: string;
  revision: number;
  createdAt: string | null;
}

export function toEngineeringProjectSummaryDto(row: Row): EngineeringProjectSummaryDto {
  return {
    id: str(row.id),
    siteId: nstr(row.siteId),
    name: str(row.name),
    version: nstr(row.version),
    vendor: nstr(row.vendor),
    platform: nstr(row.platform),
    sourceFormat: str(row.sourceFormat),
    checksum: str(row.checksum),
    importState: str(row.importState),
    analysisState: str(row.analysisState),
    revision: num(row.revision),
    createdAt: iso(row.createdAt),
  };
}

export interface EngineeringProjectDetailDto extends EngineeringProjectSummaryDto {
  updatedAt: string | null;
  importedById: string | null;
  counts: { devices: number; tags: number; alarms: number; networkNodes: number; findings: number };
}

export function toEngineeringProjectDetailDto(
  row: Row,
  counts: EngineeringProjectDetailDto["counts"],
): EngineeringProjectDetailDto {
  return {
    ...toEngineeringProjectSummaryDto(row),
    updatedAt: iso(row.updatedAt),
    importedById: nstr(row.importedById),
    counts,
  };
}

export interface AutomationTagDto {
  id: string;
  deviceId: string | null;
  name: string;
  normalizedName: string;
  dataType: string;
  address: string | null;
  symbolicPath: string | null;
  engineeringUnit: string | null;
  description: string | null;
  accessMode: string;
  safetyClass: string;
  validationState: string;
}

export function toAutomationTagDto(row: Row): AutomationTagDto {
  return {
    id: str(row.id),
    deviceId: nstr(row.deviceId),
    name: str(row.name),
    normalizedName: str(row.normalizedName),
    dataType: str(row.dataType),
    address: nstr(row.address),
    symbolicPath: nstr(row.symbolicPath),
    engineeringUnit: nstr(row.engineeringUnit),
    description: nstr(row.description),
    accessMode: str(row.accessMode),
    safetyClass: str(row.safetyClass),
    validationState: str(row.validationState),
  };
}

export interface AlarmDefinitionDto {
  id: string;
  deviceId: string | null;
  alarmCode: string;
  severity: string;
  message: string | null;
  conditionRef: string | null;
  requiresAcknowledgement: boolean;
  safetyClass: string;
  productionRelevant: boolean;
  validationState: string;
}

export function toAlarmDefinitionDto(row: Row): AlarmDefinitionDto {
  return {
    id: str(row.id),
    deviceId: nstr(row.deviceId),
    alarmCode: str(row.alarmCode),
    severity: str(row.severity),
    message: nstr(row.message),
    conditionRef: nstr(row.conditionRef),
    requiresAcknowledgement: bool(row.requiresAcknowledgement),
    safetyClass: str(row.safetyClass),
    productionRelevant: bool(row.productionRelevant),
    validationState: str(row.validationState),
  };
}

export interface IndustrialNetworkNodeDto {
  id: string;
  deviceId: string | null;
  nodeName: string;
  networkZone: string;
  protocol: string;
  address: string | null;
  subnet: string | null;
  stationId: string | null;
  conflictState: string;
}

export function toIndustrialNetworkNodeDto(row: Row): IndustrialNetworkNodeDto {
  return {
    id: str(row.id),
    deviceId: nstr(row.deviceId),
    nodeName: str(row.nodeName),
    networkZone: str(row.networkZone),
    protocol: str(row.protocol),
    address: nstr(row.address),
    subnet: nstr(row.subnet),
    stationId: nstr(row.stationId),
    conflictState: str(row.conflictState),
  };
}

export interface EngineeringFindingDto {
  id: string;
  projectId: string;
  ruleId: string;
  ruleVersion: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  artifactType: string;
  artifactRef: string;
  evidenceRefs: string[];
  recommendation: string | null;
  humanApprovalRequired: boolean;
  state: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string | null;
}

export function toEngineeringFindingDto(row: Row): EngineeringFindingDto {
  return {
    id: str(row.id),
    projectId: str(row.projectId),
    ruleId: str(row.ruleId),
    ruleVersion: str(row.ruleVersion),
    category: str(row.category),
    severity: str(row.severity),
    title: str(row.title),
    description: str(row.description),
    artifactType: str(row.artifactType),
    artifactRef: str(row.artifactRef),
    evidenceRefs: list(row.evidenceRefs),
    recommendation: nstr(row.recommendation),
    humanApprovalRequired: bool(row.humanApprovalRequired),
    // The persisted column is `status`; the DTO exposes it as `state` to match
    // the workflow vocabulary. Reading only `row.state` silently produced an
    // empty string for every finding.
    state: str(row.status ?? row.state),
    reviewedById: nstr(row.reviewedById),
    reviewedAt: iso(row.reviewedAt),
    reviewNote: nstr(row.reviewNote),
    createdAt: iso(row.createdAt),
  };
}

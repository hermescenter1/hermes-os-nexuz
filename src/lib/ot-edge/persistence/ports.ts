// PHASE 94B3.2 — application-owned persistence contracts.
//
// WHY PORTS AND NOT PRISMA TYPES
// If a service signature says `Promise<EdgeGatewayProfile>` (the generated
// Prisma type), then every column the schema ever gains is silently part of the
// application contract — including a future secret column. These interfaces are
// written by hand, so what crosses the boundary is a deliberate decision.
//
// Every read and mutation takes an `OtServiceContext`. There is no overload
// accepting a bare organizationId, so an adapter cannot be called with a tenant
// id lifted from a request body.

import type { OtServiceContext } from "../service-context";
import type { RepoResult } from "./core";

/* ── Shared shapes ──────────────────────────────────────────────────────── */

export interface PageRequest {
  take?: number;
  skip?: number;
  sortBy?: string;
  sortDir?: string;
}

export interface Page<T> {
  items: T[];
  /** Rows visible to THIS actor — never an organization-wide total. */
  total: number;
  take: number;
  skip: number;
}

/* ── Gateway ────────────────────────────────────────────────────────────── */

export interface GatewayProfileRecord {
  id: string;
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
  /** Presence only. The reference itself never crosses this boundary. */
  signingConfigured: boolean;
  lastEnvelopeAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * INTERNAL ONLY. The one shape carrying `signingKeyRef`, returned solely to the
 * envelope verifier so it can dereference the server-approved secret. It must
 * never reach a DTO, a route response or a log.
 */
export interface GatewaySigningConfiguration {
  gatewayId: string;
  organizationId: string;
  signingKeyRef: string | null;
  disabled: boolean;
  lifecycle: string;
  simulatorMode: boolean;
  capabilities: string[];
}

export interface CreateGatewayProfileInput {
  /** Must reference an IndustrialGateway in the actor's own organization. */
  gatewayId: string;
  environment?: string;
  capabilities?: string[];
  softwareVersion?: string | null;
  readOnlyMode?: boolean;
  simulatorMode?: boolean;
  signingKeyRef?: string | null;
}

export type UpdateGatewayProfileInput = Omit<CreateGatewayProfileInput, "gatewayId">;

export interface GatewayProfileRepository {
  listVisible(ctx: OtServiceContext, page?: PageRequest): Promise<RepoResult<Page<GatewayProfileRecord>>>;
  findVisibleById(ctx: OtServiceContext, id: string): Promise<RepoResult<GatewayProfileRecord>>;
  createProfile(ctx: OtServiceContext, input: CreateGatewayProfileInput): Promise<RepoResult<GatewayProfileRecord>>;
  updateProfile(ctx: OtServiceContext, id: string, input: UpdateGatewayProfileInput): Promise<RepoResult<GatewayProfileRecord>>;
  updateLifecycle(ctx: OtServiceContext, id: string, lifecycle: string): Promise<RepoResult<GatewayProfileRecord>>;
  /** Internal verifier path only — never a DTO source. */
  findSigningConfiguration(ctx: OtServiceContext, gatewayId: string): Promise<RepoResult<GatewaySigningConfiguration>>;
}

/* ── OT device ──────────────────────────────────────────────────────────── */

export interface OtDeviceProfileRecord {
  id: string;
  assetId: string;
  siteId: string | null;
  category: string;
  lifecycleState: string;
  networkZone: string;
  safetyClass: string;
  productFamily: string | null;
  firmwareVersion: string | null;
  engineeringId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOtDeviceProfileInput {
  /** Must reference an IndustrialAsset in the actor's own organization. */
  assetId: string;
  category?: string;
  lifecycleState?: string;
  networkZone?: string;
  safetyClass?: string;
  productFamily?: string | null;
  firmwareVersion?: string | null;
  engineeringId?: string | null;
}

export type UpdateOtDeviceProfileInput = Omit<CreateOtDeviceProfileInput, "assetId">;

export interface OtDeviceProfileRepository {
  listVisible(ctx: OtServiceContext, page?: PageRequest): Promise<RepoResult<Page<OtDeviceProfileRecord>>>;
  findVisibleById(ctx: OtServiceContext, id: string): Promise<RepoResult<OtDeviceProfileRecord>>;
  createProfile(ctx: OtServiceContext, input: CreateOtDeviceProfileInput): Promise<RepoResult<OtDeviceProfileRecord>>;
  updateProfile(ctx: OtServiceContext, id: string, input: UpdateOtDeviceProfileInput): Promise<RepoResult<OtDeviceProfileRecord>>;
}

/* ── Import ─────────────────────────────────────────────────────────────── */

export interface EngineeringImportRecord {
  id: string;
  siteId: string | null;
  sourceType: string;
  sourceFilename: string;
  contentType: string;
  checksum: string;
  byteSize: number;
  status: string;
  failureReason: string;
  deviceCount: number;
  tagCount: number;
  alarmCount: number;
  networkCount: number;
  warningCount: number;
  errorCount: number;
  startedAt: Date;
  completedAt: Date | null;
  // NOTE: idempotencyKey is intentionally absent — it is a reservation token.
}

export interface CreateImportInput {
  siteId?: string | null;
  gatewayId?: string | null;
  uploadedById?: string | null;
  sourceType: string;
  sourceFilename: string;
  contentType: string;
  checksum: string;
  idempotencyKey: string;
  byteSize: number;
}

export type ReserveOutcome =
  | { outcome: "RESERVED"; record: EngineeringImportRecord }
  /** The key was already used; the authoritative original is returned. */
  | { outcome: "DUPLICATE"; record: EngineeringImportRecord };

export type ImportCounts = Partial<
  Pick<
    EngineeringImportRecord,
    "deviceCount" | "tagCount" | "alarmCount" | "networkCount" | "warningCount" | "errorCount"
  >
>;

export interface EngineeringImportRepository {
  reserveIdempotency(ctx: OtServiceContext, input: CreateImportInput): Promise<RepoResult<ReserveOutcome>>;
  createProcessingImport(ctx: OtServiceContext, input: CreateImportInput): Promise<RepoResult<EngineeringImportRecord>>;
  findById(ctx: OtServiceContext, id: string): Promise<RepoResult<EngineeringImportRecord>>;
  findByIdempotency(ctx: OtServiceContext, key: string): Promise<RepoResult<EngineeringImportRecord>>;
  markCompleted(ctx: OtServiceContext, id: string, counts: ImportCounts): Promise<RepoResult<EngineeringImportRecord>>;
  /** `failureReason` must be a categorized enum value, never free text. */
  markFailed(ctx: OtServiceContext, id: string, failureReason: string): Promise<RepoResult<EngineeringImportRecord>>;
}

/* ── Project + artifacts ────────────────────────────────────────────────── */

export interface EngineeringProjectRecord {
  id: string;
  siteId: string | null;
  importId: string;
  name: string;
  normalizedName: string;
  projectVersion: string | null;
  revision: number;
  vendor: string | null;
  platform: string | null;
  sourceType: string;
  schemaVersion: string;
  checksum: string;
  analysisState: string;
  validationState: string;
  lastAnalysedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationTagRecord {
  id: string;
  projectId: string;
  name: string;
  normalizedName: string;
  dataType: string;
  address: string | null;
  symbolicPath: string | null;
  unit: string | null;
  description: string | null;
  accessMode: string;
  safetyClass: string;
  validationState: string;
}

export interface AlarmDefinitionRecord {
  id: string;
  projectId: string;
  code: string;
  normalizedCode: string;
  severity: string;
  message: string | null;
  conditionReference: string | null;
  requiresAck: boolean;
  safetyClass: string;
  productionRelevant: boolean;
  validationState: string;
}

export interface NetworkNodeRecord {
  id: string;
  projectId: string;
  nodeName: string;
  normalizedName: string;
  zone: string;
  protocol: string;
  address: string | null;
  subnet: string | null;
  stationId: string | null;
  conflictState: string;
}

export interface CreateProjectWithArtifactsInput {
  siteId?: string | null;
  importId: string;
  name: string;
  normalizedName: string;
  projectVersion?: string | null;
  revision?: number;
  vendor?: string | null;
  platform?: string | null;
  sourceType: string;
  schemaVersion: string;
  checksum: string;
  tags?: Array<Omit<AutomationTagRecord, "id" | "projectId">>;
  alarms?: Array<Omit<AlarmDefinitionRecord, "id" | "projectId">>;
  networkNodes?: Array<Omit<NetworkNodeRecord, "id" | "projectId">>;
}

/** The bounded projection the deterministic rule engine consumes. */
export interface AnalysisInput {
  project: Pick<
    EngineeringProjectRecord,
    "id" | "name" | "revision" | "vendor" | "platform" | "sourceType" | "checksum"
  >;
  tags: AutomationTagRecord[];
  alarms: AlarmDefinitionRecord[];
  networkNodes: NetworkNodeRecord[];
}

export interface EngineeringProjectRepository {
  listVisible(ctx: OtServiceContext, page?: PageRequest): Promise<RepoResult<Page<EngineeringProjectRecord>>>;
  findVisibleById(ctx: OtServiceContext, id: string): Promise<RepoResult<EngineeringProjectRecord>>;
  findByChecksum(ctx: OtServiceContext, checksum: string): Promise<RepoResult<EngineeringProjectRecord>>;
  createProjectWithArtifacts(ctx: OtServiceContext, input: CreateProjectWithArtifactsInput): Promise<RepoResult<EngineeringProjectRecord>>;
  listTags(ctx: OtServiceContext, projectId: string, page?: PageRequest): Promise<RepoResult<Page<AutomationTagRecord>>>;
  listAlarms(ctx: OtServiceContext, projectId: string, page?: PageRequest): Promise<RepoResult<Page<AlarmDefinitionRecord>>>;
  listNetworkNodes(ctx: OtServiceContext, projectId: string, page?: PageRequest): Promise<RepoResult<Page<NetworkNodeRecord>>>;
  loadAnalysisInput(ctx: OtServiceContext, projectId: string): Promise<RepoResult<AnalysisInput>>;
}

/* ── Findings ───────────────────────────────────────────────────────────── */

export interface EngineeringFindingRecord {
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
  recommendation: string;
  humanApprovalRequired: boolean;
  status: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DeterministicFindingInput = Omit<
  EngineeringFindingRecord,
  "id" | "projectId" | "status" | "reviewedById" | "reviewedAt" | "createdAt" | "updatedAt"
>;

export interface TransitionInput {
  /** The state the caller believes the finding is in. Guards lost updates. */
  expectedStatus: string;
  nextStatus: string;
  reviewedById: string;
  reviewedAt: Date;
}

export type TransitionOutcome =
  | { outcome: "APPLIED"; record: EngineeringFindingRecord }
  /** Already in the requested state — idempotent, no second audit event. */
  | { outcome: "NOOP"; record: EngineeringFindingRecord };

export interface EngineeringFindingRepository {
  upsertDeterministicFindings(ctx: OtServiceContext, projectId: string, findings: DeterministicFindingInput[]): Promise<RepoResult<{ created: number; updated: number }>>;
  listVisible(ctx: OtServiceContext, projectId: string, page?: PageRequest): Promise<RepoResult<Page<EngineeringFindingRecord>>>;
  findVisibleById(ctx: OtServiceContext, id: string): Promise<RepoResult<EngineeringFindingRecord>>;
  transitionAtomically(ctx: OtServiceContext, id: string, input: TransitionInput): Promise<RepoResult<TransitionOutcome>>;
  supersedeObsolete(ctx: OtServiceContext, projectId: string, keepRuleArtifactKeys: string[]): Promise<RepoResult<{ superseded: number }>>;
}

/* ── Nonce ──────────────────────────────────────────────────────────────── */

export interface GatewayNonceRepository {
  reserve(ctx: OtServiceContext, input: { gatewayId: string; nonce: string; expiresAt: Date }): Promise<RepoResult<"RESERVED" | "DUPLICATE">>;
  identifyConflict(ctx: OtServiceContext, gatewayId: string, nonce: string): Promise<RepoResult<boolean>>;
  /** Bounded: never an unqualified delete. */
  pruneExpired(ctx: OtServiceContext, before: Date, limit?: number): Promise<RepoResult<{ pruned: number }>>;
}

/* ── Transaction boundary ───────────────────────────────────────────────── */

/** The repository set handed to a transactional callback. */
export interface OtRepositories {
  gateways: GatewayProfileRepository;
  devices: OtDeviceProfileRepository;
  imports: EngineeringImportRepository;
  projects: EngineeringProjectRepository;
  findings: EngineeringFindingRepository;
  nonces: GatewayNonceRepository;
}

/**
 * Runs `fn` inside one database transaction.
 *
 * The callback receives repositories bound to the TRANSACTION client. It has no
 * access to the global client, so a write inside the callback cannot escape the
 * transaction and survive a rollback.
 */
export interface OtPersistenceTransactionManager {
  runInTransaction<T>(fn: (repos: OtRepositories) => Promise<T>): Promise<RepoResult<T>>;
}

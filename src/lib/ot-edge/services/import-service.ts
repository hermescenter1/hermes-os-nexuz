// PHASE 94B3.3 — the transactional engineering import service.
//
// TWO TRANSACTIONS, ON PURPOSE
//
// Transaction A reserves the organization-scoped idempotency key by INSERTING
// the import row. The insert IS the reservation, so under concurrency exactly
// one caller proceeds and every retry observes the authoritative original.
//
// Transaction B does all the real work — project, artifacts, findings, and the
// completion update — in ONE transaction, so a failure anywhere removes every
// row it wrote. It cannot be merged into A: A must SURVIVE B's rollback,
// otherwise a failed import would vanish and a retry would look like a first
// attempt, silently re-running work that may have partially succeeded.
//
// When B fails, A's row is updated to FAILED through a separate bounded update
// with a categorized reason. `markFailed`/`markCompleted` both guard on a
// non-terminal status, so a late success can never walk a FAILED import
// forward to APPLIED.

import { createHash } from "node:crypto";
import { authorize, type OtServiceContext } from "../service-context";
import {
  ImportEnvelopeSchema,
  IMPORT_LIMITS,
  canonicalize,
  normalizeIdentifier,
  type ImportEnvelope,
} from "../import-envelope";
import { analyzeEnvelope, summarizeFindings, RULE_VERSION, RULE_IDS } from "../analysis-rules";
import { record as recordMetric, durationMs, type MetricSink } from "../metrics";
import { toEngineeringImportDto, toEngineeringProjectSummaryDto } from "../dto";
import type {
  EngineeringImportRepository,
  EngineeringProjectRepository,
  OtPersistenceTransactionManager,
} from "../persistence/ports";
import {
  fromRepo,
  svcFail,
  svcOk,
  OT_AUDIT,
  type AuditPort,
  type ServiceResult,
} from "./core";

/** Only JSON is accepted in this release. */
export const SUPPORTED_SOURCE_FORMAT = "application/json";

/**
 * Categorized failure reasons — these are `EngineeringImportFailure` enum
 * members, not free text. A value outside the enum is rejected by the database,
 * which would leave the import stuck in its pre-failure state, so the set here
 * mirrors the schema exactly.
 */
export const IMPORT_FAILURE = {
  NONE: "NONE",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  SCHEMA_INVALID: "SCHEMA_INVALID",
  TOO_LARGE: "TOO_LARGE",
  TOO_MANY_RECORDS: "TOO_MANY_RECORDS",
  DUPLICATE_IMPORT: "DUPLICATE_IMPORT",
  CHECKSUM_MISMATCH: "CHECKSUM_MISMATCH",
  TENANT_MISMATCH: "TENANT_MISMATCH",
  PARSE_ERROR: "PARSE_ERROR",
  /** Persistence or analysis failed inside Transaction B. */
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/**
 * Test-only failure checkpoints.
 *
 * Deliberately typed as an injected function rather than read from input: a
 * caller cannot request a failure, so no request body can steer it. Production
 * callers simply never pass it.
 */
export type ImportCheckpoint =
  | "AFTER_PROJECT"
  | "AFTER_TAGS"
  | "AFTER_ALARMS"
  | "AFTER_NETWORK"
  | "AFTER_FINDINGS"
  | "BEFORE_COMPLETE"
  | "BEFORE_COMMIT";

export interface ImportRequest {
  siteId: string | null;
  idempotencyKey: string;
  sourceFilename: string;
  /** Declared content type. Anything but JSON yields UNSUPPORTED_FORMAT. */
  contentType: string;
  byteSize: number;
  /** Already-parsed, already-bounded object. Never a stream or a path. */
  manifest: unknown;
  gatewayId?: string | null;
}

export interface ImportOutcome {
  import: ReturnType<typeof toEngineeringImportDto>;
  project: ReturnType<typeof toEngineeringProjectSummaryDto> | null;
  duplicate: boolean;
  findingCount: number;
}

export interface ImportServiceDeps {
  imports: EngineeringImportRepository;
  projects: EngineeringProjectRepository;
  tx: OtPersistenceTransactionManager;
  audit: AuditPort;
  metrics: MetricSink;
  now?: () => number;
  /** TEST ONLY. Throws at the named checkpoint. */
  onCheckpoint?: (cp: ImportCheckpoint) => void;
}

export function createImportService(deps: ImportServiceDeps) {
  const now = deps.now ?? (() => Date.now());
  const hit = (cp: ImportCheckpoint) => deps.onCheckpoint?.(cp);

  return {
    async execute(ctx: OtServiceContext, req: ImportRequest): Promise<ServiceResult<ImportOutcome>> {
      const startedAt = now();

      // 1. Permission, before any work.
      const denied = authorize(ctx, "create_engineering_import");
      if (denied) return svcFail("FORBIDDEN");

      // 2. Format. CSV/XML are not enabled in this release and must not be
      //    advertised as supported; the HTTP 415 mapping is Phase 94B4's job.
      if (!req.contentType.toLowerCase().startsWith(SUPPORTED_SOURCE_FORMAT)) {
        return svcFail("UNSUPPORTED_FORMAT", "only application/json is enabled");
      }
      if (req.byteSize > IMPORT_LIMITS.maxBytes) return svcFail("PAYLOAD_TOO_LARGE");

      // 3. Site must be visible to the TRUSTED context — never asserted by the
      //    caller and never read from the manifest.
      if (req.siteId !== null) {
        const allowed = ctx.allowedSiteIds === null || ctx.allowedSiteIds.includes(req.siteId);
        if (!allowed) return svcFail("FORBIDDEN");
      } else if (ctx.allowedSiteIds !== null) {
        // A site-restricted actor may not create an org-level (siteless) import.
        return svcFail("FORBIDDEN");
      }

      // 4. Strict schema. `.strict()` throughout means an unknown key — such as
      //    an injected organizationId — is a validation failure, not silently
      //    ignored.
      const parsed = ImportEnvelopeSchema.safeParse(req.manifest);
      if (!parsed.success) {
        recordMetric(deps.metrics, "ot_import_validation_failed");
        return svcFail("VALIDATION_FAILED", "manifest does not match the canonical schema");
      }
      const env: ImportEnvelope = parsed.data;

      // 5. Record limits.
      const total =
        env.devices.length + env.tags.length + env.alarms.length + env.networkNodes.length;
      if (total > IMPORT_LIMITS.maxTotalRecords) {
        recordMetric(deps.metrics, "ot_import_validation_failed");
        return svcFail("PAYLOAD_TOO_LARGE", "manifest exceeds the record limit");
      }

      // 6. Deterministic checksum over the CANONICAL form, so two manifests
      //    that differ only in key order or array order hash identically.
      const checksum = createHash("sha256").update(canonicalize(env)).digest("hex");

      // ── Transaction A: reserve the idempotency key ──────────────────────
      const reserved = await deps.imports.reserveIdempotency(ctx, {
        siteId: req.siteId,
        gatewayId: req.gatewayId ?? null,
        uploadedById: ctx.userId,
        sourceType: env.sourceType,
        sourceFilename: req.sourceFilename,
        contentType: req.contentType,
        checksum,
        idempotencyKey: req.idempotencyKey,
        byteSize: req.byteSize,
      });
      if (!reserved.ok) return fromRepo(reserved);

      if (reserved.value.outcome === "DUPLICATE") {
        // Exactly one execution ever happens. A retry observes the original.
        recordMetric(deps.metrics, "ot_idempotency_collision", 1, { sourceType: env.sourceType });
        return svcOk({
          import: toEngineeringImportDto(reserved.value.record as never),
          project: null,
          duplicate: true,
          findingCount: 0,
        });
      }

      const importRecord = reserved.value.record;
      recordMetric(deps.metrics, "ot_import_started", 1, { sourceType: env.sourceType });
      await deps.audit.record({
        action: OT_AUDIT.IMPORT_STARTED,
        actorId: ctx.userId,
        entityType: "EngineeringImport",
        entityId: importRecord.id,
        metadata: {
          organizationId: ctx.organizationId,
          siteId: req.siteId ?? undefined,
          sourceType: env.sourceType,
        },
      });

      // ── Transaction B: project + artifacts + findings + completion ──────
      const findings = analyzeEnvelope(env, {
        readOnlyProfile: true,
        checksumAlreadySeen: false,
      });

      const work = await deps.tx.runInTransaction(async (repos) => {
        const project = await repos.projects.createProjectWithArtifacts(ctx, {
          siteId: req.siteId,
          importId: importRecord.id,
          name: env.project.name,
          normalizedName: normalizeIdentifier(env.project.name),
          projectVersion: env.project.version ?? null,
          vendor: env.project.vendor ?? null,
          platform: env.project.platform ?? null,
          sourceType: env.sourceType,
          schemaVersion: env.schemaVersion,
          checksum,
          tags: env.tags.map((t) => ({
            name: t.name,
            normalizedName: normalizeIdentifier(t.name),
            dataType: t.dataType,
            address: t.address ?? null,
            symbolicPath: t.symbolicPath ?? null,
            unit: t.unit ?? null,
            description: t.description ?? null,
            accessMode: t.accessMode,
            safetyClass: t.safetyClass,
            validationState: "VALID",
          })),
          alarms: env.alarms.map((a) => ({
            code: a.code,
            normalizedCode: normalizeIdentifier(a.code),
            severity: a.severity,
            message: a.message ?? null,
            conditionReference: a.conditionReference ?? null,
            requiresAck: a.requiresAck,
            safetyClass: a.safetyClass,
            productionRelevant: a.productionRelevant,
            validationState: "VALID",
          })),
          networkNodes: env.networkNodes.map((nn) => ({
            nodeName: nn.nodeName,
            normalizedName: normalizeIdentifier(nn.nodeName),
            zone: nn.zone,
            protocol: nn.protocol,
            address: nn.address ?? null,
            subnet: nn.subnet ?? null,
            stationId: nn.stationId ?? null,
            conflictState: "VALID",
          })),
        });
        if (!project.ok) throw new Error("project persistence failed");
        hit("AFTER_PROJECT");
        hit("AFTER_TAGS");
        hit("AFTER_ALARMS");
        hit("AFTER_NETWORK");

        const persisted = await repos.findings.upsertDeterministicFindings(
          ctx,
          project.value.id,
          findings.map((f) => ({
            ruleId: f.ruleId,
            ruleVersion: f.ruleVersion,
            category: f.category,
            severity: f.severity,
            title: f.title,
            description: f.description,
            artifactType: f.artifactType,
            artifactRef: f.artifactRef,
            evidenceRefs: f.evidenceRefs,
            recommendation: f.recommendation,
            humanApprovalRequired: f.humanApprovalRequired,
          })),
        );
        if (!persisted.ok) throw new Error("finding persistence failed");
        hit("AFTER_FINDINGS");
        hit("BEFORE_COMPLETE");

        const completed = await repos.imports.markCompleted(ctx, importRecord.id, {
          deviceCount: env.devices.length,
          tagCount: env.tags.length,
          alarmCount: env.alarms.length,
          networkCount: env.networkNodes.length,
          errorCount: findings.filter((f) => f.severity === "CRITICAL").length,
          warningCount: findings.filter((f) => f.severity === "HIGH").length,
        });
        if (!completed.ok) throw new Error("completion failed");
        hit("BEFORE_COMMIT");

        return { project: project.value, completed: completed.value };
      });

      if (!work.ok) {
        // Transaction B rolled back: no project, no artifact, no finding. Mark
        // the surviving reservation FAILED with a CATEGORY — never the raw
        // exception, which could carry manifest text.
        const marked = await deps.imports.markFailed(ctx, importRecord.id, IMPORT_FAILURE.INTERNAL_ERROR);
        recordMetric(deps.metrics, "ot_import_failed", 1, { sourceType: env.sourceType });
        if (!marked.ok) {
          // The reservation could not be moved to FAILED, so it would sit in a
          // non-terminal state forever and block every retry of this key.
          // Surface it as its own signal rather than swallowing it — silence
          // here is exactly how a stuck import becomes invisible.
          recordMetric(deps.metrics, "ot_import_failed", 1, { outcome: "error" });
        }
        await deps.audit.record({
          action: OT_AUDIT.IMPORT_FAILED,
          actorId: ctx.userId,
          entityType: "EngineeringImport",
          entityId: importRecord.id,
          metadata: {
            organizationId: ctx.organizationId,
            failureCategory: IMPORT_FAILURE.INTERNAL_ERROR,
            sourceType: env.sourceType,
          },
        });
        return svcFail("INTERNAL_FAILURE", "import could not be persisted");
      }

      const severity = summarizeFindings(findings);
      recordMetric(deps.metrics, "ot_import_completed", 1, { sourceType: env.sourceType });
      recordMetric(deps.metrics, "ot_import_duration_ms", durationMs(startedAt, now()));
      for (const [level, count] of Object.entries(severity)) {
        if (count > 0) {
          recordMetric(deps.metrics, "ot_findings_total", count, {
            severity: level as "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
          });
        }
      }

      await deps.audit.record({
        action: OT_AUDIT.IMPORT_COMPLETED,
        actorId: ctx.userId,
        entityType: "EngineeringImport",
        entityId: importRecord.id,
        metadata: {
          organizationId: ctx.organizationId,
          siteId: req.siteId ?? undefined,
          projectId: work.value.project.id,
          sourceType: env.sourceType,
          deviceCount: env.devices.length,
          tagCount: env.tags.length,
          alarmCount: env.alarms.length,
          networkCount: env.networkNodes.length,
          findingCount: findings.length,
          ruleCount: RULE_IDS.length,
          ruleVersion: RULE_VERSION,
        },
      });

      return svcOk({
        import: toEngineeringImportDto(work.value.completed as never),
        project: toEngineeringProjectSummaryDto(work.value.project as never),
        duplicate: false,
        findingCount: findings.length,
      });
    },
  };
}

export type EngineeringImportService = ReturnType<typeof createImportService>;

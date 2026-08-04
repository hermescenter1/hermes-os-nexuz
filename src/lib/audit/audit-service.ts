import { getStorageMode, type StorageMode } from "@/lib/storage/storage-mode";
import { getPrisma } from "@/lib/db/prisma";

/**
 * Audit service (Phase 12B).
 *
 * Records application-level audit events. Safe in both storage modes:
 *  - database mode: persists to the Prisma AuditLog table; degrades to the
 *    in-process buffer if the client is unavailable or a query fails.
 *  - session mode: keeps an in-process buffer so the console still shows
 *    events recorded during the running session, and reports storageMode
 *    "session" so the UI can label the data accordingly.
 *
 * recordAuditEvent never throws — auditing must not break the action it logs.
 */

/** Stable action identifiers for the 15 audited events. */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "login.success",
  LOGIN_FAILURE: "login.failure",
  CASE_CREATED: "case.created",
  CASE_UPDATED: "case.updated",
  CASE_DELETED: "case.deleted",
  CASE_MARKED_READY: "case.marked_ready",
  CASE_PUBLISHED: "case.published",
  KNOWLEDGE_CREATED: "knowledge.created",
  KNOWLEDGE_UPDATED: "knowledge.updated",
  KNOWLEDGE_DELETED: "knowledge.deleted",
  KNOWLEDGE_MARKED_READY: "knowledge.marked_ready",
  KNOWLEDGE_PUBLISHED: "knowledge.published",
  UNKNOWN_RESOLVED: "unknown.resolved",
  UNKNOWN_CONVERTED: "unknown.converted_to_case",
  UNKNOWN_TO_LIBRARY: "unknown.added_to_library",
  DOCUMENT_UPLOADED: "document.uploaded",
  DOCUMENT_UPLOAD_FAILED: "document.upload_failed",
  DOCUMENT_DELETED: "document.deleted",
  DOCUMENT_PROCESSED: "document.processed",
  DOCUMENT_PROCESS_FAILED: "document.process_failed",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** API Platform audit action identifiers (Phase 33). */
export const API_AUDIT = {
  KEY_CREATED:         "api.key.created",
  KEY_REVOKED:         "api.key.revoked",
  KEY_ROTATED:         "api.key.rotated",
  SCOPE_CHANGED:       "api.key.scope_changed",
  RATE_LIMIT_EXCEEDED: "api.rate_limit.exceeded",
} as const;

/** Security / infrastructure degradation constants (Phase 41.5). */
export const INFRA_AUDIT = {
  RATE_LIMITER_DEGRADED: "infra.rate_limiter.degraded",
} as const;

/** Analytics audit action identifiers (Phase 37). */
export const ANALYTICS_AUDIT = {
  ANALYTICS_QUERY:      "analytics.query",
  KPI_CALCULATED:       "analytics.kpi.calculated",
  HEALTH_ANALYTICS_RUN: "analytics.health.run",
  ANOMALY_DETECTED:     "analytics.anomaly.detected",
} as const;

/** Industrial Knowledge Graph audit action identifiers (Phase 41). */
export const KNOWLEDGE_GRAPH_AUDIT = {
  GRAPH_REBUILT:      "knowledge_graph.rebuilt",
  GRAPH_QUERY:        "knowledge_graph.query",
  PATH_QUERY:         "knowledge_graph.path_query",
  REASONING_QUERY:    "knowledge_graph.reasoning_query",
} as const;

/** Industrial Knowledge Engine audit action identifiers (Phase 40). */
export const KNOWLEDGE_AUDIT = {
  ARTICLE_CREATED:         "knowledge.article.created",
  ARTICLE_UPDATED:         "knowledge.article.updated",
  FAILURE_MODE_CREATED:    "knowledge.failure_mode.created",
  ROOT_CAUSE_CREATED:      "knowledge.root_cause.created",
  PROCEDURE_CREATED:       "knowledge.procedure.created",
  PROCEDURE_UPDATED:       "knowledge.procedure.updated",   // includes version diff
  ENGINEERING_CASE_CREATED: "knowledge.case.created",
  KNOWLEDGE_QUERY:          "knowledge.query",
} as const;

/** Predictive Maintenance audit action identifiers (Phase 39). */
export const PREDICTIVE_AUDIT = {
  ANALYSIS_RUN:                  "predictive.analysis.run",
  RISK_SCORE_CALCULATED:         "predictive.risk.calculated",
  RUL_ESTIMATED:                 "predictive.rul.estimated",
  MAINTENANCE_RECOMMENDATION_CREATED: "predictive.recommendation.created",
} as const;

/** Copilot audit action identifiers (Phase 38). */
export const COPILOT_AUDIT = {
  COPILOT_QUERY:                "copilot.query",
  COPILOT_INSIGHT_GENERATED:    "copilot.insight.generated",
  COPILOT_CONVERSATION_CREATED: "copilot.conversation.created",
} as const;

/** Digital Twin audit action identifiers (Phase 36). */
export const DT_AUDIT = {
  NODE_CREATED:      "digital_twin.node.created",
  NODE_UPDATED:      "digital_twin.node.updated",
  RELATION_CREATED:  "digital_twin.relation.created",
  RELATION_UPDATED:  "digital_twin.relation.updated",
  LAYOUT_UPDATED:    "digital_twin.layout.updated",
  TAG_CREATED:       "digital_twin.tag.created",
  TAG_UPDATED:       "digital_twin.tag.updated",
} as const;

/** Industrial Edge Gateway audit action identifiers (Phase 35). */
export const INDUSTRIAL_AUDIT = {
  SITE_CREATED:        "industrial.site.created",
  SITE_UPDATED:        "industrial.site.updated",
  GATEWAY_CREATED:     "industrial.gateway.created",
  GATEWAY_UPDATED:     "industrial.gateway.updated",
  GATEWAY_REVOKED:     "industrial.gateway.revoked",
  GATEWAY_HEARTBEAT:   "industrial.gateway.heartbeat",
  ASSET_CREATED:       "industrial.asset.created",
  ASSET_UPDATED:       "industrial.asset.updated",
  TELEMETRY_INGESTED:  "industrial.telemetry.ingested",
  CONNECTOR_CREATED:   "industrial.connector.created",
  CONNECTOR_UPDATED:   "industrial.connector.updated",
} as const;

/**
 * Site Isolation audit action identifiers (Phase 43).
 *
 * VOLUME RULES:
 *   SITE_ACCESS_DENIED        — always audited (every denial)
 *   SITE_MEMBERSHIP_*         — always audited (admin actions)
 *   SITE_ACCESS_GRANTED       — emitted only on UserSite creation, NOT on every access check
 *   SITE_PERMISSION_CHECK     — NOT individually audited; metered via meterIndustrialEvent
 */
export const SITE_AUDIT = {
  SITE_ACCESS_DENIED:        "site.access.denied",
  SITE_ACCESS_GRANTED:       "site.access.granted",
  SITE_PERMISSION_CHECK:     "site.permission.check",
  SITE_MEMBERSHIP_CREATED:   "site.membership.created",
  SITE_MEMBERSHIP_UPDATED:   "site.membership.updated",
  SITE_MEMBERSHIP_REMOVED:   "site.membership.removed",
} as const;

/** Production operations audit action identifiers (Phase 45). */
export const OPS_AUDIT = {
  BACKUP_SUCCESS:           "ops.backup.success",
  BACKUP_FAILED:            "ops.backup.failed",
  BACKUP_VERIFIED:          "ops.backup.verified",
  BACKUP_VERIFICATION_FAILED: "ops.backup.verification_failed",
  STARTUP_CHECK_WARNING:    "ops.startup.warning",
} as const;

/** Multi-Site Industrial Intelligence audit action identifiers (Phase 42). */
export const MULTI_SITE_AUDIT = {
  BENCHMARK_RUN:                        "multi_site.benchmark.run",
  ENTERPRISE_SUMMARY_VIEWED:            "multi_site.enterprise_summary.viewed",
  CROSS_SITE_FAILURE_PATTERN_QUERIED:   "multi_site.failure_pattern.queried",
  SITE_KPI_COMPARISON_QUERIED:          "multi_site.kpi_comparison.queried",
  SITE_RISK_RANKING_QUERIED:            "multi_site.risk_ranking.queried",
  KNOWLEDGE_COVERAGE_QUERIED:           "multi_site.knowledge_coverage.queried",
} as const;

/**
 * Compliance / privacy audit action identifiers (compliance security hotfix).
 * Metadata for these events is allow-listed to identifiers and closed-enum
 * values only — never request free text, response notes, email, IP or UA.
 */
export const COMPLIANCE_AUDIT = {
  PRIVACY_REQUEST_STATUS_CHANGED: "compliance.privacy_request.status_changed",
  // Phase 97 — Processing Inventory (Article 30 RoPA).
  PROCESSING_ACTIVITY_CREATED:    "compliance.processing_activity.created",
  PROCESSING_ACTIVITY_UPDATED:    "compliance.processing_activity.updated",
  // Phase 97 — PrivacyRequest lifecycle (platform triage assignment).
  PRIVACY_REQUEST_ASSIGNED:       "compliance.privacy_request.assigned",
  // Phase 97 — Retention governance & Legal holds.
  RETENTION_POLICY_CREATED:       "compliance.retention_policy.created",
  RETENTION_POLICY_UPDATED:       "compliance.retention_policy.updated",
  LEGAL_HOLD_CREATED:             "compliance.legal_hold.created",
  LEGAL_HOLD_UPDATED:             "compliance.legal_hold.updated",
  // Phase 97 — Legal-document lifecycle & acceptance (identifiers + closed enums
  // only; never document content, review notes, email, IP, UA or tokens).
  LEGAL_DOCUMENT_CREATED:         "compliance.legal_document.created",
  LEGAL_DOCUMENT_CONTENT_UPDATED: "compliance.legal_document.content_updated",
  LEGAL_DOCUMENT_TRANSITIONED:    "compliance.legal_document.transitioned",
  LEGAL_ACCEPTANCE_CREATED:       "compliance.legal_acceptance.created",
  LEGAL_ACCEPTANCE_WITHDRAWN:     "compliance.legal_acceptance.withdrawn",
} as const;

/** Organization management audit action identifiers (Phase 32). */
export const ORG_AUDIT = {
  ORG_CREATED:             "org.created",
  ORG_UPDATED:             "org.updated",
  MEMBER_INVITED:          "org.member.invited",
  MEMBER_ADDED:            "org.member.added",
  MEMBER_REMOVED:          "org.member.removed",
  MEMBER_ROLE_CHANGED:     "org.member.role_changed",
  MEMBER_STATUS_CHANGED:   "org.member.status_changed",
  OWNERSHIP_TRANSFERRED:   "org.ownership.transferred",
  INVITATION_ACCEPTED:     "org.invitation.accepted",
  INVITATION_REJECTED:     "org.invitation.rejected",
  INVITATION_EXPIRED:      "org.invitation.expired",
  INVITATION_RESENT:       "org.invitation.resent",
  INVITATION_REVOKED:      "org.invitation.revoked",
  DEPARTMENT_CREATED:      "org.department.created",
  DEPARTMENT_UPDATED:      "org.department.updated",
} as const;

/** Billing-specific audit action identifiers (Phase 31). */
export const BILLING_AUDIT = {
  SUBSCRIPTION_CREATED:    "billing.subscription.created",
  SUBSCRIPTION_UPGRADED:   "billing.subscription.upgraded",
  SUBSCRIPTION_DOWNGRADED: "billing.subscription.downgraded",
  SUBSCRIPTION_CANCELED:   "billing.subscription.canceled",
  SUBSCRIPTION_RENEWED:    "billing.subscription.renewed",
  INVOICE_GENERATED:       "billing.invoice.generated",
  PAYMENT_RECORDED:        "billing.payment.recorded",
  ORG_CREATED:             "billing.org.created",
  ORG_MEMBER_ADDED:        "billing.org.member_added",
  ORG_MEMBER_REMOVED:      "billing.org.member_removed",
} as const;

export interface AuditEvent {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** PHASE 90B — tenant scope + traceability (nullable; legacy rows are null). */
  organizationId: string | null;
  outcome: string | null;
  correlationId: string | null;
}

export interface AuditFilter {
  action?: string;
  entityType?: string;
  userId?: string;
  limit?: number;
  from?: string; // ISO date
  to?: string; // ISO date
}

export interface AuditInput {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  /** PHASE 90B — tenant scope of the audited action, the attempted-vs-completed
   *  outcome, and the originating request's correlation id. All are derived from
   *  the authenticated server context / request, never from a client body. */
  organizationId?: string | null;
  outcome?: string | null;
  correlationId?: string | null;
}

const now = () => new Date().toISOString();

function buffer(): AuditEvent[] {
  const g = globalThis as unknown as { __hermesAudit?: AuditEvent[] };
  g.__hermesAudit ??= [];
  return g.__hermesAudit;
}

type AuditModel = {
  create: (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
};

async function model(): Promise<AuditModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).auditLog as AuditModel) : null;
}

function rowToEvent(r: Record<string, unknown>): AuditEvent {
  return {
    id: String(r.id),
    userId: r.userId ? String(r.userId) : null,
    action: String(r.action ?? ""),
    entityType: String(r.entityType ?? ""),
    entityId: r.entityId ? String(r.entityId) : null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
    organizationId: r.organizationId ? String(r.organizationId) : null,
    outcome: r.outcome ? String(r.outcome) : null,
    correlationId: r.correlationId ? String(r.correlationId) : null,
  };
}

/** Record an audit event. Never throws. */
export async function recordAuditEvent(input: AuditInput): Promise<void> {
  const event: AuditEvent = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
    createdAt: now(),
    organizationId: input.organizationId ?? null,
    outcome: input.outcome ?? null,
    correlationId: input.correlationId ?? null,
  };

  // Always keep an in-process copy so the running session can see events.
  const buf = buffer();
  buf.unshift(event);
  if (buf.length > 500) buf.length = 500;

  // In database mode, also persist.
  if (getStorageMode() === "database") {
    try {
      const m = await model();
      if (m) {
        await m.create({
          data: {
            userId: event.userId,
            action: event.action,
            entityType: event.entityType,
            entityId: event.entityId,
            metadata: event.metadata,
            organizationId: event.organizationId,
            outcome: event.outcome,
            correlationId: event.correlationId,
          },
        });
      }
    } catch {
      /* persistence is best-effort; the in-process copy already exists */
    }
  }
}

function applyFilter(events: AuditEvent[], f: AuditFilter): AuditEvent[] {
  let out = events;
  if (f.action) out = out.filter((e) => e.action === f.action);
  if (f.entityType) out = out.filter((e) => e.entityType === f.entityType);
  if (f.userId) out = out.filter((e) => e.userId === f.userId);
  if (f.from) {
    const from = new Date(f.from).getTime();
    out = out.filter((e) => new Date(e.createdAt).getTime() >= from);
  }
  if (f.to) {
    const to = new Date(f.to).getTime();
    out = out.filter((e) => new Date(e.createdAt).getTime() <= to);
  }
  const limit = f.limit && f.limit > 0 ? f.limit : 100;
  return out.slice(0, limit);
}

/** List recent events (database when available, else session buffer). */
export async function listAuditEvents(
  limit = 100
): Promise<{ storageMode: StorageMode; events: AuditEvent[] }> {
  return filterAuditEvents({ limit });
}

/** Filtered list with storage-mode reporting. Never throws. */
export async function filterAuditEvents(
  filter: AuditFilter
): Promise<{ storageMode: StorageMode; events: AuditEvent[] }> {
  const mode = getStorageMode();

  if (mode === "database") {
    try {
      const m = await model();
      if (m) {
        const where: Record<string, unknown> = {};
        if (filter.action) where.action = filter.action;
        if (filter.entityType) where.entityType = filter.entityType;
        if (filter.userId) where.userId = filter.userId;
        if (filter.from || filter.to) {
          where.createdAt = {
            ...(filter.from ? { gte: new Date(filter.from) } : {}),
            ...(filter.to ? { lte: new Date(filter.to) } : {}),
          };
        }
        const rows = await m.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: filter.limit && filter.limit > 0 ? filter.limit : 100,
        });
        return { storageMode: "database", events: rows.map(rowToEvent) };
      }
    } catch {
      /* fall through to the in-process buffer */
    }
  }

  // Session mode (or database degraded): filter the in-process buffer.
  return { storageMode: mode, events: applyFilter(buffer(), filter) };
}

/**
 * PHASE 92 — fetch the audit rows for a single correlation id, for incident
 * timeline reconstruction. The correlationId is a server-minted, validated id
 * (see logger/correlation.ts), never free client text. Never throws.
 *
 * NOTE: `organizationId` may be supplied to scope the lookup to one tenant at
 * the query layer — the operator surface passes it so a cross-tenant id cannot
 * surface another org's rows.
 */
export async function findAuditEventsByCorrelation(
  correlationId: string,
  opts: { limit?: number; organizationId?: string | null } = {},
): Promise<{ storageMode: StorageMode; events: AuditEvent[] }> {
  const mode = getStorageMode();
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 500) : 200;

  if (mode === "database") {
    try {
      const m = await model();
      if (m) {
        const where: Record<string, unknown> = { correlationId };
        if (opts.organizationId) where.organizationId = opts.organizationId;
        const rows = await m.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: limit,
        });
        return { storageMode: "database", events: rows.map(rowToEvent) };
      }
    } catch {
      /* fall through to the in-process buffer */
    }
  }

  const events = buffer()
    .filter((e) => e.correlationId === correlationId)
    .filter((e) => !opts.organizationId || e.organizationId === opts.organizationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, limit);
  return { storageMode: mode, events };
}

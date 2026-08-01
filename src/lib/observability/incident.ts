/**
 * PHASE 92 — incident timeline reconstruction.
 *
 * Given a single correlation id, assemble the ORDERED story of what the platform
 * observed for that request/incident across three planes:
 *
 *   - security events (the in-process ring)
 *   - audit rows (durable, queried by correlationId)
 *   - error fingerprints that referenced the correlation id
 *
 * An operator can then answer "what actually happened for req-abc123" — the
 * auth decision, the dependency degradation, the security event, the audit
 * record — in time order, WITHOUT ever reading a protected payload.
 *
 * SAFETY:
 *   - The correlation id is validated (isSafeRequestId) before it touches a
 *     query or a log line — a hostile value is rejected outright.
 *   - Tenant scoping: an `organizationId` may be passed so the audit lookup is
 *     constrained to one tenant at the query layer (the operator surface passes
 *     the acting admin's org for non-super operators).
 *   - Only safe fields are projected. Audit `metadata` is NEVER included — it
 *     can carry action payloads — only action/entityType/opaque entityId/
 *     outcome/identity.
 *   - Deterministic ordering with a stable tie-break, so equal timestamps and
 *     out-of-order arrivals still produce one canonical timeline.
 *   - Bounded output.
 */

import { isSafeRequestId } from "@/lib/logger/correlation";
import { findAuditEventsByCorrelation } from "@/lib/audit/audit-service";
import { getSecurityEvents } from "./security-monitor";
import { getErrorFingerprints } from "./errors";
import { type Severity } from "./log-schema";

export type IncidentSource = "security" | "audit" | "error";

export interface IncidentEntry {
  ts: string;
  source: IncidentSource;
  /** Event name / audit action / error class. */
  label: string;
  severity?: Severity;
  outcome?: string;
  operation?: string;
  reason?: string;
  userId?: string;
  organizationId?: string;
  /** Opaque, caller-supplied or entity id — never resolved content. */
  entityId?: string;
  entityType?: string;
}

export interface IncidentTimeline {
  correlationId: string;
  valid: boolean;
  entries: IncidentEntry[];
  counts: { security: number; audit: number; error: number };
  window: { from: string | null; to: string | null };
  truncated: boolean;
}

const MAX_ENTRIES = 500;
const SOURCE_ORDER: Record<IncidentSource, number> = { security: 0, audit: 1, error: 2 };

function emptyTimeline(correlationId: string, valid: boolean): IncidentTimeline {
  return {
    correlationId,
    valid,
    entries: [],
    counts: { security: 0, audit: 0, error: 0 },
    window: { from: null, to: null },
    truncated: false,
  };
}

/**
 * Reconstruct the ordered incident timeline for `correlationId`. Never throws.
 */
export async function reconstructIncident(
  correlationId: string,
  opts: { organizationId?: string | null; limit?: number } = {},
): Promise<IncidentTimeline> {
  if (!correlationId || !isSafeRequestId(correlationId)) {
    return emptyTimeline(correlationId, false);
  }

  try {
    const org = opts.organizationId ?? undefined;
    // Security ring is filtered by correlationId; when a tenant scope is given
    // (the future least-privilege operator role), also constrain ring events to
    // that org so the timeline can never surface another tenant's event even if
    // a correlation id were ever reused. Global operators pass no org → see all.
    const security = getSecurityEvents({ correlationId }).filter((s) => !org || s.orgId === org);
    const audit = await findAuditEventsByCorrelation(correlationId, {
      organizationId: org,
      limit: MAX_ENTRIES,
    });
    const errors = getErrorFingerprints(true).filter((e) => e.correlationIds.includes(correlationId));

    const entries: IncidentEntry[] = [];

    for (const s of security) {
      entries.push({
        ts: s.ts,
        source: "security",
        label: s.event,
        severity: s.severity,
        outcome: s.outcome,
        operation: s.operation,
        reason: s.reason,
        userId: s.userId,
        organizationId: s.orgId,
        entityId: s.resourceId,
        entityType: s.resourceType,
      });
    }

    for (const a of audit.events) {
      entries.push({
        ts: a.createdAt,
        source: "audit",
        label: a.action,
        outcome: a.outcome ?? undefined,
        userId: a.userId ?? undefined,
        organizationId: a.organizationId ?? undefined,
        entityId: a.entityId ?? undefined,
        entityType: a.entityType,
        // metadata deliberately omitted (may contain payload)
      });
    }

    for (const e of errors) {
      entries.push({
        ts: e.lastSeen,
        source: "error",
        label: e.errorClass,
        severity: e.severity,
        operation: e.operation,
        reason: e.sampleMessage,
      });
    }

    // Deterministic ordering: by time, then a stable source/label tie-break so
    // equal timestamps and out-of-order arrivals yield one canonical sequence.
    entries.sort((a, b) => {
      const ta = Date.parse(a.ts);
      const tb = Date.parse(b.ts);
      if (ta !== tb) return ta - tb;
      if (SOURCE_ORDER[a.source] !== SOURCE_ORDER[b.source]) {
        return SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
      }
      return a.label.localeCompare(b.label);
    });

    const truncated = entries.length > MAX_ENTRIES;
    const bounded = entries.slice(0, MAX_ENTRIES);

    return {
      correlationId,
      valid: true,
      entries: bounded,
      counts: { security: security.length, audit: audit.events.length, error: errors.length },
      window: {
        from: bounded.length ? bounded[0].ts : null,
        to: bounded.length ? bounded[bounded.length - 1].ts : null,
      },
      truncated,
    };
  } catch {
    return emptyTimeline(correlationId, true);
  }
}

/**
 * GET /api/admin/observability — operator control-plane snapshot (Phase 92).
 *
 * A single authenticated, admin-only surface that assembles the SRE picture:
 *   - dependency + rate-limiter health
 *   - active operational alerts
 *   - a security-event summary (counts by event + recent, redacted)
 *   - error fingerprints
 *   - recent audit events (bounded)
 *   - the metrics snapshot
 *   - on `?correlationId=…`, the reconstructed incident timeline
 *
 * AUTHZ: admin role, mirroring the existing /api/admin/system and
 * /api/admin/audit endpoints. This inherits their admin-only audit visibility
 * model; the incident lookup additionally accepts an org scope internally
 * (reconstructIncident) for a future least-privilege operator role.
 *
 * DISCLOSURE: every field returned here is already redacted at its source (the
 * security ring keeps safe fields only; the incident timeline omits audit
 * metadata; error samples are scrubbed). No secret, connection string or
 * protected payload is assembled here.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { resolveRequestId, isSafeRequestId } from "@/lib/logger/correlation";
import { getActiveAlerts } from "@/lib/observability/alerts";
import { getSecurityEvents } from "@/lib/observability/security-monitor";
import { getErrorFingerprints } from "@/lib/observability/errors";
import { snapshotMetrics } from "@/lib/observability/metrics";
import { reconstructIncident } from "@/lib/observability/incident";
import { filterAuditEvents } from "@/lib/audit/audit-service";
import { isRateLimiterDegraded } from "@/lib/api/rate-limit";
import { isAuthLimiterDegraded } from "@/lib/auth/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIT = 50;
const MAX_SECURITY = 100;

function boundedInt(raw: string | null, def: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

/** Count security events by event name for a compact summary. */
function summarizeSecurity(events: { event: string; severity: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.event] = (counts[e.event] ?? 0) + 1;
  return counts;
}

export async function GET(req: NextRequest) {
  const reqId = resolveRequestId(req);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "X-Request-ID": reqId } });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "X-Request-ID": reqId } });

  const url = req.nextUrl;
  const auditLimit = boundedInt(url.searchParams.get("auditLimit"), 25, MAX_AUDIT);
  const securityLimit = boundedInt(url.searchParams.get("securityLimit"), 50, MAX_SECURITY);
  const correlationId = url.searchParams.get("correlationId");

  const security = getSecurityEvents({ limit: securityLimit });
  const audit = await filterAuditEvents({ limit: auditLimit });

  // Optional incident timeline lookup. A malformed id is reported, not queried.
  let incident = null;
  if (correlationId) {
    incident = isSafeRequestId(correlationId)
      ? await reconstructIncident(correlationId)
      : { correlationId, valid: false, entries: [], counts: { security: 0, audit: 0, error: 0 }, window: { from: null, to: null }, truncated: false };
  }

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      health: {
        rateLimiter: { apiDegraded: isRateLimiterDegraded(), authDegraded: isAuthLimiterDegraded() },
      },
      alerts: getActiveAlerts(),
      security: {
        summary: summarizeSecurity(security),
        recent: security,
      },
      errors: getErrorFingerprints(),
      audit: { storageMode: audit.storageMode, events: audit.events },
      metrics: snapshotMetrics(),
      incident,
    },
    { headers: { "X-Request-ID": reqId, "Cache-Control": "no-store" } },
  );
}

/**
 * PHASE 93 — operator Control-Room model assembler (server-only).
 *
 * A single read-only assembler that gathers the SRE picture from the SAME real
 * sources the existing Phase 92 surfaces use — the observability getters plus a
 * live PostgreSQL / Redis probe and the on-disk backup state. It creates NO new
 * observability system, changes NO backend behaviour, and fabricates NO data:
 * every field is either a live measurement, an existing in-process counter, or an
 * explicit "not measured" descriptor. HTTP request-rate and request-latency are
 * deliberately reported as NOT_INSTRUMENTED (there is no recording call-site and
 * no durable time-series store) — never as a misleading zero.
 *
 * DISCLOSURE: identical to /api/admin/observability — every value is redacted at
 * its source (security ring keeps safe fields, error samples scrubbed, incident
 * omits audit metadata). No secret, connection string or tenant payload is
 * assembled here. Consumed only by the admin-gated server page.
 */

import { getActiveAlerts } from "@/lib/observability/alerts";
import { getSecurityEvents } from "@/lib/observability/security-monitor";
import { getErrorFingerprints } from "@/lib/observability/errors";
import { snapshotMetrics } from "@/lib/observability/metrics";
import { reconstructIncident, type IncidentTimeline } from "@/lib/observability/incident";
import { filterAuditEvents } from "@/lib/audit/audit-service";
import { isSafeRequestId } from "@/lib/logger/correlation";
import { isRateLimiterDegraded } from "@/lib/api/rate-limit";
import { isAuthLimiterDegraded } from "@/lib/auth/rate-limiter";
import { getStartupResults } from "@/lib/startup/validate";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import { getRedis } from "@/lib/redis/client";
import {
  readSecretBackendReadiness,
  type SecretBackendHealthReason,
  type SecretBackendHealthStatus,
} from "@/lib/ot-edge/secret-backend-health";

/** A live dependency probe result. `up === null` = not probed / not configured. */
export interface DependencyProbe {
  key: "database" | "redis" | "application";
  up: boolean | null;
  latencyMs: number | null;
  /** What the probe did, e.g. "SELECT 1", "PING", "self". */
  detail: string;
  /** Machine reason when up === null (e.g. "not_configured"). */
  note?: string;
  observedAt: string;
  source: string;
}

export interface LimiterProbe {
  key: "api" | "auth";
  degraded: boolean;
  observedAt: string;
  source: string;
}

export interface BackupState {
  present: boolean;
  lastBackupAt: string | null;
  ageHours: number | null;
  sizeBytes: number | null;
  fileName: string | null;
  verified: boolean | null;
  verifiedAt: string | null;
  observedAt: string;
  source: string;
}

export interface NotInstrumented {
  key: "httpRequestRate" | "httpRequestLatency";
  /** The metric name that WOULD carry this, once instrumented. */
  metric: string;
  /** The durable source the operator must configure. */
  source: string;
  observedAt: string;
}

/**
 * PHASE 95 — the OT machine-credential secret backend (OpenBao) readiness panel.
 *
 * CONFIGURATION-derived and network-free: `disabled` when the backend is off,
 * `configured_not_checked` when fully configured (NEVER `healthy` here — the
 * console runs no live probe, so it must not claim health it hasn't observed),
 * `degraded` when enabled but incompletely configured. The reachable/authenticated
 * states come only from real credential operations elsewhere.
 */
export interface SecretBackendPanel {
  status: SecretBackendHealthStatus;
  reason: SecretBackendHealthReason;
  /** True only when a real OpenBao call informed this status (never here). */
  checked: boolean;
  observedAt: string;
  source: string;
}

export interface OperatorConsole {
  generatedAt: string;
  dependencies: DependencyProbe[];
  limiters: LimiterProbe[];
  backup: BackupState;
  startup: ReturnType<typeof getStartupResults>;
  process: { nodeEnv: string; uptimeSeconds: number; memoryMb: { rss: number; heapUsed: number; heapTotal: number } };
  alerts: ReturnType<typeof getActiveAlerts>;
  security: {
    summary: Record<string, number>;
    recent: ReturnType<typeof getSecurityEvents>;
  };
  errors: ReturnType<typeof getErrorFingerprints>;
  audit: Awaited<ReturnType<typeof filterAuditEvents>>;
  metrics: Record<string, unknown>;
  incident: IncidentTimeline | null;
  notInstrumented: NotInstrumented[];
  /** PHASE 95 — OT secret-backend (OpenBao) readiness; network-free. */
  secretBackend: SecretBackendPanel;
  /** True when the audit/security assembly failed and the panel should error-state. */
  degraded: { audit: boolean };
}

async function probeDatabase(now: string): Promise<DependencyProbe> {
  const base = { key: "database" as const, detail: "SELECT 1", observedAt: now, source: "live probe" };
  try {
    const prisma = await getPrisma();
    if (!prisma) return { ...base, up: null, latencyMs: null, note: "not_configured" };
    const t0 = Date.now();
    await (prisma as unknown as { $queryRawUnsafe: (q: string) => Promise<unknown> }).$queryRawUnsafe("SELECT 1");
    return { ...base, up: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ...base, up: false, latencyMs: null };
  }
}

async function probeRedis(now: string): Promise<DependencyProbe> {
  const base = { key: "redis" as const, detail: "PING", observedAt: now, source: "live probe" };
  // Distinguish "not configured" (no REDIS_URL — the platform runs on the
  // in-process fallback by design) from "configured but unreachable".
  if (!process.env.REDIS_URL) return { ...base, up: null, latencyMs: null, note: "not_configured" };
  try {
    const redis = await getRedis();
    if (!redis) return { ...base, up: false, latencyMs: null, note: "unreachable" };
    const t0 = Date.now();
    await redis.ping();
    return { ...base, up: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ...base, up: false, latencyMs: null, note: "unreachable" };
  }
}

async function probeBackup(now: string): Promise<BackupState> {
  const empty: BackupState = {
    present: false, lastBackupAt: null, ageHours: null, sizeBytes: null,
    fileName: null, verified: null, verifiedAt: null, observedAt: now, source: "BACKUP_DIR",
  };
  const backupDir = process.env.BACKUP_DIR ?? "/backups/postgres";
  try {
    const fs = await import("fs/promises");
    const files = await fs.readdir(backupDir);
    const dumps = files.filter((f) => f.endsWith(".dump"));
    if (dumps.length === 0) return empty;

    const stats = await Promise.all(
      dumps.map(async (f) => {
        const st = await fs.stat(`${backupDir}/${f}`);
        return { name: f, mtime: st.mtime, size: st.size };
      }),
    );
    stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const latest = stats[0];
    const ageHours = Math.round(((Date.now() - latest.mtime.getTime()) / 3_600_000) * 10) / 10;

    let verified: boolean | null = null;
    let verifiedAt: string | null = null;
    try {
      const raw = await fs.readFile(`${backupDir}/.last-verification.json`, "utf8");
      const v = JSON.parse(raw) as { status?: string; timestamp?: string };
      verified = v.status === "verified";
      verifiedAt = v.timestamp ?? null;
    } catch {
      /* verification file absent — verification has not run */
    }

    return {
      present: true,
      lastBackupAt: latest.mtime.toISOString(),
      ageHours,
      sizeBytes: latest.size,
      fileName: latest.name,
      verified,
      verifiedAt,
      observedAt: now,
      source: "BACKUP_DIR",
    };
  } catch {
    return empty; // BACKUP_DIR absent/unreadable — reported as "no backup found"
  }
}

function summarizeSecurity(events: { event: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.event] = (counts[e.event] ?? 0) + 1;
  return counts;
}

/**
 * Assemble the full Control-Room model from real sources. Never throws: each
 * risky probe/getter is isolated so one failing source degrades its own panel
 * rather than the whole page.
 */
/**
 * PHASE 95 — the OT secret-backend readiness panel. Network-free (reads
 * configuration only) and isolated: any unexpected failure degrades ONLY this
 * panel to a truthful `degraded/provider`, never the whole console.
 */
function probeSecretBackend(now: string): SecretBackendPanel {
  const base = { observedAt: now, source: "configuration" as const };
  try {
    const health = readSecretBackendReadiness();
    return { ...health, ...base };
  } catch {
    return { status: "degraded", reason: "provider", checked: false, ...base };
  }
}

export async function assembleOperatorConsole(
  opts: { correlationId?: string | null; auditLimit?: number; securityLimit?: number } = {},
): Promise<OperatorConsole> {
  const now = new Date().toISOString();
  const auditLimit = opts.auditLimit ?? 25;
  const securityLimit = opts.securityLimit ?? 50;

  const [database, redis, backup] = await Promise.all([
    probeDatabase(now),
    probeRedis(now),
    probeBackup(now),
  ]);

  const application: DependencyProbe = {
    key: "application", up: true, latencyMs: null, detail: "self",
    observedAt: now, source: "runtime",
  };

  const security = getSecurityEvents({ limit: securityLimit });

  let audit: Awaited<ReturnType<typeof filterAuditEvents>>;
  let auditDegraded = false;
  try {
    audit = await filterAuditEvents({ limit: auditLimit });
  } catch {
    // The panel shows an error-state via `degraded.audit`; storageMode stays a
    // valid value (the configured mode) — we never invent a fake status string.
    auditDegraded = true;
    audit = { storageMode: getStorageMode(), events: [] };
  }

  let incident: IncidentTimeline | null = null;
  const cid = opts.correlationId;
  if (cid) {
    incident = isSafeRequestId(cid)
      ? await reconstructIncident(cid)
      : { correlationId: cid, valid: false, entries: [], counts: { security: 0, audit: 0, error: 0 }, window: { from: null, to: null }, truncated: false };
  }

  const mem = process.memoryUsage();

  return {
    generatedAt: now,
    dependencies: [application, database, redis],
    limiters: [
      { key: "api", degraded: isRateLimiterDegraded(), observedAt: now, source: "in-process flag" },
      { key: "auth", degraded: isAuthLimiterDegraded(), observedAt: now, source: "in-process flag" },
    ],
    backup,
    startup: getStartupResults(),
    process: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: {
        rss: Math.round(mem.rss / 1_048_576),
        heapUsed: Math.round(mem.heapUsed / 1_048_576),
        heapTotal: Math.round(mem.heapTotal / 1_048_576),
      },
    },
    alerts: getActiveAlerts(),
    security: { summary: summarizeSecurity(security), recent: security },
    errors: getErrorFingerprints(),
    audit,
    metrics: snapshotMetrics(),
    incident,
    notInstrumented: [
      { key: "httpRequestRate", metric: "http_requests_total", source: "prometheus", observedAt: now },
      { key: "httpRequestLatency", metric: "http_request_duration_ms", source: "prometheus", observedAt: now },
    ],
    secretBackend: probeSecretBackend(now),
    degraded: { audit: auditDegraded },
  };
}

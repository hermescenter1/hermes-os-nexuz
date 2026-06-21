/**
 * GET /api/admin/system — Authenticated readiness endpoint (Phase 45).
 *
 * Returns the full operational state of the Hermes OS instance.
 * Requires: valid JWT or session + admin role.
 *
 * Response includes:
 *   - 8-control readiness score (100 points)
 *   - Live DB, Redis, rate-limiter, backup, and security header checks
 *   - Startup validation matrix results
 *   - Process uptime and memory snapshot
 *   - Email provider status (informational only — not scored)
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }            from "@/lib/auth/roles";
import { getPrisma }      from "@/lib/db/prisma";
import { getRedis }       from "@/lib/redis/client";
import { isRateLimiterDegraded }     from "@/lib/api/rate-limit";
import { isAuthLimiterDegraded }     from "@/lib/auth/rate-limiter";
import { getStartupResults }         from "@/lib/startup/validate";
import { jwtSecret }                 from "@/lib/auth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSECURE_JWT = "hermes-dev-jwt-insecure-not-for-production";

// ── Probes ────────────────────────────────────────────────────────────────────

async function probeDatabase(): Promise<{ ok: boolean; latencyMs?: number }> {
  try {
    const prisma = await getPrisma();
    if (!prisma) return { ok: false };
    const t0 = Date.now();
    await (prisma as unknown as { $queryRawUnsafe: (q: string) => Promise<unknown> })
      .$queryRawUnsafe("SELECT 1");
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false };
  }
}

async function probeRedis(): Promise<{ ok: boolean; latencyMs?: number }> {
  try {
    const redis = await getRedis();
    if (!redis) return { ok: false };
    const t0 = Date.now();
    await redis.ping();
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false };
  }
}

async function probeSecurityHeaders(): Promise<{
  ok: boolean;
  found: string[];
  note?: string;
}> {
  try {
    const port = process.env.PORT ?? "3000";
    const res  = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
      cache:  "no-store",
    });
    const found: string[] = [];
    if (res.headers.get("x-content-type-options") === "nosniff") found.push("X-Content-Type-Options");
    if (res.headers.has("x-frame-options"))  found.push("X-Frame-Options");
    if (res.headers.has("referrer-policy"))  found.push("Referrer-Policy");
    if (res.headers.has("permissions-policy")) found.push("Permissions-Policy");
    return { ok: found.length >= 2, found };
  } catch (e) {
    return { ok: false, found: [], note: `probe failed: ${String(e).slice(0, 80)}` };
  }
}

type BackupState = {
  lastBackupAt:  string | null;
  ageHours:      number | null;
  sizeBytes:     number | null;
  fileName:      string | null;
  verified:      boolean | null;
  verifiedAt:    string | null;
};

async function probeBackup(): Promise<BackupState> {
  const backupDir = process.env.BACKUP_DIR ?? "/backups/postgres";
  try {
    const fs    = await import("fs/promises");
    const files = await fs.readdir(backupDir);
    const dumps = files.filter((f) => f.endsWith(".dump"));

    if (dumps.length === 0) {
      return { lastBackupAt: null, ageHours: null, sizeBytes: null, fileName: null, verified: null, verifiedAt: null };
    }

    const stats = await Promise.all(
      dumps.map(async (f) => {
        const st = await fs.stat(`${backupDir}/${f}`);
        return { name: f, mtime: st.mtime, size: st.size };
      }),
    );
    stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const latest  = stats[0];
    const ageMs   = Date.now() - latest.mtime.getTime();
    const ageHours = Math.round((ageMs / 3_600_000) * 10) / 10;

    // Read last verification result written by verify-backup.sh
    let verified: boolean | null = null;
    let verifiedAt: string | null = null;
    try {
      const raw = await fs.readFile(`${backupDir}/.last-verification.json`, "utf8");
      const v   = JSON.parse(raw) as { status?: string; timestamp?: string };
      verified   = v.status === "verified";
      verifiedAt = v.timestamp ?? null;
    } catch {
      // Verification file absent — verification has not run
    }

    return {
      lastBackupAt: latest.mtime.toISOString(),
      ageHours,
      sizeBytes:    latest.size,
      fileName:     latest.name,
      verified,
      verifiedAt,
    };
  } catch {
    return { lastBackupAt: null, ageHours: null, sizeBytes: null, fileName: null, verified: null, verifiedAt: null };
  }
}

// ── Readiness score ───────────────────────────────────────────────────────────

interface Control {
  id:      string;
  label:   string;
  weight:  number;
  passing: boolean;
  note?:   string;
}

function buildScore(
  db:            { ok: boolean },
  redis:         { ok: boolean },
  headers:       { ok: boolean },
  backup:        BackupState,
  apiLimiterOk:  boolean,
  authLimiterOk: boolean,
): { score: number; maxScore: number; controls: Control[] } {
  const secret = jwtSecret();
  const jwtOk  = secret !== INSECURE_JWT && secret.length >= 32;
  const httpsOk = (process.env.APP_URL ?? "").startsWith("https://") ||
                  process.env.NODE_ENV !== "production";

  const controls: Control[] = [
    {
      id:      "db_reachable",
      label:   "Database reachable",
      weight:  20,
      passing: db.ok,
      note:    db.ok ? undefined : "SELECT 1 probe failed",
    },
    {
      id:      "jwt_secret_strength",
      label:   "JWT secret strength",
      weight:  20,
      passing: jwtOk,
      note:    jwtOk ? undefined : "Secret is default or too short (< 32 chars)",
    },
    {
      id:      "http_security_headers",
      label:   "HTTP security headers",
      weight:  15,
      passing: headers.ok,
      note:    headers.ok ? undefined : "Missing X-Content-Type-Options and/or X-Frame-Options",
    },
    {
      id:      "redis_reachable",
      label:   "Redis reachable",
      weight:  10,
      passing: redis.ok,
      note:    redis.ok ? undefined : "Redis ping failed or REDIS_URL absent",
    },
    {
      id:      "auth_rate_limiter_redis",
      label:   "Auth rate-limiter Redis-backed",
      weight:  10,
      passing: authLimiterOk,
      note:    authLimiterOk ? undefined : "Auth limiter using in-process fallback",
    },
    {
      id:      "backup_within_24h",
      label:   "Backup completed within 24 h",
      weight:  10,
      passing: backup.ageHours !== null && backup.ageHours <= 24,
      note:    backup.ageHours !== null ? `Last backup ${backup.ageHours} h ago` : "No backup found",
    },
    {
      id:      "backup_integrity_verified",
      label:   "Backup integrity verified",
      weight:  10,
      passing: backup.verified === true,
      note:    backup.verified === null ? "No verification record" : backup.verified ? undefined : "Verification failed",
    },
    {
      id:      "https_configured",
      label:   "HTTPS configured",
      weight:  5,
      passing: httpsOk,
      note:    httpsOk ? undefined : "APP_URL does not start with https://",
    },
  ];

  const maxScore = controls.reduce((s, c) => s + c.weight, 0); // 100
  const score    = controls.filter((c) => c.passing).reduce((s, c) => s + c.weight, 0);

  void apiLimiterOk; // included in rate-limiter note for context

  return { score, maxScore, controls };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!can(user.role, "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [db, redis, headers, backup] = await Promise.all([
    probeDatabase(),
    probeRedis(),
    probeSecurityHeaders(),
    probeBackup(),
  ]);

  const apiLimiterOk  = !isRateLimiterDegraded();
  const authLimiterOk = !isAuthLimiterDegraded();

  const { score, maxScore, controls } = buildScore(
    db, redis, headers, backup, apiLimiterOk, authLimiterOk,
  );

  const startup = getStartupResults();
  const mem     = process.memoryUsage();

  return NextResponse.json({
    readiness: {
      score,
      maxScore,
      grade:    score >= 90 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "F",
      controls,
    },
    services: {
      database:   { ...db,     status: db.ok    ? "ok" : "degraded" },
      redis:      { ...redis,  status: redis.ok ? "ok" : "degraded" },
      apiRateLimiter:  { status: apiLimiterOk  ? "redis-backed" : "in-process-fallback" },
      authRateLimiter: { status: authLimiterOk ? "redis-backed" : "in-process-fallback" },
    },
    security: {
      headers:   headers,
      jwtSecret: {
        configured: jwtSecret() !== INSECURE_JWT,
        sufficient: jwtSecret().length >= 32,
      },
      https: {
        configured: (process.env.APP_URL ?? "").startsWith("https://"),
        appUrl:     process.env.APP_URL ?? "(not set)",
      },
    },
    backup,
    email: {
      provider: process.env.EMAIL_PROVIDER ?? "console",
      note:     "Not scored — email may be intentionally disabled",
    },
    startup: {
      ran:        startup.ran,
      fatalCount: startup.fatalCount,
      checks:     startup.results,
    },
    process: {
      nodeEnv:     process.env.NODE_ENV ?? "unknown",
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: {
        rss:      Math.round(mem.rss / 1_048_576),
        heapUsed: Math.round(mem.heapUsed / 1_048_576),
        heapTotal: Math.round(mem.heapTotal / 1_048_576),
      },
    },
    timestamp: new Date().toISOString(),
  });
}

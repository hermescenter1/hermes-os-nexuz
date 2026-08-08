/**
 * Hermes OS — Phase 98 Redis persistence & recovery policy.
 *
 * Encodes the authoritative Redis keyspace inventory (from the Phase 98 discovery
 * sweep of src/) as testable data, and derives the DR decision from it. Redis is
 * used ONLY for TTL'd rate-limit counters (with an in-process fallback) plus
 * stateless liveness probes and a graceful shutdown quit(). No authoritative state
 * (sessions, tenant authority, billing entitlement, compliance evidence, recovery
 * tokens, API-key state) lives in Redis — sessions are the Postgres AuthSession
 * row. Therefore the decision is REBUILD_FROM_AUTHORITATIVE_STATE and Redis is NOT
 * part of the RPO. AOF remains enabled in compose only for ordinary node/container
 * resilience, not as a recovery source.
 *
 * classification enum: CACHE | RATE_LIMIT | EPHEMERAL_SESSION_ACCELERATOR |
 *                      JOB_COORDINATION | AUTHORITATIVE_STATE | UNKNOWN
 * UNKNOWN or AUTHORITATIVE_STATE among data-bearing sites forces a STOP.
 */

export const REDIS_PERSISTENCE_DECISION = "REBUILD_FROM_AUTHORITATIVE_STATE";

/** Data-bearing Redis use sites (things that WRITE application data). */
export const REDIS_DATA_SITES = [
  {
    site: "src/lib/auth/rate-limiter.ts",
    keyNamespace: "rl:auth:{action}:{identifier}:{windowId}",
    stores: "fixed-window auth/public request counters",
    ttl: true,
    durableSourceOfTruth: false,
    reconstructable: true,
    lossFailMode: "degrades to in-process sliding-window per instance (fail-safe; still limits)",
    classification: "RATE_LIMIT",
  },
  {
    site: "src/lib/api/rate-limit.ts",
    keyNamespace: "rl:{orgId}:m:{minute} | rl:{orgId}:d:{YYYY-MM-DD}",
    stores: "per-org API-key request counters (minute + day)",
    ttl: true,
    durableSourceOfTruth: false,
    reconstructable: true,
    lossFailMode: "degrades to in-process counters per instance; plan limits come from Postgres",
    classification: "RATE_LIMIT",
  },
];

/** Non-data Redis touch points (no application data written). */
export const REDIS_NONDATA_SITES = [
  { site: "src/lib/observability/operator-console.ts", use: "PING liveness probe", classification: "HEALTH_PROBE" },
  { site: "src/app/api/admin/system/route.ts", use: "PING liveness probe", classification: "HEALTH_PROBE" },
  { site: "src/instrumentation.node.ts", use: "quit() on SIGTERM/SIGINT", classification: "LIFECYCLE" },
];

/** Authoritative durable stores that some might WRONGLY assume live in Redis. */
export const AUTHORITATIVE_ELSEWHERE = [
  { concern: "sessions", authoritativeStore: "PostgreSQL AuthSession (schema.prisma)" },
  { concern: "tenant authority / RBAC", authoritativeStore: "PostgreSQL (Organization/Membership)" },
  { concern: "billing entitlement", authoritativeStore: "PostgreSQL (subscription/plan)" },
  { concern: "compliance evidence", authoritativeStore: "PostgreSQL (evidence pack manifestJson)" },
  { concern: "password reset / recovery tokens", authoritativeStore: "PostgreSQL" },
];

/**
 * Classify a data-site inventory and derive/validate the persistence decision.
 * @param {typeof REDIS_DATA_SITES} sites
 * @returns {{ hasAuthoritativeOnly: boolean, unknownCount: number, decision: string, ok: boolean }}
 */
export function classifyRedisInventory(sites = REDIS_DATA_SITES) {
  const unknownCount = sites.filter((s) => s.classification === "UNKNOWN").length;
  const hasAuthoritativeOnly = sites.some(
    (s) => s.classification === "AUTHORITATIVE_STATE" || (s.durableSourceOfTruth === true && !s.reconstructable),
  );
  const decision =
    hasAuthoritativeOnly || unknownCount > 0 ? "RECOVER_FROM_AOF_BACKUP" : "REBUILD_FROM_AUTHORITATIVE_STATE";
  // ok means: the derived decision matches the declared one AND there is nothing
  // that would force a STOP (no unknown, no authoritative-only).
  const ok = !hasAuthoritativeOnly && unknownCount === 0 && decision === REDIS_PERSISTENCE_DECISION;
  return { hasAuthoritativeOnly, unknownCount, decision, ok };
}

/**
 * Prove Redis loss never causes a security fail-OPEN. Every data site must be
 * fail-safe (degrade, not disable protection) and no authoritative security state
 * may be Redis-only.
 * @param {typeof REDIS_DATA_SITES} sites
 * @returns {{ ok: boolean, findings: string[] }}
 */
export function assertRedisLossSecurityFailmode(sites = REDIS_DATA_SITES) {
  const findings = [];
  for (const s of sites) {
    if (s.durableSourceOfTruth === true && !s.reconstructable) {
      findings.push(`authoritative-only Redis state at ${s.site}`);
    }
    if (!s.lossFailMode || /fail-open|disable|bypass/i.test(s.lossFailMode)) {
      findings.push(`unsafe loss fail-mode at ${s.site}`);
    }
  }
  return { ok: findings.length === 0, findings };
}

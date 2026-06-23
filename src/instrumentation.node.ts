/**
 * Node.js-only instrumentation (Phase 45).
 *
 * Loaded exclusively by instrumentation.ts when NEXT_RUNTIME === "nodejs".
 * Safe to import Node.js-only modules (ioredis, fs, etc.) here.
 *
 *  1. Production startup validation (FATAL checks abort the process)
 *  2. SIGTERM / SIGINT graceful-shutdown handler
 */

import { executeAndMaybeAbort } from "@/lib/startup/validate";
import { logger }               from "@/lib/logger";
import "@/lib/events/auth/handlers";
import "@/lib/events/system/handlers";

// Run startup checks on first load
executeAndMaybeAbort();

// ── Graceful shutdown ─────────────────────────────────────────────────────────

let _shuttingDown = false;

const DRAIN_MS = Math.max(
  0,
  parseInt(process.env.SHUTDOWN_DRAIN_MS ?? "5000", 10),
);

async function gracefulShutdown(signal: string): Promise<void> {
  if (_shuttingDown) return;
  _shuttingDown = true;

  logger.info(`${signal} received — starting graceful shutdown`, { drainMs: DRAIN_MS });

  // Let in-flight requests complete
  if (DRAIN_MS > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, DRAIN_MS));
  }

  // Close Prisma connection pool
  try {
    const { getPrisma } = await import("@/lib/db/prisma");
    const prisma = await getPrisma();
    if (prisma) {
      await (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect();
      logger.info("Prisma connection pool closed.");
    }
  } catch (e) {
    logger.error("Prisma close error during shutdown.", { error: String(e) });
  }

  // Close Redis connection
  try {
    const { getRedis } = await import("@/lib/redis/client");
    const redis = await getRedis();
    if (redis) {
      await redis.quit();
      logger.info("Redis connection closed.");
    }
  } catch (e) {
    logger.error("Redis close error during shutdown.", { error: String(e) });
  }

  logger.info("Graceful shutdown complete.");
  process.exit(0);
}

process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.once("SIGINT",  () => void gracefulShutdown("SIGINT"));

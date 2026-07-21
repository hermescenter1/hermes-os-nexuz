/**
 * Prisma client accessor (Phase 11A/11B).
 *
 * Prisma 7 + PostgreSQL via the @prisma/adapter-pg driver adapter. Both
 * @prisma/client and the adapter are imported DYNAMICALLY and only in
 * database mode, so the session-mode build never requires the generated
 * client or a database connection. The client is cached on globalThis to
 * survive Next.js dev hot-reload.
 *
 * Returns null whenever the database is unavailable (not in database mode,
 * client not generated, or no DATABASE_URL). Callers must handle null and
 * fall back to session storage — they never assume a client exists.
 */

import { isDatabaseMode } from "@/lib/storage/storage-mode";
import { logInfraFailure } from "@/lib/logger/security-events";

// Loose type: we avoid a static import of @prisma/client so the build never
// requires the generated client. Repositories cast to the methods they use.
type PrismaLike = Record<string, unknown> & { $disconnect?: () => Promise<void> };

const g = globalThis as unknown as { __hermesPrisma?: PrismaLike | null };

export async function getPrisma(): Promise<PrismaLike | null> {
  if (!isDatabaseMode()) return null;
  if (g.__hermesPrisma !== undefined) return g.__hermesPrisma;

  const url = process.env.DATABASE_URL;
  if (!url) {
    g.__hermesPrisma = null;
    return null;
  }

  try {
    // Dynamic imports: only reached in database mode. If the client was never
    // generated (e.g. offline build), these throw and we degrade to session.
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
      import("@prisma/client") as unknown as Promise<{
        PrismaClient: new (opts?: { adapter?: unknown }) => PrismaLike;
      }>,
      import("@prisma/adapter-pg") as unknown as Promise<{
        PrismaPg: new (config: { connectionString: string }) => unknown;
      }>,
    ]);
    // Prisma 7 driver-adapter pattern: pass a pg adapter to the client.
    const adapter = new PrismaPg({ connectionString: url });
    g.__hermesPrisma = new PrismaClient({ adapter });
  } catch (err) {
    // Generation/adapter/connection unavailable — degrade gracefully, but do
    // NOT do it silently. PHASE 90-93A: this failure is cached for the life of
    // the process, so a misconfigured deploy degrades every database-backed
    // feature permanently with no signal; the structured event is the only way
    // an operator learns why. The error CLASS and message are recorded — never
    // the connection string or any credential.
    logInfraFailure("database", "prisma.init", err);
    g.__hermesPrisma = null;
  }
  return g.__hermesPrisma;
}

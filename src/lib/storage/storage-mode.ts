/**
 * Storage mode detection (Phase 11A/11B).
 *
 * Resolution order:
 *  1. HERMES_STORAGE_MODE — explicit override ("database" | "session").
 *  2. DATABASE_URL presence — implicit: a URL implies database mode.
 *  3. Otherwise "session" (in-process memory + bundled JSON corpus).
 *
 * "database" mode still degrades safely to session at the repository layer if
 * the Prisma client/connection is unavailable, so an explicit override never
 * crashes the app.
 */

export type StorageMode = "database" | "session";

export function getStorageMode(): StorageMode {
  const override = process.env.HERMES_STORAGE_MODE?.trim().toLowerCase();
  if (override === "database" || override === "session") return override;
  return process.env.DATABASE_URL ? "database" : "session";
}

export function isDatabaseMode(): boolean {
  return getStorageMode() === "database";
}

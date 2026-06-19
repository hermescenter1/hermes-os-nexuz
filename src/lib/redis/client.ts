/**
 * Redis client singleton (Phase 33).
 * Uses ioredis. Returns null when REDIS_URL is absent (dev / session mode).
 * All callers must handle null and fall back to in-memory alternatives.
 */

import type { Redis as RedisType } from "ioredis";

// Global cache to survive Next.js dev hot-reload
const g = globalThis as typeof globalThis & { __hermesRedis?: RedisType | null };

export async function getRedis(): Promise<RedisType | null> {
  if (g.__hermesRedis !== undefined) return g.__hermesRedis;

  const url = process.env.REDIS_URL;
  if (!url) {
    g.__hermesRedis = null;
    return null;
  }

  try {
    const { default: IORedis } = await import("ioredis");
    const client = new IORedis(url, {
      lazyConnect:         true,
      enableOfflineQueue:  false,
      connectTimeout:      3000,
      maxRetriesPerRequest: 1,
    });
    await client.connect();
    g.__hermesRedis = client;
    return client;
  } catch {
    g.__hermesRedis = null;
    return null;
  }
}

/**
 * In-memory sliding-window rate limiter (Phase 28).
 * Protects auth endpoints from brute-force attacks.
 * Resets on server restart; a Redis-backed version can replace this module.
 */

interface Window {
  timestamps: number[];
}

const store = new Map<string, Window>();

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  login:          { max: 10, windowMs: 15 * 60 * 1000 }, // 10 / 15 min
  register:       { max: 5,  windowMs: 60 * 60 * 1000 }, // 5  / 1 hr
  "forgot-password": { max: 3, windowMs: 60 * 60 * 1000 }, // 3  / 1 hr
  "reset-password":  { max: 5, windowMs: 60 * 60 * 1000 }, // 5  / 1 hr
  "verify-email": { max: 10, windowMs: 60 * 60 * 1000 }, // 10 / 1 hr
};

/**
 * Check and record a rate-limit hit.
 * @returns true if the request is ALLOWED, false if BLOCKED.
 */
export function checkRateLimit(action: string, identifier: string): boolean {
  const limit = LIMITS[action];
  if (!limit) return true; // unknown action — allow

  const key = `${action}:${identifier}`;
  const now  = Date.now();
  const win  = store.get(key) ?? { timestamps: [] };

  // Evict timestamps outside the window
  win.timestamps = win.timestamps.filter((t) => now - t < limit.windowMs);

  if (win.timestamps.length >= limit.max) {
    store.set(key, win);
    return false; // blocked
  }

  win.timestamps.push(now);
  store.set(key, win);
  return true; // allowed
}

/** Remaining attempts for an action / identifier pair. */
export function remainingAttempts(action: string, identifier: string): number {
  const limit = LIMITS[action];
  if (!limit) return 999;

  const key = `${action}:${identifier}`;
  const now  = Date.now();
  const win  = store.get(key);
  if (!win) return limit.max;

  const active = win.timestamps.filter((t) => now - t < limit.windowMs).length;
  return Math.max(0, limit.max - active);
}

/** Seconds until the oldest hit in the current window expires. */
export function retryAfter(action: string, identifier: string): number {
  const limit = LIMITS[action];
  if (!limit) return 0;

  const key = `${action}:${identifier}`;
  const win  = store.get(key);
  if (!win || win.timestamps.length === 0) return 0;

  const now     = Date.now();
  const oldest  = win.timestamps[0];
  const resetAt = oldest + limit.windowMs;
  return Math.max(0, Math.ceil((resetAt - now) / 1000));
}

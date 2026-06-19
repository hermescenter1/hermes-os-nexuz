/**
 * API Platform types (Phase 33).
 */

export const API_KEY_PREFIX = "hk_";

export interface ApiKeyRecord {
  id:             string;
  organizationId: string;
  name:           string;
  prefix:         string;     // stored plaintext — used for display + lookup
  last4:          string;     // last 4 chars of the raw key — for identification
  scopes:         string[];
  lastUsedAt:     string | null;
  expiresAt:      string | null;
  createdById:    string | null;
  revokedAt:      string | null;
  revokedById:    string | null;
  createdAt:      string;
  updatedAt:      string;
  // keyHash is NEVER included in this record
}

/** Returned only at key creation — raw key shown once, never stored. */
export interface ApiKeyCreatedRecord extends ApiKeyRecord {
  rawKey: string;
}

/** Context resolved by the platform auth middleware for each request. */
export interface PlatformActorContext {
  userId:     string | null;  // null for API-key-only calls without user linkage
  orgId:      string;
  authMethod: "jwt" | "apikey";
  scopes:     string[];
  keyId?:     string;         // ApiKey.id — present only for apikey auth
}

/** Rate-limit counters for a single org in the current windows. */
export interface RateLimitState {
  limitPerMinute:    number;
  limitPerDay:       number;
  usedThisMinute:    number;
  usedToday:         number;
  remainingMinute:   number;
  remainingDay:      number;
  resetMinuteAt:     number;  // Unix ms
  resetDayAt:        number;  // Unix ms
  exceeded:          boolean;
  exceededWindow:    "minute" | "day" | null;
}

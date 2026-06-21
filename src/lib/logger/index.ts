/**
 * Structured JSON logger (Phase 45).
 *
 * Writes JSON-lines to process.stdout. Features:
 *   - Five log levels: DEBUG(10) INFO(20) WARN(30) ERROR(40) FATAL(50)
 *   - Per-request correlation IDs forwarded from X-Request-ID
 *   - Explicit deny-list redaction applied BEFORE any write — values whose
 *     keys match the deny-list and JWT-shaped strings are replaced at write time
 *   - Edge-safe: falls back to console.* in Edge Runtime (no process.stdout)
 *   - Never throws
 *
 * Minimum level: LOG_LEVEL env var (DEBUG/INFO/WARN/ERROR/FATAL).
 * Default: INFO in production, DEBUG otherwise.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

const LEVELS: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO:  20,
  WARN:  30,
  ERROR: 40,
  FATAL: 50,
};

// Deny-list: redact any metadata key whose name contains one of these substrings (case-insensitive).
const DENY_KEY_SUBSTRINGS = [
  "password", "passwd", "pwd",
  "secret",
  "token",
  "jwt",
  "authorization", "auth",
  "api_key", "apikey", "x-api-key",
  "cookie",
  "hermes_at", "hermes_rt", "hermes_session",
  "database_url", "redis_url", "connection_string",
  "credentials",
  "private_key", "access_key",
  "refresh_token",
];

// Matches a JWT (three base64url segments separated by dots)
const JWT_RE = /^[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;

function isDeniedKey(key: string): boolean {
  const lk = key.toLowerCase();
  return DENY_KEY_SUBSTRINGS.some((d) => lk.includes(d));
}

function redactValue(val: unknown): unknown {
  if (typeof val === "string") {
    return JWT_RE.test(val.trim()) ? "[REDACTED-JWT]" : val;
  }
  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    return redactObject(val as Record<string, unknown>);
  }
  if (Array.isArray(val)) {
    return val.map(redactValue);
  }
  return val;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    out[key] = isDeniedKey(key) ? "[REDACTED]" : redactValue(val);
  }
  return out;
}

function minLevel(): number {
  const raw = process.env.LOG_LEVEL?.toUpperCase() as LogLevel | undefined;
  if (raw && LEVELS[raw] !== undefined) return LEVELS[raw];
  return process.env.NODE_ENV === "production" ? LEVELS.INFO : LEVELS.DEBUG;
}

function isEdge(): boolean {
  return typeof (globalThis as Record<string, unknown>).EdgeRuntime === "string";
}

function writeLog(
  level: LogLevel,
  msg:   string,
  meta?: Record<string, unknown>,
  reqId?: string,
): void {
  if (LEVELS[level] < minLevel()) return;

  const entry: Record<string, unknown> = {
    ts:    new Date().toISOString(),
    level,
    svc:   "hermes-os",
    ...(reqId ? { reqId } : {}),
    msg,
    ...(meta ? redactObject(meta) : {}),
  };

  const line = JSON.stringify(entry) + "\n";

  if (isEdge()) {
    if (LEVELS[level] >= LEVELS.ERROR) console.error(line.trimEnd());
    else if (LEVELS[level] >= LEVELS.WARN) console.warn(line.trimEnd());
    else console.log(line.trimEnd());
    return;
  }

  try {
    process.stdout.write(line);
  } catch {
    try { console.log(line.trimEnd()); } catch { /* never throw */ }
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>, reqId?: string) =>
    writeLog("DEBUG", msg, meta, reqId),
  info: (msg: string, meta?: Record<string, unknown>, reqId?: string) =>
    writeLog("INFO", msg, meta, reqId),
  warn: (msg: string, meta?: Record<string, unknown>, reqId?: string) =>
    writeLog("WARN", msg, meta, reqId),
  error: (msg: string, meta?: Record<string, unknown>, reqId?: string) =>
    writeLog("ERROR", msg, meta, reqId),
  fatal: (msg: string, meta?: Record<string, unknown>, reqId?: string) =>
    writeLog("FATAL", msg, meta, reqId),
};

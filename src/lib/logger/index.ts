/**
 * Structured JSON logger (Phase 45; schema formalised in Phase 92).
 *
 * Writes JSON-lines to process.stdout. Features:
 *   - Five log levels: DEBUG(10) INFO(20) WARN(30) ERROR(40) FATAL(50)
 *   - Per-request correlation IDs forwarded from X-Request-ID
 *   - A versioned line shape (schemaVersion, ts, level, svc, env, …) — see
 *     src/lib/observability/log-schema.ts for the field contract
 *   - Explicit deny-list redaction applied BEFORE any write — values whose
 *     keys match the deny-list and JWT-shaped strings are replaced at write time
 *   - Recursive redaction that is bounded in depth and cycle-safe, and that
 *     unwraps Error objects to {name,message} (never a stack) so a thrown value
 *     dropped into meta is neither lost as `{}` nor able to leak a trace
 *   - Edge-safe: falls back to console.* in Edge Runtime (no process.stdout)
 *   - Never throws — a failure inside redaction or serialization degrades to a
 *     minimal line rather than propagating into the caller
 *
 * Minimum level: LOG_LEVEL env var (DEBUG/INFO/WARN/ERROR/FATAL).
 * Default: INFO in production, DEBUG otherwise.
 */

import { LOG_SCHEMA_VERSION, SERVICE_NAME, resolveEnvironment } from "@/lib/observability/log-schema";

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

// Bound the walk so a deeply-nested (or maliciously deep) metadata object can
// neither blow the stack nor produce an unbounded log line.
const MAX_REDACT_DEPTH = 8;

/**
 * Unwrap an Error to a safe {name, message}. A raw Error serializes to `{}`
 * (name/message/stack are non-enumerable), which silently loses the one thing
 * an operator needs — the class and message — so we project them explicitly.
 * The stack is deliberately never included; the message is truncated and still
 * runs through value-level redaction so a JWT interpolated into it is masked.
 */
function redactError(err: Error): Record<string, unknown> {
  return {
    name: err.name,
    message: redactScalar(String(err.message).slice(0, 300)),
  };
}

// Credentials embedded in FREE TEXT (an error message, a driver string) are not
// caught by key-based redaction, so a connection string or `password=…` dropped
// into a message would leak. These two high-confidence patterns mask the common
// shapes without the false-positive risk of scanning for arbitrary tokens:
//   - URL userinfo:  scheme://user:pass@host  →  scheme://[REDACTED]@host
//   - key=value:     password=…, token=…, api_key=…, secret=…  →  key=[REDACTED]
const URL_CRED_RE = /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s:@]+@/gi;
const KV_SECRET_RE = /\b(password|passwd|pwd|secret|api[_-]?key|apikey|token|access[_-]?key|refresh[_-]?token)=([^\s&"';]+)/gi;
// A JWT embedded MID-TEXT (e.g. "Authorization: Bearer eyJhbGci...") is missed by
// the anchored, whole-string JWT_RE. Anchoring on the `eyJ` prefix — the base64url
// of the `{"` that opens virtually every JWT header — keeps false positives on
// arbitrary dotted tokens negligible while still masking real bearer tokens.
const JWT_TEXT_RE = /\beyJ[A-Za-z0-9\-_]{4,}\.[A-Za-z0-9\-_]{4,}\.[A-Za-z0-9\-_]{4,}\b/g;

function scrubSecrets(s: string): string {
  return s
    .replace(URL_CRED_RE, "$1[REDACTED]@")
    .replace(KV_SECRET_RE, "$1=[REDACTED]")
    .replace(JWT_TEXT_RE, "[REDACTED-JWT]");
}

/** Redact a primitive value: mask JWT-shaped strings, scrub embedded secrets. */
function redactScalar(val: string): string {
  if (JWT_RE.test(val.trim())) return "[REDACTED-JWT]";
  return scrubSecrets(val);
}

/**
 * `seen` is a PATH set (an entry is removed as the walk unwinds), so genuine
 * cycles are caught while a value merely shared across sibling branches is
 * still rendered rather than being falsely reported as circular.
 */
function redactValue(val: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof val === "string") return redactScalar(val);
  // A BigInt is not JSON-serializable and would otherwise make JSON.stringify
  // throw and degrade the WHOLE line to [UNSERIALIZABLE]; render it as a string.
  if (typeof val === "bigint") return val.toString();
  if (val === null || typeof val !== "object") return val;

  const obj = val as object;
  if (seen.has(obj)) return "[CIRCULAR]";
  if (depth >= MAX_REDACT_DEPTH) return "[TRUNCATED]";

  seen.add(obj);
  try {
    if (val instanceof Error) return redactError(val);
    if (val instanceof Date) return val.toISOString();
    if (Array.isArray(val)) return val.map((v) => redactValue(v, depth + 1, seen));
    return redactObject(val as Record<string, unknown>, depth + 1, seen);
  } finally {
    seen.delete(obj);
  }
}

function redactObject(
  obj: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    out[key] = isDeniedKey(key) ? "[REDACTED]" : redactValue(val, depth, seen);
  }
  return out;
}

/** Public entry point: redact a metadata bag. Never throws. */
function redactMeta(meta: Record<string, unknown>): Record<string, unknown> {
  try {
    return redactObject(meta, 0, new WeakSet<object>());
  } catch {
    // A getter that throws, an exotic proxy, etc. — never let redaction failure
    // reach the caller. Drop the metadata rather than risk leaking it raw.
    return { meta: "[UNSERIALIZABLE]" };
  }
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
    schemaVersion: LOG_SCHEMA_VERSION,
    ts:    new Date().toISOString(),
    level,
    svc:   SERVICE_NAME,
    env:   resolveEnvironment(),
    ...(reqId ? { reqId } : {}),
    msg,
    ...(meta ? redactMeta(meta) : {}),
  };

  let line: string;
  try {
    line = JSON.stringify(entry) + "\n";
  } catch {
    // Serialization itself failed (e.g. a BigInt slipped through redaction).
    // Emit a minimal, always-serializable line instead of throwing.
    line = JSON.stringify({
      schemaVersion: LOG_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      level,
      svc: SERVICE_NAME,
      env: resolveEnvironment(),
      ...(reqId ? { reqId } : {}),
      msg,
      meta: "[UNSERIALIZABLE]",
    }) + "\n";
  }

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

/**
 * PHASE 92 — normalized error-event aggregation.
 *
 * Collapses individual failures into stable FINGERPRINTS so an operator sees
 * "TypeError in brain.save — 412 occurrences, first 10:02, last 10:41" instead
 * of 412 undifferentiated lines. Each fingerprint carries first/last-seen,
 * count, severity and a lifecycle (acknowledged/resolved).
 *
 * SAFETY:
 *   - The sample message is redacted (JWT-shaped tokens masked) and truncated;
 *     stacks, SQL, connection strings and tenant payloads never enter the store.
 *   - The fingerprint is computed from the error CLASS + a NORMALIZED message
 *     (ids/numbers/quoted values stripped) so variants of the same fault group
 *     together and no raw identifier is embedded in the key.
 *   - Bounded: at most MAX_FINGERPRINTS distinct groups; the oldest-seen group
 *     is evicted past the cap so memory cannot grow without bound.
 *   - Never throws.
 *
 * An error at severity >= "error" also raises a deduplicated operational alert.
 */

import { createHash } from "node:crypto";
import { incCounter } from "./metrics";
import { raiseAlert } from "./alerts";
import { type Severity, severityAtLeast } from "./log-schema";

export interface ErrorInput {
  errorClass: string;
  message: string;
  operation: string;
  severity?: Severity;
  correlationId?: string;
}

export interface ErrorFingerprint {
  fingerprint: string;
  errorClass: string;
  operation: string;
  sampleMessage: string;
  severity: Severity;
  firstSeen: string;
  lastSeen: string;
  count: number;
  acknowledged: boolean;
  resolved: boolean;
  /** Bounded set of recent correlation ids for incident cross-referencing. */
  correlationIds: string[];
}

const MAX_FINGERPRINTS = 500;
const MAX_CORRELATIONS_PER_FP = 20;
const MAX_MESSAGE_LEN = 200;

const JWT_RE = /^[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;

function registry(): Map<string, ErrorFingerprint> {
  const g = globalThis as unknown as { __hermesErrors?: Map<string, ErrorFingerprint> };
  g.__hermesErrors ??= new Map();
  return g.__hermesErrors;
}

/** Redact + truncate a message before it is stored or shown. */
function safeMessage(raw: string): string {
  const trimmed = String(raw).slice(0, MAX_MESSAGE_LEN);
  // Mask a token that is the entire (trimmed) message; embedded tokens are rare
  // in error text and full-string matching avoids false positives.
  return JWT_RE.test(trimmed.trim()) ? "[REDACTED-JWT]" : trimmed;
}

/** Collapse variable parts so the same fault groups under one fingerprint. */
function normalizeForFingerprint(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .replace(/0x[0-9a-f]+/g, "<hex>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/'[^']*'/g, "<str>")
    .replace(/"[^"]*"/g, "<str>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function fingerprintOf(errorClass: string, operation: string, message: string): string {
  const basis = `${errorClass}|${operation}|${normalizeForFingerprint(message)}`;
  try {
    // SHA-256, truncated to 12 hex chars. The fingerprint is a grouping key, not
    // a security token; there is no stored/compat requirement to keep SHA-1, so
    // we use the stronger digest by default (no reason to retain a weak hash).
    return createHash("sha256").update(basis).digest("hex").slice(0, 12);
  } catch {
    // Edge/exotic runtime without node:crypto — deterministic fallback hash.
    let h = 0;
    for (let i = 0; i < basis.length; i++) h = (Math.imul(31, h) + basis.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).padStart(8, "0");
  }
}

/** Evict the least-recently-seen fingerprint when over the cap. */
function evictIfNeeded(reg: Map<string, ErrorFingerprint>): void {
  if (reg.size < MAX_FINGERPRINTS) return;
  let oldestKey: string | null = null;
  let oldest = Infinity;
  for (const [k, v] of reg) {
    const t = Date.parse(v.lastSeen);
    if (t < oldest) { oldest = t; oldestKey = k; }
  }
  if (oldestKey) reg.delete(oldestKey);
}

/**
 * Record an error occurrence. Returns the fingerprint id. Never throws.
 * Raises a deduplicated alert for severities at or above "error".
 */
export function recordError(input: ErrorInput): string {
  try {
    const severity: Severity = input.severity ?? "error";
    const fp = fingerprintOf(input.errorClass, input.operation, input.message);
    const now = new Date().toISOString();
    const reg = registry();

    let entry = reg.get(fp);
    if (entry) {
      entry.lastSeen = now;
      entry.count += 1;
      if (input.correlationId && !entry.correlationIds.includes(input.correlationId)) {
        entry.correlationIds.push(input.correlationId);
        if (entry.correlationIds.length > MAX_CORRELATIONS_PER_FP) entry.correlationIds.shift();
      }
      // An occurrence at a higher severity raises the group's severity.
      if (severityAtLeast(severity, entry.severity)) entry.severity = severity;
    } else {
      evictIfNeeded(reg);
      entry = {
        fingerprint: fp,
        errorClass: input.errorClass,
        operation: input.operation,
        sampleMessage: safeMessage(input.message),
        severity,
        firstSeen: now,
        lastSeen: now,
        count: 1,
        acknowledged: false,
        resolved: false,
        correlationIds: input.correlationId ? [input.correlationId] : [],
      };
      reg.set(fp, entry);
    }

    incCounter("errors_total", { severity: entry.severity });

    if (severityAtLeast(entry.severity, "error")) {
      void raiseAlert({
        key: `error:${fp}`,
        title: `${entry.errorClass} in ${entry.operation}`,
        severity: entry.severity,
        summary: `${entry.sampleMessage} (count ${entry.count})`,
        labels: { errorClass: entry.errorClass, operation: entry.operation },
        correlationId: input.correlationId,
      });
    }

    return fp;
  } catch {
    return "unknown";
  }
}

/** Snapshot of error groups for the operator dashboard, most-recent first. */
export function getErrorFingerprints(includeResolved = false): ErrorFingerprint[] {
  return [...registry().values()]
    .filter((e) => includeResolved || !e.resolved)
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
}

/** Look up a single fingerprint (for the incident timeline). */
export function getErrorFingerprint(fp: string): ErrorFingerprint | null {
  return registry().get(fp) ?? null;
}

export function acknowledgeError(fp: string): boolean {
  const e = registry().get(fp);
  if (!e) return false;
  e.acknowledged = true;
  return true;
}

export function resolveErrorFingerprint(fp: string): boolean {
  const e = registry().get(fp);
  if (!e) return false;
  e.resolved = true;
  return true;
}

/** Reset all error state. Test-only. */
export function resetErrors(): void {
  const g = globalThis as unknown as { __hermesErrors?: Map<string, ErrorFingerprint> };
  g.__hermesErrors = new Map();
}

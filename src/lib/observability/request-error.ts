/**
 * Safe error evidence for failures Next.js handles itself (instrumentation
 * `onRequestError`). Feeds the existing fingerprint model (`recordError`) so the
 * operator console and the correlationId reconstruction see the failure.
 *
 * Privacy: the error MESSAGE, stack, request path, query, headers (other than a
 * validated X-Request-ID) and method are never read into the record. Only a
 * validated error-class identifier, the route TEMPLATE (e.g. `/[locale]/x`, not
 * the raw URL) and the render type are used.
 */

import { recordError } from "./errors";
import { isSafeRequestId, REQUEST_ID_HEADER } from "@/lib/logger/correlation";

const CLASS_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ROUTE_TEMPLATE_RE = /^\/[A-Za-z0-9/_[\]().@-]{0,119}$/;
const ROUTE_TYPES = ["render", "route", "action", "proxy", "middleware"] as const;

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const raw = (headers as Record<string, unknown>)[name];
  return typeof raw === "string" ? raw : undefined;
}

/** Records one fingerprint occurrence. Returns the fingerprint id. Never throws. */
export function recordUnhandledRequestError(
  error: unknown,
  request: { headers?: unknown },
  context: { routePath?: unknown; routeType?: unknown },
): string {
  try {
    const name = error instanceof Error ? error.name : "";
    const errorClass = CLASS_RE.test(name) ? name : "Error";
    const routeType = (ROUTE_TYPES as readonly unknown[]).includes(context.routeType)
      ? (context.routeType as string)
      : "unknown";
    const routePath =
      typeof context.routePath === "string" && ROUTE_TEMPLATE_RE.test(context.routePath) ? context.routePath : "";
    const supplied = headerValue(request.headers, REQUEST_ID_HEADER);
    return recordError({
      errorClass,
      operation: `http.${routeType}${routePath ? ` ${routePath}` : ""}`,
      message: `Unhandled ${routeType} error (${errorClass})`,
      severity: "error",
      correlationId: supplied && isSafeRequestId(supplied) ? supplied : undefined,
    });
  } catch {
    return "unknown";
  }
}

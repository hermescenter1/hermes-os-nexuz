/**
 * Application-side HTTP request telemetry (Node.js runtime only).
 *
 * WHY THIS HOOK
 * -------------
 * The production runtime is `node server.js` (Next.js standalone, Node 20),
 * which serves requests through a plain `http.createServer` listener in the same
 * process that runs `instrumentation.ts`. Node publishes two read-only
 * `diagnostics_channel` events for every request that reaches an HTTP server
 * listener:
 *
 *   - `http.server.request.start`   (request headers parsed)
 *   - `http.server.response.finish` (the Node server has sent/finished the response)
 *
 * STABILITY: these built-in channels are marked experimental in Node. They are
 * additive and read-only, so a change in a future Node release can at worst stop
 * events from arriving (counters stay empty); it cannot affect request handling.
 * Re-verify after a Node major upgrade.
 *
 * Subscribing to them observes the FINAL status code and the end-to-end
 * application duration without patching any Node/Next internals and without
 * being able to change the request, the response, streaming, redirects or auth.
 *
 * Middleware is deliberately NOT used: it runs in the Edge runtime before the
 * route executes, so it can neither know the final status nor the full duration
 * and its process-local counters would not be the Node process's counters.
 *
 * WHAT IS (AND IS NOT) OBSERVED
 * -----------------------------
 * Observed: requests that reached the Hermes application and finished writing
 * a response. NOT observed (Nginx / Cloudflare evidence only): Nginx-generated
 * 502/504, requests rejected at the edge, requests the HTTP parser refused,
 * WebSocket upgrades, and responses aborted by the client before finishing.
 * Duration runs from "request headers parsed" to "the Node server sent/finished the
 * response"; it is not client-perceived latency.
 *
 * PRIVACY / CARDINALITY
 * ---------------------
 * Only the HTTP method (fixed allowlist, else OTHER) and the status class are
 * ever read into a label. The URL is inspected solely to decide exclusion and is
 * never stored, logged or labelled. Nothing request-derived other than those
 * two enums reaches the metric registry, and the registry itself drops any
 * label not declared for the metric.
 */

import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { incCounter, observeHistogram } from "./metrics";

export const HTTP_METHOD_ALLOWLIST = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
export type HttpMethodLabel = (typeof HTTP_METHOD_ALLOWLIST)[number] | "OTHER";
export type HttpStatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx";

/**
 * Paths whose traffic is not recorded. `/api/metrics` would otherwise count its
 * own scrapes; `/api/health*` is synthetic probe traffic (Docker/Nginx health
 * checks and the deploy gate poll it continuously) that would dominate the rate
 * and skew the latency distribution of real requests.
 */
const EXCLUDED_PATH_PREFIXES = ["/api/metrics", "/api/health"] as const;

const REQUEST_START_CHANNEL = "http.server.request.start";
const RESPONSE_FINISH_CHANNEL = "http.server.response.finish";

export function normalizeMethod(method: unknown): HttpMethodLabel {
  return typeof method === "string" && (HTTP_METHOD_ALLOWLIST as readonly string[]).includes(method)
    ? (method as HttpMethodLabel)
    : "OTHER";
}

export function statusClassOf(statusCode: unknown): HttpStatusClass | null {
  if (typeof statusCode !== "number" || !Number.isInteger(statusCode)) return null;
  if (statusCode < 100 || statusCode > 599) return null;
  return `${Math.floor(statusCode / 100)}xx` as HttpStatusClass;
}

/** True when the request URL targets an excluded path. The URL is never stored. */
export function isExcludedPath(rawUrl: unknown): boolean {
  if (typeof rawUrl !== "string") return false;
  const end = rawUrl.search(/[?#]/);
  const path = end === -1 ? rawUrl : rawUrl.slice(0, end);
  return EXCLUDED_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Record one finished request. Never throws; a bad input is silently ignored. */
export function recordHttpRequest(input: { method: unknown; statusCode: unknown; durationMs: number }): void {
  try {
    const statusClass = statusClassOf(input.statusCode);
    if (!statusClass) return;
    const method = normalizeMethod(input.method);
    incCounter("http_requests_total", { method, status_class: statusClass });
    if (Number.isFinite(input.durationMs) && input.durationMs >= 0) {
      observeHistogram("http_request_duration_ms", input.durationMs, { method });
    }
  } catch {
    /* telemetry must never reach the request path */
  }
}

interface HttpChannelMessage {
  request?: { method?: unknown; url?: unknown };
  response?: { statusCode?: unknown };
}

interface Installed {
  onStart: (message: unknown) => void;
  onFinish: (message: unknown) => void;
}

/**
 * Process-wide guard: the module can be evaluated more than once (separate
 * bundles, dev reloads) but the channel must be subscribed exactly once.
 */
function installedHandle(): { current?: Installed } {
  const g = globalThis as unknown as { __hermesHttpTelemetry?: { current?: Installed } };
  g.__hermesHttpTelemetry ??= {};
  return g.__hermesHttpTelemetry;
}

/**
 * Subscribe to the Node HTTP server channels. Idempotent. Returns true when a
 * subscription is active after the call. Never throws.
 */
export function installHttpTelemetry(): boolean {
  try {
    const handle = installedHandle();
    if (handle.current) return true;

    const starts = new WeakMap<object, bigint>();

    const onStart = (message: unknown): void => {
      try {
        const request = (message as HttpChannelMessage | null)?.request;
        if (request && typeof request === "object") starts.set(request, process.hrtime.bigint());
      } catch {
        /* ignore */
      }
    };

    const onFinish = (message: unknown): void => {
      try {
        const m = message as HttpChannelMessage | null;
        const request = m?.request;
        if (!request || typeof request !== "object") return;
        const started = starts.get(request);
        if (started === undefined) return; // never saw the start: do not invent a duration
        starts.delete(request);
        if (isExcludedPath(request.url)) return;
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        recordHttpRequest({ method: request.method, statusCode: m?.response?.statusCode, durationMs });
      } catch {
        /* ignore */
      }
    };

    subscribe(REQUEST_START_CHANNEL, onStart);
    subscribe(RESPONSE_FINISH_CHANNEL, onFinish);
    handle.current = { onStart, onFinish };
    return true;
  } catch {
    return false;
  }
}

/** Remove the subscriptions. Test-only. */
export function uninstallHttpTelemetry(): void {
  try {
    const handle = installedHandle();
    if (!handle.current) return;
    unsubscribe(REQUEST_START_CHANNEL, handle.current.onStart);
    unsubscribe(RESPONSE_FINISH_CHANNEL, handle.current.onFinish);
    handle.current = undefined;
  } catch {
    /* ignore */
  }
}

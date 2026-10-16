/**
 * Next.js instrumentation hook (Phase 45).
 *
 * Runs at server startup in each runtime.
 * Node.js-only work (startup validation + graceful shutdown) is delegated to
 * instrumentation.node.ts so webpack does NOT bundle Node.js-only modules
 * (ioredis, stream, dns, net) for the Edge runtime.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}

/**
 * Next.js `onRequestError` hook: called for errors Next itself handles
 * (uncaught render / route / action failures). Node runtime only; the privacy
 * and cardinality rules live in `recordUnhandledRequestError`.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: unknown; method?: unknown; headers?: unknown },
  context: { routerKind?: unknown; routePath?: unknown; routeType?: unknown },
): Promise<void> {
  // Same pattern as register(): the NEXT_RUNTIME guard wraps the import so the
  // Edge compilation drops the Node-only module (node:crypto) entirely.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { recordUnhandledRequestError } = await import("./lib/observability/request-error");
      recordUnhandledRequestError(error, request, context);
    } catch {
      /* an error hook must never throw into Next.js */
    }
  }
}

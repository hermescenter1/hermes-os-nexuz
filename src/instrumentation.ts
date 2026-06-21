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

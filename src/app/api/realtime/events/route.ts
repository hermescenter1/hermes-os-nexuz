/**
 * GET /api/realtime/events
 *
 * Server-Sent Events endpoint for real-time client updates.
 * Authenticated via session cookie (browser sends automatically).
 * Unauthenticated requests receive 401 — no stream opened.
 *
 * SSE wire format:
 *   data: {"type":"connected"}\n\n
 *   data: {"type":"notification.created","notification":{...}}\n\n
 *   : ping\n\n   ← comment line, keepalive every 25 s
 */

export const dynamic = "force-dynamic";

import { getCurrentUser } from "@/lib/auth/session";
import { getSseManager }  from "@/lib/realtime/sse-manager";
import { logger }         from "@/lib/logger";

const PING_INTERVAL_MS = 25_000;

export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (chunk: string): boolean => {
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          return false;
        }
      };

      // send() is what the SSE manager calls for each event
      const send = (data: string): void => { enqueue(data); };

      getSseManager().addConnection(user.id, send);
      logger.info("[sse] Client connected.", {
        userId:      user.id,
        active:      getSseManager().activeConnections,
      });

      // Confirm connection
      enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      // Keepalive ping — browsers/proxies close idle SSE streams
      const ping = setInterval(() => {
        if (!enqueue(": ping\n\n")) clearInterval(ping);
      }, PING_INTERVAL_MS);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        getSseManager().removeConnection(user.id, send);
        logger.info("[sse] Client disconnected.", {
          userId: user.id,
          active: getSseManager().activeConnections,
        });
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",    // disable nginx proxy buffering
    },
  });
}

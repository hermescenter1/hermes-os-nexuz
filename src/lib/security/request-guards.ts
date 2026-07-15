/**
 * Phase 86C4B2B1D-SECURITY-7 — shared request-hardening helpers.
 *
 * Small, focused utilities reused by the public Copilot demo (anonymous
 * rate limiting + request validation) and the authenticated Brain write
 * (same-origin validation). Deliberately NOT a framework: no global state,
 * no middleware, no new dependencies — just pure header inspection plus a
 * standard no-store error response. The rate limiter itself is the existing
 * `@/lib/auth/rate-limiter` (Redis fixed-window with in-process fallback);
 * these helpers only resolve the client key and shape responses.
 */
import { NextResponse } from "next/server";
import { BASE_URL } from "@/lib/seo/config";

/**
 * Resolve the client IP for rate-limit keying — ONLY from a header the
 * reverse proxy controls and overwrites.
 *
 * This deployment is nginx (Let's Encrypt, no Cloudflare): `deploy/nginx`
 * sets `proxy_set_header X-Real-IP $remote_addr`, so `X-Real-IP` reaching the
 * app is the proxy's view of the peer and cannot be spoofed by the client.
 * `CF-Connecting-IP` and the left-most `X-Forwarded-For` are deliberately NOT
 * trusted: no Cloudflare edge validates/strips the former, and nginx appends
 * to XFF (`$proxy_add_x_forwarded_for`) so its left-most entry is
 * client-controlled — trusting either would let an attacker rotate rate-limit
 * buckets per request and bypass the limit entirely. Behind a future CF edge,
 * `X-Real-IP` would resolve to the CF IP (over-aggregating, never a bypass);
 * re-enabling CF trust would require a `set_real_ip_from` allowlist at the
 * proxy. Absent the header (local dev / non-proxied) → the single "unknown"
 * bucket, which the limiter still bounds.
 */
export function resolveClientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return "unknown";
}

/** True when the request declares a JSON media type (application/json or +json). */
export function isJsonContentType(req: Request): boolean {
  const raw = req.headers.get("content-type");
  if (!raw) return false;
  const mediaType = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  return /^application\/([a-z0-9.+-]*\+)?json$/.test(mediaType);
}

/** Result of a bounded body read. `text` is present only for `status: "ok"`. */
export type BoundedBody =
  | { status: "ok"; text: string }
  | { status: "too_large" }
  | { status: "error" };

/**
 * Read a request body as text with a HARD byte ceiling — a genuine resource
 * boundary, not just a post-hoc length check.
 *
 * A valid Content-Length over the limit is rejected up front without touching
 * the stream. Otherwise the body is read chunk-by-chunk through its
 * ReadableStream reader, counting ACTUAL Uint8Array byte lengths (not JS
 * string characters, so multibyte UTF-8 is measured correctly). The moment
 * the accumulated bytes exceed `maxBytes` the reader is cancelled and
 * `too_large` is returned — at most `maxBytes` bytes are retained plus the one
 * chunk that crossed the boundary (which is never buffered). An absent body is
 * `ok` with empty text; a malformed stream returns `error` without exposing
 * the internal cause. Only the bounded bytes are ever decoded.
 */
export async function readBoundedTextBody(
  req: Request,
  maxBytes: number,
): Promise<BoundedBody> {
  const len = req.headers.get("content-length");
  if (len) {
    const declared = Number(len);
    if (Number.isFinite(declared) && declared > maxBytes) return { status: "too_large" };
  }

  const body = req.body;
  if (!body) return { status: "ok", text: "" };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop immediately — do not buffer the overflowing chunk.
        await reader.cancel();
        return { status: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      /* reader already closed — nothing to release */
    }
    return { status: "error" };
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: "ok", text: new TextDecoder().decode(buf) };
}

/** The exact origins accepted for authenticated, state-changing requests. */
function allowedOrigins(): Set<string> {
  const set = new Set<string>();
  try {
    const base = new URL(BASE_URL);
    set.add(base.origin);
    // Accept the www / non-www counterpart of the canonical host — nginx
    // serves both hermesnovin.com and www.hermesnovin.com.
    const host = base.hostname;
    const alt = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    set.add(`${base.protocol}//${alt}`);
  } catch {
    /* malformed BASE_URL — no production origin is trusted */
  }
  // Legitimate local development / test origins only outside production.
  if (process.env.NODE_ENV !== "production") {
    set.add("http://localhost:3000");
    set.add("http://127.0.0.1:3000");
    set.add("http://localhost");
  }
  return set;
}

/**
 * Same-origin validation by EXACT origin match (scheme + host + port), so
 * substring/suffix spoofs are rejected — e.g.
 * `https://www.hermesnovin.com.attacker.example`,
 * `https://attacker.example/?www.hermesnovin.com`, and the plain-http variant
 * when production requires https. A missing or `null` Origin returns false:
 * modern browsers always send Origin on cross-site-capable POSTs, and no
 * documented consumer requires a null-origin authenticated write.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  return allowedOrigins().has(parsed.origin);
}

/**
 * Standard security error: a stable JSON body with `Cache-Control: no-store`
 * and no IP / key / stack-trace / internal detail leakage.
 */
export function securityError(
  payload: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

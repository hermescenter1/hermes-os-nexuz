/**
 * IndexNow submission endpoint (Phase 62; hardened in SECURITY-8 amendment).
 *
 * Notifies Bing and other IndexNow-compatible engines of new/updated URLs.
 * This is an internal deploy/admin trigger, NOT a public API — before the
 * amendment it accepted anonymous submissions of arbitrary URLs (outbound
 * amplification / quota abuse). It is now:
 *   - fail-closed: disabled (503) until INDEXNOW_TRIGGER_SECRET is configured;
 *   - authorized by a server-side secret header compared in constant time;
 *   - IP rate limited;
 *   - restricted to URLs on the canonical Hermes production host (https),
 *     rejecting foreign domains, malformed URLs, and http downgrades;
 *   - never performing the external request on any rejected input, and never
 *     exposing the IndexNow key or the trigger secret.
 *
 * INDEXNOW_KEY  = the outbound key sent to the IndexNow service (verified at
 *                 /[key].txt). INDEXNOW_TRIGGER_SECRET = the inbound header
 *                 secret that authorizes calling this endpoint.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { BASE_URL }     from "@/lib/seo/config";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { resolveClientIp, isJsonContentType, securityError } from "@/lib/security/request-guards";

const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "";
const TRIGGER_SECRET = process.env.INDEXNOW_TRIGGER_SECRET ?? "";
const ACTION = "indexnow";

/** Constant-time secret comparison (length-guarded — timingSafeEqual throws on
 *  unequal lengths). */
function secretMatches(provided: string | null): boolean {
  if (!provided || !TRIGGER_SECRET) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(TRIGGER_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Hostnames accepted for submitted URLs — the canonical host and its www /
 *  non-www counterpart. */
function allowedHosts(): Set<string> {
  const set = new Set<string>();
  try {
    const host = new URL(BASE_URL).hostname;
    set.add(host);
    set.add(host.startsWith("www.") ? host.slice(4) : `www.${host}`);
  } catch {
    /* malformed BASE_URL — nothing is accepted (fail closed) */
  }
  return set;
}

function urlsAreValid(urls: string[]): boolean {
  const hosts = allowedHosts();
  if (hosts.size === 0) return false;
  const requireHttps = process.env.NODE_ENV === "production";
  for (const u of urls) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return false;
    }
    if (!hosts.has(parsed.hostname)) return false;
    if (requireHttps && parsed.protocol !== "https:") return false;
  }
  return true;
}

export async function POST(request: Request) {
  // 1. Rate limit (IP) before any work.
  const ip = resolveClientIp(request);
  if (!(await checkRateLimit(ACTION, ip))) {
    return securityError({ error: "rate limited" }, 429, {
      "Retry-After": String(retryAfter(ACTION, ip)),
    });
  }

  // 2. Fail closed when the authorization secret is not configured.
  if (!TRIGGER_SECRET) {
    return securityError({ error: "IndexNow trigger is not configured" }, 503);
  }

  // 3. Authorize via constant-time secret comparison — no outbound call on fail.
  if (!secretMatches(request.headers.get("x-indexnow-secret"))) {
    return securityError({ error: "Unauthorized" }, 401);
  }

  // 4. The outbound key must exist to submit.
  if (!INDEXNOW_KEY) {
    return securityError({ error: "INDEXNOW_KEY not configured" }, 501);
  }

  // 5. Content-Type + body.
  if (!isJsonContentType(request)) {
    return securityError({ error: "unsupported media type" }, 415);
  }
  let urls: string[];
  try {
    const body = (await request.json()) as { urls?: unknown };
    if (!Array.isArray(body.urls) || body.urls.length === 0 || body.urls.some((u) => typeof u !== "string")) {
      return securityError({ error: "urls must be a non-empty string array" }, 400);
    }
    urls = body.urls as string[];
  } catch {
    return securityError({ error: "invalid JSON" }, 400);
  }

  // 6. Every URL must belong to the canonical Hermes host (https in prod) —
  // no outbound request on any foreign/malformed/downgraded URL.
  if (!urlsAreValid(urls)) {
    return securityError({ error: "urls must be valid Hermes production URLs" }, 400);
  }

  // 7. Submit.
  const payload = {
    host:        new URL(BASE_URL).hostname,
    key:         INDEXNOW_KEY,
    keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
    urlList:     urls,
  };
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method:  "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body:    JSON.stringify(payload),
  });

  return NextResponse.json(
    { status: res.status, ok: res.ok },
    { status: res.ok ? 200 : 502, headers: { "Cache-Control": "no-store" } },
  );
}

/** GET returns IndexNow readiness status (no secret values exposed). */
export async function GET() {
  return NextResponse.json({
    configured: Boolean(INDEXNOW_KEY) && Boolean(TRIGGER_SECRET),
    host:       new URL(BASE_URL).hostname,
    spec:       "https://www.indexnow.org/documentation",
  });
}

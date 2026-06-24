/**
 * IndexNow submission endpoint (Phase 62).
 * Allows Bing and other IndexNow-compatible search engines to be notified
 * of new or updated URLs. Key must be placed at /[key].txt for verification.
 * POST body: { urls: string[] }
 */

import { NextResponse } from "next/server";
import { BASE_URL }     from "@/lib/seo/config";

const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "";

export async function POST(request: Request) {
  if (!INDEXNOW_KEY) {
    return NextResponse.json({ error: "INDEXNOW_KEY not configured" }, { status: 501 });
  }

  let urls: string[];
  try {
    const body = await request.json() as { urls?: unknown };
    if (!Array.isArray(body.urls) || body.urls.some((u) => typeof u !== "string")) {
      return NextResponse.json({ error: "urls must be a string array" }, { status: 400 });
    }
    urls = body.urls as string[];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = {
    host:    new URL(BASE_URL).hostname,
    key:     INDEXNOW_KEY,
    keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method:  "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body:    JSON.stringify(payload),
  });

  return NextResponse.json({ status: res.status, ok: res.ok }, { status: res.ok ? 200 : 502 });
}

/** GET returns IndexNow readiness status */
export async function GET() {
  return NextResponse.json({
    configured: Boolean(INDEXNOW_KEY),
    host:       new URL(BASE_URL).hostname,
    keyLocation: INDEXNOW_KEY ? `${BASE_URL}/${INDEXNOW_KEY}.txt` : null,
    spec: "https://www.indexnow.org/documentation",
  });
}

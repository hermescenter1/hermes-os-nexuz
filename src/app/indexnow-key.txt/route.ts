import { NextResponse } from "next/server";

// PHASE 87L.6 — IndexNow key verification file.
//
// The IndexNow protocol verifies host ownership by fetching a plain-text file
// on the SAME host that contains exactly the submission key. The protocol
// explicitly supports a custom `keyLocation`, which /api/seo/indexnow sends as
// this route — a fixed path, so no root-level dynamic segment has to compete
// with the [locale] tree, and it sits outside the robots-disallowed /api/
// prefix.
//
// The key is environment-supplied (never committed); when it is not
// configured the route 404s, so nothing about the feature leaks. The response
// is exactly the key with no wrapper — the verifier compares byte-for-byte.

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const key = process.env.INDEXNOW_KEY ?? "";
  if (!key) return new NextResponse(null, { status: 404 });
  return new NextResponse(key, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

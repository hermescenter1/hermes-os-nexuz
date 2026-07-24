// PHASE 94B4 — JSON engineering manifest import.
//
// Thin by design: authenticate, authorize, validate, delegate, map. Every
// security decision lives in `withOtRoute` and the application services, so a
// route cannot forget a gate or reach the database directly.

import { NextRequest, NextResponse } from "next/server";
import {
  withOtRoute,
  resultResponse,
  errorResponse,
  readIdempotencyKey,
  privateJson,
} from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { svcFail } from "@/lib/ot-edge/services/core";
import { readRawJsonBody, MAX_IMPORT_BYTES } from "@/lib/ot-edge/http/body";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withOtRoute(req, { permission: "create_engineering_import", bucket: "engineering-import" }, async (ctx) => {
    // The key is mandatory: without it a retry would execute the import twice.
    // Its VALUE is never echoed — not here, not in the error, not in a log.
    const key = readIdempotencyKey(req);
    if (!key.ok) {
      return privateJson(
        { ok: false, code: "VALIDATION_FAILED", message: "A valid Idempotency-Key header is required." },
        422,
      );
    }

    const body = await readRawJsonBody(req, MAX_IMPORT_BYTES);
    if (!body.ok) return body.response;

    const url = new URL(req.url);
    const siteId = url.searchParams.get("siteId");

    const svc = await resolveOtServices();
    if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));

    const res = await svc.imports.execute(ctx, {
      // Tenant and actor come from the trusted context inside the service.
      siteId,
      idempotencyKey: key.key,
      sourceFilename: "manifest.json",
      contentType: "application/json",
      byteSize: body.byteSize,
      manifest: body.value,
    });
    return resultResponse(res, res.ok && !res.value.duplicate ? 201 : 200);
  });
}

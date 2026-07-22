// PHASE 94B4 — bounded request-body reading for the OT/engineering API.
//
// WHY A DEDICATED READER
// `await req.json()` reads an unbounded body into memory before anyone can
// object, so a size check afterwards is already too late. This wraps the
// platform's `readBoundedTextBody`, which stops at the limit, and enforces the
// content type BEFORE reading a single byte.
//
// CSV and XML are refused here, explicitly, rather than parsed: no parser for
// them is enabled in this release, and a route that quietly accepted them would
// advertise a capability the system does not have.

import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { readBoundedTextBody } from "@/lib/security/request-guards";
import { privateJson } from "./route-kit";

/** Matches the manifest ceiling the import service enforces. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Smaller default for ordinary control-plane payloads. */
export const MAX_JSON_BYTES = 64 * 1024;

/** Content types explicitly refused, with the reason stated to the caller. */
const REFUSED_TYPES = ["text/csv", "application/csv", "application/xml", "text/xml"];

function contentTypeOf(req: NextRequest): string {
  return (req.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
}

export type BodyResult<T> =
  | { ok: true; value: T; byteSize: number }
  | { ok: false; response: NextResponse };

/**
 * Read a JSON body with every gate applied in the only safe order:
 * content type → declared length → bounded read → parse.
 */
export async function readRawJsonBody(
  req: NextRequest,
  maxBytes = MAX_JSON_BYTES,
): Promise<BodyResult<unknown>> {
  const type = contentTypeOf(req);

  if (REFUSED_TYPES.includes(type)) {
    return {
      ok: false,
      response: privateJson(
        {
          ok: false,
          code: "UNSUPPORTED_FORMAT",
          message: "CSV and XML imports are not enabled in this release. Send application/json.",
        },
        415,
      ),
    };
  }
  if (type !== "application/json") {
    return {
      ok: false,
      response: privateJson(
        { ok: false, code: "UNSUPPORTED_FORMAT", message: "This content type is not supported in this release." },
        415,
      ),
    };
  }

  // Reject on the DECLARED length first — cheapest possible refusal.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: tooLarge() };
  }

  const read = await readBoundedTextBody(req, maxBytes);
  if (read.status === "too_large") return { ok: false, response: tooLarge() };
  if (read.status === "error") return { ok: false, response: badJson() };

  const text = read.text;
  if (text.trim() === "") return { ok: false, response: badJson() };

  try {
    // Only the PARSE failure is reported — never the body that caused it.
    return { ok: true, value: JSON.parse(text) as unknown, byteSize: Buffer.byteLength(text, "utf8") };
  } catch {
    return { ok: false, response: badJson() };
  }
}

/** Read a JSON body and validate it against a strict schema. */
export async function readJsonBody<T>(
  req: NextRequest,
  schema: z.ZodType<T>,
  maxBytes = MAX_JSON_BYTES,
): Promise<BodyResult<T>> {
  const raw = await readRawJsonBody(req, maxBytes);
  if (!raw.ok) return raw;

  const parsed = schema.safeParse(raw.value);
  if (!parsed.success) {
    // 422: syntactically valid JSON that the contract refuses — which is what
    // an unknown field (an injected organizationId, say) produces under a
    // `.strict()` schema. The offending value is never echoed.
    return {
      ok: false,
      response: privateJson(
        { ok: false, code: "VALIDATION_FAILED", message: "The request payload is not valid." },
        422,
      ),
    };
  }
  return { ok: true, value: parsed.data, byteSize: raw.byteSize };
}

const tooLarge = (): NextResponse =>
  privateJson(
    { ok: false, code: "PAYLOAD_TOO_LARGE", message: "The request payload is too large." },
    413,
  );

const badJson = (): NextResponse =>
  privateJson({ ok: false, code: "MALFORMED_JSON", message: "The request body is not valid JSON." }, 400);

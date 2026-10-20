/**
 * Bounded request parsing for the Digital Twin routes — Slice 1.
 *
 * `req.json()` buffers an unbounded body and, on a malformed one, was swallowed
 * into `{}` so the caller saw a misleading "siteId is required". Here the body
 * is read with a byte ceiling (a declared Content-Length is checked first, and
 * the stream is cut off the moment the ceiling is crossed, so a chunked body
 * with no declared length is bounded too), and a malformed body is reported as
 * what it is.
 */

import { NextResponse } from "next/server";
import type { z } from "zod";
import { twinJsonError } from "./errors";

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

async function readBounded(req: Request, maxBytes: number): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return null;
  }
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  maxBytes: number,
): Promise<Parsed<z.infer<S>>> {
  const text = await readBounded(req, maxBytes);
  if (text === null) {
    return {
      ok: false,
      response: twinJsonError(413, "PAYLOAD_TOO_LARGE", `Request body must not exceed ${maxBytes} bytes`),
    };
  }
  let raw: unknown = {};
  if (text.trim() !== "") {
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, response: twinJsonError(400, "INVALID_JSON", "Request body is not valid JSON") };
    }
  }
  return parseWith(schema, raw);
}

export function parseWith<S extends z.ZodType>(schema: S, raw: unknown): Parsed<z.infer<S>> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    response: validationResponse(result.error),
  };
}

export function validationResponse(error: z.ZodError): NextResponse {
  // Field PATHS and the schema's own messages only — never the submitted values.
  const issues = error.issues.slice(0, 20).map((i) => ({
    path: i.path.map(String).join("."),
    message: i.message,
  }));
  return NextResponse.json(
    { error: "Request validation failed", code: "VALIDATION_FAILED", issues },
    { status: 400 },
  );
}

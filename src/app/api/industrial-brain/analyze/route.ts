import { NextRequest, NextResponse } from "next/server";
import { analyzeIndustrialFault } from "@/lib/industrial-brain/analyzer";
import {
  AnalyzeRequestSchema,
  applyFieldAliases,
  firstIssueField,
} from "@/lib/industrial-brain/request-contract";

export const dynamic = "force-dynamic";

/**
 * PHASE 93B — the request schema and the alias map now live in
 * `@/lib/industrial-brain/request-contract`, which the workspace form imports
 * too. One contract, one source of truth: the client can no longer drift into
 * sending a body this route is guaranteed to reject.
 *
 * Validation is unchanged in strictness — see the contract module for the two
 * legitimate normalisations (documented aliases, and `""` meaning "not stated"
 * for the optional impact selects).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = applyFieldAliases(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    // The message and the field NAME are safe to return; the rejected VALUE is
    // never echoed — it may carry plant evidence the caller mistyped.
    const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
    const field = firstIssueField(parsed.error.issues);
    return NextResponse.json(
      { ok: false, error: firstError, ...(field ? { field } : {}) },
      { status: 400 },
    );
  }

  try {
    const analysis = analyzeIndustrialFault(parsed.data);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    // Error CLASS only — never the input, which is private industrial evidence.
    const errorClass = err instanceof Error ? err.name : "UnknownError";
    console.error("[industrial-brain/analyze] analysis failed:", errorClass);
    return NextResponse.json(
      { ok: false, error: "Analysis could not be completed. Please try again." },
      { status: 500 },
    );
  }
}

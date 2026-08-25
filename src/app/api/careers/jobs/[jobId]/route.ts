import { NextResponse } from "next/server";
import { getPublicJobDetail } from "@/lib/ats/public-jobs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * PHASE 104-B1.1 — the public job detail serves the DETAIL projection:
 * every body field from the requested locale's COMPLETE AtsJobTranslation
 * row (title, summary, description, department label, responsibilities,
 * requirements, preferred experience, localized skill labels). The legacy
 * English AtsJob content columns are never consulted, so DE/FA can never
 * silently read English. `benefits` is absent by contract — it has no
 * translated model (see PublicJobDetail in public-jobs.ts).
 *
 * Refusals are unchanged from B1: an unknown id, a DRAFT, a private posting,
 * a CLOSED posting, an expired closingDate and a locale without a complete
 * translation ALL answer the identical 404 — the endpoint is not an oracle
 * for what exists. The store being unreachable is the one different answer
 * (503), because an outage is not a fact about the posting. No fixture
 * fallback exists.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const locale = new URL(req.url).searchParams.get("locale") ?? "en";

  const job = await getPublicJobDetail(jobId, locale);
  if (job === "UNAVAILABLE") {
    return NextResponse.json(
      { error: "The careers service is temporarily unavailable." },
      { status: 503, headers: NO_STORE },
    );
  }
  if (job === null) {
    return NextResponse.json({ error: "Job not found" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ job, source: "db" }, { headers: NO_STORE });
}

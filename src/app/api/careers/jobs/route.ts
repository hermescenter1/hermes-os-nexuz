import { NextResponse } from "next/server";
import { listPublicJobCards } from "@/lib/ats/public-jobs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * PHASE 104-B1 — the public careers list is DB-backed ONLY.
 *
 * The fixture fallback is gone: a search engine, a candidate and a test all
 * see the same truth. Eligibility is the ONE shared predicate
 * (`publicJobWhere` — OPEN + isPublic + published + unexpired + not deleted),
 * and a job appears in a locale only with a COMPLETE translation for that
 * locale. When the store is unreachable the route says so honestly (503) —
 * it neither invents an empty list nor serves invented vacancies.
 *
 * `Cache-Control: no-store` until an invalidation design exists: a cached
 * list that outlives a job's closingDate would advertise a vacancy that is
 * no longer real.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const department = searchParams.get("department") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const locale = searchParams.get("locale") ?? "en";

  const cards = await listPublicJobCards(locale, { department });
  if (cards === null) {
    return NextResponse.json(
      { error: "The careers service is temporarily unavailable." },
      { status: 503, headers: NO_STORE },
    );
  }

  let jobs = cards;
  if (search) {
    const q = search.toLowerCase();
    jobs = jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.departmentLabel.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q),
    );
  }

  return NextResponse.json({ jobs, total: jobs.length, source: "db" }, { headers: NO_STORE });
}

import { NextResponse }        from "next/server";
import { listApprovedVendors } from "@/lib/vendors/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q        = new URL(req.url).searchParams;
  const search   = q.get("search")   ?? undefined;
  const category = q.get("category") ?? undefined;
  const type     = q.get("type")     ?? undefined;
  const tier     = q.get("tier")     ?? undefined;
  const skip     = Number(q.get("skip")  ?? 0);
  const take     = Math.min(Number(q.get("take") ?? 30), 100);

  const vendors = await listApprovedVendors({ search, category, type, tier, skip, take });

  return NextResponse.json({
    vendors: vendors ?? [],
    total:   vendors?.length ?? 0,
    source:  vendors !== null ? "db" : "unavailable",
  });
}

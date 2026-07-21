import { NextResponse } from "next/server";
import { hasAuthoring } from "@/lib/auth/api-guards";
import { getDomainList } from "@/lib/services/domain-intelligence-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

const EMPTY_DOMAIN_LIST = { totalDomains: 0, domains: [] as [] };

/** GET /api/domains — list all domains with aggregate health statistics. */
export async function GET() {
  const storageMode = getStorageMode();
  // PHASE 90: domain intelligence aggregates the PRIVATE engineering memory
  // store and resolves Project names. Both canonical sources are authoring-only
  // since Phase 82C, so the aggregate view must match. Non-authoring callers
  // get the existing empty shape (200, unchanged contract).
  if (!(await hasAuthoring())) {
    return NextResponse.json({ storageMode, ...EMPTY_DOMAIN_LIST });
  }
  try {
    const result = await getDomainList();
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({ storageMode, ...EMPTY_DOMAIN_LIST });
  }
}

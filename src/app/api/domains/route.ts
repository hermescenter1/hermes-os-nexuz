import { NextResponse } from "next/server";
import { getDomainList } from "@/lib/services/domain-intelligence-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

const EMPTY_DOMAIN_LIST = { totalDomains: 0, domains: [] as [] };

/** GET /api/domains — list all domains with aggregate health statistics. */
export async function GET() {
  const storageMode = getStorageMode();
  try {
    const result = await getDomainList();
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({ storageMode, ...EMPTY_DOMAIN_LIST });
  }
}

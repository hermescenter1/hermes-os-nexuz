import { NextResponse } from "next/server";
import { getDomainByName } from "@/lib/services/domain-intelligence-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

/** GET /api/domains/[name] — detailed analytics for a single domain. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const storageMode = getStorageMode();
  try {
    const result = await getDomainByName(name);
    if (!result) {
      return NextResponse.json({ error: "domain_not_found" }, { status: 404 });
    }
    return NextResponse.json({ storageMode, ...result });
  } catch {
    return NextResponse.json({ error: "domain_not_found" }, { status: 404 });
  }
}

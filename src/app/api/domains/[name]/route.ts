import { NextResponse } from "next/server";
import { hasAuthoring } from "@/lib/auth/api-guards";
import { getDomainByName } from "@/lib/services/domain-intelligence-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

/** GET /api/domains/[name] — detailed analytics for a single domain. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const storageMode = getStorageMode();
  // PHASE 90: authoring-only (see the list route). A non-authoring caller gets
  // the same 404 as an unknown domain, disclosing nothing.
  if (!(await hasAuthoring())) {
    return NextResponse.json({ error: "domain_not_found" }, { status: 404 });
  }
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

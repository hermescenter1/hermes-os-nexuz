import { NextResponse }    from "next/server";
import { getVendorBySlug } from "@/lib/vendors/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const vendor = await getVendorBySlug(id);
  if (!vendor) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ vendor });
}

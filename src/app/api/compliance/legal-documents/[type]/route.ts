import { NextResponse }          from "next/server";
import { getLatestLegalDocument } from "@/lib/compliance/db";
import type { LegalDocumentType } from "@/lib/compliance/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const url      = new URL(req.url);
  const locale   = url.searchParams.get("locale") ?? "en";

  const doc = await getLatestLegalDocument(type.toUpperCase() as LegalDocumentType, locale);
  if (!doc) {
    return NextResponse.json({ error: "Document not found", document: null }, { status: 404 });
  }
  return NextResponse.json({ document: doc });
}

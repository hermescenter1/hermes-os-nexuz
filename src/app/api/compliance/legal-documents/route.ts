import { NextResponse }         from "next/server";
import type { NextRequest }      from "next/server";
import { verifyAccessToken }     from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }   from "@/lib/auth/config";
import {
  getAllLegalDocuments,
  createLegalDocument,
  publishLegalDocument,
} from "@/lib/compliance/db";
import type { LegalDocumentType } from "@/lib/compliance/types";

export async function GET(req: NextRequest) {
  const docs = await getAllLegalDocuments();
  return NextResponse.json({ documents: docs, total: docs.length });
}

export async function POST(req: NextRequest) {
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const payload = await verifyAccessToken(at);
  if (!payload || !["admin", "superadmin"].includes(payload.role as string)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json() as {
    documentType:   LegalDocumentType;
    version:        string;
    title:          string;
    content:        string;
    locale?:        string;
    effectiveDate?: string;
    publish?:       boolean;
  };

  if (!body.documentType || !body.version || !body.title || !body.content) {
    return NextResponse.json({ error: "documentType, version, title, content are required" }, { status: 400 });
  }

  const doc = await createLegalDocument({
    documentType:  body.documentType,
    version:       body.version,
    title:         body.title,
    content:       body.content,
    locale:        body.locale ?? "en",
    effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
    createdBy:     payload.sub,
  });
  if (!doc) return NextResponse.json({ error: "Failed to create document" }, { status: 500 });

  if (body.publish) {
    await publishLegalDocument(doc.id);
    return NextResponse.json({ document: { ...doc, isPublished: true } });
  }

  return NextResponse.json({ document: doc });
}

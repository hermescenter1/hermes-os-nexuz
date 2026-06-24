import { NextResponse } from "next/server";
import { getCertificateByToken, getCourseById } from "@/lib/academy/db";
import { getPrisma }     from "@/lib/db/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const cert = await getCertificateByToken(id);
  if (!cert) {
    return NextResponse.json({ error: "Certificate not found or invalid token" }, { status: 404 });
  }

  const course = await getCourseById(cert.courseId);

  // Resolve user name from User table
  const db = await getPrisma();
  let userName = "Unknown";
  if (db) {
    try {
      const userModel = (db as Record<string, unknown>).user as {
        findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
      };
      const user = await userModel.findUnique({ where: { id: cert.userId } });
      if (user) userName = String(user.name ?? "Unknown");
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    certificate: {
      id:                cert.id,
      certificateNumber: cert.certificateNumber,
      verificationToken: cert.verificationToken,
      issuedAt:          cert.issuedAt,
      expiresAt:         cert.expiresAt,
      metadata:          cert.metadata,
    },
    course: course ? {
      id:           course.id,
      title:        course.title,
      category:     course.category,
      level:        course.level,
      instructorName: course.instructorName,
    } : null,
    userName,
    valid: true,
  });
}

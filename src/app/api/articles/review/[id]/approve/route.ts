import { NextResponse }    from "next/server";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { getPrisma }       from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DB = {
  article: {
    findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
    update:     (a: unknown) => Promise<Record<string, unknown>>;
  };
  articleModerationEvent: { create: (a: unknown) => Promise<unknown> };
  articleEditorialReview: { create: (a: unknown) => Promise<unknown> };
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const db = await getPrisma();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const p = db as unknown as DB;

  const article = await p.article.findUnique({ where: { id } } as unknown);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const status = article.status as string;
  if (status !== "SUBMITTED" && status !== "IN_REVIEW") {
    return NextResponse.json(
      { error: "Article is not in a reviewable state", currentStatus: status },
      { status: 409 }
    );
  }

  const now = new Date();

  await Promise.all([
    p.article.update({
      where: { id },
      data: {
        status:          "PUBLISHED",
        visibility:      "PUBLIC",
        noIndex:         false,
        publishedAt:     now,
        rejectionReason: null,
      },
    } as unknown),
    p.articleModerationEvent.create({
      data: {
        articleId:   id,
        moderatorId: user.id,
        action:      "APPROVED",
        metadata:    {},
      },
    } as unknown),
    p.articleEditorialReview.create({
      data: {
        articleId:  id,
        reviewerId: user.id,
        verdict:    "APPROVED",
      },
    } as unknown),
  ]);

  return NextResponse.json({
    ok:      true,
    article: { id, status: "PUBLISHED", visibility: "PUBLIC", noIndex: false, publishedAt: now.toISOString() },
  });
}

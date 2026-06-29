import { NextResponse }    from "next/server";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { getPrisma }       from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hermes journal editorial policy (Phase 73 / rbac.ts line 143-146):
// review-queue, moderation, and editorial actions are admin/superadmin only.
// No "editor" role exists in the current auth system.
// can(role, "admin") covers both admin and superadmin via ROLE_CAPS.
// This is intentional temporary policy until a dedicated editorial role is introduced.
const canReview = (role: string | undefined | null) => can(role as never, "admin");

type TxDB = {
  article:                { update: (a: unknown) => Promise<Record<string, unknown>> };
  articleModerationEvent: { create: (a: unknown) => Promise<unknown> };
  articleEditorialReview: { create: (a: unknown) => Promise<unknown> };
};

type DB = {
  article: {
    findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  };
  $transaction: <T>(fn: (tx: TxDB) => Promise<T>) => Promise<T>;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user)                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canReview(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const db = await getPrisma();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  let reason: string | null = null;
  try {
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.reason === "string" && body.reason.trim()) {
      reason = body.reason.trim();
    }
  } catch { /* reason is optional — a rejection without feedback is valid */ }

  const p = db as unknown as DB;

  const article = await p.article.findUnique({ where: { id } } as unknown);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentStatus = article.status as string;
  if (currentStatus !== "SUBMITTED" && currentStatus !== "IN_REVIEW") {
    return NextResponse.json(
      { error: "Article is not in a reviewable state", currentStatus },
      { status: 409 }
    );
  }

  const slug = article.slug as string;

  try {
    await p.$transaction(async (tx) => {
      await tx.article.update({
        where: { id },
        data: {
          status:          "REJECTED",
          visibility:      "PRIVATE",
          noIndex:         true,
          rejectionReason: reason,
        },
      } as unknown);

      await tx.articleModerationEvent.create({
        data: {
          articleId:   id,
          moderatorId: user.id,
          action:      "REJECTED",
          reason:      reason ?? undefined,
          metadata:    {},
        },
      } as unknown);

      await tx.articleEditorialReview.create({
        data: {
          articleId:  id,
          reviewerId: user.id,
          verdict:    "REJECTED",
          feedback:   reason,
        },
      } as unknown);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[review/reject] articleId=${id} userId=${user.id} error=${msg}`);
    return NextResponse.json({ error: "Internal error during rejection." }, { status: 500 });
  }

  return NextResponse.json({
    ok:      true,
    article: {
      id,
      slug,
      status:     "REJECTED",
      visibility: "PRIVATE",
      noIndex:    true,
    },
    message: "Article rejected.",
  });
}

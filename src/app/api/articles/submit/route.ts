import { NextResponse }   from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma }      from "@/lib/db/prisma";
import type { ArtContentType, ArtLanguage, ArtStatus } from "@/lib/articles/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[؀-ۿ]+/g, (m) => m.replace(/\s+/g, "-"))
    .replace(/[^a-z0-9؀-ۿ-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "article";
}

function slug36(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function safeHandle(name: string): string {
  return (
    String(name ?? "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 32) || "author"
  ) + "-" + slug36();
}

type DbProfile = { id: string };
type DbArticle = { id: string; slug: string; status: ArtStatus };

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Please log in to submit." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title   = String(body.title   ?? "").trim();
  const content = String(body.content ?? "").trim();
  const action  = String(body.action  ?? "submit");

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 422 });
  }
  if (!content) {
    return NextResponse.json({ error: "Content is required." }, { status: 422 });
  }

  // Use shared singleton (PrismaPg adapter — required by Prisma 7 driverAdapters pattern)
  const db = await getPrisma();
  if (!db) {
    return NextResponse.json(
      { error: "Database unavailable. Contact support." },
      { status: 503 },
    );
  }

  const profileModel = (db as Record<string, unknown>).articleAuthorProfile as {
    findUnique: (a: unknown) => Promise<DbProfile | null>;
    create:    (a: unknown) => Promise<DbProfile>;
  };
  const articleModel = (db as Record<string, unknown>).article as {
    create: (a: unknown) => Promise<DbArticle>;
  };

  try {
    // Find or create author profile for this user
    let profile = await profileModel.findUnique({ where: { userId: user.id } });

    if (!profile) {
      profile = await profileModel.create({
        data: {
          userId:      user.id,
          handle:      safeHandle(user.name ?? ""),
          displayName: user.name || user.email,
        },
      });
    }

    const status: ArtStatus = action === "draft" ? "DRAFT" : "SUBMITTED";
    const uniqueSlug = `${toSlug(title)}-${slug36()}`;

    const article = await articleModel.create({
      data: {
        title,
        slug:           uniqueSlug,
        subtitle:       String(body.subtitle ?? "").trim() || undefined,
        excerpt:        String(body.excerpt  ?? "").trim() || undefined,
        content,
        contentType:    (String(body.contentType ?? "TECHNICAL_ARTICLE") as ArtContentType),
        language:       (String(body.language    ?? "EN") as ArtLanguage),
        seoTitle:       String(body.seoTitle ?? "").trim() || undefined,
        seoDescription: String(body.seoDesc  ?? "").trim() || undefined,
        status,
        visibility: "PRIVATE",
        noIndex:    true,
        authorId:   profile.id,
      },
    });

    return NextResponse.json({
      ok: true,
      article: {
        id:         article.id,
        slug:       article.slug,
        status:     article.status,
        visibility: "PRIVATE",
        noIndex:    true,
      },
      message: status === "DRAFT"
        ? "Draft saved successfully."
        : "Article submitted for review.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/articles/submit] persist error | user:", user.id, "| action:", action, "| error:", msg);
    return NextResponse.json(
      { error: "Failed to save article. Please try again." },
      { status: 500 },
    );
  }
}

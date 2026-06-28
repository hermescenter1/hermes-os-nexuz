import { NextResponse }    from "next/server";
import { getCurrentUser }  from "@/lib/auth/session";
import type { ArtContentType, ArtLanguage, ArtStatus } from "@/lib/articles/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[؀-ۿ]+/g, (m) => m.replace(/\s+/g, "-")) // keep Persian chars
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
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 32) || "author"
  ) + "-" + slug36();
}

type DbProfile = { id: string };
type DbArticle = { id: string; slug: string; status: ArtStatus };

type Db = {
  articleAuthorProfile: {
    findUnique: (a: unknown) => Promise<DbProfile | null>;
    create:    (a: unknown) => Promise<DbProfile>;
  };
  article: {
    create: (a: unknown) => Promise<DbArticle>;
  };
  $disconnect: () => Promise<void>;
};

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

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database unavailable. Contact support." },
      { status: 503 },
    );
  }

  let db: Db | null = null;
  try {
    const { PrismaClient } = await import("@prisma/client");
    db = new PrismaClient() as unknown as Db;
  } catch {
    return NextResponse.json({ error: "Database connection failed." }, { status: 503 });
  }

  try {
    // Find or create author profile for this user
    let profile = await db.articleAuthorProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      profile = await db.articleAuthorProfile.create({
        data: {
          userId:      user.id,
          handle:      safeHandle(user.name),
          displayName: user.name,
        },
      });
    }

    const status: ArtStatus = action === "draft" ? "DRAFT" : "SUBMITTED";
    const uniqueSlug = `${toSlug(title)}-${slug36()}`;

    const article = await db.article.create({
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
        /* Submitted/draft articles are PRIVATE until an admin publishes them */
        visibility: "PRIVATE",
        noIndex:    true,
        authorId:   profile.id,
      },
    });

    return NextResponse.json({
      article: { id: article.id, slug: article.slug, status: article.status },
    });
  } catch (err) {
    console.error("[api/articles/submit]", err);
    return NextResponse.json(
      { error: "Failed to save article. Please try again." },
      { status: 500 },
    );
  } finally {
    await db.$disconnect();
  }
}

import { NextResponse }   from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join }             from "path";
import { randomBytes }      from "crypto";
import { getCurrentUser }   from "@/lib/auth/session";
import { getPrisma }        from "@/lib/db/prisma";
import { notifyAuthorProfileLifecycle } from "@/lib/seo/indexnow-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXT  = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_BYTES    = 2 * 1024 * 1024; // 2MB

function safeName(mime: string): string {
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  return randomBytes(16).toString("hex") + "." + ext;
}

function uploadsDir(): string {
  // process.cwd() is /app in Docker standalone, project root in dev
  return join(process.cwd(), "public", "uploads", "authors");
}

type DbProfile = { id: string; userId: string; avatarUrl: string | null; handle?: string | null };

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart request." }, { status: 400 });
  }

  const file = formData.get("avatar");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const mime = file.type.toLowerCase().trim();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: "Invalid file type. JPG, PNG, or WebP only." }, { status: 400 });
  }

  // Validate extension (double-check, never trust original filename)
  const originalExt = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXT.has(originalExt) && originalExt !== "") {
    // Extension mismatch is non-fatal — we use MIME for ext, not filename
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum 2MB." }, { status: 400 });
  }

  const db = await getPrisma();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const profileModel = (db as Record<string, unknown>).articleAuthorProfile as {
    findUnique: (a: unknown) => Promise<DbProfile | null>;
    update:    (a: unknown) => Promise<DbProfile>;
  };

  let profile: DbProfile | null;
  try {
    profile = await profileModel.findUnique({ where: { userId: user.id } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/avatar] profile lookup error | user:", user.id, "| err:", msg);
    return NextResponse.json({ error: "Failed to locate author profile." }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Author profile not found." }, { status: 404 });
  }

  const filename  = safeName(mime);
  const uploadDir = uploadsDir();
  const filePath  = join(uploadDir, filename);
  const publicUrl = `/uploads/authors/${filename}`;

  try {
    await writeFile(filePath, Buffer.from(bytes));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/avatar] write error | user:", user.id, "| path:", uploadDir, "| err:", msg);
    return NextResponse.json({ error: "Failed to save file. Check upload directory permissions." }, { status: 500 });
  }

  // Delete previous avatar file (best-effort; ignore errors)
  if (profile.avatarUrl) {
    const prev = profile.avatarUrl;
    if (prev.startsWith("/uploads/authors/")) {
      const prevName = prev.split("/").pop() ?? "";
      if (/^[0-9a-f]{32}\.(jpg|png|webp)$/.test(prevName)) {
        unlink(join(uploadDir, prevName)).catch(() => {});
      }
    }
  }

  try {
    await profileModel.update({
      where: { id: profile.id },
      data:  { avatarUrl: publicUrl },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/avatar] db update error | user:", user.id, "| err:", msg);
    // File was written — try to clean it up
    unlink(filePath).catch(() => {});
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }

  // 87L.6B: the public author page changed — announce it (fire-and-forget,
  // inert in tests/dev, never affects the response above this line).
  if (profile.handle) notifyAuthorProfileLifecycle(profile.handle);

  return NextResponse.json({ ok: true, avatarUrl: publicUrl, message: "Profile photo updated." });
}

export async function DELETE(_req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const db = await getPrisma();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const profileModel = (db as Record<string, unknown>).articleAuthorProfile as {
    findUnique: (a: unknown) => Promise<DbProfile | null>;
    update:    (a: unknown) => Promise<DbProfile>;
  };

  let profile: DbProfile | null;
  try {
    profile = await profileModel.findUnique({ where: { userId: user.id } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/avatar] delete profile lookup error | user:", user.id, "| err:", msg);
    return NextResponse.json({ error: "Failed to locate author profile." }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Author profile not found." }, { status: 404 });
  }

  const prev = profile.avatarUrl;

  try {
    await profileModel.update({
      where: { id: profile.id },
      data:  { avatarUrl: null },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/avatar] db clear error | user:", user.id, "| err:", msg);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }

  // Best-effort file cleanup
  if (prev && prev.startsWith("/uploads/authors/")) {
    const prevName = prev.split("/").pop() ?? "";
    if (/^[0-9a-f]{32}\.(jpg|png|webp)$/.test(prevName)) {
      unlink(join(uploadsDir(), prevName)).catch(() => {});
    }
  }

  // 87L.6B: the public author page changed — announce it (fire-and-forget)
  if (profile.handle) notifyAuthorProfileLifecycle(profile.handle);

  return NextResponse.json({ ok: true, avatarUrl: null, message: "Profile photo removed." });
}

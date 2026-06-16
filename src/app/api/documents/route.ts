import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { documentRepository } from "@/lib/documents/document-repository";
import { getDocumentObjectStorage } from "@/lib/documents/object-storage";
import { getDocumentStorageProvider } from "@/lib/documents/config";
import {
  validateTitle,
  validateSourceType,
  validateFilename,
  validateFileType,
  validateFileSize,
  extensionOf,
  parseTags,
} from "@/lib/documents/validation";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { can } from "@/lib/auth/roles";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";
import type { DocumentSourceType } from "@/lib/documents/types";

/**
 * /api/documents (Phase 16B).
 *
 * POST: upload a document (multipart/form-data) — admin-only.
 * GET: list document metadata — admin-only.
 *
 * Admin-only on BOTH, by explicit design choice (stricter than the
 * existing `/api/cases`/`/api/knowledge` routes, which currently have no
 * server-side capability check at all and rely only on their pages'
 * `RequireCapability` wrapper). File upload is a more consequential action
 * than authoring a text record, so this route enforces `can(role, "admin")`
 * itself — never relying solely on the admin page wrapper.
 *
 * No PDF extraction, chunking, embedding, or RAG indexing happens here —
 * this route only validates, stores the raw file, and records metadata.
 */

async function requireAdmin(): Promise<
  { ok: true; userId: string | null } | { ok: false; status: number; error: string }
> {
  if (!isAuthConfigured()) {
    return { ok: false, status: 403, error: "auth not configured" };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  if (!can(user.role, "admin")) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, userId: user.id };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const documents = await documentRepository().list();
    return NextResponse.json({ storageMode: getStorageMode(), documents });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), documents: [] });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  const title = String(form.get("title") ?? "");
  const sourceType = String(form.get("sourceType") ?? "");
  const vendor = String(form.get("vendor") ?? "").trim();
  const domain = String(form.get("domain") ?? "").trim();
  const tagsRaw = String(form.get("tags") ?? "");

  // Validate everything BEFORE touching the filesystem or the database.
  for (const result of [
    validateTitle(title),
    validateSourceType(sourceType),
    validateFilename(file.name),
    validateFileType(file.type, file.name),
    validateFileSize(file.size),
  ]) {
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "file_read_failed" }, { status: 400 });
  }
  // Re-check the actual byte length against the declared size — a
  // mismatched/truncated upload is rejected rather than trusted.
  const sizeCheck = validateFileSize(buf.length);
  if (!sizeCheck.ok) return NextResponse.json({ error: sizeCheck.reason }, { status: 400 });

  const contentHash = createHash("sha256").update(buf).digest("hex");
  const provider = getDocumentStorageProvider();
  const repo = documentRepository();

  // Create the metadata row first (storageKey is a placeholder) so the
  // real storage key can be derived from the Document's own generated id
  // — the id is never known before create(), and the storage key must
  // never be derived from the client-supplied filename (path-traversal
  // risk; see object-storage.ts).
  let doc = await repo.create({
    title: title.trim(),
    sourceType: sourceType as DocumentSourceType,
    originalFilename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buf.length,
    storageProvider: provider,
    storageKey: "",
    contentHash,
    metadata: {
      ...(vendor ? { vendor } : {}),
      ...(domain ? { domain } : {}),
      tags: parseTags(tagsRaw),
    },
    chunkCount: 0,
    status: "uploaded",
  });

  const ext = extensionOf(file.name);
  const storageKey = `documents/${doc.id}/original${ext ? `.${ext}` : ""}`;

  try {
    await getDocumentObjectStorage().put({ key: storageKey, body: buf, contentType: file.type });
    doc = (await repo.update(doc.id, { storageKey })) ?? doc;
  } catch {
    // Never let a storage-provider error (including "minio"/"s3" not
    // being implemented yet) leak its raw message to the client — record
    // a safe, enumerated reason on the row instead.
    doc = (await repo.update(doc.id, { status: "failed", error: "storage_write_failed" })) ?? doc;
    await recordAuditEvent({
      userId: auth.userId,
      action: AUDIT_ACTIONS.DOCUMENT_UPLOAD_FAILED,
      entityType: "document",
      entityId: doc.id,
      metadata: { title: doc.title, reason: "storage_write_failed" },
    });
    return NextResponse.json(
      { storageMode: getStorageMode(), document: doc, error: "storage_write_failed" },
      { status: 502 }
    );
  }

  await recordAuditEvent({
    userId: auth.userId,
    action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
    entityType: "document",
    entityId: doc.id,
    metadata: { title: doc.title, sourceType: doc.sourceType, sizeBytes: doc.sizeBytes },
  });

  return NextResponse.json({ storageMode: getStorageMode(), document: doc }, { status: 201 });
}

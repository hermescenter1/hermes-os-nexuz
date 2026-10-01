import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { documentRepositoryForOrganization } from "@/lib/documents/document-repository";
import { decodeDocumentListCursor } from "@/lib/documents/list-cursor";
import { getDocumentObjectStorage } from "@/lib/documents/object-storage";
import { getDocumentStorageProvider } from "@/lib/documents/config";
import {
  validateTitle,
  validateSourceType,
  validateFilename,
  validateFileType,
  validateFileSize,
  validateFileSignature,
  canonicalDocumentMimeType,
  extensionOf,
  parseTags,
} from "@/lib/documents/validation";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor, orgActorRefusalCode } from "@/lib/org/context";
import { requirePermission } from "@/lib/org/rbac";
import { requireTrustedOrigin } from "@/lib/security/request-guards";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";
import type { DocumentSourceType } from "@/lib/documents/types";

/**
 * /api/documents (Phase 16B; F-2 tenant ownership).
 *
 * POST: upload a document (multipart/form-data) into the caller's organization.
 * GET: list the caller's organization's documents — one bounded page
 *      (`?limit=` default 50, max 100) plus an opaque `nextCursor`
 *      (`?cursor=`; keyset on createdAt/id, see list-cursor.ts). The first
 *      page (no cursor) also carries `stats` — total / indexed / failed for
 *      the whole organization library, independent of paging.
 *
 * F-2: both handlers run the org guard chain — `requirePlatformAuth` (the
 * active, unambiguous organization resolved server-side) → `requireOrgActor`
 * (proven membership) → `requirePermission` (`view_documents` /
 * `manage_documents`). The owning organization and the uploader are taken
 * ONLY from that server context; any `tenantId`, `organizationId` or
 * `uploadedBy` field in the request is never read. A platform admin gets no
 * access to an organization's documents unless they are an ACTIVE member with
 * the permission — there is no admin bypass on this route.
 *
 * No PDF extraction, chunking, embedding, or RAG indexing happens here —
 * this route only validates, stores the raw file, and records metadata.
 */

export const dynamic = "force-dynamic";

function refuse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return refuse(auth.status, auth.code);
  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return refuse(member.status, orgActorRefusalCode(member.status));
  const perm = requirePermission(member.ctx.role, "view_documents");
  if (!perm.ok) return refuse(perm.status, "forbidden");
  const orgId = member.ctx.orgId;

  const params = new URL(req.url).searchParams;
  const requested = Number(params.get("limit"));
  const rawCursor = params.get("cursor");
  const cursor = rawCursor === null ? null : decodeDocumentListCursor(rawCursor);
  if (rawCursor !== null && !cursor) return refuse(400, "invalid_cursor");
  try {
    const repo = documentRepositoryForOrganization(orgId);
    // The whole-library figures come from the server with the FIRST page only
    // (a later page carries no stats): the page shows totals for the library,
    // never counts of whatever happens to be loaded.
    const [page, stats] = await Promise.all([
      repo.listPage({
        limit: Number.isFinite(requested) && requested > 0 ? requested : undefined,
        cursor,
      }),
      cursor ? Promise.resolve(undefined) : repo.stats(),
    ]);
    return NextResponse.json({
      storageMode: getStorageMode(),
      documents: page.documents,
      nextCursor: page.nextCursor,
      ...(stats ? { stats } : {}),
    });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), documents: [], nextCursor: null });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return refuse(auth.status, auth.code);
  const originGate = requireTrustedOrigin(req, auth.ctx.authMethod);
  if (!originGate.ok) return refuse(403, "forbidden");
  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return refuse(member.status, orgActorRefusalCode(member.status));
  const perm = requirePermission(member.ctx.role, "manage_documents");
  if (!perm.ok) return refuse(perm.status, "forbidden");
  const orgId = member.ctx.orgId;
  const uploaderId = member.ctx.userId;

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
  // F-2: the bytes must match the extension (magic bytes / UTF-8 text). The
  // declared MIME type is client-controlled and never trusted on its own.
  const signatureCheck = validateFileSignature(file.name, buf);
  if (!signatureCheck.ok) return NextResponse.json({ error: signatureCheck.reason }, { status: 400 });
  const mimeType = canonicalDocumentMimeType(file.name);

  const contentHash = createHash("sha256").update(buf).digest("hex");
  const provider = getDocumentStorageProvider();
  const repo = documentRepositoryForOrganization(orgId);

  // Create the metadata row first (storageKey is a placeholder) so the
  // real storage key can be derived from the Document's own generated id
  // — the id is never known before create(), and the storage key must
  // never be derived from the client-supplied filename (path-traversal
  // risk; see object-storage.ts). The tenant is fixed by the scoped
  // repository; the uploader is the proven org member.
  let doc = await repo.create({
    title: title.trim(),
    sourceType: sourceType as DocumentSourceType,
    originalFilename: file.name,
    mimeType,
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
    uploadedBy: uploaderId,
  });

  const ext = extensionOf(file.name);
  const storageKey = `documents/${doc.id}/original${ext ? `.${ext}` : ""}`;

  try {
    await getDocumentObjectStorage().put({ key: storageKey, body: buf, contentType: mimeType });
    doc = (await repo.update(doc.id, { storageKey })) ?? doc;
  } catch {
    // Never let a storage-provider error (including "minio"/"s3" not
    // being implemented yet) leak its raw message to the client — record
    // a safe, enumerated reason on the row instead.
    doc = (await repo.update(doc.id, { status: "failed", error: "storage_write_failed" })) ?? doc;
    await recordAuditEvent({
      userId: uploaderId,
      organizationId: orgId,
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
    userId: uploaderId,
    organizationId: orgId,
    action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
    entityType: "document",
    entityId: doc.id,
    metadata: { title: doc.title, sourceType: doc.sourceType, sizeBytes: doc.sizeBytes },
  });

  return NextResponse.json({ storageMode: getStorageMode(), document: doc }, { status: 201 });
}

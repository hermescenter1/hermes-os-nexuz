// Phase 69 — EDMS service layer (Prisma + mock fallback)

import { getPrisma } from "@/lib/db/prisma";
import {
  MOCK_DOCUMENTS, MOCK_FOLDERS, MOCK_CATEGORIES, MOCK_TEMPLATES,
  MOCK_RETENTION_POLICIES, MOCK_REVISIONS, MOCK_APPROVALS, MOCK_COMMENTS,
  MOCK_TAGS, MOCK_AUDIT, MOCK_ATTACHMENTS, MOCK_METADATA, MOCK_FAVORITES,
  MOCK_CHECKOUTS, MOCK_SHARES, PENDING_APPROVALS, ACTIVE_CHECKOUTS,
  getMockDocumentFull, getMockFolderFull,
} from "./mock-data";
import { searchDocumentsMock, type EdmsSearchParams } from "./search";
import type {
  EdmsDocument, EdmsDocumentFull, EdmsFolder, EdmsFolderFull,
  EdmsCategory, EdmsTemplate, EdmsRetentionPolicy, EdmsRevision,
  EdmsApproval, EdmsComment, EdmsFavorite, EdmsCheckout, EdmsShare,
  EdmsMetadata, EdmsAudit, EdmsDashboard, EdmsSearchResult,
} from "./types";

type AnyM = Record<string, (...a: unknown[]) => Promise<unknown>>;

async function m() {
  try {
    const db = await getPrisma();
    if (!db) return null;
    const d = db as Record<string, unknown>;
    return {
      doc:    d.edmsDocument         as AnyM | undefined,
      folder: d.edmsFolder           as AnyM | undefined,
      cat:    d.edmsCategory         as AnyM | undefined,
      tpl:    d.edmsTemplate         as AnyM | undefined,
      ret:    d.edmsRetentionPolicy  as AnyM | undefined,
      rev:    d.edmsRevision         as AnyM | undefined,
      apr:    d.edmsApproval         as AnyM | undefined,
      cmt:    d.edmsComment          as AnyM | undefined,
      tag:    d.edmsTag              as AnyM | undefined,
      fav:    d.edmsFavorite         as AnyM | undefined,
      co:     d.edmsCheckout         as AnyM | undefined,
      share:  d.edmsShare            as AnyM | undefined,
      meta:   d.edmsMetadata         as AnyM | undefined,
      audit:  d.edmsAudit            as AnyM | undefined,
      attach: d.edmsAttachment       as AnyM | undefined,
    };
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const iso = (v: unknown): string => v instanceof Date ? v.toISOString() : String(v ?? "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ts  = (r: any): any => ({
  ...r,
  createdAt: r?.createdAt ? iso(r.createdAt) : undefined,
  updatedAt: r?.updatedAt ? iso(r.updatedAt) : undefined,
  lockedAt:  r?.lockedAt  ? iso(r.lockedAt)  : r?.lockedAt,
  decidedAt: r?.decidedAt ? iso(r.decidedAt) : r?.decidedAt,
  dueDate:   r?.dueDate   ? iso(r.dueDate)   : r?.dueDate,
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDocumentDashboard(): Promise<EdmsDashboard> {
  const db = await m();
  try {
    if (db?.doc) {
      // Prisma path — not implemented fully; fall through to mock
    }
  } catch { /* fallthrough */ }

  const docs    = MOCK_DOCUMENTS.filter(d => !d.deletedAt);
  const byStatus = {} as Record<string, number>;
  const byType   = {} as Record<string, number>;
  docs.forEach(d => {
    byStatus[d.status]       = (byStatus[d.status]       ?? 0) + 1;
    byType[d.documentType]   = (byType[d.documentType]   ?? 0) + 1;
  });

  return {
    totalDocuments:    docs.length,
    draftCount:        byStatus["DRAFT"]    ?? 0,
    reviewCount:       byStatus["REVIEW"]   ?? 0,
    approvedCount:     byStatus["APPROVED"] ?? 0,
    rejectedCount:     byStatus["REJECTED"] ?? 0,
    archivedCount:     byStatus["ARCHIVED"] ?? 0,
    pendingApprovals:  PENDING_APPROVALS.length,
    activeCheckouts:   ACTIVE_CHECKOUTS.length,
    recentDocuments:   docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8),
    recentAudit:       MOCK_AUDIT.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
    documentsByStatus: byStatus,
    documentsByType:   byType,
  };
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function getDocuments(params?: { status?: string; folderId?: string; categoryId?: string }): Promise<EdmsDocument[]> {
  const db = await m();
  try {
    if (db?.doc) {
      const where: Record<string, unknown> = { deletedAt: null };
      if (params?.status)     where["status"]     = params.status;
      if (params?.folderId)   where["folderId"]   = params.folderId;
      if (params?.categoryId) where["categoryId"] = params.categoryId;
      const rows = await db.doc.findMany({ where, orderBy: { updatedAt: "desc" } } as never) as EdmsDocument[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }

  let docs = MOCK_DOCUMENTS.filter(d => !d.deletedAt);
  if (params?.status)     docs = docs.filter(d => d.status === params.status);
  if (params?.folderId)   docs = docs.filter(d => d.folderId === params.folderId);
  if (params?.categoryId) docs = docs.filter(d => d.categoryId === params.categoryId);
  return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDocumentById(id: string): Promise<EdmsDocumentFull | null> {
  const db = await m();
  try {
    if (db?.doc) {
      const row = await db.doc.findUnique({
        where:   { id },
        include: { revisions: true, approvals: true, comments: true, tags: true, links: true, attachments: true, metadata: true, audit: { orderBy: { createdAt: "desc" }, take: 20 } },
      } as never) as EdmsDocumentFull | null;
      return row ? ts(row) : null;
    }
  } catch { /* fallthrough */ }

  return getMockDocumentFull(id);
}

export async function createDocument(data: Partial<EdmsDocument> & { title: string }): Promise<EdmsDocument | null> {
  const db = await m();
  try {
    if (db?.doc) {
      const row = await db.doc.create({ data: { ...data, keywords: data.keywords ?? [] } } as never) as EdmsDocument;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

export async function updateDocument(id: string, data: Partial<EdmsDocument>): Promise<EdmsDocument | null> {
  const db = await m();
  try {
    if (db?.doc) {
      const row = await db.doc.update({ where: { id }, data } as never) as EdmsDocument;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  const doc = MOCK_DOCUMENTS.find(d => d.id === id);
  return doc ? { ...doc, ...data } : null;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const db = await m();
  try {
    if (db?.doc) {
      await db.doc.update({ where: { id }, data: { deletedAt: new Date() } } as never);
      return true;
    }
  } catch { /* fallthrough */ }
  return false;
}

export async function searchDocuments(params: EdmsSearchParams): Promise<EdmsSearchResult> {
  // Full-text search requires DB; mock uses in-memory filter
  return searchDocumentsMock(params);
}

// ── Folders ───────────────────────────────────────────────────────────────────

export async function getFolders(parentId?: string): Promise<EdmsFolder[]> {
  const db = await m();
  try {
    if (db?.folder) {
      const where = { deletedAt: null, parentId: parentId ?? null };
      const rows = await db.folder.findMany({ where, orderBy: { name: "asc" } } as never) as EdmsFolder[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }

  let folders = MOCK_FOLDERS.filter(f => !f.deletedAt);
  if (parentId !== undefined) folders = folders.filter(f => f.parentId === parentId);
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFolderById(id: string): Promise<EdmsFolderFull | null> {
  const db = await m();
  try {
    if (db?.folder) {
      const folder = await db.folder.findUnique({ where: { id } } as never) as EdmsFolder | null;
      if (!folder) return null;
      const children  = await db.folder.findMany({ where: { parentId: id } } as never) as EdmsFolder[];
      const documents = await db.doc?.findMany({ where: { folderId: id, deletedAt: null } } as never) as EdmsDocument[] ?? [];
      return ts({ ...folder, children: children.map(ts), documents: documents.map(ts) });
    }
  } catch { /* fallthrough */ }
  return getMockFolderFull(id);
}

export async function createFolder(data: Partial<EdmsFolder> & { name: string }): Promise<EdmsFolder | null> {
  const db = await m();
  try {
    if (db?.folder) {
      const row = await db.folder.create({ data } as never) as EdmsFolder;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function getCategories(): Promise<EdmsCategory[]> {
  const db = await m();
  try {
    if (db?.cat) {
      const rows = await db.cat.findMany({ orderBy: { name: "asc" } } as never) as EdmsCategory[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  return MOCK_CATEGORIES.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function getTemplates(): Promise<EdmsTemplate[]> {
  const db = await m();
  try {
    if (db?.tpl) {
      const rows = await db.tpl.findMany({ where: { isActive: true }, orderBy: { name: "asc" } } as never) as EdmsTemplate[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  return MOCK_TEMPLATES.filter(t => t.isActive).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Retention ─────────────────────────────────────────────────────────────────

export async function getRetentionPolicies(): Promise<EdmsRetentionPolicy[]> {
  const db = await m();
  try {
    if (db?.ret) {
      const rows = await db.ret.findMany({ where: { isActive: true } } as never) as EdmsRetentionPolicy[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  return MOCK_RETENTION_POLICIES.filter(r => r.isActive);
}

// ── Revisions ─────────────────────────────────────────────────────────────────

export async function getRevisions(documentId?: string): Promise<EdmsRevision[]> {
  const db = await m();
  try {
    if (db?.rev) {
      const where = documentId ? { documentId } : {};
      const rows = await db.rev.findMany({ where, orderBy: { createdAt: "desc" } } as never) as EdmsRevision[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let revs = [...MOCK_REVISIONS];
  if (documentId) revs = revs.filter(r => r.documentId === documentId);
  return revs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createRevision(data: Partial<EdmsRevision> & { documentId: string; revisionNumber: string }): Promise<EdmsRevision | null> {
  const db = await m();
  try {
    if (db?.rev) {
      const row = await db.rev.create({ data } as never) as EdmsRevision;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export async function getApprovals(status?: string, documentId?: string): Promise<EdmsApproval[]> {
  const db = await m();
  try {
    if (db?.apr) {
      const where: Record<string, unknown> = {};
      if (status)     where["status"]     = status;
      if (documentId) where["documentId"] = documentId;
      const rows = await db.apr.findMany({ where, orderBy: { createdAt: "desc" } } as never) as EdmsApproval[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let aprs = [...MOCK_APPROVALS];
  if (status)     aprs = aprs.filter(a => a.status === status);
  if (documentId) aprs = aprs.filter(a => a.documentId === documentId);
  return aprs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateApproval(id: string, data: Partial<EdmsApproval>): Promise<EdmsApproval | null> {
  const db = await m();
  try {
    if (db?.apr) {
      const row = await db.apr.update({ where: { id }, data } as never) as EdmsApproval;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  const apr = MOCK_APPROVALS.find(a => a.id === id);
  return apr ? { ...apr, ...data } : null;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(documentId?: string): Promise<EdmsComment[]> {
  const db = await m();
  try {
    if (db?.cmt) {
      const where = documentId ? { documentId } : {};
      const rows = await db.cmt.findMany({ where, orderBy: { createdAt: "desc" } } as never) as EdmsComment[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let cmts = [...MOCK_COMMENTS];
  if (documentId) cmts = cmts.filter(c => c.documentId === documentId);
  return cmts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createComment(data: Partial<EdmsComment> & { documentId: string; content: string }): Promise<EdmsComment | null> {
  const db = await m();
  try {
    if (db?.cmt) {
      const row = await db.cmt.create({ data } as never) as EdmsComment;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Favorites ─────────────────────────────────────────────────────────────────

export async function getFavorites(userId?: string): Promise<EdmsFavorite[]> {
  const db = await m();
  try {
    if (db?.fav) {
      const where = userId ? { userId } : {};
      const rows = await db.fav.findMany({ where, orderBy: { createdAt: "desc" }, include: { document: true } } as never) as EdmsFavorite[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let favs = [...MOCK_FAVORITES];
  if (userId) favs = favs.filter(f => f.userId === userId);
  return favs;
}

export async function toggleFavorite(documentId: string, userId: string): Promise<{ favorited: boolean }> {
  const db = await m();
  try {
    if (db?.fav) {
      const existing = await db.fav.findFirst({ where: { documentId, userId } } as never);
      if (existing) {
        await db.fav.delete({ where: { id: (existing as { id: string }).id } } as never);
        return { favorited: false };
      }
      await db.fav.create({ data: { documentId, userId } } as never);
      return { favorited: true };
    }
  } catch { /* fallthrough */ }
  const isFav = MOCK_FAVORITES.some(f => f.documentId === documentId && f.userId === userId);
  return { favorited: !isFav };
}

// ── Shares ────────────────────────────────────────────────────────────────────

export async function getShares(documentId?: string): Promise<EdmsShare[]> {
  const db = await m();
  try {
    if (db?.share) {
      const where = documentId ? { documentId } : {};
      const rows = await db.share.findMany({ where, orderBy: { createdAt: "desc" } } as never) as EdmsShare[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let shares = [...MOCK_SHARES];
  if (documentId) shares = shares.filter(s => s.documentId === documentId);
  return shares;
}

export async function createShare(data: Partial<EdmsShare> & { documentId: string; sharedWith: string }): Promise<EdmsShare | null> {
  const db = await m();
  try {
    if (db?.share) {
      const row = await db.share.create({ data } as never) as EdmsShare;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function getMetadata(documentId?: string): Promise<EdmsMetadata[]> {
  const db = await m();
  try {
    if (db?.meta) {
      const where = documentId ? { documentId } : {};
      const rows = await db.meta.findMany({ where } as never) as EdmsMetadata[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let meta = [...MOCK_METADATA];
  if (documentId) meta = meta.filter(m => m.documentId === documentId);
  return meta;
}

export async function upsertMetadata(documentId: string, key: string, value: string): Promise<EdmsMetadata | null> {
  const db = await m();
  try {
    if (db?.meta) {
      const row = await db.meta.upsert({
        where:  { id: `${documentId}-${key}` },
        create: { documentId, key, value },
        update: { value },
      } as never) as EdmsMetadata;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export async function getAuditLog(documentId?: string, userId?: string): Promise<EdmsAudit[]> {
  const db = await m();
  try {
    if (db?.audit) {
      const where: Record<string, unknown> = {};
      if (documentId) where["documentId"] = documentId;
      if (userId)     where["userId"]     = userId;
      const rows = await db.audit.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 } as never) as EdmsAudit[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let logs = [...MOCK_AUDIT];
  if (documentId) logs = logs.filter(a => a.documentId === documentId);
  if (userId)     logs = logs.filter(a => a.userId === userId);
  return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}

export async function createAuditEntry(data: Partial<EdmsAudit> & { documentId: string; action: string }): Promise<void> {
  const db = await m();
  try {
    if (db?.audit) {
      await db.audit.create({ data } as never);
    }
  } catch { /* no-op */ }
}

// ── Checkouts ─────────────────────────────────────────────────────────────────

export async function getCheckouts(documentId?: string): Promise<EdmsCheckout[]> {
  const db = await m();
  try {
    if (db?.co) {
      const where = documentId ? { documentId } : {};
      const rows = await db.co.findMany({ where } as never) as EdmsCheckout[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let checkouts = [...MOCK_CHECKOUTS];
  if (documentId) checkouts = checkouts.filter(c => c.documentId === documentId);
  return checkouts;
}

export async function checkoutDocument(documentId: string, userId: string): Promise<EdmsCheckout | null> {
  const db = await m();
  try {
    if (db?.co) {
      const row = await db.co.create({ data: { documentId, userId } } as never) as EdmsCheckout;
      if (db?.doc) {
        await db.doc.update({ where: { id: documentId }, data: { isLocked: true, lockedBy: userId, lockedAt: new Date() } } as never);
      }
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

export async function checkinDocument(checkoutId: string): Promise<boolean> {
  const db = await m();
  try {
    if (db?.co) {
      const co = await db.co.findUnique({ where: { id: checkoutId } } as never) as EdmsCheckout | null;
      if (!co) return false;
      await db.co.update({ where: { id: checkoutId }, data: { checkedInAt: new Date() } } as never);
      if (db?.doc) {
        await db.doc.update({ where: { id: co.documentId }, data: { isLocked: false, lockedBy: null, lockedAt: null } } as never);
      }
      return true;
    }
  } catch { /* fallthrough */ }
  return false;
}

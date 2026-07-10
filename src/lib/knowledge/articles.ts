/**
 * IndustrialKnowledgeArticle CRUD + AssetKnowledgeLink management — Phase 40.
 *
 * SECURITY: Content is stored as-is (plain text / markdown). The rendering layer
 * (React) is responsible for escaping or sanitizing before display to prevent
 * stored XSS. Never render article.content as raw HTML without sanitization.
 *
 * AssetKnowledgeLink integrity: exactly ONE of (articleId, failureModeId,
 * procedureId, caseId) must be non-null. Validated here at the service level;
 * also enforced by DB CHECK constraint in migration SQL.
 */

import { getPrisma }        from "@/lib/db/prisma";
import { normalizeText }    from "./normalize";
import { KNOWLEDGE_ENGINE_VERSION } from "./types";
import type { ArticleRecord, AssetKnowledgeLinkRecord } from "./types";

type ArtModel = {
  create:     (a: unknown) => Promise<Record<string, unknown>>;
  findMany:   (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst:  (a: unknown) => Promise<Record<string, unknown> | null>;
  update:     (a: unknown) => Promise<Record<string, unknown>>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  delete:     (a: unknown) => Promise<Record<string, unknown>>;
};
type LinkModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  delete:   (a: unknown) => Promise<Record<string, unknown>>;
};

function rowToArticle(r: Record<string, unknown>): ArticleRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    categoryId:     (r.categoryId    ?? null) as string | null,
    title:          r.title          as string,
    titleNorm:      r.titleNorm      as string,
    summary:        r.summary        as string,
    content:        r.content        as string,
    keywords:       (r.keywords      as string[]) ?? [],
    sourceType:     r.sourceType     as ArticleRecord["sourceType"],
    version:        r.version        as number,
    status:         r.status         as string,
    authorId:       (r.authorId      ?? null) as string | null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
}

function rowToLink(r: Record<string, unknown>): AssetKnowledgeLinkRecord {
  return {
    id:             r.id             as string,
    organizationId: r.organizationId as string,
    assetId:        r.assetId        as string,
    articleId:      (r.articleId     ?? null) as string | null,
    failureModeId:  (r.failureModeId ?? null) as string | null,
    procedureId:    (r.procedureId   ?? null) as string | null,
    caseId:         (r.caseId        ?? null) as string | null,
    notes:          (r.notes         ?? null) as string | null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
  };
}

async function artModel(): Promise<ArtModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).industrialKnowledgeArticle as ArtModel) : null;
}
async function linkModel(): Promise<LinkModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).assetKnowledgeLink as LinkModel) : null;
}

export async function listArticles(
  organizationId: string,
  status?:        string,
  limit           = 50,
): Promise<ArticleRecord[]> {
  const m = await artModel();
  if (!m) return [];
  try {
    const where: Record<string, unknown> = { organizationId };
    if (status) where.status = status;
    const rows = await m.findMany({ where, orderBy: { updatedAt: "desc" }, take: limit });
    return rows.map(rowToArticle);
  } catch { return []; }
}

export async function getArticle(
  organizationId: string,
  id:             string,
): Promise<ArticleRecord | null> {
  const m = await artModel();
  if (!m) return null;
  try {
    const row = await m.findFirst({ where: { id, organizationId } });
    return row ? rowToArticle(row) : null;
  } catch { return null; }
}

export async function createArticle(
  organizationId: string,
  input: {
    title:      string;
    summary:    string;
    content:    string;
    keywords?:  string[];
    sourceType?: string;
    categoryId?: string;
    status?:    string;
    authorId?:  string;
  },
): Promise<ArticleRecord | null> {
  const m = await artModel();
  if (!m) return null;
  try {
    const row = await m.create({
      data: {
        organizationId,
        title:      input.title,
        titleNorm:  normalizeText(input.title),
        summary:    input.summary,
        content:    input.content,
        keywords:   input.keywords   ?? [],
        sourceType: input.sourceType ?? "MANUAL",
        categoryId: input.categoryId ?? null,
        status:     input.status     ?? "draft",
        authorId:   input.authorId   ?? null,
        version:    1,
      },
    });
    return rowToArticle(row);
  } catch { return null; }
}

/** Fields a client may mutate through PATCH. Server-owned columns
 *  (id, organizationId, authorId, version, titleNorm, createdAt, updatedAt)
 *  are deliberately excluded — never spread a raw request body into Prisma. */
const ARTICLE_MUTABLE_FIELDS = [
  "title", "summary", "content", "keywords", "sourceType", "categoryId", "status",
] as const;

export async function updateArticle(
  organizationId: string,
  id:             string,
  input: Partial<{
    title:      string;
    summary:    string;
    content:    string;
    keywords:   string[];
    sourceType: string;
    categoryId: string | null;
    status:     string;
  }>,
  currentVersion: number,
): Promise<ArticleRecord | null> {
  const m = await artModel();
  if (!m) return null;
  try {
    const src = input as Record<string, unknown>;
    const data: Record<string, unknown> = { version: currentVersion + 1 };
    for (const k of ARTICLE_MUTABLE_FIELDS) {
      if (src[k] !== undefined) data[k] = src[k];
    }
    if (typeof data.title === "string" && data.title) {
      data.titleNorm = normalizeText(data.title);
    }
    // Tenant-scoped write: the mutation itself is bounded by organizationId,
    // so a record owned by another org cannot be touched even if its id leaks.
    const res = await m.updateMany({ where: { id, organizationId }, data });
    if (!res || res.count === 0) return null;
    const row = await m.findFirst({ where: { id, organizationId } });
    return row ? rowToArticle(row) : null;
  } catch { return null; }
}

// ── AssetKnowledgeLink management ─────────────────────────────────────────────

/** Service-level validation for the exactly-one-FK invariant. */
function validateLinkFKs(
  articleId?:     string | null,
  failureModeId?: string | null,
  procedureId?:   string | null,
  caseId?:        string | null,
): boolean {
  const count = [articleId, failureModeId, procedureId, caseId]
    .filter((v) => v != null && v !== "").length;
  return count === 1;
}

export async function createAssetKnowledgeLink(
  organizationId: string,
  input: {
    assetId:        string;
    articleId?:     string | null;
    failureModeId?: string | null;
    procedureId?:   string | null;
    caseId?:        string | null;
    notes?:         string;
  },
): Promise<{ ok: true; link: AssetKnowledgeLinkRecord } | { ok: false; error: string }> {
  if (!validateLinkFKs(input.articleId, input.failureModeId, input.procedureId, input.caseId)) {
    return { ok: false, error: "Exactly one of articleId, failureModeId, procedureId, caseId must be provided." };
  }
  const m = await linkModel();
  if (!m) return { ok: false, error: "Database unavailable" };
  try {
    const row = await m.create({
      data: {
        organizationId,
        assetId:       input.assetId,
        articleId:     input.articleId     ?? null,
        failureModeId: input.failureModeId ?? null,
        procedureId:   input.procedureId   ?? null,
        caseId:        input.caseId        ?? null,
        notes:         input.notes         ?? null,
      },
    });
    return { ok: true, link: rowToLink(row) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function listAssetLinks(
  organizationId: string,
  assetId:        string,
): Promise<AssetKnowledgeLinkRecord[]> {
  const m = await linkModel();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { organizationId, assetId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(rowToLink);
  } catch { return []; }
}

export { KNOWLEDGE_ENGINE_VERSION };

/**
 * Knowledge Engine Copilot bridge — Phase 40.
 *
 * getKnowledgeContext() is the read-only interface for Copilot (Phase 38) to
 * access knowledge: articles, procedures, failure modes, and open cases linked
 * to a given asset.
 *
 * READ-ONLY INVARIANT: Copilot may only read; it cannot modify knowledge.
 * No new calculations are triggered — only persisted KB records are read.
 */

import { getPrisma }       from "@/lib/db/prisma";
import type { KnowledgeContext, ArticleRecord, ProcedureRecord, FailureModeRecord, CaseRecord } from "./types";
import { _rowToProc, _rowToCase, _rowToFM } from "./failures";

type AnyModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

function rowToArticleShort(r: Record<string, unknown>): Pick<ArticleRecord, "id" | "title" | "summary" | "status"> {
  return {
    id:      r.id      as string,
    title:   r.title   as string,
    summary: r.summary as string,
    status:  r.status  as string,
  };
}

export async function getKnowledgeContext(
  organizationId: string,
  assetId:        string,
): Promise<KnowledgeContext> {
  const empty: KnowledgeContext = {
    assetId,
    relatedArticles:      [],
    relatedProcedures:    [],
    relatedFailureModes:  [],
    openCases:            [],
    linkedCount:          0,
  };

  const db = await getPrisma();
  if (!db) return empty;
  const d = db as unknown as Record<string, unknown>;

  try {
    // All AssetKnowledgeLinks for this asset
    const linkRows = await (d.assetKnowledgeLink as AnyModel).findMany({
      where:   { organizationId, assetId },
      orderBy: { createdAt: "desc" },
      take:    50,
    });

    const articleIds    = [...new Set(linkRows.map((r) => r.articleId as string | null).filter(Boolean))] as string[];
    const failureModeIds = [...new Set(linkRows.map((r) => r.failureModeId as string | null).filter(Boolean))] as string[];
    const procedureIds   = [...new Set(linkRows.map((r) => r.procedureId  as string | null).filter(Boolean))] as string[];

    const [articles, failureModes, procedures, openCaseRows] = await Promise.all([
      articleIds.length > 0
        ? (d.industrialKnowledgeArticle as AnyModel).findMany({
            where:   { organizationId, id: { in: articleIds } },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),

      failureModeIds.length > 0
        ? (d.industrialFailureMode as AnyModel).findMany({
            where:   { organizationId, id: { in: failureModeIds } },
            orderBy: [{ severity: "desc" }],
          })
        : Promise.resolve([]),

      procedureIds.length > 0
        ? (d.industrialMaintenanceProcedure as AnyModel).findMany({
            where:   { organizationId, id: { in: procedureIds } },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),

      // Open cases linked to this asset (direct lookup, not via AssetKnowledgeLink)
      (d.industrialEngineeringCase as AnyModel).findMany({
        where:   { organizationId, assetId, status: { in: ["open", "resolved"] } },
        orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
        take:    10,
      }),
    ]);

    return {
      assetId,
      relatedArticles:     articles.map(rowToArticleShort),
      relatedProcedures:   procedures.map(_rowToProc).map((p) => ({
        id: p.id, title: p.title, status: p.status, version: p.version,
      })),
      relatedFailureModes: failureModes.map(_rowToFM).map((fm) => ({
        id: fm.id, name: fm.name, severity: fm.severity,
      })),
      openCases: openCaseRows.map(_rowToCase).map((c) => ({
        id: c.id, title: c.title, status: c.status, severity: c.severity,
      })),
      linkedCount: linkRows.length,
    };
  } catch { return empty; }
}

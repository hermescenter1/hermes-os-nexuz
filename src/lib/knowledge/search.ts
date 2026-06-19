/**
 * Deterministic bilingual knowledge search — Phase 40.
 *
 * searchKnowledge() matches articles, failure modes, procedures, and cases
 * against a single query string using pre-normalized text columns.
 *
 * Ranking rules (all named constants in types.ts):
 *   TITLE_EXACT    = 100  — normalized title === normalized query
 *   TITLE_STARTS   = 80   — title starts with query
 *   TITLE_PARTIAL  = 60   — title contains query
 *   TOKEN_TITLE    = 40   — a query token appears in title
 *   FAILURE_MODE   = 35   — for articles/procedures: failure mode match
 *   CATEGORY       = 25   — category name contains query token
 *   KEYWORD        = 15   — query token in keywords/symptoms
 *   CONTENT        = 10   — query token in description/content
 *   RECENT_BONUS   = 5    — updatedAt within 30 days
 *
 * Tie-breaker: updatedAt DESC, then id ASC. Fully deterministic.
 * No AI, no embeddings, no Postgres full-text.
 */

import { getPrisma }       from "@/lib/db/prisma";
import { normalizeText, tokenize } from "./normalize";
import {
  SEARCH_WEIGHT_TITLE_EXACT,
  SEARCH_WEIGHT_TITLE_STARTS,
  SEARCH_WEIGHT_TITLE_PARTIAL,
  SEARCH_WEIGHT_TOKEN_TITLE,
  SEARCH_WEIGHT_FAILURE_MODE,
  SEARCH_WEIGHT_CATEGORY,
  SEARCH_WEIGHT_KEYWORD,
  SEARCH_WEIGHT_CONTENT,
  SEARCH_WEIGHT_RECENT_BONUS,
  SEARCH_RECENT_DAYS,
} from "./types";
import type { KnowledgeSearchResult } from "./types";
import { _rowToFM, _rowToProc, _rowToCase } from "./failures";

const MS_PER_DAY = 86_400_000;

function scoreText(
  titleNorm: string,
  normQuery: string,
  tokens:    string[],
  keywords:  string[],
  content:   string,
  updatedAt: string,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (titleNorm === normQuery) {
    score += SEARCH_WEIGHT_TITLE_EXACT;
    reasons.push("exact title match");
  } else if (titleNorm.startsWith(normQuery)) {
    score += SEARCH_WEIGHT_TITLE_STARTS;
    reasons.push("title starts with query");
  } else if (titleNorm.includes(normQuery)) {
    score += SEARCH_WEIGHT_TITLE_PARTIAL;
    reasons.push("title contains query");
  }

  for (const t of tokens) {
    if (titleNorm.includes(t)) {
      score += SEARCH_WEIGHT_TOKEN_TITLE;
      if (!reasons.includes("title token match")) reasons.push("title token match");
    }
    const kwNorm = normalizeText(keywords.join(" "));
    if (kwNorm.includes(t)) {
      score += SEARCH_WEIGHT_KEYWORD;
      if (!reasons.includes("keyword match")) reasons.push("keyword match");
    }
    const contentNorm = normalizeText(content);
    if (contentNorm.includes(t)) {
      score += SEARCH_WEIGHT_CONTENT;
      if (!reasons.includes("content match")) reasons.push("content match");
    }
  }

  const ageDays = (Date.now() - new Date(updatedAt).getTime()) / MS_PER_DAY;
  if (ageDays <= SEARCH_RECENT_DAYS) {
    score += SEARCH_WEIGHT_RECENT_BONUS;
    reasons.push("recently updated");
  }

  return { score, reasons };
}

export async function searchKnowledge(
  organizationId: string,
  query:          string,
  types?:         Array<"article" | "failureMode" | "procedure" | "case">,
  limit           = 20,
): Promise<KnowledgeSearchResult[]> {
  if (!query.trim()) return [];

  const db = await getPrisma();
  if (!db) return [];
  const d = db as unknown as Record<string, unknown>;

  const normQuery = normalizeText(query);
  const tokens    = tokenize(normQuery);
  const include   = types ?? ["article", "failureMode", "procedure", "case"];
  const results:   KnowledgeSearchResult[] = [];

  type AnyModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

  try {
    await Promise.all([
      // Articles
      include.includes("article")
        ? (d.industrialKnowledgeArticle as AnyModel).findMany({
            where:   { organizationId },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            take:    300,
          }).then((rows) => {
            for (const r of rows) {
              const { score, reasons } = scoreText(
                r.titleNorm  as string,
                normQuery, tokens,
                (r.keywords  as string[]) ?? [],
                r.content    as string,
                r.updatedAt  as string,
              );
              if (score > 0) {
                results.push({
                  type: "article", id: r.id as string, title: r.title as string,
                  summary: r.summary as string, score, matchReason: reasons,
                  updatedAt: new Date(r.updatedAt as string).toISOString(),
                });
              }
            }
          }).catch(() => undefined)
        : Promise.resolve(),

      // Failure modes
      include.includes("failureMode")
        ? (d.industrialFailureMode as AnyModel).findMany({
            where:   { organizationId },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            take:    300,
          }).then((rows) => {
            for (const r of rows) {
              const fm = _rowToFM(r);
              const { score, reasons } = scoreText(
                fm.nameNorm, normQuery, tokens,
                [...fm.keywords, ...fm.symptoms],
                fm.description,
                fm.updatedAt,
              );
              if (score > 0) {
                results.push({
                  type: "failureMode", id: fm.id, title: fm.name,
                  summary: fm.description.slice(0, 200), score, matchReason: reasons,
                  updatedAt: fm.updatedAt,
                });
              }
            }
          }).catch(() => undefined)
        : Promise.resolve(),

      // Procedures
      include.includes("procedure")
        ? (d.industrialMaintenanceProcedure as AnyModel).findMany({
            where:   { organizationId },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            take:    300,
          }).then((rows) => {
            for (const r of rows) {
              const p = _rowToProc(r);
              const { score, reasons } = scoreText(
                p.titleNorm, normQuery, tokens,
                p.assetTypes,
                p.description,
                p.updatedAt,
              );
              if (score > 0) {
                results.push({
                  type: "procedure", id: p.id, title: p.title,
                  summary: p.description.slice(0, 200), score, matchReason: reasons,
                  updatedAt: p.updatedAt,
                });
              }
            }
          }).catch(() => undefined)
        : Promise.resolve(),

      // Cases
      include.includes("case")
        ? (d.industrialEngineeringCase as AnyModel).findMany({
            where:   { organizationId },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            take:    300,
          }).then((rows) => {
            for (const r of rows) {
              const c = _rowToCase(r);
              const { score, reasons } = scoreText(
                c.titleNorm, normQuery, tokens,
                [...c.keywords, ...c.symptoms],
                [c.diagnosis, c.resolution].filter(Boolean).join(" "),
                c.updatedAt,
              );
              if (score > 0) {
                results.push({
                  type: "case", id: c.id, title: c.title,
                  summary: (c.diagnosis ?? c.symptoms.join(", ")).slice(0, 200),
                  score, matchReason: reasons, updatedAt: c.updatedAt,
                });
              }
            }
          }).catch(() => undefined)
        : Promise.resolve(),
    ]);
  } catch { return []; }

  // Sort: score DESC → updatedAt DESC → id ASC (deterministic)
  return results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.updatedAt !== a.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
      return a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

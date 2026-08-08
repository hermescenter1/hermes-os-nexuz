// PHASE 95 — retrieval provenance & poisoning defence.
//
// Every retrievable source carries an enforceable trust/provenance class. This
// module decides, fail-closed, whether a source may (a) ground an AUTHORITATIVE
// (safety-relevant) claim, (b) be shown only as DATA, or (c) be BLOCKED. It also
// guarantees cross-tenant / revoked / deleted sources never enter the retrieval
// set. Retrieved text is ALWAYS treated as untrusted data by the prompt envelope
// — this module governs WHICH sources are eligible at all.

import type { TrustClass } from "./types";

export interface SourceProvenance {
  sourceRef: string;
  organisationId: string | null;
  siteId: string | null;
  /** "published" | "draft" | "archived" | "revoked" | "unknown". */
  publicationState: string;
  reviewState: "platform_reviewed" | "tenant_reviewed" | "unreviewed" | "unknown";
  archived: boolean;
  revoked: boolean;
  deleted: boolean;
  version: string;
  checksum: string | null;
  authorId: string | null;
  isPublic: boolean;
}

export interface RetrievalRequestContext {
  organisationId: string | null;
  siteId: string | null;
  /** True when the claim being grounded is safety-relevant (stricter rules). */
  safetyRelevant: boolean;
  /** Explicit opt-in to include archived sources. */
  includeArchived: boolean;
}

export type RetrievalDisposition = "AUTHORITATIVE" | "DATA_ONLY" | "BLOCKED";

export interface RetrievalDecision {
  disposition: RetrievalDisposition;
  trustClass: TrustClass;
  reason: string | null;
}

export function classifyTrust(p: SourceProvenance): TrustClass {
  if (p.deleted || p.revoked || p.publicationState === "revoked") return "REVOKED";
  if (p.archived || p.publicationState === "archived") return "ARCHIVED";
  if (p.reviewState === "platform_reviewed") return "PLATFORM_REVIEWED";
  if (p.reviewState === "tenant_reviewed" && p.publicationState === "published") return "TENANT_REVIEWED";
  if (p.reviewState === "unreviewed") return "TENANT_UNREVIEWED";
  if (p.isPublic) return "PUBLIC_UNVERIFIED";
  return "UNKNOWN";
}

/** Decide a single source's disposition. Fail-closed. */
export function decideRetrieval(p: SourceProvenance, ctx: RetrievalRequestContext): RetrievalDecision {
  const trustClass = classifyTrust(p);

  // Hard exclusions first — these never enter the retrieval set.
  if (p.deleted) return { disposition: "BLOCKED", trustClass, reason: "deleted" };
  if (p.revoked || trustClass === "REVOKED") return { disposition: "BLOCKED", trustClass, reason: "revoked" };
  // Cross-tenant: a source owned by another org is never retrievable.
  if (p.organisationId !== null && p.organisationId !== ctx.organisationId) {
    return { disposition: "BLOCKED", trustClass, reason: "cross_tenant" };
  }
  // Cross-site: a site-bound source must match the request site.
  if (p.siteId !== null && p.siteId !== ctx.siteId) {
    return { disposition: "BLOCKED", trustClass, reason: "cross_site" };
  }
  if ((p.archived || trustClass === "ARCHIVED") && !ctx.includeArchived) {
    return { disposition: "BLOCKED", trustClass, reason: "archived" };
  }
  // Unpublished (draft) content is not retrievable for authoritative grounding.
  if (p.publicationState !== "published" && !p.isPublic && !ctx.includeArchived) {
    return { disposition: "BLOCKED", trustClass, reason: "unpublished" };
  }

  // Eligible — decide authoritative vs data-only.
  if (ctx.safetyRelevant) {
    // Safety-relevant claims may only be grounded on reviewed sources.
    if (trustClass === "PLATFORM_REVIEWED" || trustClass === "TENANT_REVIEWED") {
      return { disposition: "AUTHORITATIVE", trustClass, reason: null };
    }
    return { disposition: "DATA_ONLY", trustClass, reason: "unreviewed_for_safety" };
  }
  if (trustClass === "PLATFORM_REVIEWED" || trustClass === "TENANT_REVIEWED") {
    return { disposition: "AUTHORITATIVE", trustClass, reason: null };
  }
  return { disposition: "DATA_ONLY", trustClass, reason: "unreviewed" };
}

export interface FilteredRetrieval {
  usable: { source: SourceProvenance; decision: RetrievalDecision }[];
  blocked: { source: SourceProvenance; decision: RetrievalDecision }[];
}

/** Split a candidate source list into usable (authoritative/data-only) vs
 *  blocked. Never returns a cross-tenant, revoked or deleted source as usable. */
export function filterRetrievableSources(
  sources: readonly SourceProvenance[],
  ctx: RetrievalRequestContext,
): FilteredRetrieval {
  const usable: FilteredRetrieval["usable"] = [];
  const blocked: FilteredRetrieval["blocked"] = [];
  for (const source of sources) {
    const decision = decideRetrieval(source, ctx);
    if (decision.disposition === "BLOCKED") blocked.push({ source, decision });
    else usable.push({ source, decision });
  }
  return { usable, blocked };
}

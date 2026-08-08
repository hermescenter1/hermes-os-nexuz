import { describe, it, expect } from "vitest";
import {
  classifyTrust,
  decideRetrieval,
  filterRetrievableSources,
  type RetrievalRequestContext,
  type SourceProvenance,
} from "../rag-provenance";

/** PHASE 95 — RAG provenance & poisoning defence (WU7). */

function prov(over: Partial<SourceProvenance>): SourceProvenance {
  return {
    sourceRef: "ref",
    organisationId: "org-A",
    siteId: null,
    publicationState: "published",
    reviewState: "tenant_reviewed",
    archived: false,
    revoked: false,
    deleted: false,
    version: "1",
    checksum: "abc",
    authorId: "u1",
    isPublic: false,
    ...over,
  };
}

const ctx: RetrievalRequestContext = { organisationId: "org-A", siteId: null, safetyRelevant: false, includeArchived: false };

describe("95 — trust classification", () => {
  it("maps review/publication/lifecycle to a trust class", () => {
    expect(classifyTrust(prov({ reviewState: "platform_reviewed" }))).toBe("PLATFORM_REVIEWED");
    expect(classifyTrust(prov({ reviewState: "tenant_reviewed", publicationState: "published" }))).toBe("TENANT_REVIEWED");
    expect(classifyTrust(prov({ reviewState: "unreviewed" }))).toBe("TENANT_UNREVIEWED");
    expect(classifyTrust(prov({ revoked: true }))).toBe("REVOKED");
    expect(classifyTrust(prov({ archived: true }))).toBe("ARCHIVED");
  });
});

describe("95 — retrieval poisoning defence", () => {
  it("blocks cross-tenant sources", () => {
    expect(decideRetrieval(prov({ organisationId: "org-B" }), ctx)).toMatchObject({ disposition: "BLOCKED", reason: "cross_tenant" });
  });
  it("blocks revoked and deleted sources", () => {
    expect(decideRetrieval(prov({ revoked: true }), ctx).disposition).toBe("BLOCKED");
    expect(decideRetrieval(prov({ deleted: true }), ctx).disposition).toBe("BLOCKED");
  });
  it("blocks archived sources unless explicitly requested", () => {
    expect(decideRetrieval(prov({ archived: true }), ctx).disposition).toBe("BLOCKED");
    expect(decideRetrieval(prov({ archived: true }), { ...ctx, includeArchived: true }).disposition).not.toBe("BLOCKED");
  });
  it("blocks unpublished (draft) content from authoritative grounding", () => {
    expect(decideRetrieval(prov({ publicationState: "draft" }), ctx).disposition).toBe("BLOCKED");
  });
  it("treats unreviewed content as DATA_ONLY, never authoritative", () => {
    expect(decideRetrieval(prov({ reviewState: "unreviewed" }), ctx).disposition).toBe("DATA_ONLY");
  });
  it("only reviewed sources may ground a safety-relevant claim", () => {
    const safeCtx = { ...ctx, safetyRelevant: true };
    expect(decideRetrieval(prov({ reviewState: "platform_reviewed" }), safeCtx).disposition).toBe("AUTHORITATIVE");
    expect(decideRetrieval(prov({ reviewState: "unreviewed" }), safeCtx).disposition).toBe("DATA_ONLY");
  });
  it("a published-but-malicious tenant source is at most DATA_ONLY when unreviewed", () => {
    const poisoned = prov({ reviewState: "unreviewed", publicationState: "published", isPublic: true });
    expect(decideRetrieval(poisoned, ctx).disposition).not.toBe("AUTHORITATIVE");
  });

  it("filterRetrievableSources never returns a cross-tenant/revoked source as usable", () => {
    const { usable, blocked } = filterRetrievableSources(
      [prov({}), prov({ organisationId: "org-B" }), prov({ revoked: true })],
      ctx,
    );
    expect(usable.every((u) => u.source.organisationId === "org-A" && !u.source.revoked)).toBe(true);
    expect(blocked.length).toBe(2);
  });
});

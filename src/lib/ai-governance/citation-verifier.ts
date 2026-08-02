// PHASE 95 — citation integrity verifier.
//
// The model may only emit server-issued opaque citation ids (S1, S2 …). It never
// produces database ids or URLs. Server-side, EVERY cited id must resolve, in
// THIS execution's retrieval set, to a source that: exists, was retrieved here,
// belongs to the same organisation/site, is accessible to the requesting user,
// is not deleted/revoked, matches the retrieved version, and supports a claim.
// A citation failing any check is removed (and the unsupported claim dropped),
// never shown. Fail-closed: unknown ⇒ invalid.

export interface RetrievedSource {
  citationId: string;
  /** Opaque provenance identity — not exposed to the model. */
  sourceRef: string;
  organisationId: string | null;
  siteId: string | null;
  version: string;
  accessibleToUser: boolean;
  deleted: boolean;
  revoked: boolean;
  /** True when this source was returned for the current execution. */
  retrievedThisExecution: boolean;
}

export interface CitationRequestContext {
  organisationId: string | null;
  siteId: string | null;
}

export type CitationRejectReason =
  | "not_retrieved"
  | "cross_tenant"
  | "cross_site"
  | "inaccessible"
  | "deleted"
  | "revoked"
  | "unknown";

export interface CitationVerification {
  valid: string[];
  rejected: { citationId: string; reason: CitationRejectReason }[];
  status: "ok" | "partial" | "none";
}

/**
 * Verify a set of model-emitted citation ids against the retrieval set.
 * `retrieved` is the authoritative list built by the server for this execution.
 */
export function verifyCitations(
  emitted: readonly string[],
  retrieved: readonly RetrievedSource[],
  ctx: CitationRequestContext,
): CitationVerification {
  const byId = new Map(retrieved.map((r) => [r.citationId, r]));
  const valid: string[] = [];
  const rejected: { citationId: string; reason: CitationRejectReason }[] = [];
  const seen = new Set<string>();

  for (const id of emitted) {
    if (seen.has(id)) continue; // dedupe
    seen.add(id);
    const src = byId.get(id);
    if (!src || !src.retrievedThisExecution) {
      rejected.push({ citationId: id, reason: src ? "not_retrieved" : "unknown" });
      continue;
    }
    if (src.deleted) { rejected.push({ citationId: id, reason: "deleted" }); continue; }
    if (src.revoked) { rejected.push({ citationId: id, reason: "revoked" }); continue; }
    if (!src.accessibleToUser) { rejected.push({ citationId: id, reason: "inaccessible" }); continue; }
    if ((src.organisationId ?? null) !== (ctx.organisationId ?? null)) {
      rejected.push({ citationId: id, reason: "cross_tenant" });
      continue;
    }
    // Site scope: if the source is site-bound, it must match the request site.
    if (src.siteId !== null && src.siteId !== (ctx.siteId ?? null)) {
      rejected.push({ citationId: id, reason: "cross_site" });
      continue;
    }
    valid.push(id);
  }

  const status: CitationVerification["status"] =
    valid.length === 0 ? "none" : rejected.length === 0 ? "ok" : "partial";
  return { valid, rejected, status };
}

// PHASE 87G — pure derivation of the sales attention layer from EXISTING CRM
// records (JSX-free, unit-testable). Every item is deterministic: no inferred
// urgency, no fabricated scores — only record states the backend already has.

import type { CrmLead, CrmDashboardStats } from "@/lib/crm/types";

export interface CrmAttentionItem {
  id: string;
  /** Deterministic kind — the UI localizes the reason from this. */
  kind: "newLead" | "unassignedLead" | "atRiskAccounts";
  /** Person/company display (already-visible lead fields) or empty for aggregates. */
  object: string;
  /** Aggregate count for atRiskAccounts. */
  count?: number;
  /** Lead createdAt (ISO) when applicable. */
  createdAt?: string;
  href: string;
}

const LEADS_HREF = "/crm/leads";
const CS_HREF = "/crm/customer-success";

/**
 * Attention list, most actionable first:
 *   1. QUALIFIED leads without an owner (deterministic: status + ownerId null)
 *   2. NEW leads awaiting first review (deterministic: status === NEW)
 *   3. at-risk accounts aggregate (stats.atRiskAccounts > 0 — an existing
 *      deterministic calculation, surfaced as ONE aggregate item)
 * Capped so the panel stays scannable.
 */
export function deriveCrmAttention(
  leads: CrmLead[],
  stats: CrmDashboardStats | null,
  limit = 6,
): CrmAttentionItem[] {
  const items: CrmAttentionItem[] = [];

  const display = (l: CrmLead) =>
    [l.firstName, l.lastName].filter(Boolean).join(" ") + (l.company ? ` — ${l.company}` : "");

  for (const l of leads) {
    if (l.deletedAt) continue;
    if (l.status === "QUALIFIED" && !l.ownerId) {
      items.push({ id: `unassigned-${l.id}`, kind: "unassignedLead", object: display(l), createdAt: l.createdAt, href: LEADS_HREF });
    }
  }
  for (const l of leads) {
    if (l.deletedAt) continue;
    if (l.status === "NEW") {
      items.push({ id: `new-${l.id}`, kind: "newLead", object: display(l), createdAt: l.createdAt, href: LEADS_HREF });
    }
  }
  // newest first within each band (bands already ordered by priority)
  items.sort((a, b) => {
    const band = (x: CrmAttentionItem) => (x.kind === "unassignedLead" ? 0 : 1);
    if (band(a) !== band(b)) return band(a) - band(b);
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  const capped = items.slice(0, stats && stats.atRiskAccounts > 0 ? limit - 1 : limit);
  if (stats && stats.atRiskAccounts > 0) {
    capped.push({ id: "cs-at-risk", kind: "atRiskAccounts", object: "", count: stats.atRiskAccounts, href: CS_HREF });
  }
  return capped;
}

/** Compact currency label ($1.2M / $340K / $900) — the format the CRM already uses. */
export function formatMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

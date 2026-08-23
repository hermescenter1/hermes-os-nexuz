"use client";

// PHASE 87G AMENDMENT 1 — localized lead profile. Same fetch/route; enum
// values internal; display labels + dates localized; email/score bidi-safe.
//
// PHASE 107 STAGE 6-A — "not found" no longer absorbs every failure. The old
// `d.lead ?? null` turned a 401, a 403 and a dropped connection alike into
// "Lead not found", which sends the reader looking for a deleted record when
// the real answer is that their session ended. Endpoint and route unchanged.

import { useLocale, useTranslations } from "next-intl";
import { ResourceFailureNotice } from "@/components/ui/ResourceFailureNotice";
import { useResource } from "@/lib/client/use-resource";
import { requestJson } from "@/lib/client/resource-request";
import type { CrmLead, CrmLeadStatus } from "@/lib/crm/types";

const STATUS_STYLES: Record<CrmLeadStatus, string> = {
  NEW:         "bg-slate-500/10 text-slate-400 border-slate-500/20",
  CONTACTED:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  QUALIFIED:   "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  PROPOSAL:    "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  NEGOTIATION: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CONVERTED:   "bg-green-500/10 text-green-400 border-green-500/20",
  LOST:        "bg-red-500/10 text-red-400 border-red-500/20",
};

export function LeadDetailClient({ leadId }: { leadId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  // `lead` may legitimately be null (the record is gone); an absent key means
  // the response did not match the contract, which is a failure, not a null.
  const leadState = useResource<CrmLead | null>(
    (signal) => requestJson(
      `/api/crm/leads/${leadId}`,
      (body) => (body as { lead?: CrmLead | null }).lead,
      { signal },
    ),
    [leadId],
  );

  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });

  if (leadState.status === "LOADING") return (
    <div data-async-state="loading" className="h-64 rounded-xl border border-line bg-surface animate-pulse">
      <span className="sr-only" role="status">{t("common.loading")}</span>
    </div>
  );

  // Only a genuine absence keeps the module's own "not found" wording.
  if (leadState.status === "EMPTY" || leadState.failure === "NOT_FOUND") {
    return <div data-async-state="not-found" className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">{t("leadDetail.notFound")}</div>;
  }

  if (leadState.status === "ERROR" && leadState.failure) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <ResourceFailureNotice code={leadState.failure} onRetry={leadState.retry} />
      </div>
    );
  }

  const lead = leadState.data;
  if (!lead) return null;

  const fields: [string, React.ReactNode][] = [
    [t("leadDetail.email"),    <bdi key="e" dir="ltr">{lead.email}</bdi>],
    [t("leadDetail.phone"),    lead.phone ? <bdi key="p" dir="ltr">{lead.phone}</bdi> : "—"],
    [t("leadDetail.company"),  lead.company ?? "—"],
    [t("leadDetail.jobTitle"), lead.jobTitle ?? "—"],
    [t("leadDetail.sourceLabel"), t(`source.${lead.source}`)],
    [t("leadDetail.score"),    <span key="s" dir="ltr">{String(lead.score)}</span>],
    [t("common.created"),      df.format(new Date(lead.createdAt))],
    [t("common.updated"),      df.format(new Date(lead.updatedAt))],
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink" dir="auto">{lead.firstName} {lead.lastName}</h2>
          <p className="text-sm text-muted" dir="auto">{lead.company ?? t("leadDetail.independent")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[lead.status]}`}>
            {t(`status.${lead.status}`)}
          </span>
          <span className="font-mono text-lg font-bold text-cyan-400" dir="ltr">{lead.score}<span className="text-xs text-muted">/100</span></span>
        </div>
      </div>

      {/* Fields */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h3 className="mb-4 text-sm font-semibold text-ink">{t("leadDetail.contactDetails")}</h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 px-4 py-3">
              <dt className="font-mono text-xs uppercase tracking-widest text-metadata">{k}</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink" dir="auto">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Notes */}
      {lead.notes && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h3 className="mb-3 text-sm font-semibold text-ink">{t("common.notes")}</h3>
          <p className="text-sm text-muted leading-relaxed" dir="auto">{lead.notes}</p>
        </div>
      )}

      {/* Conversion */}
      {lead.status === "CONVERTED" && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6">
          <p className="text-sm font-medium text-green-400">
            {t("leadDetail.convertedOn", { date: lead.convertedAt ? df.format(new Date(lead.convertedAt)) : "—" })}
          </p>
        </div>
      )}
    </div>
  );
}

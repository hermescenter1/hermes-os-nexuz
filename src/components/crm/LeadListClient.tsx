"use client";

// PHASE 87G AMENDMENT 1 — localized lead list. Behavior byte-preserved:
// same /api/crm/leads calls, same status filter values (API enums), same
// routing. Enum VALUES stay internal; only display labels are localized.

import { useState, useEffect } from "react";
import Link                    from "next/link";
import { usePathname }         from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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

export function LeadListClient() {
  const t = useTranslations("crm");
  const locale = useLocale();
  const [leads,   setLeads]   = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<CrmLeadStatus | "">("");
  const pathname = usePathname();
  const base = pathname.startsWith("/fa") ? "/fa" : "/en";

  useEffect(() => {
    const url = filter ? `/api/crm/leads?status=${filter}` : "/api/crm/leads";
    fetch(url)
      .then(r => r.json())
      .then(d => setLeads(d.leads ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });
  const statuses: (CrmLeadStatus | "")[] = ["","NEW","CONTACTED","QUALIFIED","PROPOSAL","NEGOTIATION","CONVERTED","LOST"];
  const columns = [
    t("leads.colName"), t("leads.colCompany"), t("leads.colStatus"),
    t("leads.colSource"), t("leads.colScore"), t("leads.colCreated"),
  ];

  return (
    <div className="space-y-4">
      {/* Filters — button VALUES stay API enums; labels are localized */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("leads.filterLabel")}>
        {statuses.map(s => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={[
              "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
              filter === s
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                : "border-line bg-surface text-muted hover:text-ink",
            ].join(" ")}
          >
            {s ? t(`status.${s}`) : t("leads.filterAll")}
          </button>
        ))}
      </div>

      {loading && (
        <div className="h-48 rounded-xl border border-line bg-surface animate-pulse">
          <span className="sr-only" role="status">{t("common.loading")}</span>
        </div>
      )}

      {!loading && leads.length === 0 && (
        <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">
          {t("leads.empty")}
        </div>
      )}

      {!loading && leads.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                {columns.map(h => (
                  <th key={h} scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-widest text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leads.map(lead => (
                <tr key={lead.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`${base}/crm/leads/${lead.id}`} className="font-medium text-ink hover:text-cyan-400 transition-colors" dir="auto">
                      {lead.firstName} {lead.lastName}
                    </Link>
                    <p className="text-xs text-muted truncate max-w-[160px]"><bdi dir="ltr">{lead.email}</bdi></p>
                  </td>
                  <td className="px-4 py-3 text-muted" dir="auto">{lead.company ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[lead.status]}`}>
                      {t(`status.${lead.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{t(`source.${lead.source}`)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-cyan-400" dir="ltr">{lead.score}</span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{df.format(new Date(lead.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

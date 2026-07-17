"use client";

// PHASE 87G AMENDMENT 1 — localized opportunity detail. Same fetch/route;
// stage values internal; labels/dates localized; money bidi-safe.

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { CrmOpportunity, CrmAccount, CrmOpportunityStage } from "@/lib/crm/types";

const STAGE_STYLES: Record<CrmOpportunityStage, string> = {
  DISCOVERY:"bg-slate-500/10 text-slate-400 border-slate-500/20",
  QUALIFICATION:"bg-blue-500/10 text-blue-400 border-blue-500/20",
  PROPOSAL:"bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  TECHNICAL_REVIEW:"bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  COMMERCIAL_REVIEW:"bg-violet-500/10 text-violet-400 border-violet-500/20",
  NEGOTIATION:"bg-amber-500/10 text-amber-400 border-amber-500/20",
  WON:"bg-green-500/10 text-green-400 border-green-500/20",
  LOST:"bg-red-500/10 text-red-400 border-red-500/20",
};

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export function OpportunityDetailClient({ oppId }: { oppId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const [opp,     setOpp]     = useState<(CrmOpportunity & { account: CrmAccount | null }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/crm/opportunities/${oppId}`)
      .then(r => r.json())
      .then(d => setOpp(d.opportunity ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [oppId]);

  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });

  if (loading) return (
    <div className="h-64 rounded-xl border border-line bg-surface animate-pulse">
      <span className="sr-only" role="status">{t("common.loading")}</span>
    </div>
  );
  if (!opp) return <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">{t("oppDetail.notFound")}</div>;

  const rows: [string, React.ReactNode][] = [
    [t("common.probability"),     <span key="p" dir="ltr">{`${opp.probability}%`}</span>],
    [t("oppDetail.expectedClose"), opp.expectedCloseDate ? df.format(new Date(opp.expectedCloseDate)) : "—"],
    [t("oppDetail.account"),      opp.account?.name ?? "—"],
    [t("oppDetail.weightedValue"), <bdi key="w" dir="ltr">{fmt(opp.value * (opp.probability / 100))}</bdi>],
    [t("common.created"),         df.format(new Date(opp.createdAt))],
    [t("common.updated"),         df.format(new Date(opp.updatedAt))],
    ...(opp.lostReason ? [[t("oppDetail.lostReason"), opp.lostReason] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink" dir="auto">{opp.title}</h2>
          {opp.account && <p className="text-sm text-muted" dir="auto">{opp.account.name}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${STAGE_STYLES[opp.stage]}`}>
            {t(`stage.${opp.stage}`)}
          </span>
          <span className="font-mono text-xl font-bold text-cyan-400"><bdi dir="ltr">{fmt(opp.value)}</bdi></span>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-6">
        <h3 className="mb-4 text-sm font-semibold text-ink">{t("oppDetail.details")}</h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 px-4 py-3">
              <dt className="font-mono text-xs uppercase tracking-widest text-faint">{k}</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink" dir="auto">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {opp.notes && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h3 className="mb-3 text-sm font-semibold text-ink">{t("common.notes")}</h3>
          <p className="text-sm text-muted leading-relaxed" dir="auto">{opp.notes}</p>
        </div>
      )}

      {/* Probability bar */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h3 className="mb-3 text-sm font-semibold text-ink">{t("oppDetail.winProbability")}</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-xs" dir="ltr">
            <span className="text-muted">0%</span>
            <span className="font-mono font-bold text-cyan-400">{opp.probability}%</span>
            <span className="text-muted">100%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ inlineSize: `${opp.probability}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

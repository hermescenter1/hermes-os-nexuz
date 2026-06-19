import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";
import Link                from "next/link";

export default function KnowledgePage() {
  const t = useTranslations("ke");

  const nav = [
    { href: "knowledge/articles",  label: t("articles.title"),         desc: t("articles.subtitle") },
    { href: "knowledge/failures",  label: t("failures.title"),         desc: t("failures.subtitle") },
    { href: "knowledge/procedures", label: t("procedures.title"),      desc: t("procedures.subtitle") },
    { href: "knowledge/cases",     label: t("engineeringCases.title"), desc: t("engineeringCases.subtitle") },
  ];

  const designPillars = [
    ["Bilingual Search",   "Unicode NFC → Arabic→Persian char map → diacritics strip → lowercase → token match"],
    ["Confidence Scale",   "0.0–1.0 internal Float; ≤0.39 LOW · 0.40–0.74 MEDIUM · ≥0.75 HIGH"],
    ["Root Cause Scoring", "Named weight constants: health −0.20 · alarms +0.15 · indicator +0.10 · type +0.10"],
    ["Procedure Safety",   "Every PATCH increments version + writes audit diff (changedFields, changedBy)"],
    ["Asset FK Invariant", "AssetKnowledgeLink: DB CHECK + service validation → exactly one FK non-null"],
    ["Auditability",       "All create/update events → AuditLog + meter; engine version ke_v1 in every record"],
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("overview.title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("overview.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
        <p className="text-amber-300 text-sm">{t("safetyBanner")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {nav.map((n) => (
          <Link key={n.href} href={n.href}>
            <GlassCard hover className="p-5 space-y-2">
              <p className="font-semibold text-white">{n.label}</p>
              <p className="text-white/40 text-sm">{n.desc}</p>
            </GlassCard>
          </Link>
        ))}
      </div>

      <GlassCard>
        <div className="px-5 py-4 space-y-3">
          <p className="font-mono text-xs uppercase tracking-widest text-white/30">Engine Design</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/50">
            {designPillars.map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                <p className="text-cyan-400 font-mono text-xs mb-0.5">{k}</p>
                <p className="text-white/40">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

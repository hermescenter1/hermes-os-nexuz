import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";
import Link                from "next/link";

export default function KnowledgePage() {
  const t = useTranslations("ke");

  const nav = [
    { href: "knowledge/articles",   label: t("articles.title"),         desc: t("articles.subtitle") },
    { href: "knowledge/failures",   label: t("failures.title"),         desc: t("failures.subtitle") },
    { href: "knowledge/procedures", label: t("procedures.title"),       desc: t("procedures.subtitle") },
    { href: "knowledge/cases",      label: t("engineeringCases.title"), desc: t("engineeringCases.subtitle") },
  ];

  const designPillars: [string, string][] = [
    ["Bilingual Search",   "Unicode NFC → Arabic→Persian char map → diacritics strip → lowercase → token match"],
    ["Confidence Scale",   "0.0–1.0 internal Float; ≤0.39 LOW · 0.40–0.74 MEDIUM · ≥0.75 HIGH"],
    ["Root Cause Scoring", "Named weight constants: health −0.20 · alarms +0.15 · indicator +0.10 · type +0.10"],
    ["Procedure Safety",   "Every PATCH increments version + writes audit diff (changedFields, changedBy)"],
    ["Asset FK Invariant", "AssetKnowledgeLink: DB CHECK + service validation → exactly one FK non-null"],
    ["Auditability",       "All create/update events → AuditLog + meter; engine version ke_v1 in every record"],
  ];

  return (
    <div className="space-y-6 p-6 sm:p-8 max-w-7xl mx-auto">
      <div className="page-header-premium">
        <p className="eyebrow-mono mb-2">{t("eyebrow")}</p>
        <h1 className="page-title" style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)" }}>
          {t("overview.title")}
        </h1>
        <p className="mt-2 text-base text-muted leading-relaxed max-w-2xl">{t("overview.subtitle")}</p>
      </div>

      {/* Safety notice */}
      <div className="flex items-center gap-3 rounded-xl border border-warn/20 bg-warn/[0.04] px-4 py-3">
        <span className="h-1.5 w-1.5 rounded-full bg-warn flex-shrink-0" />
        <p className="text-warn text-sm">{t("safetyBanner")}</p>
      </div>

      {/* Navigation cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {nav.map((n) => (
          <Link key={n.href} href={n.href}>
            <GlassCard hover className="p-6 space-y-2.5 group">
              <p className="font-display font-semibold text-ink group-hover:text-signal transition-colors duration-200">
                {n.label}
              </p>
              <p className="text-sm text-muted leading-relaxed">{n.desc}</p>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-xs text-faint group-hover:text-muted transition-colors">
                  Open →
                </span>
              </div>
            </GlassCard>
          </Link>
        ))}
      </div>

      {/* Engine design */}
      <GlassCard className="p-6">
        <p className="eyebrow-label mb-4">Engine Design</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {designPillars.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line/60 bg-surface2/60 px-4 py-3">
              <p className="font-mono text-xs text-signal mb-1">{k}</p>
              <p className="text-xs text-muted leading-relaxed">{v}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

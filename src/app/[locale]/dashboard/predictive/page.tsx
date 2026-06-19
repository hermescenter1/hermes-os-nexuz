import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";
import Link                from "next/link";

/**
 * Predictive Maintenance overview — Phase 39.
 * READ/ANALYZE ONLY: no control commands, no autonomous maintenance actions.
 */
export default function PredictivePage() {
  const t = useTranslations("predictive");

  const nav = [
    { href: "predictive/risk",            label: t("risk.title"),            desc: t("risk.subtitle") },
    { href: "predictive/rul",             label: t("remainingUsefulLife.title"), desc: t("remainingUsefulLife.subtitle") },
    { href: "predictive/recommendations", label: t("recommendations.title"), desc: t("recommendations.subtitle") },
    { href: "predictive/baselines",       label: t("baselines.title"),       desc: t("baselines.subtitle") },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("subtitle")}</p>
      </div>

      {/* Safety banner */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
        <p className="text-amber-300 text-sm">{t("safetyBanner")}</p>
      </div>

      {/* Nav cards */}
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

      {/* Determinism callout */}
      <GlassCard>
        <div className="px-5 py-4 space-y-3">
          <p className="font-mono text-xs uppercase tracking-widest text-white/30">Engine Design</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/50">
            {[
              ["Risk Score",        "Health + Alarm + KPI + Quality + Freshness · 5 named weights"],
              ["Degradation",       "Theil-Sen estimator · IQR outlier filter · zero-variance guard"],
              ["RUL",               "Deterministic projection · range ±30% · capped at 365 days"],
              ["Failure Prob.",     "Additive score matrix · LOW / MEDIUM / HIGH classification"],
              ["Data Gate",         "Min 5 health points + 7 days span before any number is emitted"],
              ["Auditability",      "formulaVersion + weightSetVersion in every persisted record"],
            ].map(([k, v]) => (
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

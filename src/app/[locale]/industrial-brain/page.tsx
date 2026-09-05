import { setRequestLocale, getTranslations } from "next-intl/server";
import { buildMetadata }    from "@/lib/seo/metadata";
import { Link }             from "@/i18n/navigation";
// AUTH-U1 — canonical identity facade (JWT first, legacy HMAC fallback).
// Read-only consumer: identity only toggles a UI affordance below; the
// case-save API enforces its own authorization independently.
import { getCurrentUserUnified } from "@/lib/auth/current-user";
import { can }              from "@/lib/auth/roles";
import { IndustrialBrainWorkspace } from "@/components/industrial-brain/IndustrialBrainWorkspace";
import { CapabilityLink } from "@/components/analytics/CapabilityLink";
import { PublicPageShell } from "@/components/public-site";
// PHASE 101-R — the Phase 101 reference corpus and its structural diagnostic
// engine, executed server-side on this route. Before this the corpus was
// imported by nothing outside its own test suite.
import { ReferenceDiagnosticPanel, CASE_QUERY_PARAM, bridgeFingerprint } from "@/components/industrial-brain/ReferenceDiagnosticPanel";
import { ACTIVE_LOCALES } from "@/i18n/locales";
import type { BridgeLocale } from "@/lib/industrial-knowledge/runtime/bridge";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "industrialBrain.meta" });
  return buildMetadata({
    locale,
    path:  "/industrial-brain",
    title: t("title"),
    description: t("description"),
  });
}

export const dynamic = "force-dynamic";

// ─── Capability pipeline ──────────────────────────────────────────────────────
// The six capabilities, in the order the workspace actually applies them:
// intake → interpretation → reasoning → uncertainty → verification → knowledge.
//
// DASHBOARD ALIGNMENT: these were six equal-weight marketing cards stacked in a
// tall left column that ran out before the reasoning output did. They are the
// same six capabilities reading the same catalog strings; only the presentation
// changed, from a card stack into a numbered workflow rail that reads as the map
// of the analysis beside it. Title and description come from the catalog
// (capabilities.items.<key>); icon and accent are presentation-only.

const CAPABILITY_PIPELINE = [
  {
    key: "alarmIntelligence",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>,
    accent: "#38BDF8",
  },
  {
    key: "signalMatrix",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25l.01 9.5A2.25 2.25 0 0 1 16.76 17H3.26A2.272 2.272 0 0 1 1 14.74l-.01-9.5Zm8.26 9.52v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v.615c0 .414.336.75.75.75h5.373a.75.75 0 0 0 .627-.74Zm1.5 0a.75.75 0 0 0 .627.74h5.373a.75.75 0 0 0 .75-.75v-.615a.75.75 0 0 0-.75-.75H11.5a.75.75 0 0 0-.75.75v.625Zm6.75-3.63v-.625a.75.75 0 0 0-.75-.75H11.5a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75h5.25a.75.75 0 0 0 .75-.75Zm-8.25 0v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75H8.5a.75.75 0 0 0 .75-.75Z" clipRule="evenodd"/></svg>,
    accent: "#1EC8A4",
  },
  {
    key: "neuralReasoningMap",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z"/></svg>,
    accent: "#818CF8",
  },
  {
    key: "evidenceEntropy",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6Z" clipRule="evenodd"/></svg>,
    accent: "#F59E0B",
  },
  {
    key: "safeInspectionPath",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/></svg>,
    accent: "#34D399",
  },
  {
    key: "industrialKnowledgeBase",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 16.82A7.462 7.462 0 0 1 10 17c-.34 0-.674-.028-1-.083v-2.31l1-1 1 1v2.21ZM10 3a7 7 0 1 0 0 14A7 7 0 0 0 10 3Z"/><path fillRule="evenodd" d="M.25 10a9.75 9.75 0 1 1 19.5 0 9.75 9.75 0 0 1-19.5 0Zm10-7.25a7.25 7.25 0 1 0 0 14.5 7.25 7.25 0 0 0 0-14.5Z" clipRule="evenodd"/></svg>,
    accent: "#C084FC",
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * PHASE 101-R — narrow the route locale to the set the Phase 101 bridge models.
 *
 * `[locale]` is a route segment and therefore caller-controlled. The middleware
 * already restricts it to the active locales, but the bridge is not allowed to
 * assume that: an unexpected value degrades to English rather than indexing an
 * object with an untrusted key.
 */
function bridgeLocaleOf(locale: string): BridgeLocale {
  return (ACTIVE_LOCALES as readonly string[]).includes(locale) ? (locale as BridgeLocale) : "en";
}

export default async function IndustrialBrainPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("industrialBrain");

  // Phase 82: page stays fully public — auth only decides whether the
  // report shows an active "Save as Engineering Case" button or a sign-in CTA.
  const user = await getCurrentUserUnified();
  const canSaveCase = can(user?.role, "authoring");

  /* DASHBOARD ALIGNMENT — the header strip states PROVENANCE, not liveness.
     What stood here was a row of constants ("ONLINE", "ACTIVE", "READY") with
     pulsing dots: presentation literals dressed as telemetry, on a page that
     reads nothing from a plant. These values are MEASURED instead — each one is
     derived from the sealed corpus by `bridgeFingerprint()` at render time, and
     it is the same fingerprint the reference panel below cites. */
  const fingerprint = bridgeFingerprint();
  const provenance = [
    { label: t("reference.provenance.engine"),  value: fingerprint.engineVersion },
    { label: t("reference.provenance.corpus"),  value: fingerprint.corpusChecksum.slice(0, 16) },
    { label: t("reference.provenance.systems"), value: `${fingerprint.systems} / ${fingerprint.nodes} / ${fingerprint.edges}` },
  ];

  return (
    // PHASE 104-I2 — /industrial-brain joins the public estate. This is a public
    // product surface that was rendering with no public header, navigation or
    // footer, so a visitor arriving from search had no route onward. `noAmbient`
    // keeps the page's own gradient/dot-grid treatment authoritative instead of
    // stacking a second ambient layer behind it.
    <PublicPageShell noAmbient>
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #04080F 0%, #060A16 100%)" }}>

      {/* ── Dot grid background ───────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none print:hidden" aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(rgba(30,200,164,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* ── Ambient glow ──────────────────────────────────────────────────
          One, not two. The second glow sat behind the reasoning column and
          competed with the confidence bars it was supposed to sit under. */}
      <div className="fixed top-0 start-1/4 w-96 h-96 rounded-full blur-[160px] pointer-events-none print:hidden" aria-hidden="true"
        style={{ background: "rgba(30,200,164,0.04)" }} />

      <div className="relative z-10">

        {/* ── Compact intelligence header ───────────────────────────────────
            Was a 14-unit-tall hero that pushed the analysis form below the
            first viewport at every desktop width. Identity, advisory boundary
            and provenance now share one band, and the work starts above it. */}
        <header className="border-b border-white/8 print:hidden">
          <div className="mx-auto w-full max-w-[1600px] px-6 lg:px-8 py-7 lg:py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-6">

              <div className="lg:col-span-7 xl:col-span-8 min-w-0">
                <p className="text-[12px] font-mono uppercase tracking-[0.22em] text-cyan-300">
                  {t("hero.eyebrow")}
                </p>
                <h1 className="mt-2.5 font-bold leading-tight"
                  style={{ fontSize: "clamp(1.75rem,3.2vw,2.5rem)", color: "#E8F4FF" }}>
                  {t("hero.title")}
                </h1>
                <p className="mt-2 text-slate-300" style={{ fontSize: "clamp(0.95rem,1.4vw,1.125rem)" }}>
                  {t("hero.subtitle")}
                </p>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-400">
                  {t("hero.tagline")}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <a href="#ib-analyze"
                    className="ds-focus inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 font-mono text-[13px] font-semibold uppercase tracking-wider"
                    style={{
                      background: "linear-gradient(135deg, rgba(30,200,164,0.85) 0%, rgba(96,180,240,0.85) 100%)",
                      color: "#04080F",
                    }}>
                    {t("nav.analyze")}
                  </a>
                  <a href="#ib-reference"
                    className="ds-focus inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/12 px-5 py-2.5 font-mono text-[13px] font-semibold uppercase tracking-wider text-slate-300 transition-colors hover:border-white/25 hover:text-slate-100">
                    {t("nav.reference")}
                  </a>
                </div>

                {/* Marketing routes stay reachable, but subordinate to the work. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                  <Link href="/demo"
                    className="ds-focus inline-flex min-h-11 items-center font-mono text-[13px] text-cyan-300 underline-offset-4 hover:underline">
                    {t("hero.requestDemo")}
                  </Link>
                  <Link href="/articles/discover"
                    className="ds-focus inline-flex min-h-11 items-center font-mono text-[13px] text-slate-400 underline-offset-4 transition-colors hover:text-slate-200 hover:underline">
                    {t("hero.exploreKnowledge")}
                  </Link>
                  {/* R5 — human-facing reciprocal link. Machine-facing distinction
                      (canonical, sitemap, llms.txt) is Phase 105's; this is the
                      piece Phase 105 deliberately left out of scope. */}
                  <CapabilityLink
                    href="/brain"
                    from="industrialBrain"
                    kind="related"
                    to="brain"
                    className="ds-focus inline-flex min-h-11 items-center gap-1.5 font-mono text-[13px] text-cyan-400 hover:underline"
                  >
                    {t("crossLink")}
                    <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
                  </CapabilityLink>
                </div>
              </div>

              {/* ── Measured provenance, never a liveness claim ────────────── */}
              <div className="lg:col-span-5 xl:col-span-4 min-w-0">
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                  <p className="text-[12px] font-mono uppercase tracking-[0.2em] text-slate-400">
                    {t("reference.provenance.heading")}
                  </p>
                  <dl className="mt-3 space-y-2.5">
                    {provenance.map(entry => (
                      <div key={entry.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <dt className="text-[13px] text-slate-400">{entry.label}</dt>
                        <dd className="text-[13px] font-mono tabular-nums text-slate-200 break-all" dir="ltr">
                          {entry.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>

            </div>
          </div>
        </header>

        {/* ── Main workspace ───────────────────────────────────────────────── */}
        <div className="mx-auto w-full max-w-[1600px] px-6 lg:px-8 py-6 lg:py-7 print:p-0 print:max-w-none">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 print:block">

            {/* ── Main column: workspace → reasoning → report ─────────────
                The advisory boundary now opens the workspace card itself, so
                it is read immediately before the input on every viewport
                instead of sitting in a sidebar below six capability cards. */}
            <div className="xl:col-span-8 2xl:col-span-9 min-w-0 print:col-span-1">
              <IndustrialBrainWorkspace locale={locale} isFa={locale === "fa"} canSaveCase={canSaveCase} />
            </div>

            {/* ── Context rail: the capability pipeline and the deploy route ──
                DOM order puts it AFTER the workspace, so the phone layout is
                input-first instead of six capability cards ahead of the form. */}
            <aside className="xl:col-span-4 2xl:col-span-3 min-w-0 print:hidden"
              aria-labelledby="ib-pipeline-heading">
              <div className="xl:sticky xl:top-24 space-y-5">
                <div className="rounded-2xl border border-white/8 p-4"
                  style={{ background: "rgba(7,16,26,0.80)" }}>
                  <p id="ib-pipeline-heading" className="text-[12px] font-mono uppercase tracking-[0.2em] text-slate-400">
                    {t("capabilities.heading")}
                  </p>
                  <ol className="mt-3">
                    {CAPABILITY_PIPELINE.map((cap, i) => (
                      <li key={cap.key} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${cap.accent}18`, border: `1px solid ${cap.accent}30`, color: cap.accent }}>
                            {cap.icon}
                          </span>
                          {i < CAPABILITY_PIPELINE.length - 1 && (
                            <span aria-hidden="true" className="my-1 w-px flex-1 bg-white/10" />
                          )}
                        </div>
                        <div className="min-w-0 pb-4">
                          <p className="text-[13px] font-semibold text-slate-100">
                            {t(`capabilities.items.${cap.key}.title`)}
                          </p>
                          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-400">
                            {t(`capabilities.items.${cap.key}.desc`)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Deploy route */}
                <div className="rounded-2xl border border-cyan-500/20 p-4"
                  style={{ background: "rgba(30,200,164,0.04)" }}>
                  <p className="text-[12px] font-mono uppercase tracking-[0.2em] text-cyan-300">
                    {t("deploy.eyebrow")}
                  </p>
                  <p className="mt-2 text-[15px] font-bold text-slate-100">
                    {t("deploy.title")}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                    {t("deploy.desc")}
                  </p>
                  <Link href="/demo"
                    className="ds-focus mt-2 inline-flex min-h-11 items-center gap-2 font-mono text-[13px] font-semibold text-cyan-300 transition-colors hover:text-cyan-200">
                    {t("deploy.requestDemo")}
                    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 rtl:-scale-x-100" aria-hidden="true">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                </div>
              </div>
            </aside>

          </div>

          {/* ── PHASE 101-R — the sealed reference corpus, actually executed ── */}
          {/* The raw `?case=` value is handed over untouched — including the
              array form a repeated parameter produces. Narrowing it here would
              move a fail-closed decision out of the one module that is tested
              for it (`runtime/case-query.ts`). */}
          <div id="ib-reference" className="scroll-mt-32">
            <ReferenceDiagnosticPanel
              locale={bridgeLocaleOf(locale)}
              caseParam={query[CASE_QUERY_PARAM]}
            />
          </div>
        </div>

      </div>
    </div>
    </PublicPageShell>
  );
}

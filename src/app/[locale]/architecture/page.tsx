import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { PageIntro }        from "@/components/PageIntro";
import { ArchitectureFlow } from "@/components/ArchitectureFlow";
import { buildMetadata }    from "@/lib/seo/metadata";
import { Link }             from "@/i18n/navigation";
import { CAPABILITY_HREF }  from "@/lib/capabilities/registry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/architecture", title: p.architecture.title, description: p.architecture.description, keywords: p.architecture.keywords });
}

// Genuinely implemented today — each links to its own capability page.
// See src/lib/capabilities/registry.ts for the underlying route/evidence map.
const DELIVERED = [
  { key: "twin", capability: "digitalTwin" },
  { key: "predictive", capability: "predictiveMaintenance" },
] as const;

// Real gap: src/lib/industrial/connectors/base.ts is explicitly "FOUNDATION
// ONLY — no real protocol drivers" today, so these four stay genuinely future.
const FUTURE = [
  "opcua",
  "modbus",
  "mqtt",
  "historian",
] as const;

export default async function ArchitecturePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("architecture");

  return (
    <PublicPageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <ArchitectureFlow />

        <p className="mx-auto mt-12 max-w-2xl rounded-lg border border-signalDim bg-surface px-5 py-4 text-center font-body text-sm text-muted">
          {t("note")}
        </p>

        {/* Delivered Platform Capabilities — implemented and running today. */}
        <div className="mt-24">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-2xl font-bold text-ink">
              {t("delivered.title")}
            </h2>
            <span className="rounded-full border border-signalDim bg-signalDim/40 px-2.5 py-0.5 font-mono text-xs text-signal">
              {t("delivered.badge")}
            </span>
          </div>
          <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted">
            {t("delivered.lede")}
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-signalDim bg-line sm:grid-cols-2">
            {DELIVERED.map(({ key, capability }) => (
              <Link
                key={key}
                href={CAPABILITY_HREF[capability]}
                className="group bg-surface p-6 transition-colors hover:bg-[#16202c]"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {t(`delivered.items.${key}.name`)}
                  </h3>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 font-body text-sm leading-relaxed text-muted">
                  {t(`delivered.items.${key}.desc`)}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-signal">
                  {t(`delivered.items.${key}.cta`)}
                  <span aria-hidden="true" className="rtl:-scale-x-100 transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Future Platform Capabilities — protocol drivers only; foundation-only today. */}
        <div className="mt-16">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-2xl font-bold text-ink">
              {t("future.title")}
            </h2>
            <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-xs text-muted">
              {t("future.badge")}
            </span>
          </div>
          <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted">
            {t("future.lede")}
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {FUTURE.map((k) => (
              <div key={k} className="bg-surface p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {t(`future.items.${k}.name`)}
                  </h3>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted/50"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 font-body text-sm leading-relaxed text-muted">
                  {t(`future.items.${k}.desc`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}

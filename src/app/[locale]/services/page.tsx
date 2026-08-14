import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link }      from "@/i18n/navigation";
import { PublicPageShell } from "@/components/public-site";
import { PageIntro } from "@/components/PageIntro";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/services",
    title:       p.services.title,
    description: p.services.description,
    keywords:    p.services.keywords,
  });
}

// slug (route) -> translation key (camelCase in messages)
const SERVICES = [
  { slug: "plc", key: "plc" },
  { slug: "scada-hmi", key: "scadaHmi" },
  { slug: "industrial-ai", key: "industrialAi" },
  { slug: "cybersecurity", key: "cybersecurity" },
  { slug: "knowledge-cloud", key: "knowledgeCloud" },
] as const;

// R2 — the eight capability pages under services.capabilities.<key>. Listed
// separately because their content shape (problem/what-it-does/connects/
// value/automation/cta) is richer than the five items above, not because
// they are a different product family — see CapabilityDetail.tsx.
const CAPABILITIES = [
  { slug: "digital-twin", key: "digitalTwin" },
  { slug: "predictive-maintenance", key: "predictiveMaintenance" },
  { slug: "cmms", key: "cmms" },
  { slug: "multi-site", key: "multiSite" },
  { slug: "edms", key: "edms" },
  { slug: "erp", key: "erp" },
  { slug: "ot-edge", key: "otEdge" },
  { slug: "crm", key: "crm" },
] as const;

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("services");
  const c = await getTranslations("common");

  return (
    <PublicPageShell>
      <PageIntro
        eyebrow={t("eyebrow")}
        title={t("title")}
        strap={t("strap")}
        lede={t("lede")}
      />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {SERVICES.map((s) => (
            <Link
              key={s.slug}
              href={`/services/${s.slug}`}
              className="group flex flex-col bg-surface p-7 transition-colors hover:bg-[#16202c]"
            >
              <h3 className="font-display text-lg font-semibold text-ink">
                {t(`items.${s.key}.name`)}
              </h3>
              <p className="mt-2 flex-1 font-body text-sm leading-relaxed text-muted">
                {t(`items.${s.key}.short`)}
              </p>
              <span className="mt-4 font-mono text-xs text-signal opacity-70 transition-opacity group-hover:opacity-100">
                {c("explore")} →
              </span>
            </Link>
          ))}
        </div>

        {/* R2 — implemented platform capabilities, each with its own public
            explainer, evidence and connection graph (not a duplicate of the
            engineering services above). */}
        <div className="mt-16">
          <h2 className="font-display text-2xl font-bold text-ink">
            {t("capabilityChrome.eyebrow")}
          </h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((cap) => (
              <Link
                key={cap.slug}
                href={`/services/${cap.slug}`}
                className="group flex flex-col bg-surface p-6 transition-colors hover:bg-[#16202c]"
              >
                <h3 className="font-display text-base font-semibold text-ink">
                  {t(`capabilities.${cap.key}.name`)}
                </h3>
                <p className="mt-2 flex-1 font-body text-sm leading-relaxed text-muted">
                  {t(`capabilities.${cap.key}.lede`)}
                </p>
                <span className="mt-4 font-mono text-xs text-signal opacity-70 transition-opacity group-hover:opacity-100">
                  {c("explore")} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
